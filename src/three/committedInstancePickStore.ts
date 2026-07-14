import {
  InstancedMesh,
  Matrix4,
  type Material,
} from 'three';

import type { Vec3V1 } from '../core/index.js';
import {
  raycastPresentedInstancesInternal,
  type InstancePickSourceInternal,
} from './instancePicking.js';
import type {
  InstancePickHitV1,
  PickWorkReportV1,
  PresentedFrameIdentityV1,
  PresentedItemIdentityV1,
} from './pickingContracts.js';
import { runRuntimeDisposalInternal } from './runtimeDisposal.js';

const HARD_MAX_COMMITTED_PICK_SOURCES_INTERNAL = 100_000;
const HARD_MAX_COMMITTED_PICK_INSTANCES_INTERNAL = 1_000_000;

export interface CommittedInstancePickResourceLeaseInternal {
  dispose(): void;
}

export interface CommittedInstancePickSnapshotSourceInternal {
  readonly batch: PresentedItemIdentityV1;
  readonly geometry: PresentedItemIdentityV1;
  readonly batchMaterial: PresentedItemIdentityV1;
  /** One identity per actual Three material slot. */
  readonly materials: readonly PresentedItemIdentityV1[];
  readonly mesh: InstancedMesh;
  /** Retains shared geometry and any other CPU resources until store disposal. */
  acquireResourceLeaseInternal(): CommittedInstancePickResourceLeaseInternal;
}

export interface CommittedInstancePickSnapshotLimitsInternal {
  readonly maxSources?: number;
  readonly maxInstances?: number;
}

export type CommittedInstancePickResultInternal =
  | {
      readonly status: 'hits';
      readonly hits: readonly InstancePickHitV1[];
      readonly work: PickWorkReportV1;
    }
  | {
      readonly status: 'budget-exceeded';
      readonly exhausted: 'instance-candidates' | 'instance-primitive-tests';
      readonly work: PickWorkReportV1;
    };

interface SnapshotSourceInternal {
  readonly pickSource: InstancePickSourceInternal;
  readonly batch: PresentedItemIdentityV1;
  readonly geometry: PresentedItemIdentityV1;
  readonly batchMaterial: PresentedItemIdentityV1;
  readonly materials: ReadonlyMap<string, PresentedItemIdentityV1>;
}

const matrix = new Matrix4();

function positiveLimit(name: string, value: number, hardMaximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > hardMaximum) {
    throw new RangeError(
      `${name} must be a positive safe integer no greater than ${String(hardMaximum)}.`,
    );
  }
  return value;
}

function identity(
  name: string,
  value: PresentedItemIdentityV1,
): PresentedItemIdentityV1 {
  if (typeof value.key !== 'string' || value.key.length === 0) {
    throw new TypeError(`${name}.key must be a nonempty string.`);
  }
  for (const field of ['incarnation', 'revision'] as const) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw new RangeError(`${name}.${field} must be a nonnegative safe integer.`);
    }
  }
  return Object.freeze({
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  });
}

function frameIdentity(value: PresentedFrameIdentityV1): PresentedFrameIdentityV1 {
  if (
    typeof value.worldId !== 'string'
    || value.worldId.length === 0
    || typeof value.epoch !== 'string'
    || value.epoch.length === 0
  ) {
    throw new TypeError('Committed pick frame worldId and epoch must be nonempty strings.');
  }
  for (const field of [
    'presentedRevision',
    'frameIndex',
    'deviceGeneration',
    'cameraGeneration',
  ] as const) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      throw new RangeError(`Committed pick frame ${field} must be a nonnegative safe integer.`);
    }
  }
  if (!Number.isFinite(value.frameNowMs)) {
    throw new RangeError('Committed pick frame frameNowMs must be finite.');
  }
  return Object.freeze({ ...value });
}

function sourceInstanceKeys(source: CommittedInstancePickSnapshotSourceInternal): readonly string[] {
  const count = source.mesh.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Committed pick source count must be a nonnegative safe integer.');
  }
  const keys: unknown = source.mesh.userData.instanceKeys;
  if (
    !Array.isArray(keys)
    || keys.length !== count
    || !keys.every((key: unknown) => typeof key === 'string')
  ) {
    throw new Error('Committed pick source key table must exactly match its live instance count.');
  }
  return keys;
}

