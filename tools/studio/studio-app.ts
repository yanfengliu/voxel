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
import { modelVoxelSizeV1, type StudioModelV1 } from './model.js';
import { NoteStore } from './notes.js';
import {
  applyOrbit,
  clampOrbit,
  DEFAULT_ORBIT,
  describeOrbit,
  dragOrbit,
  fitViewHeight,
  panOrbit,
  zoomOrbit,
  type OrbitCenterV1,
  type OrbitStateV1,
} from './orbit.js';
import { createPhysicalOverlayView } from './physical-overlay-view.js';
import { StudioPlayer } from './player.js';
import { referenceGridSegmentsV1, sceneReferenceGridSegmentsV1 } from './reference-grid.js';
import type { SceneV1 } from './scene.js';
import { createSceneEditor } from './scene-editor.js';
import {
  boxEdgesV1, groundHitV1, pickPlacementV1, placementWorldBoxesV1,
  type PlacementBoxV1, type RayV1,
} from './scene-pick.js';
import { SceneSession } from './scene-session.js';
import { catalogPartsV1, catalogRecipesV1 } from './studio-library.js';
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
import { createStudioMotionPanel, type StudioMotionPanelV1 } from './studio-motion.js';
import { createStudioNotesPanel, type StudioNotesPanelV1 } from './studio-notes.js';
import { setupPanelResize } from './studio-panel-resize.js';
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
  /**
   * Where the stage's remembered look is kept. Defaults to the browser's
   * `localStorage`, guarded so a page that forbids it still mounts; a test or a
   * game embedding two studios can pass its own store to keep them separate.
   */
  readonly viewStore?: ViewPrefsStoreV1;
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

