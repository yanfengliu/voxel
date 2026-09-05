import { describe, expect, it, vi } from 'vitest';

import * as attachmentSolver from './oak-cellular-leaf-hinge.js';
import { moveOakOrganToLitterV1 } from './oak-development.js';
import { detachOakLeafAtBaseV1 } from './oak-leaf-lifecycle.js';
import { OAK_PARAMETERS_V1, OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  createInitialOakStateV1,
  totalOakStorageV1,
  type MutableOakOrganV1,
} from './oak-state.js';
import type {
  OakLeafOrganSnapshotV1, OakResourcePoolsV1, OakVec3V1,
} from './oak-types.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';

function pools(organ: MutableOakOrganV1): OakResourcePoolsV1 {
  return {
    carbonKg: organ.structuralCarbonKg,
    nitrogenKg: organ.structuralNitrogenKg,
    phosphorusKg: organ.structuralPhosphorusKg,
    waterLiters: organ.waterLiters,
  };
}

function expectPoolsClose(
  actual: OakResourcePoolsV1,
  expected: OakResourcePoolsV1,
): void {
  for (const key of [
    'carbonKg', 'nitrogenKg', 'phosphorusKg', 'waterLiters',
  ] as const) expect(actual[key], key).toBeCloseTo(expected[key], 14);
}

