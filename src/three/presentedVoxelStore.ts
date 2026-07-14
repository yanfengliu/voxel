import type {
  Int3V1,
  MaterialResourceV1,
  PaletteResourceV1,
  Vec3V1,
  VoxelChunkV1,
} from '../core/contracts.js';
import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import {
  ChunkIndexV1,
  raycastDensePaletteChunksDetailed,
  type DensePaletteChunkReader,
} from '../meshing/index.js';
import type {
  PickQueryIssueCodeV1,
  PickUnavailableReasonV1,
  PresentedItemIdentityV1,
} from './pickingContracts.js';

export interface PresentedVoxelBoundsInternal {
  readonly chunk: PresentedItemIdentityV1;
  readonly min: Vec3V1;
  readonly max: Vec3V1;
}

export interface PresentedVoxelHitInternal {
  readonly distance: number;
  readonly point: Vec3V1;
  readonly normal: Vec3V1;
  readonly chunk: PresentedItemIdentityV1;
  readonly palette: PresentedItemIdentityV1;
  readonly material: PresentedItemIdentityV1;
  readonly voxelCoordinate: Int3V1;
  readonly chunkLocalCoordinate: Int3V1;
  readonly paletteIndex: number;
}

export type PresentedVoxelRaycastResultInternal =
  | {
      readonly status: 'hit';
      readonly hit: PresentedVoxelHitInternal;
      readonly voxelSteps: number;
    }
  | { readonly status: 'miss'; readonly voxelSteps: number }
  | { readonly status: 'budget-exceeded'; readonly voxelSteps: number }
  | {
      readonly status: 'unavailable';
      readonly reason: Extract<
        PickUnavailableReasonV1,
        'voxel-sealed-neighbor-policy' | 'voxel-coordinate-overflow'
      >;
      readonly voxelSteps: 0;
    }
  | {
      readonly status: 'invalid-query';
      readonly code: PickQueryIssueCodeV1;
      readonly path: string;
      readonly message: string;
      readonly voxelSteps: 0;
    };

interface PresentedWorldBoundsInternal {
  readonly min: Vec3V1;
  readonly max: Vec3V1;
}

type ClippedWorldRayInternal =
  | {
      readonly status: 'hit';
      readonly distance: number;
      readonly origin: Vec3V1;
    }
  | { readonly status: 'miss' }
  | {
      readonly status: 'invalid-query';
      readonly message: string;
    };

interface PresentedChunkEntryInternal {
  readonly reader: DensePaletteChunkReader;
  readonly chunk: VoxelChunkV1;
  readonly palette: PaletteResourceV1;
  readonly material: MaterialResourceV1;
  readonly bounds: PresentedVoxelBoundsInternal;
}

class CanonicalChunkReaderInternal implements DensePaletteChunkReader {
  readonly origin: Int3V1;
  readonly size: Int3V1;
  readonly volume: number;

  constructor(
    private readonly chunk: VoxelChunkV1,
    gridOrigin: Int3V1,
  ) {
    this.origin = Object.freeze({
      x: chunk.origin.x - gridOrigin.x,
      y: chunk.origin.y - gridOrigin.y,
      z: chunk.origin.z - gridOrigin.z,
    });
    this.size = chunk.size;
    this.volume = chunk.voxels.length;
  }

  containsLocal(x: number, y: number, z: number): boolean {
    return Number.isInteger(x)
      && Number.isInteger(y)
      && Number.isInteger(z)
      && x >= 0 && x < this.size.x
      && y >= 0 && y < this.size.y
      && z >= 0 && z < this.size.z;
  }

  getLocal(x: number, y: number, z: number): number {
    if (!this.containsLocal(x, y, z)) return 0;
    return this.chunk.voxels[x + this.size.x * (z + this.size.z * y)]!;
  }
}

function identity(value: PresentedItemIdentityV1): PresentedItemIdentityV1 {
  return Object.freeze({
    key: value.key,
    incarnation: value.incarnation,
    revision: value.revision,
  });
}

function resource<Value extends PaletteResourceV1 | MaterialResourceV1>(
  state: CanonicalRenderStateV1,
  key: string,
  kind: Value['kind'],
): Value {
  const value = state.resource(key);
  if (value?.kind !== kind) {
    throw new Error(`Presented chunk references missing ${kind} ${key}.`);
  }
  return value as Value;
}

