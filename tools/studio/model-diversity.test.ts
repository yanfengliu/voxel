import { describe, expect, it } from 'vitest';

import {
  compareStudioModelFingerprintsV1,
  fingerprintStudioModelV1,
  nearestStudioModelNeighborV1,
  rankStudioModelNeighborsV1,
  type StudioModelDiversityFingerprintV1,
} from './model-diversity.js';
import type { GenomeColorV1, StudioModelV1 } from './model.js';

const EMPTY = { r: 0, g: 0, b: 0 };
const RED = { r: 220, g: 40, b: 30 };
const BLUE = { r: 30, g: 80, b: 220 };

interface ModelFixtureOptionsV1 {
  readonly id?: string;
  readonly label?: string;
  readonly seed?: number;
  readonly size: readonly [number, number, number];
  readonly voxelSize?: number;
  readonly palette?: readonly GenomeColorV1[];
  readonly cells?: readonly (
    readonly [x: number, y: number, z: number, paletteIndex?: number]
  )[];
}

function modelFixture(options: ModelFixtureOptionsV1): StudioModelV1 {
  const voxels = new Array<number>(
    options.size[0] * options.size[1] * options.size[2],
  ).fill(0);
  for (const [x, y, z, paletteIndex = 1] of options.cells ?? []) {
    voxels[x + options.size[0] * (y + options.size[1] * z)] = paletteIndex;
  }
  return {
    schemaVersion: 'studio.voxel-model/1',
    id: options.id ?? 'test:model',
    label: options.label ?? 'Test model',
    seed: options.seed ?? 7,
    size: options.size,
    ...(options.voxelSize === undefined ? {} : { voxelSize: options.voxelSize }),
    palette: options.palette ?? [EMPTY, RED],
    voxels,
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

function allDistances(fingerprint: StudioModelDiversityFingerprintV1): number[] {
  const axes = compareStudioModelFingerprintsV1(fingerprint, fingerprint).axes;
  return [
    axes.topology,
    axes.silhouette,
    axes.scale,
    axes.proportion,
    axes.density,
    axes.exposedSurface,
    axes.connectedComponents,
    axes.horizontalSymmetry,
    axes.palette,
  ];
}

function reverseAscii(value: string): string {
  let reversed = '';
  for (let index = value.length - 1; index >= 0; index -= 1) reversed += value.charAt(index);
  return reversed;
}

describe('Studio model diversity fingerprints', () => {
  it('measures dimensions, density, surface, components, symmetry, and palette roles', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({
      size: [3, 2, 2],
      palette: [EMPTY, RED, BLUE],
      cells: [[0, 0, 0, 1], [1, 0, 0, 2]],
    }), {
      paletteRoles: ['empty', 'body', 'accent'],
    });

    expect(fingerprint.dimensions).toEqual({
      grid: [3, 2, 2],
      voxelSize: 1,
      world: [3, 2, 2],
      aspect: [1, 0.666667, 0.666667],
      occupiedBounds: {
        min: [0, 0, 0],
        maxExclusive: [2, 1, 1],
        size: [2, 1, 1],
      },
      occupiedWorld: [2, 1, 1],
      occupiedAspect: [1, 0.5, 0.5],
    });
    expect(fingerprint.occupiedVoxels).toBe(2);
    expect(fingerprint.density).toBe(0.166667);
    expect(fingerprint.exposedFaces).toBe(10);
    expect(fingerprint.exposedSurfaceRatio).toBe(0.833333);
    expect(fingerprint.connectedComponents).toEqual({
      count: 1,
      sizes: [2],
      largestShare: 1,
    });
    expect(fingerprint.horizontalSymmetry).toEqual({
      xMirror: 1,
      zMirror: 1,
      halfTurn: 1,
    });
    expect(fingerprint.palette).toEqual({
      declaredColorCount: 2,
      usedColorCount: 2,
      usage: [
        {
          paletteIndex: 1,
          role: 'body',
          color: RED,
          occupiedVoxels: 1,
          occupiedShare: 0.5,
        },
        {
          paletteIndex: 2,
          role: 'accent',
          color: BLUE,
          occupiedVoxels: 1,
          occupiedShare: 0.5,
        },
      ],
    });
  });

  it('finds six-connected islands and scores horizontal asymmetry from occupied cells', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({
      size: [4, 1, 3],
      cells: [[0, 0, 0], [1, 0, 0], [3, 0, 2]],
    }));

    expect(fingerprint.connectedComponents).toEqual({
      count: 2,
      sizes: [2, 1],
      largestShare: 0.666667,
    });
    expect(fingerprint.exposedFaces).toBe(16);
    expect(fingerprint.exposedSurfaceRatio).toBe(0.888889);
    expect(fingerprint.horizontalSymmetry).toEqual({
      xMirror: 0,
      zMirror: 0,
      halfTurn: 0.666667,
    });
  });

  it('normalizes all six silhouettes to fixed readable masks with opposite orientations', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({
      size: [3, 2, 2],
      cells: [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
    }));
    const views = [
      fingerprint.silhouettes.front,
      fingerprint.silhouettes.back,
      fingerprint.silhouettes.left,
      fingerprint.silhouettes.right,
      fingerprint.silhouettes.top,
      fingerprint.silhouettes.bottom,
    ];

    expect(views).toHaveLength(6);
    for (const view of views) {
      expect(view.width).toBe(16);
      expect(view.height).toBe(16);
      expect(view.rows).toHaveLength(16);
      expect(view.rows.every((row) => /^[.#]{16}$/.test(row))).toBe(true);
      expect(view.filledCells).toBeGreaterThan(0);
    }
    expect(fingerprint.silhouettes.back.rows).toEqual(
      fingerprint.silhouettes.front.rows.map(reverseAscii),
    );
    expect(fingerprint.silhouettes.right.rows).toEqual(
      fingerprint.silhouettes.left.rows.map(reverseAscii),
    );
    expect(fingerprint.silhouettes.bottom.rows).toEqual(
      [...fingerprint.silhouettes.top.rows].reverse(),
    );
  });

  it('defines the empty model without NaN, phantom components, or phantom silhouettes', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({ size: [2, 3, 4] }));
    const views = [
      fingerprint.silhouettes.front,
      fingerprint.silhouettes.back,
      fingerprint.silhouettes.left,
      fingerprint.silhouettes.right,
      fingerprint.silhouettes.top,
      fingerprint.silhouettes.bottom,
    ];

    expect(fingerprint.occupiedVoxels).toBe(0);
    expect(fingerprint.density).toBe(0);
    expect(fingerprint.exposedSurfaceRatio).toBe(0);
    expect(fingerprint.connectedComponents).toEqual({
      count: 0,
      sizes: [],
      largestShare: 0,
    });
    expect(fingerprint.horizontalSymmetry).toEqual({
      xMirror: 1,
      zMirror: 1,
      halfTurn: 1,
    });
    expect(views.every(
      (view) => view.filledCells === 0 && view.rows.every((row) => row === '.'.repeat(16)),
    )).toBe(true);
  });

  it('keeps topology independent from identity, padding, translation, palette, seed, and scale', () => {
    const compact = fingerprintStudioModelV1(modelFixture({
      id: 'test:compact',
      seed: 1,
      size: [2, 2, 1],
      cells: [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
    }));
    const padded = fingerprintStudioModelV1(modelFixture({
      id: 'test:padded',
      label: 'Renamed',
      seed: 999,
      size: [5, 4, 3],
      voxelSize: 2,
      palette: [EMPTY, BLUE],
      cells: [[2, 1, 1], [2, 2, 1], [3, 1, 1]],
    }));

    expect(padded.topologyHash).toBe(compact.topologyHash);
    expect(padded.renderHash).not.toBe(compact.renderHash);
    expect(compact.topologyHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(compact.renderHash).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });

  it('does not count empty grid padding as model scale contrast', () => {
    const compact = fingerprintStudioModelV1(modelFixture({
      id: 'test:compact-scale',
      size: [2, 2, 1],
      cells: [[0, 0, 0], [0, 1, 0], [1, 0, 0]],
    }));
    const padded = fingerprintStudioModelV1(modelFixture({
      id: 'test:padded-scale',
      size: [7, 6, 5],
      cells: [[3, 2, 2], [3, 3, 2], [4, 2, 2]],
    }));

    expect(compareStudioModelFingerprintsV1(compact, padded).axes.scale).toBe(0);
  });

  it('pins hash semantics and excludes only identity and authored seed from render content', () => {
    const original = modelFixture({
      id: 'test:hash',
      label: 'Original',
      seed: 4,
      size: [2, 1, 1],
      palette: [EMPTY, RED],
      cells: [[0, 0, 0]],
    });
    const renamed = { ...original, id: 'test:renamed', label: 'Renamed', seed: 88 };
    const recolored = { ...renamed, palette: [EMPTY, BLUE] };
    const first = fingerprintStudioModelV1(original);
    const second = fingerprintStudioModelV1(renamed);
    const third = fingerprintStudioModelV1(recolored);

    expect(first.topologyHash).toBe('fnv1a64:b9db83e1794a60d4');
    expect(first.renderHash).toBe('fnv1a64:e04d8a576a07aaf6');
    expect(second.topologyHash).toBe(first.topologyHash);
    expect(second.renderHash).toBe(first.renderHash);
    expect(third.topologyHash).toBe(first.topologyHash);
    expect(third.renderHash).not.toBe(first.renderHash);
  });

  it('rejects invalid models and mismatched role names with actionable diagnostics', () => {
    const invalid = {
      ...modelFixture({ size: [1, 1, 1], cells: [[0, 0, 0]] }),
      voxels: [],
    } as unknown as StudioModelV1;
    expect(() => fingerprintStudioModelV1(invalid)).toThrow(
      "Cannot fingerprint Studio model 'test:model': $.voxels Expected 1 entries "
      + 'for the declared size; found 0.',
    );
    expect(() => fingerprintStudioModelV1(
      modelFixture({ size: [1, 1, 1], cells: [[0, 0, 0]] }),
      { paletteRoles: ['empty'] },
    )).toThrow(
      "Cannot fingerprint Studio model 'test:model': paletteRoles must contain "
      + '2 entries including slot 0; found 1.',
    );
  });

  it('returns structured-clone-safe fingerprints', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({
      size: [2, 2, 2],
      cells: [[0, 0, 0], [1, 1, 1]],
    }));
    expect(structuredClone(fingerprint)).toEqual(fingerprint);
    expect(JSON.parse(JSON.stringify(fingerprint))).toEqual(fingerprint);
  });
});

