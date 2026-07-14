import { Matrix4, Vector2, type Camera, type Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';

import type { RenderDeltaV1 } from '../../src/core/index.js';
import {
  ThreeRenderRuntime,
  type RendererLike,
} from '../../src/three/ThreeRenderRuntime.js';
import { validSnapshot } from '../core/fixtures.js';

class PagedRuntimeRenderer implements RendererLike {
  private size = new Vector2();
  private pixelRatio = 1;
  readonly domElement = { width: 0, height: 0 };
  readonly render = vi.fn<(scene: Scene, camera: Camera) => void>();
  readonly setSize = vi.fn((width: number, height: number) => {
    this.size.set(width, height);
    this.domElement.width = width;
    this.domElement.height = height;
  });
  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getSize = vi.fn((target: Vector2) => target.copy(this.size));
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly dispose = vi.fn();
}

function matrix(x: number): number[] {
  return new Matrix4().makeTranslation(x, 0, 0).toArray();
}

describe('ThreeRenderRuntime paged delta presentation', () => {
  it('uploads only the directly patched instance range', () => {
    const renderer = new PagedRuntimeRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });
    const snapshot = validSnapshot(1, 'epoch:paged-runtime');
    const original = snapshot.batches[0]!;
    snapshot.batches[0] = {
      ...original,
      instanceKeys: ['instance:one', 'instance:two'],
      matrices: new Float32Array([...matrix(1), ...matrix(2)]),
      colors: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
    };
    expect(runtime.acceptSnapshot(snapshot).status).toBe('accepted');
    runtime.frame({ nowMs: 0, deltaMs: 0, frameIndex: 0 });
    const before = runtime.metrics();
    expect(before).toMatchObject({
      instancePresentationMatrixWrites: 2,
      instancePresentationColorWrites: 2,
      instancePresentationUpdateRanges: 1,
    });

    const delta: RenderDeltaV1 = {
      schemaVersion: 'voxel.render-delta/1',
      worldId: 'world:test',
      epoch: 'epoch:paged-runtime',
      baseRevision: 1,
      revision: 2,
      operations: [{
        op: 'patch-batch-instances',
        key: 'batch:triangle',
        incarnation: 1,
        revision: 2,
        removeInstanceKeys: [],
        upserts: {
          instanceKeys: ['instance:two'],
          matrices: new Float32Array(matrix(29)),
          colors: new Uint8Array([0, 0, 255, 255]),
        },
      }],
    };
    expect(runtime.acceptDelta(delta).status).toBe('accepted');
    runtime.frame({ nowMs: 16, deltaMs: 16, frameIndex: 1 });
    const after = runtime.metrics();

    expect(after.instancePresentationMatrixWrites - before.instancePresentationMatrixWrites)
      .toBe(1);
    expect(after.instancePresentationColorWrites - before.instancePresentationColorWrites)
      .toBe(1);
    expect(after.instancePresentationUpdateRanges - before.instancePresentationUpdateRanges)
      .toBe(1);
    expect(after.presentedRevision).toBe(2);
    runtime.dispose();
  });
});