function normalizeDirection(value: Vec3V1): Vec3V1 {
  const scale = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z));
  if (!Number.isFinite(scale) || scale === 0) {
    throw new RangeError('Presented voxel ray direction must be finite and nonzero.');
  }
  const scaled = { x: value.x / scale, y: value.y / scale, z: value.z / scale };
  const length = Math.hypot(scaled.x, scaled.y, scaled.z);
  return { x: scaled.x / length, y: scaled.y / length, z: scaled.z / length };
}

function voxelDirection(
  worldDirection: Vec3V1,
  worldUnitsPerVoxel: Vec3V1,
): {
  readonly direction: Vec3V1;
  readonly worldDistancePerVoxelUnit: number;
  readonly logWorldDistancePerVoxelUnit: number;
} {
  const axes = ['x', 'y', 'z'] as const;
  const logs = axes.map((axis) => worldDirection[axis] === 0
    ? Number.NEGATIVE_INFINITY
    : Math.log(Math.abs(worldDirection[axis])) - Math.log(worldUnitsPerVoxel[axis]));
  const maximum = Math.max(...logs);
  const raw = axes.map((axis, index) => worldDirection[axis] === 0
    ? 0
    : Math.sign(worldDirection[axis]) * Math.exp(logs[index]! - maximum));
  const length = Math.hypot(raw[0]!, raw[1]!, raw[2]!);
  const direction = { x: raw[0]! / length, y: raw[1]! / length, z: raw[2]! / length };
  const reference = axes.reduce((best, axis) => (
    Math.abs(direction[axis]) > Math.abs(direction[best]) ? axis : best
  ), 'x');
  const logWorldDistancePerVoxelUnit = Math.log(Math.abs(direction[reference]))
    + Math.log(worldUnitsPerVoxel[reference])
    - Math.log(Math.abs(worldDirection[reference]));
  const directFactor = Math.abs(
    direction[reference] * worldUnitsPerVoxel[reference] / worldDirection[reference],
  );
  return {
    direction,
    worldDistancePerVoxelUnit: Number.isFinite(directFactor) && directFactor > 0
      ? directFactor
      : positiveFromLog(logWorldDistancePerVoxelUnit),
    logWorldDistancePerVoxelUnit,
  };
}

const LOG_MAX_VALUE = Math.log(Number.MAX_VALUE);
const LOG_MIN_VALUE = Math.log(Number.MIN_VALUE);

function positiveFromLog(value: number): number {
  if (value >= LOG_MAX_VALUE) return Number.MAX_VALUE;
  if (value <= LOG_MIN_VALUE) return Number.MIN_VALUE;
  return Math.exp(value);
}

function distanceFromVoxel(
  voxelDistance: number,
  worldDistancePerVoxelUnit: number,
  logWorldDistancePerVoxelUnit: number,
): number {
  if (voxelDistance === 0) return 0;
  const direct = voxelDistance * worldDistancePerVoxelUnit;
  return Number.isFinite(direct)
    ? direct
    : positiveFromLog(Math.log(voxelDistance) + logWorldDistancePerVoxelUnit);
}

const AXES = ['x', 'y', 'z'] as const;

function unionBounds(
  values: readonly PresentedVoxelBoundsInternal[],
): PresentedWorldBoundsInternal | null {
  if (values.length === 0) return null;
  const min = { ...values[0]!.min };
  const max = { ...values[0]!.max };
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]!;
    for (const axis of AXES) {
      min[axis] = Math.min(min[axis], value.min[axis]);
      max[axis] = Math.max(max[axis], value.max[axis]);
    }
  }
  return { min, max };
}

function finiteBounds(value: PresentedWorldBoundsInternal | null): boolean {
  return value === null || AXES.every((axis) => (
    Number.isFinite(value.min[axis])
    && Number.isFinite(value.max[axis])
    && value.min[axis] <= value.max[axis]
  ));
}

