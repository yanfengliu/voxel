import { describe, expect, it } from 'vitest';

import {
  oakLeafVariantForOrganKeyV1,
  oakLeafWidthScaleMForDescriptorV1,
} from './oak-leaf-shape.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedTissueRecordsV1,
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
  OAK_TISSUE_VOXEL_RULE_IDS_V1,
  oakQuantizedLeafRadialsV1,
} from './oak-tissue-voxel-projection.js';
import type {
  OakLeafOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakStructuralOrganSnapshotV1,
} from './oak-types.js';

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

function syntheticLeaf(developmentFraction: number): OakLeafOrganSnapshotV1 {
  const targetLengthM = 0.08;
  const targetAreaM2 = 0.0015;
  return {
    key: 'organ:900:1',
    identity: { localId: 900, generation: 1 },
    kind: 'leaf',
    parentKey: null,
    branchOrder: 1,
    ageDays: developmentFraction * 28,
    positionM: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: targetLengthM * Math.sqrt(developmentFraction),
    radiusM: 0.001 * Math.sqrt(developmentFraction),
    targetLengthM,
    targetRadiusM: 0.001,
    dryMassKg: 0.001 * developmentFraction,
    waterPotentialMpa: -0.3,
    pools: { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 },
    stage: developmentFraction === 1 ? 'mature' : 'expanding',
    developmentPhase: developmentFraction === 1 ? 'mature' : 'cell-expansion',
    developmentFraction,
    healthFraction: 1,
    stressFraction: 0,
    areaM2: targetAreaM2 * developmentFraction,
    targetAreaM2,
    inclinationRadians: Math.PI / 2,
    rollRadians: 0,
    chlorophyllFraction: 0.82,
    relativeWaterContentFraction: 0.95,
  };
}

function syntheticBranch(developmentFraction: number): OakStructuralOrganSnapshotV1 {
  const linear = Math.cbrt(developmentFraction);
  return {
    key: 'organ:901:1',
    identity: { localId: 901, generation: 1 },
    kind: 'branch',
    parentKey: null,
    branchOrder: 1,
    ageDays: developmentFraction * 28,
    positionM: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: 0.06 * linear,
    radiusM: 0.004 * linear,
    targetLengthM: 0.06,
    targetRadiusM: 0.004,
    dryMassKg: 0.002 * developmentFraction,
    waterPotentialMpa: -0.3,
    pools: { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 },
    stage: developmentFraction === 1 ? 'mature' : 'expanding',
    developmentPhase: developmentFraction === 1 ? 'mature' : 'cell-expansion',
    developmentFraction,
    healthFraction: 1,
    stressFraction: 0,
  };
}

function sourceVoxels(organ: OakLeafOrganSnapshotV1 | OakStructuralOrganSnapshotV1): LocalVoxel[] {
  return sourceVoxelsFor([organ], organ.key);
}

function sourceVoxelsFor(
  organs: readonly (OakLeafOrganSnapshotV1 | OakStructuralOrganSnapshotV1)[],
  organKey: string,
): LocalVoxel[] {
  return [...buildOakTissueVoxelSourceProjectionV1({ organs }, false).records.values()]
    .flat()
    .map(({ key }) => localVoxel(key))
    .filter((voxel) => voxel.organKey === organKey);
}

function sourceKeysByOrgan(
  state: Pick<OakRenderProjectionStateV1, 'organs'>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const record of [...buildOakTissueVoxelSourceProjectionV1(state, true).records.values()].flat()) {
    const voxel = localVoxel(record.key);
    const keys = result.get(voxel.organKey) ?? new Set<string>();
    keys.add(record.key);
    result.set(voxel.organKey, keys);
  }
  return result;
}

function expectMonotoneConnectedFront(
  organs: readonly (OakLeafOrganSnapshotV1 | OakStructuralOrganSnapshotV1)[],
): void {
  let previous = new Set<string>();
  for (const organ of organs) {
    const voxels = sourceVoxels(organ);
    const current = new Set(voxels.map(({ role, x, y, z }) => `${role}/${x}/${y}/${z}`));
    expect(connected(voxels), String(organ.developmentFraction)).toBe(true);
    expect([...previous].every((key) => current.has(key)), String(organ.developmentFraction)).toBe(true);
    expect(current.size).toBeGreaterThanOrEqual(previous.size);
    previous = current;
  }
}

