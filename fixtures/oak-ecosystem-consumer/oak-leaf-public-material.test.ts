import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import { createOakSimulationV1, oakHostTicksForBiologicalDaysV1 } from './oak-simulation.js';
import {
  buildOakTissueVoxelProjectionV1,
  oakPresentedTissueRecordsV1,
} from './oak-tissue-union-lattice.js';
import {
  buildOakTissueVoxelSourceProjectionV1,
  OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import {
  oakVoxelAabbGridKeysV1,
  oakVoxelRecordAabbV1,
  type OakVoxelAabbV1,
} from './oak-voxel-aabb.js';
import { oakVoxelRecordsOverlapV1 } from './oak-voxel-obb.js';
import type {
  OakLeafOrganSnapshotV1,
  OakRenderProjectionStateV1,
} from './oak-types.js';

interface AcceptedLeafCubeV1 {
  readonly key: string;
  readonly ownerKey: string;
  readonly matrix: Float32Array;
  readonly bounds: OakVoxelAabbV1;
}

function acceptedLeafCubes(
  frame: ReturnType<typeof buildOakRenderFrameV1>,
): readonly AcceptedLeafCubeV1[] {
  const batch = frame.snapshot.batches.find(({ key }) => key === OAK_LEAF_VOXEL_BATCH_KEY_V1);
  if (batch === undefined) throw new Error('Accepted oak frame has no leaf tissue batch.');
  return batch.instanceKeys.map((key, slot) => {
    const ownerKey = /^oak:(organ:\d+:\d+):/u.exec(key)?.[1];
    if (ownerKey === undefined) throw new Error(`Cannot recover leaf owner from '${key}'.`);
    const matrix = batch.matrices.slice(slot * 16, slot * 16 + 16);
    return { key, ownerKey, matrix, bounds: oakVoxelRecordAabbV1({ matrix }) };
  });
}

function sameOwnerOverlapIssues(
  cubes: readonly AcceptedLeafCubeV1[],
): readonly string[] {
  const issues: string[] = [];
  const byOwner = new Map<string, AcceptedLeafCubeV1[]>();
  for (const cube of cubes) {
    const values = byOwner.get(cube.ownerKey) ?? [];
    values.push(cube);
    byOwner.set(cube.ownerKey, values);
  }
  for (const [owner, owned] of byOwner) {
    const buckets = new Map<string, AcceptedLeafCubeV1[]>();
    for (const cube of owned) {
      const bucketKeys = oakVoxelAabbGridKeysV1(
        cube.bounds,
        OAK_TISSUE_VOXEL_PITCH_M_V1,
      );
      const candidates = new Set<AcceptedLeafCubeV1>();
      for (const key of bucketKeys) {
        for (const candidate of buckets.get(key) ?? []) candidates.add(candidate);
      }
      for (const candidate of candidates) {
        if (oakVoxelRecordsOverlapV1(cube, candidate)) {
          issues.push(`${owner}: ${candidate.key} overlaps ${cube.key}`);
        }
      }
      for (const key of bucketKeys) {
        const values = buckets.get(key) ?? [];
        values.push(cube);
        buckets.set(key, values);
      }
    }
  }
  return issues;
}

function leafSourceRecords(
  leaf: OakLeafOrganSnapshotV1,
): readonly OakRenderInstanceRecordV1[] {
  return buildOakTissueVoxelSourceProjectionV1(
    { organs: [leaf] },
    false,
    { includeDetachedLeaves: leaf.stage === 'detached' },
  ).records.get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
}

function withoutAttachment(leaf: OakLeafOrganSnapshotV1): OakLeafOrganSnapshotV1 {
  const clone = { ...leaf };
  delete clone.attachment;
  return clone;
}

function expectExactPresentationDisplacement(
  leaf: OakLeafOrganSnapshotV1,
): readonly string[] {
  const authorityBefore = { ...leaf.positionM };
  const radial = leaf.attachment!.restRadialUnitWorld;
  const radialLength = Math.hypot(radial.x, radial.y, radial.z);
  const unitRadial = {
    x: radial.x / radialLength,
    y: radial.y / radialLength,
    z: radial.z / radialLength,
  };
  const presented = leafSourceRecords(leaf);
  const unshifted = leafSourceRecords(withoutAttachment(leaf));
  expect(presented.length, `${leaf.key} source displacement population`).toBeGreaterThan(0);
  expect(presented.map(({ key }) => key)).toEqual(unshifted.map(({ key }) => key));
  for (let index = 0; index < presented.length; index += 1) {
    const actual = presented[index]!;
    const control = unshifted[index]!;
    expect(actual.matrix.slice(0, 12), actual.key).toEqual(control.matrix.slice(0, 12));
    expect(actual.matrix[12]! - control.matrix[12]!, `${actual.key} x offset`)
      .toBeCloseTo(unitRadial.x * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1, 12);
    expect(actual.matrix[13]! - control.matrix[13]!, `${actual.key} y offset`)
      .toBeCloseTo(unitRadial.y * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1, 12);
    expect(actual.matrix[14]! - control.matrix[14]!, `${actual.key} z offset`)
      .toBeCloseTo(unitRadial.z * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1, 12);
  }
  expect(leaf.positionM).toEqual(authorityBefore);
  return presented.map(({ key }) => key);
}

function localCellSuffix(key: string): string {
  const match = /:(-?\d+):(-?\d+):(-?\d+)$/u.exec(key);
  if (match === null) throw new Error(`Oak leaf record '${key}' has no local-cell suffix.`);
  return `${match[1]}:${match[2]}:${match[3]}`;
}

describe('oak public leaf material', () => {
  it('keeps the source offset through fall and accounts for vertical litter support separately', () => {
    expect(OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1).toBe(0.002);
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(239.9));
    const lastAttachedState = simulation.projection();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(0.6));
    const fallingState = simulation.projection();
    const falling = fallingState.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.stage === 'detached');
    if (falling === undefined) throw new Error('Expected one falling oak leaf at day 240.5.');
    const attached = lastAttachedState.organs.find(
      (organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf'
        && organ.key === falling.key,
    );
    if (attached === undefined) throw new Error(`Missing attached leaf '${falling.key}'.`);
    const attachedKeys = expectExactPresentationDisplacement(attached);
    const fallingKeys = expectExactPresentationDisplacement(falling);
    expect(fallingKeys).toEqual(attachedKeys);

    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1.1));
    const litterState = simulation.projection();
    const litterLeaf = litterState.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.key === falling.key && organ.stage === 'abscised');
    if (litterLeaf === undefined) throw new Error(`Leaf '${falling.key}' did not reach litter.`);
    const litterProjection = buildOakRenderFrameV1(litterState).projectionCache.litter;
    const accepted = litterProjection.records
      .filter(({ key }) => key.startsWith(`oak-litter:${litterLeaf.key}:`));
    expect(accepted.map(({ key }) => localCellSuffix(key)).sort())
      .toEqual(attachedKeys.map(localCellSuffix).sort());

    const noOffsetOrgans: OakRenderProjectionStateV1['organs'] = litterState.organs
      .map((organ) => organ.key === litterLeaf.key ? withoutAttachment(litterLeaf) : organ);
    const noOffsetProjection = buildOakRenderFrameV1({
      ...litterState,
      organs: noOffsetOrgans,
    }).projectionCache.litter;
    const noOffset = noOffsetProjection.records.filter(({ key }) =>
      key.startsWith(`oak-litter:${litterLeaf.key}:`));
    // Bound: this first leaf's day-241.6 pose, before either terrain correction.
    const sourceLeaf: OakLeafOrganSnapshotV1 = {
      ...litterLeaf, stage: 'detached', developmentPhase: 'falling', fallProgressFraction: 0,
    };
    expectExactPresentationDisplacement(sourceLeaf);
    const rawByCell = new Map(leafSourceRecords(sourceLeaf)
      .map((record) => [localCellSuffix(record.key), record] as const));
    const supportM = litterProjection.leafMetrics.find(({ leafKey }) =>
      leafKey === litterLeaf.key)!.verticalTranslationM;
    const controlSupportM = noOffsetProjection.leafMetrics.find(({ leafKey }) =>
      leafKey === litterLeaf.key)!.verticalTranslationM;
    const noOffsetByKey = new Map(noOffset.map((record) => [record.key, record] as const));
    const radial = litterLeaf.attachment!.restRadialUnitWorld;
    const radialLength = Math.hypot(radial.x, radial.y, radial.z);
    for (const record of accepted) {
      const control = noOffsetByKey.get(record.key)!;
      const raw = rawByCell.get(localCellSuffix(record.key))!;
      expect(record.matrix.slice(0, 12), `${record.key} litter axes`)
        .toEqual(control.matrix.slice(0, 12));
      expect(record.matrix[12]! - control.matrix[12]!, `${record.key} litter x offset`)
        .toBeCloseTo(radial.x / radialLength
          * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1, 10);
      expect(record.matrix[14]! - control.matrix[14]!, `${record.key} litter z offset`)
        .toBeCloseTo(radial.z / radialLength
          * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1, 10);
      expect(record.matrix[13]! - raw.matrix[13]!, `${record.key} vertical support`)
        .toBeCloseTo(supportM, 12);
      expect(record.matrix[13]! - control.matrix[13]!, `${record.key} litter y offset`)
        .toBeCloseTo(radial.y / radialLength * OAK_LEAF_NODE_PRESENTATION_CLEARANCE_M_V1
          + supportM - controlSupportM, 12);
    }
  }, 60_000);

  it('presents every organ-local source matrix once without internal Float32 intrusion', () => {
    const simulation = createOakSimulationV1();
    let priorDay = 0;
    for (const day of [54, 100, 240.5, 244]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day - priorDay));
      priorDay = day;
      const state = simulation.projection();
      const projection = buildOakTissueVoxelProjectionV1(state, false);
      const expected = oakPresentedTissueRecordsV1(projection)
        .get(OAK_LEAF_VOXEL_BATCH_KEY_V1)!;
      const accepted = acceptedLeafCubes(buildOakRenderFrameV1(state));
      expect(accepted.map(({ key }) => key), `day ${String(day)} identities`)
        .toEqual(expected.map(({ key }) => key));
      expect(accepted.map(({ matrix }) => [...matrix]), `day ${String(day)} matrices`)
        .toEqual(expected.map(({ matrix }) => [...Float32Array.from(matrix)]));
      expect(sameOwnerOverlapIssues(accepted), `day ${String(day)} solidity`).toEqual([]);
    }
  }, 60_000);

  it('keeps the petiole in each independent leaf body and detects a coincident-cube mutant', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240.5));
    const state = simulation.projection();
    const projection = buildOakTissueVoxelProjectionV1(state, false);
    const bodies = [...projection.attachedLeafBodies, ...projection.detachedLeafBodies];
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.sourceKeys.some((key) => key.includes(':petiole-voxel:')), body.leafKey)
        .toBe(true);
    }
    const accepted = acceptedLeafCubes(buildOakRenderFrameV1(state));
    const sameOwner = accepted.filter(({ ownerKey }) => ownerKey === accepted[0]!.ownerKey);
    expect(sameOwner.length).toBeGreaterThan(1);
    const coincident = { ...sameOwner[1]!, matrix: sameOwner[0]!.matrix };
    expect(oakVoxelRecordsOverlapV1(sameOwner[0]!, coincident)).toBe(true);
  });
});
