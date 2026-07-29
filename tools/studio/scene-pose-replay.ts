import type { GenomeIssueV1 } from './model.js';
/**
 * Private Studio evidence produced by an external solver or authored
 * choreography. It records observations; it is not a solver or integrator.
 */
export const STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1 = 'studio.scene-pose-replay/1' as const;
export const STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2 = 'studio.scene-pose-replay/2' as const;
export type ScenePoseReplayPlaybackV1 = 'loop' | 'once';
export const MAX_POSE_REPLAY_FRAMES = 36_000;
export const MAX_POSE_REPLAY_TRACKS = 4_096;
export const MAX_POSE_REPLAY_SAMPLES = 1_000_000;
export const MAX_POSE_REPLAY_EVENTS = 65_536;
export const MAX_POSE_REPLAY_EVENT_MEMBERS = 256;
export const MAX_POSE_REPLAY_DURATION_MS = 3_600_000;
type Vec3 = readonly [number, number, number]; type Quaternion = readonly [number, number, number, number];
export interface ScenePoseReplaySolverV1 { readonly name: string; readonly version: string }
export interface ScenePoseReplayProvenanceV1 {
  readonly solver: ScenePoseReplaySolverV1;
  /** Milliseconds between adjacent recorded frames. */
  readonly fixedTimestepMs: number;
  /** World units per second squared. */
  readonly gravity: Vec3;
  readonly inputHash: string;
  readonly finalHash: string;
  /** Stable claims made by the producer, not guarantees made by Voxel. */
  readonly lawLabels: readonly string[];
  readonly capabilityLabels: readonly string[];
}
export interface ScenePoseReplayTrackV1 {
  readonly placementId: string;
  /** World-space XYZ translation in world units per frame. */
  readonly translations: Float32Array;
  /** World-space XYZ velocity in world units per second per frame. */
  readonly linearVelocities: Float32Array;
  /** World-axis XYZ angular velocity in radians per second per frame. */
  readonly angularVelocities: Float32Array;
  /** XYZW unit rotation from placement-local axes into world axes per frame. */
  readonly quaternions: Float32Array;
}
interface EventBaseV1 { readonly id: string; readonly timeMs: number; readonly placementId: string }
export interface ScenePoseReplayAssembledEventV1 extends EventBaseV1 {
  readonly type: 'assembled';
  readonly assemblyId: string;
  /** Complete membership immediately after this event. */
  readonly memberPlacementIds: readonly string[];
}
export interface ScenePoseReplayReleasedEventV1 extends EventBaseV1 {
  readonly type: 'released';
  readonly assemblyId: string;
  /** Complete membership immediately after this event. */
  readonly remainingMemberPlacementIds: readonly string[];
}
export interface ScenePoseReplayContactEventV1 extends EventBaseV1 {
  readonly type: 'contact';
  readonly otherPlacementId: string;
  /** World-space point and unit normal directed from the other placement to the primary placement. */
  readonly point: Vec3;
  readonly normal: Vec3;
  /** Nonnegative impulse in producer mass-units times world-units per second. */
  readonly normalImpulse: number;
}
export interface ScenePoseReplayCollectedEventV1 extends EventBaseV1 {
  readonly type: 'collected'; readonly collectorPlacementId: string;
}
export type ScenePoseReplayEventV1 = ScenePoseReplayAssembledEventV1 | ScenePoseReplayReleasedEventV1
  | ScenePoseReplayContactEventV1 | ScenePoseReplayCollectedEventV1;
export interface ScenePoseReplayV1 {
  readonly schemaVersion: typeof STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1;
  readonly sceneId: string;
  readonly frameCount: number;
  readonly provenance: ScenePoseReplayProvenanceV1;
  readonly tracks: readonly ScenePoseReplayTrackV1[];
  /** Nondecreasing; array order resolves equal-time events. */
  readonly events: readonly ScenePoseReplayEventV1[];
}
/**
 * A finite observation that must not invent a physical seam at its boundary.
 *
 * V1 remains the cyclic replay contract. V2 deliberately supports only
 * one-shot playback: Studio clamps to the final recorded state and waits for
 * an explicit restart.
 */
