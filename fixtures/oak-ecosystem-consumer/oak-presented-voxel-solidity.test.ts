import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1, type OakRenderFrameV1 } from './oak-render-adapter.js';
import { createOakSimulationV1, oakHostTicksForBiologicalDaysV1 } from './oak-simulation.js';
import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';
import { OAK_MAX_TOPOLOGICAL_LEAF_PORT_SEPARATION_M_V1 } from './oak-leaf-port-projection.js';
import {
  oakTissueCellIdV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-union-routing.js';
import {
  oakVoxelAabbGridKeysV1,
  oakVoxelRecordAabbV1,
  type OakVoxelAabbV1,
} from './oak-voxel-aabb.js';
import {
  oakVoxelParallelepipedsSeparationV1,
  oakVoxelRecordsOverlapV1,
} from './oak-voxel-obb.js';

const PRESENTED_SOLID_BATCHES = new Set([
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
]);

interface PublicVoxelV1 {
  readonly key: string;
  readonly ownerKey: string;
  readonly batchKey: string;
  readonly matrix: Float32Array;
  readonly bounds: OakVoxelAabbV1;
}

function publicVoxels(frame: OakRenderFrameV1): readonly PublicVoxelV1[] {
  return frame.snapshot.batches.flatMap((batch) => {
    if (!PRESENTED_SOLID_BATCHES.has(batch.key)) return [];
    return batch.instanceKeys.map((key, slot) => {
      const matrix = batch.matrices.slice(slot * 16, slot * 16 + 16);
      const owner = /^(?:oak|oak-litter):(organ:\d+:\d+):/u.exec(key)?.[1];
      if (owner === undefined) throw new Error(`Cannot recover public oak owner from '${key}'.`);
      return {
        key,
        ownerKey: owner,
        batchKey: batch.key,
        matrix,
        bounds: oakVoxelRecordAabbV1({ matrix }),
      };
    });
  });
}

function positiveOverlapIssues(voxels: readonly PublicVoxelV1[]): readonly string[] {
  const buckets = new Map<string, PublicVoxelV1[]>();
  const issues: string[] = [];
  for (const voxel of voxels) {
    const bucketKeys = oakVoxelAabbGridKeysV1(
      voxel.bounds,
      OAK_TISSUE_VOXEL_PITCH_M_V1,
    );
    const candidates = new Set<PublicVoxelV1>();
    for (const key of bucketKeys) {
      for (const candidate of buckets.get(key) ?? []) candidates.add(candidate);
    }
    for (const candidate of candidates) {
      if (oakVoxelRecordsOverlapV1(voxel, candidate)) {
        issues.push(`${candidate.batchKey}/${candidate.key} overlaps ${voxel.batchKey}/${voxel.key}`);
      }
    }
    for (const key of bucketKeys) {
      const values = buckets.get(key) ?? [];
      values.push(voxel);
      buckets.set(key, values);
    }
  }
  return issues;
}

interface LeafPortWitnessShapeV1 {
  readonly kind: 'topological';
  readonly leafOrganKey: string;
  readonly parentOrganKey: string;
  readonly leafSourceKey: string;
  readonly parentRecordKey: string;
  readonly parentCell: OakTissueLatticeCellV1;
  readonly separationM: number;
}

const MEASURED_FIXED_MAXIMUM_LEAF_PORT_SEPARATION_M = 0.004_791_602_945_342_772;
const MEASURED_BREEZE_MAXIMUM_LEAF_PORT_SEPARATION_M = 0.004_157_240_095_154_632;

function maximumLeafPortSeparationM(frame: OakRenderFrameV1): number {
  const tissue = frame.projectionCache.tissue as typeof frame.projectionCache.tissue & {
    readonly leafPorts?: readonly LeafPortWitnessShapeV1[];
  };
  return Math.max(0, ...(tissue.leafPorts ?? []).map(({ separationM }) => separationM));
}

function leafAttachmentWitnessIssues(
  frame: OakRenderFrameV1,
  organs: readonly OakOrganSnapshotV1[],
): readonly string[] {
  const voxels = publicVoxels(frame);
  const byKey = new Map(voxels.map((voxel) => [voxel.key, voxel] as const));
  const tissue = frame.projectionCache.tissue as typeof frame.projectionCache.tissue & {
    readonly leafPorts?: readonly LeafPortWitnessShapeV1[];
  };
  const attachedLeaves = organs.filter((leaf) => leaf.kind === 'leaf'
    && leaf.parentKey !== null && leaf.stage !== 'abscised' && leaf.stage !== 'detached'
    && leaf.developmentPhase !== 'preformed');
  if (attachedLeaves.length === 0) return [];
  if (tissue.leafPorts === undefined) return ['tissue projection has no leaf attachment witnesses'];
  const issues: string[] = [];
  for (const leaf of attachedLeaves) {
    const witnesses = tissue.leafPorts.filter(({ leafOrganKey }) => leafOrganKey === leaf.key);
    if (witnesses.length !== 1) {
      issues.push(`${leaf.key} has ${String(witnesses.length)} attachment witnesses`);
      continue;
    }
    const witness = witnesses[0]!;
    if (witness.parentOrganKey !== leaf.parentKey) {
      issues.push(`${leaf.key} witnesses ${witness.parentOrganKey}, not ${leaf.parentKey}`);
      continue;
    }
    const leafVoxel = byKey.get(witness.leafSourceKey);
    const parentVoxel = byKey.get(witness.parentRecordKey);
    if (leafVoxel === undefined || parentVoxel === undefined) {
      issues.push(`${leaf.key} witness is absent from the accepted public frame`);
      continue;
    }
    const material = tissue.materialCells.get(oakTissueCellIdV1(witness.parentCell));
    if (witness.kind !== 'topological' || leafVoxel.ownerKey !== leaf.key
      || parentVoxel.ownerKey !== leaf.parentKey
      || material?.ownerOrganKey !== leaf.parentKey) {
      issues.push(`${leaf.key} witness is not declared-parent ${leaf.parentKey} material`);
      continue;
    }
    if (oakVoxelRecordsOverlapV1(leafVoxel, parentVoxel)) {
      issues.push(`${leaf.key} positively overlaps witnessed parent material`);
      continue;
    }
    const separationM = oakVoxelParallelepipedsSeparationV1(leafVoxel, parentVoxel);
    if (Math.abs(separationM - witness.separationM) > 1e-12) {
      issues.push(`${leaf.key} witness reports a stale separation`);
    } else if (separationM > OAK_MAX_TOPOLOGICAL_LEAF_PORT_SEPARATION_M_V1) {
      issues.push(`${leaf.key} witness has ${String(separationM)} m of air`);
    }
  }
  return issues;
}

describe('oak accepted-frame placed-things solidity', () => {
  it('keeps every public Float32 voxel disjoint and every living leaf at its parent', () => {
    const simulation = createOakSimulationV1();
    let day = 0;
    let maximumSeparationM = 0;
    for (const targetDay of [20, 54, 100, 239, 240, 244, 249]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(targetDay - day));
      day = targetDay;
      const frame = buildOakRenderFrameV1(simulation.projection());
      maximumSeparationM = Math.max(maximumSeparationM, maximumLeafPortSeparationM(frame));
      expect.soft(positiveOverlapIssues(publicVoxels(frame)), `day ${String(day)}`).toEqual([]);
      expect.soft(leafAttachmentWitnessIssues(frame, simulation.snapshot().organs),
        `day ${String(day)} leaf ports`).toEqual([]);
    }
    expect(maximumSeparationM)
      .toBeCloseTo(MEASURED_FIXED_MAXIMUM_LEAF_PORT_SEPARATION_M, 11);
    expect(OAK_MAX_TOPOLOGICAL_LEAF_PORT_SEPARATION_M_V1 - maximumSeparationM)
      .toBeCloseTo(7.055e-9, 12);
  }, 60_000);

  it('retains the same public contract through a complete breeze cycle', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    simulation.setPaused(true);
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    let maximumSeparationM = 0;
    for (let phaseTick = 1; phaseTick <= 120; phaseTick += 1) {
      simulation.advanceHostTicks(1);
      const frame = buildOakRenderFrameV1(simulation.projection());
      maximumSeparationM = Math.max(maximumSeparationM, maximumLeafPortSeparationM(frame));
      expect.soft(positiveOverlapIssues(publicVoxels(frame)), `breeze phase ${String(phaseTick)}`)
        .toEqual([]);
      expect.soft(leafAttachmentWitnessIssues(frame, simulation.snapshot().organs),
        `breeze phase ${String(phaseTick)} leaf ports`).toEqual([]);
    }
    expect(maximumSeparationM)
      .toBeCloseTo(MEASURED_BREEZE_MAXIMUM_LEAF_PORT_SEPARATION_M, 11);
  }, 120_000);
});
