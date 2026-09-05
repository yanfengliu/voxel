import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

import { timeoutForMeasuredWorkMs } from '../../tests/testing/test-timeout.js';
import {
  buildOakRenderFrameV1,
  type OakRenderFrameV1,
} from './oak-render-adapter.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { oakSoilSurfaceAtFineCellV1 } from './oak-soil-surface.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedTissueRecordsV1,
} from './oak-tissue-union-lattice.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';
import { oakVoxelAabbGridKeysV1, oakVoxelRecordAabbV1 } from './oak-voxel-aabb.js';
import { oakVoxelRecordsOverlapV1 } from './oak-voxel-obb.js';

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const CONTACT_TOLERANCE_M = Number.EPSILON * 8_192;
const CELL_SUFFIX = /:(-?\d+):(-?\d+):(-?\d+)$/u;

function completeFallWindowTicks(leafCount: number): number {
  const development = OAK_PARAMETERS_V1.growth.development;
  const days = development.leafFallDurationDays
    + development.leafFallStaggerDaysPerSlot * Math.max(0, leafCount - 1) + 1;
  return oakHostTicksForBiologicalDaysV1(days);
}

function terrainFootprintClearancesM(
  record: OakRenderInstanceRecordV1,
): readonly number[] {
  const bounds = oakVoxelRecordAabbV1(record);
  const firstX = Math.floor((bounds.min[0] + CONTACT_TOLERANCE_M) / PITCH);
  const lastX = Math.ceil((bounds.max[0] - CONTACT_TOLERANCE_M) / PITCH) - 1;
  const firstZ = Math.floor((bounds.min[2] + CONTACT_TOLERANCE_M) / PITCH);
  const lastZ = Math.ceil((bounds.max[2] - CONTACT_TOLERANCE_M) / PITCH) - 1;
  const clearances: number[] = [];
  for (let x = firstX; x <= lastX; x += 1) {
    for (let z = firstZ; z <= lastZ; z += 1) {
      const surface = oakSoilSurfaceAtFineCellV1(x, z);
      if (surface === null) {
        throw new Error(
          `Oak voxel '${record.key}' footprint leaves retained terrain at ${String(x)}:${String(z)}.`,
        );
      }
      clearances.push(bounds.min[1] - surface.topM);
    }
  }
  return clearances;
}

function arraysEqual(left: ArrayLike<number>, right: ArrayLike<number>): boolean {
  return left.length === right.length
    && Array.from(left).every((value, index) => Object.is(value, right[index]));
}

function frameContentEqual(left: OakRenderFrameV1, right: OakRenderFrameV1): boolean {
  if (!isDeepStrictEqual(left.metrics, right.metrics)
    || !arraysEqual(left.snapshot.chunks[0]!.voxels, right.snapshot.chunks[0]!.voxels)
    || !isDeepStrictEqual(left.projectionCache.tissue, right.projectionCache.tissue)
    || !isDeepStrictEqual(left.projectionCache.soil.contactVoxels,
      right.projectionCache.soil.contactVoxels)
    || !isDeepStrictEqual(left.projectionCache.litter, right.projectionCache.litter)) return false;
  for (const before of left.snapshot.batches) {
    const after = right.snapshot.batches.find(({ key }) => key === before.key);
    if (after === undefined || before.geometryKey !== after.geometryKey
      || before.materialKey !== after.materialKey
      || before.instanceKeys.length !== after.instanceKeys.length) return false;
    const slots = new Map(after.instanceKeys.map((key, index) => [key, index] as const));
    for (const [index, key] of before.instanceKeys.entries()) {
      const afterIndex = slots.get(key);
      if (afterIndex === undefined
        || !arraysEqual(
          before.matrices.subarray(index * 16, index * 16 + 16),
          after.matrices.subarray(afterIndex * 16, afterIndex * 16 + 16),
        )
        || before.colors === undefined || after.colors === undefined
        || !arraysEqual(
          before.colors.subarray(index * 4, index * 4 + 4),
          after.colors.subarray(afterIndex * 4, afterIndex * 4 + 4),
        )) return false;
    }
  }
  return true;
}

