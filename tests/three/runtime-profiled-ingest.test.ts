import { Vector2, type Camera, type Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { meshProfiledSnapshotChunksInternal } from '../../src/three/profiledChunkOracle.js';

interface ProfiledOracleModule {
  readonly meshProfiledSnapshotChunksInternal: typeof meshProfiledSnapshotChunksInternal;
}

const oracleCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/three/profiledChunkOracle.js', async (importOriginal) => {
  const actual = await importOriginal<ProfiledOracleModule>();
  return {
    ...actual,
    meshProfiledSnapshotChunksInternal: (
      ...args: Parameters<typeof actual.meshProfiledSnapshotChunksInternal>
    ) => {
      oracleCalls.count += 1;
      return actual.meshProfiledSnapshotChunksInternal(...args);
    },
  };
});

import {
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class ProfiledRuntimeRenderer implements RendererLike {
  private readonly size = new Vector2();
  private pixelRatio = 1;
  readonly domElement = { width: 0, height: 0 };
  readonly render = vi.fn<(scene: Scene, camera: Camera) => void>();
  readonly setSize = vi.fn((width: number, height: number) => { this.size.set(width, height); });
  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getSize = vi.fn((target: Vector2) => target.copy(this.size));
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly dispose = vi.fn();
}

function profiledSnapshot(revision: number) {
  const snapshot = validSnapshot(revision, 'epoch:profiled-once');
  const chunk = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...chunk.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  return snapshot;
}

describe('ThreeRenderRuntime profiled snapshot ingest', () => {
  it('meshes an accepted candidate once and never meshes a stale rejection', () => {
    oracleCalls.count = 0;
    const runtime = new ThreeRenderRuntime({
      renderer: new ProfiledRuntimeRenderer(),
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.acceptSnapshot(profiledSnapshot(1)).status).toBe('accepted');
    expect(oracleCalls.count).toBe(1);
    expect(runtime.acceptSnapshot(profiledSnapshot(1))).toMatchObject({
      status: 'rejected',
      code: 'snapshot.non-monotonic-revision',
    });
    expect(oracleCalls.count).toBe(1);
    expect(runtime.acceptSnapshot(profiledSnapshot(2)).status).toBe('accepted');
    expect(oracleCalls.count).toBe(2);
    runtime.dispose();
  });
});
