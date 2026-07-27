import { describe, expect, it } from 'vitest';

import {
  canonicalRiverfallSurfaceTopologyJsonV1,
  RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
  RIVERFALL_SURFACE_CELLS_V1,
  RIVERFALL_SURFACE_CELL_COUNT,
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
  RIVERFALL_SURFACE_TOPOLOGY_JSON_V1,
  type RiverfallSurfaceCellV1,
  type RiverfallSurfaceRegionV1,
} from './riverfall-surface-grid.js';

interface Rect {
  readonly minA: number;
  readonly maxA: number;
  readonly minB: number;
  readonly maxB: number;
}

const TARGETS: Readonly<Record<RiverfallSurfaceRegionV1, Rect>> = {
  river: { minA: -5, maxA: 5, minB: -32, maxB: 0 },
  lip: { minA: -5, maxA: 5, minB: 0, maxB: 1 },
  fall: { minA: -5, maxA: 5, minB: 4, maxB: 12 },
  pond: { minA: -16, maxA: 16, minB: 1, maxB: 27 },
  outflow: { minA: -4, maxA: 4, minB: 27, maxB: 31 },
};

function footprint(cell: RiverfallSurfaceCellV1): Rect {
  if (cell.region === 'fall') {
    return {
      minA: cell.baseTranslation[0] - cell.worldSize[0] / 2,
      maxA: cell.baseTranslation[0] + cell.worldSize[0] / 2,
      minB: cell.baseTranslation[1] - cell.worldSize[1] / 2,
      maxB: cell.baseTranslation[1] + cell.worldSize[1] / 2,
    };
  }
  return {
    minA: cell.baseTranslation[0] - cell.worldSize[0] / 2,
    maxA: cell.baseTranslation[0] + cell.worldSize[0] / 2,
    minB: cell.baseTranslation[2] - cell.worldSize[2] / 2,
    maxB: cell.baseTranslation[2] + cell.worldSize[2] / 2,
  };
}

function overlapArea(left: Rect, right: Rect): number {
  return Math.max(0, Math.min(left.maxA, right.maxA) - Math.max(left.minA, right.minA))
    * Math.max(0, Math.min(left.maxB, right.maxB) - Math.max(left.minB, right.minB));
}

