import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  type Camera,
  type Material,
  Vector2,
  Vector4,
} from 'three';

import {
  CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL,
  installClusteredPointLightShaderInternal,
  type ClusteredPointLightUniformsInternal,
} from './clusteredPointLightShaderInternal.js';
import { MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL } from './clusteredPointLightLimitsInternal.js';

export const MAX_CLUSTERED_POINT_LIGHTS_INTERNAL = 4_096;
export const CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL = 48;
export const CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL = 24;

const DATA_TEXTURE_ROW_TEXELS_INTERNAL = 1_024;
const INDEX_GROUPS_PER_TILE_INTERNAL = CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL / 4;
const MAX_LIGHT_CLUSTER_INTERSECTIONS_INTERNAL = 2_000_000;
const MAX_CLUSTERED_VIEWPORT_DIMENSION_INTERNAL = 4_096;

export interface ClusteredPointLightInputInternal {
  readonly id: string;
  readonly position: readonly [number, number, number];
  /** Linear RGB, not sRGB. */
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  /** World-space cutoff. Zero preserves Three's unbounded point-light meaning. */
  readonly range: number;
}

export interface ClusteredPointLightMetricsInternal {
  readonly authoredLights: number;
  readonly visibleLights: number;
  readonly tileSizePixels: number;
  readonly depthSlices: number;
  readonly clusterCount: number;
  readonly nonemptyClusters: number;
  readonly maxLightsPerCluster: number;
  readonly lightClusterAssignments: number;
  readonly candidateIntersections: number;
  readonly overflowedClusters: number;
  readonly shaderLightBudgetPerPixel: number;
  readonly lightDataBytes: number;
  readonly lightIndexBytes: number;
  readonly pendingRetiredTextures: number;
}

export interface ClusteredPointLightDebugStateInternal {
  readonly lightTexture: DataTexture;
  readonly indexTexture: DataTexture;
  readonly lightData: Float32Array;
  readonly indexData: Float32Array;
}

interface TextureStorageInternal {
  readonly texture: DataTexture;
  readonly data: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly capacity: number;
}

interface ScreenBoundsInternal {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minDepth: number;
  readonly maxDepth: number;
}

interface DepthConfigInternal {
  readonly near: number;
  readonly far: number;
  readonly perspective: boolean;
  readonly orthographic: boolean;
}

function isEffectiveLightInternal(light: ClusteredPointLightInputInternal): boolean {
  return light.intensity > 0
    && (light.color[0] !== 0 || light.color[1] !== 0 || light.color[2] !== 0);
}

function nextPowerOfTwoInternal(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function createTextureStorageInternal(
  capacity: number,
  texelsPerEntry: number,
  name: string,
): TextureStorageInternal {
  const texels = Math.max(1, capacity * texelsPerEntry);
  const width = Math.min(DATA_TEXTURE_ROW_TEXELS_INTERNAL, texels);
  const height = Math.ceil(texels / width);
  const data = new Float32Array(width * height * 4);
  const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
  texture.name = name;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return { texture, data, width, height, capacity };
}

function checkedDimensionInternal(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(`${name} must be a finite positive number; received ${String(value)}.`);
  }
  const dimension = Math.max(1, Math.floor(value));
  if (dimension > MAX_CLUSTERED_VIEWPORT_DIMENSION_INTERNAL) {
    throw new RangeError(
      `${name} must not exceed ${String(MAX_CLUSTERED_VIEWPORT_DIMENSION_INTERNAL)} drawing-buffer `
      + `pixels; received ${String(dimension)}. Render a smaller viewport or split it into views.`,
    );
  }
  return dimension;
}

