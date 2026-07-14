import { describe, expect, it } from 'vitest';

import { validateAndCopySnapshotV1 } from '../../src/core/index.js';
import { createRendererLifecycleReferenceSnapshot } from '../../src/testing/index.js';

describe('createRendererLifecycleReferenceSnapshot', () => {
  it('builds a valid deterministic scene across all V1 presentation lanes', () => {
    const snapshot = createRendererLifecycleReferenceSnapshot({
      epoch: 'epoch:test',
      revision: 3,
      resourceRevision: 7,
    });

    const validation = validateAndCopySnapshotV1(snapshot);
    expect(
      validation.ok,
      validation.ok ? undefined : JSON.stringify(validation.issue),
    ).toBe(true);
    expect(snapshot.descriptor.epoch).toBe('epoch:test');
    expect(snapshot.revision).toBe(3);
    expect(snapshot.resources.map((resource) => resource.kind)).toEqual([
      'palette',
      'material',
      'geometry',
    ]);
    expect(snapshot.chunks).toHaveLength(1);
    expect(snapshot.batches).toHaveLength(1);
    expect(snapshot.resources.every((resource) => resource.revision === 7)).toBe(true);
  });

  it('returns allocation-independent typed arrays', () => {
    const first = createRendererLifecycleReferenceSnapshot({ revision: 1 });
    const second = createRendererLifecycleReferenceSnapshot({ revision: 1 });
    const firstGeometry = first.resources.find((resource) => resource.kind === 'geometry');
    const secondGeometry = second.resources.find((resource) => resource.kind === 'geometry');

    expect(first.chunks[0]!.voxels).not.toBe(second.chunks[0]!.voxels);
    expect(first.batches[0]!.matrices).not.toBe(second.batches[0]!.matrices);
    expect(firstGeometry?.kind).toBe('geometry');
    expect(secondGeometry?.kind).toBe('geometry');
    if (firstGeometry?.kind !== 'geometry' || secondGeometry?.kind !== 'geometry') {
      throw new Error('Reference geometry is missing.');
    }
    expect(firstGeometry.positions).not.toBe(secondGeometry.positions);
  });

  it('accepts an epoch at the core key-length bound', () => {
    const epoch = 'e'.repeat(256);

    expect(createRendererLifecycleReferenceSnapshot({ revision: 1, epoch })
      .descriptor.epoch).toBe(epoch);
  });

  it('accepts zero-valued revisions allowed by the core V1 contract', () => {
    const snapshot = createRendererLifecycleReferenceSnapshot({
      revision: 0,
      resourceRevision: 0,
    });

    expect(snapshot.revision).toBe(0);
    expect(snapshot.resources.every((resource) => resource.revision === 0)).toBe(true);
  });

  it.each([
    [{ revision: -1 }, 'revision'],
    [{ revision: 1.5 }, 'revision'],
    [{ revision: 1, resourceRevision: -1 }, 'resourceRevision'],
    [{ revision: 1, epoch: '' }, 'epoch'],
    [{ revision: 1, epoch: 'e'.repeat(257) }, 'epoch'],
  ] as const)('rejects invalid options %o', (options, expected) => {
    expect(() => createRendererLifecycleReferenceSnapshot(options)).toThrow(expected);
  });
});
