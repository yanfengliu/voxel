import { describe, expect, it } from 'vitest';

import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  meshGreedyOpaqueV1,
  validateMesherOutputV1,
  validatePureMesherInputV1,
  type PureMesherInputV1,
} from '../../src/meshing/index.js';
import {
  compareOrientedUnitFaceCoverageV1,
  createExpectedOrientedUnitFaceCoverageV1,
  createMesherCorpusV1,
  extractOrientedUnitFaceCoverageV1,
} from '../../src/testing/index.js';

function candidateInput(input: PureMesherInputV1): PureMesherInputV1 {
  const result = validatePureMesherInputV1({
    ...input,
    mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
    mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
  }, GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1);
  if (!result.ok) throw new Error(result.issue.message);
  return result.value;
}

describe('greedy opaque mesher candidate', () => {
  it('matches the frozen oriented unit-face corpus with deterministic output', () => {
    for (const fixture of createMesherCorpusV1()) {
      const input = candidateInput(fixture.input);
      const first = meshGreedyOpaqueV1(input);
      const second = meshGreedyOpaqueV1(input);
      expect(second, fixture.name).toEqual(first);
      const validation = validateMesherOutputV1(
        first,
        GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
        input,
      );
      expect(validation, fixture.name).toMatchObject({ ok: true });
      if (!validation.ok) continue;
      expect(validation.value.counts.sourceVoxelCount, fixture.name)
        .toBe(fixture.expectedSourceVoxelCount);
      expect(validation.value.counts.exposedUnitFaceCount, fixture.name)
        .toBe(fixture.expectedExposedUnitFaceCount);
      const expected = createExpectedOrientedUnitFaceCoverageV1(
        input,
        GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
      );
      const actual = extractOrientedUnitFaceCoverageV1(validation.value);
      expect(compareOrientedUnitFaceCoverageV1(expected, actual), fixture.name)
        .toEqual({ equal: true, missing: [], unexpected: [], attributeMismatches: [] });
    }
  });

  it('reduces a solid 4x4x4 surface to six quads while preserving unit-face area', () => {
    const fixture = createMesherCorpusV1().find((value) => value.name === 'solid')!;
    const output = meshGreedyOpaqueV1(candidateInput(fixture.input));

    expect(output.counts).toMatchObject({
      sourceVoxelCount: 64,
      exposedUnitFaceCount: 96,
      vertexCount: 24,
      indexCount: 36,
      triangleCount: 12,
    });
    expect(output.bounds).toEqual({ min: [0, 0, 0], max: [4, 4, 4] });
  });

  it('does not merge faces across palette boundaries', () => {
    const fixture = createMesherCorpusV1().find((value) => value.name === 'stripes')!;
    const output = meshGreedyOpaqueV1(candidateInput(fixture.input));
    const palettes = new Set(output.paletteIndices);

    expect(palettes).toEqual(new Set([1, 2, 3]));
    expect(output.counts.vertexCount).toBeLessThan(
      fixture.expectedExposedUnitFaceCount * 4,
    );
  });

  it('preflights output and work budgets without mutating borrowed samples', () => {
    const fixture = createMesherCorpusV1().find((value) => value.name === 'solid')!;
    const baseline = fixture.input.sampleVolume.slice();
    const input = candidateInput({
      ...fixture.input,
      outputBudget: { ...fixture.input.outputBudget, maxVertices: 23 },
    });

    expect(() => meshGreedyOpaqueV1(input)).toThrow(/maxVertices/);
    expect(fixture.input.sampleVolume).toEqual(baseline);
  });
});
