import { canonicalChunkCoordinateKeyV1 } from '../core/voxel-grid.js';
import {
  MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
  MAX_MESHER_ID_LENGTH_V1,
  type MesherSourceTokenV1,
} from './mesher-contract.js';
import { MAX_MESH_WORKER_ID_LENGTH_V1 } from './mesh-worker-contract.js';
import {
  MAX_MESH_SCHEDULER_RUNTIME_ID_LENGTH_V1,
  MAX_MESH_SCHEDULER_QUEUED_JOBS_V1,
  MAX_MESH_SCHEDULER_WORKERS_V1,
  type MeshSchedulerConfigV1,
  type MeshSchedulerEligibilityV1,
  type MeshSchedulerGroupV1,
  type MeshSchedulerPriorityV1,
  type MeshSchedulerWorkerPortV1,
} from './voxel-mesh-scheduler-contract.js';

export interface NormalizedMeshSchedulerJobV1 {
  readonly eligibility: MeshSchedulerEligibilityV1;
  readonly priority: MeshSchedulerPriorityV1;
  readonly coordinateKey: string;
  readonly registrationKey: string;
  readonly inputBytes: number;
  readonly maxOutputBytes: number;
  readonly queueBytes: number;
  readonly reservationBytes: number;
}

function safeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer.`);
  return value;
}

function nonnegativeInteger(value: number, name: string): number {
  safeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must be non-negative.`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  safeInteger(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive.`);
  return value;
}

function positiveIntegerAtMost(value: number, name: string, maximum: number): number {
  positiveInteger(value, name);
  if (value > maximum) throw new RangeError(`${name} exceeds ${String(maximum)}.`);
  return value;
}

function boundedString(value: string, name: string, maximum: number): string {
  if (value.length === 0) throw new RangeError(`${name} must be non-empty.`);
  if (value.length > maximum) {
    throw new RangeError(`${name} exceeds ${String(maximum)} characters.`);
  }
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  return nonnegativeInteger(left + right, name);
}

function copySource(source: MesherSourceTokenV1): MesherSourceTokenV1 {
  const coordinate = Object.freeze({
    x: safeInteger(source.coordinate.x, 'source.coordinate.x'),
    y: safeInteger(source.coordinate.y, 'source.coordinate.y'),
    z: safeInteger(source.coordinate.z, 'source.coordinate.z'),
  });
  return Object.freeze({
    coordinate,
    slotGeneration: nonnegativeInteger(source.slotGeneration, 'source.slotGeneration'),
    key: boundedString(source.key, 'source.key', MAX_MESH_WORKER_ID_LENGTH_V1),
    incarnation: nonnegativeInteger(source.incarnation, 'source.incarnation'),
    sourceRevision: nonnegativeInteger(source.sourceRevision, 'source.sourceRevision'),
    size: Object.freeze({
      x: positiveInteger(source.size.x, 'source.size.x'),
      y: positiveInteger(source.size.y, 'source.size.y'),
      z: positiveInteger(source.size.z, 'source.size.z'),
    }),
  });
}

export function validateMeshSchedulerConfigV1Internal(
  config: MeshSchedulerConfigV1,
): Readonly<MeshSchedulerConfigV1> {
  return Object.freeze({
    runtimeId: boundedString(
      config.runtimeId,
      'runtimeId',
      MAX_MESH_SCHEDULER_RUNTIME_ID_LENGTH_V1,
    ),
    workerCount: positiveIntegerAtMost(
      config.workerCount,
      'workerCount',
      MAX_MESH_SCHEDULER_WORKERS_V1,
    ),
    maxQueuedJobs: positiveIntegerAtMost(
      config.maxQueuedJobs,
      'maxQueuedJobs',
      MAX_MESH_SCHEDULER_QUEUED_JOBS_V1,
    ),
    maxQueuedBytes: positiveInteger(config.maxQueuedBytes, 'maxQueuedBytes'),
    maxStagingBytes: positiveInteger(config.maxStagingBytes, 'maxStagingBytes'),
    starvationPromotionDispatches: positiveInteger(
      config.starvationPromotionDispatches,
      'starvationPromotionDispatches',
    ),
  });
}

export function validateMeshSchedulerEpochIdentityV1Internal(
  worldId: string,
  epoch: string,
): Readonly<{ readonly worldId: string; readonly epoch: string }> {
  return Object.freeze({
    worldId: boundedString(worldId, 'worldId', MAX_MESH_WORKER_ID_LENGTH_V1),
    epoch: boundedString(epoch, 'epoch', MAX_MESH_WORKER_ID_LENGTH_V1),
  });
}

export function normalizeMeshSchedulerGroupV1Internal(
  group: MeshSchedulerGroupV1,
): readonly NormalizedMeshSchedulerJobV1[] {
  const groupId = boundedString(group.groupId, 'groupId', MAX_MESH_WORKER_ID_LENGTH_V1);
  if (group.jobs.length === 0) throw new RangeError('A scheduler group must contain a job.');
  const seenCoordinates = new Set<string>();
  let sharedWorld: string | undefined;
  let sharedEpoch: string | undefined;
  let sharedTarget: number | undefined;
  const jobs = group.jobs.map((job, index) => {
    const prefix = `jobs[${String(index)}]`;
    const source = copySource(job.source);
    const coordinateKey = canonicalChunkCoordinateKeyV1(source.coordinate);
    if (seenCoordinates.has(coordinateKey)) {
      throw new RangeError(`Scheduler group repeats coordinate ${coordinateKey}.`);
    }
    seenCoordinates.add(coordinateKey);
    const worldId = boundedString(job.worldId, `${prefix}.worldId`, MAX_MESH_WORKER_ID_LENGTH_V1);
    const epoch = boundedString(job.epoch, `${prefix}.epoch`, MAX_MESH_WORKER_ID_LENGTH_V1);
    const targetRevision = nonnegativeInteger(
      job.targetRevision,
      `${prefix}.targetRevision`,
    );
    if (sharedWorld !== undefined && sharedWorld !== worldId) {
      throw new RangeError('Every scheduler group job must share one worldId.');
    }
    if (sharedEpoch !== undefined && sharedEpoch !== epoch) {
      throw new RangeError('Every scheduler group job must share one epoch.');
    }
    if (sharedTarget !== undefined && sharedTarget !== targetRevision) {
      throw new RangeError('Every scheduler group job must share one targetRevision.');
    }
    sharedWorld = worldId;
    sharedEpoch = epoch;
    sharedTarget = targetRevision;
    const inputBytes = positiveInteger(job.inputBytes, `${prefix}.inputBytes`);
    const maxOutputBytes = nonnegativeInteger(
      job.maxOutputBytes,
      `${prefix}.maxOutputBytes`,
    );
    const visibility = job.priority.visibility;
    if (!['current-frustum', 'view-halo', 'remaining'].includes(visibility)) {
      throw new RangeError(`${prefix}.priority.visibility is unknown.`);
    }
    if (!Number.isSafeInteger(job.priority.distance) || job.priority.distance < 0) {
      throw new RangeError(`${prefix}.priority.distance must be a non-negative safe integer.`);
    }
    const eligibility: MeshSchedulerEligibilityV1 = Object.freeze({
      groupId,
      worldId,
      epoch,
      targetRevision,
      pipelineGeneration: nonnegativeInteger(
        job.pipelineGeneration,
        `${prefix}.pipelineGeneration`,
      ),
      mesherId: boundedString(job.mesherId, `${prefix}.mesherId`, MAX_MESHER_ID_LENGTH_V1),
      mesherVersion: boundedString(
        job.mesherVersion,
        `${prefix}.mesherVersion`,
        MAX_MESHER_ID_LENGTH_V1,
      ),
      materialPolicyVersion: boundedString(
        job.materialPolicyVersion,
        `${prefix}.materialPolicyVersion`,
        MAX_MESHER_ID_LENGTH_V1,
      ),
      dependencySignature: boundedString(
        job.dependencySignature,
        `${prefix}.dependencySignature`,
        MAX_MESHER_DEPENDENCY_SIGNATURE_LENGTH_V1,
      ),
      source,
    });
    return Object.freeze({
      eligibility,
      priority: Object.freeze({ visibility, distance: job.priority.distance }),
      coordinateKey,
      registrationKey: JSON.stringify([worldId, coordinateKey]),
      inputBytes,
      maxOutputBytes,
      queueBytes: checkedAdd(inputBytes, maxOutputBytes, `${prefix} queue bytes`),
      reservationBytes: checkedAdd(
        inputBytes,
        maxOutputBytes,
        `${prefix} staging reservation bytes`,
      ),
    });
  });
  return Object.freeze(jobs);
}

export function meshSchedulerGroupPeakStagingBytesV1Internal(
  jobs: readonly NormalizedMeshSchedulerJobV1[],
  workerCount: number,
): number {
  let maximumOutputs = 0;
  for (const job of jobs) {
    maximumOutputs = checkedAdd(
      maximumOutputs,
      job.maxOutputBytes,
      'group maximum output bytes',
    );
  }
  const largestInputs = jobs.map((job) => job.inputBytes).sort((left, right) => right - left);
  let activeInputs = 0;
  for (let index = 0; index < Math.min(workerCount, largestInputs.length); index += 1) {
    activeInputs = checkedAdd(
      activeInputs,
      largestInputs[index]!,
      'group active input bytes',
    );
  }
  return checkedAdd(maximumOutputs, activeInputs, 'group peak staging bytes');
}

function sameInt3(
  left: MesherSourceTokenV1['coordinate'],
  right: MesherSourceTokenV1['coordinate'],
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

/** Returns the first stale field, or null when every identity member matches. */
export function meshSchedulerEligibilityMismatchV1Internal(
  expected: MeshSchedulerEligibilityV1,
  current: MeshSchedulerEligibilityV1,
): string | null {
  for (const field of [
    'groupId',
    'worldId',
    'epoch',
    'targetRevision',
    'pipelineGeneration',
    'mesherId',
    'mesherVersion',
    'materialPolicyVersion',
    'dependencySignature',
  ] as const) {
    if (expected[field] !== current[field]) return field;
  }
  if (!sameInt3(expected.source.coordinate, current.source.coordinate)) {
    return 'source.coordinate';
  }
  for (const field of [
    'slotGeneration',
    'key',
    'incarnation',
    'sourceRevision',
  ] as const) {
    if (expected.source[field] !== current.source[field]) return `source.${field}`;
  }
  return sameInt3(expected.source.size, current.source.size) ? null : 'source.size';
}

const VISIBILITY_RANK: Readonly<Record<MeshSchedulerPriorityV1['visibility'], number>> =
  Object.freeze({ 'current-frustum': 0, 'view-halo': 1, remaining: 2 });

export function compareMeshSchedulerPriorityV1Internal(
  left: NormalizedMeshSchedulerJobV1,
  leftEnqueuedDispatch: number,
  leftRegistration: number,
  right: NormalizedMeshSchedulerJobV1,
  rightEnqueuedDispatch: number,
  rightRegistration: number,
  dispatchCount: number,
  promotionInterval: number,
): number {
  const effectiveRank = (
    job: NormalizedMeshSchedulerJobV1,
    enqueuedDispatch: number,
  ): number => VISIBILITY_RANK[job.priority.visibility]
    - Math.floor((dispatchCount - enqueuedDispatch) / promotionInterval);
  return effectiveRank(left, leftEnqueuedDispatch) - effectiveRank(right, rightEnqueuedDispatch)
    || right.eligibility.targetRevision - left.eligibility.targetRevision
    || left.priority.distance - right.priority.distance
    || left.eligibility.source.coordinate.x - right.eligibility.source.coordinate.x
    || left.eligibility.source.coordinate.y - right.eligibility.source.coordinate.y
    || left.eligibility.source.coordinate.z - right.eligibility.source.coordinate.z
    || leftRegistration - rightRegistration;
}

export function meshSchedulerResultJobIdV1Internal(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Record<string, unknown>;
  if (typeof result.identity !== 'object' || result.identity === null) return null;
  const identity = result.identity as Record<string, unknown>;
  return typeof identity.jobId === 'string' ? identity.jobId : null;
}

export function meshSchedulerUntrustedOutputBytesV1Internal(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const result = value as Record<string, unknown>;
  if (typeof result.output !== 'object' || result.output === null) return 0;
  const output = result.output as Record<string, unknown>;
  let bytes = 0;
  for (const field of ['positions', 'normals', 'paletteIndices', 'materialIndices', 'indices']) {
    const candidate = output[field];
    if (ArrayBuffer.isView(candidate)) {
      const next = bytes + candidate.byteLength;
      bytes = Number.isSafeInteger(next) ? next : Number.MAX_SAFE_INTEGER;
    }
  }
  return bytes;
}

export function assertMeshSchedulerWorkerPortV1Internal(
  value: unknown,
): MeshSchedulerWorkerPortV1 {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Mesh scheduler worker factory returned an invalid worker port.');
  }
  const port = value as Record<string, unknown>;
  if (typeof port.post !== 'function' || typeof port.terminate !== 'function') {
    throw new TypeError('Mesh scheduler worker factory returned an invalid worker port.');
  }
  if (port.requestCancellation !== undefined
    && typeof port.requestCancellation !== 'function') {
    throw new TypeError('Mesh scheduler worker cancellation hook must be a function.');
  }
  return value as MeshSchedulerWorkerPortV1;
}

export function assertMeshSchedulerLogicalTickV1Internal(
  tick: number,
  previous: number,
): number {
  nonnegativeInteger(tick, 'logicalTick');
  if (tick < previous) throw new RangeError('logicalTick must be monotonic.');
  return tick;
}
