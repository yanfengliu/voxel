import { describe, expect, it } from 'vitest';

import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedTissueRecordsV1,
  type OakTissueVoxelProjectionV1,
} from './oak-tissue-union-lattice.js';
import { OAK_LEAF_VOXEL_BATCH_KEY_V1 } from './oak-tissue-voxel-projection.js';
import {
  oakTissueCellIdV1,
  oakTissueCellKeyV1,
} from './oak-tissue-union-routing.js';

function retainedDelta(previous: OakTissueVoxelProjectionV1, next: OakTissueVoxelProjectionV1) {
  const previousRecords = new Map([...previous.records.values()].flat()
    .map((record) => [record.key, record] as const));
  const nextRecords = new Map([...next.records.values()].flat()
    .map((record) => [record.key, record] as const));
  let ownerChanges = 0;
  let sourceChanges = 0;
  let colorChanges = 0;
  const colorsByOwner = new Map<string, number>();
  for (const [id, before] of previous.materialCells) {
    const after = next.materialCells.get(id);
    if (after === undefined) continue;
    ownerChanges += Number(before.ownerOrganKey !== after.ownerOrganKey);
    sourceChanges += Number(before.sourceKey !== after.sourceKey);
    const beforeRecord = previousRecords.get(
      `oak:${before.ownerOrganKey}:union-voxel:${oakTissueCellKeyV1(before.cell)}`,
    );
    const afterRecord = nextRecords.get(
      `oak:${after.ownerOrganKey}:union-voxel:${oakTissueCellKeyV1(after.cell)}`,
    );
    if (beforeRecord === undefined || afterRecord === undefined) {
      throw new Error(`Missing retained oak material record for cell ${String(id)}.`);
    }
    const colorChanged = Number(
      beforeRecord.color.r !== afterRecord.color.r
      || beforeRecord.color.g !== afterRecord.color.g
      || beforeRecord.color.b !== afterRecord.color.b
      || beforeRecord.color.a !== afterRecord.color.a,
    );
    colorChanges += colorChanged;
    if (colorChanged > 0) {
      colorsByOwner.set(
        after.ownerOrganKey,
        (colorsByOwner.get(after.ownerOrganKey) ?? 0) + colorChanged,
      );
    }
  }
  let assignmentMigrations = 0;
  for (const [sourceKey, before] of previous.sourceAssignments) {
    const after = next.sourceAssignments.get(sourceKey);
    if (after !== undefined) {
      assignmentMigrations += Number(
        oakTissueCellIdV1(before.cell) !== oakTissueCellIdV1(after.cell),
      );
    }
  }
  return {
    assignmentMigrations,
    ownerChanges,
    sourceChanges,
    colorChanges,
    maximumOwnerColorChanges: Math.max(0, ...colorsByOwner.values()),
    maximumOwnerColorKey: [...colorsByOwner].sort((left, right) =>
      right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null,
  };
}

function expectRetainedParentAnchors(
  projection: OakTissueVoxelProjectionV1,
  label: string,
): void {
  const parents = new Set(projection.ports.map((port) => port.parentOrganKey));
  for (const parent of parents) {
    expect([...projection.sourceAssignments.values()].some((assignment) =>
      assignment.ownerOrganKey === parent
      && projection.materialCells.get(oakTissueCellIdV1(assignment.cell))?.ownerOrganKey === parent),
    `${label}: ${parent} retained source anchor`).toBe(true);
  }
}

const ROUTING_DELTA_LIMITS = {
  20: { removed: 2, added: 6, migrations: 2, ownerChanges: 2, sourceChanges: 2 },
  54: { removed: 3, added: 4, migrations: 8, ownerChanges: 4, sourceChanges: 7 },
  100: { removed: 7, added: 10, migrations: 17, ownerChanges: 8, sourceChanges: 15 },
} as const;

describe('oak tissue union routing', () => {
  for (const day of [20, 54, 100] as const) {
    it(`keeps structural routing stable while organ-local leaves grow after day ${String(day)}`, () => {
      const simulation = createOakSimulationV1();
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day));
      const aggregateLeafCounts: number[] = [];
      const maximumLeafBodyIncrements: number[] = [];
      const materialCounts: number[] = [];
      const removedMembershipCounts: number[] = [];
      const addedMembershipCounts: number[] = [];
      const assignmentMigrationCounts: number[] = [];
      const retainedOwnerChangeCounts: number[] = [];
      const retainedSourceChangeCounts: number[] = [];
      let previous: OakTissueVoxelProjectionV1 | null = null;
      for (let frame = 0; frame <= 180; frame += 1) {
        if (frame > 0) simulation.advanceHostTicks(1);
        const state = simulation.projection();
        const projection = buildOakTissueVoxelProjectionV1(state, false);
        const leafKeys = new Set(state.organs
          .filter((organ) => organ.kind === 'leaf')
          .map((organ) => organ.key));
        const label = `day ${String(day)} frame ${String(frame)}`;

        // Leaves are stable organ-local bodies, never claims in the shared
        // structural allocator. The public presentation composes them later.
        expect(projection.leafVoxelCount, `${label}: structural leaf cells`).toBe(0);
        expect(projection.records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1),
          `${label}: structural leaf batch`).toEqual([]);
        expect([...projection.sourceAssignments].every(([sourceKey, assignment]) =>
          ![...leafKeys].some((leafKey) => sourceKey.startsWith(`oak:${leafKey}:`))
          && !leafKeys.has(assignment.ownerOrganKey)),
        `${label}: structural source assignments`).toBe(true);
        expect([...projection.materialCells.values()].every((cell) =>
          !leafKeys.has(cell.ownerOrganKey)
          && (cell.sourceKey === undefined
            || ![...leafKeys].some((leafKey) => cell.sourceKey!.startsWith(`oak:${leafKey}:`)))),
        `${label}: structural material cells`).toBe(true);
        expect(projection.ports.every((port) =>
          !leafKeys.has(port.parentOrganKey) && !leafKeys.has(port.childOrganKey)),
        `${label}: structural ports`).toBe(true);
        expect(projection.detachedLeafBodies, `${label}: detached bodies`).toEqual([]);
        const presentedLeaves = oakPresentedTissueRecordsV1(projection)
          .get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
        const localLeafRecords = [
          ...projection.attachedLeafCollarRecords,
          ...projection.attachedLeafBodies.flatMap((body) => body.records),
        ];
        expect(presentedLeaves.map((record) => record.key).sort(),
          `${label}: composed leaf presentation`)
          .toEqual(localLeafRecords.map((record) => record.key).sort());
        aggregateLeafCounts.push(projection.attachedLeafBodies
          .reduce((sum, body) => sum + body.voxelCount, 0));
        materialCounts.push(projection.tissueVoxelCount);
        expectRetainedParentAnchors(projection, label);

        const bodies = new Map(projection.attachedLeafBodies
          .map((body) => [body.leafKey, body] as const));
        for (const body of bodies.values()) {
          expect(body.records.map((record) => record.key).sort(),
            `${label}: ${body.leafKey} record/source identity`).toEqual(body.sourceKeys);
          expect(body.sourceKeys.every((key) => key.startsWith(`oak:${body.leafKey}:`)),
            `${label}: ${body.leafKey} owns its local sources`).toBe(true);
        }

        if (previous !== null) {
          const previousBodies = new Map(previous.attachedLeafBodies
            .map((body) => [body.leafKey, body] as const));
          expect([...previousBodies.keys()].every((leafKey) => bodies.has(leafKey)),
            `${label}: leaf bodies remain present`).toBe(true);
          let maximumBodyIncrement = 0;
          for (const body of bodies.values()) {
            const before = previousBodies.get(body.leafKey);
            if (before !== undefined) {
              const keys = new Set(body.sourceKeys);
              expect(before.sourceKeys.every((key) => keys.has(key)),
                `${label}: ${body.leafKey} source prefix`).toBe(true);
            }
            maximumBodyIncrement = Math.max(
              maximumBodyIncrement,
              body.sourceKeys.length - (before?.sourceKeys.length ?? 0),
            );
          }
          maximumLeafBodyIncrements.push(maximumBodyIncrement);
          removedMembershipCounts.push([...previous.materialCells.keys()]
            .filter((id) => !projection.materialCells.has(id)).length);
          addedMembershipCounts.push([...projection.materialCells.keys()]
            .filter((id) => !previous!.materialCells.has(id)).length);
          const delta = retainedDelta(previous, projection);
          assignmentMigrationCounts.push(delta.assignmentMigrations);
          retainedOwnerChangeCounts.push(delta.ownerChanges);
          retainedSourceChangeCounts.push(delta.sourceChanges);
        }
        previous = projection;
      }
      const increments = (values: readonly number[]) => values.slice(1)
        .map((value, index) => value - values[index]!);
      const aggregateLeafIncrements = increments(aggregateLeafCounts);
      const materialIncrements = increments(materialCounts);
      expect(aggregateLeafCounts.at(-1)!).toBeGreaterThan(aggregateLeafCounts[0]!);
      expect(materialCounts.at(-1)!).toBeGreaterThan(materialCounts[0]!);
      expect(Math.min(...aggregateLeafIncrements)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...maximumLeafBodyIncrements)).toBeLessThanOrEqual(4);
      expect(Math.min(...materialIncrements)).toBeGreaterThanOrEqual(-2);

      // Each budget is one cell above the measured maximum for this 180-tick
      // growth window. This permits a local advancing shell, not global rerouting.
      const limits = ROUTING_DELTA_LIMITS[day];
      expect(Math.max(...removedMembershipCounts)).toBeLessThanOrEqual(limits.removed);
      expect(Math.max(...addedMembershipCounts)).toBeLessThanOrEqual(limits.added);
      expect(Math.max(...assignmentMigrationCounts)).toBeLessThanOrEqual(limits.migrations);
      expect(Math.max(...retainedOwnerChangeCounts)).toBeLessThanOrEqual(limits.ownerChanges);
      expect(Math.max(...retainedSourceChangeCounts)).toBeLessThanOrEqual(limits.sourceChanges);

      const held = previous!;
      simulation.setPaused(true);
      simulation.advanceHostTicks(60);
      const control = buildOakTissueVoxelProjectionV1(simulation.projection(), false);
      expect(retainedDelta(held, control)).toEqual({
        assignmentMigrations: 0,
        ownerChanges: 0,
        sourceChanges: 0,
        colorChanges: 0,
        maximumOwnerColorChanges: 0,
        maximumOwnerColorKey: null,
      });
      expect([...control.materialCells.keys()]).toEqual([...held.materialCells.keys()]);
      expect(control.attachedLeafBodies.map((body) => [body.leafKey, body.sourceKeys]),
        `day ${String(day)} paused organ-local leaves`)
        .toEqual(held.attachedLeafBodies.map((body) => [body.leafKey, body.sourceKeys]));
    });
  }
  it('keeps distinct parent ports and retained anchors across exact milestones', () => {
    const simulation = createOakSimulationV1();
    let currentDay = 0;
    for (const day of [0, 3, 6, 13, 42, 82, 100, 210, 220, 239, 240]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day - currentDay));
      currentDay = day;
      for (const includeRoots of [false, true]) {
        const label = `day ${String(day)} ${includeRoots ? 'cutaway' : 'surface'}`;
        const state = simulation.projection();
        const projection = buildOakTissueVoxelProjectionV1(state, includeRoots);
        const hidden = new Set(state.organs
          .filter((organ) => organ.developmentPhase === 'preformed')
          .map((organ) => organ.key));
        expect([...projection.sourceAssignments.values()].every((assignment) =>
          !hidden.has(assignment.ownerOrganKey)), `${label}: hidden source`).toBe(true);
        expect(projection.ports.every((port) =>
          !hidden.has(port.parentOrganKey) && !hidden.has(port.childOrganKey)),
        `${label}: hidden port`).toBe(true);
        expectRetainedParentAnchors(projection, label);
      }
    }
  });
});
