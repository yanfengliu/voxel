import { describe, expect, it } from 'vitest';
import { Group } from 'three';

import {
  greedyOutput,
  prepare,
  stager,
  target,
} from './revision-atomic-staging-fixtures.js';

describe('revision-atomic presentation transaction', () => {
  it('retains the previous bundle until an explicit finalization', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.activate();
    first.lease.commit();
    const previous = first.lease.bundleInternal;
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:second', { x: 0, y: 0, z: 0 }, 2),
    );

    second.lease.activate();
    second.lease.publish();

    expect(second.lease.stateInternal).toBe('published');
    expect(atomic.displayedTargetInternal).toEqual(target(2));
    expect(root.children).toEqual([second.lease.bundleInternal.rootInternal]);
    expect(previous.isDisposedInternal).toBe(false);
    expect(atomic.metricsInternal().preparedTargets).toBe(1);

    expect(second.lease.finalize()).toEqual({
      status: 'committed',
      target: target(2),
      retirement: 'complete',
      pendingRetiredBundles: 0,
    });
    expect(second.lease.stateInternal).toBe('committed');
    expect(previous.isDisposedInternal).toBe(true);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
  });

  it('restores the previous displayed bundle when a published candidate aborts', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.activate();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:second', { x: 0, y: 0, z: 0 }, 2),
    );

    second.lease.activate();
    second.lease.publish();
    second.lease.abort();

    expect(second.lease.stateInternal).toBe('aborted');
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(first.lease.bundleInternal.isDisposedInternal).toBe(false);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
  });

  it('lets an older published lease finalize after a newer lease commits', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.activate();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:second', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.activate();
    second.lease.publish();
    const third = prepare(
      atomic,
      target(3),
      greedyOutput('chunk:third', { x: 0, y: 0, z: 0 }, 3),
    );

    third.lease.activate();
    third.lease.publish();
    third.lease.finalize();
    second.lease.finalize();

    expect(atomic.displayedTargetInternal).toEqual(target(3));
    expect(root.children).toEqual([third.lease.bundleInternal.rootInternal]);
    expect(first.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(third.lease.bundleInternal.isDisposedInternal).toBe(false);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
  });

  it('disposes a superseded published chain without leaking retained predecessors', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.activate();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:second', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.activate();
    second.lease.publish();
    const third = prepare(
      atomic,
      target(3),
      greedyOutput('chunk:third', { x: 0, y: 0, z: 0 }, 3),
    );
    third.lease.activate();
    third.lease.publish();
    third.lease.finalize();

    atomic.dispose();

    expect(root.children).toEqual([]);
    expect(first.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(third.lease.bundleInternal.isDisposedInternal).toBe(true);
    const metrics = atomic.metricsInternal();
    expect(metrics).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
      pendingRetiredBundles: 0,
    });
    // Live staging returning to zero only means something if it was ever
    // above it: the high-water proves the chain really staged and released.
    expect(metrics.peakCpuStagingBytes).toBeGreaterThan(0);
    expect(metrics.peakGpuStagingBytes).toBeGreaterThan(0);
  });

  it('does not roll back a published predecessor beneath an activated successor', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.activate();
    first.lease.commit();
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:second', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.activate();
    second.lease.publish();
    const third = prepare(
      atomic,
      target(3),
      greedyOutput('chunk:third', { x: 0, y: 0, z: 0 }, 3),
    );
    third.lease.activate();

    expect(() => second.lease.abort()).toThrow(/restoration remains/i);
    expect(second.lease.stateInternal).toBe('published');
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(false);
    expect(root.children).toEqual([third.lease.bundleInternal.rootInternal]);

    third.lease.abort();
    second.lease.abort();
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
  });
});