function materialArray(mesh: InstancedMesh): readonly Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function cloneSource(
  input: CommittedInstancePickSnapshotSourceInternal,
  cleanup: (() => void)[],
): SnapshotSourceInternal {
  const lease = input.acquireResourceLeaseInternal();
  if (typeof lease.dispose !== 'function') {
    throw new TypeError('Committed pick source must acquire a disposable resource lease.');
  }
  cleanup.push(() => lease.dispose());

  const batch = identity('batch', input.batch);
  const geometry = identity('geometry', input.geometry);
  const batchMaterial = identity('batchMaterial', input.batchMaterial);
  const liveMaterials = materialArray(input.mesh);
  if (input.materials.length !== liveMaterials.length || input.materials.length === 0) {
    throw new Error('Committed pick material identities must match actual Three material slots.');
  }
  const materialIdentities = input.materials.map((value, index) => (
    identity(`materials[${String(index)}]`, value)
  ));
  const materialKeys = materialIdentities.map((value) => value.key);
  const materialByKey = new Map<string, PresentedItemIdentityV1>();
  for (const value of materialIdentities) {
    const prior = materialByKey.get(value.key);
    if (
      prior
      && (prior.incarnation !== value.incarnation || prior.revision !== value.revision)
    ) {
      throw new Error(`Committed pick material identity conflicts for ${value.key}.`);
    }
    materialByKey.set(value.key, value);
  }
  if (!Array.isArray(input.mesh.material) && materialKeys[0] !== batchMaterial.key) {
    throw new Error('A single-material pick source must use its batch material identity.');
  }

  const keys = sourceInstanceKeys(input);
  const ownedMaterials = liveMaterials.map((value) => value.clone());
  for (const value of ownedMaterials) cleanup.push(() => value.dispose());
  const snapshotMesh = new InstancedMesh(
    input.mesh.geometry,
    Array.isArray(input.mesh.material) ? ownedMaterials : ownedMaterials[0]!,
    Math.max(1, input.mesh.count),
  );
  cleanup.push(() => snapshotMesh.dispose());
  snapshotMesh.count = input.mesh.count;
  for (let slot = 0; slot < input.mesh.count; slot += 1) {
    input.mesh.getMatrixAt(slot, matrix);
    snapshotMesh.setMatrixAt(slot, matrix);
  }
  snapshotMesh.userData.instanceKeys = Object.freeze([...keys]);
  snapshotMesh.matrixAutoUpdate = false;
  snapshotMesh.matrixWorldAutoUpdate = false;
  snapshotMesh.matrix.copy(input.mesh.matrix);
  snapshotMesh.matrixWorld.copy(input.mesh.matrixWorld);

  return Object.freeze({
    pickSource: Object.freeze({
      batchKey: batch.key,
      geometryKey: geometry.key,
      materialKey: batchMaterial.key,
      materialKeys: Object.freeze(materialKeys),
      worldMatrixMode: 'captured' as const,
      mesh: snapshotMesh,
    }),
    batch,
    geometry,
    batchMaterial,
    materials: materialByKey,
  });
}

function releaseAfterFailure(cleanup: readonly (() => void)[], cause: unknown): never {
  const { firstError } = runRuntimeDisposalInternal([...cleanup].reverse());
  if (firstError === undefined) throw cause;
  throw new Error('Committed instance pick snapshot cleanup failed.', {
    cause: new AggregateError([cause, firstError]),
  });
}

export class CommittedInstancePickStoreInternal {
  readonly frame: PresentedFrameIdentityV1;
  readonly instanceCount: number;
  private readonly sources: readonly SnapshotSourceInternal[];
  private disposalActions: readonly (() => void)[] | null;
  private disposed = false;

