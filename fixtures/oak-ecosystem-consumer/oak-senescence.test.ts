import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
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
    expect(onset.every((leaf) => leaf.stage === 'senescing')).toBe(true);

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(10));
    const middle = leavesAtCurrentState(simulation);
    expect(Math.max(...middle.map((leaf) => leaf.chlorophyllFraction)))
      .toBeLessThan(Math.max(...onset.map((leaf) => leaf.chlorophyllFraction)));

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(19));
    const late = leavesAtCurrentState(simulation);
    expect(Math.max(...late.map((leaf) => leaf.chlorophyllFraction)))
      .toBeLessThan(Math.max(...middle.map((leaf) => leaf.chlorophyllFraction)));
    expect(late.every((leaf) => {
      const color = oakLeafColorV1(leaf);
      return color.r > color.g && color.g > color.b;
    })).toBe(true);

    const litterBefore = simulation.snapshot().soil.reduce(
      (sum, cell) => sum + cell.litter.carbonKg, 0,
    );
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    expect(leavesAtCurrentState(simulation).every((leaf) => leaf.stage === 'abscised')).toBe(true);
    expect(simulation.snapshot().soil.reduce(
      (sum, cell) => sum + cell.litter.carbonKg, 0,
    )).toBeGreaterThan(litterBefore);
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

    const fallenSimulation = createOakSimulationV1();
    fallenSimulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const fallen = buildOakRenderFrameV1(fallenSimulation.projection());
    const leafBatch = fallen.snapshot.batches.find(
      (candidate) => candidate.key === OAK_LEAF_VOXEL_BATCH_KEY_V1,
    );
    expect(leafBatch?.instanceKeys).toHaveLength(0);
    expect(fallen.metrics.leafVoxels).toBe(0);
  });
});
