import {
  STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2,
  validateScenePoseReplayV1,
  validateScenePoseReplayV2,
  type SampledScenePosePlacementV1,
  type SampledScenePoseReplayV1,
  type SampledScenePoseReplayV2,
  type ScenePoseReplayPlaybackV1,
  type ScenePoseReplayV1,
  type ScenePoseReplayV1OrV2,
  type ScenePoseReplayV2,
} from './scene-pose-replay.js';

type Vec3 = readonly [number, number, number];
type Quaternion = readonly [number, number, number, number];

function canonicalDurationMs(frameCount: number, fixedTimestepMs: number): number {
  const computed = frameCount * fixedTimestepMs;
  const integer = Math.round(computed);
  const tolerance = Math.max(1, Math.abs(computed)) * Number.EPSILON * 2;
  return Math.abs(computed - integer) <= tolerance ? integer : computed;
}

export function scenePoseReplayDurationMsV1(replay: ScenePoseReplayV1): number {
  return canonicalDurationMs(replay.frameCount, replay.provenance.fixedTimestepMs);
}

export function scenePoseReplayDurationMsV1OrV2(replay: ScenePoseReplayV1OrV2): number {
  return canonicalDurationMs(replay.frameCount, replay.provenance.fixedTimestepMs);
}

export function scenePoseReplayPlaybackV1(
  replay: ScenePoseReplayV1OrV2,
): ScenePoseReplayPlaybackV1 {
  return replay.schemaVersion === STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2 ? replay.playback : 'loop';
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function interpolateVec3(
  values: Float32Array,
  frameA: number,
  frameB: number,
  alpha: number,
): Vec3 {
  const a = frameA * 3;
  const b = frameB * 3;
  return [
    lerp(values[a]!, values[b]!, alpha),
    lerp(values[a + 1]!, values[b + 1]!, alpha),
    lerp(values[a + 2]!, values[b + 2]!, alpha),
  ];
}

function normalize(quaternion: Quaternion): Quaternion {
  const length = Math.hypot(...quaternion);
  return quaternion.map((component) => component / length) as unknown as Quaternion;
}

function interpolateQuaternion(
  values: Float32Array,
  frameA: number,
  frameB: number,
  alpha: number,
): Quaternion {
  const a = frameA * 4;
  const b = frameB * 4;
  const from = normalize([values[a]!, values[a + 1]!, values[a + 2]!, values[a + 3]!]);
  let to = normalize([values[b]!, values[b + 1]!, values[b + 2]!, values[b + 3]!]);
  let dot = from[0] * to[0] + from[1] * to[1] + from[2] * to[2] + from[3] * to[3];
  if (dot < 0) {
    to = [-to[0], -to[1], -to[2], -to[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return normalize([
      lerp(from[0], to[0], alpha),
      lerp(from[1], to[1], alpha),
      lerp(from[2], to[2], alpha),
      lerp(from[3], to[3], alpha),
    ]);
  }
  const theta = Math.acos(Math.min(1, dot));
  const sinTheta = Math.sin(theta);
  const fromWeight = Math.sin((1 - alpha) * theta) / sinTheta;
  const toWeight = Math.sin(alpha * theta) / sinTheta;
  return normalize([
    from[0] * fromWeight + to[0] * toWeight,
    from[1] * fromWeight + to[1] * toWeight,
    from[2] * fromWeight + to[2] * toWeight,
    from[3] * fromWeight + to[3] * toWeight,
  ]);
}

/** Samples an accepted cyclic or finite replay without rescanning its frame arrays. */
export function sampleValidatedScenePoseReplayV1OrV2(
  replay: ScenePoseReplayV1OrV2,
  timeMs: number,
): SampledScenePoseReplayV2 {
  if (!Number.isFinite(timeMs)) {
    throw new Error(
      `Cannot sample Studio scene pose replay at ${String(timeMs)} ms; expected a finite time.`,
    );
  }
  const duration = scenePoseReplayDurationMsV1OrV2(replay);
  let playbackTimeMs: number;
  if (scenePoseReplayPlaybackV1(replay) === 'once') {
    playbackTimeMs = Math.min(duration, Math.max(0, timeMs));
  } else {
    const remainder = timeMs % duration;
    // Adding duration to a positive remainder can erase a representable
    // event-boundary epsilon. Only negative values need the offset.
    playbackTimeMs = remainder < 0 ? remainder + duration : remainder === 0 ? 0 : remainder;
  }
  const framePosition = playbackTimeMs / replay.provenance.fixedTimestepMs;
  const frameA = Math.min(replay.frameCount - 1, Math.floor(framePosition));
  const frameB = Math.min(frameA + 1, replay.frameCount - 1);
  const alpha = frameB === frameA
    ? 0
    : Math.max(0, Math.min(1, framePosition - frameA));
  let eventEnd = 0;
  let eventHigh = replay.events.length;
  while (eventEnd < eventHigh) {
    const middle = (eventEnd + eventHigh) >>> 1;
    if (replay.events[middle]!.timeMs <= playbackTimeMs) eventEnd = middle + 1;
    else eventHigh = middle;
  }
  const placements: readonly SampledScenePosePlacementV1[] = replay.tracks.map((track) => ({
    placementId: track.placementId,
    translation: interpolateVec3(track.translations, frameA, frameB, alpha),
    quaternion: interpolateQuaternion(track.quaternions, frameA, frameB, alpha),
    linearVelocity: interpolateVec3(track.linearVelocities, frameA, frameB, alpha),
    angularVelocity: interpolateVec3(track.angularVelocities, frameA, frameB, alpha),
  }));
  return {
    playbackTimeMs,
    frameA,
    frameB,
    alpha,
    placements,
    eventsThroughTime: replay.events.slice(0, eventEnd),
  };
}

/**
 * Samples an accepted cyclic V1 replay. The final recorded frame is held
 * through the last interval; wrapping to zero is an explicit replay reset.
 */
export function sampleValidatedScenePoseReplayV1(
  replay: ScenePoseReplayV1,
  timeMs: number,
): SampledScenePoseReplayV1 {
  const sample = sampleValidatedScenePoseReplayV1OrV2(replay, timeMs);
  return {
    wrappedTimeMs: sample.playbackTimeMs,
    frameA: sample.frameA,
    frameB: sample.frameB,
    alpha: sample.alpha,
    placements: sample.placements,
    eventsThroughTime: sample.eventsThroughTime,
  };
}

/** Validates once for a one-off sample; frame loops should use the validated sampler. */
export function sampleScenePoseReplayV1(
  replay: ScenePoseReplayV1,
  timeMs: number,
): SampledScenePoseReplayV1 {
  const issues = validateScenePoseReplayV1(replay);
  if (issues.length > 0) {
    const shown = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    const omitted = issues.length > 8 ? `; plus ${String(issues.length - 8)} more issue(s)` : '';
    throw new Error(`Cannot sample Studio scene pose replay: ${shown}${omitted}`);
  }
  return sampleValidatedScenePoseReplayV1(replay, timeMs);
}

/** Validates once for a one-off finite sample; frame loops should use the validated sampler. */
export function sampleScenePoseReplayV2(
  replay: ScenePoseReplayV2,
  timeMs: number,
): SampledScenePoseReplayV2 {
  const issues = validateScenePoseReplayV2(replay);
  if (issues.length > 0) {
    const shown = issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    const omitted = issues.length > 8 ? `; plus ${String(issues.length - 8)} more issue(s)` : '';
    throw new Error(`Cannot sample Studio scene pose replay: ${shown}${omitted}`);
  }
  return sampleValidatedScenePoseReplayV1OrV2(replay, timeMs);
}