function clipWorldRayToBounds(
  origin: Vec3V1,
  direction: Vec3V1,
  maxDistance: number,
  bounds: PresentedWorldBoundsInternal,
): ClippedWorldRayInternal {
  let entryDistance = 0;
  let exitDistance = maxDistance;
  const entryDistances: Partial<Record<(typeof AXES)[number], number>> = {};
  const entryBoundaries: Partial<Record<(typeof AXES)[number], number>> = {};
  for (const axis of AXES) {
    const component = direction[axis];
    if (component === 0) {
      if (origin[axis] < bounds.min[axis] || origin[axis] > bounds.max[axis]) {
        return { status: 'miss' };
      }
      continue;
    }
    let near = (bounds.min[axis] - origin[axis]) / component;
    let far = (bounds.max[axis] - origin[axis]) / component;
    if (Number.isNaN(near) || Number.isNaN(far)) {
      return {
        status: 'invalid-query',
        message: 'Pick origin cannot be intersected with presented voxel bounds.',
      };
    }
    if (near > far) [near, far] = [far, near];
    entryDistances[axis] = near;
    entryBoundaries[axis] = component > 0 ? bounds.min[axis] : bounds.max[axis];
    entryDistance = Math.max(entryDistance, near);
    exitDistance = Math.min(exitDistance, far);
    if (entryDistance > exitDistance) return { status: 'miss' };
  }
  if (!Number.isFinite(entryDistance)) return { status: 'miss' };
  const clipped = {
    x: origin.x + direction.x * entryDistance,
    y: origin.y + direction.y * entryDistance,
    z: origin.z + direction.z * entryDistance,
  };
  if (!AXES.every((axis) => Number.isFinite(clipped[axis]))) {
    return {
      status: 'invalid-query',
      message: 'Pick origin cannot be represented at the presented voxel bounds.',
    };
  }
  for (const axis of AXES) {
    clipped[axis] = entryDistances[axis] === entryDistance
      ? entryBoundaries[axis]!
      : Math.max(bounds.min[axis], Math.min(bounds.max[axis], clipped[axis]));
  }
  return { status: 'hit', distance: entryDistance, origin: clipped };
}

/** Immutable occupancy/index/bounds bundle swapped with one displayed revision. */
export class PresentedVoxelStoreInternal {
  readonly worldId: string;
  readonly epoch: string;
  readonly revision: number;
  readonly bounds: readonly PresentedVoxelBoundsInternal[];

  private constructor(
    private readonly state: CanonicalRenderStateV1,
    private readonly index: ChunkIndexV1,
    private readonly entries: ReadonlyMap<string, PresentedChunkEntryInternal>,
    private readonly worldBounds: PresentedWorldBoundsInternal | null,
    private readonly coordinateOverflow: boolean,
  ) {
    this.worldId = state.worldId;
    this.epoch = state.epoch;
    this.revision = state.revision;
    this.bounds = Object.freeze(index.entries.map((entry) => entries.get(entry.coordinateKey)!.bounds));
  }

  static fromCanonicalStateInternal(
    state: CanonicalRenderStateV1,
  ): PresentedVoxelStoreInternal | null {
    const descriptor = state.descriptorViewInternal();
    const profile = descriptor.chunkProfile;
    if (!profile) return null;
    const index = ChunkIndexV1.build(profile, state.chunksViewInternal());
    const scale = descriptor.coordinates.worldUnitsPerVoxel;
    const entries = new Map<string, PresentedChunkEntryInternal>();
    for (const indexed of index.entries) {
      const chunk = indexed.chunk;
      const palette = resource<PaletteResourceV1>(state, chunk.paletteKey, 'palette');
      const material = resource<MaterialResourceV1>(state, chunk.materialKey, 'material');
      entries.set(indexed.coordinateKey, {
        reader: new CanonicalChunkReaderInternal(chunk, profile.gridOrigin),
        chunk,
        palette,
        material,
        bounds: Object.freeze({
          chunk: identity(chunk),
          min: Object.freeze({
            x: chunk.origin.x * scale.x,
            y: chunk.origin.y * scale.y,
            z: chunk.origin.z * scale.z,
          }),
          max: Object.freeze({
            x: (chunk.origin.x + chunk.size.x) * scale.x,
            y: (chunk.origin.y + chunk.size.y) * scale.y,
            z: (chunk.origin.z + chunk.size.z) * scale.z,
          }),
        }),
      });
    }
    const bounds = Object.freeze(index.entries.map((entry) => entries.get(entry.coordinateKey)!.bounds));
    const worldBounds = unionBounds(bounds);
    return new PresentedVoxelStoreInternal(
      state,
      index,
      entries,
      worldBounds,
      !finiteBounds(worldBounds),
    );
  }

