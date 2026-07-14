import { describe, expect, it } from 'vitest';

import {
  DensePaletteChunk,
  raycastDensePaletteChunks,
  type DensePaletteChunkLookup,
  type Int3,
} from '../../src/meshing/index.js';

interface TestWorld {
  readonly chunks: Map<string, DensePaletteChunk>;
  readonly getChunk: DensePaletteChunkLookup;
  set(worldX: number, worldY: number, worldZ: number, paletteIndex: number): void;
}

function key(x: number, y: number, z: number): string {
  return `${String(x)},${String(y)},${String(z)}`;
}

function createWorld(chunkSize: Int3): TestWorld {
  const chunks = new Map<string, DensePaletteChunk>();
  return {
    chunks,
    getChunk: (chunkX, chunkY, chunkZ) => chunks.get(key(chunkX, chunkY, chunkZ)),
    set: (worldX, worldY, worldZ, paletteIndex) => {
      const chunkX = Math.floor(worldX / chunkSize.x);
      const chunkY = Math.floor(worldY / chunkSize.y);
      const chunkZ = Math.floor(worldZ / chunkSize.z);
      const chunkKey = key(chunkX, chunkY, chunkZ);
      let chunk = chunks.get(chunkKey);
      if (!chunk) {
        chunk = new DensePaletteChunk({
          origin: {
            x: chunkX * chunkSize.x,
            y: chunkY * chunkSize.y,
            z: chunkZ * chunkSize.z,
          },
          size: chunkSize,
        });
        chunks.set(chunkKey, chunk);
      }
      chunk.setLocal(
        worldX - chunk.origin.x,
        worldY - chunk.origin.y,
        worldZ - chunk.origin.z,
        paletteIndex,
      );
    },
  };
}

const CHUNK_SIZE = { x: 2, y: 2, z: 2 } as const;

