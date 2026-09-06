import { describe, expect, it } from 'vitest';
import { buildOakFallenLitterVoxelProjectionV1 } from './oak-fallen-litter-voxel.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import { createOakSimulationV1, oakHostTicksForBiologicalDaysV1 } from './oak-simulation.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

function source(leaf: OakLeafOrganSnapshotV1): readonly OakRenderInstanceRecordV1[] {
  return buildOakTissueVoxelSourceProjectionV1({ organs: [leaf] }, false, {
    includeDetachedLeaves: true,
  }).records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
}

function cell(key: string): string {
  const suffix = /:(-?\d+):(-?\d+):(-?\d+)$/u.exec(key);
  if (suffix === null) throw new Error(`Leaf material record '${key}' has no source-cell suffix.`);
  return suffix.slice(1).join(':');
}

// Bound: every fracture in the default seed's first season, one tick either
// side, and actual day-249 litter. This checks RGBA, not contact or fall physics.
describe('oak leaf pigment through real seasonal fractures', () => {
  it('loses green across every leaf role before fracture and retains donor RGBA into litter', () => {
    const simulation = createOakSimulationV1();
    const growth = OAK_PARAMETERS_V1.growth;
    let tick = oakHostTicksForBiologicalDaysV1(growth.senescenceDay);
    simulation.advanceHostTicks(tick);
    const leaves = simulation.projection().organs.filter((organ) => organ.kind === 'leaf')
      .sort((left, right) => left.key.localeCompare(right.key));
    expect(leaves).toHaveLength(10);
    const donors = new Map<string, Map<string, OakRenderInstanceRecordV1['color']>>();

    for (const [index, initial] of leaves.entries()) {
      const fractureTick = oakHostTicksForBiologicalDaysV1(growth.senescenceDay
        + growth.abscissionDelayDays + index * growth.development.leafFallStaggerDaysPerSlot);
      simulation.advanceHostTicks(fractureTick - tick - 1);
      tick = fractureTick - 1;
      let before = simulation.projection().organs.find((organ) =>
        organ.key === initial.key) as OakLeafOrganSnapshotV1;
      expect(before.stage, initial.key).toBe('senescing');
      let detached = before;
      // Fractional biological seconds can put the actual boundary one tick
      // after the rounded day estimate. Observe the transition itself.
      for (let attempt = 0; attempt < 3 && detached.stage === 'senescing'; attempt += 1) {
        before = detached;
        simulation.advanceHostTicks(1);
        tick += 1;
        detached = simulation.projection().organs.find((organ) =>
          organ.key === initial.key) as OakLeafOrganSnapshotV1;
      }
      const prior = new Map(source(before).map((record) => [record.key, record.color]));
      expect(detached.stage, initial.key).toBe('detached');
      const records = source(detached);
      expect(records.length, initial.key).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.color.r, `${initial.key} ${record.key} senescent pigment`)
          .toBeGreaterThan(record.color.g);
      }
      const counterfactual = new Map(source({
        ...detached, stage: 'senescing', developmentPhase: 'senescing',
      }).map((record) => [record.key, record.color]));
      let changed = 0;
      expect(records).toHaveLength(prior.size);
      for (const record of records) {
        expect(record.color, `${record.key} detachment-only RGBA`)
          .toEqual(counterfactual.get(record.key));
        const previous = prior.get(record.key)!;
        expect(record.color.a).toBe(previous.a);
        changed += Number(record.color.r !== previous.r || record.color.g !== previous.g
          || record.color.b !== previous.b);
      }
      expect(changed, `${initial.key} one-tick material cohort`)
        .toBeLessThanOrEqual(Math.ceil(records.length * 0.25));
      const body = buildOakTissueVoxelProjectionV1({ organs: [detached] }, false)
        .detachedLeafBodies[0]!;
      donors.set(initial.key, new Map(body.records.map((record) => [cell(record.key), record.color])));
    }

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249) - tick);
    const state = simulation.projection();
    expect(state.organs.filter((organ) => organ.kind === 'leaf' && organ.stage === 'abscised'))
      .toHaveLength(leaves.length);
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    for (const [leafKey, colors] of donors) {
      const records = litter.records.filter(({ key }) => key.startsWith(`oak-litter:${leafKey}:`));
      expect(records, leafKey).toHaveLength(colors.size);
      for (const record of records) {
        expect(record.color, `${record.key} donor-to-litter RGBA`).toEqual(colors.get(cell(record.key)));
      }
    }
  });
});
