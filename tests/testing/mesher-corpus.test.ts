import { describe, expect, it } from 'vitest';

import {
  MESHER_OUTPUT_SCHEMA_V1,
  validateMesherOutputV1,
  type MesherOutputV1,
  type ValidatedMesherOutputV1,
} from '../../src/meshing/index.js';
import {
  MESHER_CORPUS_DESCRIPTOR_V1,
  compareOrientedUnitFaceCoverageV1,
  createExpectedOrientedUnitFaceCoverageV1,
  createMesherCorpusV1,
  extractOrientedUnitFaceCoverageV1,
} from '../../src/testing/index.js';
import {
  createOracleMesherOutput,
  withOutputBytes,
} from '../meshing/mesher-contract-fixtures.js';

function validated(output: MesherOutputV1): ValidatedMesherOutputV1 {
  const fixture = createMesherCorpusV1().find((candidate) => candidate.name === 'solid')!;
  const result = validateMesherOutputV1(
    output,
    MESHER_CORPUS_DESCRIPTOR_V1,
    fixture.input,
  );
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

function rectangleOutput(unitQuads: boolean): MesherOutputV1 {
  const fixture = createMesherCorpusV1().find((candidate) => candidate.name === 'solid')!;
  const quads = unitQuads
    ? [
        [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
        [[1, 1, 1], [2, 1, 1], [2, 1, 0], [1, 1, 0]],
      ]
    : [
        [[0, 1, 1], [2, 1, 1], [2, 1, 0], [0, 1, 0]],
      ];
  const positions = new Float32Array(quads.flat(2));
  const normals = new Float32Array(quads.length * 4 * 3);
  const paletteIndices = new Uint16Array(quads.length * 4);
  const indices = new Uint32Array(quads.length * 6);
  for (let quad = 0; quad < quads.length; quad += 1) {
    for (let vertex = 0; vertex < 4; vertex += 1) {
      normals.set([0, 1, 0], (quad * 4 + vertex) * 3);
      paletteIndices[quad * 4 + vertex] = 4;
    }
    const base = quad * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], quad * 6);
  }
  return withOutputBytes({
    schemaVersion: MESHER_OUTPUT_SCHEMA_V1,
    mesherId: fixture.input.mesherId,
    mesherVersion: fixture.input.mesherVersion,
    dependencySignature: fixture.input.dependencySignature,
    source: fixture.input.source,
    positions,
    normals,
    paletteIndices,
    indices,
    bounds: { min: [0, 1, 0], max: [2, 1, 1] },
    counts: {
      sourceVoxelCount: 0,
      exposedUnitFaceCount: 2,
      vertexCount: positions.length / 3,
      indexCount: indices.length,
      triangleCount: indices.length / 3,
    },
    metrics: { workElements: 100, outputBytes: 0 },
  });
}

