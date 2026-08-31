import { describe, expect, it } from 'vitest';

import {
  buildOakFallenLitterVoxelProjectionV1,
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
  OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import { oakLeafVariantForOrganKeyV1 } from './oak-leaf-shape.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
} from './oak-tissue-voxel-projection.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import { roundOakTissueCellV1 } from './oak-tissue-lattice.js';

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const LITTER_KEY = /^oak-litter:(organ:[0-9]+:[0-9]+):fallen-leaf-voxel:(-?[0-9]+):(-?[0-9]+)$/u;

function batch(frame: ReturnType<typeof buildOakRenderFrameV1>, key: string) {
  const result = frame.snapshot.batches.find((candidate) => candidate.key === key);
  if (result === undefined) throw new Error(`Expected oak batch '${key}'.`);
  return result;
}

function localCells(keys: readonly string[]): ReadonlyMap<string, readonly (readonly [number, number])[]> {
  const result = new Map<string, (readonly [number, number])[]>();
  for (const key of keys) {
    const match = LITTER_KEY.exec(key);
    if (match === null) throw new Error(`Cannot parse fallen-litter key '${key}'.`);
    const cells = result.get(match[1]!) ?? [];
    cells.push([Number(match[2]), Number(match[3])]);
    result.set(match[1]!, cells);
  }
  return result;
}

function connected(cells: readonly (readonly [number, number])[]): boolean {
  if (cells.length === 0) return false;
  const remaining = new Set(cells.map(([x, z]) => `${String(x)}:${String(z)}`));
  const queue = [cells[0]!];
  remaining.delete(`${String(cells[0]![0])}:${String(cells[0]![1])}`);
  while (queue.length > 0) {
    const [x, z] = queue.pop()!;
    for (const neighbor of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]] as const) {
      const key = `${String(neighbor[0])}:${String(neighbor[1])}`;
      if (!remaining.delete(key)) continue;
      queue.push(neighbor);
    }
  }
  return remaining.size === 0;
}

function pairedLobePeaks(cells: readonly (readonly [number, number])[]): number {
  const byLayer = new Map<number, number>();
  for (const [forward, radial] of cells) {
    byLayer.set(forward, Math.max(byLayer.get(forward) ?? 0, Math.abs(radial)));
  }
  const widths = [...byLayer.entries()].sort(([left], [right]) => left - right)
    .map(([, width]) => width);
  let peaks = 0;
  for (let index = 1; index < widths.length - 1; index += 1) {
    if (widths[index]! > widths[index - 1]! && widths[index]! > widths[index + 1]!) peaks += 1;
  }
  return peaks;
}

function exactSurfaceCell(matrix: ArrayLike<number>): string {
  const [x, , z] = roundOakTissueCellV1([matrix[12]!, matrix[13]!, matrix[14]!]);
  return `${String(x)}:${String(z)}`;
}

