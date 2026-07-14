import { describe, expect, it } from 'vitest';

import {
  renderSnapshotCopyBytes,
  renderSnapshotRetainedBytes,
} from '../../src/core/snapshot-copy.js';
import { validSnapshot } from './fixtures.js';

describe('snapshot ownership byte accounting', () => {
  it('deduplicates shared backing allocations while counting copied lanes', () => {
    const snapshot = validSnapshot();
    const geometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!geometry) throw new Error('Missing geometry fixture.');
    const shared = new Float32Array(geometry.positions.length + geometry.normals.length + 8);
    const positions = shared.subarray(0, geometry.positions.length);
    const normals = shared.subarray(
      geometry.positions.length,
      geometry.positions.length + geometry.normals.length,
    );
    snapshot.resources = snapshot.resources.map((resource) => resource === geometry
      ? { ...geometry, positions, normals }
      : resource);
    const sharedGeometry = snapshot.resources.find((resource) => resource.kind === 'geometry');
    if (!sharedGeometry) throw new Error('Missing shared geometry fixture.');

    const views = [
      sharedGeometry.positions,
      sharedGeometry.normals,
      sharedGeometry.uvs!,
      sharedGeometry.colors!,
      sharedGeometry.indices,
      snapshot.chunks[0]!.voxels,
      snapshot.batches[0]!.matrices,
      snapshot.batches[0]!.colors!,
    ];
    const uniqueBuffers = new Set(views.map((view) => view.buffer));
    const retainedBytes = [...uniqueBuffers]
      .reduce((total, buffer) => total + buffer.byteLength, 0);
    const copiedBytes = views.reduce((total, view) => total + view.byteLength, 0);

    expect(renderSnapshotRetainedBytes([snapshot, snapshot])).toBe(retainedBytes);
    expect(renderSnapshotCopyBytes(snapshot)).toBe(copiedBytes);
    expect(retainedBytes).toBeGreaterThan(copiedBytes);
  });
});
