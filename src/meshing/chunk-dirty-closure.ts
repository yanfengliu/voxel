import { stableMergeSortInternal } from '../core/bounded-sort.js';
import type {
  Int3V1,
  PaletteResourceV1,
} from '../core/contracts.js';
import { canonicalChunkCoordinateKeyV1 } from '../core/voxel-grid.js';
import {
  type ChunkIndexEntryV1,
  type ChunkIndexV1,
} from './chunk-index.js';
import {
  canonicalInvalidationOffsetsInternal,
  compareChunkCoordinatesInternal,
  nonemptyInvalidationKeyInternal,
  positiveInvalidationLimitInternal,
  uniqueInvalidationKeysInternal,
} from './chunk-invalidation-validation.js';
import { DisjointSetInternal } from './disjoint-set.js';
import { classifyPaletteChangeInternal } from './palette-invalidation.js';

export const DEFAULT_MAX_CHUNK_INVALIDATION_CHANGES_V1 = 100_000;
export const DEFAULT_MAX_CHUNK_INVALIDATION_TARGETS_V1 = 1_000_000;
export const DEFAULT_MAX_CHUNK_INVALIDATION_DEPENDENCY_CHECKS_V1 = 16_777_216;
export const DEFAULT_MAX_CHUNK_INVALIDATION_VOXEL_COMPARISONS_V1 = 16_777_216;
export const DEFAULT_MAX_CHUNK_INVALIDATION_REFERENCE_SCANS_V1 = 200_000;

export type ChunkInvalidationClassV1 = 'material-only' | 'attributes' | 'topology';

export interface PaletteResourceChangeV1 {
  readonly key: string;
  readonly before?: PaletteResourceV1;
  readonly after?: PaletteResourceV1;
}

/**
 * A material resource replacement never changes voxel topology or baked vertex
 * attributes. Referencing chunk presentations only need to bind the new lease.
 */
export interface MaterialResourceChangeV1 {
  readonly key: string;
}

/**
 * Bounded transaction summary. Every listed chunk key must exist in the old or
 * new index. The reducer is intentionally not part of this portable contract.
 */
export interface ChunkInvalidationChangeSetV1 {
  readonly chunkKeys?: readonly string[];
  readonly paletteChanges?: readonly PaletteResourceChangeV1[];
  readonly materialChanges?: readonly MaterialResourceChangeV1[];
}

export interface ChunkDirtyClosureLimitsV1 {
  readonly maxChanges: number;
  readonly maxTargets: number;
  readonly maxDependencyChecks: number;
  readonly maxVoxelComparisons: number;
  readonly maxReferenceScans: number;
}

export interface ChunkDirtyClosureInputV1 {
  readonly oldIndex: ChunkIndexV1;
  readonly newIndex: ChunkIndexV1;
  /** Source-to-dependency coordinate offsets declared by the selected mesher. */
  readonly dependencyOffsets: readonly Int3V1[];
  readonly changes: ChunkInvalidationChangeSetV1;
  readonly limits?: Partial<ChunkDirtyClosureLimitsV1>;
}

export type ChunkInvalidationReasonV1 =
  | 'chunk-created'
  | 'chunk-updated'
  | 'chunk-deleted'
  | 'chunk-moved-from'
  | 'chunk-moved-to'
  | 'dependency-changed'
  | 'palette-attributes'
  | 'palette-opacity-class'
  | 'palette-rebound'
  | 'material-rebound';

export interface ChunkPreparationTargetV1 {
  readonly coordinate: Int3V1;
  readonly coordinateKey: string;
  readonly invalidation: ChunkInvalidationClassV1;
  /** True when the coordinate itself changed, rather than only one dependency. */
  readonly direct: boolean;
  readonly reasons: readonly ChunkInvalidationReasonV1[];
  readonly oldEntry?: ChunkIndexEntryV1;
  readonly newEntry?: ChunkIndexEntryV1;
}

