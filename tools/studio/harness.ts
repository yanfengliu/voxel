import {
  addPaletteColor,
  clearVoxel,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';
import { validateModelV1, type ModelMotionV1, type StudioModelV1 } from './model.js';
import { modelCenterV1 } from './build.js';
import { buildRecipeStages, type RecipeStageV1 } from './recipe.js';
import type { NoteStore, StudioNoteV1 } from './notes.js';
import type { StudioPlayer } from './player.js';
import { buildRequest, sendRequest, type SendResult } from './requests.js';
import type { StudioCatalogV1 } from './catalog.js';
import type { OrbitStateV1 } from './orbit.js';
import { composeSpriteSheet, type SpriteSheetPlanV1 } from './sheet.js';
import { nearestFrame, stepFrame, type FrameStepV1 } from './sweep.js';
import type { StudioSession, StudioSweepResultV1 } from './session.js';

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

export interface HarnessSweepSummaryV1 {
  readonly ok: boolean;
  readonly issues: readonly { readonly kind: string; readonly message: string }[];
  readonly frameCount: number;
  readonly distinctFrames: number;
  readonly mirroredFrames: number;
  readonly periodMs: number;
  readonly frames: readonly {
    readonly nowMs: number;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly presentedRevision: number | null;
  }[];
}

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

  /** Draws one exact time. Returns the frame's data URL and what was drawn. */
  sampleAt(nowMs: number): {
    readonly nowMs: number;
    readonly image: string;
    readonly drawCalls: number;
    readonly triangles: number;
    readonly presentedRevision: number | null;
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

  /** Starts replay. Same clock the page uses, so both see the same frames. */
  play(): PlayerReportV1;
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
   * Bundles words + pinned notes + the current model into a request file via
   * the dev server. This is how a revision is asked for; an agent watching
   * tools/studio/requests/ applies it through this same surface.
   */
  sendRequest(words: string): Promise<SendResult>;

  /** Where you stand: turn and height in degrees, and how much fits on screen. */
  viewState(): OrbitStateV1 & { readonly described: string };
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
  /** Study edges on (the examining look) or off (the game look). */
  setEdges(on: boolean): boolean;
  edges(): boolean;
  /** The shelf: this studio's sections of models. */
  shelf(): readonly { readonly name: string; readonly models: readonly { readonly id: string; readonly label: string }[] }[];
  /** Opens a model from the shelf by its id. */
  openFromShelf(id: string): ReturnType<StudioSession['describe']>;

  /**
   * How the open model is made, one entry per step of its recipe, starting
   * from the empty grid. Empty for a model authored by hand, which is an
   * answer rather than an error: not every model has a recipe.
   */
  buildSteps(): readonly StudioBuildStepV1[];
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

export interface PlayerReportV1 {
  readonly playing: boolean;
  readonly speed: number;
  readonly timeMs: number;
  readonly periodMs: number;
}

function summarize(result: StudioSweepResultV1): HarnessSweepSummaryV1 {
  return {
    ok: result.verdict.ok,
    issues: result.verdict.issues.map((issue) => ({ kind: issue.kind, message: issue.message })),
    frameCount: result.verdict.frameCount,
    distinctFrames: result.verdict.distinctFrames,
    mirroredFrames: result.verdict.mirroredFrames,
    periodMs: result.plan.periodMs,
    frames: result.frames.map((frame) => ({
      nowMs: frame.nowMs,
      drawCalls: frame.drawCalls,
      triangles: frame.triangles,
      presentedRevision: frame.presentedRevision,
    })),
  };
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
  /** Tells the UI the notes changed, so lists and timeline dots catch up. */
  notesChanged(): void;
  /** The stage viewpoint, owned by the page; setting it redraws. */
  orbit(): OrbitStateV1 & { readonly described: string };
  resizeStage(width: number, height: number): { readonly width: number; readonly height: number };
  setOrbit(view: Partial<OrbitStateV1>): OrbitStateV1 & { readonly described: string };
  setDepth(on: boolean): boolean;
  depth(): boolean;
  catalog(): StudioCatalogV1;
}

export function createStudioHarness(host: HarnessHostV1): VoxelStudioHarnessV1 {
  const edit = (next: StudioModelV1) => {
    host.update(next);
    return host.session().describe();
  };

  // Construction preview state. `restoreModel` holds whatever was open when
  // the preview began -- the edited model, not the recipe's output -- so
  // watching how a model was made never costs a person their edits.
  let shownStep: number | null = null;
  let restoreModel: StudioModelV1 | null = null;
  let cachedStages: { readonly id: string; readonly stages: readonly RecipeStageV1[] } | null = null;

  /**
   * The construction of the shelf model the open model came from, matched by
   * id. A model made with New or Copy matches nothing and has no recipe,
   * which is an empty answer rather than an error.
   */
  function stagesForOpenModel(): readonly RecipeStageV1[] {
    const id = restoreModel?.id ?? host.session().model.id;
    if (cachedStages?.id === id) return cachedStages.stages;
    for (const section of host.catalog().sections) {
      for (const entry of section.models) {
        if (entry.id !== id || !entry.howItsMade) continue;
        const made = entry.howItsMade();
        const stages = buildRecipeStages(made.recipe, made.parts, made.book ?? {});
        cachedStages = { id, stages };
        return stages;
      }
    }
    cachedStages = { id, stages: [] };
    return [];
  }

  /** Ends a preview without redrawing, for paths that replace the model. */
  function dropPreview(): void {
    shownStep = null;
    restoreModel = null;
  }

  return {
    load(model) {
      dropPreview();
      const issues = validateModelV1(model);
      if (issues.length > 0) {
        throw new Error(
          `Refusing to load an invalid model: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
        );
      }
      host.replace(model);
      return host.session().describe();
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
      host.update(result.model);
      return { paletteIndex: result.paletteIndex };
    },
    animate: (motion) => edit(setMotion(host.session().model, motion)),
    stop: () => edit(stopMotion(host.session().model)),

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
      return report();
    },
    pause() {
      const player = host.player();
      player.pause(host.now());
      host.drawAt(player.timeAt(host.now()));
      return report();
    },
    setSpeed(speed) {
      host.player().setSpeed(speed, host.now());
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

    sendRequest: (words) =>
      sendRequest(buildRequest(words, host.noteStore().list(), host.session().model)),

    viewState: () => host.orbit(),
    resizeStage: (width, height) => host.resizeStage(width, height),
    setDepth: (on) => host.setDepth(on),
    depth: () => host.depth(),
    setViewAngles: (view) => host.setOrbit(view),
    setEdges(on) {
      host.session().setEdges(on);
      host.drawAt(host.player().timeAt(host.now()));
      return host.session().edges;
    },
    edges: () => host.session().edges,
    shelf: () => host.catalog().sections.map((section) => ({
      name: section.name,
      models: section.models.map((entry) => ({ id: entry.id, label: entry.label })),
    })),
    openFromShelf(id) {
      for (const section of host.catalog().sections) {
        for (const entry of section.models) {
          if (entry.id === id) {
            dropPreview();
            host.replace(entry.load());
            return host.session().describe();
          }
        }
      }
      throw new Error(`No model on the shelf is called ${id}.`);
    },

    buildSteps: () => stagesForOpenModel().map((stage) => ({
      index: stage.index,
      summary: stage.summary,
      voxelsAfter: stage.voxelsAfter,
      voxelsAdded: stage.voxelsAdded,
    })),
    showBuildStep(index) {
      const stages = stagesForOpenModel();
      const stage = stages[index];
      if (!stage) {
        throw new Error(
          stages.length === 0
            ? 'This model was authored by hand, so there are no steps to show.'
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
