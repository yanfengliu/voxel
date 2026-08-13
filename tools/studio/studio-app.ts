/* eslint-disable max-lines -- This composition root intentionally owns the paired render sessions, camera, rollback, transport, and scene-to-model lifecycle; the scene registry and menu remain extracted modules. */
import { OrthographicCamera, PerspectiveCamera, Raycaster, Vector2 } from 'three';

import type { StudioCatalogV1 } from './catalog.js';
import { createConstructionPanel, type ConstructionPanelV1 } from './construction.js';
import {
  connectModelStudioShell,
  connectModelStudioShellV2,
  renderModelStudioShell,
  renderModelStudioShellV2,
  type ModelStudioShellHandleV1,
  type ModelStudioShellHandleV2,
  type ModelStudioShellOptionsV2,
  type ModelStudioShellProfileV2,
  type ModelStudioTabId,
} from './shared-ui/index.js';
import { describeMotion } from './describe.js';
import { createStudioHarness, type VoxelStudioHarnessV1 } from './harness.js';
import { createStudioKeyboard } from './studio-keyboard.js';
import {
  createStudioPresentationLockV1,
  type StudioPresentationLockV1,
} from './studio-presentation-lock.js';
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { NoteStore } from './notes.js';
import {
  applyOrbit,
  AUTO_FIT_MAX_VIEW_HEIGHT,
  clampOrbit,
  DEFAULT_ORBIT,
  describeOrbit,
  dragOrbit,
  fitViewHeight,
  KEYBOARD_PAN_VIEW_HEIGHTS_PER_SECOND,
  moveOrbitCenter,
  panOrbit,
  zoomOrbit,
  type OrbitCenterV1,
  type OrbitStateV1,
} from './orbit.js';
import { createPhysicalOverlayView } from './physical-overlay-view.js';
import { StudioPlayer } from './player.js';
import { referenceGridSegmentsV1, sceneReferenceGridSegmentsV1 } from './reference-grid.js';
import { sceneResolvedContentHashesV1 } from './scene-annotation-content.js';
import { renderSceneAnnotationMarkersV1 } from './scene-annotation-marker.js';
import {
  scenePresentationFingerprintV1,
  sceneViewPinMatchesV1,
  sceneViewPinStaleReasonV1,
  type SceneAnnotationViewContextV1,
} from './scene-annotation-context.js';
import { createStudioSceneAnnotationGestureV1 } from './studio-scene-annotation-gesture.js';
import {
  SceneAnnotationStore,
  type SceneAnnotationsV1,
  type SceneViewPinV1,
} from './scene-annotations.js';
import { sceneSurfaceConflictsV1 } from './scene-conflict-report.js';
import type { ScenePoseReplayEventV1, ScenePoseReplayV1OrV2 } from './scene-pose-replay.js';
import { VOXEL_SCENE_SCHEMA_V4, type SceneV1 } from './scene.js';
import { sceneMotionWindowMsV1 } from './scene-motion.js';
import { sceneOpeningViewV1 } from './scene-opening-view.js';
import {
  clampSceneViewV1,
  safeDenseSceneOpeningViewV1,
} from './scene-orbit.js';
import { createSceneWorkspace } from './scene-workspace.js';
import {
  createModelLabelWorkspace,
  type ModelLabelInfoV1,
} from './model-label-workspace.js';
import { createSceneEditor } from './scene-editor.js';
import {
  boxEdgesV1, groundHitV1, pickPlacementV1, placementWorldBoxesV1,
  type PlacementBoxV1, type RayV1,
} from './scene-pick.js';
import { SceneSession, type ScenePoseReplayStatusV1 } from './scene-session.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';
import { LIVE_PHYSICS_PROFILES_V1 } from './live-physics-profiles.js';
import { physicsPlaygroundProfileForV1 } from './physics-playground-profiles.js';
import {
  createStudioPlaygroundPanel,
  type StudioPlaygroundPanelV1,
} from './studio-playground-panel.js';
import { StudioLiveInteract } from './studio-live-interact.js';
import { createWireframeView } from './wireframe-view.js';
import { cellSubsetOutlineSegmentsV1, modelWireframeSegmentsV1 } from './wireframe.js';
import { StudioSession } from './session.js';
import {
  browserViewPrefsStore,
  readViewPrefs,
  writeViewPrefs,
  type ViewPrefsStoreV1,
} from './view-prefs.js';
import type { StudioEditStateV1 } from './studio-app-context.js';
import { element, openingModel } from './studio-app-helpers.js';
import { createStudioEditorPanel, type StudioEditorPanelV1 } from './studio-editor.js';
import { createStudioLibraryDetails } from './studio-library-details.js';
import { createStudioLightingControl, sceneLightingStageHint,
  sceneLightingStatusSuffix } from './studio-lighting-control.js';
import { createStudioMotionPanel, type StudioMotionPanelV1 } from './studio-motion.js';
import { createStudioNotesPanel, type StudioNotesPanelV1 } from './studio-notes.js';
import { setupPanelResize } from './studio-panel-resize.js';
import { createStudioPlayerBar, type StudioPlayerBarV1 } from './studio-player.js';
import {
  buildSceneRequest,
  sendRequest as saveStudioRequest,
  type SendResult,
  type StudioSceneCaptureV1,
} from './requests.js';
import { createStudioSceneAnimationControl, sceneAnimationStageHint, sceneAnimationStatusSuffix } from './studio-scene-animation-control.js';
import { StudioSceneAnimationTransport } from './studio-scene-animation-transport.js';
import {
  createStudioSceneNotesPanel,
  type StudioSceneNotesPanelV1,
} from './studio-scene-notes.js';
import { createStudioShelf, type StudioShelfV1 } from './studio-shelf.js';
import { createStudioShelfOrderWorkspace } from './studio-shelf-order.js';

/**
 * The studio as an app: shelf on the left, the stage in the middle, one
 * inspector on the right, the player docked underneath. Its resting state is
 * watching; drag the picture to walk around the model.
 *
 * Every control calls the harness rather than reaching into the session, so
 * anything a person can do here, the agent can do and check. A control with no
 * harness equivalent would be a claim about the model only a human could
 * verify, which is the thing this studio exists to remove.
 *
 * This module is the game-neutral half. It knows that a shelf has sections and
 * that sections contain models; it never knows what a model *is* to the game
 * that made it. Every game mounts this with its own catalog -- see
 * `docs/guides/model-studio.md` -- and the engine's own shelf in `main.ts` is
 * simply the first caller, with no privileges the games lack.
 *
 * `mountStudio` is the composition root and stays so on purpose: it owns the
 * render session, the camera, the frame loop, and the one rollback that
 * disposes them if the mount fails. The inspector's five panels are their own
 * modules -- player, editor, motion, shelf, notes -- each building its DOM and
 * wiring its own controls through the harness; this file holds the stage, the
 * things that read the live camera every frame, and the assembly that binds
 * the panels together.
 */

declare global {
  interface Window {
    voxelStudio?: VoxelStudioHarnessV1;
  }
}

export interface StudioMountOptionsV1 {
  /**
   * The shelf: which models this studio offers, in the sections the game
   * names and orders. The studio only knows that sections contain models.
   */
  readonly catalog: StudioCatalogV1;
  /**
   * Where to mount. Defaults to `#studio`, which is what the shipped page
   * provides; a game embedding the studio in its own page passes its element.
   */
  readonly root?: HTMLElement;
  /**
   * Which model to open first. Defaults to the first model on the shelf, so
   * a studio never opens on an empty stage.
   */
  readonly openModelId?: string;
  /**
   * Publishes the harness on `window.voxelStudio` so an agent driving the
   * real page can reach it. Defaults to true; a game mounting two studios in
   * one page turns it off for the second.
   */
  readonly publishHarness?: boolean;
  /**
   * Opts this grid-renderer adapter into the configurable V2 inspector shell.
   * Omit it to preserve the exact five-tab V1 workbench.
   */
  readonly shellProfileV2?: ModelStudioShellProfileV2;
  /**
   * Where the stage's remembered presentation preferences are kept. Defaults to the browser's
   * `localStorage`, guarded so a page that forbids it still mounts; a test or a
   * game embedding two studios can pass its own store to keep them separate.
   */
  readonly viewStore?: ViewPrefsStoreV1;
  /**
   * Private scene-review storage. Defaults to guarded browser localStorage;
   * tests and multiple embedded studios may inject an isolated store.
   */
  readonly sceneAnnotationStore?: SceneAnnotationStore;
}