export interface ChunkPreparationGroupV1 {
  /** Deterministic within a transaction; revision identity is supplied by the scheduler. */
  readonly groupKey: string;
  readonly targets: readonly ChunkPreparationTargetV1[];
}

export interface ChunkDirtyClosureResultV1 {
  readonly groups: readonly ChunkPreparationGroupV1[];
  readonly targetCount: number;
}

interface MutableTarget {
  readonly coordinate: Int3V1;
  readonly coordinateKey: string;
  invalidation: ChunkInvalidationClassV1;
  direct: boolean;
  readonly reasons: Set<ChunkInvalidationReasonV1>;
  readonly oldEntry?: ChunkIndexEntryV1;
  readonly newEntry?: ChunkIndexEntryV1;
}

interface DirectSeed {
  readonly coordinate: Int3V1;
  readonly invalidation: ChunkInvalidationClassV1;
  readonly reason: ChunkInvalidationReasonV1;
}

interface MutableSeed {
  readonly coordinate: Int3V1;
  invalidation: ChunkInvalidationClassV1;
  readonly reasons: Set<ChunkInvalidationReasonV1>;
}

const CLASS_RANK: Readonly<Record<ChunkInvalidationClassV1, number>> = Object.freeze({
  'material-only': 0,
  attributes: 1,
  topology: 2,
});

const REASON_ORDER: readonly ChunkInvalidationReasonV1[] = Object.freeze([
  'chunk-created',
  'chunk-updated',
  'chunk-deleted',
  'chunk-moved-from',
  'chunk-moved-to',
  'dependency-changed',
  'palette-attributes',
  'palette-opacity-class',
  'palette-rebound',
  'material-rebound',
]);

function subtractOffset(coordinate: Int3V1, offset: Int3V1): Int3V1 {
  const result = {
    x: coordinate.x - offset.x,
    y: coordinate.y - offset.y,
    z: coordinate.z - offset.z,
  };
  if (!Number.isSafeInteger(result.x)
    || !Number.isSafeInteger(result.y)
    || !Number.isSafeInteger(result.z)) {
    throw new RangeError('A reverse dependency coordinate exceeds the safe-integer range.');
  }
  return Object.freeze(result);
}

function sameCoordinate(left: Int3V1, right: Int3V1): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function sameIndexProfile(oldIndex: ChunkIndexV1, newIndex: ChunkIndexV1): boolean {
  const before = oldIndex.profile;
  const after = newIndex.profile;
  return sameCoordinate(before.size, after.size)
    && sameCoordinate(before.gridOrigin, after.gridOrigin)
    && before.missingNeighbor === after.missingNeighbor;
}