function legacyResampledLeafCells(developmentFraction: number): ReadonlySet<string> {
  const leaf = syntheticLeaf(developmentFraction);
  const variant = oakLeafVariantForOrganKeyV1(leaf.key);
  const lengthM = Math.max(leaf.lengthM, 0.0005);
  const layers = Math.max(1, Math.round(lengthM / OAK_TISSUE_VOXEL_PITCH_M_V1));
  const widthScaleM = oakLeafWidthScaleMForDescriptorV1(leaf.areaM2, lengthM, variant);
  const radials = oakQuantizedLeafRadialsV1(variant, layers, widthScaleM);
  return new Set(radials.flatMap((radial, y) =>
    Array.from({ length: radial * 2 + 1 }, (_, index) => `${String(index - radial)}/${String(y)}`)));
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
      const lamina = voxels.filter(({ role }) => role === 'lamina-voxel'
        || role === 'secondary-vein-voxel' || role === 'midrib-voxel');
      const areaM2 = lamina.length * OAK_TISSUE_VOXEL_PITCH_M_V1 ** 2;
      expect(Math.abs(areaM2 - leaf.areaM2) / leaf.areaM2, leaf.key).toBeLessThan(.22);
      const axialCells = new Set(lamina.map(({ y }) => y)).size;
      const lateralCells = new Set(lamina.map(({ x }) => x)).size;
      const maturePeaks = (oakLeafVariantForOrganKeyV1(leaf.key).lobeCount - 1) / 2;
      if (leaf.developmentFraction === 1) {
        expect(axialCells, leaf.key).toBeGreaterThan(15);
        expect(lateralCells, leaf.key).toBeGreaterThan(5);
        expect(quantizedPairedLobePeaks(lamina), leaf.key).toBe(maturePeaks);
      } else {
        expect(axialCells, leaf.key).toBeGreaterThan(0);
        expect(lateralCells, leaf.key).toBeGreaterThan(0);
        expect(quantizedPairedLobePeaks(lamina), leaf.key).toBeLessThanOrEqual(maturePeaks);
      }
    }
  });

  it('grows every organ through nested connected prefixes of its mature mask', () => {
    expect(OAK_TISSUE_VOXEL_RULE_IDS_V1).toContain('development-front-prefixes');
    const fractions = [0, 0.02, 0.08, 0.2, 0.45, 0.75, 1];
    const leaves = fractions.map(syntheticLeaf);
    const branches = fractions.map(syntheticBranch);
    expectMonotoneConnectedFront(leaves);
    expectMonotoneConnectedFront(branches);

    const firstLeaf = sourceVoxels(leaves[0]!);
    const matureLeaf = sourceVoxels(leaves.at(-1)!);
    expect(firstLeaf).toHaveLength(1);
    expect(firstLeaf[0]!.role).toBe('petiole-voxel');
    expect(firstLeaf.length / matureLeaf.length).toBeLessThan(0.01);
    expect(firstLeaf.every(({ role }) => role !== 'lamina-voxel')).toBe(true);

    const firstBranch = sourceVoxels(branches[0]!);
    const matureBranch = sourceVoxels(branches.at(-1)!);
    expect(firstBranch).toHaveLength(1);
    expect(firstBranch.length / matureBranch.length).toBeLessThan(0.01);
  });

  it('keeps preformed identities internal until their parent chain activates them', () => {
    const hiddenLeaf: OakLeafOrganSnapshotV1 = {
      ...syntheticLeaf(0.005),
      developmentPhase: 'preformed',
    };
    const hiddenBranch: OakStructuralOrganSnapshotV1 = {
      ...syntheticBranch(0.005),
      developmentPhase: 'preformed',
    };
    expect(sourceVoxels(hiddenLeaf)).toEqual([]);
    expect(sourceVoxels(hiddenBranch)).toEqual([]);
    expect(buildOakTissueVoxelProjectionV1({ organs: [hiddenLeaf, hiddenBranch] }, false)
      .tissueVoxelCount).toBe(0);

    const activatedLeaf = { ...hiddenLeaf, developmentPhase: 'cell-division' as const };
    const visible = sourceVoxels(activatedLeaf);
    const mature = sourceVoxels(syntheticLeaf(1));
    expect(connected(visible)).toBe(true);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length / mature.length).toBeLessThan(0.02);
  });

  it('catches the retired whole-shape leaf resampling that deletes earlier cells', () => {
    const early = legacyResampledLeafCells(0.16);
    const later = legacyResampledLeafCells(0.36);
    const lost = [...early].filter((cell) => !later.has(cell));
    expect(lost.length).toBeGreaterThan(0);

    const committedEarly = new Set(sourceVoxels(syntheticLeaf(0.16)).map(({ role, x, y, z }) =>
      `${role}/${String(x)}/${String(y)}/${String(z)}`));
    const committedLater = new Set(sourceVoxels(syntheticLeaf(0.36)).map(({ role, x, y, z }) =>
      `${role}/${String(x)}/${String(y)}/${String(z)}`));
    expect([...committedEarly].every((cell) => committedLater.has(cell))).toBe(true);
  });

  it('keeps earlier leaf source assignments fixed while the connected front advances', () => {
    let previous = new Map<string, OakTissueLatticeCellV1>();
    let previousMaterial = new Set<number>();
    for (const fraction of [0, 0.08, 0.2, 0.45, 0.75, 1]) {
      const state = { organs: [syntheticLeaf(fraction)] };
      const projection = buildOakTissueVoxelProjectionV1(state, false);
      for (const [sourceKey, cell] of previous) {
        expect(projection.sourceAssignments.get(sourceKey)?.cell, sourceKey).toEqual(cell);
      }
      expect([...previousMaterial].every((cellId) => projection.materialCells.has(cellId))).toBe(true);
      previous = new Map([...projection.sourceAssignments]
        .map(([sourceKey, assignment]) => [sourceKey, assignment.cell]));
      previousMaterial = new Set(projection.materialCells.keys());
    }
  });

  it('keeps actual still-air organ occupancy nested on every host tick through bud break', () => {
    let addedCells = 0;
    for (const startDay of [11.8, 41.8, 81.8]) {
      const simulation = createOakSimulationV1();
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(startDay));
      let previous = sourceKeysByOrgan(simulation.projection());
      for (let tick = 0; tick < 30; tick += 1) {
        simulation.advanceHostTicks(1);
        const current = sourceKeysByOrgan(simulation.projection());
        for (const [organKey, before] of previous) {
          const after = current.get(organKey);
          if (!after) continue;
          expect([...before].every((key) => after.has(key)),
            `${organKey} at day ${String(startDay)} tick ${String(tick)}`).toBe(true);
          addedCells += after.size - before.size;
        }
        previous = current;
      }
    }
    expect(addedCells).toBeGreaterThan(0);
  });

  it('does not alter a mature parent cylinder when a child primordium appears', () => {
    const parent = syntheticBranch(1);
    const childAtBirth: OakStructuralOrganSnapshotV1 = {
      ...syntheticBranch(0),
      key: 'organ:902:1',
      identity: { localId: 902, generation: 1 },
      parentKey: parent.key,
      branchOrder: 2,
      positionM: { x: 0, y: parent.targetLengthM, z: 0 },
      targetLengthM: 0.04,
      targetRadiusM: 0.003,
    };
    const before = sourceVoxels(parent);
    const atBirth = sourceVoxelsFor([parent, childAtBirth], parent.key);
    expect(new Set(atBirth.map(({ role, x, y, z }) => `${role}/${x}/${y}/${z}`)))
      .toEqual(new Set(before.map(({ role, x, y, z }) => `${role}/${x}/${y}/${z}`)));

    const childGrowing: OakStructuralOrganSnapshotV1 = {
      ...childAtBirth,
      ...syntheticBranch(0.08),
      key: childAtBirth.key,
      identity: childAtBirth.identity,
      parentKey: parent.key,
      branchOrder: childAtBirth.branchOrder,
      positionM: childAtBirth.positionM,
      targetLengthM: childAtBirth.targetLengthM,
      targetRadiusM: childAtBirth.targetRadiusM,
    };
    const growing = sourceVoxelsFor([parent, childGrowing], parent.key);
    const atBirthKeys = new Set(atBirth.map(({ role, x, y, z }) => `${role}/${x}/${y}/${z}`));
    const growingKeys = new Set(growing.map(({ role, x, y, z }) => `${role}/${x}/${y}/${z}`));
    expect([...atBirthKeys].every((cell) => growingKeys.has(cell))).toBe(true);
    expect(growing.length - atBirth.length).toBeLessThan(before.length * 0.05);
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
      const beforePresented = new Map([...oakPresentedTissueRecordsV1(before).values()]
        .flat().map((record) => [record.key, record] as const));
      const afterPresented = new Map([...oakPresentedTissueRecordsV1(after).values()]
        .flat().map((record) => [record.key, record] as const));
      const moved = [...beforePresented].filter(([key, record]) => {
        const next = afterPresented.get(key);
        return next !== undefined && record.matrix.some((value, index) => value !== next.matrix[index]);
      });
      expect(moved.length, `phase ${String(phase)} moved public voxels`).toBeGreaterThan(0);
    }
  });
});
