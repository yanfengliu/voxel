import { OrthographicCamera, PerspectiveCamera } from 'three';

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
import type { StudioModelV1 } from './model.js';
import { NoteStore } from './notes.js';
import {
  applyOrbit,
  clampOrbit,
  DEFAULT_ORBIT,
  describeOrbit,
  dragOrbit,
  fitViewHeight,
  zoomOrbit,
  type OrbitStateV1,
} from './orbit.js';
import { createPhysicalOverlayView } from './physical-overlay-view.js';
import { StudioPlayer } from './player.js';
import { StudioSession } from './session.js';
import type { StudioEditStateV1 } from './studio-app-context.js';
import { element, openingModel } from './studio-app-helpers.js';
import { createStudioEditorPanel, type StudioEditorPanelV1 } from './studio-editor.js';
import { createStudioMotionPanel, type StudioMotionPanelV1 } from './studio-motion.js';
import { createStudioNotesPanel, type StudioNotesPanelV1 } from './studio-notes.js';
import { createStudioPlayerBar, type StudioPlayerBarV1 } from './studio-player.js';
import { createStudioShelf, type StudioShelfV1 } from './studio-shelf.js';

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
}

export interface StudioHandleV1 {
  /** Everything the buttons can do, for an agent or a test to do instead. */
  readonly harness: VoxelStudioHarnessV1;
  /** Releases the GPU runtime, listeners, and frame loop. Idempotent. */
  dispose(): void;
}

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 440;
// Replaced by the stage's real size once mounted; these only seed the first frame.
const SWEEP_SAMPLES = 24;
const DRAG_THRESHOLD_PIXELS = 4;

