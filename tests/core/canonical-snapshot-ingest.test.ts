import { describe, expect, it } from 'vitest';

import { validateSnapshotForCanonicalIngestInternal } from '../../src/core/canonical-snapshot-ingest.js';
import { RenderWorld, type RenderSnapshotV1 } from '../../src/core/index.js';
import { readRenderWorldOwnershipMetricsForTesting } from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

function snapshotWithLatePositionMutation(): RenderSnapshotV1 {
  const snapshot = validSnapshot(1, 'epoch:getter-toctou');
  const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
  if (!geometry) throw new Error('Missing geometry fixture.');
  const bounds = geometry.bounds;
  Object.defineProperty(geometry, 'bounds', {
    configurable: true,
    enumerable: true,
    get() {
      geometry.positions[0] = Number.NaN;
      return bounds;
    },
  });
  return snapshot;
}

describe('canonical snapshot ingest', () => {
  it('revalidates normalized lanes after a late getter mutates an earlier typed array', () => {
    const direct = validateSnapshotForCanonicalIngestInternal(
      snapshotWithLatePositionMutation(),
    );
    expect(direct).toMatchObject({
      result: {
        ok: false,
        issue: {
          code: 'number.non-finite',
          path: 'resources[2].positions[0]',
        },
      },
      metrics: {
        copiedTypedArrayBytes: 0,
        copyOperations: 0,
      },
    });

    const world = new RenderWorld();
    expect(world.acceptSnapshot(snapshotWithLatePositionMutation())).toMatchObject({
      status: 'rejected',
      code: 'number.non-finite',
      path: 'resources[2].positions[0]',
    });
    expect(world.acceptedRevision).toBeNull();
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toMatchObject({
      snapshotCopiedTypedArrayBytes: 0,
      snapshotCopyOperations: 0,
      retainedTypedArrayBytes: 0,
    });
  });
});