export interface ScenePoseReplayV2 {
  readonly schemaVersion: typeof STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2;
  readonly playback: 'once';
  readonly sceneId: string;
  readonly frameCount: number;
  readonly provenance: ScenePoseReplayProvenanceV1;
  readonly tracks: readonly ScenePoseReplayTrackV1[];
  /** Nondecreasing; array order resolves equal-time events. */
  readonly events: readonly ScenePoseReplayEventV1[];
}
export type ScenePoseReplayV1OrV2 = ScenePoseReplayV1 | ScenePoseReplayV2;
export interface SampledScenePosePlacementV1 {
  readonly placementId: string;
  readonly translation: Vec3;
  readonly quaternion: Quaternion;
  readonly linearVelocity: Vec3;
  readonly angularVelocity: Vec3;
}
export interface SampledScenePoseReplayV1 {
  readonly wrappedTimeMs: number;
  readonly frameA: number;
  readonly frameB: number;
  readonly alpha: number;
  readonly placements: readonly SampledScenePosePlacementV1[];
  readonly eventsThroughTime: readonly ScenePoseReplayEventV1[];
}
export interface SampledScenePoseReplayV2 {
  /** Input time clamped to the finite observation interval. */
  readonly playbackTimeMs: number;
  readonly frameA: number;
  readonly frameB: number;
  readonly alpha: number;
  readonly placements: readonly SampledScenePosePlacementV1[];
  readonly eventsThroughTime: readonly ScenePoseReplayEventV1[];
}
type UnknownRecord = Record<string, unknown>;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const LABEL_PATTERN = /^[a-z][a-z0-9]*(?:[._:/-][a-z0-9]+)*$/;
const MAX_TEXT_LENGTH = 128;
const MAX_LABELS = 64;
const UNIT_TOLERANCE = 1e-3;
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function durationMs(frameCount: number, fixedTimestepMs: number): number {
  const computed = frameCount * fixedTimestepMs;
  const integer = Math.round(computed);
  return Math.abs(computed - integer) <= Math.max(1, Math.abs(computed)) * Number.EPSILON * 2
    ? integer : computed;
}
function keys(value: UnknownRecord, path: string, allowed: readonly string[], issues: GenomeIssueV1[]): void {
  const expected = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!expected.has(key)) {
      issues.push({
        path: `${path}.${key}`,
        message: `Unexpected field '${key}'; allowed fields are ${allowed.join(', ')}.`,
      });
    }
  });
}
function text(value: unknown, path: string, issues: GenomeIssueV1[], maximum = MAX_TEXT_LENGTH): value is string {
  if (typeof value === 'string' && value.length > 0 && value.trim() === value && value.length <= maximum) return true;
  issues.push({ path, message: `Expected a nonempty, trimmed string of at most ${String(maximum)} characters.` });
  return false;
}
function vec3(value: unknown, path: string, issues: GenomeIssueV1[], unit = false): value is Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    issues.push({ path, message: 'Expected exactly three finite numbers.' });
    return false;
  }
  let valid = true;
  for (let index = 0; index < value.length; index += 1) {
    const component: unknown = value[index];
    if (!finite(component)) {
      issues.push({ path: `${path}[${String(index)}]`, message: `Expected a finite number; received ${String(component)}.` });
      valid = false;
    }
  }
  if (unit) {
    const length = Math.hypot(value[0] as number, value[1] as number, value[2] as number);
    if (Math.abs(length - 1) > UNIT_TOLERANCE) {
      issues.push({ path, message: `Expected a unit vector within ${String(UNIT_TOLERANCE)}; length was ${String(length)}.` });
      valid = false;
    }
  }
  return valid;
}
function stringList(
  value: unknown,
  path: string,
  issues: GenomeIssueV1[],
  maximum: number,
  requireOne: boolean,
  labels: boolean,
): readonly string[] | undefined {
  if (!Array.isArray(value) || (requireOne && value.length === 0) || value.length > maximum) {
    issues.push({ path, message: `Expected ${requireOne ? 'one to' : 'zero to'} ${String(maximum)} strings.` });
    return undefined;
  }
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item: unknown = value[index];
    const itemPath = `${path}[${String(index)}]`;
    if (!text(item, itemPath, issues, 64)) continue;
    if (labels && !LABEL_PATTERN.test(item)) {
      issues.push({ path: itemPath, message: `Expected a stable lowercase label; received '${item}'.` });
    }
    if (seen.has(item)) issues.push({ path: itemPath, message: `Duplicate value '${item}' is not allowed.` });
    seen.add(item);
  }
  return value as readonly string[];
}
function floatFrames(
  value: unknown,
  path: string,
  frameCount: number | undefined,
  width: number,
  issues: GenomeIssueV1[],
): value is Float32Array {
  if (!(value instanceof Float32Array)) {
    const received = isRecord(value) && typeof value.constructor === 'function'
      ? value.constructor.name
      : typeof value;
    issues.push({ path, message: `Expected a Float32Array; received ${received}.` });
    return false;
  }
  if (frameCount !== undefined && value.length !== frameCount * width) {
    issues.push({
      path,
      message: `Expected ${String(frameCount * width)} values (${String(frameCount)} frames x ${String(width)}); received ${String(value.length)}.`,
    });
  }
  value.forEach((component, index) => {
    if (!Number.isFinite(component)) {
      issues.push({ path: `${path}[${String(index)}]`, message: `Expected a finite Float32 value; received ${String(component)}.` });
    }
  });
  return true;
}
function provenance(value: unknown, issues: GenomeIssueV1[]): number | undefined {
  if (!isRecord(value)) {
    issues.push({ path: '$.provenance', message: 'Expected a provenance object.' });
    return undefined;
  }
  keys(value, '$.provenance', [
    'solver', 'fixedTimestepMs', 'gravity', 'inputHash', 'finalHash', 'lawLabels', 'capabilityLabels',
  ], issues);
  if (!isRecord(value.solver)) {
    issues.push({ path: '$.provenance.solver', message: 'Expected a solver object with name and version.' });
  } else {
    keys(value.solver, '$.provenance.solver', ['name', 'version'], issues);
    text(value.solver.name, '$.provenance.solver.name', issues);
    text(value.solver.version, '$.provenance.solver.version', issues, 64);
  }
  let timestep: number | undefined;
  if (!finite(value.fixedTimestepMs) || value.fixedTimestepMs <= 0 || value.fixedTimestepMs > 1_000) {
    issues.push({
      path: '$.provenance.fixedTimestepMs',
      message: `Expected a finite timestep greater than 0 and at most 1000 ms; received ${String(value.fixedTimestepMs)}.`,
    });
  } else timestep = value.fixedTimestepMs;
  vec3(value.gravity, '$.provenance.gravity', issues);
  (['inputHash', 'finalHash'] as const).forEach((field) => {
    if (typeof value[field] !== 'string' || !HASH_PATTERN.test(value[field])) {
      issues.push({
        path: `$.provenance.${field}`,
        message: `Expected 'sha256:' followed by 64 lowercase hexadecimal digits; received ${String(value[field])}.`,
      });
    }
  });
  stringList(value.lawLabels, '$.provenance.lawLabels', issues, MAX_LABELS, true, true);
  stringList(value.capabilityLabels, '$.provenance.capabilityLabels', issues, MAX_LABELS, true, true);
  return timestep;
}
function tracks(value: unknown, frameCount: number | undefined, issues: GenomeIssueV1[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_POSE_REPLAY_TRACKS) {
    issues.push({
      path: '$.tracks',
      message: `Expected an array containing 1 through ${String(MAX_POSE_REPLAY_TRACKS)} pose tracks.`,
    });
    return ids;
  }
  if (frameCount !== undefined && frameCount * value.length > MAX_POSE_REPLAY_SAMPLES) {
    issues.push({
      path: '$.tracks',
      message: `Replay has ${String(frameCount * value.length)} frame-track samples; maximum is ${String(MAX_POSE_REPLAY_SAMPLES)}.`,
    });
  }
  for (let index = 0; index < value.length; index += 1) {
    const track: unknown = value[index];
    const path = `$.tracks[${String(index)}]`;
    if (!isRecord(track)) {
      issues.push({ path, message: 'Expected a pose track object.' });
      continue;
    }
    keys(track, path, [
      'placementId', 'translations', 'quaternions', 'linearVelocities', 'angularVelocities',
    ], issues);
    if (text(track.placementId, `${path}.placementId`, issues)) {
      if (ids.has(track.placementId)) {
        issues.push({ path: `${path}.placementId`, message: `Duplicate placement id '${track.placementId}' is not allowed.` });
      }
      ids.add(track.placementId);
    }
    floatFrames(track.translations, `${path}.translations`, frameCount, 3, issues);
    if (floatFrames(track.quaternions, `${path}.quaternions`, frameCount, 4, issues)) {
      for (let frame = 0; frame * 4 < track.quaternions.length; frame += 1) {
        const offset = frame * 4;
        const length = Math.hypot(
          track.quaternions[offset]!, track.quaternions[offset + 1]!,
          track.quaternions[offset + 2]!, track.quaternions[offset + 3]!,
        );
        if (Number.isFinite(length) && Math.abs(length - 1) > UNIT_TOLERANCE) {
          issues.push({
            path: `${path}.quaternions[frame ${String(frame)}]`,
            message: `Expected a unit XYZW quaternion within ${String(UNIT_TOLERANCE)}; length was ${String(length)}.`,
          });
        }
      }
    }
    floatFrames(track.linearVelocities, `${path}.linearVelocities`, frameCount, 3, issues);
    floatFrames(track.angularVelocities, `${path}.angularVelocities`, frameCount, 3, issues);
  }
  return ids;
}
function reference(
  value: unknown,
  path: string,
  placementIds: ReadonlySet<string>,
  issues: GenomeIssueV1[],
): value is string {
  if (!text(value, path, issues)) return false;
  if (placementIds.has(value)) return true;
  issues.push({ path, message: `Placement '${value}' has no pose track in this replay.` });
  return false;
}
function events(
  value: unknown,
  placementIds: ReadonlySet<string>,
  durationMs: number | undefined,
  issues: GenomeIssueV1[],
): void {
  if (!Array.isArray(value) || value.length > MAX_POSE_REPLAY_EVENTS) {
    issues.push({ path: '$.events', message: `Expected an array of at most ${String(MAX_POSE_REPLAY_EVENTS)} events.` });
    return;
  }
  const ids = new Set<string>();
  let previousTime = -Infinity;
  for (let index = 0; index < value.length; index += 1) {
    const event: unknown = value[index];
    const path = `$.events[${String(index)}]`;
    if (!isRecord(event)) {
      issues.push({ path, message: 'Expected an event object.' });
      continue;
    }
    const common = ['id', 'type', 'timeMs', 'placementId'];
    if (text(event.id, `${path}.id`, issues)) {
      if (ids.has(event.id)) issues.push({ path: `${path}.id`, message: `Duplicate event id '${event.id}' is not allowed.` });
      ids.add(event.id);
    }
    const primary = reference(event.placementId, `${path}.placementId`, placementIds, issues)
      ? event.placementId
      : undefined;
    if (!finite(event.timeMs) || event.timeMs < 0 || (durationMs !== undefined && event.timeMs >= durationMs)) {
      issues.push({
        path: `${path}.timeMs`,
        message: `Expected a finite event time in [0, ${durationMs === undefined ? 'replay duration' : String(durationMs)}); received ${String(event.timeMs)}.`,
      });
    } else {
      if (event.timeMs < previousTime) {
        issues.push({
          path: `${path}.timeMs`,
          message: `Events must be in nondecreasing time order; ${String(event.timeMs)} followed ${String(previousTime)}.`,
        });
      }
      previousTime = event.timeMs;
    }
    if (event.type === 'assembled') {
      keys(event, path, [...common, 'assemblyId', 'memberPlacementIds'], issues);
      text(event.assemblyId, `${path}.assemblyId`, issues);
      const members = stringList(event.memberPlacementIds, `${path}.memberPlacementIds`, issues,
        MAX_POSE_REPLAY_EVENT_MEMBERS, true, false);
      members?.forEach((member, memberIndex) => {
        reference(member, `${path}.memberPlacementIds[${String(memberIndex)}]`, placementIds, issues);
      });
      if (members !== undefined && members.length < 2) {
        issues.push({ path: `${path}.memberPlacementIds`, message: 'An assembly must contain at least two placements.' });
      }
      if (primary !== undefined && members !== undefined && !members.includes(primary)) {
        issues.push({ path: `${path}.memberPlacementIds`, message: `Assembly membership must include primary placement '${primary}'.` });
      }
    } else if (event.type === 'released') {
      keys(event, path, [...common, 'assemblyId', 'remainingMemberPlacementIds'], issues);
      text(event.assemblyId, `${path}.assemblyId`, issues);
      const remaining = stringList(event.remainingMemberPlacementIds, `${path}.remainingMemberPlacementIds`,
        issues, MAX_POSE_REPLAY_EVENT_MEMBERS, false, false);
      remaining?.forEach((member, memberIndex) => {
        reference(member, `${path}.remainingMemberPlacementIds[${String(memberIndex)}]`, placementIds, issues);
      });
      if (primary !== undefined && remaining?.includes(primary)) {
        issues.push({
          path: `${path}.remainingMemberPlacementIds`,
          message: `Released placement '${primary}' cannot remain in the assembly membership.`,
        });
      }
    } else if (event.type === 'contact') {
      keys(event, path, [...common, 'otherPlacementId', 'point', 'normal', 'normalImpulse'], issues);
      const other = reference(event.otherPlacementId, `${path}.otherPlacementId`, placementIds, issues)
        ? event.otherPlacementId
        : undefined;
      if (primary !== undefined && other === primary) {
        issues.push({ path: `${path}.otherPlacementId`, message: 'A contact must reference two different placements.' });
      }
      vec3(event.point, `${path}.point`, issues);
      vec3(event.normal, `${path}.normal`, issues, true);
      if (!finite(event.normalImpulse) || event.normalImpulse < 0) {
        issues.push({
          path: `${path}.normalImpulse`,
          message: `Expected a finite nonnegative impulse; received ${String(event.normalImpulse)}.`,
        });
      }
    } else if (event.type === 'collected') {
      keys(event, path, [...common, 'collectorPlacementId'], issues);
      const collector = reference(event.collectorPlacementId, `${path}.collectorPlacementId`, placementIds, issues)
        ? event.collectorPlacementId
        : undefined;
      if (primary !== undefined && collector === primary) {
        issues.push({ path: `${path}.collectorPlacementId`, message: 'A placement cannot collect itself.' });
      }
    } else {
      keys(event, path, common, issues);
      issues.push({
        path: `${path}.type`,
        message: `Expected assembled, released, contact, or collected; received ${String(event.type)}.`,
      });
    }
  }
}
function validateScenePoseReplayInternal(
  value: unknown,
  schemaVersion: typeof STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1
    | typeof STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2,
): readonly GenomeIssueV1[] {
  const issues: GenomeIssueV1[] = [];
  if (!isRecord(value)) return [{ path: '$', message: 'Expected a Studio scene pose replay object.' }];
  const once = schemaVersion === STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2;
  keys(
    value,
    '$',
    once
      ? ['schemaVersion', 'playback', 'sceneId', 'frameCount', 'provenance', 'tracks', 'events']
      : ['schemaVersion', 'sceneId', 'frameCount', 'provenance', 'tracks', 'events'],
    issues,
  );
  if (value.schemaVersion !== schemaVersion) {
    issues.push({
      path: '$.schemaVersion',
      message: `Expected '${schemaVersion}'; received ${String(value.schemaVersion)}.`,
    });
  }
  if (once && value.playback !== 'once') {
    issues.push({
      path: '$.playback',
      message: `Expected 'once' so a finite replay holds its last physical state; received ${String(value.playback)}.`,
    });
  }
  text(value.sceneId, '$.sceneId', issues);
  let frameCount: number | undefined;
  if (!finite(value.frameCount) || !Number.isInteger(value.frameCount)
    || value.frameCount < 1 || value.frameCount > MAX_POSE_REPLAY_FRAMES) {
    issues.push({
      path: '$.frameCount',
      message: `Expected an integer from 1 through ${String(MAX_POSE_REPLAY_FRAMES)}; received ${String(value.frameCount)}.`,
    });
  } else frameCount = value.frameCount;
  const timestep = provenance(value.provenance, issues);
  const duration = frameCount !== undefined && timestep !== undefined
    ? durationMs(frameCount, timestep)
    : undefined;
  if (duration !== undefined && duration > MAX_POSE_REPLAY_DURATION_MS) {
    issues.push({
      path: '$.provenance.fixedTimestepMs',
      message: `Replay duration is ${String(duration)} ms; maximum is ${String(MAX_POSE_REPLAY_DURATION_MS)} ms.`,
    });
  }
  const placementIds = tracks(value.tracks, frameCount, issues);
  events(value.events, placementIds, duration, issues);
  return issues;
}
/** Reports every structural, reference, finiteness, and boundedness issue in a cyclic V1 replay. */
export function validateScenePoseReplayV1(value: unknown): readonly GenomeIssueV1[] {
  return validateScenePoseReplayInternal(value, STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1);
}
/** Reports every structural, reference, finiteness, and boundedness issue in a finite V2 replay. */
export function validateScenePoseReplayV2(value: unknown): readonly GenomeIssueV1[] {
  return validateScenePoseReplayInternal(value, STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2);
}
export function validateScenePoseReplayV1OrV2(value: unknown): readonly GenomeIssueV1[] {
  if (!isRecord(value)) return [{ path: '$', message: 'Expected a Studio scene pose replay object.' }];
  if (value.schemaVersion === STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1) {
    return validateScenePoseReplayV1(value);
  }
  if (value.schemaVersion === STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2) {
    return validateScenePoseReplayV2(value);
  }
  return [{
    path: '$.schemaVersion',
    message: `Expected '${STUDIO_SCENE_POSE_REPLAY_SCHEMA_V1}' or `
      + `'${STUDIO_SCENE_POSE_REPLAY_SCHEMA_V2}'; received ${String(value.schemaVersion)}.`,
  }];
}