describe('frozen mesher corpus', () => {
  it('contains every named fixture in canonical order with pinned deterministic counts', () => {
    const corpus = createMesherCorpusV1();
    expect(corpus.map((fixture) => fixture.name)).toEqual([
      'empty',
      'solid',
      'hollow',
      'checkerboard',
      'staircase',
      'stripes',
      'negative-coordinate',
      'all-neighbor',
      'seeded-random',
      'aoe-like',
      'city-like',
      'column',
      'worst-output',
    ]);
    const repeated = createMesherCorpusV1();
    expect(repeated.map((fixture) => ({
      name: fixture.name,
      voxels: fixture.expectedSourceVoxelCount,
      faces: fixture.expectedExposedUnitFaceCount,
      bytes: Array.from(fixture.input.sampleVolume),
    }))).toEqual(corpus.map((fixture) => ({
      name: fixture.name,
      voxels: fixture.expectedSourceVoxelCount,
      faces: fixture.expectedExposedUnitFaceCount,
      bytes: Array.from(fixture.input.sampleVolume),
    })));
    expect(repeated[0]!.input.sampleVolume).not.toBe(corpus[0]!.input.sampleVolume);
    expect(Object.fromEntries(corpus.map((fixture) => [
      fixture.name,
      [fixture.expectedSourceVoxelCount, fixture.expectedExposedUnitFaceCount],
    ]))).toEqual({
      empty: [0, 0],
      solid: [64, 96],
      hollow: [98, 204],
      checkerboard: [63, 378],
      staircase: [94, 148],
      stripes: [144, 168],
      'negative-coordinate': [15, 54],
      'all-neighbor': [27, 0],
      'seeded-random': [101, 402],
      'aoe-like': [96, 288],
      'city-like': [196, 424],
      column: [16, 66],
      'worst-output': [256, 1_536],
    });
  });

  it('validates oracle-shaped output and matches independent coverage for every fixture', () => {
    for (const fixture of createMesherCorpusV1()) {
      const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
      const repeatedOutput = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
      expect({
        positions: repeatedOutput.positions,
        normals: repeatedOutput.normals,
        paletteIndices: repeatedOutput.paletteIndices,
        indices: repeatedOutput.indices,
        bounds: repeatedOutput.bounds,
        counts: repeatedOutput.counts,
        metrics: repeatedOutput.metrics,
      }, fixture.name).toEqual({
        positions: output.positions,
        normals: output.normals,
        paletteIndices: output.paletteIndices,
        indices: output.indices,
        bounds: output.bounds,
        counts: output.counts,
        metrics: output.metrics,
      });
      const result = validateMesherOutputV1(
        output,
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      );
      expect(result, fixture.name).toMatchObject({ ok: true });
      if (!result.ok) continue;
      expect(result.value.counts.sourceVoxelCount, fixture.name).toBe(
        fixture.expectedSourceVoxelCount,
      );
      expect(result.value.counts.exposedUnitFaceCount, fixture.name).toBe(
        fixture.expectedExposedUnitFaceCount,
      );
      const expected = createExpectedOrientedUnitFaceCoverageV1(
        fixture.input,
        MESHER_CORPUS_DESCRIPTOR_V1,
      );
      const actual = extractOrientedUnitFaceCoverageV1(result.value);
      expect(compareOrientedUnitFaceCoverageV1(expected, actual), fixture.name).toEqual({
        equal: true,
        missing: [],
        unexpected: [],
        attributeMismatches: [],
      });
      expect(extractOrientedUnitFaceCoverageV1(result.value), fixture.name).toEqual(actual);
    }
  });
});

describe('oriented unit-face coverage', () => {
  it('compares one greedy rectangle equal to the same surface as unit quads', () => {
    const greedy = extractOrientedUnitFaceCoverageV1(validated(rectangleOutput(false)));
    const unit = extractOrientedUnitFaceCoverageV1(validated(rectangleOutput(true)));

    expect(greedy.faces).toHaveLength(2);
    expect(compareOrientedUnitFaceCoverageV1(unit, greedy)).toEqual({
      equal: true,
      missing: [],
      unexpected: [],
      attributeMismatches: [],
    });
  });

  it('reports palette mismatches independently of geometry coverage', () => {
    const output = rectangleOutput(false);
    const expected = extractOrientedUnitFaceCoverageV1(validated(output));
    const paletteIndices = new Uint16Array(output.paletteIndices.length).fill(5);
    const actual = extractOrientedUnitFaceCoverageV1(validated({ ...output, paletteIndices }));
    const comparison = compareOrientedUnitFaceCoverageV1(expected, actual);

    expect(comparison.equal).toBe(false);
    expect(comparison.missing).toEqual([]);
    expect(comparison.unexpected).toEqual([]);
    expect(comparison.attributeMismatches).toHaveLength(2);
    expect(() => compareOrientedUnitFaceCoverageV1(
      { ...expected, faces: [...expected.faces, expected.faces[0]!] },
      actual,
    )).toThrow(/duplicate/);
  });

  it('rejects overlap coverage and enforces its own deterministic raster budget', () => {
    const output = rectangleOutput(false);
    const duplicateIndices = new Uint32Array([...output.indices, ...output.indices]);
    const overlap = withOutputBytes({
      ...output,
      indices: duplicateIndices,
      counts: {
        ...output.counts,
        exposedUnitFaceCount: 4,
        indexCount: duplicateIndices.length,
        triangleCount: duplicateIndices.length / 3,
      },
    });
    const validatedOverlap = validated(overlap);
    expect(() => extractOrientedUnitFaceCoverageV1(validatedOverlap)).toThrow(/overlap area/);

    const greedy = validated(output);
    expect(() => extractOrientedUnitFaceCoverageV1(greedy, 3)).toThrow(/maxRasterCellVisits/);
  });
});
