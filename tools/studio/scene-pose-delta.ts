import type {
  InstanceTransformAnimationV1,
  PatchBatchInstancesV1,
  RenderDeltaV1,
  RenderSnapshotV1,
} from '../../src/core/index.js';

export interface ScenePlacementPoseV1 {
  /** World-space translation of the rendered instance origin. */
  readonly translation: readonly [number, number, number];
  /** Unit quaternion [x, y, z, w], already validated by the replay provider. */
  readonly quaternion: readonly [number, number, number, number];
}

export type ValidatedScenePlacementPoseMapV1 =
  ReadonlyMap<string, ScenePlacementPoseV1>;

export interface ScenePoseDeltaIssueV1 {
  readonly code:
    | 'pose.instance-duplicate'
    | 'pose.instance-missing'
    | 'pose.revision-not-next';
  readonly path: string;
  readonly message: string;
}

export class ScenePoseDeltaError extends Error {
  constructor(readonly issues: readonly ScenePoseDeltaIssueV1[]) {
    super(`Scene pose delta cannot build: ${
      issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')
    }`);
    this.name = 'ScenePoseDeltaError';
  }
}

interface InstanceLocation {
  readonly batchIndex: number;
  readonly slot: number;
}

function posePath(id: string): string {
  return `poses[${JSON.stringify(id)}]`;
}

function writePoseMatrix(
  target: Float32Array,
  offset: number,
  pose: ScenePlacementPoseV1,
): void {
  const [x, y, z, w] = pose.quaternion;
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;

  // Column-major rigid transform, matching RenderSnapshotV1 instance matrices.
  target[offset] = 1 - (yy + zz);
  target[offset + 1] = xy + wz;
  target[offset + 2] = xz - wy;
  target[offset + 3] = 0;
  target[offset + 4] = xy - wz;
  target[offset + 5] = 1 - (xx + zz);
  target[offset + 6] = yz + wx;
  target[offset + 7] = 0;
  target[offset + 8] = xz + wy;
  target[offset + 9] = yz - wx;
  target[offset + 10] = 1 - (xx + yy);
  target[offset + 11] = 0;
  target[offset + 12] = pose.translation[0];
  target[offset + 13] = pose.translation[1];
  target[offset + 14] = pose.translation[2];
  target[offset + 15] = 1;
}

function neutralAnimation(
  source: InstanceTransformAnimationV1,
  count: number,
): InstanceTransformAnimationV1 {
  return {
    schemaVersion: source.schemaVersion,
    ...(source.rotationMode === undefined ? {} : { rotationMode: source.rotationMode }),
    periodsMs: new Float32Array(count),
    phasesRadians: new Float32Array(count),
    translationAmplitudes: new Float32Array(count * 3),
    rotationAmplitudesRadians: new Float32Array(count * 3),
    scaleAmplitudes: new Float32Array(count * 3),
  };
}

function copyColors(source: Uint8Array, slots: readonly number[]): Uint8Array {
  const copy = new Uint8Array(slots.length * 4);
  slots.forEach((slot, targetSlot) => {
    const sourceOffset = slot * 4;
    copy.set(source.subarray(sourceOffset, sourceOffset + 4), targetSlot * 4);
  });
  return copy;
}

/**
 * Projects authoritative world-space placement poses into sparse render work.
 *
 * The snapshot and pose map have already crossed their respective validation
 * boundaries. This adapter resolves placement identity and preserves required
 * batch lane layouts. An authoritative replay pose replaces procedural
 * per-instance motion for each tracked slot, so its animation lane is retained
 * but explicitly disabled; it neither samples time nor advances a simulation.
 */
export function buildScenePoseDeltaV1(
  snapshot: RenderSnapshotV1,
  poses: ValidatedScenePlacementPoseMapV1,
  nextRevision: number,
): RenderDeltaV1 {
  const issues: ScenePoseDeltaIssueV1[] = [];
  if (!Number.isSafeInteger(nextRevision) || nextRevision <= snapshot.revision) {
    issues.push({
      code: 'pose.revision-not-next',
      path: '$.revision',
      message: `Expected a safe integer greater than accepted snapshot revision ${
        String(snapshot.revision)
      }; received ${String(nextRevision)}.`,
    });
  }

  const locations = new Map<string, InstanceLocation[]>();
  snapshot.batches.forEach((batch, batchIndex) => {
    batch.instanceKeys.forEach((id, slot) => {
      if (!poses.has(id)) return;
      const matches = locations.get(id);
      const location = { batchIndex, slot };
      if (matches) matches.push(location);
      else locations.set(id, [location]);
    });
  });

  for (const id of poses.keys()) {
    const matches = locations.get(id) ?? [];
    if (matches.length === 0) {
      issues.push({
        code: 'pose.instance-missing',
        path: posePath(id),
        message: `No accepted batch contains placement instance id '${id}'.`,
      });
      continue;
    }
    if (matches.length > 1) {
      const where = matches.map(({ batchIndex, slot }) => {
        const batch = snapshot.batches[batchIndex]!;
        return `'${batch.key}' slot ${String(slot)}`;
      }).join(', ');
      issues.push({
        code: 'pose.instance-duplicate',
        path: posePath(id),
        message: `Placement instance id '${id}' is ambiguous; it occurs in ${where}. `
          + 'Pose replay ids must be unique across the accepted snapshot.',
      });
    }
  }
  if (issues.length > 0) throw new ScenePoseDeltaError(issues);

  const operations: PatchBatchInstancesV1[] = [];
  snapshot.batches.forEach((batch) => {
    const slots: number[] = [];
    batch.instanceKeys.forEach((id, slot) => {
      if (poses.has(id)) slots.push(slot);
    });
    if (slots.length === 0) return;

    const instanceKeys = slots.map((slot) => batch.instanceKeys[slot]!);
    const matrices = new Float32Array(slots.length * 16);
    instanceKeys.forEach((id, targetSlot) => {
      writePoseMatrix(matrices, targetSlot * 16, poses.get(id)!);
    });
    operations.push({
      op: 'patch-batch-instances',
      key: batch.key,
      incarnation: batch.incarnation,
      revision: nextRevision,
      removeInstanceKeys: [],
      upserts: {
        instanceKeys,
        matrices,
        ...(batch.colors === undefined ? {} : { colors: copyColors(batch.colors, slots) }),
        ...(batch.animation === undefined
          ? {}
          : { animation: neutralAnimation(batch.animation, slots.length) }),
      },
    });
  });

  return {
    schemaVersion: 'voxel.render-delta/1',
    worldId: snapshot.descriptor.worldId,
    epoch: snapshot.descriptor.epoch,
    baseRevision: snapshot.revision,
    revision: nextRevision,
    operations,
  };
}
