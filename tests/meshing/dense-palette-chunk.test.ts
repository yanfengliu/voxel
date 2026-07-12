import { describe, expect, it } from 'vitest';

import {
  DensePaletteChunk,
  MAX_DENSE_CHUNK_VOXELS,
} from '../../src/meshing/index.js';
import { MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1 } from '../../src/core/index.js';

describe('DensePaletteChunk', () => {
  it('copies constructor voxels and addresses local cells with x as the fastest axis', () => {
    const voxels = new Uint16Array([
      1, 2,
      3, 4,
      5, 6,
      7, 8,
    ]);
    const chunk = new DensePaletteChunk({
      origin: { x: -2, y: 3, z: 5 },
      size: { x: 2, y: 2, z: 2 },
      voxels,
    });

    voxels.fill(99);

    expect(chunk.volume).toBe(8);
    expect(chunk.getLocal(0, 0, 0)).toBe(1);
    expect(chunk.getLocal(1, 0, 0)).toBe(2);
    expect(chunk.getLocal(0, 0, 1)).toBe(3);
    expect(chunk.getLocal(0, 1, 0)).toBe(5);
    expect(Array.from(chunk.copyVoxels())).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('supports bounded mutation without exposing its owned storage', () => {
    const chunk = new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 1, z: 1 },
    });

    chunk.fill(4);
    chunk.setLocal(1, 0, 0, 9);
    const copy = chunk.copyVoxels();
    copy[0] = 99;

    expect(chunk.getLocal(0, 0, 0)).toBe(4);
    expect(chunk.getLocal(1, 0, 0)).toBe(9);
    expect(() => chunk.getLocal(2, 0, 0)).toThrow(/outside chunk/i);
    expect(() => chunk.setLocal(0, 0, 0, 65_536)).toThrow(/palette index/i);
  });

  it('rejects unbounded allocations and coordinates whose unit boundaries collapse in Float32', () => {
    expect(() => new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: { x: MAX_DENSE_CHUNK_VOXELS + 1, y: 1, z: 1 },
    })).toThrow(/volume/i);

    expect(() => new DensePaletteChunk({
      origin: { x: MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
    })).toThrow(/Float32 voxel range/i);

    expect(new DensePaletteChunk({
      origin: { x: MAX_EXACT_FLOAT32_VOXEL_COORDINATE_V1 - 1, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
    }).volume).toBe(1);
  });
});
