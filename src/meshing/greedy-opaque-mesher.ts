import type { Int3V1 } from '../core/contracts.js';
import {
  INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
} from './visible-face-oracle.js';
import {
  MAX_MESHER_SAMPLE_VOXELS_V1,
  MESHER_DESCRIPTOR_SCHEMA_V1,
  MESHER_OUTPUT_SCHEMA_V1,
  type MesherOutputBudgetV1,
  type MesherOutputV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
  type PureVoxelMesherV1,
} from './mesher-contract.js';
import {
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
} from './mesher-contract-validation.js';

export const GREEDY_OPAQUE_MESHER_ID_V1 = 'voxel.greedy-opaque' as const;
export const GREEDY_OPAQUE_MESHER_VERSION_V1 = '1' as const;

const rawDescriptor: PureMesherDescriptorV1 = {
  schemaVersion: MESHER_DESCRIPTOR_SCHEMA_V1,
  id: GREEDY_OPAQUE_MESHER_ID_V1,
  version: GREEDY_OPAQUE_MESHER_VERSION_V1,
  halo: {
    negative: { x: 1, y: 1, z: 1 },
    positive: { x: 1, y: 1, z: 1 },
  },
  dependencyOffsets: [
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
  ],
  attributes: {
    normals: 'flat-axis-aligned-f32x3',
    paletteIndices: 'per-vertex-u16',
    materialIndices: 'none',
    maxPaletteEntries: 65_536,
    maxMaterialEntries: 0,
  },
  limits: {
    maxSampleVoxels: MAX_MESHER_SAMPLE_VOXELS_V1,
    maxSampleBytes: MAX_MESHER_SAMPLE_VOXELS_V1 * Uint16Array.BYTES_PER_ELEMENT,
    maxDependencyOffsets: 6,
    output: INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  },
};

const descriptorResult = validatePureMesherDescriptorV1(rawDescriptor);
if (!descriptorResult.ok) {
  throw new Error(`Invalid greedy opaque descriptor: ${descriptorResult.issue.message}`);
}

export const GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1 = descriptorResult.value;

interface GreedyQuadInternal {
  readonly axis: 0 | 1 | 2;
  readonly uAxis: 0 | 1 | 2;
  readonly vAxis: 0 | 1 | 2;
  readonly plane: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
  readonly sign: -1 | 1;
  readonly paletteIndex: number;
}

const AXES = [0, 1, 2] as const;

function components(value: Int3V1): [number, number, number] {
  return [value.x, value.y, value.z];
}

function checkedProduct(values: readonly number[], name: string): number {
  let result = 1;
  for (const value of values) {
    result *= value;
    if (!Number.isSafeInteger(result)) throw new RangeError(`${name} exceeds safe integer range.`);
  }
  return result;
}

function assertWithin(value: number, limit: number, field: keyof MesherOutputBudgetV1): void {
  if (value > limit) throw new RangeError(`Greedy mesher output exceeds outputBudget.${field}.`);
}

function sampleDimensions(input: PureMesherInputV1): [number, number, number] {
  const size = input.source.size;
  return [size.x + 2, size.y + 2, size.z + 2];
}

function sample(
  input: PureMesherInputV1,
  dimensions: readonly [number, number, number],
  coordinate: readonly [number, number, number],
): number {
  const x = coordinate[0] + 1;
  const y = coordinate[1] + 1;
  const z = coordinate[2] + 1;
  return input.sampleVolume[x + dimensions[0] * (z + dimensions[2] * y)]!;
}

function minimumScanWork(size: readonly [number, number, number]): number {
  const source = checkedProduct(size, 'source volume');
  let masks = 0;
  for (const axis of AXES) {
    const u = ((axis + 1) % 3) as 0 | 1 | 2;
    const v = ((axis + 2) % 3) as 0 | 1 | 2;
    masks += checkedProduct([size[axis] + 1, size[u], size[v]], 'mask scan work');
    if (!Number.isSafeInteger(masks)) throw new RangeError('mask scan work exceeds safe integer range.');
  }
  return source + masks;
}