export interface StudioHandleV1 {
  /** Everything the buttons can do, for an agent or a test to do instead. */
  readonly harness: VoxelStudioHarnessV1;
  /** Releases the GPU runtime, listeners, and frame loop. Idempotent. */
  dispose(): void;
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 440;
let stageHintSequence = 0;

function validatedOrbitCenterV1(value: OrbitCenterV1): OrbitCenterV1 {
  const candidate: unknown = value;
  if (Array.isArray(candidate) && candidate.length === 3) {
    const x: unknown = candidate[0];
    const y: unknown = candidate[1];
    const z: unknown = candidate[2];
    if (typeof x === 'number' && Number.isFinite(x)
      && typeof y === 'number' && Number.isFinite(y)
      && typeof z === 'number' && Number.isFinite(z)) {
      return [x, y, z];
    }
  }
  const received = Array.isArray(candidate)
    ? `[${candidate.map((entry) => String(entry)).join(', ')}]`
    : String(candidate);
  throw new Error(
    'The Studio view center must be exactly three finite world coordinates [x, y, z]; '
    + `received ${received}.`,
  );
}
// Replaced by the stage's real size once mounted; these only seed the first frame.
const SWEEP_SAMPLES = 24;
const DRAG_THRESHOLD_PIXELS = 4;
// This avoids flashing the editor during ordinary double-clicks. Correctness
// does not depend on the host's configurable double-click interval: dblclick
// also unwinds a matching moment editor that already opened.
const MODEL_NOTE_CLICK_DELAY_MS = 550;
/**
 * Keeps the scene WebGL renderer reusable after deleting the scene it showed.
 * Three owns several context fallback textures for the renderer's lifetime, so
 * retiring into an empty scene avoids allocating another set on every reopen.
 */
const RETIRED_SCENE: SceneV1 = Object.freeze({
  schemaVersion: 'studio.scene/1',
  id: 'studio:scene:retired-renderer',
  label: 'Retired scene renderer',
  placements: Object.freeze([]),
});

// The voxel-size slider maps logarithmically, so a nudge near one unit is a
// small change and the ends still reach a fine petal and a coarse wall — with
// one unit sitting exactly at the middle.
const SIZE_SLIDER_MIN = 1 / 32;
const SIZE_SLIDER_MAX = 32;
const SIZE_SLIDER_STEPS = 1000;
function sliderToVoxelSize(value: number): number {
  return SIZE_SLIDER_MIN * Math.pow(SIZE_SLIDER_MAX / SIZE_SLIDER_MIN, value / SIZE_SLIDER_STEPS);
}
function voxelSizeToSlider(size: number): number {
  const clamped = Math.min(SIZE_SLIDER_MAX, Math.max(SIZE_SLIDER_MIN, size));
  return Math.round(
    SIZE_SLIDER_STEPS * Math.log(clamped / SIZE_SLIDER_MIN) / Math.log(SIZE_SLIDER_MAX / SIZE_SLIDER_MIN),
  );
}
/** The voxel size and the model's world dimensions, in words for the readout. */
function describeVoxelSize(voxelSize: number, size: readonly [number, number, number]): string {
  const num = (value: number): string => {
    if (value >= 100) return value.toFixed(0);
    if (value >= 10) return value.toFixed(1);
    if (value >= 1) return value.toFixed(2);
    return value.toFixed(3);
  };
  const [sx, sy, sz] = size;
  return `${num(voxelSize)} per voxel · ${num(sx * voxelSize)} × ${num(sy * voxelSize)} × ${num(sz * voxelSize)} units`;
}

/**
 * True when something other than the authored placement decides where a
 * body sits, which is what makes placement editing read-only. Covers both
 * a recorded consumer replay and a live solver's opening poses.
 */
function isSelfPosedScene(scene: SceneV1 | null): boolean {
  if (scene === null) return false;
  if (scene.schemaVersion === VOXEL_SCENE_SCHEMA_V4) return true;
  return Object.keys(LIVE_PHYSICS_PROFILES_V1[scene.id]?.poses ?? {}).length > 0;
}

/**
 * True for a scene the solver runs in this browser.
 *
 * Deliberately a different question from `isSelfPosedScene`, which asks
 * whether the authored placements still mean anything and so decides
 * read-only. A scene can be solved live and still be editable — the mill is:
 * its profile overrides no opening pose, so dragging a model in Adjust and
 * rebuilding the world is a coherent thing to do. Conflating the two left the
 * mill's readout saying nothing at all about being solved, which is the one
 * thing about it worth saying.
 */
function isLiveSolvedScene(scene: SceneV1 | null): boolean {
  return scene !== null
    && scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V4
    && LIVE_PHYSICS_PROFILES_V1[scene.id] !== undefined;
}

/**
 * True only for a scene that plays back a recording. Self-posed is not
 * the same thing: a live-physics scene computes its opening poses and
 * then solves every frame in the browser, and labelling that a replay
 * says the opposite of what it does. The distinction is the whole point
 * of the scenes-simulate-live rule, so the status chip must not blur it.
 */
function isRecordedReplayScene(scene: SceneV1 | null): boolean {
  return scene !== null && scene.schemaVersion === VOXEL_SCENE_SCHEMA_V4;
}

function replayEventStatusSuffix(event: ScenePoseReplayEventV1): string {
  const when = `${(event.timeMs / 1_000).toFixed(2)} s`;
  switch (event.type) {
    case 'assembled':
      return `assembled ${when} · ${String(event.memberPlacementIds.length)} members`;
    case 'released':
      return `released ${when} · ${String(event.remainingMemberPlacementIds.length)} remain`;
    case 'contact':
      return `contact ${when} · impulse ${event.normalImpulse.toFixed(2)}`;
    case 'collected':
      return `collected ${when} · ${event.collectorPlacementId}`;
  }
}

function replayEventEvidence(event: ScenePoseReplayEventV1): string {
  const common = `latest event ${event.id}; primary ${event.placementId}; `
    + `time ${String(event.timeMs)} ms`;
  switch (event.type) {
    case 'assembled':
      return `${common}; assembly ${event.assemblyId}; members `
        + `[${event.memberPlacementIds.join(', ')}]`;
    case 'released':
      return `${common}; assembly ${event.assemblyId}; remaining members `
        + `[${event.remainingMemberPlacementIds.join(', ')}]`;
    case 'contact':
      return `${common}; other ${event.otherPlacementId}; `
        + `point [${event.point.join(', ')}]; normal [${event.normal.join(', ')}]; `
        + `normal impulse ${String(event.normalImpulse)}`;
    case 'collected':
      return `${common}; collector ${event.collectorPlacementId}`;
  }
}

function replaySceneEditError(scene: SceneV1, action: string): Error {
  // A live-solved scene is not a recording, and telling someone to
  // 'regenerate the replay' for one sends them after a file that does
  // not exist. Both kinds are read-only for the same reason — something
  // other than the authored placement decides where a body sits — but
  // that reason has to be named correctly.
  if (scene.schemaVersion !== VOXEL_SCENE_SCHEMA_V4) {
    return new Error(
      `Scene '${scene.id}' poses its own models from a live physics `
      + `profile and is read-only in Studio; ${action} would diverge `
      + 'authored scene data or selection from the poses the solver is '
      + 'producing. Use Interact to move things by hand, reset the '
      + 'station to return them, or change the profile in the source that '
      + 'declares it.',
    );
  }
  return new Error(
    `Scene '${scene.id}' is driven by consumer pose replay `
    + `'${scene.poseReplay.id}' and is read-only in Studio; `
    + `${action} would diverge authored scene data or selection from the recorded poses. `
    + 'Play or scrub the replay to inspect it, delete the scene from its library menu if it is no longer wanted, '
    + 'or update the consumer simulation or trace source and regenerate the replay to change the assembly.',
  );
}

export function mountStudio(options: StudioMountOptionsV1): StudioHandleV1 {
  const root = options.root ?? document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');
  const catalog = options.catalog;
  // Catalog models are consumer-owned readonly input. A rename in Studio is a
  // mount-local display alias keyed by the model's stable id, so recipes and
  // scenes keep resolving the same data and another mount sees the catalog name.
  const modelLabelWorkspace = createModelLabelWorkspace(catalog.sections);
  // Catalog scenes are consumer-owned readonly input. The Studio edits an
  // isolated working copy so opening, editing, renaming, deleting, and reopening
  // all read one mount-local source of truth without mutating the game.
  const sceneWorkspace = createSceneWorkspace(catalog.scenes ?? []);
  // Shelf order is another mount-local overlay: only stable ID lists move, so
  // consumer catalog objects and every recipe/scene reference remain untouched.
  const shelfOrderWorkspace = createStudioShelfOrderWorkspace();
  let rebuildShelf = (): void => { /* the shelf is connected after the harness */ };
  // The look this studio last wore, so the next model opens the way the last one
  // was left rather than resetting to the resting look. Read once here; written
  // back whenever a view control changes.
  const viewStore = options.viewStore ?? browserViewPrefsStore();
  const view = readViewPrefs(viewStore);
  const sceneAnnotationStore = options.sceneAnnotationStore ?? new SceneAnnotationStore();
  const persistView = (): void => {
    writeViewPrefs(viewStore, {
      depth: depthOn, edges: session.edges, lit: session.lit, sceneAnimation: sceneTransport.enabled, wireframe: session.wireframe, grid: gridOn,
    });
  };
  const configuredCoreTabs = options.shellProfileV2?.coreTabs;
  const supportsCoreTab = (tab: ModelStudioTabId): boolean =>
    configuredCoreTabs === undefined || configuredCoreTabs.includes(tab);
  const supportsEdit = supportsCoreTab('edit');
  const supportsNotes = supportsCoreTab('notes');
  // Rendering the V2 shell is pure string work that runs the profile's full
  // validation, so a bad descriptor is refused here — before the WebGL
  // session, the published harness, or any listener exists to leak.
  const shellMarkupV2 = options.shellProfileV2
    ? renderModelStudioShellV2({
      ...options.shellProfileV2,
      panels: { examine: '', build: '', edit: '', motion: '', notes: '' },
    })
    : null;

  // ---- stage ----
  const canvas = element('canvas');
  canvas.width = VIEW_WIDTH;
  canvas.height = VIEW_HEIGHT;
  const marks = element('div', 'marks');
  // Numbered pins are duplicated by the fully labelled Notes queue. Keep the
  // visual overlay out of the accessibility tree so the stage does not announce
  // an unexplained bare number.
  marks.setAttribute('aria-hidden', 'true');
  // The physical outlines live between the picture and the note rings: they
  // annotate the model, and a pinned note still reads over everything.
  const physicalView = createPhysicalOverlayView();
  let physicalOn = false;
  // The playground's debug layer: the selected live body's collider boxes,
  // contact whiskers, and velocity, drawn in world space over the scene.
  const playgroundView = createPhysicalOverlayView();
  // The wireframe stands in for the solid model when the surface is hidden, so
  // it sits just over the canvas, under the collider outlines and note rings.
  const wireframeView = createWireframeView();
  // The part highlight is an outline in its own colour, over everything but the
  // note rings, so a clicked part reads clearly against whatever look is on.
  const highlightView = createWireframeView('highlight-marks');
  let highlightedPartIndex: number | null = null;
  // The reference grid sits under everything — a one-unit ground plane the
  // model stands on, drawn straight in world space rather than model space.
  const gridView = createWireframeView('grid-marks');
  let gridOn = view.grid;
  // A scene draws to its own canvas so it and a model never fight over one
  // WebGL context; exactly one of the two is shown at a time.
  const sceneCanvas = element('canvas', 'scene-canvas');
  sceneCanvas.width = VIEW_WIDTH;
  sceneCanvas.height = VIEW_HEIGHT;
  sceneCanvas.style.display = 'none';
  const canvasWrap = element('div', 'canvas-wrap');
  // Order is paint order, so the ground grid goes first (behind the canvases,
  // occluded by the solid model) while the wireframe, collider, part-highlight,
  // and note layers go after it (over the model, where they belong).
  canvasWrap.append(
    gridView.element, canvas, sceneCanvas, wireframeView.element, physicalView.element, playgroundView.element, highlightView.element, marks,
  );
  const viewChip = element('span', 'viewchip');
  viewChip.title = "Sides are the model's own, like a person facing you: "
    + 'their left appears on your right.';
  const stageHint = element('span', 'stagehint');
  // The hint teaches only what this profile offers: without Notes the click
  // is correctly ignored, so the hint must not promise it.
  const modelStageHint = supportsNotes
    ? 'drag to turn · right-drag or WASD to move view · scroll to zoom · double-click to re-centre · click to pin a note'
    : 'drag to turn · right-drag or WASD to move view · scroll to zoom · double-click to re-centre';
  const sceneStageHint = 'click a model to select · drag it to move · '
    + 'middle-drag to turn · right-drag or WASD to move view · scroll to zoom';
  const replaySceneStageHint = 'drag to turn · right-drag or WASD to move view · scroll to zoom · '
    + 'this scene poses its own models, so they cannot be moved by hand';
  const interactStageHint = 'drag a moving part to pull it, release to let go · '
    + 'nothing is recorded · middle-drag to turn · right-drag or WASD to move view · scroll to zoom';
  const interactSpawnStageHint =
    `click under the rail to drop a ball · ${interactStageHint}`;
  const sceneAnnotationStageHint = 'annotation armed · click once to capture this view and phase · '
    + 'middle-drag to turn · right-drag or WASD to move view · Escape to cancel';
  const sceneAnnotationDraftStageHint = 'annotation captured · + marks the exact spot · '
    + 'queue or cancel the draft before changing the presentation';
  stageHint.textContent = modelStageHint;
  stageHint.id = `voxel-studio-stage-hint-${String(++stageHintSequence)}`;
  canvasWrap.tabIndex = 0;
  canvasWrap.setAttribute('role', 'region');
  canvasWrap.setAttribute('aria-keyshortcuts', 'W A S D');
  canvasWrap.setAttribute('aria-describedby', stageHint.id);
  canvasWrap.setAttribute(
    'aria-label',
    '3D Studio stage',
  );
  const syncStageKeyboardShortcuts = (
    movementAvailable: boolean,
    scenePlaybackAvailable = false,
  ): void => {
    const shortcuts = [
      ...(movementAvailable ? ['W', 'A', 'S', 'D'] : []),
      ...(scenePlaybackAvailable ? ['Space'] : []),
    ];
    if (shortcuts.length > 0) canvasWrap.setAttribute('aria-keyshortcuts', shortcuts.join(' '));
    else canvasWrap.removeAttribute('aria-keyshortcuts');
  };
  // Exactly one of the two looks is ever true, so the control is one switch
  // with two sides rather than two buttons that could both look pressed: the
  // knob sits on the side that is on, and clicking slides it to the other.
  const lookSwitch = element('button', 'switch');
  lookSwitch.setAttribute('role', 'switch');
  lookSwitch.title = 'Study edges draw dark lines where surfaces meet; the game look is exactly what players see.';
  const lookThumb = element('span', 'thumb');
  const edgesSide = element('span', 'side');
  edgesSide.textContent = 'study edges';
  const gameSide = element('span', 'side');
  gameSide.textContent = 'game look';
  lookSwitch.append(lookThumb, edgesSide, gameSide);
  const depthToggle = element('button', 'toggle');
  depthToggle.textContent = 'real depth';
  depthToggle.title = 'Nearer really is bigger. The flat view can read backwards — '
    + 'equal sizes at every distance look like they grow away from you.';
  const lightingControl = createStudioLightingControl();
  const lightToggle = lightingControl.element;
  const sceneAnimationControl = createStudioSceneAnimationControl();
  const sceneAnimationToggle = sceneAnimationControl.element;
  sceneAnimationToggle.hidden = true;
  const wireframeToggle = element('button', 'toggle');
  wireframeToggle.textContent = 'wireframe';
  wireframeToggle.title = 'Hides the solid faces and draws the model as lines, so you '
    + 'can see through it to how it is put together, front and back at once.';
  const gridToggle = element('button', 'toggle');
  gridToggle.textContent = 'grid';
  gridToggle.title = 'A one-unit ground grid the model stands on, so its voxel size '
    + 'reads as a real scale — how many squares it covers is how big it is.';
  const physToggle = element('button', 'toggle');
  physToggle.textContent = 'colliders';
  physToggle.title = 'Outlines the shapes this model blocks and its attachment '
    + 'points, from its saved physical data. The picture itself is unchanged.';
  // Shown only while a scene is open: dragging a model then lands its footprint
  // on whole world units, so pieces line up instead of drifting off-grid. (The
  // lattice is the one-unit voxel cell, finer than the 4-unit floor ruler.)
  const snapToggle = element('button', 'toggle');
  snapToggle.textContent = 'snap to grid';
  snapToggle.title = 'While on, dragging a model in a scene lands its footprint on '
    + 'whole world units, so models line up cleanly edge to edge. Off drags it freely.';
  snapToggle.hidden = true;
  const toggles = element('div', 'toggles');
  // Adjust/Interact appear only for scenes with a live-physics profile. The
  // controller owns the solver session and its frame loop; the app only routes
  // pointer rays and applies the poses it publishes.
  let playgroundPanel: StudioPlaygroundPanelV1 | null = null;
  const liveInteract = new StudioLiveInteract({
    acceptPoses: (poses) => {
      sceneSession?.acceptLivePosesV1(poses);
    },
    // Playground scenes get their profile from the panel's current ramp
    // angle; other scenes fall through to the static registry.
    resolveProfile: (sceneId) =>
      physicsPlaygroundProfileForV1(sceneId, playgroundPanel?.rampAngleDegrees()),
    setLivePoseMode: (on) => {
      sceneSession?.setLivePoseModeV1(on);
    },
    redraw: () => { drawFrame(lastShownMs); },
    report: (message) => { showViewError(new Error(message), message); },
    // The hint bar teaches what the left button does, and Interact changes
    // exactly that, so every mode flip re-teaches it.
    modeChanged: () => {
      if (sceneOpen !== null) syncSceneStageHint(sceneOpen);
    },
  });
  toggles.append(lookSwitch, depthToggle, lightToggle, sceneAnimationToggle,
    wireframeToggle, gridToggle, physToggle, snapToggle,
    ...liveInteract.buttons);
  playgroundPanel = createStudioPlaygroundPanel({
    interact: liveInteract,
    openSceneById: (sceneId) => {
      const target = sceneWorkspace.find(sceneId);
      if (target === undefined) {
        showViewError(
          new Error(`No scene '${sceneId}' exists to switch to.`),
          'The playground station switch failed.',
        );
        return;
      }
      runViewAction(() => { openSceneMode(target); });
    },
    overlay: playgroundView,
    redraw: () => { drawFrame(lastShownMs); },
  });
  const viewError = element('p', 'lib-error view-error');
  viewError.setAttribute('role', 'alert');
  viewError.setAttribute('aria-live', 'assertive');
  viewError.hidden = true;
  const clearViewError = (): void => {
    viewError.hidden = true;
    viewError.textContent = '';
  };
  const showViewError = (error: unknown, fallback: string): void => {
    viewError.textContent = error instanceof Error && error.message.trim() !== ''
      ? error.message
      : fallback;
    viewError.hidden = false;
  };
  const runViewAction = (action: () => void): void => {
    clearViewError();
    try {
      action();
    } catch (error) {
      showViewError(
        error,
        'The view change failed without an explanation; the prior view remains active.',
      );
    }
  };

  const flatCamera = new OrthographicCamera();
  const depthCamera = new PerspectiveCamera();
  // Real depth is the resting state, per the owner: the flat view's
  // equal-sizes-everywhere reads backwards at a glance, so the honest eye is
  // the default and flat is the deliberate choice — unless a previous visit
  // chose otherwise, which the remembered look restores here.
  let depthOn = view.depth;
  let camera: OrthographicCamera | PerspectiveCamera = depthOn ? depthCamera : flatCamera;
  const firstModel = openingModel(catalog, options.openModelId);
  const initialShelfModelId = catalog.sections
    .flatMap((section) => section.models)
    .filter((entry) => entry.id === firstModel.id).length === 1
    ? firstModel.id
    : null;
  // Fitted to the model it opens on, for the same reason every later open is:
  // a shelf's models are not one size.
  let orbit: OrbitStateV1 = clampOrbit({
    ...DEFAULT_ORBIT,
    viewHeight: fitViewHeight(firstModel.size, modelVoxelSizeV1(firstModel)),
  });
  // The point the camera looks at; a right-drag pan slides it, while opening a
  // model or an ordinary scene returns to the stable world origin.
  let panCenter: OrbitCenterV1 = [0, 0, 0];
  let viewW = VIEW_WIDTH;
  let viewH = VIEW_HEIGHT;
  let rejectedAutoResize: { readonly width: number; readonly height: number } | null = null;
  applyOrbit(camera, orbit, viewW, viewH, panCenter);

  const session = new StudioSession(firstModel, {
    canvas, width: viewW, height: viewH, camera, edges: view.edges, lit: view.lit, wireframe: view.wireframe,
  });
  // The scene lane: the game's whole book to resolve placements, a session that
  // draws to sceneCanvas (created lazily the first time a scene opens), and
  // which scene is open — null in model mode. The model session stays alive
  // under a shown scene, so everything that reads it keeps working.
  const sceneRecipes = catalog.recipes ?? catalogRecipesV1(catalog);
  const sceneParts = catalog.parts ?? catalogPartsV1(catalog);
  let sceneSession: SceneSession | null = null;
  let sceneOpen: SceneV1 | null = null;
  let sceneAnnotationDocumentCache: SceneAnnotationsV1 | null = null;
  let sceneAnnotationFingerprintCache: {
    readonly scene: SceneV1;
    readonly fingerprint: string;
  } | null = null;
  let sceneAnnotationModeOn = false;
  let sceneNotesPanel: StudioSceneNotesPanelV1 | null = null;
  // A left click picks the model under the cursor; these hold each placement's
  // world box (recomputed when the scene changes) and which one is selected, so
  // it can be outlined and dragged.
  const sceneRaycaster = new Raycaster();
  let sceneBoxes: readonly PlacementBoxV1[] = [];
  let selectedPlacementId: string | null = null;
  // Undo/redo of scene edits: each edit pushes the scene before it onto undo and
  // clears redo; the whole stack is dropped when a different scene opens.
  const sceneUndo: SceneV1[] = [];
  const sceneRedo: SceneV1[] = [];
  const MAX_SCENE_HISTORY = 200;
  // Snap-to-grid: while on, a dragged model's footprint lands on whole world
  // units — the one-unit voxel lattice models are authored on, not the coarser
  // 4-unit floor ruler — so edges meet cleanly.
  let snapOn = false;
  // Editing a scene hands a new scene back: the app adopts it (recording the
  // step for undo) and redraws. Selecting a row routes through the app's one
  // selection, the same one the stage's outline and drag use — so the controls
  // always act on whatever is currently picked, list or stage.
  const sceneEditor = createSceneEditor({
    recipes: sceneRecipes,
    modelDisplayLabel: (id, fallback) => modelLabelWorkspace.label(id, fallback),
    onChange: (next) => { commitSceneEdit(next); },
    onSelect: (id) => { selectPlacement(id); },
  });
  const sceneNote = (text: string): HTMLElement => {
    const note = element('div', 'pane');
    const line = element('p', 'hint');
    line.textContent = text;
    note.append(line);
    return note;
  };
  const sceneBuildNote = sceneNote('A scene is placed, not built step by step. '
    + 'Add and arrange its models in the Edit tab.');
  const sceneMotionNote = sceneNote('Animated models, consumer pose replays, and moving point-light sources share the scene animation control. '
    + 'Lighting changes illumination, not movement. A replay presents supplied poses; Voxel does not advance its solver.');
  const sceneReplayReadOnlyNote = sceneNote(
    'This scene is driven by a consumer-supplied pose replay and is read-only in Studio. '
    + 'Play or scrub to inspect recorded poses, use the look and camera controls to examine them, '
    + 'or delete the scene from its library menu. To change the assembly, update the consumer simulation '
    + 'or trace source and regenerate the replay.',
  );
  // The same read-only fact for a scene that solves live. Nothing here is
  // recorded, so none of the replay advice above applies.
  const sceneLiveReadOnlyNote = sceneNote(
    'This scene poses its own models from a live physics profile and is read-only in Studio. '
    + 'Nothing here is recorded: the solver runs in this browser every frame. '
    + 'Use Interact to move things by hand, reset the station to put them back, '
    + 'or change the profile where it is declared.',
  );
  // A scene's tab content sits as an opaque overlay over each model-only tab,
  // shown while a scene is open — so the model's own content underneath keeps
  // its visibility and is simply covered, never toggled out from under itself.
  const sceneInspectorPanels: HTMLElement[] = [];
  const sceneCoveredModelContents: {
    readonly element: HTMLElement;
    readonly ariaHidden: string | null;
    readonly inert: boolean;
  }[] = [];
  // A scene does not use model construction or model-authored motion. Notes
  // remains visible for its separate private scene-review document.
  let sceneHiddenTabs: HTMLElement[] = [];
  function setInspectorSceneMode(on: boolean): void {
    for (const content of sceneInspectorPanels) content.hidden = !on;
    for (const covered of sceneCoveredModelContents) {
      covered.element.inert = on || covered.inert;
      if (on) covered.element.setAttribute('aria-hidden', 'true');
      else if (covered.ariaHidden === null) covered.element.removeAttribute('aria-hidden');
      else covered.element.setAttribute('aria-hidden', covered.ariaHidden);
    }
    for (const tab of sceneHiddenTabs) tab.hidden = on;
  }
  const player = new StudioPlayer(session.model.motion.periodMs);
  const sceneTransport = new StudioSceneAnimationTransport(player, view.sceneAnimation, () => performance.now());
  const noteStore = new NoteStore();
  // The floor, colour, and note anchor the editor, notes, and stage share.
  const state: StudioEditStateV1 = {
    layer: 0, selectedSlot: 1, pending: null, armedForPlace: false,
  };
  let lastShownMs = 0;

  // ---- top bar ----
  const modelName = element('h1', 'name');
  const statusChip = element('span', 'status');
  const openButton = element('button');
  openButton.textContent = 'Open…';
  const newButton = element('button');
  newButton.textContent = 'New';
  const copyButton = element('button');
  copyButton.textContent = 'Copy';
  const requestShortcut = element('button', 'primary');
  requestShortcut.textContent = 'Send request';
  for (const command of [openButton, newButton, copyButton]) {
    command.hidden = !supportsEdit;
    command.disabled = !supportsEdit;
  }
  requestShortcut.hidden = !supportsNotes;
  requestShortcut.disabled = !supportsNotes;

  // ---- inspector: examine ----
  const motionText = element('p', 'motion');
  const modelLine = element('p', 'factline');
  // Announces surfaces that occupy the same space or fight for visibility in
  // the open scene, so the tool catches them instead of the owner's eye.
  const sceneConflictLine = element('p', 'verdict');
  sceneConflictLine.classList.add('scene-conflicts');
  sceneConflictLine.hidden = true;
  // Scale the whole model by its voxel size. The slider resizes it in place
  // against the ground grid; the readout says the size in world units.
  const sizeField = element('div', 'field');
  const sizeHead = element('span', 'grouphead');
  sizeHead.textContent = 'Voxel size';
  const sizeSlider = element('input', 'slider');
  sizeSlider.type = 'range';
  sizeSlider.min = '0';
  sizeSlider.max = String(SIZE_SLIDER_STEPS);
  sizeSlider.step = '1';
  sizeSlider.setAttribute('aria-label', 'Voxel size');
  sizeSlider.title = 'How big one voxel is in world units. Scales the whole model '
    + 'without changing any step of how it was made.';
  const sizeReadout = element('p', 'factline');
  sizeField.append(sizeHead, sizeSlider, sizeReadout);
  const engineWarning = element('p', 'verdict');
  engineWarning.hidden = true;
  const sweepButton = element('button');
  sweepButton.textContent = 'Check the movement';
  const sheetButton = element('button');
  sheetButton.textContent = 'All frames';
  const verdict = element('p', 'verdict');
  const sheetImage = element('img', 'sheet');
  sheetImage.alt = 'Every frame of the movement, in time order';
  sheetImage.hidden = true;

  const changeModelLabel = (
    id: string,
    action: string,
    change: () => ModelLabelInfoV1,
  ): ModelLabelInfoV1 => {
    const previous = modelLabelWorkspace.sections()
      .flatMap((section) => section.models)
      .find((model) => model.id === id);
    const changed = change();
    try {
      refresh();
      return changed;
    } catch (refreshFailure) {
      try {
        if (previous?.renamed === true) modelLabelWorkspace.rename(id, previous.label);
        else modelLabelWorkspace.restore(id);
      } catch (restoreFailure) {
        throw new AggregateError(
          [refreshFailure, restoreFailure],
          `${action} model '${id}' changed its alias, but Studio refresh failed and the former alias could `
          + 'not be restored. Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      throw new Error(
        `${action} model '${id}' was rolled back because Studio could not refresh: ${
          refreshFailure instanceof Error ? refreshFailure.message : String(refreshFailure)
        }`,
        { cause: refreshFailure },
      );
    }
  };

  // ---- the harness: the one surface both the buttons and the agent use ----
  const harness = createStudioHarness({
    session: () => session,
    replace(model: StudioModelV1) {
      try {
        // StudioSession's accepted-state transaction handles a whole-model
        // replacement. Reusing it keeps the canvas's one WebGL renderer (and
        // Three's context fallback textures) bounded across shelf navigation.
        session.setGenome(model);
      } catch (openingFailure) {
        throw new Error(
          `Opening model '${model.id}' was rejected before it replaced '${session.model.id}'; the previous `
          + `model remains active. ${
            openingFailure instanceof Error ? openingFailure.message : String(openingFailure)
          }`,
          { cause: openingFailure },
        );
      }
      // Opening a model leaves any shown scene only after the replacement
      // session is accepted; a rejected model must not destroy scene state.
      closeSceneMode();
      // Opening a model fits the view to it, because a shelf holds a game's
      // whole asset set and those are not one size. Only on open: an edit
      // must not re-zoom under your hands, and a construction's stages must
      // keep the frame the finished model set.
      orbit = clampOrbit({ ...orbit, viewHeight: fitViewHeight(model.size, session.voxelSize) });
      panCenter = [0, 0, 0];
      applyOrbit(camera, orbit, viewW, viewH, panCenter);
      viewChip.textContent = describeOrbit(orbit);
      // A new model has its own parts, so a part lit up on the last one has no
      // meaning here.
      highlightedPartIndex = null;
      refresh();
    },
    update(model: StudioModelV1) {
      session.setGenome(model);
      // The model changed under the parts list — an edit, or a construction
      // preview showing a partial grid — so any lit part is now stale.
      highlightedPartIndex = null;
      refresh();
    },
    player: () => player,
    noteStore: () => noteStore,
    now: () => performance.now(),
    drawAt: (timeMs: number) => {
      const hasSceneMotion = sceneOpen !== null && sceneSession?.hasMotion() === true;
      if (hasSceneMotion) {
        // Hold the last successful phase until drawFrame publishes a candidate.
        sceneTransport.freezeExact(lastShownMs);
        playerBar.syncPlayButton();
      }
      try {
        drawFrame(timeMs);
      } finally {
        if (hasSceneMotion) sceneTransport.freezeExact(lastShownMs);
      }
      // An explicit seek can move clustered lights out of a formerly overfull
      // projection. Retry an unchanged rejected stage size on the next frame.
      if (sceneOpen !== null) rejectedAutoResize = null;
    },
    resumeSceneAnimation(): boolean {
      if (sceneOpen === null || sceneSession?.hasMotion() !== true) return false;
      sceneTransport.setEnabled(true, lastShownMs, true);
      persistView();
      // Resume is an explicit retry boundary. If the next moving-light phase
      // still cannot fit, followStage caches that same size once again.
      rejectedAutoResize = null;
      clearViewError();
      refresh();
      playerBar.syncPlayButton();
      return true;
    },
    pauseSceneAnimation(): boolean {
      if (sceneOpen === null || sceneSession?.hasMotion() !== true) return false;
      sceneTransport.setEnabled(false, lastShownMs, true);
      persistView();
      refresh();
      playerBar.syncPlayButton();
      return true;
    },
    sceneAnimationSpeedChanged(): void {
      if (sceneOpen !== null) sceneTransport.speedChanged(lastShownMs);
    },
    sceneLightingMetrics: () =>
      sceneOpen === null ? null : (sceneSession?.lightingMetrics() ?? null),
    sceneRenderMetrics: () =>
      sceneOpen === null ? null : (sceneSession?.renderMetrics() ?? null),
    scenePoseReplayStatus: (): ScenePoseReplayStatusV1 | null =>
      sceneOpen === null ? null : (sceneSession?.poseReplayStatus() ?? null),
    notesChanged() {
      notesPanel.renderNotes();
      playerBar.renderDots();
    },
    sceneAnnotations: readSceneAnnotationDocument,
    setSceneBrief(sceneId, text) {
      sceneAnnotationStore.setBrief(sceneId, text);
      refreshSceneAnnotationDocumentCache(sceneId);
      if (sceneOpen?.id === sceneId) sceneNotesPanel?.render(sceneId);
    },
    addSceneAnnotation(sceneId, draft) {
      if (sceneOpen?.id !== sceneId) {
        throw new Error(
          `Scene annotation capture belongs to '${sceneId}', but ${
            sceneOpen === null ? 'no scene is open' : `scene '${sceneOpen.id}' is open`
          }. Open the matching scene before adding it.`,
        );
      }
      const result = sceneAnnotationStore.addPin(sceneId, draft);
      refreshSceneAnnotationDocumentCache(sceneId);
      sceneNotesPanel?.render(sceneId);
      drawSceneOverlays();
      return result.pin;
    },
    removeSceneAnnotation(sceneId, pinId) {
      const result = sceneAnnotationStore.removePin(sceneId, pinId);
      refreshSceneAnnotationDocumentCache(sceneId);
      if (sceneOpen?.id === sceneId) {
        sceneNotesPanel?.render(sceneId);
        drawSceneOverlays();
      }
      return result.removed;
    },
    clearSceneAnnotations(sceneId) {
      sceneAnnotationStore.clearScene(sceneId);
      refreshSceneAnnotationDocumentCache(sceneId);
      if (sceneOpen?.id === sceneId) {
        sceneNotesPanel?.render(sceneId);
        drawSceneOverlays();
      }
    },
    showSceneAnnotation,
    setSceneAnnotationMode,
    sceneAnnotationMode: () => sceneAnnotationModeOn,
    sendSceneRequest(words) {
      if (sceneOpen === null) {
        throw new Error('A scene request needs an open scene; open one from the shelf first.');
      }
      const document = readSceneAnnotationDocument(sceneOpen.id);
      return saveSceneRequest(sceneOpen.id, document, words ?? document.brief);
    },
    orbit: () => ({ ...orbit, described: describeOrbit(orbit) }),
    viewCenter: () => [...panCenter],
    setViewCenter(center) {
      const candidate = validatedOrbitCenterV1(center);
      if (candidate[1] !== panCenter[1]) {
        throw new Error(
          `The Studio view moves on the ground plane, so its center y must remain ${String(panCenter[1])}; `
          + `received ${String(candidate[1])}. Change only x and z.`,
        );
      }
      presentView(orbit, candidate);
      return [...panCenter];
    },
    resizeStage,
    depth: () => depthOn,
    setDepth,
    setEdges(on: boolean): boolean {
      // Applied to both lanes so the look is one choice: switching between a
      // model and a scene never surprises you with a different look.
      session.setEdges(on);
      sceneSession?.setEdges(on);
      persistView();
      // A full refresh so the switch, the picture, and the remembered look
      // all catch up together — the same funnel whether the UI or an agent
      // asked for it.
      refresh();
      if (sceneOpen !== null) drawFrame(lastShownMs);
      return session.edges;
    },
    setLit(on: boolean): boolean {
      const previousModelLit = session.lit;
      const previousSceneLit = sceneSession?.lit;
      const previousOrbit = orbit;
      const previousPanCenter = panCenter;
      try {
        session.setLit(on);
        sceneSession?.setLit(on);
        // Cluster limits are camera-dependent and are deliberately checked by
        // the exact frame. Do not publish or persist the toggle until that
        // candidate frame has actually reached the scene canvas.
        if (sceneOpen !== null && sceneSession !== null) {
          const candidateView = clampSceneViewV1(
            orbit,
            panCenter,
          );
          orbit = candidateView.orbit;
          panCenter = candidateView.center;
          applyOrbit(camera, orbit, viewW, viewH, panCenter);
          sceneSession.showAt(lastShownMs);
        }
      } catch (presentationFailure) {
        try {
          orbit = previousOrbit;
          panCenter = previousPanCenter;
          if (session.lit !== previousModelLit) session.setLit(previousModelLit);
          if (sceneSession !== null
            && previousSceneLit !== undefined
            && sceneSession.lit !== previousSceneLit) {
            sceneSession.setLit(previousSceneLit);
          }
          if (sceneOpen !== null && sceneSession !== null) {
            applyOrbit(camera, orbit, viewW, viewH, panCenter);
            sceneSession.showAt(lastShownMs);
          }
          refresh();
          if (sceneOpen !== null) drawSceneOverlays();
        } catch (restoreFailure) {
          throw new AggregateError(
            [presentationFailure, restoreFailure],
            'The Studio could not change scene lighting, and restoring the prior light choice also failed. '
            + 'Reload this Studio before continuing.',
            { cause: restoreFailure },
          );
        }
        const reason = presentationFailure instanceof Error
          ? presentationFailure.message
          : String(presentationFailure);
        throw new Error(
          `The light toggle could not be changed to ${on ? 'on' : 'off'}, so the prior choice remains active `
          + `and stored preferences were not changed. ${reason}`,
          { cause: presentationFailure },
        );
      }
      // Turning clustered lighting off (or changing its presentation mode)
      // can make the same DOM size safe after an automatic resize rejection.
      rejectedAutoResize = null;
      persistView();
      refresh();
      // Scene refresh updates controls and inspector text but intentionally
      // does not draw; the candidate raster above is already current.
      if (sceneOpen !== null) drawSceneOverlays();
      return session.lit;
    },
    setSceneAnimation(on: boolean): boolean {
      const hasMotion = sceneOpen !== null && sceneSession?.hasMotion() === true;
      sceneTransport.setEnabled(on, lastShownMs, hasMotion);
      persistView();
      if (on && hasMotion) { rejectedAutoResize = null; clearViewError(); }
      refresh();
      playerBar.syncPlayButton();
      return sceneTransport.enabled;
    },
    sceneAnimation: () => sceneTransport.enabled,
    sceneHasMotion: () => sceneOpen !== null && sceneSession?.hasMotion() === true,
    setWireframe(on: boolean): boolean {
      session.setWireframe(on);
      persistView();
      // refresh owns the overlay's lines and visibility, from session.wireframe.
      refresh();
      return session.wireframe;
    },
    setPhysicalOverlay: setPhysicalOverlayOn,
    physicalOverlay: () => physicalOn,
    highlightPart: setHighlightedPart,
    highlightedPart: () => highlightedPartIndex,
    scenes: () => sceneWorkspace.scenes(),
    openScene: (scene) => { openSceneMode(scene); },
    playgroundHost: {
      interact: () => liveInteract,
      panel: () => playgroundPanel,
    },
    renameScene: (id, label) => renameStudioScene(id, label),
    deleteScene: (id) => deleteStudioScene(id),
    sceneMode: () => sceneOpen !== null,
    sceneSurfaceConflicts: () => {
      if (sceneOpen === null) return null;
      const cached = sceneConflictReports.get(sceneOpen);
      return cached
        ? { status: 'ready' as const, conflicts: cached }
        : { status: 'checking' as const, conflicts: [] };
    },
    stageMode: () => liveInteract.mode(),
    setStageMode: (mode) => { liveInteract.setMode(mode); },
    livePhysics: () => liveInteract.state(),
    settleLive: (steps) => { liveInteract.settleSteps(steps); },
    scene: () => sceneOpen,
    selectScenePlacement(id) { selectPlacement(id); return selectedPlacementId; },
    selectedScenePlacement: () => selectedPlacementId,
    commitScene(next) { commitSceneEdit(next); },
    undoSceneEdit() { undoScene(); },
    redoSceneEdit() { redoScene(); },
    setSnapToGrid: (on) => setSnapToGrid(on),
    snapToGrid: () => snapOn,
    modelLabels: () => modelLabelWorkspace.sections(),
    modelDisplayLabel: (id, fallback = id) => modelLabelWorkspace.label(id, fallback),
    renameModel(id, label) {
      return changeModelLabel(id, 'Renaming', () => modelLabelWorkspace.rename(id, label));
    },
    restoreModelName(id) {
      return changeModelLabel(id, 'Restoring the name of', () => modelLabelWorkspace.restore(id));
    },
    orderShelfItems: (kind, ids, sectionIndex) => shelfOrderWorkspace.order(kind, ids, sectionIndex),
    moveShelfItem(request, ids) {
      try {
        return shelfOrderWorkspace.move(request, ids, rebuildShelf);
      } catch (error) {
        try {
          rebuildShelf();
        } catch (restoreFailure) {
          throw new AggregateError(
            [error, restoreFailure],
            `Rearranging shelf ${request.kind} '${request.id}' failed, and restoring the previous library `
            + 'order also failed. Reload this Studio before continuing.',
            { cause: restoreFailure },
          );
        }
        throw error;
      }
    },
    initialShelfModelId: () => initialShelfModelId,
    setOrbit(view) {
      presentView({ ...orbit, ...view }, panCenter);
      return { ...orbit, described: describeOrbit(orbit) };
    },
    // The camera's look-at point in world units. Orbit alone cannot frame
    // a scene whose subject is 30 m from the origin, which is exactly the
    // trebuchet's wall; the same rollback rule as any other view change.
    setViewCentre(centre) {
      presentView(orbit, centre);
      return [...panCenter] as [number, number, number];
    },
    catalog: () => catalog,
  });
  // Published only once the mount can no longer fail, at the end of this
  // function: a failed mount must never replace another mount's harness.

  // ---- the inspector panels ----
  // Each panel builds its own DOM and wires its own controls through the
  // harness. They coordinate through the shared `state`, the hoisted stage
  // functions below, and a few callbacks; the construction panel is created
  // last, inside the rollback, because it is the first thing to touch the
  // game's catalog data and so the first that can fail.
  const playerBar: StudioPlayerBarV1 = createStudioPlayerBar({ harness, player, noteStore });
  const motionPanel: StudioMotionPanelV1 = createStudioMotionPanel({ harness });
  const libraryDetails = createStudioLibraryDetails(harness);
  const shelfPanel: StudioShelfV1 = createStudioShelf({ harness, showTab });
  rebuildShelf = () => { shelfPanel.rebuild(); };
  const editor: StudioEditorPanelV1 = createStudioEditorPanel({
    harness,
    supportsEdit,
    state,
    showTab,
    beginPlaceNote: (x, y, z) => { notesPanel.beginPlaceNote(x, y, z); },
  });
  const notesPanel: StudioNotesPanelV1 = createStudioNotesPanel({
    harness,
    supportsEdit,
    supportsNotes,
    state,
    editor,
    showTab,
    syncPlayButton: () => { playerBar.syncPlayButton(); },
    redrawOverlays: positionRings,
  });
  sceneNotesPanel = createStudioSceneNotesPanel({
    getScene: () => sceneOpen === null ? null : { id: sceneOpen.id, label: sceneOpen.label },
    getDocument: readSceneAnnotationDocument,
    setBrief: (sceneId, brief) => sceneAnnotationStore.setBrief(sceneId, brief),
    addPin: (sceneId, draft) => sceneAnnotationStore.addPin(sceneId, draft),
    removePin: (sceneId, pinId) => sceneAnnotationStore.removePin(sceneId, pinId),
    showPin: showSceneAnnotation,
    getAnnotationMode: () => sceneAnnotationModeOn,
    setAnnotationMode: setSceneAnnotationMode,
    sendRequest: (sceneId, document) => saveSceneRequest(sceneId, document),
    redraw: drawSceneOverlays,
    loadWarnings: sceneAnnotationStore.loadWarnings,
  });
  editor.wireTopBar({ openButton, newButton, copyButton });
  requestShortcut.addEventListener('click', () => {
    if (sceneOpen !== null) {
      showTab('notes');
      sceneNotesPanel.focusBrief();
    } else {
      notesPanel.focusRequest();
    }
  });

  // ---- drawing and readouts ----
  function refreshSceneAnnotationDocumentCache(sceneId: string): SceneAnnotationsV1 {
    const document = sceneAnnotationStore.readScene(sceneId);
    if (sceneOpen?.id === sceneId) sceneAnnotationDocumentCache = document;
    return document;
  }

  function readSceneAnnotationDocument(sceneId: string): SceneAnnotationsV1 {
    return refreshSceneAnnotationDocumentCache(sceneId);
  }

  function currentSceneAnnotationFingerprint(): string {
    if (sceneOpen === null) {
      throw new Error('A scene annotation fingerprint needs an open scene; no scene is open.');
    }
    if (sceneAnnotationFingerprintCache?.scene !== sceneOpen) {
      sceneAnnotationFingerprintCache = {
        scene: sceneOpen,
        fingerprint: scenePresentationFingerprintV1(
          sceneOpen,
          sceneResolvedContentHashesV1(sceneOpen, sceneRecipes, sceneParts),
        ),
      };
    }
    return sceneAnnotationFingerprintCache.fingerprint;
  }

  function viewSignature(): string {
    return `${String(orbit.yawDegrees)}:${String(orbit.pitchDegrees)}:${String(orbit.viewHeight)}`
      + `:${depthOn ? 'depth' : 'flat'}:`
      + `${String(panCenter[0])},${String(panCenter[1])},${String(panCenter[2])}`;
  }

  function sceneAnnotationContext(): SceneAnnotationViewContextV1 {
    if (sceneOpen === null || sceneSession === null) {
      throw new Error('A scene annotation needs a successfully presented open scene; no scene is open.');
    }
    const replayStatus = sceneSession.poseReplayStatus();
    return {
      sceneId: sceneOpen.id,
      sceneFingerprint: currentSceneAnnotationFingerprint(),
      timeMs: lastShownMs,
      orbit: { ...orbit },
      panCenter: [...panCenter],
      depth: depthOn,
      lit: session.lit,
      edges: session.edges,
      selectedPlacementId,
      viewport: { width: viewW, height: viewH },
      ...(replayStatus === null
        ? {}
        : {
            replay: {
              id: replayStatus.replayId,
              inputHash: replayStatus.provenance.inputHash,
              finalHash: replayStatus.provenance.finalHash,
            },
          }),
    };
  }

  function sceneRequestCapture(): StudioSceneCaptureV1 {
    const context = sceneAnnotationContext();
    return {
      timeMs: context.timeMs,
      orbit: { ...context.orbit },
      center: [...context.panCenter],
      depth: context.depth,
      lit: context.lit,
      edges: context.edges,
      selectedPlacementId: context.selectedPlacementId,
      ...(context.replay === undefined ? {} : { replay: { ...context.replay } }),
    };
  }

  function setSceneAnnotationMode(on: boolean): boolean {
    if (on && !supportsNotes) {
      throw new Error(
        'Scene annotation mode is unavailable because this Studio shell profile does not include the Notes tab.',
      );
    }
    if (on && sceneOpen === null) {
      throw new Error('Scene annotation mode needs an open scene; open a scene from the shelf first.');
    }
    if (on && sceneNotesPanel?.editorOpen === true) {
      throw new Error(
        'Finish or cancel the captured annotation that is already open before arming another scene annotation.',
      );
    }
    sceneAnnotationModeOn = on;
    canvasWrap.classList.toggle('scene-annotation-armed', on);
    sceneNotesPanel?.syncAnnotationMode();
    if (sceneOpen !== null) syncSceneStageHint(sceneOpen);
    return sceneAnnotationModeOn;
  }

  function positionSceneAnnotationMarkers(): void {
    if (sceneOpen === null) {
      marks.replaceChildren();
      setSceneAnnotationDraftPresentationLocked(false);
      return;
    }
    const document = sceneAnnotationDocumentCache?.sceneId === sceneOpen.id
      ? sceneAnnotationDocumentCache
      : refreshSceneAnnotationDocumentCache(sceneOpen.id);
    const draft = sceneNotesPanel?.capturedDraft ?? null;
    setSceneAnnotationDraftPresentationLocked(draft !== null);
    renderSceneAnnotationMarkersV1({
      layer: marks,
      pins: document.pins,
      draft,
      context: sceneAnnotationContext(),
      fallbackBounds: { width: viewW, height: viewH },
    });
  }

  function showSceneAnnotation(pin: SceneViewPinV1): void {
    const current = sceneAnnotationContext();
    const unavailable = sceneViewPinStaleReasonV1(pin, current);
    if (unavailable !== null) throw new Error(unavailable);
    const previous = {
      orbit: { ...orbit },
      panCenter: [...panCenter] as OrbitCenterV1,
      depth: depthOn,
      lit: session.lit,
      edges: session.edges,
      selectedPlacementId,
      timeMs: lastShownMs,
      enabled: sceneTransport.enabled,
      playing: player.playing,
    };
    const hasMotion = sceneSession?.hasMotion() === true;
    try {
      sceneTransport.freezeExact(lastShownMs);
      if (selectedPlacementId !== pin.selectedPlacementId) {
        selectPlacement(pin.selectedPlacementId);
      }
      if (session.edges !== pin.edges) harness.setEdges(pin.edges);
      if (session.lit !== pin.lit) harness.setLit(pin.lit);
      if (depthOn !== pin.depth) setDepth(pin.depth);
      presentView(pin.orbit, [...pin.panCenter], pin.timeMs);
      sceneTransport.freezeExact(pin.timeMs);
      playerBar.syncPlayButton();
      if (!sceneViewPinMatchesV1(pin, sceneAnnotationContext())) {
        throw new Error(
          'The Studio presented a different camera, selection, look, phase, or viewport than the annotation captured.',
        );
      }
      positionSceneAnnotationMarkers();
    } catch (showFailure) {
      try {
        if (session.edges !== previous.edges) harness.setEdges(previous.edges);
        if (session.lit !== previous.lit) harness.setLit(previous.lit);
        if (depthOn !== previous.depth) setDepth(previous.depth);
        presentView(previous.orbit, previous.panCenter, previous.timeMs);
        if (selectedPlacementId !== previous.selectedPlacementId) {
          selectPlacement(previous.selectedPlacementId);
        }
        sceneTransport.setEnabled(previous.enabled, previous.timeMs, hasMotion);
        if (!previous.playing) sceneTransport.freezeExact(previous.timeMs);
        persistView();
        refresh();
        playerBar.syncPlayButton();
      } catch (restoreFailure) {
        throw new AggregateError(
          [showFailure, restoreFailure],
          `Annotation ${String(pin.id)} could not be shown, and restoring the prior scene view also failed. `
          + 'Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      const reason = showFailure instanceof Error ? showFailure.message : String(showFailure);
      throw new Error(
        `Annotation ${String(pin.id)} could not be shown, so the prior view and playback state were restored. ${reason}`,
        { cause: showFailure },
      );
    }
  }

  async function saveSceneRequest(
    sceneId: string,
    document: SceneAnnotationsV1,
    words = document.brief,
  ): Promise<SendResult> {
    if (sceneOpen?.id !== sceneId) {
      throw new Error(
        `A request for scene '${sceneId}' needs that scene presented on the stage; open it and try again.`,
      );
    }
    if (document.sceneId !== sceneId) {
      throw new Error(
        `The scene request document belongs to '${document.sceneId}', not '${sceneId}'. Reload the Notes tab and try again.`,
      );
    }
    return saveStudioRequest(
      buildSceneRequest(words, document.pins, sceneOpen, sceneRequestCapture()),
    );
  }

  function drawSceneOverlays(): void {
    const signature = viewSignature();
    gridView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, signature, 1);
    // Draw even when no placement is selected: the hidden draw clears any
    // pooled SVG lines left by the previous scene's selection.
    highlightView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, signature, 1);
    positionSceneAnnotationMarkers();
  }

  function drawFrame(timeMs: number): void {
    // Reasserted every draw, not only on drag: the engine may touch the shared
    // camera, and the studio's view must win on every frame, not just the ones
    // after an interaction.
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
    const signature = viewSignature();
    // A shown scene draws to its own canvas and keeps a ground grid under its
    // whole floor; the only model layer it borrows is the highlight, reused to
    // outline the selected placement.
    if (sceneOpen && sceneSession) {
      sceneSession.showAt(timeMs);
      lastShownMs = timeMs;
      playerBar.showSceneTime(timeMs);
      syncSceneStatus(sceneOpen);
      drawSceneOverlays();
      // World space, like the ground grid: origin middle, unit scale.
      playgroundView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH,
        viewSignature(), 1);
      if (sceneTransport.finishAtEnd(timeMs)) playerBar.syncPlayButton();
      return;
    }
    session.showAt(timeMs);
    lastShownMs = timeMs;
    playerBar.showTime(timeMs);
    positionRings();
    const middle = session.frameMiddle();
    const scale = session.voxelSize;
    // The grid is already world coordinates, so it draws straight — no model
    // middle to subtract, no voxel scale to apply.
    gridView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, signature, 1);
    physicalView.draw(camera, middle, viewW, viewH, signature, scale);
    wireframeView.draw(camera, middle, viewW, viewH, signature, scale);
    highlightView.draw(camera, middle, viewW, viewH, signature, scale);
  }

