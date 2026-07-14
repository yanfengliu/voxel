import {
  DensePaletteChunk,
  meshVisibleFaces,
  MESHER_OUTPUT_SCHEMA_V1,
  type MesherOutputV1,
  type PureMesherDescriptorV1,
  type PureMesherInputV1,
} from '../../src/meshing/index.js';
import type { MesherCorpusFixtureV1 } from '../../src/testing/index.js';

function sampleDimensions(
  input: PureMesherInputV1,
  descriptor: PureMesherDescriptorV1,
): readonly [number, number, number] {
  return [
    input.source.size.x + descriptor.halo.negative.x + descriptor.halo.positive.x,
    input.source.size.y + descriptor.halo.negative.y + descriptor.halo.positive.y,
    input.source.size.z + descriptor.halo.negative.z + descriptor.halo.positive.z,
  ];
}

function sample(
  input: PureMesherInputV1,
  descriptor: PureMesherDescriptorV1,
  x: number,
  y: number,
  z: number,
): number {
  const [sizeX, sizeY, sizeZ] = sampleDimensions(input, descriptor);
  const sampleX = x + descriptor.halo.negative.x;
  const sampleY = y + descriptor.halo.negative.y;
  const sampleZ = z + descriptor.halo.negative.z;
  if (sampleX < 0 || sampleY < 0 || sampleZ < 0
    || sampleX >= sizeX || sampleY >= sizeY || sampleZ >= sizeZ) {
    return 0;
  }
  return input.sampleVolume[sampleX + sizeX * (sampleZ + sizeZ * sampleY)]!;
}

export function createOracleMesherOutput(
  fixture: MesherCorpusFixtureV1,
  descriptor: PureMesherDescriptorV1,
): MesherOutputV1 {
  const { input } = fixture;
  const voxels = new Uint16Array(
    input.source.size.x * input.source.size.y * input.source.size.z,
  );
  for (let y = 0; y < input.source.size.y; y += 1) {
    for (let z = 0; z < input.source.size.z; z += 1) {
      for (let x = 0; x < input.source.size.x; x += 1) {
        voxels[x + input.source.size.x * (z + input.source.size.z * y)] = sample(
          input,
          descriptor,
          x,
          y,
          z,
        );
      }
    }
  }
  const chunk = new DensePaletteChunk({
    origin: { x: 0, y: 0, z: 0 },
    size: input.source.size,
    voxels,
  });
  const mesh = meshVisibleFaces(chunk, {
    maxFaces: input.outputBudget.maxExposedUnitFaces,
    sampleNeighbor: (x, y, z) => sample(input, descriptor, x, y, z),
  });
  const outputBytes = mesh.positions.byteLength
    + mesh.normals.byteLength
    + mesh.paletteIndices.byteLength
    + mesh.indices.byteLength;
  return {
    schemaVersion: MESHER_OUTPUT_SCHEMA_V1,
    mesherId: input.mesherId,
    mesherVersion: input.mesherVersion,
    dependencySignature: input.dependencySignature,
    source: input.source,
    positions: mesh.positions,
    normals: mesh.normals,
    paletteIndices: mesh.paletteIndices,
    indices: mesh.indices,
    bounds: mesh.bounds,
    counts: {
      sourceVoxelCount: mesh.voxelCount,
      exposedUnitFaceCount: mesh.faceCount,
      vertexCount: mesh.positions.length / 3,
      indexCount: mesh.indices.length,
      triangleCount: mesh.indices.length / 3,
    },
    metrics: {
      workElements: input.sampleVolume.length + mesh.indices.length,
      outputBytes,
    },
  };
}

export function withOutputBytes(output: MesherOutputV1): MesherOutputV1 {
  const outputBytes = output.positions.byteLength
    + output.normals.byteLength
    + output.paletteIndices.byteLength
    + (output.materialIndices?.byteLength ?? 0)
    + output.indices.byteLength;
  return { ...output, metrics: { ...output.metrics, outputBytes } };
}
