import {
  addPaletteColor,
  clearVoxel,
  setMotion,
  setPaletteColor,
  setVoxel,
  setVoxelSize,
  stopMotion,
} from './edit.js';
import { validateModelV1, type ModelMotionV1, type StudioModelV1 } from './model.js';
import { modelCenterV1 } from './build.js';
import type { PartInfoV1 } from './part-definition.js';
import {
  catalogPartsV1,
  catalogRecipesV1,
  partInfoListV1,
  recipeInfoListV1,
  searchPartInfoV1,
  searchRecipeInfoV1,
  type RecipeInfoV1,
} from './studio-library.js';
import {
  buildRecipe,
  listRecipeComponentsV1,
  type PartShelfV1,
  type RecipeComponentV1,
  type RecipePartV1,
  type RecipeStageV1,
} from './recipe.js';
import type { NoteStore, StudioNoteV1 } from './notes.js';
import { buildPartPreviewModelV1, partPreviewPresetOptionsV1 } from './part-preview.js';
import type { PhysicalOverlaySegmentV1 } from './physical-overlay.js';
import type { StudioPlayer } from './player.js';
import { buildRequest, sendRequest, type SendResult } from './requests.js';
import type { ShelfRecipeV1, StudioCatalogV1 } from './catalog.js';
import {
  prepareRecipeSourceV1,
  prepareShelfOpenV1,
  readShelfRecipeV1,
  requireUniqueShelfEntryV1,
  type PreparedRecipeSourceV1,
  type StudioLibrarySourceV1,
} from './library-source.js';
import type { ModelLabelInfoV1, ModelLabelSectionV1 } from './model-label-workspace.js';
import { validateSceneV1, type SceneV1 } from './scene.js';
import type { OrbitCenterV1, OrbitStateV1 } from './orbit.js';
import { composeSpriteSheet, type SpriteSheetPlanV1 } from './sheet.js';
import { nearestFrame, stepFrame, type FrameStepV1 } from './sweep.js';
import type { StudioSession } from './session.js';
import {
  createStudioHarnessLibrary,
  type SceneInfoV1,
} from './studio-harness-library.js';
import {
  summarizeStudioSweep as summarize,
  type HarnessSweepSummaryV1,
  type PlayerReportV1,
} from './studio-harness-reports.js';
import {
  createPlaygroundHarness,
  type PlaygroundHarnessHostV1,
  type VoxelStudioPlaygroundHarnessV1,
} from './studio-harness-playground.js';
import type { StudioShelfItemKindV1, StudioShelfMoveV1 } from './studio-shelf-order.js';
import type { StudioSceneLightingMetricsV1 } from './scene-lighting.js';
import type {
  SceneAnnotationsV1,
  SceneViewPinDraftV1,
  SceneViewPinV1,
} from './scene-annotations.js';
import type {
  ScenePoseReplayStatusV1,
  SceneRenderMetricsV1,
} from './scene-session.js';

export type { SceneInfoV1 } from './studio-harness-library.js';
export type { HarnessSweepSummaryV1, PlayerReportV1 } from './studio-harness-reports.js';

/**
 * The agent-facing surface of the studio, exposed on `window.voxelStudio`.
 *
 * This is a first-class interface, not a debug hook. The rule it exists to
 * enforce: the UI may not do anything this cannot. A UI capability with no
 * harness equivalent is a claim about a model that the agent cannot check, and
 * an unverifiable claim about a model is exactly what this studio exists to
 * eliminate.
 *
 * Every method is synchronous and returns plain data, so a headless driver can
 * call it through one `page.evaluate` and get an answer it can assert on rather
 * than a screenshot it has to interpret.
 */

export interface VoxelStudioHarnessV1 {
  /** Replaces the model under inspection. Returns what the studio now holds. */
  load(model: StudioModelV1): ReturnType<StudioSession['describe']>;
  /** The current model, as plain JSON the caller may keep, diff, or persist. */
  model(): StudioModelV1;
  describe(): ReturnType<StudioSession['describe']>;

  paint(x: number, y: number, z: number, paletteIndex: number): ReturnType<StudioSession['describe']>;
  erase(x: number, y: number, z: number): ReturnType<StudioSession['describe']>;
  recolor(paletteIndex: number, color: { r: number; g: number; b: number }): ReturnType<StudioSession['describe']>;
  addColor(color: { r: number; g: number; b: number }): { readonly paletteIndex: number };
  animate(motion: Partial<ModelMotionV1>): ReturnType<StudioSession['describe']>;
  stop(): ReturnType<StudioSession['describe']>;
  /**
   * Sets how big one voxel is in world units, scaling the whole model without
   * changing a step. Returns what the studio now holds. `voxelSize` reads it
   * back; one voxel-per-unit is the default.
   */
  setVoxelSize(size: number): ReturnType<StudioSession['describe']>;
  voxelSize(): number;

  /** Draws one exact time. Returns the frame's data URL and what was drawn. */
  sampleAt(nowMs: number): {
    readonly nowMs: number;
    readonly image: string;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly presentedRevision: number | null;
  };
  /** Draws one exact model-or-scene time and returns plain scene-light work metrics. */
  drawAt(nowMs: number): {
    readonly sceneLighting: StudioSceneLightingMetricsV1 | null;
    readonly sceneRender: SceneRenderMetricsV1 | null;
    readonly scenePoseReplay: ScenePoseReplayStatusV1 | null;
  };
  /**
   * Sweeps one period and judges it. `images: true` returns every frame's data
   * URL; omitted, the summary carries only what an assertion needs, because a
   * verdict is usually the whole question and 24 data URLs is a lot to move
   * through an evaluate boundary to answer it.
   */
  sweep(options?: { readonly samplesPerPeriod?: number; readonly images?: boolean }):
    HarnessSweepSummaryV1 & { readonly images?: readonly string[] };
  /** Throws with the reason when the current model's animation is not sound. */
  assertSound(options?: { readonly samplesPerPeriod?: number }): HarnessSweepSummaryV1;
  /**
   * Every frame of one period in a single deterministically ordered sheet,
   * ascending in time. This is the animation surface's native view, because
   * looking at every frame is the only thing that judges quality -- the guards
   * prove an animation is sound and a sound animation can still look wrong.
   */
  spriteSheet(options?: { readonly samplesPerPeriod?: number; readonly columns?: number }):
    Promise<{ readonly dataUrl: string; readonly plan: SpriteSheetPlanV1 }>;