function collectQuads(
  input: PureMesherInputV1,
): {
  readonly sourceVoxelCount: number;
  readonly exposedUnitFaceCount: number;
  readonly quads: readonly GreedyQuadInternal[];
  readonly workElements: number;
} {
  const size = components(input.source.size);
  const dimensions = sampleDimensions(input);
  const budget = input.outputBudget;
  const minimumWork = minimumScanWork(size);
  assertWithin(minimumWork, budget.maxMeshingWorkElements, 'maxMeshingWorkElements');
  let workElements = 0;
  const charge = (count = 1): void => {
    workElements += count;
    assertWithin(workElements, budget.maxMeshingWorkElements, 'maxMeshingWorkElements');
  };
  let sourceVoxelCount = 0;
  for (let y = 0; y < size[1]; y += 1) {
    for (let z = 0; z < size[2]; z += 1) {
      for (let x = 0; x < size[0]; x += 1) {
        const paletteIndex = sample(input, dimensions, [x, y, z]);
        charge();
        if (paletteIndex === 0) continue;
        if (paletteIndex >= input.paletteEntryCount) {
          throw new RangeError(
            `Source palette index ${String(paletteIndex)} exceeds paletteEntryCount.`,
          );
        }
        sourceVoxelCount += 1;
      }
    }
  }

  const maximumMask = Math.max(
    size[0] * size[1],
    size[1] * size[2],
    size[2] * size[0],
  );
  const mask = new Int32Array(maximumMask);
  const quads: GreedyQuadInternal[] = [];
  let exposedUnitFaceCount = 0;
  for (const axis of AXES) {
    const uAxis = ((axis + 1) % 3) as 0 | 1 | 2;
    const vAxis = ((axis + 2) % 3) as 0 | 1 | 2;
    const width = size[uAxis];
    const height = size[vAxis];
    for (let plane = -1; plane < size[axis]; plane += 1) {
      for (let v = 0; v < height; v += 1) {
        for (let u = 0; u < width; u += 1) {
          const left: [number, number, number] = [0, 0, 0];
          const right: [number, number, number] = [0, 0, 0];
          left[axis] = plane;
          right[axis] = plane + 1;
          left[uAxis] = right[uAxis] = u;
          left[vAxis] = right[vAxis] = v;
          const leftPalette = sample(input, dimensions, left);
          const rightPalette = sample(input, dimensions, right);
          const leftInside = plane >= 0;
          const rightInside = plane + 1 < size[axis];
          mask[u + width * v] = leftInside && leftPalette !== 0 && rightPalette === 0
            ? leftPalette
            : rightInside && rightPalette !== 0 && leftPalette === 0
              ? -rightPalette
              : 0;
          charge();
        }
      }

      for (let v = 0; v < height; v += 1) {
        for (let u = 0; u < width;) {
          const encoded = mask[u + width * v]!;
          charge();
          if (encoded === 0) {
            u += 1;
            continue;
          }
          let quadWidth = 1;
          while (u + quadWidth < width && mask[u + quadWidth + width * v] === encoded) {
            charge();
            quadWidth += 1;
          }
          let quadHeight = 1;
          heightScan: while (v + quadHeight < height) {
            for (let offset = 0; offset < quadWidth; offset += 1) {
              charge();
              if (mask[u + offset + width * (v + quadHeight)] !== encoded) break heightScan;
            }
            quadHeight += 1;
          }
          for (let clearV = 0; clearV < quadHeight; clearV += 1) {
            mask.fill(0, u + width * (v + clearV), u + quadWidth + width * (v + clearV));
            charge(quadWidth);
          }
          const area = quadWidth * quadHeight;
          exposedUnitFaceCount += area;
          assertWithin(
            exposedUnitFaceCount,
            budget.maxExposedUnitFaces,
            'maxExposedUnitFaces',
          );
          quads.push({
            axis,
            uAxis,
            vAxis,
            plane: plane + 1,
            u,
            v,
            width: quadWidth,
            height: quadHeight,
            sign: encoded > 0 ? 1 : -1,
            paletteIndex: Math.abs(encoded),
          });
          u += quadWidth;
        }
      }
    }
  }
  return { sourceVoxelCount, exposedUnitFaceCount, quads, workElements };
}