export function mountStudio(options: StudioMountOptionsV1): StudioHandleV1 {
  const root = options.root ?? document.getElementById('studio');
  if (!root) throw new Error('The studio needs a #studio host element.');
  const catalog = options.catalog;
  // The look this studio last wore, so the next model opens the way the last one
  // was left rather than resetting to the resting look. Read once here; written
  // back whenever a view control changes.
  const viewStore = options.viewStore ?? browserViewPrefsStore();
  const view = readViewPrefs(viewStore);
  const persistView = (): void => {
    writeViewPrefs(viewStore, {
      depth: depthOn, edges: session.edges, lit: session.lit, wireframe: session.wireframe, grid: gridOn,
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
  // The physical outlines live between the picture and the note rings: they
  // annotate the model, and a pinned note still reads over everything.
  const physicalView = createPhysicalOverlayView();
  let physicalOn = false;
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
    gridView.element, canvas, sceneCanvas, wireframeView.element, physicalView.element, highlightView.element, marks,
  );
  const viewChip = element('span', 'viewchip');
  viewChip.title = "Sides are the model's own, like a person facing you: "
    + 'their left appears on your right.';
  const stageHint = element('span', 'stagehint');
  // The hint teaches only what this profile offers: without Notes the click
  // is correctly ignored, so the hint must not promise it.
  const modelStageHint = supportsNotes
    ? 'drag to turn · scroll to zoom · double-click to re-centre · click to pin a note'
    : 'drag to turn · scroll to zoom · double-click to re-centre';
  // A scene is arranged, not noted: a click selects the model under the cursor
  // and a drag moves it, so the hint speaks to that instead of pinning.
  const sceneStageHint = 'click a model to select · drag it to move · '
    + 'middle-drag to turn · right-drag to pan · scroll to zoom';
  stageHint.textContent = modelStageHint;
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
  const lightToggle = element('button', 'toggle');
  lightToggle.textContent = 'light';
  lightToggle.title = 'Lights the model so each face shades by how it faces the light — '
    + 'the way to see a colour change across a surface. Off is the flat, honest '
    + "look at the model's own colours.";
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
  toggles.append(lookSwitch, depthToggle, lightToggle, wireframeToggle, gridToggle, physToggle, snapToggle);

  const flatCamera = new OrthographicCamera();
  const depthCamera = new PerspectiveCamera();
  // Real depth is the resting state, per the owner: the flat view's
  // equal-sizes-everywhere reads backwards at a glance, so the honest eye is
  // the default and flat is the deliberate choice — unless a previous visit
  // chose otherwise, which the remembered look restores here.
  let depthOn = view.depth;
  let camera: OrthographicCamera | PerspectiveCamera = depthOn ? depthCamera : flatCamera;
  const firstModel = openingModel(catalog, options.openModelId);
  // Fitted to the model it opens on, for the same reason every later open is:
  // a shelf's models are not one size.
  let orbit: OrbitStateV1 = clampOrbit({
    ...DEFAULT_ORBIT,
    viewHeight: fitViewHeight(firstModel.size, modelVoxelSizeV1(firstModel)),
  });
  // The point the camera looks at; a right-drag pan slides it, opening a model
  // or scene re-centres it on the origin.
  let panCenter: OrbitCenterV1 = [0, 0, 0];
  let viewW = VIEW_WIDTH;
  let viewH = VIEW_HEIGHT;
  applyOrbit(camera, orbit, viewW, viewH, panCenter);

  let session = new StudioSession(firstModel, {
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
  const sceneMotionNote = sceneNote('Every model with its own motion animates live here. '
    + 'Scene-wide fields — wind that waves the trees, water that ripples — are the next step.');
  const sceneNotesNote = sceneNote('Notes pin to one model. Open a model from the shelf to leave notes on it.');
  // A scene's tab content sits as an opaque overlay over each model-only tab,
  // shown while a scene is open — so the model's own content underneath keeps
  // its visibility and is simply covered, never toggled out from under itself.
  const sceneInspectorPanels: HTMLElement[] = [];
  // The tab buttons a scene does not use — Build, Motion, Notes — hidden while a
  // scene is open, so the inspector shows only Examine and the scene editor.
  let sceneHiddenTabs: HTMLElement[] = [];
  function setInspectorSceneMode(on: boolean): void {
    for (const content of sceneInspectorPanels) content.hidden = !on;
    for (const tab of sceneHiddenTabs) tab.hidden = on;
  }
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

  // ---- the harness: the one surface both the buttons and the agent use ----
  const harness = createStudioHarness({
    session: () => session,
    replace(model: StudioModelV1) {
      // Opening a model leaves any shown scene, so the model canvas shows and
      // the scene's is hidden again.
      closeSceneMode();
      // The look carries onto the next model: opening one keeps the edges and
      // light choices the last was left on rather than snapping back to the
      // resting look, which is the whole of "remember my last choice".
      const carriedEdges = session.edges;
      const carriedLit = session.lit;
      const carriedWireframe = session.wireframe;
      session.dispose();
      session = new StudioSession(model, {
        canvas, width: viewW, height: viewH, camera,
        edges: carriedEdges, lit: carriedLit, wireframe: carriedWireframe,
      });
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
    drawAt: (timeMs: number) => { drawFrame(timeMs); },
    notesChanged() {
      notesPanel.renderNotes();
      playerBar.renderDots();
    },
    orbit: () => ({ ...orbit, described: describeOrbit(orbit) }),
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
      return session.edges;
    },
    setLit(on: boolean): boolean {
      session.setLit(on);
      sceneSession?.setLit(on);
      persistView();
      refresh();
      return session.lit;
    },
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
    openScene: (scene) => { openSceneMode(scene); },
    sceneMode: () => sceneOpen !== null,
    scene: () => sceneOpen,
    selectScenePlacement(id) { selectPlacement(id); return selectedPlacementId; },
    selectedScenePlacement: () => selectedPlacementId,
    commitScene(next) { commitSceneEdit(next); },
    undoSceneEdit() { undoScene(); },
    redoSceneEdit() { redoScene(); },
    setSnapToGrid: (on) => setSnapToGrid(on),
    snapToGrid: () => snapOn,
    setOrbit(view) {
      orbit = clampOrbit({ ...orbit, ...view });
      applyOrbit(camera, orbit, viewW, viewH, panCenter);
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
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
    const viewSignature =
      `${String(orbit.yawDegrees)}:${String(orbit.pitchDegrees)}:${String(orbit.viewHeight)}`
      + `:${depthOn ? 'depth' : 'flat'}:${String(panCenter[0])},${String(panCenter[2])}`;
    // A shown scene draws to its own canvas and keeps a ground grid under its
    // whole floor; the only model layer it borrows is the highlight, reused to
    // outline the selected placement.
    if (sceneOpen && sceneSession) {
      sceneSession.showAt(timeMs);
      gridView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, viewSignature, 1);
      if (selectedPlacementId !== null) {
        highlightView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, viewSignature, 1);
      }
      return;
    }
    session.showAt(timeMs);
    playerBar.showTime(timeMs);
    positionRings();
    const middle = session.frameMiddle();
    const scale = session.voxelSize;
    // The grid is already world coordinates, so it draws straight — no model
    // middle to subtract, no voxel scale to apply.
    gridView.draw(camera, { x: 0, y: 0, z: 0 }, viewW, viewH, viewSignature, 1);
    physicalView.draw(camera, middle, viewW, viewH, viewSignature, scale);
    wireframeView.draw(camera, middle, viewW, viewH, viewSignature, scale);
    highlightView.draw(camera, middle, viewW, viewH, viewSignature, scale);
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
  /** A view height that frames the whole scene, from how far its models spread. */
  function sceneFitHeight(scene: SceneV1): number {
    let reach = 8;
    for (const placement of scene.placements) {
      reach = Math.max(reach, Math.hypot(placement.at[0], placement.at[2]) + 10);
    }
    return reach * 2.4;
  }

  /**
   * Opens a scene on the stage. The model session stays alive underneath its
   * own hidden canvas, so everything that reads a single model keeps working;
   * the scene draws to its own canvas at the same shared camera and look.
   */
  function openSceneMode(scene: SceneV1): void {
    if (sceneSession === null) {
      sceneSession = new SceneSession(scene, sceneRecipes, sceneParts, {
        canvas: sceneCanvas, width: viewW, height: viewH, camera,
        edges: session.edges, lit: session.lit, wireframe: false,
      });
    } else {
      sceneSession.setScene(scene);
      sceneSession.setEdges(session.edges);
      sceneSession.setLit(session.lit);
    }
    sceneOpen = scene;
    selectedPlacementId = null;
    // A fresh scene starts with an empty edit history — undo never reaches back
    // into a scene you are no longer looking at.
    sceneUndo.length = 0;
    sceneRedo.length = 0;
    panCenter = [0, 0, 0];
    canvas.style.display = 'none';
    sceneCanvas.style.display = 'block';
    orbit = clampOrbit({ ...orbit, viewHeight: sceneFitHeight(scene) });
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
    // Examine carries the scene's readout; Build and the rest belong to a
    // single model, so open on the tab that speaks about the scene.
    showTab('examine');
    refresh();
    drawFrame(0);
  }

  /** Leaves the scene view for the model lane; a no-op outside a scene. */
  function closeSceneMode(): void {
    if (sceneOpen === null) return;
    sceneOpen = null;
    canvas.style.display = 'block';
    sceneCanvas.style.display = 'none';
  }

  /**
   * Scene-mode readouts: the top bar and the shared look toggles, nothing a
   * single model owns. The model's own overlays and tools stay hidden while a
   * scene shows.
   */
  function refreshScene(scene: SceneV1): void {
    const count = scene.placements.length;
    modelName.textContent = scene.label;
    statusChip.textContent = `scene · ${String(count)} model${count === 1 ? '' : 's'}`;
    lookSwitch.dataset.side = session.edges ? 'left' : 'right';
    lookSwitch.setAttribute('aria-checked', String(session.edges));
    edgesSide.classList.toggle('on', session.edges);
    gameSide.classList.toggle('on', !session.edges);
    depthToggle.classList.toggle('on', depthOn);
    lightToggle.classList.toggle('on', session.lit);
    // A scene has no one model, so the model-only tools step aside, and the
    // scene-only snap toggle steps in.
    wireframeToggle.hidden = true;
    gridToggle.hidden = true;
    physToggle.hidden = true;
    snapToggle.hidden = false;
    snapToggle.classList.toggle('on', snapOn);
    stageHint.textContent = sceneStageHint;
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
        const label = sceneRecipes[id]?.label ?? id;
        return n === 1 ? label : `${label} ×${String(n)}`;
      })
      .join(' · ');
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
    sceneEditor.render(scene, selectedPlacementId);
    newButton.hidden = true;
    copyButton.hidden = true;
    requestShortcut.hidden = true;
  }

  // ---- refresh ----
  function refresh(): void {
    if (sceneOpen) { refreshScene(sceneOpen); return; }
    // Returning from a scene un-hides the model-only toggles, checks, size
    // control, tab content, and top-bar commands a scene hid, and re-hides the
    // scene-only snap toggle.
    wireframeToggle.hidden = false;
    gridToggle.hidden = false;
    snapToggle.hidden = true;
    stageHint.textContent = modelStageHint;
    checkRow.hidden = false;
    sizeField.hidden = false;
    setInspectorSceneMode(false);
    newButton.hidden = !supportsEdit;
    copyButton.hidden = !supportsEdit;
    requestShortcut.hidden = !supportsNotes;
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
    lightToggle.classList.toggle('on', session.lit);
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
    sceneBoxes = sceneOpen ? placementWorldBoxesV1(sceneOpen, sceneRecipes, sceneParts) : [];
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
    sceneOpen = next;
    sceneSession?.setScene(next);
    recomputeSceneBoxes();
    showSelection();
    drawFrame(lastShownMs);
  }
  // The same, plus a full refresh so the editor list and readouts catch up —
  // used at the end of a discrete edit, not on every drag frame.
  function applyScene(next: SceneV1): void {
    applySceneLive(next);
    refresh();
  }
  function pushHistory(): void {
    if (sceneOpen === null) return;
    sceneUndo.push(sceneOpen);
    if (sceneUndo.length > MAX_SCENE_HISTORY) sceneUndo.shift();
    sceneRedo.length = 0;
  }
  function commitSceneEdit(next: SceneV1): void {
    pushHistory();
    applyScene(next);
  }
  function undoScene(): void {
    // Guard before the pop, so a stray call in model mode can never discard a
    // history entry it would then refuse to apply.
    if (sceneOpen === null) return;
    const previous = sceneUndo.pop();
    if (previous === undefined) return;
    sceneRedo.push(sceneOpen);
    applyScene(previous);
  }
  function redoScene(): void {
    if (sceneOpen === null) return;
    const next = sceneRedo.pop();
    if (next === undefined) return;
    sceneUndo.push(sceneOpen);
    applyScene(next);
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

  type StageGesture = 'none' | 'orbit' | 'pan' | 'move';
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
  // The browser's own context menu would swallow a right-drag pan.
  canvasWrap.addEventListener('contextmenu', (event) => { event.preventDefault(); });
  canvasWrap.addEventListener('pointerdown', (event) => {
    moved = false;
    lastX = event.clientX;
    lastY = event.clientY;
    canvasWrap.setPointerCapture(event.pointerId);
    if (event.button === 1) { gesture = 'orbit'; return; }
    if (event.button === 2) { gesture = 'pan'; return; }
    if (event.button !== 0) { gesture = 'none'; return; }
    if (!sceneOpen) { gesture = 'orbit'; return; }
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
    if (gesture === 'orbit') {
      harness.setViewAngles(dragOrbit(orbit, dx, dy));
    } else if (gesture === 'pan') {
      panCenter = panOrbit(orbit, panCenter, dx, dy, viewH);
      applyOrbit(camera, orbit, viewW, viewH, panCenter);
      viewChip.textContent = describeOrbit(orbit);
      drawFrame(lastShownMs);
    } else if (dragGrab) {
      const hit = groundPoint(event, dragGrab.baseY);
      if (hit) {
        // Bank the pre-drag scene once, on the first move, so one drag is one
        // undo step — and a drag that never moves banks nothing.
        if (!dragPushed) { pushHistory(); dragPushed = true; }
        let x = hit.x + dragGrab.offX;
        let z = hit.z + dragGrab.offZ;
        if (snapOn) {
          // Land the footprint's corner on a whole cell, not the model's base.
          x = Math.round(x + dragGrab.cornerX) - dragGrab.cornerX;
          z = Math.round(z + dragGrab.cornerZ) - dragGrab.cornerZ;
        }
        setSelectedAt(x, z);
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
    // A finished drag of a scene model syncs the editor list to its new spot.
    if (finished === 'move') { if (wasDrag) refresh(); return; }
    // A scene has no single model to pin a note against, so a clean click on
    // one only ever selected — never pins.
    if (wasDrag || !supportsNotes || sceneOpen) return;
    // A clean click is pointing at something seen; freeze that moment.
    if (player.playing) {
      harness.pause();
      playerBar.syncPlayButton();
    }
    const rect = canvasWrap.getBoundingClientRect();
    const u = (event.clientX - rect.left) / rect.width;
    const v = (event.clientY - rect.top) / rect.height;
    state.pending = { kind: 'moment', timeMs: player.timeAt(performance.now()), u, v };
    positionRings();
    notesPanel.openNoteEditor(`Pinned at ${String(Math.round(player.timeAt(performance.now())))} ms — say what you see…`);
  });
  canvasWrap.addEventListener('wheel', (event) => {
    event.preventDefault();
    harness.setViewAngles(zoomOrbit(orbit, Math.sign(event.deltaY)));
  }, { passive: false });
  canvasWrap.addEventListener('dblclick', () => { harness.setViewAngles(DEFAULT_ORBIT); });

  lookSwitch.addEventListener('click', () => { harness.setEdges(!session.edges); });
  depthToggle.addEventListener('click', () => { setDepth(!depthOn); });
  lightToggle.addEventListener('click', () => { harness.setLit(!session.lit); });
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

  /**
   * Swapping cameras means rebuilding the drawing session around the other
   * one; the model, notes, playback position, and edges choice all stay.
   */
  function setDepth(on: boolean): boolean {
    if (on === depthOn) return depthOn;
    depthOn = on;
    camera = depthOn ? depthCamera : flatCamera;
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
    const model = session.model;
    const edges = session.edges;
    const lit = session.lit;
    const wireframe = session.wireframe;
    session.dispose();
    session = new StudioSession(model, { canvas, width: viewW, height: viewH, camera, edges, lit, wireframe });
    // A shown scene borrows the same camera, so it is rebuilt on the new one too.
    if (sceneOpen && sceneSession) {
      const scene = sceneSession.scene;
      sceneSession.dispose();
      sceneSession = new SceneSession(scene, sceneRecipes, sceneParts, {
        canvas: sceneCanvas, width: viewW, height: viewH, camera, edges, lit, wireframe: false,
      });
    }
    refresh();
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

  const onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!(event.target instanceof Node) || !root.contains(event.target)) return;
    if (event.key === 'Escape' && (state.pending || state.armedForPlace)) notesPanel.closeNoteEditor();
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement;
    if (typing) return;
    // Undo/redo of scene edits, while a scene is open: Ctrl/Cmd+Z steps back,
    // add Shift to step forward. A text field keeps its own undo (returned
    // above), so this only ever fires against the scene.
    if (sceneOpen && (event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (event.shiftKey) redoScene(); else undoScene();
      return;
    }
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
  examinePane.append(motionText, modelLine, sizeField, engineWarning, checkRow, verdict, sheetImage);

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
    sceneSession?.resize(viewW, viewH);
    applyOrbit(camera, orbit, viewW, viewH, panCenter);
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
  let disposePanelResize: () => void = () => { /* set once the shell mounts */ };

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
    // A scene fills the model-only tabs with its own content — the scene editor
    // in Edit, a short note in the rest — hidden until a scene opens, so those
    // tabs never show a stale model.
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
    attachSceneInspector('build', sceneBuildNote);
    attachSceneInspector('motion', sceneMotionNote);
    attachSceneInspector('notes', sceneNotesNote);
    // The tab buttons a scene hides. Examine and Edit stay; a scene is examined
    // and edited, never built from steps, given motion, or noted per-model.
    const tabHost = studioShell.regions.stage.parentElement;
    sceneHiddenTabs = (['build', 'motion', 'notes'] as const)
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