  /**
   * Starts replay. On a motion-bearing open scene this also enables the
   * persisted scene-animation choice; a static scene leaves that choice alone.
   */
  play(): PlayerReportV1;
  /**
   * Pauses replay. On a motion-bearing open scene this also disables the
   * persisted scene-animation choice; a static scene leaves that choice alone.
   */
  pause(): PlayerReportV1;
  setSpeed(speed: number): PlayerReportV1;
  /** Jumps to an exact moment within the period. */
  seek(timeMs: number): PlayerReportV1;
  /**
   * One frame forward or back through the same frames the sweep checks and
   * the sheet shows — stepping walks the evidence, not a private grid. Pauses
   * playback, snaps to the frame grid, wraps at the ends.
   */
  step(direction: 1 | -1, options?: { readonly samplesPerPeriod?: number }):
    PlayerReportV1 & { readonly frame: number; readonly frameCount: number };
  /** Which frame the current moment is closest to, for readouts. */
  frameAt(options?: { readonly samplesPerPeriod?: number }): FrameStepV1;
  playerState(): PlayerReportV1;

  /** Pins the owner's words to a moment: a time plus a spot on the picture. */
  addMomentNote(timeMs: number, spot: { u: number; v: number }, text: string): StudioNoteV1;
  /** Pins the owner's words to an exact voxel. */
  addPlaceNote(voxel: { x: number; y: number; z: number }, text: string): StudioNoteV1;
  removeNote(id: number): boolean;
  notes(): readonly StudioNoteV1[];
  /** After applying a request, the agent clears the notes it answered. */
  clearNotes(): void;

  /**
   * The private review brief and captured-view pins for one stable scene id.
   * Omitting the id reads the open scene.
   */
  sceneAnnotations(sceneId?: string): SceneAnnotationsV1;
  /** Autosaves a scene-wide review brief without changing renderer-owned scene data. */
  setSceneBrief(text: string, sceneId?: string): SceneAnnotationsV1;
  /** Adds a fully described captured-view pin to the open scene. */
  addSceneAnnotation(draft: SceneViewPinDraftV1): SceneViewPinV1;
  /** Removes one captured-view pin from the open scene. */
  removeSceneAnnotation(id: SceneViewPinV1['id']): boolean;
  /** Clears the brief and pins for one scene, retaining monotonic pin ids. */
  clearSceneAnnotations(sceneId?: string): void;
  /** Pauses and restores the exact captured view and phase for one open-scene pin. */
  showSceneAnnotation(id: SceneViewPinV1['id']): void;
  /** Arms or disarms the scene stage's explicit one-shot annotation click. */
  setSceneAnnotationMode(on: boolean): boolean;
  sceneAnnotationMode(): boolean;

  /**
   * Bundles words + pinned notes + the current model into a request file via
   * the dev server. Saving starts no agent or notification; the owner asks an
   * agent to process the named local file when ready.
   */
  sendRequest(words: string): Promise<SendResult>;
  /** Saves the open scene's private brief, pins, scene snapshot, and current presented context. */
  sendSceneRequest(words?: string): Promise<SendResult>;

  /** Where you stand: turn and height in degrees, and how much fits on screen. */
  viewState(): OrbitStateV1 & { readonly described: string };
  /** The world point at the center of the stage, translated by panning or WASD. */
  viewCenter(): OrbitCenterV1;
  /** Moves x/z through the same validated ground-plane view path as WASD and drag-pan. */
  setViewCenter(center: OrbitCenterV1): OrbitCenterV1;
  /** Resizes the picture to match the stage. Returns the surface's real size. */
  resizeStage(width: number, height: number): { readonly width: number; readonly height: number };
  /**
   * Real depth on (nearer is bigger) or off (the flat voxel view). The flat
   * view has a known illusion — equal sizes at every distance can read as
   * growing away from you — and this is the check against it.
   */
  setDepth(on: boolean): boolean;
  depth(): boolean;
  /** Moves the viewpoint; the model itself never moves. Returns where you are. */
  setViewAngles(view: Partial<OrbitStateV1>): OrbitStateV1 & { readonly described: string };
  /**
   * Moves the camera's look-at point in world units, so a caller can
   * frame something far from the origin. Returns the accepted centre.
   */
  setViewCentre(centre: readonly [number, number, number]): readonly [number, number, number];
  /** Study edges on (the examining look) or off (the game look). */
  setEdges(on: boolean): boolean;
  edges(): boolean;
  /**
   * Light the model on, so faces shade by how they face the studio's daylight
   * rig, or off for the flat unlit look. The light is an inspection aid, not a
   * claim about any game's lighting; off is the resting state.
   */
  setLit(on: boolean): boolean;
  lit(): boolean;
  /**
   * Enables or pauses automatic animation for every scene. This persisted
   * Studio preference is independent of lighting and does not alter model playback.
   */
  setSceneAnimation(on: boolean): boolean;
  sceneAnimation(): boolean;
  /** Whether the open scene contains animated models or moving light sources. */
  sceneHasMotion(): boolean;
  /**
   * Wireframe on: the solid faces give way to a see-through line drawing of
   * the model, so its make-up reads from every side at once. Off is the solid
   * model. Defaults to off.
   */
  setWireframe(on: boolean): boolean;
  wireframe(): boolean;
  /**
   * The open model's compiled physical outlines — collider wireframes and
   * port crosses in grid coordinates. Empty when its shelf recipe carries
   * no physical sidecars, which is a valid state rather than an error.
   */
  physicalShapes(): readonly PhysicalOverlaySegmentV1[];
  /**
   * Shows or hides those outlines on the stage. They can only show when
   * `physicalShapes()` has content; asking for them on an unclaiming model
   * reports `on: false` rather than pretending.
   */
  setPhysicalOverlay(on: boolean): { readonly on: boolean; readonly available: boolean };
  physicalOverlay(): { readonly on: boolean; readonly available: boolean };
  /** The shelf with mount-local display names over the catalog's stable model ids. */
  shelf(): readonly ModelLabelSectionV1[];
  /** Opens a model from the shelf by its id. */
  openFromShelf(id: string): ReturnType<StudioSession['describe']>;
  /** The shelf entry explicitly opened on the stage, or null for parts, recipes, loads, edits, and scenes. */
  activeShelfModel(): string | null;
  /** The effective display name for a model id, or the supplied fallback for a non-shelf id. */
  modelDisplayLabel(id: string, fallback?: string): string;
  /**
   * Renames only this mount's display alias. The stable id, catalog model,
   * recipes, and scene references remain untouched.
   */
  renameModel(id: string, label: string): ModelLabelInfoV1;
  /** Removes a mount-local alias and returns the model's catalog name. */
  restoreModelName(id: string): ModelLabelInfoV1;
  /** The mount-local stable-ID order shown for one library lane. Models require their shelf section index. */
  shelfOrder(kind: StudioShelfItemKindV1, sectionIndex?: number): readonly string[];
  /** Rearranges one library entry without changing its stable ID or source data. */
  moveShelfItem(request: StudioShelfMoveV1): readonly string[];