describe('Riverfall Eulerian surface grid', () => {
  it('uses a bounded stable topology with the seam isolated to the lip', () => {
    expect(RIVERFALL_SURFACE_CELL_COUNT).toBe(321);
    expect(new Set(RIVERFALL_SURFACE_CELLS_V1.map(({ id }) => id)).size)
      .toBe(RIVERFALL_SURFACE_CELL_COUNT);
    expect(RIVERFALL_SURFACE_CELLS_V1.filter(
      ({ model }) => model === RIVERFALL_SURFACE_MODEL_ID,
    )).toHaveLength(316);
    expect(RIVERFALL_SURFACE_CELLS_V1.filter(
      ({ model }) => model === RIVERFALL_SURFACE_SEAM_MODEL_ID,
    )).toHaveLength(5);
    expect(RIVERFALL_SURFACE_CELLS_V1.filter(
      ({ model }) => model === RIVERFALL_SURFACE_SEAM_MODEL_ID,
    ).every(({ region }) => region === 'lip')).toBe(true);
  });

  it('uses one canonical base-normal offset in every region', () => {
    expect(RIVERFALL_SURFACE_BASE_NORMAL_OFFSET).toBe(0.05);
    const surfaceByRegion: Readonly<Record<
    RiverfallSurfaceRegionV1,
    readonly [axis: 1 | 2, coordinate: number]
    >> = {
      river: [1, 12],
      lip: [1, 12],
      fall: [2, 1],
      pond: [1, 4],
      outflow: [1, 4],
    };
    for (const cell of RIVERFALL_SURFACE_CELLS_V1) {
      const [axis, surface] = surfaceByRegion[cell.region];
      expect(
        cell.baseTranslation[axis] - surface,
        cell.id,
      ).toBeCloseTo(RIVERFALL_SURFACE_BASE_NORMAL_OFFSET, 12);
    }
  });

  it('serializes every topology field in one deterministic canonical order', () => {
    expect(canonicalRiverfallSurfaceTopologyJsonV1())
      .toBe(RIVERFALL_SURFACE_TOPOLOGY_JSON_V1);
    expect(canonicalRiverfallSurfaceTopologyJsonV1(
      [...RIVERFALL_SURFACE_CELLS_V1],
    )).toBe(RIVERFALL_SURFACE_TOPOLOGY_JSON_V1);
    const topology = JSON.parse(
      RIVERFALL_SURFACE_TOPOLOGY_JSON_V1,
    ) as readonly Record<string, unknown>[];
    expect(topology).toHaveLength(RIVERFALL_SURFACE_CELL_COUNT);
    expect(topology).toEqual(RIVERFALL_SURFACE_CELLS_V1.map(({
      id,
      region,
      model,
      baseTranslation,
      normal,
      quaternion,
      worldSize,
      flowDistance,
    }) => ({
      id,
      region,
      model,
      baseTranslation,
      normal,
      quaternion,
      worldSize,
      flowDistance,
    })));
    for (const cell of topology) {
      expect(Object.keys(cell)).toEqual([
        'id',
        'region',
        'model',
        'baseTranslation',
        'normal',
        'quaternion',
        'worldSize',
        'flowDistance',
      ]);
    }
  });

  it('assigns one bounded downstream coordinate through every visible reach', () => {
    const ranges = Object.fromEntries(
      (['river', 'lip', 'fall', 'pond', 'outflow'] as const).map(
        (region) => {
          const distances = RIVERFALL_SURFACE_CELLS_V1
            .filter((cell) => cell.region === region)
            .map((cell) => cell.flowDistance);
          return [region, [Math.min(...distances), Math.max(...distances)]];
        },
      ),
    );
    expect(ranges).toEqual({
      river: [1, 31],
      lip: [32.5, 32.5],
      fall: [34, 40],
      pond: [42, 66],
      outflow: [68, 70],
    });
  });

  it.each([
    ['river', 80],
    ['lip', 5],
    ['fall', 20],
    ['pond', 208],
    ['outflow', 8],
  ] as const)('tiles the complete %s footprint without a gap or overhang', (region, count) => {
    const cells = RIVERFALL_SURFACE_CELLS_V1.filter(
      (cell) => cell.region === region,
    );
    const target = TARGETS[region];
    const footprints = cells.map(footprint);
    expect(cells).toHaveLength(count);
    let area = 0;
    for (let index = 0; index < footprints.length; index += 1) {
      const candidate = footprints[index]!;
      expect(candidate.minA).toBeGreaterThanOrEqual(target.minA);
      expect(candidate.maxA).toBeLessThanOrEqual(target.maxA);
      expect(candidate.minB).toBeGreaterThanOrEqual(target.minB);
      expect(candidate.maxB).toBeLessThanOrEqual(target.maxB);
      area += (candidate.maxA - candidate.minA)
        * (candidate.maxB - candidate.minB);
      for (let other = index + 1; other < footprints.length; other += 1) {
        expect(overlapArea(candidate, footprints[other]!)).toBe(0);
      }
    }
    expect(area).toBe(
      (target.maxA - target.minA) * (target.maxB - target.minB),
    );
  });

  it('permits only bounded outward-normal motion with fixed footprints', () => {
    for (const cell of RIVERFALL_SURFACE_CELLS_V1) {
      expect(Math.hypot(...cell.normal)).toBe(1);
      expect(Math.hypot(...cell.quaternion)).toBeCloseTo(1, 12);
      if (cell.region === 'fall') {
        expect(cell.normal).toEqual([0, 0, 1]);
        expect(cell.worldSize).toEqual([2, 2, 1]);
      } else {
        expect(cell.normal).toEqual([0, 1, 0]);
      }
    }
  });
});
