import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';

function leavesAtCurrentState(simulation: ReturnType<typeof createOakSimulationV1>) {
  return simulation.projection().organs.filter((organ) => organ.kind === 'leaf');
}

function leafNutrients(leaves: ReturnType<typeof leavesAtCurrentState>) {
  return leaves.reduce((sum, leaf) => ({
    nitrogenKg: sum.nitrogenKg + leaf.pools.nitrogenKg,
    phosphorusKg: sum.phosphorusKg + leaf.pools.phosphorusKg,
  }), { nitrogenKg: 0, phosphorusKg: 0 });
}

function expectedRetainedNutrientFraction(
  onset: ReturnType<typeof leavesAtCurrentState>,
  ageDays: number,
  nutrient: 'nitrogenKg' | 'phosphorusKg',
  resorptionFraction: number,
): number {
  const leaves = [...onset].sort((left, right) => left.key.localeCompare(right.key));
  const retained = leaves.reduce((sum, leaf, index) => {
    const duration = OAK_PARAMETERS_V1.growth.abscissionDelayDays
      + index * OAK_PARAMETERS_V1.growth.development.leafFallStaggerDaysPerSlot;
    const progress = Math.max(0, Math.min(1, ageDays / duration));
    return sum + leaf.pools[nutrient] * (1 - resorptionFraction * progress);
  }, 0);
  const initial = leaves.reduce((sum, leaf) => sum + leaf.pools[nutrient], 0);
  return retained / initial;
}

function publicLeafColorMeanAtDay(day: number): Readonly<{ r: number; g: number; b: number }> {
  const simulation = createOakSimulationV1();
  simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day));
  const frame = buildOakRenderFrameV1(simulation.projection());
  const batch = frame.snapshot.batches.find(
    (candidate) => candidate.key === OAK_LEAF_VOXEL_BATCH_KEY_V1,
  );
  if (batch?.colors === undefined || batch.instanceKeys.length === 0) {
    throw new Error(`Expected the public leaf voxel batch to be coloured and nonempty on day ${day}.`);
  }
  const totals = { r: 0, g: 0, b: 0 };
  for (let index = 0; index < batch.colors.length; index += 4) {
    totals.r += batch.colors[index]!;
    totals.g += batch.colors[index + 1]!;
    totals.b += batch.colors[index + 2]!;
  }
  return {
    r: totals.r / batch.instanceKeys.length,
    g: totals.g / batch.instanceKeys.length,
    b: totals.b / batch.instanceKeys.length,
  };
}