describe('oak base-abscission authority', () => {
  it('adds the micrometre cleft only after the ordinary attached mechanics pose', () => {
    // Bound: default seed and clock, the host ticks immediately before/at day 240.
    const simulation = createOakSimulationV1();
    const fractureTick = oakHostTicksForBiologicalDaysV1(240);
    simulation.advanceHostTicks(fractureTick - 2);
    const resolve = attachmentSolver.oakResolveLeafAttachmentPoseV1;
    const unseparated = new Map<string, OakVec3V1>();
    const spy = vi.spyOn(attachmentSolver, 'oakResolveLeafAttachmentPoseV1')
      .mockImplementation((input) => {
        const pose = resolve(input);
        if (input.current) unseparated.set(input.leaf.key, { ...pose });
        return pose;
      });
    try {
      const before = simulation.advanceHostTicks(1);
      expect(before.elapsedBiologicalSeconds).toBeLessThan(240 * OAK_SECONDS_PER_DAY_V1);
      const leaves = before.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf');
      expect(leaves).toHaveLength(10);
      for (const leaf of leaves) {
        expect(leaf.stage, leaf.key).toBe('senescing');
        expect(leaf.abscissionScar, leaf.key).toBeUndefined();
        expect(unseparated.has(leaf.key), `${leaf.key} ordinary mechanics call`).toBe(true);
        expect(leaf.positionM, `${leaf.key} unseparated attached pose`)
          .toEqual(unseparated.get(leaf.key));
      }
      const after = simulation.advanceHostTicks(1);
      expect(after.elapsedBiologicalSeconds).toBe(240 * OAK_SECONDS_PER_DAY_V1);
      const detached = after.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.stage === 'detached');
      expect(detached).toHaveLength(1);
      const leaf = detached[0]!;
      expect(leaf.parentKey).toBeNull();
      expect(leaf.fallProgressFraction).toBe(0);
      const scar = leaf.abscissionScar!;
      expect(scar).toBeDefined();
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(leaf.positionM[axis] - scar.positionM[axis], `${axis} post-fracture cleft`)
          .toBeCloseTo(scar.direction[axis] * 0.000_001, 15);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the whole petiole pools on the leaf and transfers them exactly once to litter', () => {
    const state = createInitialOakStateV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_SECONDS_PER_DAY_V1,
      paused: false,
      ablation: 'baseline',
      regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    }, 1);
    state.elapsedBiologicalSeconds = 240 * OAK_SECONDS_PER_DAY_V1;
    const parent = state.organs[0]!;
    const leaf: MutableOakOrganV1 = {
      key: 'organ:2:1',
      identity: { localId: 2, generation: 1 },
      kind: 'leaf',
      parentKey: parent.key,
      attachment: {
        parentOrganKey: parent.key,
        nodeSite: 'distal',
        restRadialUnitWorld: { x: 1, y: 0, z: 0 },
      },
      branchOrder: 1,
      birthDay: 12,
      restPositionM: { x: 0, y: 0.06, z: 0 },
      positionM: { x: 0, y: 0.06, z: 0 },
      restDirection: { x: 1, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      lengthM: 0.075,
      radiusM: 0.001,
      structuralCarbonKg: 0.00009,
      structuralNitrogenKg: 0.00000135,
      structuralPhosphorusKg: 0.0000000864,
      waterLiters: 0.00027,
      waterPotentialMpa: -0.7,
      stage: 'senescing',
      healthFraction: 1,
      stressFraction: 0.2,
      areaM2: 0.0015,
      rollRadians: 0.3,
      chlorophyllFraction: 0.15,
      relativeWaterContentFraction: 0.62,
      mechanicsClamped: false,
    };
    state.organs.push(leaf);
    const parentBefore = pools(parent);
    const leafBefore = pools(leaf);
    const storageBefore = totalOakStorageV1(state);
    const positionBefore = { ...leaf.positionM };
    const directionBefore = { ...leaf.direction };
    expect(leaf.stage).toBe('senescing');
    expect(leaf.abscissionScar).toBeUndefined();
    expect(leaf.positionM).toEqual(positionBefore);

    detachOakLeafAtBaseV1(state, leaf);

    expect(leaf.stage).toBe('detached');
    expect(leaf.parentKey).toBeNull();
    expectPoolsClose(pools(parent), parentBefore);
    expectPoolsClose(pools(leaf), leafBefore);
    expectPoolsClose(totalOakStorageV1(state), storageBefore);
    expect(leaf.abscissionScar).toMatchObject({
      parentKey: parent.key,
      positionM: positionBefore,
      searchRadiusM: 0.006,
    });
    const fractureDisplacement = {
      x: leaf.positionM.x - positionBefore.x,
      y: leaf.positionM.y - positionBefore.y,
      z: leaf.positionM.z - positionBefore.z,
    };
    const separationM = OAK_PARAMETERS_V1.growth.development.abscissionSeparationM;
    expect(separationM).toBe(0.000_001);
    expect(fractureDisplacement.x).toBeCloseTo(directionBefore.x * separationM, 15);
    expect(fractureDisplacement.y).toBeCloseTo(directionBefore.y * separationM, 15);
    expect(fractureDisplacement.z).toBeCloseTo(directionBefore.z * separationM, 15);
    expect(Math.hypot(
      fractureDisplacement.x,
      fractureDisplacement.y,
      fractureDisplacement.z,
    )).toBeCloseTo(separationM, 15);
    expect('retainedPools' in leaf.abscissionScar!).toBe(false);

    const litterBefore = state.soil.map((cell) => ({
      key: cell.key,
      carbonKg: cell.litterCarbonKg,
      nitrogenKg: cell.litterNitrogenKg,
      phosphorusKg: cell.litterPhosphorusKg,
      waterLiters: cell.waterLiters,
    }));
    moveOakOrganToLitterV1(state, leaf);
    const recipient = state.soil.find((cell) =>
      cell.key === leaf.litterRecipientSoilCellKey)!;
    const recipientBefore = litterBefore.find((cell) => cell.key === recipient.key)!;
    expect(recipient.litterCarbonKg - recipientBefore.carbonKg)
      .toBeCloseTo(leafBefore.carbonKg, 14);
    expect(recipient.litterNitrogenKg - recipientBefore.nitrogenKg)
      .toBeCloseTo(leafBefore.nitrogenKg, 14);
    expect(recipient.litterPhosphorusKg - recipientBefore.phosphorusKg)
      .toBeCloseTo(leafBefore.phosphorusKg, 14);
    expect(recipient.waterLiters - recipientBefore.waterLiters)
      .toBeCloseTo(leafBefore.waterLiters, 14);
    expectPoolsClose(pools(leaf), {
      carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0,
    });
    expectPoolsClose(totalOakStorageV1(state), storageBefore);
  });

  it('rejects a wound whose declared physical search radius reaches no parent material', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const projection = simulation.projection();
    const scarred = projection.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.abscissionScar !== undefined);
    expect(scarred).toBeDefined();
    const organs = projection.organs.map((organ) => organ.key !== scarred!.key
      || organ.kind !== 'leaf' ? organ : {
      ...organ,
      abscissionScar: {
        ...organ.abscissionScar!,
        searchRadiusM: 1e-12,
      },
    });
    expect(() => buildOakTissueVoxelProjectionV1({ ...projection, organs }, false))
      .toThrow(/requires parent material within 1e-12 m/u);
  });
});
