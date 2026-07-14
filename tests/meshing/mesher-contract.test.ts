import { describe, expect, it } from 'vitest';

import {
  MESHER_CORPUS_DESCRIPTOR_V1,
  createMesherCorpusV1,
} from '../../src/testing/index.js';
import {
  validateMesherOutputV1,
  validatePureMesherDescriptorV1,
  validatePureMesherInputV1,
  type MesherValidationResultV1,
} from '../../src/meshing/index.js';
import { createOracleMesherOutput, withOutputBytes } from './mesher-contract-fixtures.js';

function solidFixture() {
  return createMesherCorpusV1().find((fixture) => fixture.name === 'solid')!;
}

function expectFailure<Value>(
  result: MesherValidationResultV1<Value>,
  code: string,
  path?: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.issue.code).toBe(code);
  if (path !== undefined) expect(result.issue.path).toBe(path);
}

describe('pure mesher descriptor and input validation', () => {
  it('canonicalizes bounded dependency offsets and retains the job-owned sample buffer', () => {
    const descriptor = validatePureMesherDescriptorV1({
      ...MESHER_CORPUS_DESCRIPTOR_V1,
      dependencyOffsets: [...MESHER_CORPUS_DESCRIPTOR_V1.dependencyOffsets].reverse(),
    });
    expect(descriptor.ok).toBe(true);
    if (!descriptor.ok) return;
    expect(descriptor.value.dependencyOffsets).toEqual(MESHER_CORPUS_DESCRIPTOR_V1.dependencyOffsets);

    const fixture = solidFixture();
    const input = validatePureMesherInputV1(fixture.input, descriptor.value);
    expect(input.ok).toBe(true);
    if (!input.ok) return;
    expect(input.value.sampleVolume).toBe(fixture.input.sampleVolume);
    expect(Object.isFrozen(input.value)).toBe(true);
  });

  it('rejects duplicate dependencies, excessive halo, and sparse dependency arrays', () => {
    const firstOffset = MESHER_CORPUS_DESCRIPTOR_V1.dependencyOffsets[0]!;
    const duplicateDescriptor = validatePureMesherDescriptorV1({
      ...MESHER_CORPUS_DESCRIPTOR_V1,
      dependencyOffsets: [...MESHER_CORPUS_DESCRIPTOR_V1.dependencyOffsets, firstOffset],
      limits: {
        ...MESHER_CORPUS_DESCRIPTOR_V1.limits,
        maxDependencyOffsets: 7,
      },
    });
    expectFailure(duplicateDescriptor, 'mesher.value', 'descriptor.dependencyOffsets');

    const excessiveHalo = validatePureMesherDescriptorV1({
      ...MESHER_CORPUS_DESCRIPTOR_V1,
      halo: {
        ...MESHER_CORPUS_DESCRIPTOR_V1.halo,
        negative: { x: 65, y: 1, z: 1 },
      },
    });
    expectFailure(excessiveHalo, 'mesher.value', 'descriptor.halo.negative.x');

    const fixture = solidFixture();
    const sparse = new Array(fixture.input.dependencies.length);
    sparse[0] = fixture.input.dependencies[0];
    const sparseInput = validatePureMesherInputV1(
      { ...fixture.input, dependencies: sparse },
      MESHER_CORPUS_DESCRIPTOR_V1,
    );
    expectFailure(sparseInput, 'mesher.type', 'input.dependencies[1]');
  });

  it('rejects wrong identity, unresolved policy, sample shape, and raised job budgets', () => {
    const fixture = solidFixture();
    expectFailure(
      validatePureMesherInputV1(
        { ...fixture.input, mesherVersion: 'stale' },
        MESHER_CORPUS_DESCRIPTOR_V1,
      ),
      'mesher.identity',
      'input.mesherId',
    );
    expectFailure(
      validatePureMesherInputV1(
        { ...fixture.input, missingNeighbor: 'unavailable' },
        MESHER_CORPUS_DESCRIPTOR_V1,
      ),
      'mesher.value',
      'input.missingNeighbor',
    );
    expectFailure(
      validatePureMesherInputV1(
        { ...fixture.input, sampleVolume: fixture.input.sampleVolume.slice(1) },
        MESHER_CORPUS_DESCRIPTOR_V1,
      ),
      'mesher.value',
      'input.sampleVolume',
    );
    expectFailure(
      validatePureMesherInputV1(
        {
          ...fixture.input,
          outputBudget: {
            ...fixture.input.outputBudget,
            maxVertices: MESHER_CORPUS_DESCRIPTOR_V1.limits.output.maxVertices + 1,
          },
        },
        MESHER_CORPUS_DESCRIPTOR_V1,
      ),
      'mesher.value',
      'input.outputBudget.maxVertices',
    );
  });
});