describe('oak fallen-leaf voxel litter', () => {
  it('lays every abscised leaf as one exact, lobed, non-overlapping soil-contact silhouette', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const fallenLeaves = state.organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage === 'abscised');
    expect(litter.recipientSoilCellKey).toBe(state.soil[0]?.key);
    expect(litter.leafMetrics.map(({ leafKey }) => leafKey).sort())
      .toEqual(fallenLeaves.map(({ key }) => key).sort());
    expect(litter.voxelCount).toBeGreaterThan(2_000);
    expect(litter.voxelCount).toBe(litter.records.length);

    const byLeaf = localCells(litter.records.map(({ key }) => key));
    for (const leaf of fallenLeaves) {
      const cells = byLeaf.get(leaf.key) ?? [];
      expect(connected(cells), leaf.key).toBe(true);
      expect(new Set(cells.map(([forward]) => forward)).size, leaf.key).toBeGreaterThan(15);
      expect(new Set(cells.map(([, radial]) => radial)).size, leaf.key).toBeGreaterThan(5);
      expect(pairedLobePeaks(cells), leaf.key).toBe(
        (oakLeafVariantForOrganKeyV1(leaf.key).lobeCount - 1) / 2,
      );
    }

    const occupied = new Set<string>();
    for (const record of litter.records) {
      const cell = exactSurfaceCell(record.matrix);
      expect(occupied.has(cell), cell).toBe(false);
      occupied.add(cell);
      expect(record.matrix[13]! - record.matrix[5]! / 2).toBe(0);
      expect(record.color.r).toBeGreaterThan(record.color.g);
      expect(record.color.g).toBeGreaterThan(record.color.b);
    }
    for (const record of [...tissue.records.values()].flat()) {
      if (!(record.matrix[13]! - PITCH / 2 < PITCH
        && record.matrix[13]! + PITCH / 2 > 0)) continue;
      expect(occupied.has(exactSurfaceCell(record.matrix)), record.key).toBe(false);
    }
  });

  it('keeps all ten complete litter masks on the retained root-cutaway soil half', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const state = simulation.projection();
    const surface = buildOakRenderFrameV1(state, { renderRevision: 400 });
    const cutaway = buildOakRenderFrameV1(state, {
      renderRevision: 401,
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const surfaceLitter = batch(surface, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1);
    const cutawayLitter = batch(cutaway, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1);
    expect(cutaway.metrics.fallenLitterLeafCount).toBe(10);
    expect(cutawayLitter.instanceKeys).toEqual(surfaceLitter.instanceKeys);
    expect(cutawayLitter.instanceKeys).toHaveLength(surfaceLitter.instanceKeys.length);
    for (let slot = 0; slot < cutawayLitter.instanceKeys.length; slot += 1) {
      const matrix = cutawayLitter.matrices.subarray(slot * 16, slot * 16 + 16);
      expect(matrix[12]! + matrix[0]! / 2, cutawayLitter.instanceKeys[slot]).toBeLessThanOrEqual(0);
      expect(matrix[13]! - matrix[5]! / 2, cutawayLitter.instanceKeys[slot]).toBe(0);
    }
  });

  it('bounds nearest-anchor work against the removed full-surface sort and reports frame cost', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const fallenLeafCount = state.organs.filter((organ) =>
      organ.kind === 'leaf' && organ.stage === 'abscised').length;
    const minX = Math.min(...state.soil.map((cell) => cell.centerM.x - cell.sizeM.x / 2));
    const maxX = Math.max(...state.soil.map((cell) => cell.centerM.x + cell.sizeM.x / 2));
    const minZ = Math.min(...state.soil.map((cell) => cell.centerM.z - cell.sizeM.z / 2));
    const maxZ = Math.max(...state.soil.map((cell) => cell.centerM.z + cell.sizeM.z / 2));
    const surfaceWidth = Math.floor(maxX / PITCH) - Math.ceil(minX / PITCH);
    const surfaceDepth = Math.floor(maxZ / PITCH) - Math.ceil(minZ / PITCH);
    const removedFullSortMaterializations = surfaceWidth * surfaceDepth * fallenLeafCount;
    expect(removedFullSortMaterializations).toBe(400_000);
    expect(litter.anchorCandidatesTested).toBeLessThan(50);
    expect(litter.anchorQueueInsertions * 100).toBeLessThan(removedFullSortMaterializations);

    // Wall time is reported with only a categorical guard because host load is
    // not a deterministic verdict. The work-count counter-run above is the gate.
    let previous = buildOakRenderFrameV1(state, { renderRevision: 500 });
    const frames = 12;
    const started = performance.now();
    for (let index = 0; index < frames; index += 1) {
      simulation.advanceHostTicks(1);
      previous = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 501 + index,
        previousFrame: previous,
      });
    }
    const perFrameMs = (performance.now() - started) / frames;
    console.log(
      `oak day-240 render-frame construction: ${perFrameMs.toFixed(2)} ms `
      + '(60 Hz frame allows 16.67 ms in total, rendering included)',
    );
    expect(perFrameMs).toBeLessThan(100);
  });

  it('publishes a separate exact-cube batch and sparsely transfers day 239 leaves into it', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(239));
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 300 });
    expect(batch(before, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1).instanceKeys).toEqual([]);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 301,
      previousFrame: before,
    });
    const fallen = batch(after, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1);
    expect(fallen.geometryKey).toBe(OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1);
    expect(fallen.materialKey).toBe(OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1);
    expect(fallen.instanceKeys.length).toBe(after.metrics.fallenLitterVoxels);
    expect(after.metrics.fallenLitterLeafCount).toBe(10);
    expect(after.metrics.leafVoxels).toBe(0);
    expect(batch(after, OAK_LEAF_VOXEL_BATCH_KEY_V1).instanceKeys).toEqual([]);
    expect(after.snapshot.resources.some((resource) =>
      resource.key === OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1)).toBe(true);
    for (let slot = 0; slot < fallen.instanceKeys.length; slot += 1) {
      const matrix = fallen.matrices.subarray(slot * 16, slot * 16 + 16);
      expect([matrix[0], matrix[5], matrix[10]]).toEqual([PITCH, PITCH, PITCH]);
      expect(matrix[13]! - matrix[5]! / 2).toBe(0);
    }
    const delta = buildOakRenderDeltaV1(before, after);
    expect(delta.operations.some((operation) =>
      operation.op === 'patch-batch-instances'
      && operation.key === OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1
      && operation.upserts.instanceKeys.length === fallen.instanceKeys.length)).toBe(true);
    expect(delta.operations.some((operation) =>
      operation.op === 'patch-batch-instances'
      && operation.key === OAK_LEAF_VOXEL_BATCH_KEY_V1
      && operation.removeInstanceKeys.length > 0)).toBe(true);
  });
});
