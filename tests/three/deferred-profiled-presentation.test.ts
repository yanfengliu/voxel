import { describe, expect, it, vi } from 'vitest';

import type { meshProfiledSnapshotChunksInternal } from '../../src/three/profiledChunkOracle.js';

interface OracleModuleInternal {
  readonly meshProfiledSnapshotChunksInternal: typeof meshProfiledSnapshotChunksInternal;
}

const oracleCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/three/profiledChunkOracle.js', async (importOriginal) => {
  const actual = await importOriginal<OracleModuleInternal>();
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

import { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import {
  canonicalStateToThreeDeferredProfiledPresentationInternal,
  canonicalStateToThreePresentationInternal,
} from '../../src/three/snapshotAdapter.js';
import { validSnapshot } from '../core/fixtures.js';

function profiledState(): CanonicalRenderStateV1 {
  const snapshot = validSnapshot(1, 'epoch:deferred-profiled');
  const chunk = snapshot.chunks[0]!;
  snapshot.descriptor.chunkProfile = {
    layout: 'uniform-grid',
    size: { ...chunk.size },
    gridOrigin: { x: 0, y: 0, z: 0 },
    emptyPaletteIndex: 0,
    surfaceModel: 'opaque',
    missingNeighbor: 'empty',
  };
  const owned = validateAndCopySnapshotV1(snapshot);
  if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.path}`);
  return CanonicalRenderStateV1.fromSnapshot(owned.value);
}

describe('deferred profiled Three projection', () => {
  it('creates exact chunk shells without invoking the synchronous oracle', () => {
    oracleCalls.count = 0;
    const state = profiledState();
    const chunk = state.chunksViewInternal()[0]!;
    const presentation = canonicalStateToThreeDeferredProfiledPresentationInternal(
      state,
      [{
        key: chunk.key,
        dependencySignature: 'greedy:dependency:one',
        voxelOrigin: chunk.origin,
      }],
    );

    expect(oracleCalls.count).toBe(0);
    expect(presentation).toMatchObject({ epoch: state.epoch, revision: state.revision });
    expect(presentation.chunks).toHaveLength(1);
    expect(presentation.chunks[0]).toMatchObject({ key: chunk.key });
    expect(presentation.chunks[0]).not.toHaveProperty('voxelOrigin');
    expect(presentation.chunks[0]).not.toHaveProperty('precomputedMesh');
    expect(presentation.chunks[0]).not.toHaveProperty('sampleNeighbor');
    expect(presentation.chunks[0]!.version).toContain('worker@greedy:dependency:one');

    canonicalStateToThreePresentationInternal(state);
    expect(oracleCalls.count).toBe(1);
  });

  it('requires one matching shell identity for every profiled chunk', () => {
    const state = profiledState();
    const chunk = state.chunksViewInternal()[0]!;
    expect(() => canonicalStateToThreeDeferredProfiledPresentationInternal(state, []))
      .toThrow(/complete chunk lane/);
    expect(() => canonicalStateToThreeDeferredProfiledPresentationInternal(state, [{
      key: chunk.key,
      dependencySignature: 'greedy:dependency:one',
      voxelOrigin: { ...chunk.origin, x: chunk.origin.x + 1 },
    }])).toThrow(/does not match/);
  });

  it('rejects use for the unprofiled compatibility lane', () => {
    const snapshot = validSnapshot(1, 'epoch:unprofiled');
    const owned = validateAndCopySnapshotV1(snapshot);
    if (!owned.ok) throw new Error(`${owned.issue.code}: ${owned.issue.path}`);
    const state = CanonicalRenderStateV1.fromSnapshot(owned.value);
    expect(() => canonicalStateToThreeDeferredProfiledPresentationInternal(state, []))
      .toThrow(/uniform chunk profile/);
  });
});
