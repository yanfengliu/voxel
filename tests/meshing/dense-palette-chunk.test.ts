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

  /**
   * The chunk promises to own its storage, and a caller's own `slice` is not
   * a copy it can trust: a subclass returning itself would leave the chunk
   * sharing the caller's array, so later caller writes would rewrite chunk
   * contents and copyVoxels would hand that same array back out.
   */
  it('owns its storage even when the input array supplies a hostile slice', () => {
    class SelfSlicing extends Uint16Array {
      override slice(): this { return this; }
    }
    const hostile = new SelfSlicing(4);
    hostile.set([1, 2, 3, 4]);
    const chunk = new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 2, y: 2, z: 1 },
      voxels: hostile,
    });

    hostile.fill(99);

    expect(Array.from(chunk.copyVoxels())).toEqual([1, 2, 3, 4]);
    expect(chunk.copyVoxels()).not.toBe(hostile);
    expect(Object.getPrototypeOf(chunk.copyVoxels())).toBe(Uint16Array.prototype);
  });

  /**
   * `length` on a typed-array instance is a prototype getter, so an own
   * property shadows it. A subclass reporting the expected volume over a
   * shorter buffer once passed the volume check and left the tail cells
   * reading undefined for the life of the chunk — the copy measured the real
   * length while the check measured the claimed one.
   */
  it('rejects a voxel array whose reported length hides a shorter buffer', () => {
    const volume = 27;
    const short = new Uint16Array(volume - 5);
    Object.defineProperty(short, 'length', { value: volume, configurable: true });
    expect(short.length).toBe(volume);

    expect(() => new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 3, y: 3, z: 3 },
      voxels: short,
    })).toThrow(/does not match chunk volume/);
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