function expectConnectedRigidBody(
  records: readonly OakRenderInstanceRecordV1[],
  label: string,
): void {
  expect(records.length, label).toBeGreaterThan(0);
  const cells = new Set(records.map((record) => suffix(record.key)));
  expect(cells.size, `${label} unique cells`).toBe(records.length);
  const reached = new Set<string>();
  const queue = [cells.values().next().value!];
  reached.add(queue[0]!);
  for (const key of queue) {
    const [x, y, z] = key.split(':').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of [
      [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
    ] as const) {
      const neighbor = `${String(x + dx)}:${String(y + dy)}:${String(z + dz)}`;
      if (cells.has(neighbor) && !reached.has(neighbor)) {
        reached.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  expect(reached.size, `${label} face-connected cells`).toBe(cells.size);
}

function expectSameRigidBody(
  before: readonly OakRenderInstanceRecordV1[],
  after: readonly OakRenderInstanceRecordV1[],
  label: string,
): void {
  const prior = new Map(before.map((record) => [record.key, record] as const));
  expect(after.map(({ key }) => key), `${label} source identities`)
    .toEqual(before.map(({ key }) => key));
  const beforeOrigin = before[0]!.matrix;
  const afterOrigin = after[0]!.matrix;
  const rotateDelta = (vector: readonly [number, number, number]) => {
    const result: [number, number, number] = [0, 0, 0];
    for (const column of [0, 4, 8] as const) {
      const axisLengthSquared = beforeOrigin[column]! * beforeOrigin[column]!
        + beforeOrigin[column + 1]! * beforeOrigin[column + 1]!
        + beforeOrigin[column + 2]! * beforeOrigin[column + 2]!;
      const projection = (
        vector[0] * beforeOrigin[column]!
        + vector[1] * beforeOrigin[column + 1]!
        + vector[2] * beforeOrigin[column + 2]!
      ) / axisLengthSquared;
      result[0] += afterOrigin[column]! * projection;
      result[1] += afterOrigin[column + 1]! * projection;
      result[2] += afterOrigin[column + 2]! * projection;
    }
    return result as [number, number, number];
  };
  for (const record of after) {
    const previous = prior.get(record.key)!;
    expect(record.color, `${label} ${record.key} material`).toEqual(previous.color);
    const relative = rotateDelta([
      previous.matrix[12]! - beforeOrigin[12]!,
      previous.matrix[13]! - beforeOrigin[13]!,
      previous.matrix[14]! - beforeOrigin[14]!,
    ]);
    for (const [axis, expected] of relative.entries()) {
      expect(record.matrix[12 + axis], `${label} ${record.key} rigid translation`)
        .toBeCloseTo(afterOrigin[12 + axis]! + expected, 12);
    }
    for (const column of [0, 4, 8] as const) {
      const expected = rotateDelta([
        previous.matrix[column]!,
        previous.matrix[column + 1]!,
        previous.matrix[column + 2]!,
      ]);
      for (const [axis, value] of expected.entries()) {
        expect(record.matrix[column + axis], `${label} ${record.key} rigid orientation`)
          .toBeCloseTo(value, 12);
      }
    }
  }
}

function suffix(key: string): string {
  const match = CELL_SUFFIX.exec(key);
  if (match === null) throw new Error(`Cannot read oak leaf source suffix '${key}'.`);
  return `${match[1]}:${match[2]}:${match[3]}`;
}

function expectExactHandoff(
  falling: readonly OakRenderInstanceRecordV1[],
  litter: readonly OakRenderInstanceRecordV1[],
  leafKey: string,
): void {
  const after = new Map(litter
    .filter(({ key }) => key.startsWith(`oak-litter:${leafKey}:`))
    .map((record) => [suffix(record.key), record] as const));
  expect(after.size, `${leafKey} litter count`).toBe(falling.length);
  for (const record of falling) {
    const transferred = after.get(suffix(record.key));
    expect(transferred, `${leafKey} ${suffix(record.key)}`).toBeDefined();
    expect(arraysEqual(record.matrix, transferred!.matrix), transferred!.key).toBe(true);
    expect(transferred!.color, transferred!.key).toEqual(record.color);
  }
}

interface PlacedVoxelV1 {
  readonly group: string;
  readonly record: OakRenderInstanceRecordV1;
}

function exactDetachedConflicts(
  projection: ReturnType<typeof buildOakTissueVoxelProjectionV1>,
  litter: readonly OakRenderInstanceRecordV1[] = [],
): readonly string[] {
  const detachedOwnerBySource = new Map(projection.detachedLeafBodies.flatMap((body) =>
    body.sourceKeys.map((key) => [key, body.leafKey] as const)));
  const placed: PlacedVoxelV1[] = [
    ...[...oakPresentedTissueRecordsV1(projection).values()].flat().map((record) => ({
      group: detachedOwnerBySource.get(record.key) ?? 'attached',
      record,
    })),
    ...litter.map((record) => ({ group: 'litter', record })),
  ];
  const buckets = new Map<string, PlacedVoxelV1[]>();
  for (const candidate of placed) {
    for (const key of oakVoxelAabbGridKeysV1(oakVoxelRecordAabbV1(candidate.record), PITCH)) {
      const values = buckets.get(key) ?? [];
      values.push(candidate);
      buckets.set(key, values);
    }
  }
  const conflicts = new Set<string>();
  for (const body of projection.detachedLeafBodies) {
    for (const record of body.records) {
      const candidates = new Map<string, PlacedVoxelV1>();
      for (const bucketKey of oakVoxelAabbGridKeysV1(oakVoxelRecordAabbV1(record), PITCH)) {
        for (const candidate of buckets.get(bucketKey) ?? []) {
          candidates.set(`${candidate.group}/${candidate.record.key}`, candidate);
        }
      }
      for (const candidate of candidates.values()) {
        if (candidate.group === body.leafKey) continue;
        if (!oakVoxelRecordsOverlapV1(record, candidate.record)) continue;
        conflicts.add(`${body.leafKey}/${record.key} intersects `
          + `${candidate.group}/${candidate.record.key}`);
      }
    }
  }
  return [...conflicts].sort();
}

describe('oak leaf fall continuity', () => {
  it('keeps every rotated voxel AABB clear through the complete fall and supported endpoint', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const leafCount = simulation.snapshot().organs.filter((organ) =>
      organ.kind === 'leaf').length;
    const supportedLeaves = new Set<string>();
    let inspectedRecords = 0;

    for (let tick = 1; tick <= completeFallWindowTicks(leafCount); tick += 1) {
      simulation.advanceHostTicks(1);
      const snapshot = simulation.snapshot();
      const projection = buildOakTissueVoxelProjectionV1(simulation.projection(), false);
      expect(exactDetachedConflicts(projection), `fall tick ${String(tick)} placed tissue`)
        .toEqual([]);
      for (const body of projection.detachedLeafBodies) {
        const leaf = snapshot.organs.find((organ) => organ.key === body.leafKey);
        if (leaf?.kind !== 'leaf') throw new Error(`Missing falling leaf '${body.leafKey}'.`);
        let contacts = 0;
        for (const record of body.records) {
          inspectedRecords += 1;
          const clearances = terrainFootprintClearancesM(record);
          expect(clearances.length, `${record.key} retained terrain footprint`).toBeGreaterThan(0);
          for (const clearance of clearances) {
            expect(clearance, `fall tick ${String(tick)} ${record.key}`)
              .toBeGreaterThanOrEqual(-CONTACT_TOLERANCE_M);
            contacts += Number(Math.abs(clearance) <= CONTACT_TOLERANCE_M);
          }
        }
        if (leaf.fallProgressFraction === 1) {
          expect(contacts, `${body.leafKey} supported AABB contacts`).toBeGreaterThan(0);
          supportedLeaves.add(body.leafKey);
        }
      }
      if (snapshot.organs.filter((organ) =>
        organ.kind === 'leaf' && organ.stage === 'abscised').length === 10) break;
    }

    expect(inspectedRecords).toBeGreaterThan(0);
    expect(supportedLeaves.size).toBe(10);
    // 30,726 ms measured alone on 2026-09-02. A bare 120,000 ms literal sat
    // below the budget this work derives, which is the shape `test-timeout.ts`
    // names: the allowance scan only rejects literals under 45,000 ms, so an
    // under-sized budget above that floor passes the scan and expires later.
  }, timeoutForMeasuredWorkMs(30_726));

  it('publishes a supported frame before every exact litter handoff with cold-cache parity', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(239.9));
    const leafCount = simulation.snapshot().organs.filter((organ) =>
      organ.kind === 'leaf').length;
    let priorSnapshot = simulation.snapshot();
    let priorFrame = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 40_000,
    });
    const settledLeaves = new Set<string>();
    const transferredLeaves = new Set<string>();
    const detachedTransitions = new Set<string>();
    const visibleWoundTransitions = new Set<string>();
    const priorBodies = new Map<string, readonly OakRenderInstanceRecordV1[]>();
    let sawFallingBody = false;

    for (let tick = 1;
      tick <= completeFallWindowTicks(leafCount) && transferredLeaves.size < leafCount;
      tick += 1) {
      simulation.advanceHostTicks(1);
      const snapshot = simulation.snapshot();
      const state = simulation.projection();
      const renderRevision = 40_000 + tick;
      const cached = buildOakRenderFrameV1(state, {
        renderRevision,
        previousFrame: priorFrame,
      });
      const cold = buildOakRenderFrameV1(state, { renderRevision });
      expect(frameContentEqual(cached, cold), `fall tick ${String(tick)} cache parity`)
        .toBe(true);
      expect(exactDetachedConflicts(
        cached.projectionCache.tissue,
        cached.projectionCache.litter.records,
      ), `fall tick ${String(tick)} complete placed scene`).toEqual([]);

      for (const leaf of snapshot.organs) {
        if (leaf.kind !== 'leaf' || leaf.stage !== 'detached') continue;
        const beforeLeaf = priorSnapshot.organs.find((organ) => organ.key === leaf.key);
        if (beforeLeaf?.kind !== 'leaf' || beforeLeaf.stage === 'detached') continue;
        const body = cached.projectionCache.tissue.detachedLeafBodies
          .find(({ leafKey }) => leafKey === leaf.key);
        if (body === undefined) throw new Error(`Missing first detached body '${leaf.key}'.`);
        const priorTissue = priorFrame.projectionCache.tissue;
        const priorBody = priorTissue.attachedLeafBodies
          .find(({ leafKey }) => leafKey === leaf.key);
        if (priorBody === undefined) throw new Error(`Missing last attached body '${leaf.key}'.`);
        const scar = leaf.abscissionScar;
        if (scar === undefined) throw new Error(`Missing first detachment scar '${leaf.key}'.`);
        expect(leaf.attachment, `${leaf.key} retained physical attachment`)
          .toEqual(beforeLeaf.attachment);
        expect(scar.parentKey, `${leaf.key} scar parent from attachment`)
          .toBe(leaf.attachment?.parentOrganKey);
        const priorPort = priorTissue.leafPorts.find((port) =>
          port.leafOrganKey === leaf.key);
        if (priorPort === undefined) throw new Error(`Missing last attached port '${leaf.key}'.`);
        expect(body.sourceKeys, `${leaf.key} detached body source identity`)
          .toEqual(priorBody.sourceKeys);
        const petioleKeys = body.sourceKeys.filter((key) =>
          key.includes(':petiole-voxel:'));
        expect(petioleKeys.length, `${leaf.key} falling petiole`).toBeGreaterThan(0);
        expect(petioleKeys, `${leaf.key} base-abscission petiole identity`)
          .toEqual(priorBody.sourceKeys.filter((key) =>
            key.includes(':petiole-voxel:')));
        const priorBodyRecords = new Map(priorBody.records
          .map((record) => [record.key, record] as const));
        expect(priorTissue.attachedLeafCollarRecords,
          `${leaf.key} no separately retained collar`).toEqual([]);
        const currentTissue = cached.projectionCache.tissue;
        const canonicalByKey = new Map([...currentTissue.records.values()].flat()
          .map((record) => [record.key, record] as const));
        const woundCount = snapshot.organs.filter((organ) =>
          organ.kind === 'leaf' && organ.abscissionScar !== undefined).length;
        expect(currentTissue.abscissionScarRecords,
          `${leaf.key} one existing parent cell per wound`).toHaveLength(woundCount);
        for (const wound of currentTissue.abscissionScarRecords) {
          expect(canonicalByKey.get(wound.key), `${leaf.key} ${wound.key}`)
            .toEqual(wound);
        }
        expect(currentTissue.abscissionScarRecords.some((wound) =>
          wound.key === priorPort.parentRecordKey), `${leaf.key} wound reuses its parent record`)
          .toBe(true);
        visibleWoundTransitions.add(leaf.key);
        const {
          abscissionScar: _scar,
          fallProgressFraction: _fallProgress,
          ...leafWithoutFall
        } = leaf;
        void _scar;
        void _fallProgress;
        const materialCounterfactual: OakLeafOrganSnapshotV1 = {
          ...leafWithoutFall,
          parentKey: scar.parentKey,
          positionM: scar.positionM,
          direction: scar.direction,
          rollRadians: scar.rollRadians,
          stage: 'senescing',
          developmentPhase: 'senescing',
        };
        const counterfactualRecords = new Map(
          buildOakTissueVoxelSourceProjectionV1(
            { organs: [materialCounterfactual] },
            false,
          ).records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!
            .map((record) => [record.key, record] as const),
        );
        let changedPriorColors = 0;
        for (const record of body.records) {
          const counterfactual = counterfactualRecords.get(record.key);
          if (counterfactual === undefined) {
            throw new Error(`Detached source '${record.key}' has no same-tick material counterfactual.`);
          }
          expect(record.color, `${leaf.key} detachment-only material ${record.key}`)
            .toEqual(counterfactual.color);
          const attachedRecord = priorBodyRecords.get(record.key);
          if (attachedRecord === undefined) {
            throw new Error(`Detached source '${record.key}' was absent before detachment.`);
          }
          expect(Math.hypot(
            record.matrix[12]! - attachedRecord.matrix[12]!,
            record.matrix[13]! - attachedRecord.matrix[13]!,
            record.matrix[14]! - attachedRecord.matrix[14]!,
          ) / PITCH, `${leaf.key} attached-to-falling translation ${record.key}`)
            .toBeLessThan(0.3);
          expect(record.matrix.slice(0, 12), `${leaf.key} rigid release axes ${record.key}`)
            .toEqual(attachedRecord.matrix.slice(0, 12));
          changedPriorColors += Number(
            record.color.r !== attachedRecord.color.r
            || record.color.g !== attachedRecord.color.g
            || record.color.b !== attachedRecord.color.b,
          );
          expect(record.color.a, `${leaf.key} detachment alpha ${record.key}`)
            .toBe(attachedRecord.color.a);
        }
        expect(changedPriorColors, `${leaf.key} one-tick senescence cohort budget`)
          .toBeLessThanOrEqual(Math.ceil(body.records.length * 0.25));
        detachedTransitions.add(leaf.key);
      }

      for (const body of cached.projectionCache.tissue.detachedLeafBodies) {
        sawFallingBody = true;
        expectConnectedRigidBody(body.records, `fall tick ${String(tick)} ${body.leafKey}`);
        const previousBody = priorBodies.get(body.leafKey);
        if (previousBody !== undefined) {
          expectSameRigidBody(
            previousBody,
            body.records,
            `fall tick ${String(tick)} ${body.leafKey}`,
          );
        }
        priorBodies.set(body.leafKey, body.records);
        const leaf = snapshot.organs.find((organ) => organ.key === body.leafKey);
        if (leaf?.kind !== 'leaf') throw new Error(`Missing falling leaf '${body.leafKey}'.`);
        let contacts = 0;
        for (const record of body.records) {
          const clearances = terrainFootprintClearancesM(record);
          expect(clearances.length, `${record.key} retained terrain footprint`).toBeGreaterThan(0);
          for (const clearance of clearances) {
            expect(clearance, record.key).toBeGreaterThanOrEqual(-CONTACT_TOLERANCE_M);
            contacts += Number(Math.abs(clearance) <= CONTACT_TOLERANCE_M);
          }
        }
        if (leaf.fallProgressFraction === 1) {
          settledLeaves.add(leaf.key);
          expect(contacts, `${leaf.key} supported contacts`).toBeGreaterThan(0);
        }
      }

      for (const before of priorSnapshot.organs) {
        if (before.kind !== 'leaf' || before.stage !== 'detached') continue;
        const after = snapshot.organs.find((organ) => organ.key === before.key);
        if (after?.stage !== 'abscised') continue;
        expect(before.fallProgressFraction, `${before.key} final falling fraction`).toBe(1);
        const body = priorFrame.projectionCache.tissue.detachedLeafBodies
          .find(({ leafKey }) => leafKey === before.key);
        if (body === undefined) throw new Error(`Missing supported body '${before.key}'.`);
        expectExactHandoff(body.records, cached.projectionCache.litter.records, before.key);
        transferredLeaves.add(before.key);
      }
      priorSnapshot = snapshot;
      priorFrame = cached;
    }

    expect(sawFallingBody).toBe(true);
    expect(settledLeaves.size).toBe(leafCount);
    expect(transferredLeaves.size).toBe(leafCount);
    expect(detachedTransitions.size).toBe(leafCount);
    expect(visibleWoundTransitions.size).toBe(leafCount);
    // 117,351 ms measured alone on 2026-09-02. The bare 180,000 ms literal it
    // replaces was only 1.5x the work it had to cover, so the same run that
    // passes alone expired at 186,937 ms inside `npm run verify` — the budget
    // sized against an idle machine that `test-timeout.ts` exists to forbid.
  }, timeoutForMeasuredWorkMs(117_351));

  it('integrates breeze into the authoritative fall endpoint', () => {
    const still = createOakSimulationV1();
    const breeze = createOakSimulationV1();
    still.advanceHostTicks(oakHostTicksForBiologicalDaysV1(239));
    breeze.advanceHostTicks(oakHostTicksForBiologicalDaysV1(239));
    breeze.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    still.advanceHostTicks(oakHostTicksForBiologicalDaysV1(11));
    breeze.advanceHostTicks(oakHostTicksForBiologicalDaysV1(11));
    const stillLeaves = new Map(still.snapshot().organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf')
      .map((leaf) => [leaf.key, leaf] as const));
    const moved = breeze.snapshot().organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf')
      .some((leaf) => {
        const control = stillLeaves.get(leaf.key)!;
        return Math.abs(leaf.positionM.x - control.positionM.x) > 1e-9
          || Math.abs(leaf.positionM.z - control.positionM.z) > 1e-9;
      });
    expect(moved).toBe(true);
    expect(still.snapshot().organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage === 'abscised')).toHaveLength(10);
    expect(breeze.snapshot().organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage === 'abscised')).toHaveLength(10);
  });
});