function clampInternal(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function screenBoundsInternal(
  camera: Camera,
  position: readonly [number, number, number],
  range: number,
  width: number,
  height: number,
  depthConfig: DepthConfigInternal,
): ScreenBoundsInternal | null {
  if (range === 0) {
    return {
      minX: 0,
      maxX: width - 1,
      minY: 0,
      maxY: height - 1,
      minDepth: depthConfig.near,
      maxDepth: depthConfig.far,
    };
  }
  const view = camera.matrixWorldInverse.elements;
  const [worldX, worldY, worldZ] = position;
  const x = view[0] * worldX + view[4] * worldY + view[8] * worldZ + view[12];
  const y = view[1] * worldX + view[5] * worldY + view[9] * worldZ + view[13];
  const z = view[2] * worldX + view[6] * worldY + view[10] * worldZ + view[14];
  const projection = camera.projectionMatrix.elements;
  const clipX = projection[0] * x + projection[4] * y + projection[8] * z + projection[12];
  const clipY = projection[1] * x + projection[5] * y + projection[9] * z + projection[13];
  const clipW = projection[3] * x + projection[7] * y + projection[11] * z + projection[15];
  const depth = -z;
  const { near, far, perspective } = depthConfig;
  if (depth + range < near || depth - range > far) return null;

  let minNdcX = -2;
  let maxNdcX = 2;
  let minNdcY = -2;
  let maxNdcY = 2;
  if (perspective) {
    if (depth > range + near && clipW !== 0) {
      const denominator = depth * depth - range * range;
      const xRoot = range * Math.sqrt(depth * depth + x * x - range * range);
      const yRoot = range * Math.sqrt(depth * depth + y * y - range * range);
      // This is the per-visible-light hot path. Keep the four extrema scalar:
      // temporary ratio/projection arrays would create thousands of short-lived
      // allocations per frame in the 1,000-light showcase.
      const projectedX0 =
        projection[0] * ((x * depth - xRoot) / denominator) - projection[8];
      const projectedX1 =
        projection[0] * ((x * depth + xRoot) / denominator) - projection[8];
      const projectedY0 =
        projection[5] * ((y * depth - yRoot) / denominator) - projection[9];
      const projectedY1 =
        projection[5] * ((y * depth + yRoot) / denominator) - projection[9];
      minNdcX = Math.min(projectedX0, projectedX1);
      maxNdcX = Math.max(projectedX0, projectedX1);
      minNdcY = Math.min(projectedY0, projectedY1);
      maxNdcY = Math.max(projectedY0, projectedY1);
    }
  } else if (depthConfig.orthographic && clipW !== 0) {
    const centerX = clipX / clipW;
    const centerY = clipY / clipW;
    const radiusX = range * Math.hypot(projection[0], projection[4], projection[8])
      / Math.abs(clipW);
    const radiusY = range * Math.hypot(projection[1], projection[5], projection[9])
      / Math.abs(clipW);
    minNdcX = centerX - radiusX;
    maxNdcX = centerX + radiusX;
    minNdcY = centerY - radiusY;
    maxNdcY = centerY + radiusY;
  }

  if (maxNdcX < -1 || minNdcX > 1 || maxNdcY < -1 || minNdcY > 1) return null;
  return {
    minX: clampInternal(Math.floor((minNdcX * 0.5 + 0.5) * width), 0, width - 1),
    maxX: clampInternal(Math.ceil((maxNdcX * 0.5 + 0.5) * width), 0, width - 1),
    minY: clampInternal(Math.floor((minNdcY * 0.5 + 0.5) * height), 0, height - 1),
    maxY: clampInternal(Math.ceil((maxNdcY * 0.5 + 0.5) * height), 0, height - 1),
    minDepth: Math.max(near, depth - range),
    maxDepth: Math.min(far, depth + range),
  };
}

function depthConfigInternal(camera: Camera): DepthConfigInternal {
  const candidate = camera as Camera & {
    readonly isPerspectiveCamera?: boolean;
    readonly isOrthographicCamera?: boolean;
    readonly near?: number;
    readonly far?: number;
  };
  const perspective = candidate.isPerspectiveCamera === true;
  const orthographic = candidate.isOrthographicCamera === true;
  const near = Math.max(perspective ? 0.01 : 0, candidate.near ?? 0);
  const far = candidate.far ?? 2_000;
  if (!Number.isFinite(near) || !Number.isFinite(far) || far <= near) {
    throw new RangeError(
      `Clustered point lighting needs finite camera depth bounds with far greater than near; `
      + `received near=${String(candidate.near)} and far=${String(candidate.far)}.`,
    );
  }
  return { near, far, perspective, orthographic };
}

function depthSliceInternal(depth: number, config: DepthConfigInternal): number {
  const normalized = config.perspective
    ? Math.log(clampInternal(depth, config.near, config.far) / config.near)
      / Math.log(config.far / config.near)
    : (clampInternal(depth, config.near, config.far) - config.near)
      / (config.far - config.near);
  return clampInternal(
    Math.floor(normalized * CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL),
    0,
    CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL - 1,
  );
}

/** Test seam for proving that perspective sphere projection is conservative. */
export function clusteredPointLightScreenBoundsForTestingInternal(
  camera: Camera,
  position: readonly [number, number, number],
  range: number,
  viewportWidth: number,
  viewportHeight: number,
): ScreenBoundsInternal | null {
  const width = checkedDimensionInternal(viewportWidth, 'Clustered-light viewport width');
  const height = checkedDimensionInternal(viewportHeight, 'Clustered-light viewport height');
  camera.updateMatrixWorld();
  return screenBoundsInternal(
    camera,
    position,
    range,
    width,
    height,
    depthConfigInternal(camera),
  );
}

/**
 * WebGL2 forward+ point-light data. Authored count only affects CPU culling
 * and texture size; a fragment evaluates at most 32 tile-local sources.
 */
export class ClusteredPointLightFieldInternal {
  readonly #uniforms: ClusteredPointLightUniformsInternal;
  readonly #installedMaterials = new WeakSet<Material>();
  #lightStorage = createTextureStorageInternal(1, 2, 'voxel-clustered-light-data');
  #indexStorage = createTextureStorageInternal(
    1,
    INDEX_GROUPS_PER_TILE_INTERNAL,
    'voxel-clustered-light-indices',
  );
  #tileCounts = new Uint8Array(1);
  #lightStaging = new Float32Array(this.#lightStorage.data.length);
  #indexStaging = new Float32Array(this.#indexStorage.data.length);
  #retiredTextures: DataTexture[] = [];
  #disposeStarted = false;
  #disposed = false;
  #metrics: ClusteredPointLightMetricsInternal = Object.freeze({
    authoredLights: 0,
    visibleLights: 0,
    tileSizePixels: CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL,
    depthSlices: CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL,
    clusterCount: 0,
    nonemptyClusters: 0,
    maxLightsPerCluster: 0,
    lightClusterAssignments: 0,
    candidateIntersections: 0,
    overflowedClusters: 0,
    shaderLightBudgetPerPixel: CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL,
    lightDataBytes: 0,
    lightIndexBytes: 0,
    pendingRetiredTextures: 0,
  });

  constructor() {
    this.#uniforms = {
      enabled: { value: 0 },
      authoredCount: { value: 0 },
      lightData: { value: this.#lightStorage.texture },
      lightDataSize: { value: new Vector2(this.#lightStorage.width, this.#lightStorage.height) },
      lightIndices: { value: this.#indexStorage.texture },
      lightIndexSize: { value: new Vector2(this.#indexStorage.width, this.#indexStorage.height) },
      tileCount: { value: new Vector2(1, 1) },
      tileSize: { value: CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL },
      depthParams: {
        value: new Vector4(0.01, 2_000, CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL, 0),
      },
    };
  }

  setEnabledInternal(enabled: boolean): void {
    this.#assertActiveInternal();
    this.#uniforms.enabled.value = enabled ? 1 : 0;
  }

  installMaterialInternal(material: Material): boolean {
    this.#assertActiveInternal();
    if (this.#installedMaterials.has(material)) return false;
    if (!installClusteredPointLightShaderInternal(material, this.#uniforms)) return false;
    this.#installedMaterials.add(material);
    return true;
  }

  updateInternal(
    lights: readonly ClusteredPointLightInputInternal[],
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): ClusteredPointLightMetricsInternal {
    this.#assertActiveInternal();
    if (lights.length > MAX_CLUSTERED_POINT_LIGHTS_INTERNAL) {
      throw new RangeError(
        `Clustered point lighting accepts at most ${String(MAX_CLUSTERED_POINT_LIGHTS_INTERNAL)} `
        + `authored lights; received ${String(lights.length)}. Split the world into streamed regions.`,
      );
    }
    const unboundedLights = lights.reduce(
      (count, light) => count + (
        light.range === 0 && isEffectiveLightInternal(light) ? 1 : 0
      ),
      0,
    );
    if (unboundedLights > MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL) {
      throw new RangeError(
        `Clustered point lighting accepts at most `
        + `${String(MAX_UNBOUNDED_CLUSTERED_POINT_LIGHTS_INTERNAL)} nonzero lights with range 0; `
        + `received ${String(unboundedLights)}. Give local lights finite ranges so cluster work stays bounded.`,
      );
    }
    const width = checkedDimensionInternal(viewportWidth, 'Clustered-light viewport width');
    const height = checkedDimensionInternal(viewportHeight, 'Clustered-light viewport height');
    camera.updateMatrixWorld();
    const depthConfig = depthConfigInternal(camera);
    const tileColumns = Math.ceil(width / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
    const tileRows = Math.ceil(height / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
    const clusterCount =
      tileColumns * tileRows * CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL;
    const lightCapacity = nextPowerOfTwoInternal(Math.max(1, lights.length));
    const clusterCapacity = nextPowerOfTwoInternal(Math.max(1, clusterCount));
    let candidateLightStorage: TextureStorageInternal | null = null;
    let candidateIndexStorage: TextureStorageInternal | null = null;
    let nextLightStaging = this.#lightStaging;
    let nextIndexStaging = this.#indexStaging;
    let nextTileCounts = this.#tileCounts;
    try {
      candidateLightStorage = lightCapacity === this.#lightStorage.capacity
        ? null
        : createTextureStorageInternal(lightCapacity, 2, 'voxel-clustered-light-data');
      candidateIndexStorage = clusterCapacity === this.#indexStorage.capacity
        ? null
        : createTextureStorageInternal(
          clusterCapacity,
          INDEX_GROUPS_PER_TILE_INTERNAL,
          'voxel-clustered-light-indices',
        );
      if (candidateLightStorage) {
        nextLightStaging = new Float32Array(candidateLightStorage.data.length);
      }
      if (candidateIndexStorage) {
        nextIndexStaging = new Float32Array(candidateIndexStorage.data.length);
      }
      if (nextTileCounts.length < clusterCapacity) {
        nextTileCounts = new Uint8Array(clusterCapacity);
      }
    } catch (error) {
      candidateLightStorage?.texture.dispose();
      candidateIndexStorage?.texture.dispose();
      throw new Error(
        `Clustered point-light preparation could not allocate bounded staging for `
        + `${String(lights.length)} lights and ${String(clusterCount)} clusters; `
        + 'the previously prepared lighting remains active.',
        { cause: error },
      );
    }
    if (!candidateLightStorage
      && this.#lightStaging.length !== this.#lightStorage.data.length) {
      this.#lightStaging = new Float32Array(this.#lightStorage.data.length);
    }
    if (!candidateIndexStorage
      && this.#indexStaging.length !== this.#indexStorage.data.length) {
      this.#indexStaging = new Float32Array(this.#indexStorage.data.length);
    }
    this.#tileCounts = nextTileCounts;
    const lightData = candidateLightStorage?.data ?? this.#lightStaging;
    const indexData = candidateIndexStorage?.data ?? this.#indexStaging;
    lightData.fill(0);
    indexData.fill(-1);
    this.#tileCounts.fill(0, 0, clusterCount);

    let visibleLights = 0;
    let assignments = 0;
    let candidateIntersections = 0;
    const view = camera.matrixWorldInverse.elements;
    try {
      for (const [lightIndex, light] of lights.entries()) {
        const offset = lightIndex * 8;
        const [worldX, worldY, worldZ] = light.position;
        lightData[offset] =
          view[0] * worldX + view[4] * worldY + view[8] * worldZ + view[12];
        lightData[offset + 1] =
          view[1] * worldX + view[5] * worldY + view[9] * worldZ + view[13];
        lightData[offset + 2] =
          view[2] * worldX + view[6] * worldY + view[10] * worldZ + view[14];
        lightData[offset + 3] = light.range;
        lightData[offset + 4] = light.color[0];
        lightData[offset + 5] = light.color[1];
        lightData[offset + 6] = light.color[2];
        lightData[offset + 7] = light.intensity;
        const bounds = !isEffectiveLightInternal(light)
          ? null
          : screenBoundsInternal(
            camera,
            light.position,
            light.range,
            width,
            height,
            depthConfig,
          );
        if (!bounds) continue;
        visibleLights += 1;
        const minTileX = Math.floor(bounds.minX / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
        const maxTileX = Math.floor(bounds.maxX / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
        const minTileY = Math.floor(bounds.minY / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
        const maxTileY = Math.floor(bounds.maxY / CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL);
        const minDepthSlice = depthSliceInternal(bounds.minDepth, depthConfig);
        const maxDepthSlice = depthSliceInternal(bounds.maxDepth, depthConfig);
        for (let depthSlice = minDepthSlice; depthSlice <= maxDepthSlice; depthSlice += 1) {
          for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
              candidateIntersections += 1;
              if (candidateIntersections > MAX_LIGHT_CLUSTER_INTERSECTIONS_INTERNAL) {
                throw new RangeError(
                  `Clustered point-light preparation exceeded `
                  + `${String(MAX_LIGHT_CLUSTER_INTERSECTIONS_INTERNAL)} light-cluster intersections `
                  + `while processing '${light.id}'. Shorten large light ranges or stream the world by region.`,
                );
              }
              const clusterIndex =
                (depthSlice * tileRows + tileY) * tileColumns + tileX;
              const count = this.#tileCounts[clusterIndex]!;
              if (count >= CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL) {
                throw new RangeError(
                  `Clustered point-light preparation found more than `
                  + `${String(CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL)} overlapping lights in cluster `
                  + `(x=${String(tileX)}, y=${String(tileY)}, depth=${String(depthSlice)}) while adding `
                  + `'${light.id}'. Shorten overlapping ranges or split the world into streamed regions; `
                  + 'the renderer kept the previously prepared lighting instead of dropping an influence.',
                );
              }
              indexData[
                clusterIndex * CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL + count
              ] = lightIndex;
              this.#tileCounts[clusterIndex] = count + 1;
              assignments += 1;
            }
          }
        }
      }
    } catch (error) {
      candidateLightStorage?.texture.dispose();
      candidateIndexStorage?.texture.dispose();
      throw error;
    }

    let nonemptyClusters = 0;
    let maxLightsPerCluster = 0;
    for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
      const count = this.#tileCounts[clusterIndex]!;
      if (count > 0) nonemptyClusters += 1;
      maxLightsPerCluster = Math.max(maxLightsPerCluster, count);
    }
    if (candidateLightStorage) {
      const previous = this.#lightStorage;
      this.#lightStorage = candidateLightStorage;
      this.#uniforms.lightData.value = candidateLightStorage.texture;
      this.#uniforms.lightDataSize.value.set(
        candidateLightStorage.width,
        candidateLightStorage.height,
      );
      this.#lightStaging = nextLightStaging;
      this.#retiredTextures.push(previous.texture);
    } else {
      this.#lightStorage.data.set(lightData);
    }
    if (candidateIndexStorage) {
      const previous = this.#indexStorage;
      this.#indexStorage = candidateIndexStorage;
      this.#uniforms.lightIndices.value = candidateIndexStorage.texture;
      this.#uniforms.lightIndexSize.value.set(
        candidateIndexStorage.width,
        candidateIndexStorage.height,
      );
      this.#indexStaging = nextIndexStaging;
      this.#retiredTextures.push(previous.texture);
    } else {
      this.#indexStorage.data.set(indexData);
    }
    this.#lightStorage.texture.needsUpdate = true;
    this.#indexStorage.texture.needsUpdate = true;
    this.#uniforms.authoredCount.value = lights.length;
    this.#uniforms.tileCount.value.set(tileColumns, tileRows);
    this.#uniforms.depthParams.value.set(
      depthConfig.near,
      depthConfig.far,
      CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL,
      depthConfig.perspective ? 1 : 0,
    );
    this.#drainRetiredTexturesInternal();
    this.#metrics = Object.freeze({
      authoredLights: lights.length,
      visibleLights,
      tileSizePixels: CLUSTERED_POINT_LIGHT_TILE_SIZE_INTERNAL,
      depthSlices: CLUSTERED_POINT_LIGHT_DEPTH_SLICES_INTERNAL,
      clusterCount,
      nonemptyClusters,
      maxLightsPerCluster,
      lightClusterAssignments: assignments,
      candidateIntersections,
      overflowedClusters: 0,
      shaderLightBudgetPerPixel: CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL,
      lightDataBytes: this.#lightStorage.data.byteLength,
      lightIndexBytes: this.#indexStorage.data.byteLength,
      pendingRetiredTextures: this.#retiredTextures.length,
    });
    return this.#metrics;
  }

  metricsInternal(): ClusteredPointLightMetricsInternal {
    return this.#metrics;
  }

  debugStateForTestingInternal(): ClusteredPointLightDebugStateInternal {
    this.#assertActiveInternal();
    return {
      lightTexture: this.#lightStorage.texture,
      indexTexture: this.#indexStorage.texture,
      lightData: this.#lightStorage.data,
      indexData: this.#indexStorage.data,
    };
  }

  disposeInternal(): void {
    if (this.#disposed) return;
    if (!this.#disposeStarted) {
      this.#uniforms.enabled.value = 0;
      this.#uniforms.authoredCount.value = 0;
      this.#retiredTextures.push(
        this.#lightStorage.texture,
        this.#indexStorage.texture,
      );
      this.#disposeStarted = true;
    }
    const failures = this.#drainRetiredTexturesInternal();
    if (this.#retiredTextures.length > 0) {
      throw new AggregateError(
        failures,
        `Clustered point-light disposal left ${String(this.#retiredTextures.length)} texture(s) `
        + 'unreleased; call dispose again to retry those exact resources.',
      );
    }
    this.#disposed = true;
  }

  #drainRetiredTexturesInternal(): readonly unknown[] {
    if (this.#retiredTextures.length === 0) return [];
    const remaining: DataTexture[] = [];
    const failures: unknown[] = [];
    for (const texture of this.#retiredTextures) {
      try {
        texture.dispose();
      } catch (error) {
        remaining.push(texture);
        failures.push(error);
      }
    }
    this.#retiredTextures = remaining;
    return failures;
  }

  #assertActiveInternal(): void {
    if (this.#disposed || this.#disposeStarted) {
      throw new Error('Clustered point lighting is disposed.');
    }
  }
}