function outputCounts(
  quads: readonly GreedyQuadInternal[],
  exposedUnitFaceCount: number,
  sourceVoxelCount: number,
  budget: MesherOutputBudgetV1,
): {
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly outputBytes: number;
} {
  const vertexCount = checkedProduct([quads.length, 4], 'vertexCount');
  const indexCount = checkedProduct([quads.length, 6], 'indexCount');
  const triangleCount = checkedProduct([quads.length, 2], 'triangleCount');
  const positionBytes = checkedProduct([vertexCount, 12], 'positionBytes');
  const normalBytes = checkedProduct([vertexCount, 12], 'normalBytes');
  const paletteIndexBytes = checkedProduct([vertexCount, 2], 'paletteIndexBytes');
  const indexBytes = checkedProduct([indexCount, 4], 'indexBytes');
  const outputBytes = positionBytes + normalBytes + paletteIndexBytes + indexBytes;
  if (!Number.isSafeInteger(outputBytes)) throw new RangeError('outputBytes exceeds safe range.');
  assertWithin(exposedUnitFaceCount, budget.maxExposedUnitFaces, 'maxExposedUnitFaces');
  assertWithin(vertexCount, budget.maxVertices, 'maxVertices');
  assertWithin(indexCount, budget.maxIndices, 'maxIndices');
  assertWithin(positionBytes, budget.maxPositionBytes, 'maxPositionBytes');
  assertWithin(normalBytes, budget.maxNormalBytes, 'maxNormalBytes');
  assertWithin(paletteIndexBytes, budget.maxPaletteIndexBytes, 'maxPaletteIndexBytes');
  assertWithin(outputBytes, budget.maxTotalBytes, 'maxTotalBytes');
  const validationWork = 64 + vertexCount * 7 + indexCount * 12;
  assertWithin(validationWork, budget.maxResultValidationElements, 'maxResultValidationElements');
  void sourceVoxelCount;
  return { vertexCount, indexCount, triangleCount, outputBytes };
}

function emit(
  input: PureMesherInputV1,
  collected: ReturnType<typeof collectQuads>,
): MesherOutputV1 {
  const counts = outputCounts(
    collected.quads,
    collected.exposedUnitFaceCount,
    collected.sourceVoxelCount,
    input.outputBudget,
  );
  const positions = new Float32Array(counts.vertexCount * 3);
  const normals = new Float32Array(counts.vertexCount * 3);
  const paletteIndices = new Uint16Array(counts.vertexCount);
  const indices = new Uint32Array(counts.indexCount);
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  collected.quads.forEach((quad, quadIndex) => {
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (const corner of corners) corner[quad.axis] = quad.plane;
    corners[0]![quad.uAxis] = corners[3]![quad.uAxis] = quad.u;
    corners[1]![quad.uAxis] = corners[2]![quad.uAxis] = quad.u + quad.width;
    corners[0]![quad.vAxis] = corners[1]![quad.vAxis] = quad.v;
    corners[2]![quad.vAxis] = corners[3]![quad.vAxis] = quad.v + quad.height;
    const vertexBase = quadIndex * 4;
    corners.forEach((corner, cornerIndex) => {
      const offset = (vertexBase + cornerIndex) * 3;
      positions.set(corner, offset);
      normals[offset + quad.axis] = quad.sign;
      paletteIndices[vertexBase + cornerIndex] = quad.paletteIndex;
      for (const axis of AXES) {
        minimum[axis] = Math.min(minimum[axis]!, corner[axis]);
        maximum[axis] = Math.max(maximum[axis]!, corner[axis]);
      }
    });
    const indexOffset = quadIndex * 6;
    indices.set(quad.sign > 0
      ? [vertexBase, vertexBase + 1, vertexBase + 2, vertexBase, vertexBase + 2, vertexBase + 3]
      : [vertexBase, vertexBase + 3, vertexBase + 2, vertexBase, vertexBase + 2, vertexBase + 1],
    indexOffset);
  });
  return {
    schemaVersion: MESHER_OUTPUT_SCHEMA_V1,
    mesherId: input.mesherId,
    mesherVersion: input.mesherVersion,
    dependencySignature: input.dependencySignature,
    source: input.source,
    positions,
    normals,
    paletteIndices,
    indices,
    bounds: collected.quads.length === 0
      ? null
      : {
          min: [minimum[0]!, minimum[1]!, minimum[2]!],
          max: [maximum[0]!, maximum[1]!, maximum[2]!],
        },
    counts: {
      sourceVoxelCount: collected.sourceVoxelCount,
      exposedUnitFaceCount: collected.exposedUnitFaceCount,
      vertexCount: counts.vertexCount,
      indexCount: counts.indexCount,
      triangleCount: counts.triangleCount,
    },
    metrics: { workElements: collected.workElements, outputBytes: counts.outputBytes },
  };
}

/** Deterministic palette-preserving greedy opaque mesher candidate. */
export function meshGreedyOpaqueV1(inputValue: PureMesherInputV1): MesherOutputV1 {
  const validation = validatePureMesherInputV1(
    inputValue,
    GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  );
  if (!validation.ok) {
    throw new RangeError(
      `${validation.issue.code} at ${validation.issue.path}: ${validation.issue.message}`,
    );
  }
  const collected = collectQuads(validation.value);
  return emit(validation.value, collected);
}

export const GREEDY_OPAQUE_MESHER_V1: PureVoxelMesherV1 = Object.freeze({
  descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  mesh: meshGreedyOpaqueV1,
});
