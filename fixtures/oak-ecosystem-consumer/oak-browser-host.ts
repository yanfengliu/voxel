import {
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { ThreeRenderRuntime } from '../../src/three/index.js';
import {
  OAK_DEFAULT_TIME_SCALE_V1,
  OAK_PARAMETERS_V1,
} from './oak-parameters.js';
import {
  buildOakRenderDeltaV1,
  buildOakRenderFrameV1,
  type OakRenderFrameV1,
} from './oak-render-adapter.js';
import { createOakSimulationV1 } from './oak-simulation.js';
import { fitOakBrowserCameraV1 } from './oak-browser-camera.js';
import { createOakBrowserFrameClockV1 } from './oak-browser-frame-clock.js';
import { createOakBrowserLightingV1 } from './oak-browser-lighting.js';
import {
  createOakBrowserNavigationV1,
  type OakBrowserNavigationHandleV1,
} from './oak-browser-navigation.js';
import {
  bindOakDataButtonsV1,
  displayOakFatal,
  formatOakDiagnostic,
  requiredOakElement,
} from './oak-browser-dom.js';
import type {
  OakBrowserCameraFitV1,
  OakBrowserCameraV1,
  OakBrowserCommandV1,
  OakBrowserEvidenceV1,
  OakBrowserHarnessV1,
  OakBrowserInspectionModeV1,
  OakBrowserViewportV1,
} from './oak-browser-contract.js';
const CASE_STUDY_SEED = 0x51a7_0a4b;
const RAIN_PULSE_LITERS = OAK_PARAMETERS_V1.forcing.ambientWeeklyRainLiters;
interface HostPresentationState {
  inspectionMode: OakBrowserInspectionModeV1;
  rootCutaway: boolean;
  camera: OakBrowserCameraV1;
}
function mountOakBrowserHost(): OakBrowserHarnessV1 {
  const root = requiredOakElement<HTMLElement>('[data-oak-app]');
  const canvas = requiredOakElement<HTMLCanvasElement>('[data-oak-canvas]');
  const hud = requiredOakElement<HTMLElement>('.hud');
  const status = requiredOakElement<HTMLElement>('[data-oak-status]');
  const diagnosticNodes = new Map(
    Array.from(document.querySelectorAll<HTMLElement>('[data-diagnostic]')).map((node) => [
      node.dataset.diagnostic ?? '',
      node,
    ]),
  );
  const controls = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-command]'));
  const viewControls = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-view]'));
  const listeners: (() => void)[] = [];
  const scene = new Scene();
  scene.background = new Color(0x8eabbb);
  const renderer = new WebGLRenderer({ canvas, alpha: false, antialias: true });
  const lighting = createOakBrowserLightingV1(scene, renderer);
  const camera = new PerspectiveCamera(34, 1, 0.005, 25);
  const simulation = createOakSimulationV1({
    seed: CASE_STUDY_SEED,
    timeScale: OAK_DEFAULT_TIME_SCALE_V1,
  });
  const presentation: HostPresentationState = {
    inspectionMode: 'growth',
    rootCutaway: false,
    camera: 'hero',
  };
  let disposed = false;
  let ready = false;
  let renderRevision = 0;
  let animationFrame = 0;
  const frameClock = createOakBrowserFrameClockV1();
  let previousRenderFrame: OakRenderFrameV1 | null = null;
  let fittedView = '';
  let navigation: OakBrowserNavigationHandleV1 | null = null;
  let previousAnimationTimestampMs: number | null = null;
  let viewport: OakBrowserViewportV1 = {
    width: Math.max(1, Math.floor(root.getBoundingClientRect().width)),
    height: Math.max(1, Math.floor(root.getBoundingClientRect().height)),
    pixelRatio: Math.min(1.5, window.devicePixelRatio),
  };
  let cameraFit: OakBrowserCameraFitV1 = {
    focus: 'tree',
    hudReserved: true,
    distanceM: 0,
    hudRightNdc: -1,
    subjectBoundsNdc: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
    subjectClearOfHud: false,
    fittedOrganCount: 0,
    fittedVertexCount: 0,
    rootShaftsNdc: { coarse: null, aggregateFine: null },
  };
  const runtime = new ThreeRenderRuntime({
    renderer,
    rendererOwnership: 'borrowed',
    scene,
    width: viewport.width,
    height: viewport.height,
    pixelRatio: viewport.pixelRatio,
    view: {
      kind: 'borrowed-camera',
      camera,
      projectionOwnership: 'host',
    },
    daylight: false,
  });
  const fitCamera = (preset: OakBrowserCameraV1, force: boolean): void => {
    presentation.camera = preset;
    const snapshot = simulation.snapshot();
    const renderSnapshot = previousRenderFrame?.snapshot;
    if (renderSnapshot === undefined) throw new Error('Cannot fit oak camera before its first render frame.');
    const hudRightPx = getComputedStyle(hud).visibility === 'hidden'
      ? null
      : hud.getBoundingClientRect().right;
    const view = `${snapshot.epoch}:${presentation.rootCutaway}:${preset}:${hudRightPx === null}`;
    const freeCamera = navigation?.isFree() === true;
    cameraFit = fitOakBrowserCameraV1(
      camera,
      preset,
      snapshot,
      renderSnapshot,
      viewport,
      hudRightPx,
      presentation.rootCutaway,
      freeCamera ? 'always' : !force && view === fittedView,
    );
    fittedView = view;
    if (!freeCamera) navigation?.syncFromFittedPreset(preset, cameraFit.distanceM);
  };
  const renderFrame = (frame = frameClock.manualFrame()): void => {
    runtime.frame(frame);
  };

  const requireAccepted = (result: ReturnType<ThreeRenderRuntime['acceptSnapshot']>): void => {
    if (result.status !== 'accepted') {
      throw new Error(
        `Oak render projection was not accepted: ${JSON.stringify(result)}.`,
      );
    }
  };

  const presentSimulation = (frame = frameClock.manualFrame()): void => {
    renderRevision += 1;
    const next = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision,
      ...(previousRenderFrame ? { previousFrame: previousRenderFrame } : {}),
      ...(presentation.rootCutaway
        ? { rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' } as const }
        : {}),
    });
    if (
      previousRenderFrame === null
      || previousRenderFrame.snapshot.descriptor.epoch !== next.snapshot.descriptor.epoch
    ) {
      requireAccepted(runtime.acceptSnapshot(next.snapshot));
    } else {
      const result = runtime.acceptDelta(buildOakRenderDeltaV1(previousRenderFrame, next));
      if (result.status !== 'accepted') {
        throw new Error(
          `Oak render delta was not accepted: ${JSON.stringify(result)}.`,
        );
      }
    }
    previousRenderFrame = next;
    fitCamera(presentation.camera, false);
    renderFrame(frame);
    updateDiagnostics();
  };

  const updateDiagnostics = (): void => {
    const biological = simulation.snapshot();
    const metrics = runtime.metrics();
    const diagnostics = biological.diagnostics;
    const pools = biological.plantMobilePools;
    const residual = biological.ledger.residual;
    const set = (key: string, value: string): void => {
      const node = diagnosticNodes.get(key);
      if (node !== undefined) node.textContent = value;
    };
    set('age', formatOakDiagnostic(biological.elapsedBiologicalSeconds / 86_400, 2, 'days'));
    set('height', formatOakDiagnostic(diagnostics.heightM * 100, 1, 'cm'));
    set('leaf-area', formatOakDiagnostic(diagnostics.leafAreaM2 * 10_000, 1, 'cm²'));
    set(
      'water-potential',
      diagnostics.leafCount === 0
        ? 'not applicable'
        : formatOakDiagnostic(diagnostics.meanLeafWaterPotentialMpa, 3, 'MPa'),
    );
    set('carbon', formatOakDiagnostic(pools.carbonKg * 1_000, 3, 'g'));
    set('nitrogen', formatOakDiagnostic(pools.nitrogenKg * 1_000_000, 2, 'mg'));
    set('phosphorus', formatOakDiagnostic(pools.phosphorusKg * 1_000_000, 2, 'mg'));
    set('water-residual', residual.waterLiters.toExponential(2));
    set('carbon-residual', residual.carbonKg.toExponential(2));
    set('nitrogen-residual', residual.nitrogenKg.toExponential(2));
    set('phosphorus-residual', residual.phosphorusKg.toExponential(2));
    set('revision', String(metrics.presentedRevision ?? 'pending'));
    set(
      'resources',
      `${String(metrics.rendererGeometries)} geo / ${String(metrics.rendererTextures)} tex`,
    );
  };

  const syncControls = (): void => {
    const state = simulation.snapshot();
    for (const control of controls) {
      const command = control.dataset.command as OakBrowserCommandV1 | undefined;
      const pressed = command === 'toggle-pause'
        ? state.paused
        : command === 'growth-mode'
          ? presentation.inspectionMode === 'growth'
          : command === 'wind-mode'
            ? presentation.inspectionMode === 'wind'
            : command === 'root-cutaway'
              ? presentation.rootCutaway
              : command === 'low-water'
                ? state.environmentRegime.water === 'low'
                : command === 'low-n'
                  ? state.environmentRegime.nitrogen === 'low'
                  : command === 'low-p'
                    ? state.environmentRegime.phosphorus === 'low'
                    : false;
      if (control.hasAttribute('aria-pressed')) {
        control.setAttribute('aria-pressed', String(pressed));
      }
      if (command === 'toggle-pause') control.textContent = state.paused ? 'Resume' : 'Pause';
    }
    for (const control of viewControls) {
      control.setAttribute('aria-pressed', String(
        navigation?.isFree() !== true && control.dataset.view === presentation.camera,
      ));
    }
  };

  const environmentToggle = (
    resource: 'water' | 'nitrogen' | 'phosphorus',
  ): void => {
    const current = simulation.snapshot().environmentRegime;
    simulation.applyCommand({
      kind: 'set-environment-regime',
      water: resource === 'water'
        ? current.water === 'low' ? 'ambient' : 'low'
        : current.water,
      nitrogen: resource === 'nitrogen'
        ? current.nitrogen === 'low' ? 'ambient' : 'low'
        : current.nitrogen,
      phosphorus: resource === 'phosphorus'
        ? current.phosphorus === 'low' ? 'ambient' : 'low'
        : current.phosphorus,
    });
  };

  const setStatus = (message: string): void => { status.textContent = message; };

  const evidence = (): OakBrowserEvidenceV1 => {
    if (!previousRenderFrame) {
      throw new Error('Oak browser evidence requires an accepted render frame.');
    }
    if (navigation === null) throw new Error('Oak browser evidence requires camera navigation.');
    return {
      ready,
      disposed,
      inspectionMode: presentation.inspectionMode,
      rootCutaway: presentation.rootCutaway,
      camera: presentation.camera,
      navigation: navigation.evidence(),
      cameraFit,
      viewport: { ...viewport },
      hostLighting: lighting.evidence(),
      simulation: simulation.snapshot(),
      render: previousRenderFrame.metrics,
      runtime: runtime.metrics(),
    };
  };

  const issueCommand = (command: OakBrowserCommandV1): OakBrowserEvidenceV1 => {
    if (disposed) throw new Error(`Cannot issue oak command '${command}': host is disposed.`);
    const state = simulation.snapshot();
    if (command === 'toggle-pause') {
      simulation.setPaused(!state.paused);
      frameClock.discardAnimationElapsed();
      setStatus(state.paused ? 'Simulation resumed.' : 'Simulation paused.');
    } else if (command === 'growth-mode') {
      presentation.inspectionMode = 'growth';
      simulation.setTimeScale(OAK_DEFAULT_TIME_SCALE_V1);
      simulation.applyCommand({ kind: 'set-wind-regime', regime: 'still' });
      setStatus('Season and growth inspection: one biological day per real second.');
    } else if (command === 'wind-mode') {
      presentation.inspectionMode = 'wind';
      simulation.setTimeScale(1);
      simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
      setStatus('Wind inspection: authoritative organ poses follow a bounded 3–6 m/s breeze.');
    } else if (command === 'root-cutaway') {
      presentation.rootCutaway = !presentation.rootCutaway;
      navigation?.beginPreset(presentation.camera);
      setStatus(presentation.rootCutaway
        ? 'Root cutaway: dark coarse path; pale aggregate cohort width is a visibility glyph.'
        : 'Root cutaway disabled.');
    } else if (command === 'rain') {
      simulation.applyCommand({ kind: 'rainfall-pulse', liters: RAIN_PULSE_LITERS });
      setStatus(`Queued a ${RAIN_PULSE_LITERS.toFixed(2)} L rain pulse.`);
    } else if (command === 'low-water') {
      environmentToggle('water');
      setStatus('Water boundary regime changed; stored water was not deleted.');
    } else if (command === 'low-n') {
      environmentToggle('nitrogen');
      setStatus('Nitrogen accessibility regime changed; stored nitrogen was not deleted.');
    } else if (command === 'low-p') {
      environmentToggle('phosphorus');
      setStatus('Phosphorus accessibility regime changed; stored phosphorus was not deleted.');
    } else {
      const paused = state.paused;
      simulation.reset({
        seed: CASE_STUDY_SEED,
        paused,
        timeScale: OAK_DEFAULT_TIME_SCALE_V1,
        regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
      });
      presentation.inspectionMode = 'growth';
      presentation.rootCutaway = false;
      presentation.camera = 'hero';
      navigation?.beginPreset('hero');
      setStatus('Experiment reset to the identical seed and ambient boundary regime.');
    }
    presentSimulation();
    syncControls();
    return evidence();
  };

  const chooseCamera = (preset: OakBrowserCameraV1): OakBrowserEvidenceV1 => {
    if (disposed) throw new Error(`Cannot choose oak camera '${preset}': host is disposed.`);
    navigation?.beginPreset(preset);
    fitCamera(preset, true);
    renderFrame();
    updateDiagnostics();
    syncControls();
    return evidence();
  };

  const advanceHostTicks = (count: number): OakBrowserEvidenceV1 => {
    if (disposed) throw new Error('Cannot advance oak ticks: host is disposed.');
    simulation.advanceHostTicks(count);
    presentSimulation();
    syncControls();
    return evidence();
  };

  const advanceBiologicalTicks = (count: number): OakBrowserEvidenceV1 => {
    if (disposed) throw new Error('Cannot run an oak experiment: host is disposed.');
    const wasPaused = simulation.snapshot().paused;
    if (wasPaused) simulation.setPaused(false);
    simulation.advanceHostTicks(count);
    if (wasPaused) simulation.setPaused(true);
    presentSimulation();
    syncControls();
    return evidence();
  };

  navigation = createOakBrowserNavigationV1({
    root,
    surface: canvas,
    camera,
    viewport: () => viewport,
    onViewChanged: () => {
      fitCamera(presentation.camera, false);
      renderFrame();
      updateDiagnostics();
      syncControls();
    },
    onRefit: (preset) => { chooseCamera(preset); },
  });

  const resize = (): void => {
    if (disposed) return;
    const bounds = root.getBoundingClientRect();
    const next = {
      width: Math.max(1, Math.floor(bounds.width)),
      height: Math.max(1, Math.floor(bounds.height)),
      pixelRatio: Math.min(1.5, window.devicePixelRatio),
    };
    if (
      next.width === viewport.width
      && next.height === viewport.height
      && next.pixelRatio === viewport.pixelRatio
    ) return;
    viewport = next;
    runtime.resize(viewport.width, viewport.height, viewport.pixelRatio);
    if (navigation?.isFree() === true) {
      navigation.apply();
      fitCamera(presentation.camera, false);
    } else fitCamera(presentation.camera, true);
    renderFrame();
    updateDiagnostics();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    navigation?.dispose();
    for (const remove of listeners.splice(0)) remove();
    window.removeEventListener('beforeunload', dispose);
    runtime.dispose();
    lighting.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  const harness: OakBrowserHarnessV1 = {
    command: issueCommand,
    setCamera: chooseCamera,
    advanceHostTicks,
    advanceBiologicalTicks,
    evidence,
    capture: () => runtime.capture(),
    dispose,
  };

  const failControl = (error: unknown): void => {
    dispose();
    displayOakFatal(error);
  };
  listeners.push(bindOakDataButtonsV1<OakBrowserCommandV1>(
    controls,
    'command',
    (command) => { issueCommand(command); },
    failControl,
  ));
  listeners.push(bindOakDataButtonsV1<OakBrowserCameraV1>(
    viewControls,
    'view',
    (preset) => { chooseCamera(preset); },
    failControl,
  ));

  const animate = (timestampMs: number): void => {
    if (disposed) return;
    try {
      const navigationElapsedMs = previousAnimationTimestampMs === null
        ? 0
        : Math.min(50, Math.max(0, timestampMs - previousAnimationTimestampMs));
      previousAnimationTimestampMs = timestampMs;
      const navigationMoved = navigation?.advanceFrame(navigationElapsedMs) === true;
      const sample = frameClock.animationFrame(timestampMs, !simulation.snapshot().paused);
      if (sample.hostTicks > 0) {
        simulation.advanceHostTicks(sample.hostTicks);
        presentSimulation(sample.frame);
      } else if (navigationMoved) {
        fitCamera(presentation.camera, false);
        renderFrame(sample.frame);
        updateDiagnostics();
      } else renderFrame(sample.frame);
      if (navigationMoved) syncControls();
      animationFrame = requestAnimationFrame(animate);
    } catch (error) {
      dispose();
      displayOakFatal(error);
      queueMicrotask(() => { throw error; });
    }
  };

  window.addEventListener('beforeunload', dispose);
  try {
    presentSimulation();
    ready = true;
    syncControls();
    setStatus('Live growth inspection running from a deterministic acorn state.');
    navigation.attach();
    animationFrame = requestAnimationFrame(animate);
    return harness;
  } catch (error) {
    dispose();
    throw error;
  }
}

try {
  window.oakEcosystem = mountOakBrowserHost();
} catch (error) {
  displayOakFatal(error);
  throw error;
}
