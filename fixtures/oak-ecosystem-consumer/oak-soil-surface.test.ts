import { describe, expect, it } from 'vitest';

import { buildOakSoilVoxelChunkV1, oakSoilVoxelLocalIndexV1 } from './oak-soil-voxel.js';
import {
  oakSoilSurfaceAtFineCellV1,
  oakSoilSurfaceAtWorldVoxelColumnV1,
  oakSoilSurfaceAtWorldXZV1,
  OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
  OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1,
  OAK_SOIL_SURFACE_TOP_BOUNDARY_LEVELS_V1,
  type OakSoilSurfaceSampleV1,
} from './oak-soil-surface.js';
import { createOakSimulationV1 } from './oak-simulation.js';

type HeightQuery = (x: number, z: number) => number;

interface SurfaceAudit {
  readonly levels: readonly number[];
  readonly counts: ReadonlyMap<number, number>;
  readonly maxAdjacentStep: number;
  readonly isolatedColumns: number;
  readonly componentSizesByLevel: ReadonlyMap<number, readonly number[]>;
  readonly longestStraightRunsByLevel: ReadonlyMap<
    number,
    Readonly<{ horizontal: number; vertical: number }>
  >;
}

function auditSurface(query: HeightQuery): SurfaceAudit {
  const counts = new Map<number, number>();
  let maxAdjacentStep = 0;
  let isolatedColumns = 0;
  for (let z = -20; z < 20; z += 1) {
    for (let x = -20; x < 20; x += 1) {
      const level = query(x, z);
      counts.set(level, (counts.get(level) ?? 0) + 1);
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
      let sameLevelNeighbors = 0;
      for (const [dx, dz] of neighbors) {
        const nextX = x + dx;
        const nextZ = z + dz;
        if (nextX < -20 || nextX >= 20 || nextZ < -20 || nextZ >= 20) continue;
        const nextLevel = query(nextX, nextZ);
        maxAdjacentStep = Math.max(maxAdjacentStep, Math.abs(level - nextLevel));
        sameLevelNeighbors += Number(nextLevel === level);
      }
      isolatedColumns += Number(sameLevelNeighbors === 0);
    }
  }
  const componentSizesByLevel = new Map<number, readonly number[]>();
  for (const level of counts.keys()) {
    const seen = new Set<string>();
    const componentSizes: number[] = [];
    for (let z = -20; z < 20; z += 1) {
      for (let x = -20; x < 20; x += 1) {
        const key = `${String(x)}:${String(z)}`;
        if (query(x, z) !== level || seen.has(key)) continue;
        const stack: [number, number][] = [[x, z]];
        let componentSize = 0;
        while (stack.length > 0) {
          const [visitX, visitZ] = stack.pop()!;
          const visitKey = `${String(visitX)}:${String(visitZ)}`;
          if (seen.has(visitKey)) continue;
          seen.add(visitKey);
          componentSize += 1;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nextX = visitX + dx;
            const nextZ = visitZ + dz;
            if (nextX < -20 || nextX >= 20 || nextZ < -20 || nextZ >= 20
              || query(nextX, nextZ) !== level) continue;
            stack.push([nextX, nextZ]);
          }
        }
        componentSizes.push(componentSize);
      }
    }
    componentSizesByLevel.set(level, componentSizes.sort((left, right) => right - left));
  }
  const longestStraightRunsByLevel = new Map<
    number,
    Readonly<{ horizontal: number; vertical: number }>
  >();
  for (const level of counts.keys()) {
    let horizontal = 0;
    let vertical = 0;
    for (let z = -20; z < 20; z += 1) {
      let run = 0;
      for (let x = -20; x < 20; x += 1) {
        run = query(x, z) === level ? run + 1 : 0;
        horizontal = Math.max(horizontal, run);
      }
    }
    for (let x = -20; x < 20; x += 1) {
      let run = 0;
      for (let z = -20; z < 20; z += 1) {
        run = query(x, z) === level ? run + 1 : 0;
        vertical = Math.max(vertical, run);
      }
    }
    longestStraightRunsByLevel.set(level, { horizontal, vertical });
  }
  return {
    levels: [...counts.keys()].sort((left, right) => left - right),
    counts,
    maxAdjacentStep,
    isolatedColumns,
    componentSizesByLevel,
    longestStraightRunsByLevel,
  };
}

