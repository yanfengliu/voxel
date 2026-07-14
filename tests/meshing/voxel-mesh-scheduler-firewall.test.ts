import { describe, expect, it } from 'vitest';

import {
  type MeshSchedulerEligibilityResolverV1,
  type MeshSchedulerEligibilityV1,
  type MeshSchedulerPreparedGroupV1,
} from '../../src/meshing/index.js';
import {
  SCHEDULER_TEST_CONFIG,
  createSchedulerHarness,
  schedulerGroup,
} from './voxel-mesh-scheduler-fixtures.js';

const current = (eligibility: MeshSchedulerEligibilityV1) => eligibility;

function mutateSource(
  eligibility: MeshSchedulerEligibilityV1,
  source: Partial<MeshSchedulerEligibilityV1['source']>,
): MeshSchedulerEligibilityV1 {
  return { ...eligibility, source: { ...eligibility.source, ...source } };
}

const staleCases: readonly {
  readonly name: string;
  readonly mutate: (eligibility: MeshSchedulerEligibilityV1) => MeshSchedulerEligibilityV1;
}[] = [
  { name: 'groupId', mutate: (value) => ({ ...value, groupId: 'other-group' }) },
  { name: 'worldId', mutate: (value) => ({ ...value, worldId: 'other-world' }) },
  { name: 'epoch', mutate: (value) => ({ ...value, epoch: 'other-epoch' }) },
  { name: 'targetRevision', mutate: (value) => ({ ...value, targetRevision: 2 }) },
  { name: 'pipelineGeneration', mutate: (value) => ({ ...value, pipelineGeneration: 2 }) },
  { name: 'mesherId', mutate: (value) => ({ ...value, mesherId: 'other-mesher' }) },
  { name: 'mesherVersion', mutate: (value) => ({ ...value, mesherVersion: 'other-version' }) },
  {
    name: 'materialPolicyVersion',
    mutate: (value) => ({ ...value, materialPolicyVersion: 'other-material-policy' }),
  },
  {
    name: 'dependencySignature',
    mutate: (value) => ({ ...value, dependencySignature: 'other-dependency' }),
  },
  {
    name: 'source.coordinate',
    mutate: (value) => mutateSource(value, {
      coordinate: { ...value.source.coordinate, x: value.source.coordinate.x + 1 },
    }),
  },
  {
    name: 'source.slotGeneration',
    mutate: (value) => mutateSource(value, { slotGeneration: 2 }),
  },
  { name: 'source.key', mutate: (value) => mutateSource(value, { key: 'other-key' }) },
  { name: 'source.incarnation', mutate: (value) => mutateSource(value, { incarnation: 2 }) },
  {
    name: 'source.sourceRevision',
    mutate: (value) => mutateSource(value, { sourceRevision: 2 }),
  },
  {
    name: 'source.size',
    mutate: (value) => mutateSource(value, {
      size: { ...value.source.size, x: value.source.size.x + 1 },
    }),
  },
];