describe('oak seasonal leaf material', () => {
  it('makes senescence advance after physiology without inventing leaf recovery', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(210));
    const onset = leavesAtCurrentState(simulation);
    const onsetNutrients = leafNutrients(onset);
    expect(onset.every((leaf) => leaf.stage === 'senescing')).toBe(true);

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(10));
    const middle = leavesAtCurrentState(simulation);
    const middleNutrients = leafNutrients(middle);
    expect(Math.max(...middle.map((leaf) => leaf.chlorophyllFraction)))
      .toBeLessThan(Math.max(...onset.map((leaf) => leaf.chlorophyllFraction)));
    expect(middleNutrients.nitrogenKg / onsetNutrients.nitrogenKg)
      .toBeCloseTo(expectedRetainedNutrientFraction(
        onset,
        10,
        'nitrogenKg',
        OAK_PARAMETERS_V1.growth.senescentNitrogenResorptionFraction,
      ), 12);
    expect(middleNutrients.phosphorusKg / onsetNutrients.phosphorusKg)
      .toBeCloseTo(expectedRetainedNutrientFraction(
        onset,
        10,
        'phosphorusKg',
        OAK_PARAMETERS_V1.growth.senescentPhosphorusResorptionFraction,
      ), 12);

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(19));
    const late = leavesAtCurrentState(simulation);
    const lateNutrients = leafNutrients(late);
    expect(Math.max(...late.map((leaf) => leaf.chlorophyllFraction)))
      .toBeLessThan(Math.max(...middle.map((leaf) => leaf.chlorophyllFraction)));
    expect(lateNutrients.nitrogenKg / onsetNutrients.nitrogenKg)
      .toBeCloseTo(expectedRetainedNutrientFraction(
        onset,
        29,
        'nitrogenKg',
        OAK_PARAMETERS_V1.growth.senescentNitrogenResorptionFraction,
      ), 12);
    expect(lateNutrients.phosphorusKg / onsetNutrients.phosphorusKg)
      .toBeCloseTo(expectedRetainedNutrientFraction(
        onset,
        29,
        'phosphorusKg',
        OAK_PARAMETERS_V1.growth.senescentPhosphorusResorptionFraction,
      ), 12);
    expect(Math.abs(simulation.snapshot().ledger.residual.nitrogenKg)).toBeLessThan(1e-12);
    expect(Math.abs(simulation.snapshot().ledger.residual.phosphorusKg)).toBeLessThan(1e-12);
    expect(late.every((leaf) => {
      const color = oakLeafColorV1(leaf);
      return color.r > color.g && color.g > color.b;
    })).toBe(true);

    const litterBefore = simulation.snapshot().soil.reduce(
      (sum, cell) => sum + cell.litter.carbonKg, 0,
    );
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    expect(leavesAtCurrentState(simulation).filter((leaf) => leaf.stage === 'detached'))
      .toHaveLength(1);
    expect(leavesAtCurrentState(simulation).some((leaf) => leaf.stage === 'senescing'))
      .toBe(true);
    const litterAtDetachment = simulation.snapshot().soil.reduce(
      (sum, cell) => sum + cell.litter.carbonKg, 0,
    );
    expect(litterAtDetachment).toBeLessThanOrEqual(litterBefore);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(9));
    expect(leavesAtCurrentState(simulation).every((leaf) => leaf.stage === 'abscised')).toBe(true);
    expect(simulation.snapshot().soil.reduce(
      (sum, cell) => sum + cell.litter.carbonKg, 0,
    )).toBeGreaterThan(litterAtDetachment);
  });

  it("reaches each nutrient target at that leaf's own staggered fracture", () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(210));
    const onset = [...leavesAtCurrentState(simulation)]
      .sort((left, right) => left.key.localeCompare(right.key));
    let currentDay = 210;
    for (const [index, initial] of onset.entries()) {
      const fractureDay = OAK_PARAMETERS_V1.growth.senescenceDay
        + OAK_PARAMETERS_V1.growth.abscissionDelayDays
        + index * OAK_PARAMETERS_V1.growth.development.leafFallStaggerDaysPerSlot;
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(
        fractureDay - currentDay,
      ));
      currentDay = fractureDay;
      const fractured = leavesAtCurrentState(simulation).find((leaf) =>
        leaf.key === initial.key)!;
      expect(fractured.stage, initial.key).toBe('detached');
      expect(fractured.fallProgressFraction, initial.key).toBeLessThan(0.05);
      expect(fractured.pools.nitrogenKg, initial.key).toBeCloseTo(
        initial.pools.nitrogenKg
          * (1 - OAK_PARAMETERS_V1.growth.senescentNitrogenResorptionFraction),
        14,
      );
      expect(fractured.pools.phosphorusKg, initial.key).toBeCloseTo(
        initial.pools.phosphorusKg
          * (1 - OAK_PARAMETERS_V1.growth.senescentPhosphorusResorptionFraction),
        14,
      );
      expect(Math.abs(simulation.snapshot().ledger.residual.nitrogenKg), initial.key)
        .toBeLessThan(1e-12);
      expect(Math.abs(simulation.snapshot().ledger.residual.phosphorusKg), initial.key)
        .toBeLessThan(1e-12);
    }
  });

  it('carries the seasonal colour progression through the public voxel batch', () => {
    const onset = publicLeafColorMeanAtDay(210);
    const middle = publicLeafColorMeanAtDay(220);
    const late = publicLeafColorMeanAtDay(239);

    expect(middle.r - middle.g).toBeGreaterThan(onset.r - onset.g);
    expect(late.r - late.g).toBeGreaterThan(middle.r - middle.g);
    expect(Math.hypot(middle.r - onset.r, middle.g - onset.g, middle.b - onset.b))
      .toBeGreaterThan(5);
    expect(Math.hypot(late.r - middle.r, late.g - middle.g, late.b - middle.b))
      .toBeGreaterThan(20);
    expect(late.r).toBeGreaterThan(late.g);

    const detached = publicLeafColorMeanAtDay(240);
    expect(detached.r).toBeGreaterThan(detached.g);
    expect(detached.g).toBeGreaterThan(detached.b);
    expect(Math.hypot(
      detached.r - late.r,
      detached.g - late.g,
      detached.b - late.b,
    )).toBeLessThan(15);

    const fallenSimulation = createOakSimulationV1();
    fallenSimulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const fallen = buildOakRenderFrameV1(fallenSimulation.projection());
    const leafBatch = fallen.snapshot.batches.find(
      (candidate) => candidate.key === OAK_LEAF_VOXEL_BATCH_KEY_V1,
    );
    expect(leafBatch?.instanceKeys.length).toBeGreaterThan(0);
    expect(fallen.metrics.leafVoxels).toBeGreaterThan(0);
    fallenSimulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(9));
    const landed = buildOakRenderFrameV1(fallenSimulation.projection());
    const landedLeafBatch = landed.snapshot.batches.find(
      (candidate) => candidate.key === OAK_LEAF_VOXEL_BATCH_KEY_V1,
    );
    expect(landedLeafBatch?.instanceKeys).toHaveLength(0);
    expect(landed.metrics.leafVoxels).toBe(0);
  });
});