function requireOrganicSurface(query: HeightQuery): SurfaceAudit {
  const audit = auditSurface(query);
  if (audit.levels.join(',') !== OAK_SOIL_SURFACE_TOP_BOUNDARY_LEVELS_V1.join(',')) {
    throw new Error('Oak soil surface must retain all five authored hummock elevations.');
  }
  if (audit.maxAdjacentStep > 1) throw new Error('Oak soil surface contains a cliff.');
  if (audit.isolatedColumns > 0) throw new Error('Oak soil surface contains an isolated spike or pit.');
  const longestStraightRun = Math.max(...[...audit.longestStraightRunsByLevel.values()]
    .flatMap(({ horizontal, vertical }) => [horizontal, vertical]));
  if (longestStraightRun > 20) {
    throw new Error(`Oak soil contains a straight terrace ${String(longestStraightRun)} cells long.`);
  }
  if ([...audit.counts.values()].some((count) => count < 80)) {
    throw new Error('Each oak soil hummock elevation must remain broad.');
  }
  if (Math.max(...audit.counts.values()) > 1_600 * 0.4) {
    throw new Error('No oak soil elevation may dominate two fifths of the surface.');
  }
  return audit;
}

function oldThreeBandHeight(x: number, z: number): number {
  const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
  if (x >= plateau.minWorldVoxelX && x <= plateau.maxWorldVoxelX
    && z >= plateau.minWorldVoxelZ && z <= plateau.maxWorldVoxelZ) return 0;
  const upperContour = -1.8
    + 1.4 * Math.sin((x + 4) * 0.19)
    + 0.5 * Math.sin((x - 2) * 0.47);
  const lowerContour = -12.5
    + 1.6 * Math.sin((x - 5) * 0.16)
    + 0.6 * Math.sin((x + 7) * 0.39);
  if (z < lowerContour) return -2;
  if (z < upperContour) return -1;
  return 0;
}

function supersededDrainageBandHeight(x: number, z: number): number {
  const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
  if (x >= plateau.minWorldVoxelX && x <= plateau.maxWorldVoxelX
    && z >= plateau.minWorldVoxelZ && z <= plateau.maxWorldVoxelZ) return 0;
  const centeredX = x + 0.5;
  const centeredZ = z + 0.5;
  const hummockLift = 14.3 / (1 + (centeredX / 6.5) ** 2 + (centeredZ / 10) ** 2)
    + 0.55 * Math.sin((x + 3) * 0.31)
    + 0.2 * Math.sin((x - 4) * 0.71);
  const drainageCoordinate = centeredZ + hummockLift;
  if (drainageCoordinate >= 8) return 0;
  if (drainageCoordinate >= 2) return -1;
  if (drainageCoordinate >= -4) return -2;
  if (drainageCoordinate >= -10) return -3;
  return -4;
}

function canonicalHeight(x: number, z: number): number {
  const sample = oakSoilSurfaceAtWorldVoxelColumnV1(x, z);
  if (sample === null) throw new Error('Canonical oak surface unexpectedly omitted an in-domain column.');
  return sample.topBoundaryWorldVoxelY;
}

