import { describe, expect, it } from 'vitest';

import { buildOakContinuousAnalysisSnapshotV1 } from './oak-continuous-render-analysis.js';
import { isOakPlacedOrganV1 } from './oak-organ-lifecycle.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

describe('oak continuous analysis surface', () => {
  it('keeps one unflared two-ring approximation per placed structural organ', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const snapshot = buildOakContinuousAnalysisSnapshotV1(state, {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const structural = state.organs.filter((organ) =>
      isOakPlacedOrganV1(organ)
      && ['stem', 'branch', 'coarse-root', 'fine-root-cohort'].includes(organ.kind));
    const shaftKeys = snapshot.batches.flatMap(({ instanceKeys }) =>
      instanceKeys.filter((key) => key.endsWith(':shaft'))).sort();
    expect(shaftKeys).toEqual(structural.map((organ) => `oak:${organ.key}:shaft`).sort());
    const allInstanceKeys = snapshot.batches.flatMap(({ instanceKeys }) => instanceKeys);
    for (const organ of structural) {
      expect(allInstanceKeys.filter((key) => key.startsWith(`oak:${organ.key}:`)))
        .toEqual([`oak:${organ.key}:shaft`]);
    }
    expect(snapshot.resources.some(({ key }) =>
      key.includes('node-collar') || key.includes('node-flared'))).toBe(false);
    expect(snapshot.batches.some(({ key }) =>
      key.includes('node-flared') || key === 'batch:oak:junctions')).toBe(false);

    const usedGeometryKeys = new Set(snapshot.batches
      .filter(({ instanceKeys }) => instanceKeys.some((key) => key.endsWith(':shaft')))
      .map(({ geometryKey }) => geometryKey));
    for (const resource of snapshot.resources) {
      if (resource.kind !== 'geometry' || !usedGeometryKeys.has(resource.key)) continue;
      const ringYs = [...new Set(Array.from(
        { length: resource.positions.length / 3 },
        (_, index) => resource.positions[index * 3 + 1]!,
      ))];
      expect(ringYs).toHaveLength(2);
    }
  });
});
