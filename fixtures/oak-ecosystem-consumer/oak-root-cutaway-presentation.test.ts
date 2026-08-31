import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1, type OakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
} from './oak-tissue-union-routing.js';
import {
  OAK_SOIL_VOXEL_SIZE_M_V1,
} from './oak-soil-voxel.js';
import { OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1 } from './oak-soil-contact-voxels.js';

const TISSUE_BATCHES = new Set([
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
]);

function rootCoordinates(key: string): Readonly<{ x: number; y: number; z: number }> {
  const match = /^oak:organ:[0-9]+:[0-9]+:union-voxel:(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)$/u
    .exec(key);
  if (!match) throw new Error(`Unexpected oak root tissue key '${key}'.`);
  return { x: Number(match[1]), y: Number(match[2]), z: Number(match[3]) };
}

function contactCell(key: string): readonly [number, number, number] {
  const match = /^oak:soil-contact:(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)$/u.exec(key);
  if (!match) throw new Error(`Unexpected oak soil-contact key '${key}'.`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

const NEIGHBORS = [
  [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
] as const;

function axisLength(matrix: ArrayLike<number>, offset: number): number {
  return Math.hypot(matrix[offset]!, matrix[offset + 1]!, matrix[offset + 2]!);
}

function organMeanLuminance(
  batch: OakRenderFrameV1['snapshot']['batches'][number],
  organKey: string,
): number {
  if (batch.colors === undefined) throw new Error('Root voxel batch must carry per-instance colours.');
  let total = 0;
  let count = 0;
  batch.instanceKeys.forEach((key, slot) => {
    if (!key.startsWith(`oak:${organKey}:`)) return;
    const offset = slot * 4;
    total += batch.colors![offset]! * .2126
      + batch.colors![offset + 1]! * .7152
      + batch.colors![offset + 2]! * .0722;
    count += 1;
  });
  if (count === 0) throw new Error(`Root voxel batch has no instances for '${organKey}'.`);
  return total / count;
}

function overlappingSoilSlots(
  frame: OakRenderFrameV1,
  center: readonly [number, number, number],
): readonly number[] {
  const chunk = frame.snapshot.chunks[0]!;
  const half = OAK_TISSUE_VOXEL_PITCH_M_V1 * .5;
  const base = center.map((coordinate, axis) =>
    Math.floor(coordinate / OAK_SOIL_VOXEL_SIZE_M_V1)
    - [chunk.origin.x, chunk.origin.y, chunk.origin.z][axis]!);
  const result: number[] = [];
  for (let y = base[1]! - 1; y <= base[1]! + 1; y += 1) {
    for (let z = base[2]! - 1; z <= base[2]! + 1; z += 1) {
      for (let x = base[0]! - 1; x <= base[0]! + 1; x += 1) {
        if (x < 0 || y < 0 || z < 0 || x >= chunk.size.x || y >= chunk.size.y || z >= chunk.size.z) continue;
        const local = [x, y, z];
        const overlaps = center.every((coordinate, axis) => {
          const minimum = ([chunk.origin.x, chunk.origin.y, chunk.origin.z][axis]! + local[axis]!)
            * OAK_SOIL_VOXEL_SIZE_M_V1;
          return Math.min(coordinate + half, minimum + OAK_SOIL_VOXEL_SIZE_M_V1)
            - Math.max(coordinate - half, minimum) > 0;
        });
        if (overlaps) result.push(x + chunk.size.x * (z + chunk.size.z * y));
      }
    }
  }
  return result;
}

function tissueSoilOverlapIssues(frame: OakRenderFrameV1): readonly string[] {
  const chunk = frame.snapshot.chunks[0]!;
  const issues: string[] = [];
  const tissueIds = new Set<number>();
  for (const batch of frame.snapshot.batches) {
    if (!TISSUE_BATCHES.has(batch.key)) continue;
    batch.instanceKeys.forEach((key, slot) => {
      const center = [
        batch.matrices[slot * 16 + 12]!,
        batch.matrices[slot * 16 + 13]!,
        batch.matrices[slot * 16 + 14]!,
      ] as const;
      const coordinate = rootCoordinates(key);
      tissueIds.add(oakTissueCellIdV1([coordinate.x, coordinate.y, coordinate.z]));
      for (const soilSlot of overlappingSoilSlots(frame, center)) {
        if (chunk.voxels[soilSlot] !== 0) issues.push(`${key} overlaps soil slot ${String(soilSlot)}`);
      }
    });
  }
  const contact = frame.snapshot.batches.find((batch) =>
    batch.key === OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1)!;
  for (const key of contact.instanceKeys) {
    if (tissueIds.has(oakTissueCellIdV1(contactCell(key)))) {
      issues.push(`${key} duplicates a tissue cell`);
    }
  }
  return issues;
}

describe('oak root-cutaway voxel presentation', () => {
  it('keeps roots inspection-only and retains every root source in the fused equal-cube lattice', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const biological = simulation.snapshot();
    const projection = simulation.projection();
    const surface = buildOakRenderFrameV1(projection);
    const cutaway = buildOakRenderFrameV1(projection, {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const tissue = buildOakTissueVoxelProjectionV1(projection, true);
    const livingRoots = biological.organs.filter((organ) =>
      (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort')
      && organ.stage !== 'abscised');
    expect(livingRoots.filter((organ) => organ.kind === 'coarse-root')).toHaveLength(1);
    expect(livingRoots.filter((organ) => organ.kind === 'fine-root-cohort')).toHaveLength(1);

    const surfaceRoots = surface.snapshot.batches.find((candidate) =>
      candidate.key === OAK_ROOT_VOXEL_BATCH_KEY_V1)!;
    const cutawayRoots = cutaway.snapshot.batches.find((candidate) =>
      candidate.key === OAK_ROOT_VOXEL_BATCH_KEY_V1)!;
    expect(surfaceRoots.instanceKeys).toEqual([]);
    expect(surface.metrics.rootVoxels).toBe(0);
    expect(cutawayRoots.instanceKeys.length).toBeGreaterThan(livingRoots.length);
    expect(cutaway.metrics.rootOrganCount).toBe(livingRoots.length);
    expect(cutaway.metrics.rootVoxels).toBe(cutawayRoots.instanceKeys.length);

    for (const root of livingRoots) {
      const keys = cutawayRoots.instanceKeys.filter((key) =>
        key.startsWith(`oak:${root.key}:`));
      expect(keys.length, root.key).toBeGreaterThan(0);
      const assignments = [...tissue.sourceAssignments.values()].filter((assignment) =>
        assignment.ownerOrganKey === root.key);
      expect(assignments.length, root.key).toBeGreaterThan(0);
      for (const assignment of assignments) {
        expect(tissue.materialCells.get(oakTissueCellIdV1(assignment.cell))?.sourceKey)
          .toBe(assignment.sourceKey);
      }
    }
    const coarseRoot = livingRoots.find((organ) => organ.kind === 'coarse-root')!;
    const fineRoot = livingRoots.find((organ) => organ.kind === 'fine-root-cohort')!;
    expect(organMeanLuminance(cutawayRoots, fineRoot.key)
      - organMeanLuminance(cutawayRoots, coarseRoot.key)).toBeGreaterThan(55);

    for (let slot = 0; slot < cutawayRoots.instanceKeys.length; slot += 1) {
      const matrix = cutawayRoots.matrices.subarray(slot * 16, slot * 16 + 16);
      const coordinate = rootCoordinates(cutawayRoots.instanceKeys[slot]!);
      expect(axisLength(matrix, 0)).toBeCloseTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8);
      expect(axisLength(matrix, 4)).toBeCloseTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8);
      expect(axisLength(matrix, 8)).toBeCloseTo(OAK_TISSUE_VOXEL_PITCH_M_V1, 8);
      expect([matrix[12], matrix[13], matrix[14]])
        .toEqual(oakTissueCellCenterM_V1([coordinate.x, coordinate.y, coordinate.z]));
    }
    expect(cutaway.metrics.occupiedSoilVoxels).toBeGreaterThan(0);
    expect(cutaway.metrics.occupiedSoilVoxels)
      .not.toBe(surface.metrics.occupiedSoilVoxels);
    const contactBatch = cutaway.snapshot.batches.find((candidate) =>
      candidate.key === OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1)!;
    expect(contactBatch.instanceKeys).toHaveLength(cutaway.metrics.soilContactVoxels);
    expect(contactBatch.instanceKeys.length).toBeGreaterThan(0);
    const contactIds = new Set(contactBatch.instanceKeys.map((key) =>
      oakTissueCellIdV1(contactCell(key))));
    for (const root of livingRoots) {
      const cells = cutawayRoots.instanceKeys
        .filter((key) => key.startsWith(`oak:${root.key}:`))
        .map((key) => {
          const value = rootCoordinates(key);
          return [value.x, value.y, value.z] as const;
        });
      expect(cells.some((cell) => NEIGHBORS.some((neighbor) => contactIds.has(
        oakTissueCellIdV1([
          cell[0] + neighbor[0], cell[1] + neighbor[1], cell[2] + neighbor[2],
        ]),
      ))), `${root.key} exact soil face contact`).toBe(true);
    }
  });

  it('carves every positive-volume tissue intersection out of presented soil', () => {
    const simulation = createOakSimulationV1();
    let currentDay = 0;
    let counterFrame: OakRenderFrameV1 | null = null;
    for (const day of [0, 3, 6, 13, 42, 82, 100, 210, 220, 239, 240]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day - currentDay));
      currentDay = day;
      const projection = simulation.projection();
      const surface = buildOakRenderFrameV1(projection);
      const cutaway = buildOakRenderFrameV1(projection, {
        rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
      });
      expect(tissueSoilOverlapIssues(surface), `day ${String(day)} surface`).toEqual([]);
      expect(tissueSoilOverlapIssues(cutaway), `day ${String(day)} cutaway`).toEqual([]);
      if (day === 100) counterFrame = cutaway;
    }
    const frame = counterFrame!;
    const chunk = frame.snapshot.chunks[0]!;
    const rootBatch = frame.snapshot.batches.find(({ key }) => key === OAK_ROOT_VOXEL_BATCH_KEY_V1)!;
    let overlapSlot: number | undefined;
    for (let slot = 0; slot < rootBatch.instanceKeys.length && overlapSlot === undefined; slot += 1) {
      const center = [
        rootBatch.matrices[slot * 16 + 12]!,
        rootBatch.matrices[slot * 16 + 13]!,
        rootBatch.matrices[slot * 16 + 14]!,
      ] as const;
      overlapSlot = overlappingSoilSlots(frame, center).find((candidate) => chunk.voxels[candidate] === 0);
    }
    expect(overlapSlot).toBeDefined();
    const voxels = chunk.voxels.slice();
    voxels[overlapSlot!] = 1;
    const counterRun: OakRenderFrameV1 = {
      ...frame,
      snapshot: { ...frame.snapshot, chunks: [{ ...chunk, voxels }] },
    };
    expect(tissueSoilOverlapIssues(counterRun).length).toBeGreaterThan(0);
  });
});
