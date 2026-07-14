import { describe, expect, it, vi } from 'vitest';
import { Group, type Mesh } from 'three';

import { RevisionAtomicPresentationStagerInternal } from '../../src/three/revisionAtomicStaging.js';
import {
  greedyOutput,
  groupPort,
  prepare,
  preparedGroup,
  presentation,
  profiledRequirement,
  stager,
  target,
} from './revision-atomic-staging-fixtures.js';

describe('revision-atomic Three presentation staging', () => {
  it('builds the selected greedy output off-scene and retains the old bundle until commit', () => {
    const root = new Group();
    const atomic = stager(root);
    const firstOutput = greedyOutput();
    const first = prepare(atomic, target(1), firstOutput);

    expect(first.lease.bundleInternal.rootInternal.parent).toBeNull();
    expect(root.children).toHaveLength(0);
    first.lease.swap();
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    first.lease.commit();

    const secondOutput = greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2);
    const second = prepare(atomic, target(2), secondOutput);
    const previous = first.lease.bundleInternal;
    expect(root.children).toEqual([previous.rootInternal]);
    expect(previous.isDisposedInternal).toBe(false);

    second.lease.swap();
    expect(root.children).toEqual([second.lease.bundleInternal.rootInternal]);
    expect(previous.isDisposedInternal).toBe(false);
    const mesh = second.lease.bundleInternal.rootInternal.children[0] as Mesh;
    expect(mesh.geometry.index?.count).toBe(secondOutput.counts.indexCount);
    expect(mesh.userData.faceCount).toBe(secondOutput.counts.exposedUnitFaceCount);
    expect(second.port.commitSpy).toHaveBeenCalledOnce();

    second.lease.commit();
    expect(previous.isDisposedInternal).toBe(true);
    expect(atomic.displayedTargetInternal).toEqual(target(2));
    expect(atomic.metricsInternal()).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
    });
  });

  it('restores the retained displayed bundle when rendering the candidate fails', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const second = prepare(atomic, target(2), greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2));

    second.lease.swap();
    expect(root.children).toEqual([second.lease.bundleInternal.rootInternal]);
    second.lease.abort();

    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(first.lease.bundleInternal.isDisposedInternal).toBe(false);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
  });

  it('fails closed on an exact eligibility mismatch before scheduler commit or scene swap', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const second = prepare(atomic, target(2), greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2));
    second.port.setCurrent((expected) => ({
      ...expected,
      source: { ...expected.source, sourceRevision: expected.source.sourceRevision + 1 },
    }));

    expect(() => second.lease.swap()).toThrow(/eligibility/i);
    expect(second.port.commitSpy).not.toHaveBeenCalled();
    expect(second.port.cancelSpy).toHaveBeenCalledOnce();
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(second.lease.stateInternal).toBe('aborted');
  });

  it('leaves the displayed root untouched when one scheduler group cannot commit', () => {
    const root = new Group();
    const atomic = stager(root);
    const first = prepare(atomic, target(1), greedyOutput('chunk:first'));
    first.lease.swap();
    first.lease.commit();
    const requested = target(2);
    const a = greedyOutput('chunk:a', { x: 0, y: 0, z: 0 }, 2);
    const b = greedyOutput('chunk:b', { x: 1, y: 0, z: 0 }, 2);
    const aPort = groupPort(preparedGroup(requested, a, 'group:a'));
    const bPort = groupPort(preparedGroup(requested, b, 'group:b', 2));
    bPort.setCommit({
      status: 'terminal',
      outcome: {
        groupId: 'group:b',
        status: 'stale',
        code: 'stale-commit',
        logicalTick: 2,
      },
    });
    const candidatePresentation = presentation(2, a);
    const lease = atomic.prepare({
      target: requested,
      presentation: {
        ...candidatePresentation,
        chunks: [
          candidatePresentation.chunks[0]!,
          presentation(2, b).chunks[0]!,
        ],
      },
      groups: [aPort, bPort],
      profiledChunks: [profiledRequirement(a), profiledRequirement(b)],
      targetIsCurrent: () => true,
    });

    expect(() => lease.swap()).toThrow(/commit/i);
    expect(aPort.commitSpy).toHaveBeenCalledOnce();
    expect(bPort.commitSpy).toHaveBeenCalledOnce();
    expect(aPort.cancelSpy).not.toHaveBeenCalled();
    expect(bPort.cancelSpy).toHaveBeenCalledOnce();
    expect(root.children).toEqual([first.lease.bundleInternal.rootInternal]);
    expect(lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(lease.stateInternal).toBe('aborted');
    expect(atomic.displayedTargetInternal).toEqual(target(1));
  });

  it('publishes a truthful committed outcome while retryable old-resource retirement is pending', () => {
    const atomic = stager();
    const first = prepare(atomic, target(1), greedyOutput());
    first.lease.swap();
    first.lease.commit();
    const oldGeometry = (first.lease.bundleInternal.rootInternal.children[0] as Mesh).geometry;
    const failOnce = (): void => {
      oldGeometry.removeEventListener('dispose', failOnce);
      throw new Error('one-shot disposal failure');
    };
    oldGeometry.addEventListener('dispose', failOnce);
    const second = prepare(
      atomic,
      target(2),
      greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2),
    );
    second.lease.swap();

    expect(second.lease.commit()).toEqual({
      status: 'committed',
      target: target(2),
      retirement: 'pending',
      pendingRetiredBundles: 1,
    });
    expect(atomic.displayedTargetInternal).toEqual(target(2));
    expect(second.lease.stateInternal).toBe('committed');
    expect(atomic.retryRetiredInternal()).toBe(1);
    expect(atomic.metricsInternal().pendingRetiredBundles).toBe(0);
  });

  it('reuses only an exact prior profiled CPU mesh and never scans voxel storage', () => {
    const atomic = stager();
    const output = greedyOutput();
    const first = prepare(atomic, target(1), output);
    first.lease.swap();
    first.lease.commit();
    const reusedPresentation = presentation(2, output);
    const readVoxel = vi.spyOn(reusedPresentation.chunks[0]!.chunk, 'getLocal');
    const reused = atomic.prepare({
      target: target(2),
      presentation: reusedPresentation,
      groups: [],
      profiledChunks: [profiledRequirement(output)],
      targetIsCurrent: () => true,
    });

    expect(readVoxel).not.toHaveBeenCalled();
    expect(reused.bundleInternal.presentationInternal.chunks[0]?.precomputedMesh).toBe(output);
    reused.swap();
    reused.commit();

    const nextPresentation = presentation(3, output);
    expect(() => atomic.prepare({
      target: target(3),
      presentation: nextPresentation,
      groups: [],
      profiledChunks: [{
        ...profiledRequirement(output),
        pipelineGeneration: 2,
      }],
      targetIsCurrent: () => true,
    })).toThrow(/missing an exact precomputed mesh/i);

    const changed = greedyOutput(
      'chunk:solid',
      { x: 0, y: 0, z: 0 },
      2,
      'dependency:changed',
    );
    const changedPresentation = presentation(3, changed);
    const changedReadVoxel = vi.spyOn(changedPresentation.chunks[0]!.chunk, 'getLocal');
    expect(() => atomic.prepare({
      target: target(3),
      presentation: changedPresentation,
      groups: [],
      profiledChunks: [profiledRequirement(changed)],
      targetIsCurrent: () => true,
    })).toThrow(/missing an exact precomputed mesh/i);
    expect(changedReadVoxel).not.toHaveBeenCalled();
    expect(atomic.displayedTargetInternal).toEqual(target(2));
  });

  it('rejects an initial profiled chunk without worker output before Three allocation', () => {
    const atomic = stager();
    const output = greedyOutput();
    const requestedPresentation = presentation(1, output);
    const readVoxel = vi.spyOn(requestedPresentation.chunks[0]!.chunk, 'getLocal');

    expect(() => atomic.prepare({
      target: target(1),
      presentation: requestedPresentation,
      groups: [],
      profiledChunks: [profiledRequirement(output)],
      targetIsCurrent: () => true,
    })).toThrow(/missing an exact precomputed mesh/i);
    expect(readVoxel).not.toHaveBeenCalled();
    expect(atomic.metricsInternal()).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
    });
  });

  it('releases scheduler and local leases on GPU build failure and budget rejection', () => {
    const output = greedyOutput();
    const requested = target(1);
    const invalidPresentation = presentation(1, output);
    const token = preparedGroup(requested, output);
    const port = groupPort(token);
    const atomic = stager();

    expect(() => atomic.prepare({
      target: requested,
      presentation: { ...invalidPresentation, materials: [] },
      groups: [port],
      targetIsCurrent: () => true,
    })).toThrow(/material/i);
    expect(port.cancelSpy).toHaveBeenCalledOnce();
    expect(atomic.metricsInternal()).toMatchObject({
      preparedTargets: 0,
      cpuStagingBytes: 0,
      gpuStagingBytes: 0,
    });

    const constrained = new RevisionAtomicPresentationStagerInternal({
      root: new Group(),
      maxCpuStagingBytes: output.metrics.outputBytes - 1,
      maxGpuStagingBytes: 2_000_000,
      maxPreparedTargets: 1,
    });
    const constrainedPort = groupPort(token);
    expect(() => constrained.prepare({
      target: requested,
      presentation: invalidPresentation,
      groups: [constrainedPort],
      targetIsCurrent: () => true,
    })).toThrow(/CPU staging budget/i);
    expect(constrainedPort.commitSpy).not.toHaveBeenCalled();
    expect(constrainedPort.cancelSpy).toHaveBeenCalledOnce();
  });

  it('bounds concurrent targets and makes prepared disposal idempotent', () => {
    const output = greedyOutput();
    const atomic = new RevisionAtomicPresentationStagerInternal({
      root: new Group(),
      maxCpuStagingBytes: 4_000_000,
      maxGpuStagingBytes: 4_000_000,
      maxPreparedTargets: 1,
    });
    const first = prepare(atomic, target(1), output);
    const nextOutput = greedyOutput('chunk:solid', { x: 0, y: 0, z: 0 }, 2);
    const nextPort = groupPort(preparedGroup(target(2), nextOutput));

    expect(() => atomic.prepare({
      target: target(2),
      presentation: presentation(2, nextOutput),
      groups: [nextPort],
      targetIsCurrent: () => true,
    })).toThrow(/prepared target budget/i);
    expect(nextPort.cancelSpy).toHaveBeenCalledOnce();

    first.lease.dispose();
    first.lease.dispose();
    expect(first.port.cancelSpy).toHaveBeenCalledOnce();
    expect(first.lease.stateInternal).toBe('aborted');
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
  });
});
