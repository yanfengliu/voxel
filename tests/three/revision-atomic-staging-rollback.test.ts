import { describe, expect, it } from 'vitest';
import { Group } from 'three';

import { RevisionAtomicPresentationStagerInternal } from '../../src/three/revisionAtomicStaging.js';
import { greedyOutput, prepare, target } from './revision-atomic-staging-fixtures.js';

describe('revision-atomic scene-root rollback', () => {
  it('restores the displayed root when candidate attachment throws', () => {
    const root = new Group();
    let rejectRevisionTwo = true;
    const atomic = new RevisionAtomicPresentationStagerInternal({
      root,
      maxCpuStagingBytes: 2_000_000,
      maxGpuStagingBytes: 2_000_000,
      maxPreparedTargets: 2,
      mountInternal: {
        attach: (candidate) => {
          if (rejectRevisionTwo && candidate.name.endsWith(':2')) {
            rejectRevisionTwo = false;
            throw new Error('candidate attachment failed');
          }
          root.add(candidate);
        },
        detach: (candidate) => { root.remove(candidate); },
      },
    });
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2),
    );

    expect(() => second.lease.swap()).toThrow(/attachment failed/);
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(second.lease.stateInternal).toBe('aborted');
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
  });

  it('rolls back a candidate that becomes ineligible immediately before render', () => {
    const root = new Group();
    const atomic = new RevisionAtomicPresentationStagerInternal({
      root,
      maxCpuStagingBytes: 2_000_000,
      maxGpuStagingBytes: 2_000_000,
      maxPreparedTargets: 2,
    });
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.swap();
    second.port.setCurrent((expected) => ({
      ...expected,
      source: { ...expected.source, sourceRevision: expected.source.sourceRevision + 1 },
    }));

    expect(() => second.lease.validateForRender()).toThrow(/before render/i);
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(second.lease.stateInternal).toBe('aborted');
    expect(second.port.cancelSpy).not.toHaveBeenCalled();
    expect(atomic.displayedTargetInternal).toEqual(target(1));
  });

  it('does not publish a target that becomes ineligible before post-render commit', () => {
    const root = new Group();
    const atomic = new RevisionAtomicPresentationStagerInternal({
      root,
      maxCpuStagingBytes: 2_000_000,
      maxGpuStagingBytes: 2_000_000,
      maxPreparedTargets: 2,
    });
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.swap();
    second.port.setCurrent(() => null);

    expect(() => second.lease.commit()).toThrow(/post-render commit/i);
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(second.lease.stateInternal).toBe('aborted');
    expect(atomic.displayedTargetInternal).toEqual(target(1));
  });
});