  constructor(
    frame: PresentedFrameIdentityV1,
    inputs: readonly CommittedInstancePickSnapshotSourceInternal[],
    limits: CommittedInstancePickSnapshotLimitsInternal = {},
  ) {
    this.frame = frameIdentity(frame);
    const maxSources = positiveLimit(
      'maxSources',
      limits.maxSources ?? HARD_MAX_COMMITTED_PICK_SOURCES_INTERNAL,
      HARD_MAX_COMMITTED_PICK_SOURCES_INTERNAL,
    );
    const maxInstances = positiveLimit(
      'maxInstances',
      limits.maxInstances ?? HARD_MAX_COMMITTED_PICK_INSTANCES_INTERNAL,
      HARD_MAX_COMMITTED_PICK_INSTANCES_INTERNAL,
    );
    if (inputs.length > maxSources) throw new RangeError('Committed pick source budget exceeded.');
    const batchKeys = new Set<string>();
    let instanceCount = 0;
    for (const input of inputs) {
      if (batchKeys.has(input.batch.key)) {
        throw new Error(`Duplicate committed pick batch key: ${input.batch.key}`);
      }
      batchKeys.add(input.batch.key);
      instanceCount += sourceInstanceKeys(input).length;
      if (!Number.isSafeInteger(instanceCount) || instanceCount > maxInstances) {
        throw new RangeError('Committed pick instance snapshot budget exceeded.');
      }
    }

    const cleanup: (() => void)[] = [];
    try {
      this.sources = Object.freeze(inputs.map((input) => cloneSource(input, cleanup)));
    } catch (error) {
      releaseAfterFailure(cleanup, error);
    }
    this.instanceCount = instanceCount;
    this.disposalActions = Object.freeze([...cleanup].reverse());
  }

  get disposalCompleteInternal(): boolean { return this.disposalActions === null; }

  pickRayInternal(
    origin: Vec3V1,
    direction: Vec3V1,
    maxDistance: number,
    maxCandidates: number,
    maxPrimitiveTests: number,
    maxHits: number,
  ): CommittedInstancePickResultInternal {
    if (this.disposed) throw new Error('Committed instance pick store is disposed.');
    const result = raycastPresentedInstancesInternal(
      this.sources.map((source) => source.pickSource),
      origin,
      direction,
      maxDistance,
      maxCandidates,
      maxPrimitiveTests,
      maxHits,
    );
    const work = Object.freeze({
      voxelSteps: 0,
      instanceCandidates: result.instanceCandidates,
      instancePrimitiveTests: result.instancePrimitiveTests,
    });
    if (result.status === 'budget-exceeded') {
      return Object.freeze({ status: 'budget-exceeded', exhausted: result.exhausted, work });
    }
    const sourceByBatch = new Map(this.sources.map((source) => [source.batch.key, source]));
    const hits = result.hits.map((hit): InstancePickHitV1 => {
      const source = sourceByBatch.get(hit.batchKey);
      const material = source?.materials.get(hit.materialKey);
      if (!source || !material) {
        throw new Error('Committed instance hit does not match its snapshotted resource identities.');
      }
      if (
        source.geometry.key !== hit.geometryKey
        || source.batchMaterial.key !== hit.batchMaterialKey
      ) {
        throw new Error('Committed instance hit does not match its snapshotted resource identities.');
      }
      return Object.freeze({
        ...this.frame,
        lane: 'instance',
        distance: hit.distance,
        point: Object.freeze({ ...hit.point }),
        normal: Object.freeze({ ...hit.normal }),
        batch: source.batch,
        geometry: source.geometry,
        material,
        instanceKey: hit.instanceKey,
      });
    });
    return Object.freeze({ status: 'hits', hits: Object.freeze(hits), work });
  }

  dispose(): void {
    this.disposed = true;
    if (!this.disposalActions) return;
    const { remaining, firstError } = runRuntimeDisposalInternal(this.disposalActions);
    this.disposalActions = remaining.length > 0 ? Object.freeze(remaining) : null;
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) {
      throw new Error('Committed instance pick store disposal failed.', { cause: firstError });
    }
  }
}

export class PreparedInstancePickCandidateInternal {
  private state: 'prepared' | 'committed' | 'discarded' = 'prepared';

  constructor(private store: CommittedInstancePickStoreInternal | null) {}

  commitInternal(): CommittedInstancePickStoreInternal {
    if (this.state !== 'prepared' || !this.store) {
      throw new Error(`Prepared instance pick candidate is already ${this.state}.`);
    }
    this.state = 'committed';
    const store = this.store;
    this.store = null;
    return store;
  }

  dispose(): void {
    if (this.state === 'committed') return;
    this.state = 'discarded';
    if (!this.store) return;
    this.store.dispose();
    if (this.store.disposalCompleteInternal) this.store = null;
  }
}

export function prepareInstancePickCandidateInternal(
  frame: PresentedFrameIdentityV1,
  sources: readonly CommittedInstancePickSnapshotSourceInternal[],
  limits?: CommittedInstancePickSnapshotLimitsInternal,
): PreparedInstancePickCandidateInternal {
  return new PreparedInstancePickCandidateInternal(
    new CommittedInstancePickStoreInternal(frame, sources, limits),
  );
}