  pickRayInternal(
    origin: Vec3V1,
    directionInput: Vec3V1,
    maxDistance: number,
    maxSteps: number,
  ): PresentedVoxelRaycastResultInternal {
    if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
      throw new RangeError('Presented voxel maxDistance must be positive and finite.');
    }
    if (!Number.isSafeInteger(maxSteps) || maxSteps <= 0) {
      throw new RangeError('Presented voxel maxSteps must be a positive safe integer.');
    }
    const descriptor = this.state.descriptorViewInternal();
    const profile = descriptor.chunkProfile!;
    if (profile.missingNeighbor === 'sealed') {
      return {
        status: 'unavailable',
        reason: 'voxel-sealed-neighbor-policy',
        voxelSteps: 0,
      };
    }
    if (this.coordinateOverflow) {
      return {
        status: 'unavailable',
        reason: 'voxel-coordinate-overflow',
        voxelSteps: 0,
      };
    }
    if (!this.worldBounds) return { status: 'miss', voxelSteps: 0 };
    const scale = descriptor.coordinates.worldUnitsPerVoxel;
    const worldDirection = normalizeDirection(directionInput);
    const clipped = clipWorldRayToBounds(origin, worldDirection, maxDistance, this.worldBounds);
    if (clipped.status === 'miss') return { status: 'miss', voxelSteps: 0 };
    if (clipped.status === 'invalid-query') {
      return {
        status: 'invalid-query',
        code: 'pick.query.invalid-number',
        path: 'origin',
        message: clipped.message,
        voxelSteps: 0,
      };
    }
    const transformed = voxelDirection(worldDirection, scale);
    const originInGrid = {
      x: clipped.origin.x / scale.x - profile.gridOrigin.x,
      y: clipped.origin.y / scale.y - profile.gridOrigin.y,
      z: clipped.origin.z / scale.z - profile.gridOrigin.z,
    };
    if (!AXES.every((axis) => (
      Number.isFinite(originInGrid[axis])
      && Number.isSafeInteger(Math.floor(originInGrid[axis]))
    ))) {
      return {
        status: 'invalid-query',
        code: 'pick.query.invalid-number',
        path: 'origin',
        message: 'Pick origin cannot be represented in safe voxel coordinates.',
        voxelSteps: 0,
      };
    }
    const worldEnd = {
      x: origin.x + worldDirection.x * maxDistance,
      y: origin.y + worldDirection.y * maxDistance,
      z: origin.z + worldDirection.z * maxDistance,
    };
    const endpointRemaining = AXES.every((axis) => Number.isFinite(worldEnd[axis]))
      ? Math.hypot(
          worldEnd.x - clipped.origin.x,
          worldEnd.y - clipped.origin.y,
          worldEnd.z - clipped.origin.z,
        )
      : Number.NaN;
    const remainingWorldDistance = Math.max(
      Number.MIN_VALUE,
      Number.isFinite(endpointRemaining)
        ? endpointRemaining
        : maxDistance - clipped.distance,
    );
    const directVoxelMaxDistance = remainingWorldDistance
      / transformed.worldDistancePerVoxelUnit;
    const voxelMaxDistance = Number.isFinite(directVoxelMaxDistance)
      && directVoxelMaxDistance > 0
      ? directVoxelMaxDistance
      : positiveFromLog(
          Math.log(remainingWorldDistance) - transformed.logWorldDistancePerVoxelUnit,
        );
    const result = raycastDensePaletteChunksDetailed({
      origin: originInGrid,
      direction: transformed.direction,
      maxDistance: voxelMaxDistance,
      maxSteps,
      chunkSize: profile.size,
      getChunk: (x, y, z) => {
        const indexed = this.index.at({ x, y, z });
        return indexed ? this.entries.get(indexed.coordinateKey)?.reader : undefined;
      },
    });
    if (result.status !== 'hit') {
      return result.status === 'miss'
        ? { status: 'miss', voxelSteps: result.visitedCells }
        : { status: 'budget-exceeded', voxelSteps: result.visitedCells };
    }
    const indexed = this.index.at(result.hit.chunkCoordinate);
    const entry = indexed ? this.entries.get(indexed.coordinateKey) : undefined;
    if (!entry) throw new Error('Presented voxel hit has no indexed chunk identity.');
    const localDistance = distanceFromVoxel(
      result.hit.distance,
      transformed.worldDistancePerVoxelUnit,
      transformed.logWorldDistancePerVoxelUnit,
    );
    const distance = Math.min(maxDistance, clipped.distance + localDistance);
    return {
      status: 'hit',
      voxelSteps: result.visitedCells,
      hit: {
        distance,
        point: {
          x: clipped.origin.x + worldDirection.x * localDistance,
          y: clipped.origin.y + worldDirection.y * localDistance,
          z: clipped.origin.z + worldDirection.z * localDistance,
        },
        normal: { ...result.hit.entryNormal },
        chunk: identity(entry.chunk),
        palette: identity(entry.palette),
        material: identity(entry.material),
        voxelCoordinate: {
          x: result.hit.cell.x + profile.gridOrigin.x,
          y: result.hit.cell.y + profile.gridOrigin.y,
          z: result.hit.cell.z + profile.gridOrigin.z,
        },
        chunkLocalCoordinate: { ...result.hit.localCoordinate },
        paletteIndex: result.hit.paletteIndex,
      },
    };
  }
}
