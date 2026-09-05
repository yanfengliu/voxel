import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';

import {
  buildOakFallenLitterVoxelProjectionV1,
  OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
  OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1,
} from './oak-fallen-litter-voxel.js';
import { buildOakContactLitterProjectionV1 } from './oak-litter-contact-projection.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
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
import { supportOakLeafRecordsOnTerrainV1 } from './oak-litter-support.js';
import {
  oakSoilSurfaceAtFineCellV1,
  oakSoilSurfaceAtWorldVoxelColumnV1,
  OAK_SOIL_SURFACE_COLUMN_SIZE_V1,
  OAK_SOIL_SURFACE_FINE_CELLS_PER_COARSE_VOXEL_V1,
  OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1,
} from './oak-soil-surface.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';
import {
  oakVoxelAabbsOverlapV1,
  oakVoxelRecordAabbV1,
} from './oak-voxel-aabb.js';

const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;
const CONTACT_TOLERANCE_M = Number.EPSILON * 8_192;
const LITTER_KEY = /^oak-litter:(organ:[0-9]+:[0-9]+):source-cell:(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)$/u;
const UNION_SUFFIX = /:(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)$/u;

function batch(frame: ReturnType<typeof buildOakRenderFrameV1>, key: string) {
  const result = frame.snapshot.batches.find((candidate) => candidate.key === key);
  if (result === undefined) throw new Error(`Expected oak batch '${key}'.`);
  return result;
}

function sourceCell(key: string): string {
  const match = UNION_SUFFIX.exec(key);
  if (match === null) throw new Error(`Cannot parse oak union key '${key}'.`);
  return `${match[1]}:${match[2]}:${match[3]}`;
}

function recordsForLeaf(
  records: readonly OakRenderInstanceRecordV1[],
  leafKey: string,
): readonly OakRenderInstanceRecordV1[] {
  return records.filter(({ key }) => key.startsWith(`oak-litter:${leafKey}:`));
}

function footprintClearancesM(
  record: OakRenderInstanceRecordV1,
  cutaway?: { readonly axis: 'x' | 'z'; readonly planeM: number; readonly keep: 'less-than' | 'greater-than' },
): readonly number[] {
  const bounds = oakVoxelRecordAabbV1(record);
  const firstX = Math.floor((bounds.min[0] + CONTACT_TOLERANCE_M) / PITCH);
  const lastX = Math.ceil((bounds.max[0] - CONTACT_TOLERANCE_M) / PITCH) - 1;
  const firstZ = Math.floor((bounds.min[2] + CONTACT_TOLERANCE_M) / PITCH);
  const lastZ = Math.ceil((bounds.max[2] - CONTACT_TOLERANCE_M) / PITCH) - 1;
  const clearances: number[] = [];
  for (let x = firstX; x <= lastX; x += 1) {
    for (let z = firstZ; z <= lastZ; z += 1) {
      const surface = oakSoilSurfaceAtFineCellV1(x, z, cutaway);
      if (surface !== null) clearances.push(bounds.min[1] - surface.topM);
    }
  }
  return clearances;
}

function minimumFootprintClearanceM(
  record: OakRenderInstanceRecordV1,
  cutaway?: { readonly axis: 'x' | 'z'; readonly planeM: number; readonly keep: 'less-than' | 'greater-than' },
): number {
  const clearances = footprintClearancesM(record, cutaway);
  if (clearances.length === 0) throw new Error(`Litter voxel '${record.key}' has no soil footprint.`);
  return Math.min(...clearances);
}

function colorsEqual(
  left: OakRenderInstanceRecordV1['color'],
  right: OakRenderInstanceRecordV1['color'],
): boolean {
  return left.r === right.r && left.g === right.g
    && left.b === right.b && left.a === right.a;
}

function rawFinalLeafRecords(leaf: OakLeafOrganSnapshotV1) {
  const finalFalling: OakLeafOrganSnapshotV1 = {
    ...leaf,
    stage: 'detached',
    developmentPhase: 'falling',
    fallProgressFraction: 0,
  };
  return buildOakTissueVoxelProjectionV1({ organs: [finalFalling] }, false)
    .detachedLeafBodies[0]!.records;
}