  /**
   * The scenes in this mounted Studio: arrangements of its models standing
   * together in one world. Empty when the catalog declares none or all have
   * been deleted for this session.
   */
  scenes(): readonly SceneInfoV1[];
  /**
   * Opens a scene on the stage by its id. The stage shows the whole scene until
   * any model is opened, which leaves the scene view. Throws when no scene has
   * that id, naming it, rather than opening nothing.
   */
  openScene(id: string): void;
  /**
   * Renames a scene for this mounted Studio, preserving its stable id and
   * placements. The open title and shelf update through the same path as the UI.
   */
  renameScene(id: string, label: string): SceneV1;
  /**
   * Deletes a scene from this mounted Studio. Deleting the open scene returns
   * the stage to its underlying model. Returns the scene that was removed.
   */
  deleteScene(id: string): SceneV1;
  /** Whether a scene is on the stage rather than a single model. */
  sceneMode(): boolean;
  /**
   * The open scene's surface-conflict report: placements occupying the same
   * space, and recorded surfaces sharing a still surface's plane facing the
   * same way. The studio computes it off the open/edit path, so right after a
   * change the status reads 'checking' until the fresh report lands; the
   * conflicts are the same plain-words lines the Examine pane shows. Null in
   * model mode.
   */
  sceneSurfaceConflicts(): {
    readonly status: 'checking' | 'ready';
    readonly conflicts: readonly string[];
  } | null;
  /**
   * The stage pointer mode. 'adjust' is the editing pointer; 'interact' hands
   * the left button to the live solver on scenes that declare one. Scenes
   * without a live profile always report 'adjust'.
   */
  stageMode(): 'adjust' | 'interact';
  /** Switches the stage pointer mode; ignored on scenes with no live profile. */
  setStageMode(mode: 'adjust' | 'interact'): void;
  /**
   * The live solver's current state for the open scene: body, collider and
   * joint counts, spawn tally, the grabbed placement, and steps taken. All
   * zeros with running=false when no live world exists.
   */
  livePhysics(): {
    readonly available: boolean;
    readonly mode: 'adjust' | 'interact';
    readonly running: boolean;
    readonly bodies: number;
    readonly colliders: number;
    readonly joints: number;
    readonly spawned: number;
    readonly grabbed: string | null;
    readonly stepped: number;
    readonly positions: Readonly<Record<string, readonly [number, number, number]>>;
  };
  /**
   * Advances the live world by an exact number of fixed ticks and redraws.
   * A live scene has no timeline to scrub, so this is how a driver reaches a
   * reproducible moment for an assertion or a screenshot. Throws a named
   * error when the open scene has no live world.
   */
  settleLive(steps: number): void;
  /**
   * The physics playground's transport, cases, spawn, and inspector — the
   * panel's own capabilities as callable plain-data methods. Methods that
   * need a live playground scene throw a named error without one.
   */
  readonly playground: VoxelStudioPlaygroundHarnessV1;
  /**
   * The scene on the stage right now as plain data — the same shape `openScene`
   * placed and the editor edits — or null when a single model is open. This is
   * how a driver reads back a move, an add, or an undo and asserts on it.
   */
  sceneState(): SceneV1 | null;
  /**
   * Selects a placement by id — the one selection the stage outline and the
   * Edit tab's controls both follow, so selecting a second model moves the
   * controls to it. Null clears the selection; an unknown id throws, naming it,
   * rather than selecting nothing silently. Returns what is now selected.
   */
  selectPlacement(id: string | null): string | null;
  /** Which placement is selected, or null. */
  selectedPlacement(): string | null;
  /**
   * Adopts an edited scene — add, move, turn, or remove a placement — the same
   * one-way commit the editor uses, recording one undo step. Rejects a scene
   * that would not render, listing every reason. Throws outside scene mode,
   * because there is no open scene to replace. Returns the now-open scene.
   */
  editScene(next: SceneV1): SceneV1;
  /** Steps scene edits back and forward; a no-op at either end of the history. */
  undoScene(): SceneV1 | null;
  redoScene(): SceneV1 | null;
  /**
   * Snap-to-grid for dragging a model in a scene: on lands its footprint on
   * whole ground cells. Off drags it freely. Reads back with `snapToGrid`.
   */
  setSnapToGrid(on: boolean): boolean;
  snapToGrid(): boolean;

  /**
   * Every part this studio offers, as discovery info: name, title, summary,
   * category, tags, its settings schema, and presets. This is the palette a
   * model is built from — distinct from `buildParts`, which is only what the
   * open model already uses.
   */
  availableParts(): readonly PartInfoV1[];
  /** Those parts filtered by a search over name, title, summary, category, and tags. */
  findParts(query: string): readonly PartInfoV1[];
  /**
   * Renders one library part with declared defaults, or one named preset.
   * A preset is resolved by its exact published name and never mutates the part.
   */
  openPart(name: string, options?: { readonly preset?: string }): ReturnType<StudioSession['describe']>;
  /** The library part currently rendered by `openPart`, or null for models and scenes. */
  activePart(): string | null;
  /** The active part's named preset, or null for its defaults and for non-part views. */
  activePartPreset(): string | null;
  /**
   * Every reusable recipe this studio offers, as discovery info: its
   * authoritative book-key id, declared recipe id, label, summary, tags, grid
   * size, voxel size, and the parts and sub-recipes it places. Distinct from
   * the shelf, which lists the models to open.
   */
  availableRecipes(): readonly RecipeInfoV1[];
  /** Those recipes filtered by a search over id, label, summary, tags, and what they place. */
  findRecipes(query: string): readonly RecipeInfoV1[];
  /** Builds the current output of one catalog recipe and renders it on the stage. */
  openRecipe(id: string): ReturnType<StudioSession['describe']>;
  /** The freshly built recipe currently rendered by `openRecipe`, or null. */
  activeRecipe(): string | null;

  /**
   * How the open model is made, one entry per step of its recipe, starting
   * from the empty grid. Empty only when no catalog model is open; every shelf
   * model is required to provide a recipe.
   */
  buildSteps(): readonly StudioBuildStepV1[];
  /**
   * Every component in the open recipe, preserving nested recipe instances
   * and their internal parts as a recursive tree. Empty for a hand-built
   * model, just like `buildSteps`.
   */
  buildComponents(): readonly RecipeComponentV1[];
  /**
   * The contributing bill of materials for the open recipe. Repeated and
   * mirrored occurrences are aggregated; nested rows describe each saved
   * reusable recipe, and layout operations are omitted.
   */
  buildParts(): readonly RecipePartV1[];
  /**
   * The grid cells each top-level part owns, aligned index-for-index with
   * `buildParts`. Empty for a hand-built model with no recipe. A nested child
   * part lives in its own sub-grid and is not addressed here.
   */
  partCells(): readonly (readonly number[])[];
  /**
   * Lights up a top-level part where it sits in the model, and marks it in the
   * list. The index is into `buildParts`/`partCells`; null clears the
   * highlight, and an out-of-range index clears it too rather than claiming a
   * selection that lights nothing.
   */
  highlightPart(index: number | null): void;
  /** Which top-level part is lit up, or null. */
  highlightedPart(): number | null;
  /**
   * Shows the model as it stood at one construction step. This is a preview:
   * the open model is unchanged, and `showFinished` puts the picture back.
   */
  showBuildStep(index: number): ReturnType<StudioSession['describe']>;
  /** Returns the picture to the finished model. */
  showFinished(): ReturnType<StudioSession['describe']>;
  /** Which step is being previewed, or null when the finished model shows. */
  shownBuildStep(): number | null;