function equalVoxels(left: Uint16Array, right: Uint16Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function maxClass(
  left: ChunkInvalidationClassV1,
  right: ChunkInvalidationClassV1,
): ChunkInvalidationClassV1 {
  return CLASS_RANK[left] >= CLASS_RANK[right] ? left : right;
}

function addReference(
  references: Map<string, Map<string, Int3V1>>,
  key: string,
  coordinate: Int3V1,
): void {
  let coordinates = references.get(key);
  if (!coordinates) {
    coordinates = new Map();
    references.set(key, coordinates);
  }
  coordinates.set(canonicalChunkCoordinateKeyV1(coordinate), coordinate);
}

function buildReferences(
  oldIndex: ChunkIndexV1,
  newIndex: ChunkIndexV1,
): {
  readonly palettes: ReadonlyMap<string, ReadonlyMap<string, Int3V1>>;
  readonly materials: ReadonlyMap<string, ReadonlyMap<string, Int3V1>>;
} {
  const palettes = new Map<string, Map<string, Int3V1>>();
  const materials = new Map<string, Map<string, Int3V1>>();
  for (const index of [oldIndex, newIndex]) {
    for (const entry of index.entries) {
      addReference(palettes, entry.chunk.paletteKey, entry.coordinate);
      addReference(materials, entry.chunk.materialKey, entry.coordinate);
    }
  }
  return { palettes, materials };
}

type ChunkReferencesInternal = ReturnType<typeof buildReferences>;

function classifySameSlotChange(
  oldEntry: ChunkIndexEntryV1,
  newEntry: ChunkIndexEntryV1,
): readonly DirectSeed[] {
  if (oldEntry.incarnation !== newEntry.incarnation
    || !equalVoxels(oldEntry.chunk.voxels, newEntry.chunk.voxels)) {
    return [{
      coordinate: newEntry.coordinate,
      invalidation: 'topology',
      reason: 'chunk-updated',
    }];
  }
  const seeds: DirectSeed[] = [];
  if (oldEntry.chunk.paletteKey !== newEntry.chunk.paletteKey) {
    seeds.push({
      coordinate: newEntry.coordinate,
      invalidation: 'attributes',
      reason: 'palette-rebound',
    });
  }
  if (oldEntry.chunk.materialKey !== newEntry.chunk.materialKey) {
    seeds.push({
      coordinate: newEntry.coordinate,
      invalidation: 'material-only',
      reason: 'material-rebound',
    });
  }
  if (seeds.length === 0 && oldEntry.sourceRevision !== newEntry.sourceRevision) {
    seeds.push({
      coordinate: newEntry.coordinate,
      invalidation: 'topology',
      reason: 'chunk-updated',
    });
  }
  return seeds;
}

function deriveChunkSeeds(
  key: string,
  oldIndex: ChunkIndexV1,
  newIndex: ChunkIndexV1,
): readonly DirectSeed[] {
  const before = oldIndex.forKey(key);
  const after = newIndex.forKey(key);
  if (!before && !after) throw new RangeError(`Changed chunk key ${key} exists in neither index.`);
  if (!before) {
    return [{ coordinate: after!.coordinate, invalidation: 'topology', reason: 'chunk-created' }];
  }
  if (!after) {
    return [{ coordinate: before.coordinate, invalidation: 'topology', reason: 'chunk-deleted' }];
  }
  if (!sameCoordinate(before.coordinate, after.coordinate)) {
    return [
      { coordinate: before.coordinate, invalidation: 'topology', reason: 'chunk-moved-from' },
      { coordinate: after.coordinate, invalidation: 'topology', reason: 'chunk-moved-to' },
    ];
  }
  return classifySameSlotChange(before, after);
}

function freezeTarget(target: MutableTarget): ChunkPreparationTargetV1 {
  return Object.freeze({
    coordinate: target.coordinate,
    coordinateKey: target.coordinateKey,
    invalidation: target.invalidation,
    direct: target.direct,
    reasons: Object.freeze(REASON_ORDER.filter((reason) => target.reasons.has(reason))),
    ...(target.oldEntry ? { oldEntry: target.oldEntry } : {}),
    ...(target.newEntry ? { newEntry: target.newEntry } : {}),
  });
}

/**
 * Computes the exact chunk-level invalidation closure for one accepted
 * transaction. Derived targets are never expanded again; grouping only unions
 * already-computed closures that share a coordinate.
 */
export function deriveChunkDirtyClosureV1(
  input: ChunkDirtyClosureInputV1,
): ChunkDirtyClosureResultV1 {
  const maxChanges = positiveInvalidationLimitInternal(
    input.limits?.maxChanges ?? DEFAULT_MAX_CHUNK_INVALIDATION_CHANGES_V1,
    'limits.maxChanges',
  );
  const maxTargets = positiveInvalidationLimitInternal(
    input.limits?.maxTargets ?? DEFAULT_MAX_CHUNK_INVALIDATION_TARGETS_V1,
    'limits.maxTargets',
  );
  const maxDependencyChecks = positiveInvalidationLimitInternal(
    input.limits?.maxDependencyChecks
      ?? DEFAULT_MAX_CHUNK_INVALIDATION_DEPENDENCY_CHECKS_V1,
    'limits.maxDependencyChecks',
  );
  const maxVoxelComparisons = positiveInvalidationLimitInternal(
    input.limits?.maxVoxelComparisons
      ?? DEFAULT_MAX_CHUNK_INVALIDATION_VOXEL_COMPARISONS_V1,
    'limits.maxVoxelComparisons',
  );
  const maxReferenceScans = positiveInvalidationLimitInternal(
    input.limits?.maxReferenceScans
      ?? DEFAULT_MAX_CHUNK_INVALIDATION_REFERENCE_SCANS_V1,
    'limits.maxReferenceScans',
  );
  if (!sameIndexProfile(input.oldIndex, input.newIndex)) {
    throw new RangeError('Dirty closure indexes must belong to the same chunk-profile lineage.');
  }
  const offsets = canonicalInvalidationOffsetsInternal(input.dependencyOffsets);
  const rawChunkKeys = input.changes.chunkKeys ?? [];
  const paletteChanges = input.changes.paletteChanges ?? [];
  const materialChanges = input.changes.materialChanges ?? [];
  const changeCount = rawChunkKeys.length + paletteChanges.length + materialChanges.length;
  if (!Number.isSafeInteger(changeCount) || changeCount > maxChanges) {
    throw new RangeError(`Invalidation change count exceeds ${String(maxChanges)}.`);
  }
  const chunkKeys = uniqueInvalidationKeysInternal(rawChunkKeys, 'changes.chunkKeys');

  let voxelComparisons = 0;
  for (const key of chunkKeys) {
    const before = input.oldIndex.forKey(key);
    const after = input.newIndex.forKey(key);
    if (!before || !after || !sameCoordinate(before.coordinate, after.coordinate)) continue;
    voxelComparisons += before.chunk.voxels.length;
    if (!Number.isSafeInteger(voxelComparisons) || voxelComparisons > maxVoxelComparisons) {
      throw new RangeError(`Invalidation voxel comparisons exceed ${String(maxVoxelComparisons)}.`);
    }
  }

  const resourceKeys = new Set<string>();
  for (const [kind, changes] of [
    ['palette', paletteChanges],
    ['material', materialChanges],
  ] as const) {
    for (let index = 0; index < changes.length; index += 1) {
      if (!(index in changes)) throw new RangeError(`${kind}Changes must be dense.`);
      const key = nonemptyInvalidationKeyInternal(
        changes[index]!.key,
        `${kind}Changes[${String(index)}].key`,
      );
      const identity = `${kind}:${key}`;
      if (resourceKeys.has(identity)) throw new RangeError(`Duplicate ${kind} change ${key}.`);
      resourceKeys.add(identity);
    }
  }

  const seeds = new Map<string, MutableSeed>();
  const addSeed = (seed: DirectSeed): void => {
    const coordinateKey = canonicalChunkCoordinateKeyV1(seed.coordinate);
    const existing = seeds.get(coordinateKey);
    if (existing) {
      existing.invalidation = maxClass(existing.invalidation, seed.invalidation);
      existing.reasons.add(seed.reason);
      return;
    }
    if (seeds.size >= maxTargets) {
      throw new RangeError(`Invalidation seed count exceeds ${String(maxTargets)}.`);
    }
    seeds.set(coordinateKey, {
      coordinate: seed.coordinate,
      invalidation: seed.invalidation,
      reasons: new Set([seed.reason]),
    });
  };
  for (const key of chunkKeys) {
    for (const seed of deriveChunkSeeds(key, input.oldIndex, input.newIndex)) addSeed(seed);
  }
  const hasResourceChanges = paletteChanges.length > 0 || materialChanges.length > 0;
  const referenceScans = hasResourceChanges
    ? input.oldIndex.entries.length + input.newIndex.entries.length
    : 0;
  if (!Number.isSafeInteger(referenceScans) || referenceScans > maxReferenceScans) {
    throw new RangeError(`Invalidation reference scans exceed ${String(maxReferenceScans)}.`);
  }
  const references: ChunkReferencesInternal = hasResourceChanges
    ? buildReferences(input.oldIndex, input.newIndex)
    : {
        palettes: new Map<string, ReadonlyMap<string, Int3V1>>(),
        materials: new Map<string, ReadonlyMap<string, Int3V1>>(),
      };
  for (const change of paletteChanges) {
    const classification = classifyPaletteChangeInternal(change);
    if (!classification) continue;
    const reason = classification === 'topology'
      ? 'palette-opacity-class'
      : 'palette-attributes';
    for (const coordinate of references.palettes.get(change.key)?.values() ?? []) {
      addSeed({ coordinate, invalidation: classification, reason });
    }
  }
  for (const change of materialChanges) {
    for (const coordinate of references.materials.get(change.key)?.values() ?? []) {
      addSeed({ coordinate, invalidation: 'material-only', reason: 'material-rebound' });
    }
  }

  let topologySeedCount = 0;
  for (const seed of seeds.values()) {
    if (seed.invalidation === 'topology') topologySeedCount += 1;
  }
  const dependencyChecks = topologySeedCount * offsets.length;
  if (!Number.isSafeInteger(dependencyChecks) || dependencyChecks > maxDependencyChecks) {
    throw new RangeError(
      `Invalidation dependency checks exceed ${String(maxDependencyChecks)}.`,
    );
  }

  const targets = new Map<string, MutableTarget>();
  const connectivity = new DisjointSetInternal();
  const addTarget = (
    coordinate: Int3V1,
    invalidation: ChunkInvalidationClassV1,
    direct: boolean,
    reasons: Iterable<ChunkInvalidationReasonV1>,
  ): string => {
    const coordinateKey = canonicalChunkCoordinateKeyV1(coordinate);
    const existing = targets.get(coordinateKey);
    if (existing) {
      existing.invalidation = maxClass(existing.invalidation, invalidation);
      existing.direct ||= direct;
      for (const reason of reasons) existing.reasons.add(reason);
      return coordinateKey;
    }
    if (targets.size >= maxTargets) {
      throw new RangeError(`Invalidation target count exceeds ${String(maxTargets)}.`);
    }
    const oldEntry = input.oldIndex.at(coordinate);
    const newEntry = input.newIndex.at(coordinate);
    targets.set(coordinateKey, {
      coordinate: Object.freeze({ ...coordinate }),
      coordinateKey,
      invalidation,
      direct,
      reasons: new Set(reasons),
      ...(oldEntry ? { oldEntry } : {}),
      ...(newEntry ? { newEntry } : {}),
    });
    connectivity.add(coordinateKey);
    return coordinateKey;
  };

  for (const seed of seeds.values()) {
    const first = addTarget(seed.coordinate, seed.invalidation, true, seed.reasons);
    if (seed.invalidation === 'topology') {
      for (const offset of offsets) {
        const candidate = subtractOffset(seed.coordinate, offset);
        if (!input.oldIndex.at(candidate) && !input.newIndex.at(candidate)) continue;
        const dependent = addTarget(candidate, 'topology', false, ['dependency-changed']);
        connectivity.union(first, dependent);
      }
    }
  }

  const components = new Map<string, MutableTarget[]>();
  for (const [key, target] of targets) {
    const root = connectivity.find(key);
    const component = components.get(root) ?? [];
    component.push(target);
    components.set(root, component);
  }
  const groups = [...components.values()].map((component) => {
    const ordered = stableMergeSortInternal(
      component,
      (left, right) => compareChunkCoordinatesInternal(left.coordinate, right.coordinate),
    );
    const groupKey = `chunk-preparation/1:${ordered[0]!.coordinateKey}`;
    return Object.freeze({
      groupKey,
      targets: Object.freeze(ordered.map(freezeTarget)),
    });
  });
  const orderedGroups = stableMergeSortInternal(
    groups,
    (left, right) => compareChunkCoordinatesInternal(
      left.targets[0]!.coordinate,
      right.targets[0]!.coordinate,
    ),
  );
  return Object.freeze({ groups: Object.freeze(orderedGroups), targetCount: targets.size });
}
