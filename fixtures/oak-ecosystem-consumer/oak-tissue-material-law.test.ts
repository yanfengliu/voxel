import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1, type OakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
} from './oak-tissue-union-routing.js';
import {
  buildOakTissueVoxelProjectionV1,
  type OakTissueLatticeCellV1,
  type OakTissueVoxelProjectionV1,
} from './oak-tissue-union-lattice.js';
import {
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1,
  OAK_TISSUE_VOXEL_PITCH_M_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';
import type { OakOrganSnapshotV1, OakRenderProjectionStateV1 } from './oak-types.js';

const TISSUE_BATCH_KEYS = new Set([
  OAK_LEAF_VOXEL_BATCH_KEY_V1,
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
  OAK_WOOD_VOXEL_BATCH_KEY_V1,
]);
const NEIGHBORS: readonly OakTissueLatticeCellV1[] = [
  [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],
];

interface PublicCube {
  readonly instanceKey: string;
  readonly ownerOrganKey: string;
  readonly cell: OakTissueLatticeCellV1;
  readonly matrix: Float32Array;
}

function parsePublicCube(instanceKey: string, matrix: Float32Array): PublicCube {
  const match = /^oak:(organ:\d+:\d+):union-voxel:(-?\d+):(-?\d+):(-?\d+)$/u.exec(instanceKey);
  if (!match) throw new Error(`Unexpected public oak tissue key '${instanceKey}'.`);
  return {
    instanceKey,
    ownerOrganKey: match[1]!,
    cell: [Number(match[2]), Number(match[3]), Number(match[4])],
    matrix,
  };
}

function publicCubes(frame: OakRenderFrameV1): readonly PublicCube[] {
  return frame.snapshot.batches.flatMap((batch) => {
    if (!TISSUE_BATCH_KEYS.has(batch.key)) return [];
    return batch.instanceKeys.map((key, slot) =>
      parsePublicCube(key, batch.matrices.slice(slot * 16, slot * 16 + 16)));
  });
}

function canonicalMatrix(cell: OakTissueLatticeCellV1): Float32Array {
  const [x, y, z] = oakTissueCellCenterM_V1(cell);
  return new Float32Array([
    OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
    0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
    0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
    x, y, z, 1,
  ]);
}

function canonicalIssues(cubes: readonly PublicCube[]): readonly string[] {
  const issues: string[] = [];
  const byCell = new Map<number, PublicCube>();
  for (const cube of cubes) {
    const id = oakTissueCellIdV1(cube.cell);
    if (byCell.has(id)) issues.push(`duplicate occupied cell ${cube.cell.join(':')}`);
    else byCell.set(id, cube);
    const expected = canonicalMatrix(cube.cell);
    if (cube.matrix.some((value, index) => !Object.is(value, expected[index]))) {
      issues.push(`noncanonical matrix ${cube.instanceKey}`);
    }
  }
  const halfPitch = Math.fround(Math.fround(OAK_TISSUE_VOXEL_PITCH_M_V1) * .5);
  for (const cube of cubes) {
    for (let axis = 0; axis < 3; axis += 1) {
      const neighborCell = [...cube.cell] as [number, number, number];
      neighborCell[axis] = neighborCell[axis]! + 1;
      const neighbor = byCell.get(oakTissueCellIdV1(neighborCell));
      if (!neighbor) continue;
      const offset = 12 + axis;
      const right = Math.fround(cube.matrix[offset]! + halfPitch);
      const left = Math.fround(neighbor.matrix[offset]! - halfPitch);
      if (!Object.is(right, left)) issues.push(`open or penetrating face ${cube.instanceKey}`);
    }
  }
  return issues;
}

function componentCount(
  cells: ReadonlyMap<number, { readonly cell: OakTissueLatticeCellV1 }>,
): number {
  const remaining = new Set(cells.keys());
  let components = 0;
  while (remaining.size > 0) {
    components += 1;
    const first = remaining.values().next().value as number;
    remaining.delete(first);
    const queue = [first];
    for (const queuedCellId of queue) {
      const coordinate = cells.get(queuedCellId)!.cell;
      for (const delta of NEIGHBORS) {
        const next: OakTissueLatticeCellV1 = [
          coordinate[0] + delta[0],
          coordinate[1] + delta[1],
          coordinate[2] + delta[2],
        ];
        const id = oakTissueCellIdV1(next);
        if (!remaining.delete(id)) continue;
        queue.push(id);
      }
    }
  }
  return components;
}

function sourceOwner(key: string | undefined): string | null {
  if (key === undefined) return null;
  return /^oak:(organ:\d+:\d+):/u.exec(key)?.[1] ?? null;
}

function portIssues(projection: OakTissueVoxelProjectionV1): readonly string[] {
  const issues: string[] = [];
  const pathIsContiguous = (path: readonly OakTissueLatticeCellV1[]): boolean =>
    path.every((cell, index) => index === 0 || NEIGHBORS.some((delta) =>
      cell[0] === path[index - 1]![0] + delta[0]
      && cell[1] === path[index - 1]![1] + delta[1]
      && cell[2] === path[index - 1]![2] + delta[2]));
  for (const port of projection.ports) {
    const junctionOwners = new Set([
      port.parentOrganKey,
      ...projection.ports
        .filter((candidate) => candidate.parentOrganKey === port.parentOrganKey)
        .map((candidate) => candidate.childOrganKey),
    ]);
    const parent = projection.materialCells.get(oakTissueCellIdV1(port.parentCell));
    const child = projection.materialCells.get(oakTissueCellIdV1(port.childCell));
    const distance = Math.abs(port.parentCell[0] - port.childCell[0])
      + Math.abs(port.parentCell[1] - port.childCell[1])
      + Math.abs(port.parentCell[2] - port.childCell[2]);
    if (parent?.ownerOrganKey !== port.parentOrganKey || child?.ownerOrganKey !== port.childOrganKey
      || distance !== 1) issues.push(`invalid port ownership ${port.childOrganKey}`);
    if (!port.parentPath.every((cell) =>
      projection.materialCells.get(oakTissueCellIdV1(cell))?.ownerOrganKey === port.parentOrganKey)) {
      issues.push(`broken parent path ${port.childOrganKey}`);
    }
    if (oakTissueCellIdV1(port.parentPath[0]!) !== oakTissueCellIdV1(port.parentCell)
      || !pathIsContiguous(port.parentPath)
      || sourceOwner(projection.materialCells.get(
        oakTissueCellIdV1(port.parentPath.at(-1)!),
      )?.sourceKey) !== port.parentOrganKey) {
      issues.push(`misanchored parent path ${port.childOrganKey}`);
    }
    if (!port.childPath.every((cell) =>
      projection.materialCells.get(oakTissueCellIdV1(cell))?.claimOrganKeys
        ?.includes(port.childOrganKey) === true)) {
      issues.push(`broken child claim path ${port.childOrganKey}`);
    }
    if (oakTissueCellIdV1(port.childPath[0]!) !== oakTissueCellIdV1(port.childCell)
      || !pathIsContiguous(port.childPath)) {
      issues.push(`misanchored child path ${port.childOrganKey}`);
    }
    const childEnd = projection.materialCells.get(oakTissueCellIdV1(port.childPath.at(-1)!));
    if (sourceOwner(childEnd?.sourceKey) !== port.childOrganKey) {
      issues.push(`child claim misses retained source ${port.childOrganKey}`);
    }
    for (const delta of NEIGHBORS) {
      const neighbor: OakTissueLatticeCellV1 = [
        port.childCell[0] + delta[0],
        port.childCell[1] + delta[1],
        port.childCell[2] + delta[2],
      ];
      const owner = projection.materialCells.get(oakTissueCellIdV1(neighbor))?.ownerOrganKey;
      if (owner !== undefined && !junctionOwners.has(owner)) {
        issues.push(`unrelated port contact ${port.childOrganKey} <> ${owner}`);
      }
    }
  }
  return issues;
}

function sourceClaimIssues(
  projection: OakTissueVoxelProjectionV1,
  organs: readonly OakOrganSnapshotV1[],
): readonly string[] {
  const issues: string[] = [];
  const organsByKey = new Map(organs.map((organ) => [organ.key, organ]));
  for (const assignment of projection.sourceAssignments.values()) {
    const cellId = oakTissueCellIdV1(assignment.cell);
    const material = projection.materialCells.get(cellId);
    if (material?.sourceKey !== assignment.sourceKey) {
      issues.push(`missing source ${assignment.sourceKey}`);
    }
    const sourceOrgan = organsByKey.get(assignment.ownerOrganKey);
    const proximalParentFusion = material !== undefined
      && sourceOrgan?.parentKey === material.ownerOrganKey
      && (assignment.sourceLocalCell[1] === 0 || assignment.sourceLocalCell[1] === 1);
    const declaredParentPath = projection.ports.some((port) =>
      port.parentOrganKey === material?.ownerOrganKey
      && port.parentPath.some((cell) => oakTissueCellIdV1(cell) === cellId));
    if (material?.ownerOrganKey !== assignment.ownerOrganKey && !proximalParentFusion) {
      issues.push(`reowned source ${assignment.sourceKey}`);
    } else if (material?.ownerOrganKey !== assignment.ownerOrganKey
      && (material?.role !== 'owner-path'
        || !material.claimOrganKeys?.includes(assignment.ownerOrganKey)
        || !declaredParentPath)) {
      issues.push(`undeclared fused source ${assignment.sourceKey}`);
    }
  }
  return issues;
}

function expectMaterialLaw(
  state: OakRenderProjectionStateV1,
  includeRoots: boolean,
  label: string,
): void {
  const projection = buildOakTissueVoxelProjectionV1(state, includeRoots);
  const frame = buildOakRenderFrameV1(state, includeRoots
    ? { rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' } }
    : {});
  const cubes = publicCubes(frame);
  const publicCells = new Map(cubes.map((cube) => [oakTissueCellIdV1(cube.cell), cube]));
  expect(cubes, label).toHaveLength(projection.materialCells.size);
  expect(canonicalIssues(cubes), label).toEqual([]);
  expect([...publicCells.keys()].sort((left, right) => left - right), label)
    .toEqual([...projection.materialCells.keys()].sort((left, right) => left - right));
  for (const [id, cube] of publicCells) {
    expect(cube.ownerOrganKey, `${label} ${cube.instanceKey}`)
      .toBe(projection.materialCells.get(id)?.ownerOrganKey);
  }
  expect(componentCount(publicCells), `${label} public`).toBe(1);
  expect(componentCount(projection.materialCells), label).toBe(1);
  expect(projection.sourceAssignments.size, label).toBe(projection.sourceVoxelCount);
  expect([...projection.materialCells.values()].flatMap((material) =>
    material.sourceKey === undefined ? [] : [material.sourceKey]).sort(), label)
    .toEqual([...projection.sourceAssignments.keys()].sort());
  expect(sourceClaimIssues(projection, state.organs), label).toEqual([]);
  expect(portIssues(projection), label).toEqual([]);
  expect(frame.metrics.skippedTooShortOrNonpositiveRadiusSegments, label).toBe(0);
  expect(frame.metrics.skippedJunctionConsumedSegments, label).toBe(0);
}

describe('oak visible voxel material law', () => {
  it('proves exact public cubes, one material union, retained sources and declared fused ports', () => {
    const simulation = createOakSimulationV1();
    let currentDay = 0;
    for (const day of [0, 3, 6, 13, 42, 82, 100, 210, 220, 239, 240]) {
      simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day - currentDay));
      currentDay = day;
      expectMaterialLaw(simulation.projection(), false, `day ${String(day)} surface`);
      expectMaterialLaw(simulation.projection(), true, `day ${String(day)} cutaway`);
    }
    for (const phase of [1, 7, 15, 31, 95, 191, 383]) {
      const breeze = createOakSimulationV1();
      breeze.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
      breeze.setPaused(true);
      breeze.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
      breeze.advanceHostTicks(phase);
      expectMaterialLaw(breeze.projection(), false, `day 100 breeze +${String(phase)}`);
    }
  }, 120_000);

  it('catches an ULP intrusion, duplicate occupancy and the old non-dyadic crack', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    const cubes = [...publicCubes(buildOakRenderFrameV1(simulation.projection()))];
    const matrix = cubes[0]!.matrix.slice();
    const floats = new Float32Array(1);
    const bits = new Uint32Array(floats.buffer);
    floats[0] = matrix[12]!;
    bits[0] = bits[0]! + (floats[0]! < 0 ? -1 : 1);
    matrix[12] = floats[0]!;
    expect(canonicalIssues([{ ...cubes[0]!, matrix }])).toEqual([
      expect.stringContaining('noncanonical matrix'),
    ]);
    expect(canonicalIssues([cubes[0]!, { ...cubes[0]!, instanceKey: 'duplicate' }]))
      .toContainEqual(expect.stringContaining('duplicate occupied cell'));

    const oldPitch = Math.fround(.0012);
    const oldRight = Math.fround(Math.fround(3 * .0012) + Math.fround(oldPitch * .5));
    const oldLeft = Math.fround(Math.fround(4 * .0012) - Math.fround(oldPitch * .5));
    expect(oldRight).not.toBe(oldLeft);
  });

  it('allows only direct-child proximal source fusion into a parent node', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const projection = buildOakTissueVoxelProjectionV1(simulation.projection(), false);
    const fused = [...projection.sourceAssignments.values()].filter((candidate) =>
      projection.materialCells.get(oakTissueCellIdV1(candidate.cell))?.ownerOrganKey
        !== candidate.ownerOrganKey);
    expect(fused).toHaveLength(8);
    expect(sourceClaimIssues(projection, simulation.snapshot().organs)).toEqual([]);
    const assignment = [...projection.sourceAssignments.values()][0]!;
    const id = oakTissueCellIdV1(assignment.cell);
    const material = projection.materialCells.get(id)!;
    const mutated = {
      ...projection,
      materialCells: new Map(projection.materialCells).set(id, {
        ...material,
        ownerOrganKey: 'organ:foreign:1',
      }),
    };
    expect(sourceClaimIssues(mutated, simulation.snapshot().organs)).toEqual([
      `reowned source ${assignment.sourceKey}`,
    ]);
    const fusedAssignment = fused[0]!;
    const distal = {
      ...projection,
      sourceAssignments: new Map(projection.sourceAssignments).set(fusedAssignment.sourceKey, {
        ...fusedAssignment,
        sourceLocalCell: [
          fusedAssignment.sourceLocalCell[0],
          2,
          fusedAssignment.sourceLocalCell[2],
        ] as const,
      }),
    };
    expect(sourceClaimIssues(distal, simulation.snapshot().organs)).toContain(
      `reowned source ${fusedAssignment.sourceKey}`,
    );
    const port = projection.ports[0]!;
    const brokenPath = {
      ...projection,
      ports: [{
        ...port,
        parentPath: [port.parentCell, [
          port.parentCell[0] + 2,
          port.parentCell[1],
          port.parentCell[2],
        ] as const],
      }, ...projection.ports.slice(1)],
    };
    expect(portIssues(brokenPath)).toContain(`misanchored parent path ${port.childOrganKey}`);
  });

  it('keeps the public cube geometry exactly voxel-shaped', () => {
    const frame = buildOakRenderFrameV1(createOakSimulationV1().projection());
    const geometry = frame.snapshot.resources.find(({ key }) => key === OAK_TISSUE_VOXEL_GEOMETRY_KEY_V1);
    if (geometry?.kind !== 'geometry') throw new Error('Missing oak tissue cube geometry.');
    expect(new Set([...geometry.positions])).toEqual(new Set([-.5, .5]));
    expect(geometry.indices).toHaveLength(36);
  });
});