describe('VoxelMeshSchedulerV1 stale-result identity firewall', () => {
  for (const staleCase of staleCases) {
    it(`rejects changed ${staleCase.name} at receipt before retaining output`, () => {
      const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
      harness.scheduler.enqueue(schedulerGroup('receipt-gate', 1, [{ coordinateX: 0 }]), 0);
      const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
      const result = harness.scheduler.receive(
        dispatch.workerId,
        harness.completed(dispatch.jobId),
        2,
        (eligibility) => staleCase.mutate(eligibility),
      );
      expect(result).toMatchObject({
        status: 'terminal',
        outcome: { status: 'stale', code: 'stale-receipt' },
      });
      expect(harness.scheduler.getMetrics()).toMatchObject({
        staleResults: 1,
        stagingBytes: 0,
        stagingLeaseBytes: 0,
        readyGroups: 0,
      });
      expect(harness.scheduler.getMetrics().discardedOutputBytes).toBeGreaterThan(0);
      harness.scheduler.dispose(3);
    });
  }

  it('fails closed when current-identity recomputation throws or reports removal', () => {
    for (const resolver of [
      () => null,
      () => { throw new Error('canonical index unavailable'); },
    ] satisfies readonly MeshSchedulerEligibilityResolverV1[]) {
      const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
      harness.scheduler.enqueue(schedulerGroup('missing-current', 1, [{ coordinateX: 0 }]), 0);
      const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
      expect(harness.scheduler.receive(
        dispatch.workerId,
        harness.completed(dispatch.jobId),
        2,
        resolver,
      )).toMatchObject({ status: 'terminal', outcome: { code: 'stale-receipt' } });
      harness.scheduler.dispose(3);
    }
  });

  it('distinguishes stale registration, invalid matching output, and duplicate output', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('classify', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    const valid = harness.completed(dispatch.jobId);
    expect(harness.scheduler.receive(
      'wrong-worker-generation',
      valid,
      2,
      current,
    )).toEqual({ status: 'stale-result' });
    expect(harness.scheduler.receive(dispatch.workerId, {
      ...valid,
      identity: { ...valid.identity, jobId: 'wrong-job' },
    }, 3, current)).toEqual({ status: 'stale-result' });
    expect(harness.scheduler.receive(dispatch.workerId, {
      schemaVersion: 'voxel.mesh-worker/1',
      kind: 'result',
      status: 'completed',
      identity: valid.identity,
      output: { broken: true },
    }, 4, current)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'invalid-result' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      staleResults: 2,
      invalidResults: 1,
      stagingBytes: 0,
    });
    harness.scheduler.dispose(5);

    const duplicate = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    duplicate.scheduler.enqueue(schedulerGroup('duplicate', 1, [{ coordinateX: 0 }]), 0);
    const duplicateDispatch = duplicate.scheduler.pump(1, duplicate.allocator).dispatches[0]!;
    expect(duplicate.scheduler.receive(
      duplicateDispatch.workerId,
      duplicate.completed(duplicateDispatch.jobId),
      2,
      current,
    )).toMatchObject({ status: 'staged' });
    expect(duplicate.scheduler.receive(
      duplicateDispatch.workerId,
      duplicate.completed(duplicateDispatch.jobId),
      3,
      current,
    )).toEqual({ status: 'duplicate-result' });
    expect(duplicate.scheduler.getMetrics()).toMatchObject({ duplicateResults: 1 });
    duplicate.scheduler.cancelGroup('duplicate', 4);
    duplicate.scheduler.dispose(5);
  });

  it('rechecks every job after group completion and discards the whole atomic group', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 2 });
    harness.scheduler.enqueue(schedulerGroup('completion-gate', 1, [
      { coordinateX: 0 },
      { coordinateX: 1 },
    ]), 0);
    const dispatches = harness.scheduler.pump(1, harness.allocator).dispatches;
    expect(dispatches).toHaveLength(2);
    for (const dispatch of dispatches) {
      expect(harness.scheduler.receive(
        dispatch.workerId,
        harness.completed(dispatch.jobId),
        2,
        current,
      ).status).toBe('staged');
    }
    expect(harness.scheduler.completeGroup(
      'completion-gate',
      3,
      (eligibility) => eligibility.source.coordinate.x === 1
        ? mutateSource(eligibility, { sourceRevision: 99 })
        : eligibility,
    )).toMatchObject({
      status: 'terminal',
      outcome: { code: 'stale-group-completion' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      readyGroups: 0,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
    });
    harness.scheduler.dispose(4);
  });

  it('requires the exact prepared token and rechecks identity immediately before commit', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('commit-gate', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.scheduler.receive(
      dispatch.workerId,
      harness.completed(dispatch.jobId),
      2,
      current,
    );
    const completion = harness.scheduler.completeGroup('commit-gate', 3, current);
    expect(completion.status).toBe('prepared');
    if (completion.status !== 'prepared') return;
    const forged: MeshSchedulerPreparedGroupV1 = {
      ...completion.prepared,
      outputs: completion.prepared.outputs,
    };
    expect(harness.scheduler.commitGroup(forged, 4, current)).toEqual({
      status: 'invalid-token',
    });
    expect(harness.scheduler.commitGroup(
      completion.prepared,
      5,
      (eligibility) => ({ ...eligibility, pipelineGeneration: 2 }),
    )).toMatchObject({
      status: 'terminal',
      outcome: { code: 'stale-commit' },
    });
    expect(harness.scheduler.getMetrics()).toMatchObject({
      committedGroups: 0,
      stagingBytes: 0,
      readyGroups: 0,
    });
    harness.scheduler.dispose(6);
  });

  it('transfers validated CPU output ownership exactly once on successful commit', () => {
    const harness = createSchedulerHarness({ ...SCHEDULER_TEST_CONFIG, workerCount: 1 });
    harness.scheduler.enqueue(schedulerGroup('commit', 1, [{ coordinateX: 0 }]), 0);
    const dispatch = harness.scheduler.pump(1, harness.allocator).dispatches[0]!;
    harness.scheduler.receive(
      dispatch.workerId,
      harness.completed(dispatch.jobId),
      2,
      current,
    );
    const completion = harness.scheduler.completeGroup('commit', 3, current);
    expect(completion.status).toBe('prepared');
    if (completion.status !== 'prepared') return;
    expect(harness.scheduler.completeGroup('commit', 4, current)).toEqual({
      status: 'already-prepared',
      prepared: completion.prepared,
    });
    const committed = harness.scheduler.commitGroup(completion.prepared, 5, current);
    expect(committed.status).toBe('committed');
    if (committed.status !== 'committed') return;
    expect(committed.outputs[0]?.output).toBe(completion.prepared.outputs[0]?.output);
    expect(harness.scheduler.getMetrics()).toMatchObject({
      committedGroups: 1,
      stagingBytes: 0,
      stagingLeaseBytes: 0,
      readyGroups: 0,
    });
    expect(harness.scheduler.getMetrics().committedOutputBytes).toBeGreaterThan(0);
    expect(harness.scheduler.commitGroup(completion.prepared, 6, current)).toMatchObject({
      status: 'terminal',
      outcome: { code: 'committed' },
    });
    harness.scheduler.dispose(7);
  });
});
