import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1,
  OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1,
  OAK_CUTAWAY_COARSE_ROOT_COLOR_V1,
} from './oak-root-cutaway-presentation.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

function instance(
  frame: ReturnType<typeof buildOakRenderFrameV1>,
  key: string,
): { matrix: Float32Array; color: readonly number[] } {
  for (const batch of frame.snapshot.batches) {
    const slot = batch.instanceKeys.indexOf(key);
    if (slot < 0) continue;
    return {
      matrix: batch.matrices.slice(slot * 16, slot * 16 + 16),
      color: [...batch.colors!.subarray(slot * 4, slot * 4 + 4)],
    };
  }
  throw new Error(`Missing oak cutaway instance '${key}'.`);
}

describe('oak root-cutaway presentation', () => {
  it('keeps one path per root organ and gives only the aggregate cohort a visibility floor', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const biological = simulation.snapshot();
    const projection = simulation.projection();
    const cutaway = buildOakRenderFrameV1(projection, {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const surface = buildOakRenderFrameV1(projection);
    const livingRoots = biological.organs.filter((organ) =>
      (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort')
      && organ.stage !== 'abscised');
    expect(livingRoots.filter((organ) => organ.kind === 'coarse-root')).toHaveLength(1);
    expect(livingRoots.filter((organ) => organ.kind === 'fine-root-cohort')).toHaveLength(1);
    const rootInstanceKeys = cutaway.snapshot.batches
      .filter((batch) => batch.key.startsWith('batch:oak:root:'))
      .flatMap((batch) => batch.instanceKeys);
    expect(rootInstanceKeys.sort()).toEqual(
      livingRoots.map((organ) => `oak:${organ.key}:shaft`).sort(),
    );
    expect(cutaway.metrics.rootSegments).toBe(livingRoots.length);

    const coarse = livingRoots.find((organ) => organ.kind === 'coarse-root')!;
    const fine = livingRoots.find((organ) => organ.kind === 'fine-root-cohort')!;
    expect(fine.radiusM).toBeLessThan(OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1);
    const coarseInstance = instance(cutaway, `oak:${coarse.key}:shaft`);
    const fineInstance = instance(cutaway, `oak:${fine.key}:shaft`);
    expect(coarseInstance.color).toEqual(Object.values(OAK_CUTAWAY_COARSE_ROOT_COLOR_V1));
    expect(fineInstance.color).toEqual(
      Object.values(OAK_CUTAWAY_AGGREGATE_FINE_ROOT_COLOR_V1),
    );
    expect(Math.hypot(
      fineInstance.matrix[0]!,
      fineInstance.matrix[1]!,
      fineInstance.matrix[2]!,
    )).toBeCloseTo(OAK_AGGREGATE_FINE_ROOT_DISPLAY_RADIUS_M_V1, 10);
    expect(() => instance(surface, `oak:${fine.key}:shaft`)).toThrow(/Missing oak cutaway instance/u);
  });
});