describe('oak soil surface authority', () => {
  it('owns localized multi-hummock and swale relief, a level collar, and rejects banded controls', () => {
    const audit = requireOrganicSurface(canonicalHeight);
    expect([...audit.counts].sort(([left], [right]) => left - right))
      .toEqual([[-4, 158], [-3, 398], [-2, 568], [-1, 356], [0, 120]]);
    expect(audit.maxAdjacentStep).toBe(1);
    expect(audit.isolatedColumns).toBe(0);
    expect([...audit.componentSizesByLevel].sort(([left], [right]) => left - right))
      .toEqual([
        [-4, [65, 57, 36]],
        [-3, [238, 160]],
        [-2, [540, 13, 9, 6]],
        [-1, [152, 110, 94]],
        [0, [58, 36, 26]],
      ]);
    expect([...audit.longestStraightRunsByLevel].sort(([left], [right]) => left - right))
      .toEqual([
        [-4, { horizontal: 9, vertical: 9 }],
        [-3, { horizontal: 15, vertical: 15 }],
        [-2, { horizontal: 17, vertical: 17 }],
        [-1, { horizontal: 15, vertical: 14 }],
        [0, { horizontal: 9, vertical: 9 }],
      ]);
    expect(
      (Math.max(...audit.levels) - Math.min(...audit.levels))
      * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
    ).toBeGreaterThan(0.039);

    const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
    for (let z = plateau.minWorldVoxelZ; z <= plateau.maxWorldVoxelZ; z += 1) {
      for (let x = plateau.minWorldVoxelX; x <= plateau.maxWorldVoxelX; x += 1) {
        expect(canonicalHeight(x, z)).toBe(0);
      }
    }
    expect(() => requireOrganicSurface(() => 0)).toThrow(/five authored hummock/u);
    expect(() => requireOrganicSurface(oldThreeBandHeight)).toThrow(/five authored hummock/u);
    expect(() => requireOrganicSurface(supersededDrainageBandHeight))
      .toThrow(/straight terrace 40 cells/u);
  });

  it('maps world, coarse, and fine coordinates to the same retained visible top', () => {
    const coarse = oakSoilSurfaceAtWorldVoxelColumnV1(8, -16);
    const world = oakSoilSurfaceAtWorldXZV1(
      8.5 * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
      -15.5 * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
    );
    const fine = oakSoilSurfaceAtFineCellV1(42, -78);
    expect(coarse).toEqual(world);
    expect(fine).toEqual(coarse);
    expect(coarse).toMatchObject({
      worldVoxelX: 8,
      worldVoxelZ: -16,
      localX: 28,
      localZ: 4,
      topBoundaryWorldVoxelY: -4,
      topLocalVoxelY: 35,
      topM: -4 * OAK_SOIL_SURFACE_COARSE_PITCH_M_V1,
    } satisfies Partial<OakSoilSurfaceSampleV1>);
    expect(oakSoilSurfaceAtWorldXZV1(0.01, 0, {
      axis: 'x', planeM: 0, keep: 'less-than',
    })).toBeNull();
    expect(oakSoilSurfaceAtWorldXZV1(-0.01, 0, {
      axis: 'x', planeM: 0, keep: 'less-than',
    })).not.toBeNull();
    expect(oakSoilSurfaceAtWorldVoxelColumnV1(20, 0)).toBeNull();
  });

  it('fills exactly four coarse cells below every surface and raises a cut wall to each local top', () => {
    const projection = createOakSimulationV1().projection();
    const state = { ...projection, organs: [] };
    const surface = buildOakSoilVoxelChunkV1(state, { revision: 1 });
    for (let z = 0; z < 40; z += 1) {
      for (let x = 0; x < 40; x += 1) {
        const sample = oakSoilSurfaceAtWorldVoxelColumnV1(x - 20, z - 20)!;
        const occupied = Array.from({ length: 40 }, (_, y) => y)
          .filter((y) => surface.chunk.voxels[oakSoilVoxelLocalIndexV1(x, y, z)] !== 0);
        expect(occupied).toEqual([
          sample.topLocalVoxelY - 3,
          sample.topLocalVoxelY - 2,
          sample.topLocalVoxelY - 1,
          sample.topLocalVoxelY,
        ]);
      }
    }

    const cutaway = buildOakSoilVoxelChunkV1(state, {
      revision: 2,
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    for (let z = 0; z < 40; z += 1) {
      const sample = oakSoilSurfaceAtWorldVoxelColumnV1(-1, z - 20)!;
      const wall = Array.from({ length: 40 }, (_, y) => y)
        .filter((y) => cutaway.chunk.voxels[oakSoilVoxelLocalIndexV1(19, y, z)] !== 0);
      expect(wall).toEqual(Array.from({ length: sample.topLocalVoxelY + 1 }, (_, y) => y));
      expect(cutaway.chunk.voxels[oakSoilVoxelLocalIndexV1(20, sample.topLocalVoxelY, z)])
        .toBe(0);
    }
  });
});