describe('raycastDensePaletteChunks', () => {
  it('returns an occupied starting cell at distance zero', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(0, 0, 0, 7);

    const hit = raycastDensePaletteChunks({
      origin: { x: 0.25, y: 0.5, z: 0.75 },
      direction: { x: 4, y: 0, z: 0 },
      maxDistance: 10,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit).toEqual({
      cell: { x: 0, y: 0, z: 0 },
      paletteIndex: 7,
      distance: 0,
      point: { x: 0.25, y: 0.5, z: 0.75 },
      entryNormal: { x: 0, y: 0, z: 0 },
      chunkCoordinate: { x: 0, y: 0, z: 0 },
      localCoordinate: { x: 0, y: 0, z: 0 },
    });
  });

  it('enters an occupied cell from outside and reports world-unit distance', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(0, 0, 0, 11);

    const hit = raycastDensePaletteChunks({
      origin: { x: -0.5, y: 0.25, z: 0.25 },
      direction: { x: 20, y: 0, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit).toEqual({
      cell: { x: 0, y: 0, z: 0 },
      paletteIndex: 11,
      distance: 0.5,
      point: { x: 0, y: 0.25, z: 0.25 },
      entryNormal: { x: -1, y: 0, z: 0 },
      chunkCoordinate: { x: 0, y: 0, z: 0 },
      localCoordinate: { x: 0, y: 0, z: 0 },
    });
  });

  it('returns null when the bounded ray crosses only empty or missing chunks', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(9, 0, 0, 3);

    expect(raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 3,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    })).toBeNull();
  });

  it('uses floor division for negative chunk and local coordinates', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(-3, -1, -5, 13);

    const hit = raycastDensePaletteChunks({
      origin: { x: -0.2, y: -0.25, z: -4.25 },
      direction: { x: -1, y: 0, z: 0 },
      maxDistance: 4,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: -3, y: -1, z: -5 });
    expect(hit?.chunkCoordinate).toEqual({ x: -2, y: -1, z: -3 });
    expect(hit?.localCoordinate).toEqual({ x: 1, y: 1, z: 1 });
    expect(hit?.entryNormal).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit?.distance).toBeCloseTo(1.8, 12);
    expect(hit?.point).toEqual({ x: -2, y: -0.25, z: -4.25 });
  });

  it('crosses a chunk seam without duplicating or skipping its first cell', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(2, 0, 0, 5);
    const lookups: string[] = [];

    const hit = raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: (x, y, z) => {
        lookups.push(key(x, y, z));
        return world.getChunk(x, y, z);
      },
    });

    expect(hit?.cell).toEqual({ x: 2, y: 0, z: 0 });
    expect(hit?.chunkCoordinate).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit?.localCoordinate).toEqual({ x: 0, y: 0, z: 0 });
    expect(hit?.distance).toBe(1.5);
    expect(lookups).toEqual(['0,0,0', '1,0,0']);
  });

  it('supports axis-aligned rays without stepping stationary axes', () => {
    const world = createWorld({ x: 3, y: 2, z: 4 });
    world.set(1, 3, -1, 17);

    const hit = raycastDensePaletteChunks({
      origin: { x: 1.25, y: -1.5, z: -0.25 },
      direction: { x: 0, y: 3, z: 0 },
      maxDistance: 6,
      chunkSize: { x: 3, y: 2, z: 4 },
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: 1, y: 3, z: -1 });
    expect(hit?.entryNormal).toEqual({ x: 0, y: -1, z: 0 });
    expect(hit?.distance).toBe(4.5);
    expect(hit?.point).toEqual({ x: 1.25, y: 3, z: -0.25 });
  });

  it('selects the direction-side cell when starting exactly on a boundary', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(0, 0, 0, 21);
    world.set(1, 1, 1, 22);

    const negative = raycastDensePaletteChunks({
      origin: { x: 1, y: 0.5, z: 0.5 },
      direction: { x: -1, y: 0, z: 0 },
      maxDistance: 1,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });
    const positiveCorner = raycastDensePaletteChunks({
      origin: { x: 1, y: 1, z: 1 },
      direction: { x: 1, y: 2, z: 3 },
      maxDistance: 1,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(negative?.cell).toEqual({ x: 0, y: 0, z: 0 });
    expect(negative?.distance).toBe(0);
    expect(negative?.entryNormal).toEqual({ x: 1, y: 0, z: 0 });
    expect(positiveCorner?.cell).toEqual({ x: 1, y: 1, z: 1 });
    expect(positiveCorner?.distance).toBe(0);
    expect(positiveCorner?.entryNormal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('uses the floor-side cell for an axis that remains on its boundary', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(0, 1, 0, 23);
    world.set(1, 1, 0, 24);

    const hit = raycastDensePaletteChunks({
      origin: { x: 1, y: 0.5, z: 0.5 },
      direction: { x: 0, y: 1, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: 1, y: 1, z: 0 });
    expect(hit?.paletteIndex).toBe(24);
  });

  it('steps all tied axes together and uses X/Y/Z priority for an ambiguous entry normal', () => {
    const world = createWorld(CHUNK_SIZE);
    // These two cells are touched only at their edge and must not win the hit.
    world.set(1, 0, 0, 30);
    world.set(0, 1, 0, 31);
    world.set(1, 1, 0, 32);

    const hit = raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 1, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: 1, y: 1, z: 0 });
    expect(hit?.paletteIndex).toBe(32);
    expect(hit?.distance).toBeCloseTo(Math.SQRT1_2, 12);
    expect(hit?.point.x).toBeCloseTo(1, 12);
    expect(hit?.point.y).toBeCloseTo(1, 12);
    expect(hit?.point.z).toBe(0.5);
    expect(hit?.entryNormal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('does not skip a side cell when boundary times are merely near-equal', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(1, 0, 0, 33);

    const hit = raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1 + 2 ** -50, y: 1, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: 1, y: 0, z: 0 });
    expect(hit?.paletteIndex).toBe(33);
    expect(hit?.entryNormal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('reports a point contained by the cell entered after near-equal crossings', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(1, 1, 0, 34);

    const hit = raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1 + 2 ** -50, y: 1, z: 0 },
      maxDistance: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    });

    expect(hit?.cell).toEqual({ x: 1, y: 1, z: 0 });
    expect(hit?.point.x).toBeGreaterThanOrEqual(1);
    expect(hit?.point.x).toBeLessThan(2);
    expect(hit?.point.y).toBeGreaterThanOrEqual(1);
    expect(hit?.point.y).toBeLessThan(2);
    expect(hit?.point.z).toBeGreaterThanOrEqual(0);
    expect(hit?.point.z).toBeLessThan(1);
    expect(hit?.entryNormal).toEqual({ x: 0, y: -1, z: 0 });
  });

  it('includes a hit exactly at maxDistance and excludes one beyond it', () => {
    const world = createWorld(CHUNK_SIZE);
    world.set(2, 0, 0, 41);
    const options = {
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    } as const;

    expect(raycastDensePaletteChunks({ ...options, maxDistance: 1.5 })?.cell)
      .toEqual({ x: 2, y: 0, z: 0 });
    expect(raycastDensePaletteChunks({ ...options, maxDistance: 1.499 }))
      .toBeNull();
  });

  it('validates finite geometry, nonzero direction, chunk dimensions, and budgets', () => {
    const base = {
      origin: { x: 0, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 1,
      chunkSize: CHUNK_SIZE,
      getChunk: () => undefined,
    } as const;

    expect(() => raycastDensePaletteChunks({
      ...base,
      origin: { x: Number.NaN, y: 0, z: 0 },
    })).toThrow(/origin\.x.*finite/i);
    expect(() => raycastDensePaletteChunks({
      ...base,
      direction: { x: 0, y: 0, z: 0 },
    })).toThrow(/direction.*nonzero/i);
    expect(() => raycastDensePaletteChunks({
      ...base,
      direction: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
    })).toThrow(/direction\.x.*finite/i);
    expect(() => raycastDensePaletteChunks({ ...base, maxDistance: 0 }))
      .toThrow(/maxDistance.*positive/i);
    expect(() => raycastDensePaletteChunks({
      ...base,
      maxDistance: Number.POSITIVE_INFINITY,
    })).toThrow(/maxDistance.*finite/i);
    expect(() => raycastDensePaletteChunks({
      ...base,
      chunkSize: { x: 2, y: 0, z: 2 },
    })).toThrow(/chunkSize\.y.*positive safe integer/i);
    expect(() => raycastDensePaletteChunks({ ...base, maxSteps: 0 }))
      .toThrow(/maxSteps.*positive safe integer/i);
    expect(() => raycastDensePaletteChunks({ ...base, maxSteps: 1.5 }))
      .toThrow(/maxSteps.*positive safe integer/i);

    const mismatchedChunk = new DensePaletteChunk({
      origin: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 },
    });
    expect(() => raycastDensePaletteChunks({
      ...base,
      getChunk: () => mismatchedChunk,
    })).toThrow(/does not match chunkSize and chunkCoordinate/i);
  });

  it('throws instead of returning a false miss when the traversal budget is exhausted', () => {
    const world = createWorld(CHUNK_SIZE);

    expect(() => raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 10,
      maxSteps: 2,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    })).toThrow(/step budget/i);

    expect(raycastDensePaletteChunks({
      origin: { x: 0.5, y: 0.5, z: 0.5 },
      direction: { x: 1, y: 0, z: 0 },
      maxDistance: 0.25,
      maxSteps: 1,
      chunkSize: CHUNK_SIZE,
      getChunk: world.getChunk,
    })).toBeNull();
  });

  it('returns equivalent values and lookup order across deterministic repeats', () => {
    const world = createWorld({ x: 3, y: 2, z: 4 });
    world.set(4, 3, -2, 51);
    const lookupRuns: string[][] = [];
    const run = () => {
      const lookups: string[] = [];
      lookupRuns.push(lookups);
      return raycastDensePaletteChunks({
        origin: { x: -2.25, y: -0.75, z: -1.25 },
        direction: { x: 5, y: 3, z: -0.5 },
        maxDistance: 12,
        chunkSize: { x: 3, y: 2, z: 4 },
        getChunk: (x, y, z) => {
          lookups.push(key(x, y, z));
          return world.getChunk(x, y, z);
        },
      });
    };

    const first = run();
    const second = run();

    expect(first).not.toBeNull();
    expect(second).toEqual(first);
    expect(lookupRuns[1]).toEqual(lookupRuns[0]);
  });
});
