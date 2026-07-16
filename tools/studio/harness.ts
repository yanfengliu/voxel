import {
  addPaletteColor,
  clearVoxel,
  createEmptyGenome,
  setMotion,
  setPaletteColor,
  setVoxel,
  stopMotion,
} from './edit.js';
import { validateGenomeV1, type GenomeMotionV1, type VoxelGenomeV1 } from './genome.js';
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
  load(genome: VoxelGenomeV1): ReturnType<StudioSession['describe']>;
  /** The current genome, as plain JSON the caller may keep, diff, or persist. */
  genome(): VoxelGenomeV1;
  describe(): ReturnType<StudioSession['describe']>;

  paint(x: number, y: number, z: number, paletteIndex: number): ReturnType<StudioSession['describe']>;
  erase(x: number, y: number, z: number): ReturnType<StudioSession['describe']>;
  recolor(paletteIndex: number, color: { r: number; g: number; b: number }): ReturnType<StudioSession['describe']>;
  addColor(color: { r: number; g: number; b: number }): { readonly paletteIndex: number };
  animate(motion: Partial<GenomeMotionV1>): ReturnType<StudioSession['describe']>;
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

  validate(value: unknown): readonly { readonly path: string; readonly message: string }[];
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
  /** Rebuilds the session around a new genome and tells the UI to catch up. */
  replace(genome: VoxelGenomeV1): void;
  /** Applies an edit and lets the UI redraw, without rebuilding the session. */
  update(genome: VoxelGenomeV1): void;
}

export function createStudioHarness(host: HarnessHostV1): VoxelStudioHarnessV1 {
  const edit = (next: VoxelGenomeV1) => {
    host.update(next);
    return host.session().describe();
  };
  return {
    load(genome) {
      const issues = validateGenomeV1(genome);
      if (issues.length > 0) {
        throw new Error(
          `Refusing to load an invalid genome: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
        );
      }
      host.replace(genome);
      return host.session().describe();
    },
    genome: () => host.session().genome,
    describe: () => host.session().describe(),

    paint: (x, y, z, paletteIndex) =>
      edit(setVoxel(host.session().genome, x, y, z, paletteIndex)),
    erase: (x, y, z) => edit(clearVoxel(host.session().genome, x, y, z)),
    recolor: (paletteIndex, color) =>
      edit(setPaletteColor(host.session().genome, paletteIndex, color)),
    addColor(color) {
      const result = addPaletteColor(host.session().genome, color);
      host.update(result.genome);
      return { paletteIndex: result.paletteIndex };
    },
    animate: (motion) => edit(setMotion(host.session().genome, motion)),
    stop: () => edit(stopMotion(host.session().genome)),

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

    validate: (value) => validateGenomeV1(value),
  };
}

/** A small model that is obviously a model, so the studio never opens on noise. */
export function createStarterGenome(): VoxelGenomeV1 {
  let genome = createEmptyGenome({ id: 'studio:starter', label: 'Starter', size: [6, 6, 6] });
  const body = addPaletteColor(genome, { r: 90, g: 200, b: 120 });
  genome = body.genome;
  const accent = addPaletteColor(genome, { r: 230, g: 190, b: 90 });
  genome = accent.genome;

  for (let x = 1; x < 5; x += 1) {
    for (let z = 1; z < 5; z += 1) {
      for (let y = 0; y < 3; y += 1) genome = setVoxel(genome, x, y, z, body.paletteIndex);
    }
  }
  for (let x = 2; x < 4; x += 1) {
    for (let z = 2; z < 4; z += 1) {
      genome = setVoxel(genome, x, 3, z, accent.paletteIndex);
    }
  }
  return setMotion(genome, {
    periodMs: 1_000,
    translation: [0, 0.6, 0],
    rotationRadians: [0, Math.PI / 6, 0],
  });
}
