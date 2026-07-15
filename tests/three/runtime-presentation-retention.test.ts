import { describe, expect, it } from 'vitest';

import type { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { RuntimePresentationRetentionInternal } from '../../src/three/runtimePresentationRetention.js';
import type { ThreePresentationSnapshot } from '../../src/three/runtimeTypes.js';

function canonicalState(): CanonicalRenderStateV1 {
  return {} as CanonicalRenderStateV1;
}

function presentation(revision: number, bytes: number): ThreePresentationSnapshot {
  const buffer = new ArrayBuffer(bytes);
  const mesh = {
    positions: new Float32Array(buffer, 0, 1),
    normals: new Float32Array(buffer, 4, 1),
    paletteIndices: new Uint16Array(buffer, 8, 1),
    indices: new Uint32Array(buffer, 12, 1),
  };
  return {
    epoch: 'epoch:retention',
    revision,
    materials: [],
    geometries: [],
    batches: [],
    chunks: [{ precomputedMesh: mesh }],
  } as unknown as ThreePresentationSnapshot;
}

describe('RuntimePresentationRetentionInternal', () => {
  it('preserves exact canonical identity and replacement overlap accounting', () => {
    const firstState = canonicalState();
    const secondState = canonicalState();
    let canonicalPresented: CanonicalRenderStateV1 | null = null;
    const retention = new RuntimePresentationRetentionInternal(
      () => canonicalPresented,
    );
    const first = presentation(1, 64);
    const second = presentation(2, 96);
    retention.rememberInternal(firstState, first);
    retention.rememberInternal(secondState, second);
    retention.setPendingInternal(first);

    const candidate = retention.retainCandidateInternal(second);
    expect(retention.metricsInternal()).toEqual({
      currentBytes: 160,
      peakBytes: 160,
    });

    canonicalPresented = firstState;
    retention.markCommittedInternal(first);
    retention.setPresentedInternal(first);
    retention.setPendingInternal(second);
    candidate.releaseInternal();
    expect(retention.metricsInternal()).toEqual({
      currentBytes: 96,
      peakBytes: 160,
    });
    expect(retention.resolveInternal(firstState, 'pending')).toBe(first);
    expect(retention.resolveInternal(canonicalState(), 'pending')).toBe(second);
    expect(retention.resolveInternal(canonicalState(), 'presented')).toBe(first);
  });

  it('owns host holds idempotently and clears current bytes while preserving peak', () => {
    const retention = new RuntimePresentationRetentionInternal(() => null);
    const pending = presentation(1, 80);
    const owner = {};
    retention.setPendingInternal(pending);
    retention.retainHostFrameInternal(owner, pending);
    expect(retention.metricsInternal()).toEqual({ currentBytes: 80, peakBytes: 80 });
    expect(() => retention.retainHostFrameInternal(owner, pending)).toThrow(/already retained/);

    retention.releaseHostFrameInternal(owner);
    retention.releaseHostFrameInternal(owner);
    expect(retention.metricsInternal().currentBytes).toBe(80);
    retention.disposeInternal();
    expect(retention.metricsInternal()).toEqual({ currentBytes: 0, peakBytes: 80 });
    expect(retention.pendingInternal).toBeNull();
    expect(retention.presentedInternal).toBeNull();
  });
});
