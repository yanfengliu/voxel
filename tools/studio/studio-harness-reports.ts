import type { StudioSweepResultV1 } from './session.js';

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

export interface PlayerReportV1 {
  readonly playing: boolean;
  readonly speed: number;
  readonly timeMs: number;
  readonly periodMs: number;
}

export function summarizeStudioSweep(result: StudioSweepResultV1): HarnessSweepSummaryV1 {
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
