import { describe, expect, it } from 'vitest';

import { oakLeafVariantForOrganKeyV1 } from './oak-leaf-shape.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  buildOakTissueVoxelProjectionV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-union-lattice.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  createOakTissueVoxelGeometryV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1,
} from './oak-tissue-voxel-projection.js';

interface LocalVoxel {
  readonly organKey: string;
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function localVoxel(key: string): LocalVoxel {
  const match = /^oak:(organ:\d+:\d+):([^:]+):(-?\d+):(-?\d+):(-?\d+)$/u.exec(key);
  if (!match) throw new Error(`Cannot parse tissue source key '${key}'.`);
  return {
    organKey: match[1]!,
    role: match[2]!,
    x: Number(match[3]),
    y: Number(match[4]),
    z: Number(match[5]),
  };
}

function publicCell(key: string): OakTissueLatticeCellV1 {
  const match = /^oak:organ:\d+:\d+:union-voxel:(-?\d+):(-?\d+):(-?\d+)$/u.exec(key);
  if (!match) throw new Error(`Cannot parse public tissue key '${key}'.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function connected(voxels: readonly LocalVoxel[]): boolean {
  const keys = new Set(voxels.map(({ x, y, z }) => `${String(x)}/${String(y)}/${String(z)}`));
  const first = keys.values().next().value as string | undefined;
  if (!first) return false;
  const reached = new Set([first]);
  const queue = [first];
  for (const queuedKey of queue) {
    const [x, y, z] = queuedKey.split('/').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const) {
      const neighbor = `${String(x + dx)}/${String(y + dy)}/${String(z + dz)}`;
      if (!keys.has(neighbor) || reached.has(neighbor)) continue;
      reached.add(neighbor);
      queue.push(neighbor);
    }
  }
  return reached.size === keys.size;
}

function quantizedPairedLobePeaks(voxels: readonly LocalVoxel[]): number {
  const widths = new Map<number, number>();
  for (const voxel of voxels) widths.set(voxel.y, Math.max(widths.get(voxel.y) ?? 0, Math.abs(voxel.x)));
  const compressed = [...widths].sort(([left], [right]) => left - right)
    .map(([, width]) => width)
    .filter((width, index, values) => index === 0 || width !== values[index - 1]);
  let peaks = 0;
  for (let index = 1; index < compressed.length - 1; index += 1) {
    if (compressed[index]! > compressed[index - 1]!
      && compressed[index]! > compressed[index + 1]!) peaks += 1;
  }
  return peaks;
}

describe('oak tissue voxel projection', () => {
  it('serializes one exact, visibly coarse cube on a bounded dyadic world lattice', () => {
    const geometry = createOakTissueVoxelGeometryV1();
    expect(geometry.positions.length / 3).toBe(24);
    expect(geometry.indices.length / 3).toBe(12);
    expect(geometry.bounds).toEqual({
      min: { x: -.5, y: -.5, z: -.5 },
      max: { x: .5, y: .5, z: .5 },
    });
    expect(OAK_TISSUE_VOXEL_PITCH_NUMERATOR_V1
      * (2 * OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1 + 1)).toBeLessThan(2 ** 24);

    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const projection = buildOakTissueVoxelProjectionV1(simulation.projection(), true);
    const records = [...projection.records.values()].flat();
    expect(records).toHaveLength(projection.tissueVoxelCount);
    expect(records.length).toBeGreaterThan(1_000);
    expect(new Set(records.map(({ key }) => key)).size).toBe(records.length);
    expect(new Set(records.map(({ key }) => publicCell(key).join(':'))).size).toBe(records.length);
    for (const record of records) {
      const [x, y, z] = publicCell(record.key);
      expect(Math.max(Math.abs(x), Math.abs(y), Math.abs(z)))
        .toBeLessThanOrEqual(OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1);
      expect(record.matrix).toEqual([
        OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
        0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
        0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
        (x + .5) * OAK_TISSUE_VOXEL_PITCH_M_V1,
        (y + .5) * OAK_TISSUE_VOXEL_PITCH_M_V1,
        (z + .5) * OAK_TISSUE_VOXEL_PITCH_M_V1,
        1,
      ]);
      for (const coordinate of [x, y, z]) {
        const center = coordinate * OAK_TISSUE_VOXEL_PITCH_M_V1;
        expect(Math.fround(center)).toBe(center);
        expect(Math.fround(center + OAK_TISSUE_VOXEL_PITCH_M_V1 / 2))
          .toBe(center + OAK_TISSUE_VOXEL_PITCH_M_V1 / 2);
      }
    }
    expect(projection.sourceAssignments.size).toBe(projection.sourceVoxelCount);
    expect(new Set([...projection.sourceAssignments.values()].map(({ cell }) => cell.join(':'))).size)
      .toBe(projection.sourceVoxelCount);
    expect(projection.repairVoxelCount).toBeGreaterThan(0);
    expect(projection.repairVoxelCount / projection.sourceVoxelCount).toBeLessThan(.1);
  });

  it('keeps biological source masks connected and roots inspection-only', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const surface = buildOakTissueVoxelSourceProjectionV1(simulation.projection(), false);
    const cutaway = buildOakTissueVoxelSourceProjectionV1(simulation.projection(), true);
    expect(surface.records.get(OAK_ROOT_VOXEL_BATCH_KEY_V1)).toEqual([]);
    expect(cutaway.rootVoxelCount).toBeGreaterThan(0);
    const structural = [...cutaway.records.entries()]
      .filter(([batch]) => batch !== OAK_LEAF_VOXEL_BATCH_KEY_V1)
      .flatMap(([, records]) => records)
      .map(({ key }) => localVoxel(key));
    for (const organKey of new Set(structural.map(({ organKey }) => organKey))) {
      expect(connected(structural.filter((voxel) => voxel.organKey === organKey)), organKey).toBe(true);
    }
  });

  it('preserves oak leaf area, midrib and paired-lobe grammar in the source masks', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const state = simulation.projection();
    const projection = buildOakTissueVoxelSourceProjectionV1(state, false);
    const leafRecords = projection.records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!
      .map(({ key }) => localVoxel(key));
    for (const leaf of state.organs.filter((organ) => organ.kind === 'leaf')) {
      const voxels = leafRecords.filter((voxel) => voxel.organKey === leaf.key);
      expect(connected(voxels), leaf.key).toBe(true);
      const lamina = voxels.filter(({ role }) => role === 'lamina-voxel' || role === 'midrib-voxel');
      const areaM2 = lamina.length * OAK_TISSUE_VOXEL_PITCH_M_V1 ** 2;
      expect(Math.abs(areaM2 - leaf.areaM2) / leaf.areaM2, leaf.key).toBeLessThan(.22);
      expect(new Set(lamina.map(({ y }) => y)).size, leaf.key).toBeGreaterThan(15);
      expect(new Set(lamina.map(({ x }) => x)).size, leaf.key).toBeGreaterThan(5);
      expect(quantizedPairedLobePeaks(lamina), leaf.key).toBe(
        (oakLeafVariantForOrganKeyV1(leaf.key).lobeCount - 1) / 2,
      );
    }
  });

  it('keeps ordinary breeze lattice churn bounded while visible material moves', () => {
    for (const phase of [1, 7, 15, 31, 95, 191, 383]) {
      const simulation = createOakSimulationV1();
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
      simulation.setPaused(true);
      simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
      simulation.advanceHostTicks(phase);
      const before = buildOakTissueVoxelProjectionV1(simulation.projection(), false);
      simulation.advanceHostTicks(1);
      const after = buildOakTissueVoxelProjectionV1(simulation.projection(), false);
      const beforeKeys = new Set([...before.records.values()].flat().map(({ key }) => key));
      const afterKeys = new Set([...after.records.values()].flat().map(({ key }) => key));
      const retained = [...beforeKeys].filter((key) => afterKeys.has(key)).length;
      expect(retained / beforeKeys.size, `phase ${String(phase)}`).toBeGreaterThan(.97);
      expect(retained, `phase ${String(phase)}`).toBeLessThan(beforeKeys.size);
    }
  });
});