  validate(value: unknown): readonly { readonly path: string; readonly message: string }[];
}

/** One step of a model's construction, as plain data an agent can assert on. */
export interface StudioBuildStepV1 {
  /** 0 is the empty grid it starts from; step n is after the recipe's step n. */
  readonly index: number;
  readonly summary: string;
  readonly voxelsAfter: number;
  readonly voxelsAdded: number;
}

export interface HarnessHostV1 {
  session(): StudioSession;
  /** Rebuilds the session around a new model and tells the UI to catch up. */
  replace(model: StudioModelV1): void;
  /** Applies an edit and lets the UI redraw, without rebuilding the session. */
  update(model: StudioModelV1): void;
  player(): StudioPlayer;
  noteStore(): NoteStore;
  /** The page's clock for anchoring play and pause; tests inject their own. */
  now(): number;
  /** Draws the frame at a moment and lets the UI's readouts catch up. */
  drawAt(timeMs: number): void;
  /**
   * Resumes a motion-bearing open scene's own unwrapped animation clock.
   * Returns true only when scene motion handled the request; model-only hosts
   * omit this hook and static scenes return false.
   */
  resumeSceneAnimation?(): boolean;
  /**
   * Freezes a motion-bearing open scene at its last presented time. Returns
   * true only when scene motion handled the request, so pause need not issue a
   * second exact-time draw; static scenes leave the persisted choice alone.
   */
  pauseSceneAnimation?(): boolean;
  /** Re-anchors an active scene clock after the shared speed changes. */
  sceneAnimationSpeedChanged?(): void;
  /** Plain metrics for the currently open scene's clustered lights, when any. */
  sceneLightingMetrics?(): StudioSceneLightingMetricsV1 | null;
  /** Plain renderer workload metrics for the currently open scene, when any. */
  sceneRenderMetrics?(): SceneRenderMetricsV1 | null;
  /** Consumer provenance, accepted pose frame, and latest causal event for a replay scene. */
  scenePoseReplayStatus?(): ScenePoseReplayStatusV1 | null;
  /** Tells the UI the notes changed, so lists and timeline dots catch up. */
  notesChanged(): void;
  /** Private review artifacts for one stable scene id; optional for non-Studio test hosts. */
  sceneAnnotations?(sceneId: string): SceneAnnotationsV1;
  setSceneBrief?(sceneId: string, text: string): void;
  addSceneAnnotation?(sceneId: string, draft: SceneViewPinDraftV1): SceneViewPinV1;
  removeSceneAnnotation?(sceneId: string, id: SceneViewPinV1['id']): boolean;
  clearSceneAnnotations?(sceneId: string): void;
  showSceneAnnotation?(pin: SceneViewPinV1): void;
  setSceneAnnotationMode?(on: boolean): boolean;
  sceneAnnotationMode?(): boolean;
  sendSceneRequest?(words?: string): Promise<SendResult>;
  /** The stage viewpoint, owned by the page; setting it redraws. */
  orbit(): OrbitStateV1 & { readonly described: string };
  /** Optional for non-visual hosts that always center their model at the origin. */
  viewCenter?(): OrbitCenterV1;
  /** Optional for non-visual hosts that do not expose camera translation. */
  setViewCenter?(center: OrbitCenterV1): OrbitCenterV1;
  resizeStage(width: number, height: number): { readonly width: number; readonly height: number };
  setOrbit(view: Partial<OrbitStateV1>): OrbitStateV1 & { readonly described: string };
  setViewCentre(centre: readonly [number, number, number]): readonly [number, number, number];
  setDepth(on: boolean): boolean;
  depth(): boolean;
  /**
   * Sets study edges on/off. The app owns this so the one funnel also
   * remembers the choice and refreshes the switch, whether the change came
   * from the UI or an agent — the same reason depth is a host method.
   */
  setEdges(on: boolean): boolean;
  /** Lights the model on/off; funneled through the app like edges, so the choice is remembered and the button refreshes. */
  setLit(on: boolean): boolean;
  /** Enables or pauses the persisted scene-animation preference independently of lighting. */
  setSceneAnimation(on: boolean): boolean;
  sceneAnimation(): boolean;
  sceneHasMotion(): boolean;
  /** Wireframe on/off; funneled through the app so it also toggles the line overlay, remembers the choice, and refreshes the button. */
  setWireframe(on: boolean): boolean;
  /** Shows or hides the stage's physical-outline layer; returns what shows. */
  setPhysicalOverlay(on: boolean): boolean;
  physicalOverlay(): boolean;
  /**
   * Lights up a top-level part in the render; null clears it. The app owns
   * this so it can turn the part's cells into an outline overlay and refresh
   * the parts list's selected row, whether the UI or an agent asked.
   */
  highlightPart(index: number | null): void;
  highlightedPart(): number | null;
  /** Opens a scene on the stage; the model session stays alive underneath. */
  openScene(scene: SceneV1): void;
  /** The mount-owned scene collection, distinct from the readonly input catalog. */
  scenes(): readonly SceneV1[];
  /** Renames a scene and refreshes every affected Studio surface. */
  renameScene(id: string, label: string): SceneV1;
  /** Deletes a scene and refreshes every affected Studio surface. */
  deleteScene(id: string): SceneV1;
  /** Whether a scene is on the stage rather than a single model. */
  sceneMode(): boolean;
  /** The open scene's surface-conflict report; null in model mode. */
  sceneSurfaceConflicts(): {
    readonly status: 'checking' | 'ready';
    readonly conflicts: readonly string[];
  } | null;
  /**
   * The stage pointer mode. 'adjust' is the editing pointer; 'interact' hands
   * the left button to the live solver on scenes that declare one. Scenes
   * without a live profile always report 'adjust'.
   */
  stageMode(): 'adjust' | 'interact';
  /** Switches the stage pointer mode; ignored on scenes with no live profile. */
  setStageMode(mode: 'adjust' | 'interact'): void;
  /** The playground harness's window into the panel and live session. */
  readonly playgroundHost: PlaygroundHarnessHostV1;
  /**
   * The live solver's current state for the open scene: body, collider and
   * joint counts, spawn tally, the grabbed placement, and steps taken. All
   * zeros with running=false when no live world exists.
   */
  livePhysics(): {
    readonly available: boolean;
    readonly mode: 'adjust' | 'interact';
    readonly running: boolean;
    readonly bodies: number;
    readonly colliders: number;
    readonly joints: number;
    readonly spawned: number;
    readonly grabbed: string | null;
    readonly stepped: number;
    readonly positions: Readonly<Record<string, readonly [number, number, number]>>;
  };
  /**
   * Advances the live world by an exact number of fixed ticks and redraws.
   * A live scene has no timeline to scrub, so this is how a driver reaches a
   * reproducible moment for an assertion or a screenshot. Throws a named
   * error when the open scene has no live world.
   */
  settleLive(steps: number): void;
  /** The scene on the stage right now, or null in model mode. */
  scene(): SceneV1 | null;
  /** Selects a placement (or clears with null); returns what is now selected. */
  selectScenePlacement(id: string | null): string | null;
  selectedScenePlacement(): string | null;
  /** Adopts an edited scene, recording one undo step. */
  commitScene(next: SceneV1): void;
  undoSceneEdit(): void;
  redoSceneEdit(): void;
  /** Snap-to-grid for scene drags; the app owns the flag and its button. */
  setSnapToGrid(on: boolean): boolean;
  snapToGrid(): boolean;
  /** The catalog shelf with this mount's display-name aliases applied. */
  modelLabels(): readonly ModelLabelSectionV1[];
  /** Resolves one model's mount-local display name. */
  modelDisplayLabel(id: string, fallback?: string): string;
  /** Changes one model's mount-local display name and refreshes affected UI. */
  renameModel(id: string, label: string): ModelLabelInfoV1;
  /** Restores one model's catalog display name and refreshes affected UI. */
  restoreModelName(id: string): ModelLabelInfoV1;
  /** Applies one mount-local stable-ID order to a library collection. */
  orderShelfItems(
    kind: StudioShelfItemKindV1,
    ids: readonly string[],
    sectionIndex?: number,
  ): readonly string[];
  /** Commits one shelf move and republishes the library UI. */
  moveShelfItem(request: StudioShelfMoveV1, ids: readonly string[]): readonly string[];
  /** Identifies the shelf entry used to create the opening session, when there is one. */
  initialShelfModelId?(): string | null;
  catalog(): StudioCatalogV1;
}

