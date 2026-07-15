import { describe, expect, it } from 'vitest';

import { PresentationStagingTrackerInternal } from '../../src/three/presentationStagingMetrics.js';
import type { ThreePresentationSnapshot } from '../../src/three/runtimeTypes.js';

interface MeshBuffers {
  readonly shared: ArrayBuffer;
  readonly material?: ArrayBuffer;
  readonly extra?: ArrayBuffer;
}

function presentation(
  revision: number,
  buffers: MeshBuffers,
): ThreePresentationSnapshot {
  const mesh = {
    positions: new Float32Array(buffers.shared, 0, 1),
    normals: new Float32Array(buffers.shared, 4, 1),
    paletteIndices: new Uint16Array(buffers.shared, 8, 1),
    ...(buffers.material
      ? { materialIndices: new Uint16Array(buffers.material, 0, 1) }
      : {}),
    indices: new Uint32Array(buffers.extra ?? buffers.shared, 12, 1),
  };
  return {
    epoch: 'epoch:staging-metrics',
    revision,
    materials: [],
    geometries: [],
    batches: [],
    chunks: [{ precomputedMesh: mesh }],
  } as unknown as ThreePresentationSnapshot;
}

describe('PresentationStagingTrackerInternal', () => {
  it('deduplicates backing allocations, counts capacity, and includes material indices', () => {
    const tracker = new PresentationStagingTrackerInternal(() => []);
    const staged = presentation(1, {
      shared: new ArrayBuffer(128),
      material: new ArrayBuffer(24),
    });

    const first = tracker.retainInternal(staged);
    const second = tracker.retainInternal(staged);
    expect(tracker.metricsInternal()).toEqual({
      currentBytes: 152,
      peakBytes: 152,
    });

    first.releaseInternal();
    expect(tracker.metricsInternal().currentBytes).toBe(152);
    second.releaseInternal();
    expect(tracker.metricsInternal()).toEqual({
      currentBytes: 0,
      peakBytes: 152,
    });

    tracker.disposeInternal();
    expect(tracker.metricsInternal()).toEqual({
      currentBytes: 0,
      peakBytes: 152,
    });
  });

  it('excludes live committed buffers and remembers a committed ticket after replacement', () => {
    const shared = new ArrayBuffer(128);
    const committed = presentation(1, { shared });
    const staged = presentation(2, {
      shared,
      extra: new ArrayBuffer(64),
    });
    let liveCommitted: ThreePresentationSnapshot | null = committed;
    const tracker = new PresentationStagingTrackerInternal(() => [liveCommitted]);

    const committedTicket = tracker.retainInternal(committed);
    const stagedHold = tracker.retainInternal(staged);
    expect(tracker.metricsInternal()).toEqual({
      currentBytes: 64,
      peakBytes: 64,
    });

    liveCommitted = staged;
    tracker.markCommittedInternal(staged);
    expect(tracker.metricsInternal().currentBytes).toBe(0);

    liveCommitted = null;
    expect(tracker.metricsInternal().currentBytes).toBe(0);
    committedTicket.releaseInternal();
    stagedHold.releaseInternal();
  });
});