describe('Studio model diversity comparisons', () => {
  it('returns zero on every raw axis for identical fingerprints', () => {
    const fingerprint = fingerprintStudioModelV1(modelFixture({
      size: [2, 2, 2],
      cells: [[0, 0, 0], [1, 1, 1]],
    }));

    expect(allDistances(fingerprint)).toEqual(new Array<number>(9).fill(0));
    expect(compareStudioModelFingerprintsV1(
      fingerprint,
      fingerprint,
    ).aggregateDistance).toBe(0);
  });

  it('keeps palette-only and scale-only contrast on their independent raw axes', () => {
    const base = modelFixture({
      id: 'test:base',
      size: [2, 1, 1],
      cells: [[0, 0, 0]],
    });
    const palette = { ...base, id: 'test:palette', palette: [EMPTY, BLUE] };
    const scale = { ...base, id: 'test:scale', voxelSize: 2 };
    const baseFingerprint = fingerprintStudioModelV1(base);
    const paletteComparison = compareStudioModelFingerprintsV1(
      baseFingerprint,
      fingerprintStudioModelV1(palette),
    );
    const scaleComparison = compareStudioModelFingerprintsV1(
      baseFingerprint,
      fingerprintStudioModelV1(scale),
    );

    expect(paletteComparison.axes).toEqual({
      topology: 0,
      silhouette: 0,
      scale: 0,
      proportion: 0,
      density: 0,
      exposedSurface: 0,
      connectedComponents: 0,
      horizontalSymmetry: 0,
      palette: 1,
    });
    expect(scaleComparison.axes).toEqual({
      topology: 0,
      silhouette: 0,
      scale: 0.5,
      proportion: 0,
      density: 0,
      exposedSurface: 0,
      connectedComponents: 0,
      horizontalSymmetry: 0,
      palette: 0,
    });
  });

  it('bounds every distance and preserves comparison data through structured clone', () => {
    const first = fingerprintStudioModelV1(modelFixture({
      id: 'test:first',
      size: [4, 3, 2],
      cells: [[0, 0, 0], [1, 0, 0], [3, 2, 1]],
    }));
    const second = fingerprintStudioModelV1(modelFixture({
      id: 'test:second',
      size: [2, 4, 3],
      voxelSize: 0.25,
      palette: [EMPTY, BLUE],
      cells: [[0, 0, 0], [0, 1, 0], [0, 2, 0], [1, 3, 2]],
    }));
    const comparison = compareStudioModelFingerprintsV1(first, second);

    expect(Object.values(comparison.axes).every(
      (distance) => distance >= 0 && distance <= 1,
    )).toBe(true);
    expect(comparison.aggregateDistance).toBeGreaterThan(0);
    expect(comparison.aggregateDistance).toBeLessThanOrEqual(1);
    expect(structuredClone(comparison)).toEqual(comparison);
  });

  it('clamps palette distance after stable-share rounding', () => {
    const left = fingerprintStudioModelV1(modelFixture({
      id: 'test:left-palette-rounding',
      size: [1, 1, 1],
      cells: [[0, 0, 0]],
    }));
    const right = fingerprintStudioModelV1(modelFixture({
      id: 'test:right-palette-rounding',
      size: [1, 1, 1],
      palette: [EMPTY, BLUE],
      cells: [[0, 0, 0]],
    }));
    const inflated = {
      ...left,
      palette: {
        ...left.palette,
        usage: left.palette.usage.map((usage) => ({
          ...usage,
          occupiedShare: usage.occupiedShare + 0.000001,
        })),
      },
    };

    expect(compareStudioModelFingerprintsV1(inflated, right).axes.palette).toBe(1);
  });

  it('ranks nearest neighbors deterministically and names an empty candidate set', () => {
    const target = fingerprintStudioModelV1(modelFixture({
      id: 'test:target',
      size: [1, 1, 1],
      cells: [[0, 0, 0]],
    }));
    const candidateB = fingerprintStudioModelV1(modelFixture({
      id: 'test:b',
      size: [1, 1, 1],
      cells: [[0, 0, 0]],
    }));
    const candidateA = fingerprintStudioModelV1(modelFixture({
      id: 'test:a',
      size: [1, 1, 1],
      cells: [[0, 0, 0]],
    }));

    expect(rankStudioModelNeighborsV1(target, [candidateB, candidateA]).map(
      (neighbor) => neighbor.modelId,
    )).toEqual(['test:a', 'test:b']);
    expect(nearestStudioModelNeighborV1(target, [candidateB, candidateA]).modelId)
      .toBe('test:a');
    expect(() => nearestStudioModelNeighborV1(target, [])).toThrow(
      "Cannot find a nearest neighbor for Studio model 'test:target': "
      + 'provide at least one candidate fingerprint.',
    );
  });
});