export function createStudioHarness(host: HarnessHostV1): VoxelStudioHarnessV1 {
  const initialShelfModelId = host.initialShelfModelId?.() ?? null;
  let activeSource: StudioLibrarySourceV1 = initialShelfModelId === null
    ? null
    : { kind: 'shelf', id: initialShelfModelId };
  const restoreChangedModel = (
    previousModel: StudioModelV1,
    method: 'replace' | 'update',
    originalFailure: unknown,
  ): void => {
    if (host.session().model === previousModel) return;
    try {
      host[method](previousModel);
    } catch (restoreFailure) {
      throw new AggregateError(
        [originalFailure, restoreFailure],
        `Changing model '${previousModel.id}' failed after the host accepted another model, and restoring `
        + `the previous model also failed. Reload this Studio before continuing.`,
        { cause: restoreFailure },
      );
    }
  };
  const withActiveSource = <T>(next: StudioLibrarySourceV1, action: () => T): T => {
    const previous = activeSource;
    const previousModel = host.session().model;
    activeSource = next;
    try {
      const result = action();
      if (next === null) dropPreview();
      return result;
    } catch (error) {
      activeSource = previous;
      restoreChangedModel(previousModel, 'update', error);
      throw error;
    }
  };
  const edit = (next: StudioModelV1) =>
    withActiveSource(null, () => {
      host.update(next);
      return host.session().describe();
    });

  // Construction preview state. `restoreModel` holds whatever was open when
  // the preview began -- the edited model, not the recipe's output -- so
  // watching how a model was made never costs a person their edits.
  let shownStep: number | null = null;
  let restoreModel: StudioModelV1 | null = null;
  let cachedStages: { readonly key: string; readonly stages: readonly RecipeStageV1[] } | null = null;
  let cachedRecipe: { readonly key: string; readonly source: ShelfRecipeV1 | null } | null = null;
  let cachedShapes: { readonly key: string; readonly shapes: readonly PhysicalOverlaySegmentV1[] } | null = null;
  let cachedParts: { readonly key: string; readonly parts: readonly RecipePartV1[] } | null = null;
  let cachedPartCells: { readonly key: string; readonly cells: readonly (readonly number[])[] } | null = null;
  // The library is the game's whole palette; the catalog is fixed for a mount,
  // so its parts, recipes, model ids, and discovery records are computed once.
  let libraryPartShelfCache: PartShelfV1 | null = null;
  let libraryRecipeBookCache: ReturnType<typeof catalogRecipesV1> | null = null;
  let libraryModelIdsCache: readonly string[] | null = null;
  let libraryPartsCache: readonly PartInfoV1[] | null = null;
  let libraryRecipesCache: readonly RecipeInfoV1[] | null = null;
  const libraryPartShelf = (): PartShelfV1 =>
    (libraryPartShelfCache ??= catalogPartsV1(host.catalog()));
  const libraryRecipeBook = (): ReturnType<typeof catalogRecipesV1> =>
    (libraryRecipeBookCache ??= catalogRecipesV1(host.catalog()));
  const libraryModelIds = (): readonly string[] =>
    (libraryModelIdsCache ??= host.catalog().sections.flatMap(
      (section) => section.models.map((model) => model.id),
    ));
  const canonicalParts = (): readonly PartInfoV1[] =>
    (libraryPartsCache ??= partInfoListV1(libraryPartShelf()));
  const canonicalRecipes = (): readonly RecipeInfoV1[] =>
    (libraryRecipesCache ??= recipeInfoListV1(libraryRecipeBook()));
  const library = createStudioHarnessLibrary({
    modelSections: () => host.modelLabels(),
    parts: canonicalParts,
    recipes: canonicalRecipes,
    scenes: () => host.scenes(),
    order: (kind, ids, sectionIndex) => host.orderShelfItems(kind, ids, sectionIndex),
    move: (request, ids) => host.moveShelfItem(request, ids),
  });

  const installPreparedSource = (prepared: PreparedRecipeSourceV1): void => {
    cachedRecipe = { key: prepared.key, source: prepared.source };
    cachedStages = { key: prepared.key, stages: prepared.stages };
    cachedShapes = { key: prepared.key, shapes: prepared.shapes };
    cachedParts = { key: prepared.key, parts: prepared.parts };
    cachedPartCells = { key: prepared.key, cells: prepared.cells };
  };

  /**
   * Commits harness-owned source, preview, and cache state around one host
   * replacement. Catalog reads and builds happen before this function.
   */
  const replaceModel = (
    model: StudioModelV1,
    source: StudioLibrarySourceV1,
    prepared?: PreparedRecipeSourceV1,
  ): ReturnType<StudioSession['describe']> => {
    const previousModel = host.session().model;
    const previous = {
      activeSource,
      shownStep,
      restoreModel,
      cachedStages,
      cachedRecipe,
      cachedShapes,
      cachedParts,
      cachedPartCells,
    };
    activeSource = source;
    shownStep = null;
    restoreModel = null;
    if (prepared) installPreparedSource(prepared);
    try {
      host.replace(model);
      return host.session().describe();
    } catch (error) {
      ({
        activeSource,
        shownStep,
        restoreModel,
        cachedStages,
        cachedRecipe,
        cachedShapes,
        cachedParts,
        cachedPartCells,
      } = previous);
      restoreChangedModel(previousModel, 'replace', error);
      throw error;
    }
  };

  const openSourceKey = (): string => {
    if (activeSource?.kind === 'recipe') return `recipe:${activeSource.id}`;
    if (activeSource?.kind === 'shelf') return `shelf:${activeSource.id}`;
    return `custom:${restoreModel?.id ?? host.session().model.id}`;
  };

  function recipeForOpenModel(): ShelfRecipeV1 | null {
    if (activeSource?.kind === 'part') return null;
    if (activeSource?.kind === 'recipe') {
      const book = libraryRecipeBook();
      if (!Object.hasOwn(book, activeSource.id)) {
        throw new Error(
          `The active recipe '${activeSource.id}' is no longer in this Studio's recipe book.`,
        );
      }
      return { recipe: book[activeSource.id]!, parts: libraryPartShelf(), book };
    }
    if (activeSource?.kind !== 'shelf') return null;
    const id = activeSource.id;
    const key = openSourceKey();
    if (cachedRecipe?.key === key) return cachedRecipe.source;
    const source = readShelfRecipeV1(requireUniqueShelfEntryV1(host.catalog(), id));
    cachedRecipe = { key, source };
    return source;
  }

  function preparedForOpenModel(): PreparedRecipeSourceV1 | null {
    if (activeSource === null || activeSource.kind === 'part') return null;
    const key = openSourceKey();
    if (cachedRecipe?.key === key
      && cachedRecipe.source !== null
      && cachedStages?.key === key
      && cachedShapes?.key === key
      && cachedParts?.key === key
      && cachedPartCells?.key === key) {
      return {
        key,
        source: cachedRecipe.source,
        stages: cachedStages.stages,
        shapes: cachedShapes.shapes,
        parts: cachedParts.parts,
        cells: cachedPartCells.cells,
      };
    }
    const source = recipeForOpenModel();
    if (source === null) return null;
    const prepared = prepareRecipeSourceV1(key, source, activeSource.kind === 'shelf');
    installPreparedSource(prepared);
    return prepared;
  }

  /**
   * The construction of the explicitly opened shelf model or recipe. A model
   * made with New, Copy, load, or an edit has no recipe provenance.
   */
  function stagesForOpenModel(): readonly RecipeStageV1[] {
    return preparedForOpenModel()?.stages ?? [];
  }

  /** Compiled physical outlines exist only for explicitly opened shelf models. */
  function shapesForOpenModel(): readonly PhysicalOverlaySegmentV1[] {
    return activeSource?.kind === 'shelf' ? preparedForOpenModel()?.shapes ?? [] : [];
  }

  function inventoryForOpenModel(): {
    readonly parts: readonly RecipePartV1[];
    readonly cells: readonly (readonly number[])[];
  } {
    const prepared = preparedForOpenModel();
    return prepared ?? { parts: [], cells: [] };
  }

  /**
   * The grid cells each top-level part of the open model or recipe placed,
   * aligned with the cached parts inventory. Cached per source like the stages
   * and shapes; empty for a New/Copy model that matches no shelf recipe.
   */
  function partCellsForOpenModel(): readonly (readonly number[])[] {
    return inventoryForOpenModel().cells;
  }

  /** Ends a construction preview without redrawing. */
  function dropPreview(): void {
    shownStep = null;
    restoreModel = null;
  }

  function annotationSceneId(requested: string | undefined, action: string): string {
    if (requested !== undefined) return requested;
    const scene = host.scene();
    if (scene !== null) return scene.id;
    throw new Error(
      `${action} needs an open scene or an explicit stable scene id; no scene is open.`,
    );
  }

  function sceneAnnotationDocument(id: string): SceneAnnotationsV1 {
    if (host.sceneAnnotations === undefined) {
      throw new Error(
        'This Studio harness host does not provide private scene annotations. '
        + 'Mount the browser Studio with its scene-annotation store before using this method.',
      );
    }
    return host.sceneAnnotations(id);
  }

  return {
    load(model) {
      const issues = validateModelV1(model);
      if (issues.length > 0) {
        throw new Error(
          `Refusing to load an invalid model: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
        );
      }
      return replaceModel(model, null);
    },
    model: () => host.session().model,
    describe: () => host.session().describe(),

    paint: (x, y, z, paletteIndex) =>
      edit(setVoxel(host.session().model, x, y, z, paletteIndex)),
    erase: (x, y, z) => edit(clearVoxel(host.session().model, x, y, z)),
    recolor: (paletteIndex, color) =>
      edit(setPaletteColor(host.session().model, paletteIndex, color)),
    addColor(color) {
      const result = addPaletteColor(host.session().model, color);
      return withActiveSource(null, () => {
        host.update(result.model);
        return { paletteIndex: result.paletteIndex };
      });
    },
    animate: (motion) => edit(setMotion(host.session().model, motion)),
    stop: () => edit(stopMotion(host.session().model)),
    setVoxelSize: (size) => edit(setVoxelSize(host.session().model, size)),
    voxelSize: () => host.session().voxelSize,

    sampleAt: (nowMs) => host.session().sampleAt(nowMs),
    sweep(options) {
      const result = host.session().sweep(options?.samplesPerPeriod ?? 24);
      const summary = summarize(result);
      if (options?.images !== true) return summary;
      return { ...summary, images: result.frames.map((frame) => frame.image) };
    },
    assertSound(options) {
      const result = host.session().sweep(options?.samplesPerPeriod ?? 24);
      const summary = summarize(result);
      if (!summary.ok) {
        throw new Error(
          `The model's animation is not sound: ${summary.issues.map((i) => i.message).join(' ')}`,
        );
      }
      return summary;
    },

    async spriteSheet(options) {
      const result = host.session().sweep(options?.samplesPerPeriod ?? 24);
      return composeSpriteSheet(result.frames, {
        ...(options?.columns === undefined ? {} : { columns: options.columns }),
      });
    },

    play() {
      host.player().play(host.now());
      host.resumeSceneAnimation?.();
      return report();
    },
    pause() {
      const player = host.player();
      player.pause(host.now());
      if (host.pauseSceneAnimation?.() !== true) host.drawAt(player.timeAt(host.now()));
      return report();
    },
    setSpeed(speed) {
      host.player().setSpeed(speed, host.now());
      host.sceneAnimationSpeedChanged?.();
      return report();
    },
    seek(timeMs) {
      const player = host.player();
      player.seek(timeMs, host.now());
      host.drawAt(player.timeAt(host.now()));
      return report();
    },
    step(direction, options) {
      const player = host.player();
      player.pause(host.now());
      const stepped = stepFrame(
        host.session().model.motion,
        player.timeAt(host.now()),
        direction,
        options?.samplesPerPeriod ?? 24,
      );
      player.seek(stepped.timeMs, host.now());
      host.drawAt(stepped.timeMs);
      return { ...report(), frame: stepped.frame, frameCount: stepped.frameCount };
    },
    frameAt(options) {
      return nearestFrame(
        host.session().model.motion,
        host.player().timeAt(host.now()),
        options?.samplesPerPeriod ?? 24,
      );
    },
    playerState: () => report(),
    drawAt(nowMs) {
      host.drawAt(nowMs);
      return {
        sceneLighting: host.sceneLightingMetrics?.() ?? null,
        sceneRender: host.sceneRenderMetrics?.() ?? null,
        scenePoseReplay: host.scenePoseReplayStatus?.() ?? null,
      };
    },

    addMomentNote(timeMs, spot, text) {
      const note = host.noteStore().addMoment(timeMs, spot, text);
      host.notesChanged();
      return note;
    },
    addPlaceNote(voxel, text) {
      const note = host.noteStore().addPlace(voxel, text);
      host.notesChanged();
      return note;
    },
    removeNote(id) {
      const removed = host.noteStore().remove(id);
      if (removed) host.notesChanged();
      return removed;
    },
    notes: () => host.noteStore().list(),
    clearNotes() {
      host.noteStore().clear();
      host.notesChanged();
    },

    sceneAnnotations(sceneId) {
      return sceneAnnotationDocument(annotationSceneId(sceneId, 'Reading scene annotations'));
    },
    setSceneBrief(text, sceneId) {
      const id = annotationSceneId(sceneId, 'Saving a scene brief');
      if (host.setSceneBrief === undefined) {
        throw new Error(
          'This Studio harness host cannot save a scene brief because it did not provide a setSceneBrief hook.',
        );
      }
      host.setSceneBrief(id, text);
      return sceneAnnotationDocument(id);
    },
    addSceneAnnotation(draft) {
      const id = annotationSceneId(undefined, 'Adding a scene annotation');
      if (host.addSceneAnnotation === undefined) {
        throw new Error(
          'This Studio harness host cannot add a scene annotation because it did not provide an addSceneAnnotation hook.',
        );
      }
      return host.addSceneAnnotation(id, draft);
    },
    removeSceneAnnotation(pinId) {
      const id = annotationSceneId(undefined, 'Removing a scene annotation');
      if (host.removeSceneAnnotation === undefined) {
        throw new Error(
          'This Studio harness host cannot remove a scene annotation because it did not provide a removeSceneAnnotation hook.',
        );
      }
      return host.removeSceneAnnotation(id, pinId);
    },
    clearSceneAnnotations(sceneId) {
      const id = annotationSceneId(sceneId, 'Clearing scene annotations');
      if (host.clearSceneAnnotations === undefined) {
        throw new Error(
          'This Studio harness host cannot clear scene annotations because it did not provide a clearSceneAnnotations hook.',
        );
      }
      host.clearSceneAnnotations(id);
    },
    showSceneAnnotation(pinId) {
      const id = annotationSceneId(undefined, 'Showing a scene annotation');
      if (host.showSceneAnnotation === undefined) {
        throw new Error(
          'This Studio harness host cannot show a scene annotation because it did not provide a showSceneAnnotation hook.',
        );
      }
      const pin = sceneAnnotationDocument(id).pins.find((candidate) => candidate.id === pinId);
      if (pin === undefined) {
        throw new Error(
          `Scene '${id}' has no annotation with id ${String(pinId)}, so there is no captured view to show.`,
        );
      }
      host.showSceneAnnotation(pin);
    },
    setSceneAnnotationMode(on) {
      if (host.setSceneAnnotationMode === undefined) {
        throw new Error(
          'This Studio harness host cannot change scene annotation mode because it did not provide a setSceneAnnotationMode hook.',
        );
      }
      return host.setSceneAnnotationMode(on);
    },
    sceneAnnotationMode() {
      if (host.sceneAnnotationMode === undefined) {
        throw new Error(
          'This Studio harness host cannot report scene annotation mode because it did not provide a sceneAnnotationMode hook.',
        );
      }
      return host.sceneAnnotationMode();
    },

    sendRequest: (words) =>
      sendRequest(buildRequest(words, host.noteStore().list(), host.session().model)),
    sendSceneRequest(words) {
      if (host.sendSceneRequest === undefined) {
        throw new Error(
          'This Studio harness host cannot save a scene request because it did not provide a sendSceneRequest hook.',
        );
      }
      return host.sendSceneRequest(words);
    },

    viewState: () => host.orbit(),
    viewCenter: () => host.viewCenter?.() ?? [0, 0, 0],
    setViewCenter(center) {
      if (host.setViewCenter === undefined) {
        throw new Error(
          'This Studio harness host cannot move the camera center because it did not provide '
          + 'a setViewCenter hook.',
        );
      }
      return host.setViewCenter(center);
    },
    resizeStage: (width, height) => host.resizeStage(width, height),
    setDepth: (on) => host.setDepth(on),
    depth: () => host.depth(),
    setViewAngles: (view) => host.setOrbit(view),
    setViewCentre: (centre) => host.setViewCentre(centre),
    setEdges: (on) => host.setEdges(on),
    edges: () => host.session().edges,
    setLit: (on) => host.setLit(on),
    lit: () => host.session().lit,
    setSceneAnimation: (on) => host.setSceneAnimation(on),
    sceneAnimation: () => host.sceneAnimation(),
    sceneHasMotion: () => host.sceneHasMotion(),
    setWireframe: (on) => host.setWireframe(on),
    wireframe: () => host.session().wireframe,
    physicalShapes: () => shapesForOpenModel(),
    setPhysicalOverlay(on) {
      const available = shapesForOpenModel().length > 0;
      const shown = host.setPhysicalOverlay(on && available);
      return { on: shown, available };
    },
    physicalOverlay: () => ({
      on: host.physicalOverlay(),
      available: shapesForOpenModel().length > 0,
    }),
    shelf: library.shelf,
    openFromShelf(id) {
      const opened = prepareShelfOpenV1(host.catalog(), id);
      return replaceModel(opened.model, { kind: 'shelf', id: opened.id }, opened.prepared);
    },
    activeShelfModel: () =>
      host.sceneMode() || activeSource?.kind !== 'shelf' ? null : activeSource.id,
    modelDisplayLabel: (id, fallback = id) => host.modelDisplayLabel(id, fallback),
    renameModel: (id, label) => host.renameModel(id, label),
    restoreModelName: (id) => host.restoreModelName(id),
    shelfOrder: library.order,
    moveShelfItem: library.move,
    scenes: library.scenes,
    openScene(id) {
      const scene = host.scenes().find((entry) => entry.id === id);
      if (!scene) throw new Error(`No scene in this studio has the id '${id}', so it cannot be opened.`);
      host.openScene(scene);
    },
    renameScene: (id, label) => host.renameScene(id, label),
    deleteScene: (id) => host.deleteScene(id),
    sceneMode: () => host.sceneMode(),
    sceneSurfaceConflicts: () => host.sceneSurfaceConflicts(),
    stageMode: () => host.stageMode(),
    setStageMode: (mode) => { host.setStageMode(mode); },
    livePhysics: () => host.livePhysics(),
    settleLive: (steps) => { host.settleLive(steps); },
    playground: createPlaygroundHarness(host.playgroundHost),
    sceneState: () => host.scene(),
    selectPlacement(id) {
      if (id !== null) {
        const scene = host.scene();
        if (scene === null) {
          throw new Error('No scene is open, so there is no placement to select.');
        }
        if (!scene.placements.some((placement) => placement.id === id)) {
          throw new Error(`No placement in this scene has the id ${id}.`);
        }
      }
      return host.selectScenePlacement(id);
    },
    selectedPlacement: () => host.selectedScenePlacement(),
    editScene(next) {
      const open = host.scene();
      if (open === null) {
        throw new Error('No scene is open to edit; open a scene first with openScene.');
      }
      if (next.id !== open.id) {
        throw new Error(
          `Refusing to edit scene '${open.id}': the replacement id '${next.id}' would change `
          + 'its stable identity; rename the label instead.',
        );
      }
      const issues = validateSceneV1(next);
      if (issues.length > 0) {
        throw new Error(
          `Refusing to apply an invalid scene: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
        );
      }
      host.commitScene(next);
      const scene = host.scene();
      if (scene === null) throw new Error('The scene edit did not take: no scene is open afterward.');
      return scene;
    },
    undoScene() {
      host.undoSceneEdit();
      return host.scene();
    },
    redoScene() {
      host.redoSceneEdit();
      return host.scene();
    },
    setSnapToGrid: (on) => host.setSnapToGrid(on),
    snapToGrid: () => host.snapToGrid(),
    availableParts: library.parts,
    findParts: (query) => searchPartInfoV1(library.parts(), query),
    openPart(name, options) {
      const shelf = libraryPartShelf();
      if (!Object.hasOwn(shelf, name)) {
        throw new Error(
          `No part in this studio has the name '${name}', so it cannot be rendered. `
          + 'Choose a name returned by availableParts().',
        );
      }
      const entry = shelf[name]!;
      const presetOptions = partPreviewPresetOptionsV1(name, entry, options?.preset);
      const model = buildPartPreviewModelV1(name, entry, {
        reservedModelIds: libraryModelIds(),
        ...presetOptions,
      });
      return replaceModel(model, {
        kind: 'part',
        name,
        preset: presetOptions.variantLabel ?? null,
      });
    },
    activePart: () =>
      host.sceneMode() || activeSource?.kind !== 'part' ? null : activeSource.name,
    activePartPreset: () =>
      host.sceneMode() || activeSource?.kind !== 'part' ? null : activeSource.preset,
    availableRecipes: library.recipes,
    findRecipes: (query) => searchRecipeInfoV1(library.recipes(), query),
    openRecipe(id) {
      const book = libraryRecipeBook();
      if (!Object.hasOwn(book, id)) {
        throw new Error(
          `No recipe in this studio has the id '${id}', so it cannot be rendered. `
          + 'Choose an id returned by availableRecipes().',
        );
      }
      const recipe = book[id]!;
      const source = { recipe, parts: libraryPartShelf(), book };
      const model = buildRecipe(recipe, source.parts, source.book).model;
      const prepared = prepareRecipeSourceV1(`recipe:${id}`, source, false);
      return replaceModel(model, { kind: 'recipe', id }, prepared);
    },
    activeRecipe: () =>
      host.sceneMode() || activeSource?.kind !== 'recipe' ? null : activeSource.id,

    buildSteps: () => stagesForOpenModel().map((stage) => ({
      index: stage.index,
      summary: stage.summary,
      voxelsAfter: stage.voxelsAfter,
      voxelsAdded: stage.voxelsAdded,
    })),
    buildComponents() {
      const made = recipeForOpenModel();
      return made ? listRecipeComponentsV1(made.recipe, made.book ?? {}) : [];
    },
    buildParts() {
      return inventoryForOpenModel().parts;
    },
    partCells: () => partCellsForOpenModel(),
    highlightPart: (index) => { host.highlightPart(index); },
    highlightedPart: () => host.highlightedPart(),
    showBuildStep(index) {
      const stages = stagesForOpenModel();
      const stage = stages[index];
      if (!stage) {
        throw new Error(
          stages.length === 0
            ? 'No catalog recipe is open, so there are no steps to show.'
            : `This model has no construction step ${String(index)}.`,
        );
      }
      // The first preview remembers what to come back to; later ones must not
      // overwrite it with an earlier stage, or Finished would restore a
      // half-built model.
      restoreModel ??= host.session().model;
      shownStep = index;
      // Every stage is framed on the finished model, so the picture holds
      // still while the model grows into it. Framed on itself, a single post
      // would sit dead centre and the next stage would shove it aside.
      const finished = stages[stages.length - 1];
      if (finished) host.session().setFrameCenter(modelCenterV1(finished.model));
      host.update(stage.model);
      return host.session().describe();
    },
    showFinished() {
      const restore = restoreModel;
      dropPreview();
      host.session().setFrameCenter(null);
      if (restore) host.update(restore);
      return host.session().describe();
    },
    shownBuildStep: () => shownStep,

    validate: (value) => validateModelV1(value),
  };
  function report(): PlayerReportV1 {
    const player = host.player();
    return {
      playing: player.playing,
      speed: player.speed,
      timeMs: player.timeAt(host.now()),
      periodMs: player.periodMs,
    };
  }
}

export { createStarterModel } from './catalog.js';