export function mountStudio(options: StudioMountOptionsV1): StudioHandleV1 {
  const root = options.root ?? document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');
  const catalog = options.catalog;
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
  // The physical outlines live between the picture and the note rings: they
  // annotate the model, and a pinned note still reads over everything.
  const physicalView = createPhysicalOverlayView();
  let physicalOn = false;
  const canvasWrap = element('div', 'canvas-wrap');
  canvasWrap.append(canvas, physicalView.element, marks);
  const viewChip = element('span', 'viewchip');
  viewChip.title = "Sides are the model's own, like a person facing you: "
    + 'their left appears on your right.';
  const stageHint = element('span', 'stagehint');
  // The hint teaches only what this profile offers: without Notes the click
  // is correctly ignored, so the hint must not promise it.
  stageHint.textContent = supportsNotes
    ? 'drag to turn · scroll to zoom · double-click to re-centre · click to pin a note'
    : 'drag to turn · scroll to zoom · double-click to re-centre';
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
  const physToggle = element('button', 'toggle');
  physToggle.textContent = 'colliders';
  physToggle.title = 'Outlines the shapes this model blocks and its attachment '
    + 'points, from its saved physical data. The picture itself is unchanged.';
  const toggles = element('div', 'toggles');
  toggles.append(lookSwitch, depthToggle, physToggle);

  const flatCamera = new OrthographicCamera();
  const depthCamera = new PerspectiveCamera();
  // Real depth is the resting state, per the owner: the flat view's
  // equal-sizes-everywhere reads backwards at a glance, so the honest eye is
  // the default and flat is the deliberate choice.
  let depthOn = true;
  let camera: OrthographicCamera | PerspectiveCamera = depthCamera;
  const firstModel = openingModel(catalog, options.openModelId);
  // Fitted to the model it opens on, for the same reason every later open is:
  // a shelf's models are not one size.
  let orbit: OrbitStateV1 = clampOrbit({
    ...DEFAULT_ORBIT,
    viewHeight: fitViewHeight(firstModel.size),
  });
  let viewW = VIEW_WIDTH;
  let viewH = VIEW_HEIGHT;
  applyOrbit(camera, orbit, viewW, viewH);

  let session = new StudioSession(firstModel, {
    canvas, width: viewW, height: viewH, camera,
  });
  const player = new StudioPlayer(session.model.motion.periodMs);
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

  // ---- the harness: the one surface both the buttons and the agent use ----
  const harness = createStudioHarness({
    session: () => session,
    replace(model: StudioModelV1) {
      session.dispose();
      session = new StudioSession(model, {
        canvas, width: viewW, height: viewH, camera,
      });
      // Opening a model fits the view to it, because a shelf holds a game's
      // whole asset set and those are not one size. Only on open: an edit
      // must not re-zoom under your hands, and a construction's stages must
      // keep the frame the finished model set.
      orbit = clampOrbit({ ...orbit, viewHeight: fitViewHeight(model.size) });
      applyOrbit(camera, orbit, viewW, viewH);
      viewChip.textContent = describeOrbit(orbit);
      refresh();
    },
    update(model: StudioModelV1) {
      session.setGenome(model);
      refresh();
    },
    player: () => player,
    noteStore: () => noteStore,
    now: () => performance.now(),
    drawAt: (timeMs: number) => { drawFrame(timeMs); },
    notesChanged() {
      notesPanel.renderNotes();
      playerBar.renderDots();
    },
    orbit: () => ({ ...orbit, described: describeOrbit(orbit) }),
    resizeStage,
    depth: () => depthOn,
    setDepth,
    setPhysicalOverlay: setPhysicalOverlayOn,
    physicalOverlay: () => physicalOn,
    setOrbit(view) {
      orbit = clampOrbit({ ...orbit, ...view });
      applyOrbit(camera, orbit, viewW, viewH);
      viewChip.textContent = describeOrbit(orbit);
      drawFrame(lastShownMs);
      return { ...orbit, described: describeOrbit(orbit) };
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
  const shelfPanel: StudioShelfV1 = createStudioShelf({ harness, showTab });
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
  editor.wireTopBar({ openButton, newButton, copyButton });
  notesPanel.wireRequestShortcut(requestShortcut);

  // ---- drawing and readouts ----
  function drawFrame(timeMs: number): void {
    lastShownMs = timeMs;
    // Reasserted every draw, not only on drag: the engine may touch the shared
    // camera, and the studio's view must win on every frame, not just the ones
    // after an interaction.
    applyOrbit(camera, orbit, viewW, viewH);
    session.showAt(timeMs);
    playerBar.showTime(timeMs);
    positionRings();
    physicalView.draw(
      camera,
      session.frameMiddle(),
      viewW,
      viewH,
      `${String(orbit.yawDegrees)}:${String(orbit.pitchDegrees)}:${String(orbit.viewHeight)}:${depthOn ? 'depth' : 'flat'}`,
    );
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

  // ---- refresh ----
  function refresh(): void {
    const model = harness.model();
    const described = harness.describe();
    // The step list belongs to whichever model is open, so opening another
    // one from the shelf must not leave the previous model's steps sitting
    // there looking current.
    construction.refresh();
    playerBar.applyPeriod(model.motion.periodMs);
    playerBar.syncPlayButton();
    modelName.textContent = described.label;
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

  // ---- wiring: stage (orbit vs pin) ----
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (!moved && Math.hypot(event.clientX - lastX, event.clientY - lastY) < DRAG_THRESHOLD_PIXELS) {
      return;
    }
    moved = true;
    lastX = event.clientX;
    lastY = event.clientY;
    harness.setViewAngles(dragOrbit(orbit, dx, dy));
  });
  canvas.addEventListener('pointerup', (event) => {
    canvas.releasePointerCapture(event.pointerId);
    const wasDrag = moved;
    dragging = false;
    moved = false;
    if (wasDrag || !supportsNotes) return;
    // A clean click is pointing at something seen; freeze that moment.
    if (player.playing) {
      harness.pause();
      playerBar.syncPlayButton();
    }
    const rect = canvas.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    state.pending = { kind: 'moment', timeMs: player.timeAt(performance.now()), u, v };
    positionRings();
    notesPanel.openNoteEditor(`Pinned at ${String(Math.round(player.timeAt(performance.now())))} ms — say what you see…`);
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    harness.setViewAngles(zoomOrbit(orbit, Math.sign(event.deltaY)));
  }, { passive: false });
  canvas.addEventListener('dblclick', () => { harness.setViewAngles(DEFAULT_ORBIT); });

  lookSwitch.addEventListener('click', () => {
    harness.setEdges(!session.edges);
    refresh();
  });
  depthToggle.addEventListener('click', () => { setDepth(!depthOn); });
  physToggle.addEventListener('click', () => { harness.setPhysicalOverlay(!physicalOn); });

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

  /**
   * Swapping cameras means rebuilding the drawing session around the other
   * one; the model, notes, playback position, and edges choice all stay.
   */
  function setDepth(on: boolean): boolean {
    if (on === depthOn) return depthOn;
    depthOn = on;
    camera = depthOn ? depthCamera : flatCamera;
    applyOrbit(camera, orbit, viewW, viewH);
    const model = session.model;
    const edges = session.edges;
    session.dispose();
    session = new StudioSession(model, { canvas, width: viewW, height: viewH, camera });
    session.setEdges(edges);
    refresh();
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

  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof Node) || !root.contains(event.target)) return;
    if (event.key === 'Escape' && (state.pending || state.armedForPlace)) notesPanel.closeNoteEditor();
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement;
    if (typing) return;
    if (event.key === 'ArrowLeft') { harness.step(-1); playerBar.syncPlayButton(); }
    if (event.key === 'ArrowRight') { harness.step(1); playerBar.syncPlayButton(); }
  };
  // Registered with the other globals at the end of the mount, after nothing
  // can fail anymore, so a refused mount leaves the document untouched.

  // ---- assembly ----
  const grow = element('span', 'grow');

  const examinePane = element('div', 'pane');
  const checkRow = element('div', 'row');
  checkRow.append(sweepButton, sheetButton);
  examinePane.append(motionText, modelLine, engineWarning, checkRow, verdict, sheetImage);

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

  // The picture fills the stage and follows the window, so zooming meets the
  // window's edge, never an invisible border in the middle of the screen —
  // which is exactly how the owner found it: "top and bottom clip".
  function resizeStage(width: number, height: number): { width: number; height: number } {
    viewW = Math.max(2, Math.floor(width));
    viewH = Math.max(2, Math.floor(height));
    session.resize(viewW, viewH);
    applyOrbit(camera, orbit, viewW, viewH);
    drawFrame(lastShownMs);
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
    if (Math.floor(rect.width) === viewW && Math.floor(rect.height) === viewH) return;
    resizeStage(rect.width, rect.height);
  }

  // Held so disposal can stop the loop. A mount that kept drawing after its
  // host tore it down would keep a disposed runtime alive and throw on the
  // next frame, which is exactly the leak the engine refuses to ship.
  let frameHandle = 0;
  let disposed = false;

  function tick(): void {
    if (disposed) return;
    followStage();
    if (player.playing) drawFrame(player.timeAt(performance.now()));
    frameHandle = requestAnimationFrame(tick);
  }

  // Everything from the construction panel to the first paint runs on
  // game-supplied catalog data, and a recipe, part, or physical sidecar that
  // throws by design can surface anywhere in this span — while the panel
  // first reads the steps, while connecting finds a duplicate instanceId, or
  // while the first refresh compiles the physical shapes.
  const acquired: { dispose(): void }[] = [];
  let rootWritten = false;
  try {
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
    studioShell.regions.stage.append(canvasWrap, viewChip, toggles, stageHint);
    studioShell.regions.player.append(playerBar.transport, playerBar.timelineWrap, playerBar.timeLabel);
    if (hasStudioTab('examine')) studioPanel('examine').append(...Array.from(examinePane.childNodes));
    if (hasStudioTab('build')) studioPanel('build').append(...Array.from(construction.element.childNodes));
    if (hasStudioTab('edit')) studioPanel('edit').append(...Array.from(editor.pane.childNodes));
    if (hasStudioTab('motion')) studioPanel('motion').append(...Array.from(motionPanel.pane.childNodes));
    if (hasStudioTab('notes')) studioPanel('notes').append(...Array.from(notesPanel.pane.childNodes));

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
    session.dispose();
    if (rootWritten) root.replaceChildren();
    throw error;
  }
  // Nothing below can fail, so the globals a failed mount must never own —
  // the document shortcut, the resize follow, and the published harness —
  // attach only now.
  document.addEventListener('keydown', onDocumentKeyDown);
  window.addEventListener('resize', followStage);
  frameHandle = requestAnimationFrame(tick);
  if (options.publishHarness !== false) window.voxelStudio = harness;

  return {
    harness,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameHandle);
      construction.dispose();
      studioShell.dispose();
      document.removeEventListener('keydown', onDocumentKeyDown);
      window.removeEventListener('resize', followStage);
      physicalView.dispose();
      session.dispose();
      if (options.publishHarness !== false && window.voxelStudio === harness) {
        delete window.voxelStudio;
      }
      root.replaceChildren();
    },
  };
}