  /**
   * Presents a candidate orbit/pan before keeping it. Clustered membership is
   * camera-dependent, so a view gesture has the same rollback rule as a light
   * edit: the former camera and raster survive a rejected projection.
   */
  function presentView(
    nextOrbit: OrbitStateV1,
    nextPanCenter: OrbitCenterV1,
    timeMs = lastShownMs,
  ): void {
    const previousOrbit = orbit;
    const previousPanCenter = panCenter;
    const previousShownMs = lastShownMs;
    const candidateView = clampSceneViewV1(nextOrbit, nextPanCenter);
    orbit = candidateView.orbit;
    panCenter = candidateView.center;
    try {
      drawFrame(timeMs);
    } catch (presentationFailure) {
      orbit = previousOrbit;
      panCenter = previousPanCenter;
      lastShownMs = previousShownMs;
      applyOrbit(camera, orbit, viewW, viewH, panCenter);
      try {
        drawFrame(previousShownMs);
      } catch (restoreFailure) {
        throw new AggregateError(
          [presentationFailure, restoreFailure],
          'The requested view could not be presented, and restoring the prior camera raster also failed. '
          + 'Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      const reason = presentationFailure instanceof Error
        ? presentationFailure.message
        : String(presentationFailure);
      throw new Error(
        `The requested camera view could not be presented, so the prior orbit and pan remain active. ${reason}`,
        { cause: presentationFailure },
      );
    }
    // A camera change can make a formerly overfull cluster safe at the same
    // DOM size. Let the next frame deliberately retry that rejected resize.
    rejectedAutoResize = null;
    viewChip.textContent = describeOrbit(orbit);
  }

  function positionRings(): void {
    marks.replaceChildren();
    const nearMs = 40;
    for (const note of noteStore.list()) {
      if (note.kind !== 'moment') continue;
      if (Math.abs(note.timeMs - lastShownMs) > nearMs) continue;
      marks.appendChild(ringAt(note.spot.u, note.spot.v, false));
    }
    if (state.pending?.kind === 'moment') marks.appendChild(ringAt(state.pending.u, state.pending.v, true));
  }

  function ringAt(u: number, v: number, active: boolean): HTMLElement {
    const ring = element('div', active ? 'ring active' : 'ring');
    ring.style.left = `${String(u * 100)}%`;
    ring.style.top = `${String(v * 100)}%`;
    return ring;
  }

  // ---- scene view ----
  /** The stable origin-centered fit retained by scenes without an opt-in view. */
  function sceneFitHeight(scene: SceneV1): number {
    let reach = 8;
    for (const placement of scene.placements) {
      reach = Math.max(
        reach,
        Math.hypot(placement.at[0], placement.at[2]) + 10,
      );
    }
    return Math.min(AUTO_FIT_MAX_VIEW_HEIGHT, reach * 2.4);
  }

  /**
   * Keeps the shared transport truthful as scene edits add/remove motion. A
   * null previous state means a freshly opened scene and restarts at zero.
   */
  function syncSceneTransport(
    scene: SceneV1,
    previousHasMotion: boolean | null,
  ): void {
    const hasMotion = sceneSession?.hasMotion() === true;
    const transportPeriodMs = hasMotion ? Math.max(1, sceneMotionWindowMsV1(scene, sceneRecipes)) : 0;
    sceneTransport.sync({
      hasMotion, previousHasMotion, periodMs: transportPeriodMs, lastShownMs,
      playback: sceneSession?.poseReplayStatus()?.playback ?? 'loop',
      applyPeriod: (periodMs) => { playerBar.applyPeriod(periodMs); },
    });
    playerBar.showSceneTime(lastShownMs);
    playerBar.syncPlayButton();
  }

  /**
   * Opens a scene on the stage. The model session stays alive underneath its
   * own hidden canvas, so everything that reads a single model keeps working;
   * the scene draws to its own canvas at the same shared camera and look.
   */
  function openSceneMode(scene: SceneV1): void {
    const previousOpen = sceneOpen;
    const previousSession = sceneSession;
    const previousSessionScene = previousSession?.scene;
    const previousSessionEdges = previousSession?.edges;
    const previousSessionLit = previousSession?.lit;
    const previousOrbit = orbit;
    const previousPanCenter = panCenter;
    const previousShownMs = lastShownMs;
    const openingPolicy = catalog.sceneOpeningViews?.[scene.id];
    const openingView = openingPolicy === 'occupied-world-bounds'
      ? sceneOpeningViewV1(scene, sceneRecipes, sceneParts)
      : null;
    const candidateView = safeDenseSceneOpeningViewV1(
      {
        ...orbit,
        viewHeight: openingView?.viewHeight ?? sceneFitHeight(scene),
      },
      scene,
      openingView?.center ?? [0, 0, 0],
      { lit: session.lit, depth: depthOn },
    );
    const candidatePanCenter = candidateView.center;
    const candidateOrbit = candidateView.orbit;
    let candidateSession = previousSession;
    let createdCandidate = false;

    // Cluster membership depends on the camera, so stage the fitted camera
    // before drawing the candidate. Visible/editor state is published only
    // after that complete frame succeeds.
    applyOrbit(camera, candidateOrbit, viewW, viewH, candidatePanCenter);
    try {
      if (candidateSession === null) {
        candidateSession = new SceneSession(scene, sceneRecipes, sceneParts, {
          canvas: sceneCanvas, width: viewW, height: viewH, camera,
          edges: session.edges, lit: session.lit, wireframe: false,
          ...(catalog.scenePoseReplays === undefined
            ? {}
            : { poseReplays: catalog.scenePoseReplays }),
        });
        createdCandidate = true;
      } else {
        candidateSession.setScene(scene);
        candidateSession.setEdges(session.edges);
        candidateSession.setLit(session.lit);
      }
      candidateSession.showAt(0);
    } catch (openingFailure) {
      try {
        applyOrbit(camera, previousOrbit, viewW, viewH, previousPanCenter);
        if (createdCandidate) {
          // The renderer itself is healthy when only camera-dependent cluster
          // preparation rejected the first scene. Retire it into an empty
          // hidden session so repeated rejected opens cannot allocate another
          // set of Three context fallback textures.
          candidateSession?.setScene(RETIRED_SCENE);
          candidateSession?.showAt(0);
          sceneSession = candidateSession;
        } else if (candidateSession !== null && previousSessionScene !== undefined) {
          candidateSession.setScene(previousSessionScene);
          if (previousSessionEdges !== undefined) candidateSession.setEdges(previousSessionEdges);
          if (previousSessionLit !== undefined) candidateSession.setLit(previousSessionLit);
          if (previousOpen !== null) candidateSession.showAt(previousShownMs);
        }
      } catch (restoreFailure) {
        const failures: unknown[] = [openingFailure, restoreFailure];
        if (createdCandidate) {
          try {
            candidateSession?.dispose();
          } catch (cleanupFailure) {
            failures.push(cleanupFailure);
          }
        }
        throw new AggregateError(
          failures,
          `Scene '${scene.id}' could not be opened, and restoring the prior rendered state also failed. `
          + (createdCandidate
            ? 'The rejected first scene session was disposed where possible. '
            : '')
          + 'Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      const reason = openingFailure instanceof Error ? openingFailure.message : String(openingFailure);
      throw new Error(
        `Scene '${scene.id}' could not be opened, so ${
          previousOpen === null ? 'the model view' : `scene '${previousOpen.id}'`
        } remains active with its selection and undo history unchanged. ${reason}`,
        { cause: openingFailure },
      );
    }

    sceneSession = candidateSession;
    sceneOpen = scene;
    // The panel adopts the scene BEFORE the live world builds: opening a
    // scene resets the panel's ramp angle to the station default, and the
    // profile resolver reads that angle — this order keeps the built world
    // and the angle readout telling the same story on every (re)open.
    playgroundPanel?.sceneOpened(scene);
    // A replay scene hands Interact its resolved recorded poses, so the live
    // world starts where the recording starts; the session just validated
    // this exact catalog replay while accepting the scene.
    liveInteract.openScene(
      scene,
      sceneRecipes,
      sceneParts,
      scene.schemaVersion === VOXEL_SCENE_SCHEMA_V4
        ? catalog.scenePoseReplays?.[scene.poseReplay.id] ?? null
        : null,
    );
    sceneAnnotationFingerprintCache = null;
    sceneAnnotationDocumentCache = null;
    clearViewError();
    lastShownMs = 0;
    selectedPlacementId = null;
    sceneEditor.clearLightSelection();
    // A fresh scene starts with an empty edit history — undo never reaches back
    // into a scene you are no longer looking at.
    sceneUndo.length = 0;
    sceneRedo.length = 0;
    panCenter = candidatePanCenter;
    orbit = candidateOrbit;
    sceneNotesPanel?.cancelCapture();
    sceneAnnotationModeOn = false;
    canvasWrap.classList.remove('scene-annotation-armed');
    canvas.style.display = 'none';
    sceneCanvas.style.display = 'block';
    // Examine carries the scene's readout; Build and the rest belong to a
    // single model, so open on the tab that speaks about the scene.
    showTab('examine');
    refresh();
    drawSceneOverlays();

    syncSceneTransport(scene, null);
    // The newly accepted scene/camera/light set may fit a DOM size rejected by
    // the prior scene. Give that unchanged size one fresh attempt.
    rejectedAutoResize = null;
  }

  /** Leaves the scene view for the model lane and drops every scene-only edit/selection reference. */
  function closeSceneMode(): void {
    if (sceneOpen === null) return;
    sceneConflictLine.hidden = true;
    sceneNotesPanel?.cancelCapture();
    sceneAnnotationModeOn = false;
    canvasWrap.classList.remove('scene-annotation-armed');
    sceneEditor.clearLightSelection();
    sceneTransport.freezeExact(lastShownMs);
    player.setPlayback('loop', performance.now());
    clearViewError();
    sceneOpen = null;
    liveInteract.openScene(null, sceneRecipes, sceneParts);
    sceneAnnotationFingerprintCache = null;
    sceneAnnotationDocumentCache = null;
    selectedPlacementId = null;
    sceneBoxes = [];
    sceneUndo.length = 0;
    sceneRedo.length = 0;
    marks.replaceChildren();
    highlightView.setSegments([]);
    highlightView.setVisible(false);
    playgroundPanel?.sceneOpened(null);
    canvas.style.display = 'block';
    sceneCanvas.style.display = 'none';
    rejectedAutoResize = null;
  }

  /**
   * Renaming is a scene edit when that scene is open, so its history behaves
   * predictably: undoing the rename restores the former name, and undoing an
   * older placement change after it cannot resurrect a stale catalog label.
   */
  function renameStudioScene(id: string, label: string): SceneV1 {
    if (sceneOpen?.id === id) {
      const renamed = sceneWorkspace.prepareRename(id, label);
      commitSceneEdit(renamed);
      return renamed;
    }
    const renamed = sceneWorkspace.rename(id, label);
    shelfPanel.rebuild();
    return renamed;
  }

  /**
   * Removing the shown scene returns to the model session kept alive beneath
   * it. The scene renderer is emptied but retained for reuse: rebuilding a
   * Three renderer on every delete/open cycle would accumulate its internal
   * context fallback textures.
   */
  function deleteStudioScene(id: string): SceneV1 {
    const removed = sceneWorkspace.delete(id);
    const wasOpen = sceneOpen?.id === id;
    const wasRetained = sceneSession?.scene.id === id;
    if (!wasOpen && !wasRetained) {
      shelfPanel.rebuild();
      return removed;
    }
    let retirementFailure: unknown;
    try {
      if (wasRetained) {
        sceneSession?.setScene(RETIRED_SCENE);
        // Present the empty snapshot once so replaced scene geometry is released
        // now, while the renderer and its reusable clustered allocation survive.
        sceneSession?.showAt(0);
      }
    } catch (error) {
      retirementFailure = error;
    } finally {
      if (wasOpen) {
        // Retirement cleanup is allowed to fail. The visible transition is not:
        // the deleted scene must never remain on screen after it is gone.
        //
        // This used to be a hand-copied subset of `closeSceneMode`, and it had
        // drifted: it never told `liveInteract` or the playground panel the
        // scene was gone. A live scene's Rapier world therefore outlived the
        // delete, kept stepping, and pushed poses at the retired snapshot until
        // the pose delta threw `pose.instance-missing` over the restored model
        // view — with the Adjust/Interact buttons and the playground panel
        // still on screen. Closing first and deleting after removes the class.
        closeSceneMode();
        highlightedPartIndex = null;
        panCenter = [0, 0, 0];
        orbit = clampOrbit({
          ...orbit,
          viewHeight: fitViewHeight(session.model.size, session.voxelSize),
        });
        applyOrbit(camera, orbit, viewW, viewH, panCenter);
        refresh();
      } else {
        shelfPanel.rebuild();
      }
    }
    if (retirementFailure !== undefined) {
      const reason = retirementFailure instanceof Error
        ? retirementFailure.message
        : typeof retirementFailure === 'string'
          ? retirementFailure
          : 'an unknown non-Error value was thrown';
      throw new Error(
        `Scene '${id}' was deleted${
          wasOpen ? ' and the model view was restored' : ''
        }, but emptying its reusable renderer failed: ${reason}. `
        + 'Reload the page before opening another scene.',
        { cause: retirementFailure },
      );
    }
    return removed;
  }

  /**
   * Scene-mode readouts: the top bar and the shared look toggles, nothing a
   * single model owns. The model's own overlays and tools stay hidden while a
   * scene shows.
   */
  function syncSceneStatus(scene: SceneV1): void {
    const count = scene.placements.length;
    const lightCount = scene.lights?.length ?? 0;
    const hasMotion = sceneSession?.hasMotion() === true;
    const recorded = isRecordedReplayScene(scene);
    const liveSolved = isLiveSolvedScene(scene);
    const replay = recorded ? sceneSession?.poseReplayStatus() : null;
    const latest = replay?.sample?.latestEvent;
    const replaySuffix = recorded
      ? latest === undefined || latest === null
        ? ' · replay staged'
        : ` · ${replayEventStatusSuffix(latest)}`
      : '';
    statusChip.textContent = `scene · ${String(count)} model${count === 1 ? '' : 's'}`
      + sceneLightingStatusSuffix(lightCount, session.lit)
      + sceneAnimationStatusSuffix(hasMotion, sceneTransport.enabled)
      + (recorded ? ' · consumer replay · read-only' : '')
      + (liveSolved ? ' · live physics · solved in browser' : '')
      + (replay?.playback === 'once' ? ' · one shot' : '')
      + replaySuffix;
    statusChip.title = replay === null || replay === undefined
      ? ''
      : `${replay.provenance.solver.name} ${replay.provenance.solver.version}; `
        + `input ${replay.provenance.inputHash}; final ${replay.provenance.finalHash}`
        + (latest === undefined || latest === null ? '' : `; ${replayEventEvidence(latest)}`);
  }

  function syncSceneStageHint(scene: SceneV1): void {
    const replayReadOnly = isSelfPosedScene(scene);
    const lightCount = scene.lights?.length ?? 0;
    const hasMotion = sceneSession?.hasMotion() === true;
    // In Interact the left button belongs to the live solver, so the hint
    // teaches the solver's affordances instead of selection or scrubbing.
    const normalHint = liveInteract.handlesPointer()
      ? (LIVE_PHYSICS_PROFILES_V1[scene.id]?.spawn === undefined
        ? interactStageHint
        : interactSpawnStageHint)
      : replayReadOnly ? replaySceneStageHint : sceneStageHint;
    const lightingHint = sceneLightingStageHint(
      sceneAnnotationModeOn ? sceneAnnotationStageHint : normalHint,
      lightCount,
      session.lit,
    );
    syncStageKeyboardShortcuts(true, hasMotion);
    stageHint.textContent = sceneAnimationStageHint(
      lightingHint,
      hasMotion,
      sceneTransport.enabled,
    );
  }

  // ---- scene surface conflicts ----
  // Cached per scene object (a commit replaces the object, so an edit is a
  // fresh entry while reopening any unchanged scene is instant), and computed
  // off the open/edit path. The first look at a heavy recorded scene still
  // pays the check once — a few seconds after the scene presents, the stage
  // pauses one long frame while it runs — and every later visit reads the
  // cache. The WeakMap lets dropped scene objects and their reports go
  // together.
  const sceneConflictReports = new WeakMap<SceneV1, readonly string[]>();
  let sceneConflictToken = 0;
  let sceneConflictTimer: number | null = null;
  function sceneReplayOf(scene: SceneV1): ScenePoseReplayV1OrV2 | null {
    return scene.schemaVersion === VOXEL_SCENE_SCHEMA_V4
      ? catalog.scenePoseReplays?.[scene.poseReplay.id] ?? null
      : null;
  }
  function presentSceneConflicts(lines: readonly string[]): void {
    if (lines.length === 0) {
      sceneConflictLine.hidden = true;
      sceneConflictLine.textContent = '';
      return;
    }
    sceneConflictLine.hidden = false;
    sceneConflictLine.dataset.tone = 'bad';
    const shown = lines.slice(0, 3);
    const more = lines.length - shown.length;
    sceneConflictLine.textContent = `⚠ ${String(lines.length)} surface conflict`
      + `${lines.length === 1 ? '' : 's'}: ${shown.join('; ')}`
      + (more > 0 ? `; and ${String(more)} more` : '');
  }
  function syncSceneConflicts(scene: SceneV1): void {
    const cached = sceneConflictReports.get(scene);
    if (cached) {
      presentSceneConflicts(cached);
      return;
    }
    sceneConflictLine.hidden = false;
    sceneConflictLine.dataset.tone = 'idle';
    sceneConflictLine.textContent = 'Checking surfaces…';
    const token = ++sceneConflictToken;
    sceneConflictTimer = window.setTimeout(() => {
      sceneConflictTimer = null;
      if (disposed || token !== sceneConflictToken || sceneOpen !== scene) return;
      let lines: readonly string[];
      try {
        lines = sceneSurfaceConflictsV1(scene, sceneReplayOf(scene), sceneRecipes, sceneParts);
      } catch (checkFailure) {
        // The check failing is itself a finding the owner must see — a quiet
        // line here would read as a clean scene.
        lines = [`the surface check itself failed: ${
          checkFailure instanceof Error ? checkFailure.message : String(checkFailure)
        }`];
      }
      sceneConflictReports.set(scene, lines);
      presentSceneConflicts(lines);
    }, 0);
  }

  function refreshScene(scene: SceneV1): void {
    // Moment notes belong to the underlying model. Clear their stage marks as
    // well as hiding their timeline dots so neither layer can seek or annotate
    // a scene with stale model-only state.
    marks.replaceChildren();
    const count = scene.placements.length;
    const lightCount = scene.lights?.length ?? 0;
    const hasMotion = sceneSession?.hasMotion() === true;
    playerBar.setSceneMode(true, hasMotion);
    const replayReadOnly = isSelfPosedScene(scene);
    if (replayReadOnly) {
      selectedPlacementId = null;
      sceneEditor.clearLightSelection();
    }
    modelName.textContent = scene.label;
    syncSceneStatus(scene);
    lookSwitch.dataset.side = session.edges ? 'left' : 'right';
    lookSwitch.setAttribute('aria-checked', String(session.edges));
    edgesSide.classList.toggle('on', session.edges);
    gameSide.classList.toggle('on', !session.edges);
    depthToggle.classList.toggle('on', depthOn);
    lightingControl.sync(session.lit, lightCount);
    sceneAnimationControl.sync(sceneTransport.enabled);
    sceneAnimationToggle.hidden = !hasMotion;
    // A scene has no one model, so the model-only tools step aside, and the
    // scene-only snap toggle steps in.
    wireframeToggle.hidden = true;
    gridToggle.hidden = true;
    physToggle.hidden = true;
    snapToggle.hidden = replayReadOnly;
    snapToggle.classList.toggle('on', snapOn);
    syncSceneStageHint(scene);
    wireframeView.setVisible(false);
    physicalView.setVisible(false);
    // The scene stands on its own ground grid, sized to how far it spreads.
    gridView.setSegments(sceneReferenceGridSegmentsV1(scene));
    gridView.setVisible(true);
    // A selection whose placement is gone (removed, or a different scene) is
    // dropped, so the outline and the editor's controls never point at nothing.
    if (selectedPlacementId !== null
      && !scene.placements.some((placement) => placement.id === selectedPlacementId)) {
      selectedPlacementId = null;
    }
    // The highlight is reused to outline the selected placement, if any.
    recomputeSceneBoxes();
    showSelection();
    // The examine pane carries the scene's own readout — what it is and which
    // models stand in it — not a single model's motion or checks.
    const counts = new Map<string, number>();
    for (const placement of scene.placements) {
      counts.set(placement.model, (counts.get(placement.model) ?? 0) + 1);
    }
    motionText.textContent = scene.summary ?? `A scene of ${String(count)} models.`;
    modelLine.textContent = [...counts.entries()]
      .map(([id, n]) => {
        const label = modelLabelWorkspace.label(
          Object.hasOwn(sceneRecipes, id) ? sceneRecipes[id]!.id : id,
          sceneRecipes[id]?.label ?? id,
        );
        return n === 1 ? label : `${label} ×${String(n)}`;
      })
      .join(' · ');
    syncSceneConflicts(scene);
    engineWarning.hidden = true;
    checkRow.hidden = true;
    sizeField.hidden = true;
    verdict.dataset.tone = 'idle';
    verdict.textContent = '';
    sheetImage.hidden = true;
    shelfPanel.rebuild();
    viewChip.textContent = describeOrbit(orbit);
    // The model-only tabs show the scene's own content, and the top-bar commands
    // that make or note a single model step aside.
    setInspectorSceneMode(true);
    sceneEditor.element.hidden = replayReadOnly;
    // Both are read-only; only one of them is a recording.
    const recordedScene = isRecordedReplayScene(scene);
    sceneReplayReadOnlyNote.hidden = !recordedScene;
    sceneLiveReadOnlyNote.hidden = !(replayReadOnly && !recordedScene);
    if (!replayReadOnly) sceneEditor.render(scene, selectedPlacementId);
    sceneNotesPanel?.render(scene.id);
    newButton.hidden = true;
    copyButton.hidden = true;
    requestShortcut.textContent = 'Review request…';
    requestShortcut.hidden = !supportsNotes;
  }

  // ---- refresh ----
  function refresh(): void {
    libraryDetails.refresh();
    if (sceneOpen) { refreshScene(sceneOpen); return; }
    sceneConflictLine.hidden = true;
    // Returning from a scene un-hides the model-only toggles, checks, size
    // control, tab content, and top-bar commands a scene hid, and re-hides the
    // scene-only snap toggle.
    wireframeToggle.hidden = false;
    gridToggle.hidden = false;
    sceneAnimationToggle.hidden = true;
    snapToggle.hidden = true;
    stageHint.textContent = modelStageHint;
    syncStageKeyboardShortcuts(true);
    checkRow.hidden = false;
    sizeField.hidden = false;
    setInspectorSceneMode(false);
    newButton.hidden = !supportsEdit;
    copyButton.hidden = !supportsEdit;
    requestShortcut.textContent = 'Send request';
    requestShortcut.hidden = !supportsNotes;
    const model = harness.model();
    const described = harness.describe();
    // The step list belongs to whichever model is open, so opening another
    // one from the shelf must not leave the previous model's steps sitting
    // there looking current.
    construction.refresh();
    playerBar.setSceneMode(false);
    playerBar.applyPeriod(model.motion.periodMs);
    playerBar.syncPlayButton();
    modelName.textContent = modelLabelWorkspace.label(model.id, described.label);
    statusChip.textContent = described.state === 'running'
      ? 'drawing normally'
      : `engine reports "${described.state}"`;
    motionText.textContent = describeMotion(model.motion);
    modelLine.textContent =
      `${described.size.join('×')} · ${String(described.filledVoxels)} cubes · `
      + `${String(described.paletteEntries - 1)} colours`;
    engineWarning.hidden = described.state === 'running';
    engineWarning.dataset.tone = 'bad';
    engineWarning.textContent = `Something is wrong underneath: the engine reports "${described.state}".`;
    motionPanel.syncFromModel(model);
    lookSwitch.dataset.side = session.edges ? 'left' : 'right';
    lookSwitch.setAttribute('aria-checked', String(session.edges));
    edgesSide.classList.toggle('on', session.edges);
    gameSide.classList.toggle('on', !session.edges);
    depthToggle.classList.toggle('on', depthOn);
    lightingControl.sync(session.lit, 0);
    // The wireframe follows the open model: its lines are recomputed while it
    // is on, and cleared on the next draw once it is off. Computed only when
    // shown, so the solid path pays nothing for it.
    if (session.wireframe) wireframeView.setSegments(modelWireframeSegmentsV1(harness.model()));
    wireframeView.setVisible(session.wireframe);
    wireframeToggle.classList.toggle('on', session.wireframe);
    // The part highlight follows the chosen part; the construction panel reads
    // the index back for its selected row when it rebuilds.
    syncHighlightOverlay();
    // The ground grid follows the open model's footprint and grain.
    gridView.setSegments(gridOn ? referenceGridSegmentsV1(harness.model()) : []);
    gridView.setVisible(gridOn);
    gridToggle.classList.toggle('on', gridOn);
    // The size control shows the model's grain and its world dimensions.
    sizeSlider.value = String(voxelSizeToSlider(session.voxelSize));
    sizeReadout.textContent = describeVoxelSize(session.voxelSize, described.size);
    // The outlines follow the open model: present only where its recipe
    // carries physical data, and never left on from a previous model.
    physicalView.setSegments(harness.physicalShapes());
    physToggle.hidden = !physicalView.hasContent();
    if (physicalOn && !physicalView.hasContent()) physicalOn = false;
    physicalView.setVisible(physicalOn);
    physToggle.classList.toggle('on', physicalOn);
    viewChip.textContent = describeOrbit(orbit);
    editor.rebuild();
    shelfPanel.rebuild();
    playerBar.renderDots();
    sheetImage.hidden = true;
    verdict.dataset.tone = 'idle';
    verdict.textContent = '';
    drawFrame(Math.min(lastShownMs, Math.max(player.periodMs - 1, 0)));
  }

  // ---- wiring: stage ----
  // Left button: in a scene, pick the model under the cursor and drag it across
  // the ground; in model mode, turn the view, and a clean click pins a note.
  // Middle button turns the view; right button pans it; wheel zooms.
  function recomputeSceneBoxes(): void {
    sceneBoxes = sceneOpen !== null && !isSelfPosedScene(sceneOpen)
      ? placementWorldBoxesV1(sceneOpen, sceneRecipes, sceneParts)
      : [];
  }
  function showSelection(): void {
    const box = sceneBoxes.find((candidate) => candidate.id === selectedPlacementId);
    if (box) {
      highlightView.setSegments(boxEdgesV1(box));
      highlightView.setVisible(true);
    } else {
      highlightView.setVisible(false);
    }
  }
  /**
   * The one place selection changes. Both the stage (a click on a model) and the
   * editor list (a click on a row) call this, so the outline and the editor's
   * move/turn/remove controls always follow the same pick — selecting a second
   * model moves the controls to it instead of leaving them on the first. It
   * refreshes only what selection touches (the outline, the editor list, the
   * frame), not the whole inspector.
   */
  function selectPlacement(id: string | null): void {
    sceneEditor.clearLightSelection();
    if (sceneOpen !== null && isSelfPosedScene(sceneOpen)) {
      selectedPlacementId = null;
      showSelection();
      if (id !== null) {
        throw replaySceneEditError(
          sceneOpen,
          `selecting authored placement '${id}'`,
        );
      }
      return;
    }
    if (id === selectedPlacementId) return;
    selectedPlacementId = id;
    showSelection();
    if (sceneOpen) sceneEditor.render(sceneOpen, selectedPlacementId);
    drawFrame(lastShownMs);
  }
  // The world-space ray under the cursor, as plain numbers the scene-pick
  // helpers work in — so the picking and ground maths stay testable off-GPU.
  function cursorRay(event: PointerEvent): RayV1 {
    const rect = canvasWrap.getBoundingClientRect();
    const ndc = new Vector2(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    );
    sceneRaycaster.setFromCamera(ndc, camera);
    const { origin, direction } = sceneRaycaster.ray;
    return { origin: [origin.x, origin.y, origin.z], direction: [direction.x, direction.y, direction.z] };
  }
  const groundPoint = (event: PointerEvent, groundY: number): { readonly x: number; readonly z: number } | null =>
    groundHitV1(cursorRay(event), groundY);
  const pickPlacement = (event: PointerEvent): string | null =>
    pickPlacementV1(cursorRay(event), sceneBoxes);
  // Adopts an edited scene and redraws, without touching history — used for the
  // live frames of a drag and by undo/redo.
  function applySceneLive(next: SceneV1): void {
    const previous = sceneOpen;
    const activeSession = sceneSession;
    if (previous === null || activeSession === null) {
      throw new Error(
        `Scene '${next.id}' cannot be edited because no rendered scene is open; open it before editing.`,
      );
    }
    if (isSelfPosedScene(previous) || isSelfPosedScene(next)) {
      const replayScene = previous.schemaVersion === VOXEL_SCENE_SCHEMA_V4 ? previous : next;
      throw replaySceneEditError(
        replayScene,
        `editing it as scene '${next.id}'`,
      );
    }
    const previousHadMotion = activeSession.hasMotion();
    const previousOrbit = orbit;
    const previousPanCenter = panCenter;
    const candidateView = clampSceneViewV1(
      orbit,
      panCenter,
    );
    orbit = candidateView.orbit;
    panCenter = candidateView.center;
    // Publish only after the complete candidate has clustered and rendered at
    // the current time. In particular, the 33rd overlapping light must not
    // leave new runtime state paired with an old undo stack.
    try {
      activeSession.setScene(next);
      drawFrame(lastShownMs);
    } catch (presentationFailure) {
      orbit = previousOrbit;
      panCenter = previousPanCenter;
      try {
        activeSession.setScene(previous);
        drawFrame(lastShownMs);
      } catch (restoreFailure) {
        throw new AggregateError(
          [presentationFailure, restoreFailure],
          `Scene '${next.id}' could not be presented, and the prior scene '${previous.id}' could not be `
          + 'restored. Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      const reason = presentationFailure instanceof Error
        ? presentationFailure.message
        : String(presentationFailure);
      throw new Error(
        `Scene '${next.id}' could not be presented at ${String(lastShownMs)} ms, so it was not saved or `
        + `added to undo history; the prior scene remains active. ${reason}`,
        { cause: presentationFailure },
      );
    }
    try {
      sceneWorkspace.replace(previous.id, next);
    } catch (workspaceFailure) {
      orbit = previousOrbit;
      panCenter = previousPanCenter;
      try {
        activeSession.setScene(previous);
        drawFrame(lastShownMs);
      } catch (restoreFailure) {
        throw new AggregateError(
          [workspaceFailure, restoreFailure],
          `Scene '${next.id}' was accepted for rendering, but its workspace update failed and the prior `
          + 'rendered scene could not be restored. Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      throw workspaceFailure;
    }
    sceneOpen = next;
    sceneAnnotationFingerprintCache = null;
    recomputeSceneBoxes();
    showSelection();
    syncSceneTransport(next, previousHadMotion);
    // Light edits can reduce cluster pressure, so an unchanged DOM size that
    // failed under the old light set is eligible for one fresh attempt.
    rejectedAutoResize = null;
    // The candidate frame above intentionally drew before publication. Project
    // the newly published boxes now so a moved, removed, undone, or redone
    // placement cannot leave the previous outline pooled on screen.
    drawSceneOverlays();
  }
  function pushHistory(previous: SceneV1): void {
    sceneUndo.push(previous);
    if (sceneUndo.length > MAX_SCENE_HISTORY) sceneUndo.shift();
    sceneRedo.length = 0;
  }
  function commitSceneEdit(next: SceneV1): void {
    if (sceneOpen === null) return;
    const previous = sceneOpen;
    applySceneLive(next);
    pushHistory(previous);
    refresh();
  }
  function undoScene(): void {
    // Guard before the pop, so a stray call in model mode can never discard a
    // history entry it would then refuse to apply.
    if (sceneOpen === null) return;
    const previous = sceneUndo.at(-1);
    if (previous === undefined) return;
    const current = sceneOpen;
    applySceneLive(previous);
    sceneUndo.pop();
    sceneRedo.push(current);
    refresh();
  }
  function redoScene(): void {
    if (sceneOpen === null) return;
    const next = sceneRedo.at(-1);
    if (next === undefined) return;
    const current = sceneOpen;
    applySceneLive(next);
    sceneRedo.pop();
    sceneUndo.push(current);
    refresh();
  }
  // Sets the selected placement's world x and z (its base y is unchanged), live.
  function setSelectedAt(x: number, z: number): void {
    if (sceneOpen === null || selectedPlacementId === null) return;
    applySceneLive({
      ...sceneOpen,
      placements: sceneOpen.placements.map((placement) => (placement.id === selectedPlacementId
        ? { ...placement, at: [x, placement.at[1], z] }
        : placement)),
    });
  }

  type StageGesture = 'none' | 'orbit' | 'pan' | 'move' | 'annotate' | 'live';
  let gesture: StageGesture = 'none';
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  // A live drag of a scene model: the plane it slides on (its footprint's base
  // y), the grab offset that keeps the grabbed point under the cursor, and the
  // footprint's corner offset from the model's base — so snap lands the
  // footprint, not the base, on whole cells. `dragPushed` records whether this
  // drag's one undo step is banked yet.
  let dragGrab: {
    readonly baseY: number;
    readonly offX: number;
    readonly offZ: number;
    readonly cornerX: number;
    readonly cornerZ: number;
  } | null = null;
  let dragPushed = false;
  interface ModelNoteClickIntent {
    readonly modelId: string;
    readonly timeMs: number;
    readonly u: number;
    readonly v: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly clickedAtNowMs: number;
    pausedPlayback: boolean;
  }
  let cleanModelClick: ModelNoteClickIntent | null = null;
  let pendingModelNoteClick: ModelNoteClickIntent | null = null;
  let openedModelNoteClick: ModelNoteClickIntent | null = null;
  let modelNoteClickTimer: number | null = null;
  const cancelPendingModelNoteClick = (): void => {
    if (modelNoteClickTimer !== null) window.clearTimeout(modelNoteClickTimer);
    modelNoteClickTimer = null;
    pendingModelNoteClick = null;
  };
  const sceneAnnotationGesture = createStudioSceneAnnotationGestureV1({
    readIntent(event) {
      if (sceneOpen === null || !sceneAnnotationModeOn) return null;
      const movement = keyboard.movement();
      if (movement.forward !== 0 || movement.right !== 0) return null;
      const context = sceneAnnotationContext();
      const rect = canvasWrap.getBoundingClientRect();
      return {
        previous: {
          timeMs: lastShownMs,
          enabled: sceneTransport.enabled,
          playing: player.playing,
          annotationMode: sceneAnnotationModeOn,
        },
        hasMotion: sceneSession?.hasMotion() === true,
        capture: {
          sceneFingerprint: context.sceneFingerprint,
          spot: {
            u: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            v: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
          },
          timeMs: context.timeMs,
          orbit: { ...context.orbit },
          panCenter: [...context.panCenter],
          depth: context.depth,
          lit: context.lit,
          edges: context.edges,
          selectedPlacementId: context.selectedPlacementId,
          viewport: { ...context.viewport },
          ...(context.replay === undefined ? {} : { replay: { ...context.replay } }),
        },
      };
    },
    freezeAt(timeMs) {
      sceneTransport.freezeExact(timeMs);
      playerBar.syncPlayButton();
    },
    beginCapture(capture) {
      return sceneNotesPanel.beginCapture(capture);
    },
    restorePlayback(previous, hasMotion) {
      sceneTransport.setEnabled(previous.enabled, previous.timeMs, hasMotion);
      if (!previous.playing) sceneTransport.freezeExact(previous.timeMs);
      playerBar.syncPlayButton();
    },
    restoreAnnotationMode: setSceneAnnotationMode,
    reportFailure: showViewError,
  });
  // The browser's own context menu would swallow a right-drag pan.
  canvasWrap.addEventListener('contextmenu', (event) => { event.preventDefault(); });
  canvasWrap.addEventListener('pointerdown', (event) => {
    cancelPendingModelNoteClick();
    cleanModelClick = null;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvasWrap.setPointerCapture(event.pointerId);
    if (sceneOpen !== null && sceneNotesPanel.editorOpen) {
      event.preventDefault();
      gesture = 'none';
      return;
    }
    if (event.button === 1) { gesture = 'orbit'; return; }
    if (event.button === 2) { gesture = 'pan'; return; }
    if (event.button !== 0) { gesture = 'none'; return; }
    if (!sceneOpen) { gesture = 'orbit'; return; }
    if (sceneNotesPanel.editorOpen) { gesture = 'none'; return; }
    if (sceneAnnotationModeOn) {
      gesture = sceneAnnotationGesture.prepare(event) ? 'annotate' : 'none';
      return;
    }
    // In Interact mode the left button belongs to the live solver: a hit on a
    // dynamic body starts a spring grab, and a miss falls back to orbiting so
    // the camera never dies. A clean click may still spawn on pointer-up.
    if (liveInteract.handlesPointer()) {
      gesture = liveInteract.pointerDown(cursorRay(event)) ? 'live' : 'orbit';
      return;
    }
    // Replayed transforms are presented observations, while authored placement
    // boxes describe only the trace's static source. Picking or moving those
    // boxes would select stale geometry, so every left drag remains a camera
    // orbit in this read-only view.
    if (isSelfPosedScene(sceneOpen)) { gesture = 'orbit'; return; }
    // Left in a scene selects the model under the cursor and starts dragging it.
    const picked = pickPlacement(event);
    selectPlacement(picked);
    if (picked === null) { gesture = 'none'; return; }
    const box = sceneBoxes.find((candidate) => candidate.id === picked);
    const placement = sceneOpen.placements.find((entry) => entry.id === picked);
    const hit = groundPoint(event, box ? box.min[1] : 0);
    if (!box || !placement || !hit) { gesture = 'none'; return; }
    dragGrab = {
      baseY: box.min[1],
      offX: placement.at[0] - hit.x,
      offZ: placement.at[2] - hit.z,
      cornerX: box.min[0] - placement.at[0],
      cornerZ: box.min[2] - placement.at[2],
    };
    dragPushed = false;
    gesture = 'move';
  });
  canvasWrap.addEventListener('pointermove', (event) => {
    if (gesture === 'none') return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!moved && Math.hypot(event.clientX - lastX, event.clientY - lastY) < DRAG_THRESHOLD_PIXELS) return;
    moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    if (gesture === 'live') {
      liveInteract.pointerMove(cursorRay(event));
    } else if (gesture === 'orbit') {
      runViewAction(() => { harness.setViewAngles(dragOrbit(orbit, dx, dy)); });
    } else if (gesture === 'pan') {
      runViewAction(() => {
        presentView(orbit, panOrbit(orbit, panCenter, dx, dy, viewH));
      });
    } else if (dragGrab) {
      const hit = groundPoint(event, dragGrab.baseY);
      if (hit) {
        // Bank the pre-drag scene once, on the first move, so one drag is one
        // undo step — and a drag that never moves banks nothing.
        const previous = dragPushed ? null : sceneOpen;
        let x = hit.x + dragGrab.offX;
        let z = hit.z + dragGrab.offZ;
        if (snapOn) {
          // Land the footprint's corner on a whole cell, not the model's base.
          x = Math.round(x + dragGrab.cornerX) - dragGrab.cornerX;
          z = Math.round(z + dragGrab.cornerZ) - dragGrab.cornerZ;
        }
        setSelectedAt(x, z);
        if (previous !== null) {
          pushHistory(previous);
          dragPushed = true;
        }
      }
    }
  });
  canvasWrap.addEventListener('pointerup', (event) => {
    canvasWrap.releasePointerCapture(event.pointerId);
    const wasDrag = moved;
    const finished = gesture;
    gesture = 'none';
    moved = false;
    dragGrab = null;
    if (finished === 'annotate') {
      if (wasDrag) sceneAnnotationGesture.cancel();
      else sceneAnnotationGesture.finish();
      return;
    }
    // Interact: a grab always releases here; a clean click that grabbed
    // nothing asks the spawner (scenes without one ignore it).
    if (liveInteract.handlesPointer() && (finished === 'live' || !wasDrag)) {
      liveInteract.pointerUp(cursorRay(event), finished !== 'live' && !wasDrag);
      if (finished === 'live') return;
    }
    // A finished drag of a scene model syncs the editor list to its new spot.
    if (finished === 'move') { if (wasDrag) refresh(); return; }
    // A scene has no single model to pin a note against, so a clean click on
    // one only ever selected — never pins.
    if (wasDrag || !supportsNotes || sceneOpen) return;
    const heldMovement = keyboard.movement();
    if (heldMovement.forward !== 0 || heldMovement.right !== 0) return;
    const rect = canvasWrap.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    const clickedAtNowMs = performance.now();
    cleanModelClick = {
      modelId: session.model.id,
      timeMs: player.timeAt(clickedAtNowMs),
      u,
      v,
      clientX: event.clientX,
      clientY: event.clientY,
      clickedAtNowMs,
      pausedPlayback: false,
    };
  });
  canvasWrap.addEventListener('pointercancel', () => {
    if (gesture === 'annotate') sceneAnnotationGesture.cancel();
    gesture = 'none';
    moved = false;
    dragGrab = null;
  });
  canvasWrap.addEventListener('click', (event) => {
    const intent = cleanModelClick;
    cleanModelClick = null;
    // Click, unlike pointerup, carries the browser's actual sequence count.
    // Detail 1 begins a new gesture and invalidates any old unwind marker;
    // detail 2 may be the one continuation of the click that opened a note.
    if (event.detail !== 1) return;
    openedModelNoteClick = null;
    if (intent === null) return;
    // Delay the usual single-click action to avoid editor flash during an
    // ordinary double-click. The dblclick handler below also unwinds an editor
    // that already opened when the host uses a longer click interval.
    pendingModelNoteClick = intent;
    modelNoteClickTimer = window.setTimeout(() => {
      modelNoteClickTimer = null;
      if (pendingModelNoteClick !== intent) return;
      pendingModelNoteClick = null;
      if (disposed || sceneOpen !== null || session.model.id !== intent.modelId) return;
      if (player.playing) {
        intent.pausedPlayback = true;
        harness.pause();
        harness.seek(intent.timeMs);
        playerBar.syncPlayButton();
      }
      openedModelNoteClick = intent;
      state.pending = { kind: 'moment', timeMs: intent.timeMs, u: intent.u, v: intent.v };
      positionRings();
      notesPanel.openNoteEditor(
        `Pinned at ${String(Math.round(intent.timeMs))} ms — say what you see…`,
      );
    }, MODEL_NOTE_CLICK_DELAY_MS);
  });
  canvasWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (sceneOpen !== null && sceneNotesPanel.editorOpen) return;
    runViewAction(() => { harness.setViewAngles(zoomOrbit(orbit, Math.sign(event.deltaY))); });
  }, { passive: false });
  canvasWrap.addEventListener('dblclick', (event) => {
    // Re-centring frames one model: the default orbit and the world origin say
    // nothing about a scene, so snapping there discards the view its owner
    // built. No scene stage hint offers the gesture, in any kind of scene.
    if (sceneOpen !== null) {
      event.preventDefault();
      return;
    }
    cancelPendingModelNoteClick();
    const openedIntent = openedModelNoteClick;
    openedModelNoteClick = null;
    const pendingMoment = state.pending?.kind === 'moment' ? state.pending : null;
    const sameClickPosition = openedIntent !== null
      && Math.hypot(
        event.clientX - openedIntent.clientX,
        event.clientY - openedIntent.clientY,
      ) <= 8;
    const matchingOpenIntent = openedIntent !== null
      && event.detail === 2
      && sameClickPosition
      && session.model.id === openedIntent.modelId
      && pendingMoment?.timeMs === openedIntent.timeMs
      && pendingMoment.u === openedIntent.u
      && pendingMoment.v === openedIntent.v;
    clearViewError();
    let playbackRestoreFailure: unknown = null;
    if (matchingOpenIntent) {
      if (openedIntent.pausedPlayback && player.periodMs > 0) {
        const restoreNowMs = performance.now();
        const elapsedMs = Math.max(0, restoreNowMs - openedIntent.clickedAtNowMs);
        const uninterruptedTimeMs = Math.min(
          Math.max(
            0,
            Math.round(
              (openedIntent.timeMs + elapsedMs * player.speed) % player.periodMs,
            ),
          ),
          player.periodMs - 1,
        );
        try {
          // Prove the candidate frame before mutating the paused clock or
          // discarding the note. Anchoring both clock operations to the same
          // captured time also includes synchronous render time exactly once.
          drawFrame(uninterruptedTimeMs);
          player.seek(uninterruptedTimeMs, restoreNowMs);
          player.play(restoreNowMs);
        } catch (error) {
          playbackRestoreFailure = error;
        }
      }
      if (playbackRestoreFailure === null) {
        notesPanel.closeNoteEditor();
        playerBar.syncPlayButton();
      }
    }
    let recenterFailure: unknown = null;
    try {
      presentView(DEFAULT_ORBIT, [0, 0, 0]);
    } catch (error) {
      recenterFailure = error;
    }
    if (playbackRestoreFailure !== null && recenterFailure !== null) {
      showViewError(
        new AggregateError(
          [playbackRestoreFailure, recenterFailure],
          'The double-click could neither resume uninterrupted model playback nor re-centre the '
          + 'camera. The note and pinned playback time remain active; reload this Studio if the '
          + 'view does not recover.',
          { cause: recenterFailure },
        ),
        'The double-click failed; the note and prior view remain active.',
      );
    } else if (playbackRestoreFailure !== null) {
      const reason = playbackRestoreFailure instanceof Error
        ? playbackRestoreFailure.message
        : 'an unknown non-Error value was thrown while drawing the resumed frame';
      showViewError(
        new Error(
          'The camera re-centred, but uninterrupted playback could not be restored, so the note '
          + `and its pinned playback time remain active. ${reason}`,
          { cause: playbackRestoreFailure },
        ),
        'Playback could not resume; the note and pinned time remain active.',
      );
    } else if (recenterFailure !== null) {
      showViewError(
        recenterFailure,
        'The camera could not re-centre; its prior view remains active.',
      );
    }
  });

  lookSwitch.addEventListener('click', () => {
    runViewAction(() => { harness.setEdges(!session.edges); });
  });
  depthToggle.addEventListener('click', () => {
    runViewAction(() => { setDepth(!depthOn); });
  });
  lightToggle.addEventListener('click', () => {
    runViewAction(() => { harness.setLit(!session.lit); });
  });
  sceneAnimationToggle.addEventListener('click', () => {
    runViewAction(() => { harness.setSceneAnimation(!sceneTransport.enabled); });
  });
  wireframeToggle.addEventListener('click', () => { harness.setWireframe(!session.wireframe); });
  gridToggle.addEventListener('click', () => { setGridOn(!gridOn); });
  physToggle.addEventListener('click', () => { harness.setPhysicalOverlay(!physicalOn); });
  snapToggle.addEventListener('click', () => { setSnapToGrid(!snapOn); });
  sizeSlider.addEventListener('input', () => {
    // Set the grain, then re-fit so the model stays framed at any size — the
    // ground grid, not the model's screen size, is what shows the scale.
    harness.setVoxelSize(sliderToVoxelSize(sizeSlider.valueAsNumber));
    refitView();
    drawFrame(lastShownMs);
  });

  /** Shows or hides the ground grid; refresh redraws it and marks the toggle. */
  function setGridOn(on: boolean): void {
    gridOn = on;
    persistView();
    refresh();
  }

  /**
   * Turns snap-to-grid on or off, the one funnel the toggle button and the
   * harness both use, so the flag and the button stay in step. A live drag
   * reads the flag on each move, so nothing else needs to redraw here.
   */
  function setSnapToGrid(on: boolean): boolean {
    if (sceneOpen !== null && isSelfPosedScene(sceneOpen)) {
      throw replaySceneEditError(
        sceneOpen,
        `turning snap to grid ${on ? 'on' : 'off'}`,
      );
    }
    snapOn = on;
    snapToggle.classList.toggle('on', snapOn);
    return snapOn;
  }

  /** Frames the open model at its current grain, so scaling never buries or crops it. */
  function refitView(): void {
    orbit = clampOrbit({ ...orbit, viewHeight: fitViewHeight(session.model.size, session.voxelSize) });
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
    viewChip.textContent = describeOrbit(orbit);
  }

  /**
   * Shows or hides the physical outlines. They can only show over a model
   * whose shelf recipe carries physical data; the harness enforces that by
   * only ever asking for what is available.
   */
  function setPhysicalOverlayOn(on: boolean): boolean {
    physicalOn = on && physicalView.hasContent();
    physicalView.setVisible(physicalOn);
    physToggle.classList.toggle('on', physicalOn);
    drawFrame(lastShownMs);
    return physicalOn;
  }

  /** Rebuilds the highlight outline from the chosen part, or clears it. Shared
   * by refresh (model changes) and the setter (a click), so both stay in step. */
  function syncHighlightOverlay(): void {
    if (highlightedPartIndex !== null) {
      const cells = harness.partCells()[highlightedPartIndex];
      if (cells === undefined) highlightedPartIndex = null;
      else highlightView.setSegments(cellSubsetOutlineSegmentsV1(harness.model(), new Set(cells)));
    }
    highlightView.setVisible(highlightedPartIndex !== null);
  }

  /**
   * Lights up a top-level part where it sits in the model. The index is into
   * the parts list; a null or out-of-range index clears the highlight rather
   * than claiming a selection that outlines nothing.
   *
   * It updates just the outline, the picture, and the list's selected row —
   * not a full refresh — so clicking a part with children lights it without
   * the parts list rebuilding out from under the browser's own expand toggle.
   */
  function setHighlightedPart(index: number | null): void {
    highlightedPartIndex = index !== null && harness.partCells()[index] !== undefined ? index : null;
    syncHighlightOverlay();
    construction.syncHighlight();
    drawFrame(lastShownMs);
  }

  /** Swaps the borrowed camera without rebuilding either WebGL renderer. */
  function setDepth(on: boolean): boolean {
    if (on === depthOn) return depthOn;
    const previousCamera = camera;
    const nextCamera = on ? depthCamera : flatCamera;
    const candidateView = clampSceneViewV1(orbit, panCenter);
    applyOrbit(nextCamera, candidateView.orbit, viewW, viewH, candidateView.center);
    try {
      session.setCamera(nextCamera);
      sceneSession?.setCamera(nextCamera);
      if (sceneOpen !== null && sceneSession !== null) {
        sceneSession.showAt(lastShownMs);
      } else {
        session.showAt(lastShownMs);
      }
    } catch (swapFailure) {
      try {
        session.setCamera(previousCamera);
        sceneSession?.setCamera(previousCamera);
        applyOrbit(previousCamera, orbit, viewW, viewH, panCenter);
        if (sceneOpen !== null && sceneSession !== null) {
          sceneSession.showAt(lastShownMs);
        } else {
          session.showAt(lastShownMs);
        }
      } catch (restoreFailure) {
        throw new AggregateError(
          [swapFailure, restoreFailure],
          'The Studio could not switch camera modes, and restoring the prior camera also failed. '
          + 'Reload this Studio before continuing.',
          { cause: restoreFailure },
        );
      }
      throw new Error(
        `The Studio could not present the ${on ? 'perspective' : 'orthographic'} camera, so the prior `
        + 'camera remains active and stored preferences were not changed.',
        { cause: swapFailure },
      );
    }
    depthOn = on;
    camera = nextCamera;
    orbit = candidateView.orbit;
    panCenter = candidateView.center;
    rejectedAutoResize = null;
    refresh();
    if (sceneOpen !== null) drawSceneOverlays();
    persistView();
    return depthOn;
  }

  // ---- wiring: examine ----
  sweepButton.addEventListener('click', () => {
    const summary = harness.sweep({ samplesPerPeriod: SWEEP_SAMPLES });
    verdict.dataset.tone = summary.ok ? 'ok' : 'bad';
    verdict.textContent = summary.ok
      ? `The movement is steady: ${String(summary.frameCount)} frames checked, `
        + `${String(summary.distinctFrames)} different poses, and it repeats exactly.`
      : summary.issues.map((issue) => issue.message).join(' ');
    drawFrame(lastShownMs);
  });
  sheetButton.addEventListener('click', () => {
    void (async () => {
      const sheet = await harness.spriteSheet({ samplesPerPeriod: SWEEP_SAMPLES });
      sheetImage.src = sheet.dataUrl;
      sheetImage.hidden = false;
    })();
  });

  const keyboard = createStudioKeyboard({
    root,
    sceneOpen: () => sceneOpen !== null,
    noteEditorOpen: () => sceneOpen !== null
      ? sceneAnnotationModeOn || sceneNotesPanel.editorOpen
      : Boolean(state.pending ?? state.armedForPlace),
    closeNoteEditor: () => {
      if (sceneOpen !== null) sceneNotesPanel.cancelCapture();
      else notesPanel.closeNoteEditor();
    },
    onMovementStart: cancelPendingModelNoteClick,
    undoScene,
    redoScene,
    sceneHasMotion: () => sceneOpen !== null && sceneSession?.hasMotion() === true,
    toggleScenePlayback: () => {
      if (player.playing) harness.pause(); else harness.play();
      playerBar.syncPlayButton();
    },
    step: (direction) => { harness.step(direction); playerBar.syncPlayButton(); },
  });
  // Registered with the other globals at the end of the mount, after nothing
  // can fail anymore, so a refused mount leaves the document untouched.

  // ---- assembly ----
  const grow = element('span', 'grow');

  const examinePane = element('div', 'pane');
  const checkRow = element('div', 'row');
  checkRow.append(sweepButton, sheetButton);
  examinePane.append(
    libraryDetails.element,
    motionText,
    modelLine,
    sceneConflictLine,
    sizeField,
    engineWarning,
    checkRow,
    verdict,
    sheetImage,
  );

  const shellOptions: ModelStudioShellOptionsV2 = {
    beforeSelect: (name) => {
      // Leaving Build puts the finished model back, so no other tab can ever
      // inspect or edit a half-built preview.
      if (name !== 'build') construction.leave();
      if (name === 'build') construction.refresh();
    },
  };
  let construction: ConstructionPanelV1;
  let studioShell: ModelStudioShellHandleV1 | ModelStudioShellHandleV2;
  const hasStudioTab = (name: ModelStudioTabId): boolean =>
    'hasTab' in studioShell ? studioShell.hasTab(name) : true;
  const studioPanel = (name: ModelStudioTabId): HTMLElement =>
    'panel' in studioShell ? studioShell.panel(name) : studioShell.panels[name];
  function showTab(name: ModelStudioTabId): void {
    studioShell.selectTab(hasStudioTab(name) ? name : 'examine');
  }
  let sceneAnnotationDraftStageCssSize: { readonly width: number; readonly height: number } | null = null;
  let sceneAnnotationDraftPresentationLock: StudioPresentationLockV1 | null = null;
  function draftPresentationLock(): StudioPresentationLockV1 {
    sceneAnnotationDraftPresentationLock ??= createStudioPresentationLockV1({
      classTarget: canvasWrap,
      className: 'scene-annotation-draft-locked',
      inertTargets: [
        studioShell.regions.top,
        studioShell.regions.shelf,
        studioShell.regions.player,
        ...Array.from(studioShell.root.querySelectorAll<HTMLElement>('.col-resize')),
      ],
      disabledTargets: [
        lookSwitch,
        depthToggle,
        lightToggle,
        sceneAnimationToggle,
        ...Array.from(
          studioShell.regions.inspector.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
        ),
      ],
    });
    return sceneAnnotationDraftPresentationLock;
  }
  function setSceneAnnotationDraftPresentationLocked(locked: boolean): void {
    if (!locked && sceneAnnotationDraftPresentationLock === null) return;
    const changed = draftPresentationLock().set(locked);
    if (locked) {
      stageHint.textContent = sceneAnnotationDraftStageHint;
      syncStageKeyboardShortcuts(false);
      return;
    }
    if (!changed) return;
    sceneAnnotationDraftStageCssSize = null;
    if (sceneOpen !== null) syncSceneStageHint(sceneOpen);
  }

  // The picture fills the stage and follows the window, so zooming meets the
  // window's edge, never an invisible border in the middle of the screen —
  // which is exactly how the owner found it: "top and bottom clip".
  function resizeStage(width: number, height: number): { width: number; height: number } {
    const nextWidth = Math.max(2, Math.floor(width));
    const nextHeight = Math.max(2, Math.floor(height));
    if (nextWidth === viewW && nextHeight === viewH) {
      return { width: canvas.width, height: canvas.height };
    }
    const previousWidth = viewW;
    const previousHeight = viewH;
    viewW = nextWidth;
    viewH = nextHeight;
    try {
      session.resize(nextWidth, nextHeight);
      sceneSession?.resize(nextWidth, nextHeight);
      applyOrbit(camera, orbit, nextWidth, nextHeight, panCenter);
      drawFrame(lastShownMs);
    } catch (resizeFailure) {
      viewW = previousWidth;
      viewH = previousHeight;
      try {
        session.resize(previousWidth, previousHeight);
        sceneSession?.resize(previousWidth, previousHeight);
        applyOrbit(camera, orbit, previousWidth, previousHeight, panCenter);
        drawFrame(lastShownMs);
      } catch (restoreFailure) {
        throw new AggregateError(
          [resizeFailure, restoreFailure],
          `The Studio could not present a ${String(nextWidth)}x${String(nextHeight)} stage, and restoring `
          + `the prior ${String(previousWidth)}x${String(previousHeight)} stage also failed. Reload this Studio.`,
          { cause: restoreFailure },
        );
      }
      const reason = resizeFailure instanceof Error ? resizeFailure.message : String(resizeFailure);
      throw new Error(
        `The Studio could not present a ${String(nextWidth)}x${String(nextHeight)} stage, so the prior `
        + `${String(previousWidth)}x${String(previousHeight)} size remains active. ${reason}`,
        { cause: resizeFailure },
      );
    }
    rejectedAutoResize = null;
    return { width: canvas.width, height: canvas.height };
  }
  // Followed from the frame loop rather than a ResizeObserver: observers never
  // fire in some embedded browsers (measured — a fresh observer on a laid-out
  // element stayed silent), and a follow that only works in some browsers is
  // not a follow. One rectangle read per frame is cheap; resizing only happens
  // on real drift.
  function followStage(): void {
    const rect = studioShell.regions.stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    if (sceneAnnotationDraftPresentationLock?.locked === true) {
      const liveSize = { width: rect.width, height: rect.height };
      if (
        sceneAnnotationDraftStageCssSize?.width !== liveSize.width
        || sceneAnnotationDraftStageCssSize.height !== liveSize.height
      ) {
        sceneAnnotationDraftStageCssSize = liveSize;
        positionSceneAnnotationMarkers();
      }
      return;
    }
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);
    if (width === viewW && height === viewH) {
      rejectedAutoResize = null;
      return;
    }
    if (rejectedAutoResize?.width === width && rejectedAutoResize.height === height) return;
    try {
      resizeStage(width, height);
      rejectedAutoResize = null;
    } catch (error) {
      rejectedAutoResize = { width, height };
      throw error;
    }
  }

  // Held so disposal can stop the loop. A mount that kept drawing after its
  // host tore it down would keep a disposed runtime alive and throw on the
  // next frame, which is exactly the leak the engine refuses to ship.
  let frameHandle = 0;
  let disposed = false;
  let previousFrameNowMs: number | null = null;
  let disposePanelResize: () => void = () => { /* set once the shell mounts */ };

  function pauseAfterFrameFailure(frameFailure: unknown, frameNowMs: number): void {
    const reason = frameFailure instanceof Error ? frameFailure.message : String(frameFailure);
    if (sceneOpen !== null) {
      sceneTransport.pauseAfterFailure(lastShownMs);
      playerBar.syncPlayButton();
      showViewError(
        new Error(
          `Scene '${sceneOpen.id}' paused at its last successfully presented time `
          + `${String(lastShownMs)} ms because a later frame was rejected. ${reason}`,
          { cause: frameFailure },
        ),
        'The scene simulation paused because a frame failed; the last successful frame remains visible.',
      );
      return;
    }
    player.pause(frameNowMs);
    playerBar.syncPlayButton();
    showViewError(
      new Error(
        `Model playback paused at ${String(lastShownMs)} ms because a frame was rejected. ${reason}`,
        { cause: frameFailure },
      ),
      'Model playback paused because a frame failed; the last successful frame remains visible.',
    );
  }

  function pauseAfterResizeRestoreFailure(
    resizeFailure: AggregateError,
    frameNowMs: number,
  ): void {
    const reason = resizeFailure.message.trim() === ''
      ? 'The resize and rollback failed without an explanation.'
      : resizeFailure.message;
    if (sceneOpen !== null) {
      sceneTransport.pauseAfterFailure(lastShownMs);
      playerBar.syncPlayButton();
      showViewError(
        new Error(
          `Scene '${sceneOpen.id}' paused at its last successfully presented time `
          + `${String(lastShownMs)} ms because an automatic stage resize failed and restoring the `
          + `prior viewport also failed. Reload this Studio before continuing. ${reason}`,
          { cause: resizeFailure },
        ),
        'Stage resize rollback failed; scene playback paused. Reload this Studio.',
      );
      return;
    }
    player.pause(frameNowMs);
    const lastPresentedPhaseMs = player.periodMs > 0
      ? Math.min(
        Math.round(((lastShownMs % player.periodMs) + player.periodMs) % player.periodMs),
        player.periodMs - 1,
      )
      : 0;
    player.seek(lastPresentedPhaseMs, frameNowMs);
    playerBar.syncPlayButton();
    showViewError(
      new Error(
        `Model playback paused at its last successfully presented phase `
        + `${String(lastPresentedPhaseMs)} ms `
        + 'because an automatic stage resize failed and restoring the prior viewport also failed. '
        + `Reload this Studio before continuing. ${reason}`,
        { cause: resizeFailure },
      ),
      'Stage resize rollback failed; model playback paused. Reload this Studio.',
    );
  }

  function tick(frameNowMs: number): void {
    if (disposed) return;
    let advancingFrame = false;
    let followingStageSize = true;
    try {
      followStage();
      followingStageSize = false;
      const elapsedMs = previousFrameNowMs === null
        ? 0
        : Math.min(50, Math.max(0, frameNowMs - previousFrameNowMs));
      previousFrameNowMs = frameNowMs;
      let nextShownMs: number | null = null;
      if (sceneOpen !== null) {
        const hasMotion = sceneSession?.hasMotion() === true;
        if (sceneTransport.shouldAdvance(hasMotion)) {
          nextShownMs = sceneTransport.timeAt(frameNowMs);
        }
      } else if (player.playing) {
        nextShownMs = player.timeAt(frameNowMs);
      }
      advancingFrame = nextShownMs !== null;
      const movement = keyboard.movement();
      const moving = movement.forward !== 0 || movement.right !== 0;
      if (moving && elapsedMs > 0) {
        const distance = orbit.viewHeight
          * KEYBOARD_PAN_VIEW_HEIGHTS_PER_SECOND
          * (elapsedMs / 1_000);
        const nextCenter = moveOrbitCenter(
          orbit,
          panCenter,
          movement.forward,
          movement.right,
          distance,
        );
        clearViewError();
        if (nextShownMs === null) {
          try {
            presentView(orbit, nextCenter);
          } catch (viewFailure) {
            keyboard.clearMovement();
            showViewError(
              viewFailure,
              'WASD camera movement was rejected; the prior view and playback state remain active.',
            );
          }
        } else {
          try {
            presentView(orbit, nextCenter, nextShownMs);
          } catch (combinedFailure) {
            keyboard.clearMovement();
            try {
              // Classify the failure without a second render on the success
              // path: if the advancing time draws at the restored camera, only
              // the requested navigation was unsafe and playback can continue.
              presentView(orbit, panCenter, nextShownMs);
            } catch (frameFailure) {
              const frameReason = frameFailure instanceof Error
                ? frameFailure.message
                : String(frameFailure);
              throw new AggregateError(
                [combinedFailure, frameFailure],
                'The requested WASD camera movement was rolled back, and the advancing frame was '
                + `also rejected at the prior camera. ${frameReason}`,
                { cause: frameFailure },
              );
            }
            showViewError(
              combinedFailure,
              'WASD camera movement was rejected; animation continued at the prior view.',
            );
          }
        }
      } else if (nextShownMs !== null) {
        drawFrame(nextShownMs);
      }
    } catch (frameFailure) {
      keyboard.clearMovement();
      if (followingStageSize) {
        if (frameFailure instanceof AggregateError) {
          pauseAfterResizeRestoreFailure(frameFailure, frameNowMs);
        } else {
          const reason = frameFailure instanceof Error ? frameFailure.message : String(frameFailure);
          showViewError(
            new Error(
              'The Studio rejected an automatic stage resize; the prior viewport and playback '
              + `state remain active. ${reason}`,
              { cause: frameFailure },
            ),
            'Stage resize was rejected; the prior viewport and playback state remain active.',
          );
        }
      } else if (advancingFrame) {
        pauseAfterFrameFailure(frameFailure, frameNowMs);
      } else {
        const reason = frameFailure instanceof Error ? frameFailure.message : String(frameFailure);
        showViewError(
          new Error(
            'The Studio could not update its paused stage view; playback state is unchanged. '
            + reason,
            { cause: frameFailure },
          ),
          'The paused stage view could not update; playback state is unchanged.',
        );
      }
    } finally {
      frameHandle = requestAnimationFrame(tick);
    }
  }

  // Everything from the construction panel to the first paint runs on
  // game-supplied catalog data, and a recipe, part, or physical sidecar that
  // throws by design can surface anywhere in this span — while the panel
  // first reads the steps, while connecting finds a duplicate instanceId, or
  // while the first refresh compiles the physical shapes.
  const acquired: { dispose(): void }[] = [];
  let rootWritten = false;
  try {
    acquired.push(shelfPanel);
    acquired.push(sceneNotesPanel);
    // Watching a model get made. Its previews go through the harness, so the
    // agent walks the same construction the panel shows.
    construction = createConstructionPanel({
      harness,
      onChanged: () => {
        refresh();
        drawFrame(lastShownMs);
      },
    });
    acquired.push(construction);

    if (shellMarkupV2 !== null) {
      rootWritten = true;
      root.innerHTML = shellMarkupV2;
      const shellRoot = root.firstElementChild;
      if (!(shellRoot instanceof HTMLElement)) {
        throw new Error('The V2 Model Studio shell did not render an HTML root.');
      }
      studioShell = connectModelStudioShellV2(shellRoot, shellOptions);
    } else {
      rootWritten = true;
      root.innerHTML = renderModelStudioShell({
        panels: { examine: '', build: '', edit: '', motion: '', notes: '' },
      });
      studioShell = connectModelStudioShell(root, shellOptions);
    }
    acquired.push(studioShell);

    studioShell.regions.top.append(
      modelName, statusChip, grow, openButton, newButton, copyButton, requestShortcut,
    );
    studioShell.regions.shelf.append(shelfPanel.heading, shelfPanel.body);
    studioShell.regions.stage.append(canvasWrap, viewChip, toggles, viewError, stageHint);
    studioShell.regions.stage.append(playgroundPanel.root);
    studioShell.regions.player.append(playerBar.transport, playerBar.timelineWrap, playerBar.timeLabel);
    // The library and inspector columns are draggable, so a panel can be given
    // the room it needs. The grid is the shell root, the regions' shared parent.
    const gridElement = studioShell.regions.stage.parentElement;
    if (gridElement instanceof HTMLElement) {
      disposePanelResize = setupPanelResize({
        grid: gridElement,
        railRegion: studioShell.regions.shelf,
        inspectorRegion: studioShell.regions.inspector,
        store: viewStore,
      });
    }
    if (hasStudioTab('examine')) studioPanel('examine').append(...Array.from(examinePane.childNodes));
    if (hasStudioTab('build')) studioPanel('build').append(...Array.from(construction.element.childNodes));
    if (hasStudioTab('edit')) studioPanel('edit').append(...Array.from(editor.pane.childNodes));
    if (hasStudioTab('motion')) studioPanel('motion').append(...Array.from(motionPanel.pane.childNodes));
    if (hasStudioTab('notes')) studioPanel('notes').append(...Array.from(notesPanel.pane.childNodes));
    for (const tab of ['edit', 'build', 'motion', 'notes'] as const) {
      if (!hasStudioTab(tab)) continue;
      for (const child of Array.from(studioPanel(tab).children)) {
        if (!(child instanceof HTMLElement)) continue;
        sceneCoveredModelContents.push({
          element: child,
          ariaHidden: child.getAttribute('aria-hidden'),
          inert: child.inert,
        });
      }
    }
    // A scene fills the model-only tabs with its own content — the scene editor
    // in Edit (or its replay read-only note), a short note in the rest — hidden
    // until a scene opens, so those tabs never show a stale model.
    const attachSceneInspector = (tab: ModelStudioTabId, content: HTMLElement): void => {
      if (!hasStudioTab(tab)) return;
      content.classList.add('scene-inspector-overlay');
      content.hidden = true;
      const panel = studioPanel(tab);
      panel.style.position = 'relative';
      panel.append(content);
      sceneInspectorPanels.push(content);
    };
    attachSceneInspector('edit', sceneEditor.element);
    attachSceneInspector('edit', sceneReplayReadOnlyNote);
    attachSceneInspector('edit', sceneLiveReadOnlyNote);
    attachSceneInspector('build', sceneBuildNote);
    attachSceneInspector('motion', sceneMotionNote);
    attachSceneInspector('notes', sceneNotesPanel.element);
    // A scene keeps Examine, Edit, and its private Notes surface. Build and
    // model-authored Motion remain model-only.
    const tabHost = studioShell.regions.stage.parentElement;
    sceneHiddenTabs = (['build', 'motion'] as const)
      .map((tab) => tabHost?.querySelector<HTMLElement>(`[data-studio-tab="${tab}"]`) ?? null)
      .filter((element): element is HTMLElement => element !== null);

    // A recipe-backed model opens on Build, whose first section is its recipe
    // parts list. Construction used to be hidden behind Examine on every open,
    // which made the parts effectively invisible until someone knew to look.
    if (options.shellProfileV2?.initialTab !== undefined && 'hasTab' in studioShell) {
      studioShell.selectTab(options.shellProfileV2.initialTab);
    } else {
      showTab(harness.buildSteps().length > 0 ? 'build' : 'examine');
    }
    notesPanel.renderNotes();
    refresh();
    // Sized once immediately and on every window resize, besides the frame
    // loop: the loop is throttled to nothing in background tabs, and the first
    // paint must be sharp everywhere.
    followStage();
  } catch (error) {
    // A mount that throws returns no handle, so nobody else could ever
    // release what it had acquired: put everything back, newest first. The
    // root is cleared only when the mount wrote it — a throw before that
    // must not cost the host whatever it was showing in its own element.
    for (const resource of [...acquired].reverse()) resource.dispose();
    physicalView.dispose();
    wireframeView.dispose();
    highlightView.dispose();
    gridView.dispose();
    session.dispose();
    if (rootWritten) root.replaceChildren();
    throw error;
  }
  // Nothing below can fail, so the globals a failed mount must never own —
  // the document shortcut, the resize follow, and the published harness —
  // attach only now.
  keyboard.attach();
  window.addEventListener('resize', followStage);
  frameHandle = requestAnimationFrame(tick);
  if (options.publishHarness !== false) window.voxelStudio = harness;

  return {
    harness,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameHandle);
      if (sceneConflictTimer !== null) {
        window.clearTimeout(sceneConflictTimer);
        sceneConflictTimer = null;
      }
      editor.dispose();
      liveInteract.dispose();
      playgroundPanel.dispose();
      playgroundView.dispose();
      construction.dispose();
      shelfPanel.dispose();
      sceneNotesPanel.dispose();
      studioShell.dispose();
      keyboard.dispose();
      cancelPendingModelNoteClick();
      openedModelNoteClick = null;
      window.removeEventListener('resize', followStage);
      disposePanelResize();
      physicalView.dispose();
      wireframeView.dispose();
      highlightView.dispose();
      gridView.dispose();
      session.dispose();
      sceneSession?.dispose();
      if (options.publishHarness !== false && window.voxelStudio === harness) {
        delete window.voxelStudio;
      }
      root.replaceChildren();
    },
  };
}