describe('hard mesher result validation', () => {
  it('returns an opaque validated wrapper without copying geometry arrays', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    const result = validateMesherOutputV1(
      output,
      MESHER_CORPUS_DESCRIPTOR_V1,
      fixture.input,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.positions).toBe(output.positions);
    expect(result.value.normals).toBe(output.normals);
    expect(result.value.paletteIndices).toBe(output.paletteIndices);
    expect(result.value.indices).toBe(output.indices);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('rejects a result view that aliases the borrowed sample buffer', () => {
    const fixture = createMesherCorpusV1().find((candidate) => candidate.name === 'empty')!;
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    const aliasedEmptyPositions = new Float32Array(fixture.input.sampleVolume.buffer, 0, 0);
    expectFailure(
      validateMesherOutputV1(
        { ...output, positions: aliasedEmptyPositions },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
      'output.positions',
    );
  });

  it('rejects stale identity before accepting otherwise valid geometry', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    expectFailure(
      validateMesherOutputV1(
        { ...output, dependencySignature: 'stale' },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.identity',
      'output.mesherId',
    );
    expectFailure(
      validateMesherOutputV1(
        {
          ...output,
          source: { ...output.source, sourceRevision: output.source.sourceRevision + 1 },
        },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.identity',
      'output.source',
    );
  });

  it('rejects reversed winding, out-of-range indices, and non-axis topology', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    const reversed = output.indices.slice();
    [reversed[0], reversed[1]] = [reversed[1]!, reversed[0]!];
    expectFailure(
      validateMesherOutputV1(
        { ...output, indices: reversed },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.topology',
    );

    const outOfRange = output.indices.slice();
    outOfRange[0] = output.counts.vertexCount;
    expectFailure(
      validateMesherOutputV1(
        { ...output, indices: outOfRange },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.index',
    );

    const diagonal = output.positions.slice();
    diagonal[0] = 0.5;
    expectFailure(
      validateMesherOutputV1(
        { ...output, positions: diagonal },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.bounds',
    );
  });

  it('rejects malformed bounds, normals, and palette attributes', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    expectFailure(
      validateMesherOutputV1(
        { ...output, bounds: { min: [0, 0, 0], max: [3, 4, 4] } },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.bounds',
      'output.bounds',
    );

    const normals = output.normals.slice();
    normals[0] = 0.5;
    expectFailure(
      validateMesherOutputV1(
        { ...output, normals },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
    );

    const paletteIndices = output.paletteIndices.slice();
    paletteIndices[0] = 0;
    expectFailure(
      validateMesherOutputV1(
        { ...output, paletteIndices },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
    );

    const mixedPalette = output.paletteIndices.slice();
    mixedPalette[1] = mixedPalette[0]! + 1;
    expectFailure(
      validateMesherOutputV1(
        { ...output, paletteIndices: mixedPalette },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
    );
  });

  it('enforces declared counts, attribute bytes, total bytes, work, and exact metrics', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    const lowFaceInput = {
      ...fixture.input,
      outputBudget: { ...fixture.input.outputBudget, maxExposedUnitFaces: 1 },
    };
    expect(validateMesherOutputV1(
      output,
      MESHER_CORPUS_DESCRIPTOR_V1,
      lowFaceInput,
    ).ok).toBe(false);

    const lowPositionBytesInput = {
      ...fixture.input,
      outputBudget: { ...fixture.input.outputBudget, maxPositionBytes: 1 },
    };
    const invalidButOversizedPositions = output.positions.slice();
    invalidButOversizedPositions[0] = Number.NaN;
    expectFailure(
      validateMesherOutputV1(
        { ...output, positions: invalidButOversizedPositions },
        MESHER_CORPUS_DESCRIPTOR_V1,
        lowPositionBytesInput,
      ),
      'mesher.limit',
      'output.positions',
    );

    const lowValidationWorkInput = {
      ...fixture.input,
      outputBudget: { ...fixture.input.outputBudget, maxResultValidationElements: 1 },
    };
    expectFailure(
      validateMesherOutputV1(
        output,
        MESHER_CORPUS_DESCRIPTOR_V1,
        lowValidationWorkInput,
      ),
      'mesher.limit',
      'outputBudget.maxResultValidationElements',
    );

    const lowTotalBytesInput = {
      ...fixture.input,
      outputBudget: { ...fixture.input.outputBudget, maxTotalBytes: 1 },
    };
    expectFailure(
      validateMesherOutputV1(
        output,
        MESHER_CORPUS_DESCRIPTOR_V1,
        lowTotalBytesInput,
      ),
      'mesher.limit',
      'output',
    );

    expectFailure(
      validateMesherOutputV1(
        { ...output, metrics: { ...output.metrics, outputBytes: output.metrics.outputBytes - 1 } },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.limit',
      'output.metrics.outputBytes',
    );

    expectFailure(
      validateMesherOutputV1(
        { ...output, materialIndices: new Uint16Array(output.counts.triangleCount) },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
      'output.materialIndices',
    );
  });

  it('validates an explicitly declared per-triangle material attribute', () => {
    const fixture = solidFixture();
    const descriptorResult = validatePureMesherDescriptorV1({
      ...MESHER_CORPUS_DESCRIPTOR_V1,
      attributes: {
        ...MESHER_CORPUS_DESCRIPTOR_V1.attributes,
        materialIndices: 'per-triangle-u16',
        maxMaterialEntries: 2,
      },
      limits: {
        ...MESHER_CORPUS_DESCRIPTOR_V1.limits,
        output: {
          ...MESHER_CORPUS_DESCRIPTOR_V1.limits.output,
          maxMaterialIndexBytes: 1_000_000,
        },
      },
    });
    expect(descriptorResult.ok).toBe(true);
    if (!descriptorResult.ok) return;
    const input = {
      ...fixture.input,
      materialEntryCount: 2,
      outputBudget: { ...fixture.input.outputBudget, maxMaterialIndexBytes: 1_000_000 },
    };
    const base = createOracleMesherOutput(fixture, descriptorResult.value);
    const materialIndices = new Uint16Array(base.counts.triangleCount).fill(1);
    const output = withOutputBytes({ ...base, materialIndices });
    expect(validateMesherOutputV1(output, descriptorResult.value, input).ok).toBe(true);

    materialIndices[0] = 2;
    expectFailure(
      validateMesherOutputV1(
        withOutputBytes({ ...base, materialIndices }),
        descriptorResult.value,
        input,
      ),
      'mesher.attribute',
      'output.materialIndices[0]',
    );
  });

  it('rejects malformed array types, lengths, face counts, and non-finite data deterministically', () => {
    const fixture = solidFixture();
    const output = createOracleMesherOutput(fixture, MESHER_CORPUS_DESCRIPTOR_V1);
    expectFailure(
      validateMesherOutputV1(
        { ...output, positions: Array.from(output.positions) },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.type',
      'output.positions',
    );

    const shortPositions = withOutputBytes({
      ...output,
      positions: output.positions.slice(0, -3),
    });
    expectFailure(
      validateMesherOutputV1(
        shortPositions,
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.attribute',
      'output.positions',
    );

    expectFailure(
      validateMesherOutputV1(
        {
          ...output,
          counts: {
            ...output.counts,
            exposedUnitFaceCount: output.counts.exposedUnitFaceCount - 1,
          },
        },
        MESHER_CORPUS_DESCRIPTOR_V1,
        fixture.input,
      ),
      'mesher.topology',
      'output.counts.exposedUnitFaceCount',
    );

    const nonFinite = output.positions.slice();
    nonFinite[0] = Number.NaN;
    const first = validateMesherOutputV1(
      { ...output, positions: nonFinite },
      MESHER_CORPUS_DESCRIPTOR_V1,
      fixture.input,
    );
    const second = validateMesherOutputV1(
      { ...output, positions: nonFinite },
      MESHER_CORPUS_DESCRIPTOR_V1,
      fixture.input,
    );
    expectFailure(first, 'mesher.bounds');
    expect(second).toEqual(first);
  });
});
