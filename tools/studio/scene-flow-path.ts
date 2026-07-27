import type { ScenePoseReplayTrackV1 } from './scene-pose-replay.js';

export type SceneFlowPointV1 = readonly [number, number, number];

export interface SceneFlowPathV1 {
  readonly points: readonly SceneFlowPointV1[];
  /** Connects the last point back to the first without duplicating it. */
  readonly closed: boolean;
}

export interface SceneFlowTrackInputV1 {
  readonly placementId: string;
  readonly path: SceneFlowPathV1;
  /** Normalized offset around the path, from zero inclusive to one exclusive. */
  readonly phase: number;
  /**
   * Records frame zero again as the final frame of a closed path. This makes a
   * reset-mode replay visually continuous at the cost of its final held frame.
   */
  readonly closeLoopAtFinalFrame?: boolean;
}

export interface SampledSceneFlowPathV1 {
  readonly translation: SceneFlowPointV1;
  readonly linearVelocity: SceneFlowPointV1;
}

interface PathSegmentV1 {
  readonly from: SceneFlowPointV1;
  readonly delta: SceneFlowPointV1;
  readonly length: number;
}

function assertFinitePoint(
  point: readonly number[],
  path: string,
): void {
  if (point.length !== 3 || point.some((component) => !Number.isFinite(component))) {
    throw new Error(
      `Cannot build scene flow path: ${path} must contain exactly three finite numbers; `
      + `received ${JSON.stringify(point)}.`,
    );
  }
}

function pathSegments(path: SceneFlowPathV1): {
  readonly segments: readonly PathSegmentV1[];
  readonly length: number;
} {
  if (path.points.length < 2) {
    throw new Error(
      `Cannot build scene flow path: expected at least two points; received ${String(path.points.length)}.`,
    );
  }
  path.points.forEach((point, index) => assertFinitePoint(point, `points[${String(index)}]`));
  const pairs = path.points.slice(0, -1).map((point, index) => [
    point,
    path.points[index + 1]!,
  ] as const);
  if (path.closed) pairs.push([path.points.at(-1)!, path.points[0]!]);
  const segments = pairs.map(([from, to], index) => {
    const delta = [
      to[0] - from[0],
      to[1] - from[1],
      to[2] - from[2],
    ] as const;
    const length = Math.hypot(delta[0], delta[1], delta[2]);
    if (!(length > 0)) {
      throw new Error(
        `Cannot build scene flow path: segment ${String(index)} has zero length at `
        + `${JSON.stringify(from)}. Remove the duplicate adjacent point.`,
      );
    }
    return { from, delta, length };
  });
  const length = segments.reduce((sum, segment) => sum + segment.length, 0);
  return { segments, length };
}

function normalizedProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

/**
 * Samples constant arc-length travel along a polyline. This is reusable
 * authored choreography, not a fluid solver: the caller decides what the path
 * means and which portions are visible.
 */
export function sampleSceneFlowPathV1(
  path: SceneFlowPathV1,
  progress: number,
  durationMs: number,
): SampledSceneFlowPathV1 {
  if (!Number.isFinite(progress)) {
    throw new Error(
      `Cannot sample scene flow path at progress ${String(progress)}; expected a finite number.`,
    );
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(
      `Cannot sample scene flow path with duration ${String(durationMs)} ms; `
      + 'expected a finite duration greater than zero.',
    );
  }
  const measured = pathSegments(path);
  let remaining = normalizedProgress(progress) * measured.length;
  let segment = measured.segments.at(-1)!;
  for (const candidate of measured.segments) {
    if (remaining < candidate.length) {
      segment = candidate;
      break;
    }
    remaining -= candidate.length;
  }
  const alpha = Math.min(1, remaining / segment.length);
  const speed = measured.length / (durationMs / 1_000);
  return {
    translation: [
      segment.from[0] + segment.delta[0] * alpha,
      segment.from[1] + segment.delta[1] * alpha,
      segment.from[2] + segment.delta[2] * alpha,
    ],
    linearVelocity: [
      segment.delta[0] / segment.length * speed,
      segment.delta[1] / segment.length * speed,
      segment.delta[2] / segment.length * speed,
    ],
  };
}

/**
 * Records one rigid placement moving at constant arc length around a path.
 * Frame interpolation remains the Scene pose-replay contract's responsibility.
 */
export function createSceneFlowTrackV1(
  input: SceneFlowTrackInputV1,
  frameCount: number,
  fixedTimestepMs: number,
): ScenePoseReplayTrackV1 {
  if (input.placementId.length === 0) {
    throw new Error('Cannot build scene flow track: placementId must not be empty.');
  }
  if (!Number.isFinite(input.phase) || input.phase < 0 || input.phase >= 1) {
    throw new Error(
      `Cannot build scene flow track '${input.placementId}': phase must be finite in [0, 1); `
      + `received ${String(input.phase)}.`,
    );
  }
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error(
      `Cannot build scene flow track '${input.placementId}': frameCount must be a positive integer; `
      + `received ${String(frameCount)}.`,
    );
  }
  if (!Number.isFinite(fixedTimestepMs) || fixedTimestepMs <= 0) {
    throw new Error(
      `Cannot build scene flow track '${input.placementId}': fixedTimestepMs must be finite and `
      + `greater than zero; received ${String(fixedTimestepMs)}.`,
    );
  }
  if (input.closeLoopAtFinalFrame === true && !input.path.closed) {
    throw new Error(
      `Cannot build scene flow track '${input.placementId}' with an endpoint-identical closing `
      + 'frame: the path must be closed.',
    );
  }
  if (input.closeLoopAtFinalFrame === true && frameCount < 2) {
    throw new Error(
      `Cannot build scene flow track '${input.placementId}' with an endpoint-identical closing `
      + `frame: frameCount must be at least 2; received ${String(frameCount)}.`,
    );
  }
  const travelFrameCount = input.closeLoopAtFinalFrame === true
    ? frameCount - 1
    : frameCount;
  const travelDurationMs = travelFrameCount * fixedTimestepMs;
  const translations = new Float32Array(frameCount * 3);
  const quaternions = new Float32Array(frameCount * 4);
  const linearVelocities = new Float32Array(frameCount * 3);
  const angularVelocities = new Float32Array(frameCount * 3);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = sampleSceneFlowPathV1(
      input.path,
      input.phase + frame / travelFrameCount,
      travelDurationMs,
    );
    translations.set(sample.translation, frame * 3);
    linearVelocities.set(sample.linearVelocity, frame * 3);
    quaternions[frame * 4 + 3] = 1;
  }
  return {
    placementId: input.placementId,
    translations,
    quaternions,
    linearVelocities,
    angularVelocities,
  };
}
