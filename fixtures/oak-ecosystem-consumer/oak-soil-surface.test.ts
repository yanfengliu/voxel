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
  readonly componentMetricsByLevel: ReadonlyMap<number, readonly SurfaceComponentAudit[]>;
  readonly longestStraightRunsByLevel: ReadonlyMap<
    number,
    Readonly<{ horizontal: number; vertical: number }>
  >;
}

interface SurfaceComponentAudit {
  readonly area: number;
  readonly spanX: number;
  readonly spanZ: number;
  readonly diameterCells: number;
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
  const componentMetricsByLevel = new Map<number, readonly SurfaceComponentAudit[]>();
  for (const level of counts.keys()) {
    const seen = new Set<string>();
    const componentMetrics: SurfaceComponentAudit[] = [];
    for (let z = -20; z < 20; z += 1) {
      for (let x = -20; x < 20; x += 1) {
        const key = `${String(x)}:${String(z)}`;
        if (query(x, z) !== level || seen.has(key)) continue;
        const stack: [number, number][] = [[x, z]];
        const componentCells: [number, number][] = [];
        while (stack.length > 0) {
          const [visitX, visitZ] = stack.pop()!;
          const visitKey = `${String(visitX)}:${String(visitZ)}`;
          if (seen.has(visitKey)) continue;
          seen.add(visitKey);
          componentCells.push([visitX, visitZ]);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const nextX = visitX + dx;
            const nextZ = visitZ + dz;
            if (nextX < -20 || nextX >= 20 || nextZ < -20 || nextZ >= 20
              || query(nextX, nextZ) !== level) continue;
            stack.push([nextX, nextZ]);
          }
        }
        const componentXs = componentCells.map(([componentX]) => componentX);
        const componentZs = componentCells.map(([, componentZ]) => componentZ);
        let diameterCells = 0;
        for (let left = 0; left < componentCells.length; left += 1) {
          for (let right = left + 1; right < componentCells.length; right += 1) {
            diameterCells = Math.max(diameterCells, Math.hypot(
              componentCells[left]![0] - componentCells[right]![0],
              componentCells[left]![1] - componentCells[right]![1],
            ));
          }
        }
        componentMetrics.push({
          area: componentCells.length,
          spanX: Math.max(...componentXs) - Math.min(...componentXs) + 1,
          spanZ: Math.max(...componentZs) - Math.min(...componentZs) + 1,
          diameterCells,
        });
      }
    }
    componentMetrics.sort((left, right) => right.area - left.area);
    componentMetricsByLevel.set(level, componentMetrics);
    componentSizesByLevel.set(level, componentMetrics.map(({ area }) => area));
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
    componentMetricsByLevel,
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
  const components = [...audit.componentMetricsByLevel.values()].flat();
  const largestArea = Math.max(...components.map(({ area }) => area));
  if (largestArea > 220) {
    throw new Error(`Oak soil contains a ${String(largestArea)}-cell mesa component.`);
  }
  const longestSpan = Math.max(...components.flatMap(({ spanX, spanZ }) => [spanX, spanZ]));
  if (longestSpan > 24) {
    throw new Error(`Oak soil contains a component spanning ${String(longestSpan)} cells.`);
  }
  const widestDiameter = Math.max(...components.map(({ diameterCells }) => diameterCells));
  if (widestDiameter > 27) {
    throw new Error(`Oak soil contains a component ${String(widestDiameter)} cells in diameter.`);
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

function supersededWarpedDistance(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  scaleX: number,
  scaleZ: number,
  phase: number,
): number {
  const warpX = 1.25 * Math.sin((z + phase) * 0.22)
    + 0.45 * Math.sin((x - z + phase) * 0.17);
  const warpZ = 1.05 * Math.sin((x - phase) * 0.19)
    + 0.35 * Math.cos((x + z - phase) * 0.14);
  return Math.hypot((x - centerX + warpX) / scaleX, (z - centerZ + warpZ) / scaleZ);
}

function supersededConnectedShelfHeight(x: number, z: number): number {
  const mound = (centerX: number, centerZ: number, scaleX: number, scaleZ: number,
    phase: number): number => Math.max(
    -4,
    -Math.floor(supersededWarpedDistance(x, z, centerX, centerZ, scaleX, scaleZ, phase)),
  );
  const hollow = (centerX: number, centerZ: number, scaleX: number, scaleZ: number,
    phase: number): number => Math.min(
    0,
    -4 + Math.floor(supersededWarpedDistance(x, z, centerX, centerZ, scaleX, scaleZ, phase)),
  );
  let level = -2;
  level = Math.max(level, mound(-0.5, -0.5, 5, 4.4, 1));
  level = Math.max(level, mound(-14, -13, 4.5, 4, 7));
  level = Math.max(level, mound(14, 14, 4.5, 5, 13));
  level = Math.min(level, hollow(-12, 11, 4.5, 4.1, 23));
  level = Math.min(level, hollow(11, -13, 4.1, 4.6, 29));
  level = Math.min(level, hollow(18, 4, 3.2, 3.6, 35));
  const plateau = OAK_SOIL_SURFACE_COLLAR_PLATEAU_V1;
  const dx = x < plateau.minWorldVoxelX ? plateau.minWorldVoxelX - x
    : x > plateau.maxWorldVoxelX ? x - plateau.maxWorldVoxelX : 0;
  const dz = z < plateau.minWorldVoxelZ ? plateau.minWorldVoxelZ - z
    : z > plateau.maxWorldVoxelZ ? z - plateau.maxWorldVoxelZ : 0;
  level = Math.max(level, -Math.min(4, Math.ceil(Math.hypot(dx, dz))));
  if (dx === 0 && dz === 0) return 0;
  return level;
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
      .toEqual([[-4, 287], [-3, 320], [-2, 342], [-1, 326], [0, 325]]);
    expect(audit.maxAdjacentStep).toBe(1);
    expect(audit.isolatedColumns).toBe(0);
    expect([...audit.componentSizesByLevel].sort(([left], [right]) => left - right))
      .toEqual([
        [-4, [160, 127]],
        [-3, [160, 160]],
        [-2, [103, 93, 58, 46, 39, 3]],
        [-1, [194, 116, 9, 7]],
        [0, [212, 77, 36]],
      ]);
    expect([...audit.longestStraightRunsByLevel].sort(([left], [right]) => left - right))
      .toEqual([
        [-4, { horizontal: 14, vertical: 15 }],
        [-3, { horizontal: 17, vertical: 19 }],
        [-2, { horizontal: 17, vertical: 20 }],
        [-1, { horizontal: 20, vertical: 17 }],
        [0, { horizontal: 14, vertical: 17 }],
      ]);
    const components = [...audit.componentMetricsByLevel.values()].flat();
    expect(Math.max(...components.map(({ area }) => area))).toBe(212);
    expect(Math.max(...components.flatMap(({ spanX, spanZ }) => [spanX, spanZ]))).toBe(23);
    expect(Math.max(...components.map(({ diameterCells }) => diameterCells)))
      .toBeCloseTo(26.870057685088806, 12);
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
    expect(() => requireOrganicSurface(supersededConnectedShelfHeight))
      .toThrow(/540-cell mesa component/u);
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
      topBoundaryWorldVoxelY: 0,
      topLocalVoxelY: 39,
      topM: 0,
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
