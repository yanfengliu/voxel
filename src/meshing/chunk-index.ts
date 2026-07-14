import {
  canonicalStringCompareInternal,
  stableMergeSortInternal,
} from '../core/bounded-sort.js';
import type {
  Int3V1,
  UniformVoxelChunkProfileV1,
  Vec3V1,
  VoxelChunkV1,
} from '../core/contracts.js';
import {
  canonicalChunkCoordinateKeyV1,
  uniformChunkCoordinateV1,
} from '../core/voxel-grid.js';

export const MAX_CHUNK_DEPENDENCY_OFFSETS_V1 = 4_096;

/** Canonical face order: -X, +X, -Y, +Y, -Z, +Z. */
export const FACE_NEIGHBOR_OFFSETS_V1: readonly Int3V1[] = Object.freeze([
  Object.freeze({ x: -1, y: 0, z: 0 }),
  Object.freeze({ x: 1, y: 0, z: 0 }),
  Object.freeze({ x: 0, y: -1, z: 0 }),
  Object.freeze({ x: 0, y: 1, z: 0 }),
  Object.freeze({ x: 0, y: 0, z: -1 }),
  Object.freeze({ x: 0, y: 0, z: 1 }),
]);

export interface ChunkIndexEntryV1 {
  readonly coordinate: Int3V1;
  readonly coordinateKey: string;
  readonly slotGeneration: number;
  readonly key: string;
  readonly incarnation: number;
  readonly sourceRevision: number;
  /** Canonical engine-owned view. The index does not copy voxel storage. */
  readonly chunk: VoxelChunkV1;
}

export type ChunkDependencyTokenV1 =
  | {
      readonly state: 'present';
      readonly coordinate: Int3V1;
      readonly coordinateKey: string;
      readonly slotGeneration: number;
      readonly key: string;
      readonly incarnation: number;
      readonly sourceRevision: number;
    }
  | {
      readonly state: 'missing';
      readonly coordinate: Int3V1;
      readonly coordinateKey: string;
      /** Zero means the coordinate has never held a chunk in this index lineage. */
      readonly slotGeneration: number;
      readonly missingNeighbor: UniformVoxelChunkProfileV1['missingNeighbor'];
      readonly token: `missing:${UniformVoxelChunkProfileV1['missingNeighbor']}`;
    };

export interface ChunkDependencySignatureContextV1 {
  readonly worldId: string;
  readonly epoch: string;
  readonly mesherId: string;
  readonly mesherVersion: string;
  readonly materialPolicyVersion: string;
  readonly worldUnitsPerVoxel: Vec3V1;
  readonly sourceCoordinate: Int3V1;
  /** Omission uses the canonical six face-neighbor offsets. */
  readonly dependencyOffsets?: readonly Int3V1[];
}

interface OccupiedSlotState {
  readonly state: 'occupied';
  readonly generation: number;
  readonly key: string;
  readonly incarnation: number;
}

interface EmptySlotState {
  readonly state: 'empty';
  readonly generation: number;
}

type SlotState = OccupiedSlotState | EmptySlotState;

function safeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer.`);
  return value;
}

function nonnegativeInteger(value: number, name: string): number {
  safeInteger(value, name);
  if (value < 0) throw new RangeError(`${name} must be nonnegative.`);
  return value;
}

function positiveInteger(value: number, name: string): number {
  safeInteger(value, name);
  if (value <= 0) throw new RangeError(`${name} must be positive.`);
  return value;
}

function checkedAdd(left: number, right: number, name: string): number {
  return safeInteger(left + right, name);
}

function nextGeneration(generation: number): number {
  if (generation >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError('Chunk coordinate slot generation is exhausted.');
  }
  return generation + 1;
}

function coordinateCompare(left: Int3V1, right: Int3V1): number {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function sameInt3(left: Int3V1, right: Int3V1): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function copyCoordinate(coordinate: Int3V1): Int3V1 {
  return Object.freeze({
    x: safeInteger(coordinate.x, 'coordinate.x'),
    y: safeInteger(coordinate.y, 'coordinate.y'),
    z: safeInteger(coordinate.z, 'coordinate.z'),
  });
}

function copyProfile(profile: UniformVoxelChunkProfileV1): UniformVoxelChunkProfileV1 {
  return Object.freeze({
    layout: 'uniform-grid',
    size: Object.freeze({
      x: positiveInteger(profile.size.x, 'profile.size.x'),
      y: positiveInteger(profile.size.y, 'profile.size.y'),
      z: positiveInteger(profile.size.z, 'profile.size.z'),
    }),
    gridOrigin: Object.freeze({
      x: safeInteger(profile.gridOrigin.x, 'profile.gridOrigin.x'),
      y: safeInteger(profile.gridOrigin.y, 'profile.gridOrigin.y'),
      z: safeInteger(profile.gridOrigin.z, 'profile.gridOrigin.z'),
    }),
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: profile.missingNeighbor,
  });
}

function sameProfile(
  left: UniformVoxelChunkProfileV1,
  right: UniformVoxelChunkProfileV1,
): boolean {
  return sameInt3(left.size, right.size)
    && sameInt3(left.gridOrigin, right.gridOrigin)
    && left.missingNeighbor === right.missingNeighbor;
}

function offsetCoordinate(coordinate: Int3V1, offset: Int3V1): Int3V1 {
  return Object.freeze({
    x: checkedAdd(coordinate.x, safeInteger(offset.x, 'offset.x'), 'neighbor coordinate.x'),
    y: checkedAdd(coordinate.y, safeInteger(offset.y, 'offset.y'), 'neighbor coordinate.y'),
    z: checkedAdd(coordinate.z, safeInteger(offset.z, 'offset.z'), 'neighbor coordinate.z'),
  });
}

function assertFaceOffset(offset: Int3V1): void {
  safeInteger(offset.x, 'offset.x');
  safeInteger(offset.y, 'offset.y');
  safeInteger(offset.z, 'offset.z');
  if (Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) !== 1) {
    throw new RangeError('A face-neighbor offset must move one unit along exactly one axis.');
  }
}

function nonemptyString(value: string, name: string): string {
  if (value.length === 0) throw new RangeError(`${name} must be non-empty.`);
  return value;
}

function positiveFinite(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
  return value;
}

function canonicalOffsets(offsets: readonly Int3V1[]): readonly Int3V1[] {
  if (offsets.length > MAX_CHUNK_DEPENDENCY_OFFSETS_V1) {
    throw new RangeError(
      `dependencyOffsets exceeds ${String(MAX_CHUNK_DEPENDENCY_OFFSETS_V1)} entries.`,
    );
  }
  const copies = offsets.map(copyCoordinate);
  const ordered = stableMergeSortInternal(copies, coordinateCompare);
  for (let index = 1; index < ordered.length; index += 1) {
    if (sameInt3(ordered[index - 1]!, ordered[index]!)) {
      throw new RangeError('dependencyOffsets contains a duplicate coordinate offset.');
    }
  }
  return ordered;
}

/**
 * Immutable coordinate index over canonical, already-owned profiled chunks.
 *
 * Rebuild with the immediately previous index to preserve coordinate-slot
 * generations. Removed-coordinate tombstones are retained so a same-identity
 * remove/recreate cycle cannot reuse an earlier generation.
 */
export class ChunkIndexV1 {
  readonly profile: UniformVoxelChunkProfileV1;
  readonly entries: readonly ChunkIndexEntryV1[];

  readonly #byCoordinate: ReadonlyMap<string, ChunkIndexEntryV1>;
  readonly #byKey: ReadonlyMap<string, ChunkIndexEntryV1>;
  readonly #slots: ReadonlyMap<string, SlotState>;

  private constructor(
    profile: UniformVoxelChunkProfileV1,
    entries: readonly ChunkIndexEntryV1[],
    byCoordinate: ReadonlyMap<string, ChunkIndexEntryV1>,
    byKey: ReadonlyMap<string, ChunkIndexEntryV1>,
    slots: ReadonlyMap<string, SlotState>,
  ) {
    this.profile = profile;
    this.entries = entries;
    this.#byCoordinate = byCoordinate;
    this.#byKey = byKey;
    this.#slots = slots;
  }

  static build(
    profileInput: UniformVoxelChunkProfileV1,
    chunks: readonly VoxelChunkV1[],
    previous?: ChunkIndexV1,
  ): ChunkIndexV1 {
    const profile = copyProfile(profileInput);
    if (previous && !sameProfile(previous.profile, profile)) {
      throw new RangeError('A chunk profile change requires a new index lineage and world epoch.');
    }

    const byCoordinate = new Map<string, ChunkIndexEntryV1>();
    const byKey = new Map<string, ChunkIndexEntryV1>();
    const previousSlots = previous ? previous.#slots : undefined;
    const slots = new Map<string, SlotState>(previousSlots);
    const occupiedCoordinates = new Set<string>();
    const entries: ChunkIndexEntryV1[] = [];
    const expectedVolume = profile.size.x * profile.size.y * profile.size.z;
    if (!Number.isSafeInteger(expectedVolume)) {
      throw new RangeError('Uniform chunk profile volume exceeds the safe-integer range.');
    }

    for (const chunk of chunks) {
      nonemptyString(chunk.key, 'chunk.key');
      nonnegativeInteger(chunk.incarnation, 'chunk.incarnation');
      nonnegativeInteger(chunk.revision, 'chunk.revision');
      if (byKey.has(chunk.key)) throw new RangeError(`Duplicate chunk key ${chunk.key}.`);
      if (!sameInt3(chunk.size, profile.size)) {
        throw new RangeError(`Chunk ${chunk.key} does not match the uniform profile size.`);
      }
      if (chunk.voxels.length !== expectedVolume) {
        throw new RangeError(`Chunk ${chunk.key} voxel length does not match the uniform profile.`);
      }
      const coordinate = uniformChunkCoordinateV1(chunk.origin, profile);
      if (coordinate === null) throw new RangeError(`Chunk ${chunk.key} is not grid-aligned.`);
      const frozenCoordinate = copyCoordinate(coordinate);
      const coordinateKey = canonicalChunkCoordinateKeyV1(frozenCoordinate);
      if (byCoordinate.has(coordinateKey)) {
        throw new RangeError(`Duplicate chunk coordinate ${coordinateKey}.`);
      }

      const prior = previousSlots?.get(coordinateKey);
      const slotGeneration = prior === undefined
        ? 1
        : prior.state === 'occupied'
          && prior.key === chunk.key
          && prior.incarnation === chunk.incarnation
          ? prior.generation
          : nextGeneration(prior.generation);
      const entry: ChunkIndexEntryV1 = Object.freeze({
        coordinate: frozenCoordinate,
        coordinateKey,
        slotGeneration,
        key: chunk.key,
        incarnation: chunk.incarnation,
        sourceRevision: chunk.revision,
        chunk,
      });
      entries.push(entry);
      byCoordinate.set(coordinateKey, entry);
      byKey.set(chunk.key, entry);
      occupiedCoordinates.add(coordinateKey);
      slots.set(coordinateKey, Object.freeze({
        state: 'occupied',
        generation: slotGeneration,
        key: chunk.key,
        incarnation: chunk.incarnation,
      }));
    }

    if (previous) {
      for (const [coordinateKey, prior] of previous.#slots) {
        if (occupiedCoordinates.has(coordinateKey) || prior.state === 'empty') continue;
        slots.set(coordinateKey, Object.freeze({
          state: 'empty',
          generation: nextGeneration(prior.generation),
        }));
      }
    }

    const ordered = stableMergeSortInternal(entries, (left, right) => {
      const coordinateOrder = coordinateCompare(left.coordinate, right.coordinate);
      return coordinateOrder || canonicalStringCompareInternal(left.key, right.key);
    });
    return new ChunkIndexV1(
      profile,
      Object.freeze(ordered),
      byCoordinate,
      byKey,
      slots,
    );
  }

  at(coordinate: Int3V1): ChunkIndexEntryV1 | undefined {
    return this.#byCoordinate.get(canonicalChunkCoordinateKeyV1(coordinate));
  }

  forKey(key: string): ChunkIndexEntryV1 | undefined {
    return this.#byKey.get(key);
  }

  neighbor(coordinate: Int3V1, offset: Int3V1): ChunkIndexEntryV1 | undefined {
    assertFaceOffset(offset);
    return this.at(offsetCoordinate(coordinate, offset));
  }

  faceNeighbors(coordinate: Int3V1): readonly (ChunkIndexEntryV1 | undefined)[] {
    return FACE_NEIGHBOR_OFFSETS_V1.map((offset) => this.neighbor(coordinate, offset));
  }

  slotGenerationAt(coordinate: Int3V1): number {
    return this.#slots.get(canonicalChunkCoordinateKeyV1(coordinate))?.generation ?? 0;
  }

  dependencyTokenAt(coordinateInput: Int3V1): ChunkDependencyTokenV1 {
    const coordinate = copyCoordinate(coordinateInput);
    const coordinateKey = canonicalChunkCoordinateKeyV1(coordinate);
    const entry = this.#byCoordinate.get(coordinateKey);
    if (entry) {
      return Object.freeze({
        state: 'present',
        coordinate,
        coordinateKey,
        slotGeneration: entry.slotGeneration,
        key: entry.key,
        incarnation: entry.incarnation,
        sourceRevision: entry.sourceRevision,
      });
    }
    const missingNeighbor = this.profile.missingNeighbor;
    return Object.freeze({
      state: 'missing',
      coordinate,
      coordinateKey,
      slotGeneration: this.#slots.get(coordinateKey)?.generation ?? 0,
      missingNeighbor,
      token: `missing:${missingNeighbor}`,
    });
  }

  dependencySignature(context: ChunkDependencySignatureContextV1): string {
    nonemptyString(context.worldId, 'worldId');
    nonemptyString(context.epoch, 'epoch');
    nonemptyString(context.mesherId, 'mesherId');
    nonemptyString(context.mesherVersion, 'mesherVersion');
    nonemptyString(context.materialPolicyVersion, 'materialPolicyVersion');
    const sourceCoordinate = copyCoordinate(context.sourceCoordinate);
    const source = this.dependencyTokenAt(sourceCoordinate);
    if (source.state !== 'present') {
      throw new RangeError(`Source chunk ${source.coordinateKey} is not present.`);
    }
    const offsets = canonicalOffsets(context.dependencyOffsets ?? FACE_NEIGHBOR_OFFSETS_V1);
    const dependencies = offsets.map((offset) => {
      const coordinate = offsetCoordinate(sourceCoordinate, offset);
      return Object.freeze({ offset, dependency: this.dependencyTokenAt(coordinate) });
    });
    const scale = context.worldUnitsPerVoxel;
    return JSON.stringify({
      schema: 'voxel.chunk-dependency-signature/1',
      world: Object.freeze([context.worldId, context.epoch]),
      mesher: Object.freeze([context.mesherId, context.mesherVersion]),
      materialPolicyVersion: context.materialPolicyVersion,
      profile: Object.freeze({
        layout: this.profile.layout,
        size: Object.freeze([
          this.profile.size.x,
          this.profile.size.y,
          this.profile.size.z,
        ]),
        gridOrigin: Object.freeze([
          this.profile.gridOrigin.x,
          this.profile.gridOrigin.y,
          this.profile.gridOrigin.z,
        ]),
        emptyPaletteIndex: this.profile.emptyPaletteIndex,
        surfaceModel: this.profile.surfaceModel,
        missingNeighbor: this.profile.missingNeighbor,
      }),
      worldUnitsPerVoxel: Object.freeze([
        positiveFinite(scale.x, 'worldUnitsPerVoxel.x'),
        positiveFinite(scale.y, 'worldUnitsPerVoxel.y'),
        positiveFinite(scale.z, 'worldUnitsPerVoxel.z'),
      ]),
      source,
      dependencies,
    });
  }
}
