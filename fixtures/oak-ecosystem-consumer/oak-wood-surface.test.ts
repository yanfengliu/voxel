import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_NODE_FLARE_LENGTH_FRACTION_V1,
  OAK_NODE_FLARE_PEAK_FRACTION_V1,
  OAK_NODE_FLARE_PEAK_RADIUS_MULTIPLIER_V1,
  OAK_TAPER_RATIOS_V1,
  oakWoodProfileAtTaperV1,
} from './oak-wood-shape.js';

describe('oak public wood surface', () => {
  it('derives one continuous positive node-flare profile from each taper', () => {
    for (const [taperIndex, taperRatio] of OAK_TAPER_RATIOS_V1.entries()) {
      const profile = oakWoodProfileAtTaperV1(taperIndex, true);
      expect(profile).toHaveLength(4);
      expect(profile[0]).toEqual({ axialFraction: 0, radiusRatio: 1 });
      const start = profile[1]!;
      const peak = profile[2]!;
      const distal = profile[3]!;
      expect(start.axialFraction).toBe(1 - OAK_NODE_FLARE_LENGTH_FRACTION_V1);
      expect(start.radiusRatio).toBe(
        taperRatio + (1 - taperRatio) * OAK_NODE_FLARE_LENGTH_FRACTION_V1,
      );
      expect(peak.axialFraction).toBe(
        start.axialFraction
          + OAK_NODE_FLARE_LENGTH_FRACTION_V1 * OAK_NODE_FLARE_PEAK_FRACTION_V1,
      );
      expect(peak.radiusRatio).toBe(
        start.radiusRatio * OAK_NODE_FLARE_PEAK_RADIUS_MULTIPLIER_V1,
      );
      expect(distal).toEqual({ axialFraction: 1, radiusRatio: taperRatio });
      for (let index = 0; index < profile.length - 1; index += 1) {
        expect(profile[index + 1]!.axialFraction).toBeGreaterThan(
          profile[index]!.axialFraction,
        );
        expect(profile[index]!.radiusRatio).toBeGreaterThan(0);
      }
    }
  });

  it('submits one continuous shaft per active organ and opens occupied-parent ports', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const frame = buildOakRenderFrameV1(state, {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const structural = state.organs.filter((organ) =>
      organ.stage !== 'abscised' && organ.healthFraction > 0
      && ['stem', 'branch', 'coarse-root', 'fine-root-cohort'].includes(organ.kind));
    const shaftKeys = frame.snapshot.batches.flatMap(({ instanceKeys }) =>
      instanceKeys.filter((key) => key.endsWith(':shaft'))).sort();
    expect(shaftKeys).toEqual(structural.map((organ) => `oak:${organ.key}:shaft`).sort());
    const allInstanceKeys = frame.snapshot.batches.flatMap(({ instanceKeys }) => instanceKeys);
    for (const organ of structural) {
      expect(allInstanceKeys.filter((key) => key.startsWith(`oak:${organ.key}:`)))
        .toEqual([`oak:${organ.key}:shaft`]);
    }
    expect(frame.snapshot.resources.some(({ key }) => key.includes('node-collar'))).toBe(false);
    expect(frame.snapshot.batches.some(({ key }) => key === 'batch:oak:junctions')).toBe(false);

    const structuralKeys = new Set(structural.map((organ) => organ.key));
    const occupiedParents = new Set(structural
      .filter((organ) => organ.parentKey !== null && structuralKeys.has(organ.parentKey))
      .map((organ) => organ.parentKey));
    const flaredKeys = frame.snapshot.batches
      .filter(({ key }) => key.includes(':node-flared:'))
      .flatMap(({ instanceKeys }) => instanceKeys)
      .sort();
    expect(flaredKeys).toEqual([...occupiedParents].map((key) => `oak:${key}:shaft`).sort());

    const flaredGeometryKeys = new Set(frame.snapshot.batches
      .filter(({ key }) => key.includes(':node-flared:'))
      .map(({ geometryKey }) => geometryKey));
    for (const resource of frame.snapshot.resources) {
      if (resource.kind !== 'geometry' || !flaredGeometryKeys.has(resource.key)) continue;
      const ringYs = [...new Set(Array.from(
        { length: resource.positions.length / 3 },
        (_, index) => resource.positions[index * 3 + 1]!,
      ))].sort((left, right) => left - right);
      expect(ringYs).toHaveLength(4);
      const coordinates = Array.from(
        { length: resource.positions.length / 3 },
        (_, index) => [
          resource.positions[index * 3],
          resource.positions[index * 3 + 1],
          resource.positions[index * 3 + 2],
        ].join('/'),
      );
      expect(new Set(coordinates).size).toBe(coordinates.length);
      const intervalTriangleCounts = new Map<string, number>();
      for (let offset = 0; offset < resource.indices.length; offset += 3) {
        const ys = [...new Set([
          resource.positions[resource.indices[offset]! * 3 + 1]!,
          resource.positions[resource.indices[offset + 1]! * 3 + 1]!,
          resource.positions[resource.indices[offset + 2]! * 3 + 1]!,
        ])].sort((left, right) => left - right);
        expect(ys).toHaveLength(2);
        const interval = `${String(ys[0])}/${String(ys[1])}`;
        intervalTriangleCounts.set(interval, (intervalTriangleCounts.get(interval) ?? 0) + 1);
      }
      expect([...intervalTriangleCounts.values()]).toEqual([16, 16, 16]);
    }
  });
});