describe('oak fallen-leaf voxel litter', () => {
  it('preserves each final falling mask and gives every rigid leaf nonpenetrating support', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const fallenLeaves = state.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.stage === 'abscised');
    expect(litter.recipientSoilCellKeys.length).toBeGreaterThan(1);
    expect(litter.recipientSoilCellKeys.every((key) =>
      state.soil.some((cell) => cell.key === key))).toBe(true);
    expect(litter.leafMetrics.map(({ leafKey }) => leafKey).sort())
      .toEqual(fallenLeaves.map(({ key }) => key).sort());
    expect(litter.voxelCount).toBeGreaterThan(2_000);
    expect(litter.voxelCount).toBe(litter.records.length);

    const occupiedWorldCells = new Set<string>();
    for (const leaf of fallenLeaves) {
      const settled = recordsForLeaf(litter.records, leaf.key);
      const raw = rawFinalLeafRecords(leaf);
      expect(settled.map(({ key }) => sourceCell(key)).sort(), leaf.key)
        .toEqual(raw.map(({ key }) => sourceCell(key)).sort());
      const rawByCell = new Map(raw.map((record) => [sourceCell(record.key), record]));
      for (const record of settled) {
        expect(colorsEqual(record.color, rawByCell.get(sourceCell(record.key))!.color), leaf.key)
          .toBe(true);
        const clearances = footprintClearancesM(record);
        expect(clearances.length, `${record.key} retained terrain footprint`).toBeGreaterThan(0);
        for (const clearance of clearances) {
          expect(clearance, record.key).toBeGreaterThanOrEqual(-CONTACT_TOLERANCE_M);
        }
        const worldKey = [record.matrix[12], record.matrix[13], record.matrix[14]]
          .map((value) => value!.toFixed(12)).join(':');
        expect(occupiedWorldCells.has(worldKey), record.key).toBe(false);
        occupiedWorldCells.add(worldKey);
      }
      expect(settled.some((record) =>
        Math.abs(minimumFootprintClearanceM(record)) <= CONTACT_TOLERANCE_M), leaf.key)
        .toBe(true);
      const metric = litter.leafMetrics.find(({ leafKey }) => leafKey === leaf.key)!;
      expect(metric.supportContactCount).toBeGreaterThan(0);
      expect(metric.voxelCount).toBe(raw.length);
    }
  });

  it('settles into asymmetric relief-sorted horizontal descent lanes', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const leaves = state.organs.filter((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.stage === 'abscised');
    const groups = leaves.map((leaf) => {
      const records = recordsForLeaf(litter.records, leaf.key);
      return {
        leaf,
        records,
        x: records.reduce((sum, record) => sum + record.matrix[12]!, 0) / records.length,
        z: records.reduce((sum, record) => sum + record.matrix[14]!, 0) / records.length,
      };
    });
    const radii = groups.map(({ x, z }) => Math.hypot(x, z));
    expect(new Set(radii.map((radius) => Math.round(radius * 1_000))).size)
      .toBeGreaterThanOrEqual(8);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.04);

    const angles = groups.map(({ x, z }) => Math.atan2(z, x))
      .sort((left, right) => left - right);
    const angularGaps = angles.map((angle, index) => {
      const next = angles[(index + 1) % angles.length]!;
      return next > angle ? next - angle : next + Math.PI * 2 - angle;
    });
    expect(Math.min(...angularGaps)).toBeGreaterThan(15 * Math.PI / 180);
    expect(Math.max(...angularGaps)).toBeGreaterThan(35 * Math.PI / 180);
    expect(Math.max(...angularGaps) - Math.min(...angularGaps))
      .toBeGreaterThan(15 * Math.PI / 180);

    let horizontallyInterleavedVoxelPairs = 0;
    let volumeOverlapPairs = 0;
    for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
        for (const left of groups[leftIndex]!.records) {
          const leftBounds = oakVoxelRecordAabbV1(left);
          for (const right of groups[rightIndex]!.records) {
            const rightBounds = oakVoxelRecordAabbV1(right);
            const horizontalOverlap = leftBounds.min[0] < rightBounds.max[0]
              && leftBounds.max[0] > rightBounds.min[0]
              && leftBounds.min[2] < rightBounds.max[2]
              && leftBounds.max[2] > rightBounds.min[2];
            horizontallyInterleavedVoxelPairs += Number(horizontalOverlap);
            volumeOverlapPairs += Number(oakVoxelAabbsOverlapV1(leftBounds, rightBounds));
          }
        }
      }
    }
    // The final orientation is already established before the vertical settle
    // segment. Disjoint XZ voxel footprints therefore prove no newer body has
    // to descend through older relief-supported litter on the way to contact.
    expect(horizontallyInterleavedVoxelPairs).toBe(0);
    expect(volumeOverlapPairs).toBe(0);
  });

  it('rejects two relief-supported leaf bodies that share volume', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const source = simulation.projection().organs.find(
      (organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.stage === 'abscised',
    );
    if (source === undefined) throw new Error('Expected one abscised collision-control leaf.');
    const duplicate: OakLeafOrganSnapshotV1 = {
      ...source,
      key: 'organ:999:1',
      identity: { localId: 999, generation: 1 },
    };
    expect(() => buildOakContactLitterProjectionV1([source, duplicate]))
      .toThrow(/overlaps.*in three dimensions/u);
  });

  it('lifts a rotated cube over its full terrain footprint and permits exact face support', () => {
    const origin = OAK_SOIL_SURFACE_WORLD_VOXEL_ORIGIN_V1;
    const size = OAK_SOIL_SURFACE_COLUMN_SIZE_V1;
    let transition: Readonly<{
      lowX: number;
      highX: number;
      z: number;
      lowTopM: number;
      highTopM: number;
    }> | undefined;
    for (let z = origin.z; z < origin.z + size.z && transition === undefined; z += 1) {
      for (let x = origin.x; x < origin.x + size.x - 1; x += 1) {
        const left = oakSoilSurfaceAtWorldVoxelColumnV1(x, z)!;
        const right = oakSoilSurfaceAtWorldVoxelColumnV1(x + 1, z)!;
        if (left.topM === right.topM) continue;
        transition = left.topM < right.topM
          ? { lowX: x, highX: x + 1, z, lowTopM: left.topM, highTopM: right.topM }
          : { lowX: x + 1, highX: x, z, lowTopM: right.topM, highTopM: left.topM };
        break;
      }
    }
    if (transition === undefined) throw new Error('Expected one adjacent oak terrain step.');
    const scale = OAK_SOIL_SURFACE_FINE_CELLS_PER_COARSE_VOXEL_V1;
    const lowIsLeft = transition.lowX < transition.highX;
    const fineX = transition.lowX * scale + (lowIsLeft ? scale - 1 : 0);
    const fineZ = transition.z * scale + Math.floor(scale / 2);
    const halfDiagonal = PITCH * Math.SQRT1_2;
    const record: OakRenderInstanceRecordV1 = {
      key: 'oak-litter-support:rotated-step-control',
      matrix: [
        halfDiagonal, 0, -halfDiagonal, 0,
        0, PITCH, 0, 0,
        halfDiagonal, 0, halfDiagonal, 0,
        (fineX + .5) * PITCH,
        transition.lowTopM + PITCH / 2,
        (fineZ + .5) * PITCH,
        1,
      ],
      color: { r: 150, g: 80, b: 45, a: 255 },
    };
    const rawClearances = footprintClearancesM(record);
    expect(Math.max(...rawClearances)).toBeCloseTo(0, 12);
    expect(Math.min(...rawClearances)).toBeLessThan(-PITCH);

    const supported = supportOakLeafRecordsOnTerrainV1([record]);
    expect(supported.verticalTranslationM)
      .toBeCloseTo(transition.highTopM - transition.lowTopM, 12);
    expect(supported.supportContactCount).toBeGreaterThan(0);
    const supportedClearances = footprintClearancesM(supported.records[0]!);
    expect(supportedClearances.every((clearance) =>
      clearance >= -CONTACT_TOLERANCE_M)).toBe(true);
    expect(Math.min(...supportedClearances)).toBeCloseTo(0, 12);

    const faceContact = supportOakLeafRecordsOnTerrainV1(supported.records);
    expect(faceContact.verticalTranslationM).toBeCloseTo(0, 12);
    expect(faceContact.supportContactCount).toBeGreaterThan(0);
  });

  it('keeps ordinary litter poses and hides whole bodies outside root-cutaway soil', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const ordinary = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const rootCutaway = { axis: 'x', planeM: 0, keep: 'less-than' } as const;
    const cutaway = buildOakFallenLitterVoxelProjectionV1(
      state,
      tissue.records,
      { rootCutaway },
    );
    expect(cutaway.leafMetrics.length).toBeGreaterThan(0);
    expect(cutaway.leafMetrics.length).toBeLessThan(ordinary.leafMetrics.length);
    const visibleLeafKeys = new Set(cutaway.leafMetrics.map(({ leafKey }) => leafKey));
    for (const ordinaryMetric of ordinary.leafMetrics) {
      const ordinaryLeaf = recordsForLeaf(ordinary.records, ordinaryMetric.leafKey);
      const cutawayLeaf = recordsForLeaf(cutaway.records, ordinaryMetric.leafKey);
      if (!visibleLeafKeys.has(ordinaryMetric.leafKey)) {
        expect(cutawayLeaf).toEqual([]);
        expect(ordinaryLeaf.some((record) =>
          oakVoxelRecordAabbV1(record).max[0] > CONTACT_TOLERANCE_M)).toBe(true);
        continue;
      }
      const leafMetric = cutaway.leafMetrics.find(({ leafKey }) =>
        leafKey === ordinaryMetric.leafKey)!;
      const leaf = state.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.key === leafMetric.leafKey)!;
      const recipient = state.soil.find(({ key }) => key === leafMetric.recipientSoilCellKey)!;
      const midpointX = leaf.positionM.x + leaf.direction.x * leaf.lengthM * 0.5;
      const midpointZ = leaf.positionM.z + leaf.direction.z * leaf.lengthM * 0.5;
      expect(recipient.centerM.x + recipient.sizeM.x / 2).toBeLessThanOrEqual(0);
      expect(midpointX).toBeGreaterThanOrEqual(recipient.centerM.x - recipient.sizeM.x / 2);
      expect(midpointX).toBeLessThan(recipient.centerM.x + recipient.sizeM.x / 2);
      expect(midpointZ).toBeGreaterThanOrEqual(recipient.centerM.z - recipient.sizeM.z / 2);
      expect(midpointZ).toBeLessThan(recipient.centerM.z + recipient.sizeM.z / 2);
      expect(leafMetric.horizontalTranslationCells).toEqual([0, 0]);
      expect(leafMetric.supportContactCount).toBeGreaterThan(0);
      expect(cutawayLeaf).toHaveLength(ordinaryLeaf.length);
      for (let index = 0; index < cutawayLeaf.length; index += 1) {
        const before = ordinaryLeaf[index]!;
        const after = cutawayLeaf[index]!;
        expect(after.key).toBe(before.key);
        expect(after.matrix, after.key).toEqual(before.matrix);
        expect(colorsEqual(before.color, after.color), after.key).toBe(true);
        expect(oakVoxelRecordAabbV1(after).max[0], after.key)
          .toBeLessThanOrEqual(CONTACT_TOLERANCE_M);
        const clearances = footprintClearancesM(after, rootCutaway);
        expect(clearances.length, `${after.key} retained terrain footprint`).toBeGreaterThan(0);
        expect(clearances.every((clearance) => clearance >= -CONTACT_TOLERANCE_M), after.key)
          .toBe(true);
      }
      expect(cutawayLeaf.some((record) => Math.abs(
        minimumFootprintClearanceM(record, rootCutaway),
      ) <= CONTACT_TOLERANCE_M), leafMetric.leafKey).toBe(true);
    }

    let cutawayOverlapPairs = 0;
    const visibleGroups = cutaway.leafMetrics.map(({ leafKey }) =>
      recordsForLeaf(cutaway.records, leafKey));
    for (let leftIndex = 0; leftIndex < visibleGroups.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleGroups.length; rightIndex += 1) {
        for (const left of visibleGroups[leftIndex]!) {
          for (const right of visibleGroups[rightIndex]!) {
            cutawayOverlapPairs += Number(oakVoxelAabbsOverlapV1(
              oakVoxelRecordAabbV1(left), oakVoxelRecordAabbV1(right),
            ));
          }
        }
      }
    }
    expect(cutawayOverlapPairs).toBe(0);
  });

  it('uses direct bounded rigid placement and reports frame construction cost', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const litter = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    expect(litter.anchorCandidatesTested).toBe(0);
    expect(litter.anchorQueueInsertions).toBe(0);
    expect(litter.leafMetrics.every(({ anchorCandidatesTested }) =>
      anchorCandidatesTested === 0)).toBe(true);

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
    console.log(
      `oak day-249 render-frame construction: ${((performance.now() - started) / frames).toFixed(2)} ms `
      + '(observational 60 Hz target; rendering excluded)',
    );
  });

  it('rejects a living surface cube that occupies a real litter contact column', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const ordinary = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const contact = ordinary.records.find((record) =>
      Math.abs(minimumFootprintClearanceM(record)) <= CONTACT_TOLERANCE_M);
    if (contact === undefined) throw new Error('Expected one exact litter contact cube.');
    const syntheticLiving = new Map(tissue.records);
    syntheticLiving.set('batch:oak:collision-control', [
      { ...contact, key: 'oak:organ:999:1:union-voxel:collision-control' },
    ]);
    expect(() => buildOakFallenLitterVoxelProjectionV1(state, syntheticLiving))
      .toThrow(/overlaps presented tissue.*fall target must preserve placed-things solidity/u);
  });

  it('rejects raised three-dimensional overlap while allowing face-only height contact', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const tissue = buildOakTissueVoxelProjectionV1(state, false);
    const ordinary = buildOakFallenLitterVoxelProjectionV1(state, tissue.records);
    const raised = ordinary.records.find((record) =>
      minimumFootprintClearanceM(record) > PITCH * 2);
    if (raised === undefined) throw new Error('Expected one cambered litter cube above soil contact.');
    const collidingLiving = new Map(tissue.records);
    collidingLiving.set('batch:oak:raised-collision-control', [
      { ...raised, key: 'oak:organ:999:1:raised-collision-control:0:0:0' },
    ]);
    expect(() => buildOakFallenLitterVoxelProjectionV1(state, collidingLiving))
      .toThrow(/overlaps presented tissue.*fall target must preserve placed-things solidity/u);

    const occupiedCenters = new Set(ordinary.records.map((record) =>
      [record.matrix[12]!, record.matrix[13]!, record.matrix[14]!]
        .map((value) => value.toFixed(12)).join(':')));
    const faceControl = ordinary.records.find((record) => {
      const above = [record.matrix[12]!, record.matrix[13]! + PITCH, record.matrix[14]!]
        .map((value) => value.toFixed(12)).join(':');
      return !occupiedCenters.has(above);
    });
    if (faceControl === undefined) throw new Error('Expected one exposed litter top face.');
    const faceMatrix = [...faceControl.matrix];
    faceMatrix[13] = faceMatrix[13]! + PITCH;
    const faceOnlyLiving = new Map(tissue.records);
    faceOnlyLiving.set('batch:oak:face-contact-control', [{
      ...faceControl,
      key: 'oak:organ:999:1:face-contact-control:0:0:0',
      matrix: faceMatrix,
    }]);
    expect(() => buildOakFallenLitterVoxelProjectionV1(state, faceOnlyLiving)).not.toThrow();
  });

  it('transfers the first settled leaf while later leaves remain attached or falling', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 300 });
    expect(batch(before, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1).instanceKeys).toEqual([]);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(2));
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 301,
      previousFrame: before,
    });
    const fallen = batch(after, OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1);
    expect(fallen.geometryKey).toBe(OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1);
    expect(fallen.materialKey).toBe(OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1);
    expect(fallen.instanceKeys.length).toBe(after.metrics.fallenLitterVoxels);
    expect(after.metrics.fallenLitterLeafCount).toBe(1);
    expect(after.metrics.leafVoxels).toBeGreaterThan(0);
    expect(batch(after, OAK_LEAF_VOXEL_BATCH_KEY_V1).instanceKeys.length)
      .toBe(after.metrics.leafVoxels);
    expect(after.snapshot.resources.some((resource) =>
      resource.key === OAK_FALLEN_LITTER_VOXEL_MATERIAL_KEY_V1)).toBe(true);
    expect(fallen.instanceKeys.every((key) => LITTER_KEY.test(key))).toBe(true);
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
