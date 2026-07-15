import { describe, expect, it } from 'vitest';

import {
  coordinatorTargetPlanInternal,
  createCoordinatorHarnessInternal,
} from './revision-atomic-target-coordinator-fixtures.js';

describe('revision-atomic target coordinator admission reservation', () => {
  it('reserves and activates a job-bearing target', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1);

    const reservation = harness.coordinator.prepareAdmissionInternal(plan);
    expect(reservation).toMatchObject({
      status: 'reserved',
      target: plan.target,
      groupCount: plan.groups.length,
      jobCount: plan.scheduledJobCount,
    });
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    // Nothing was admitted: the scheduler queue and coordinator target are
    // untouched until activation.
    expect(harness.scheduler.getMetrics().queuedJobs).toBe(0);
    expect(harness.coordinator.activeTargetInternal).toBeNull();

    const admission = harness.coordinator.activateAdmissionInternal(reservation.handle);
    expect(admission).toMatchObject({ status: 'pending', target: plan.target });
    expect(harness.coordinator.activeTargetInternal).toEqual(plan.target);
    expect(harness.scheduler.getMetrics().queuedJobs).toBeGreaterThan(0);
    harness.coordinator.disposeInternal();
  });

  it('reserves and activates a zero-job target through a held scene lease', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1, []);
    expect(plan.groups.length).toBe(0);

    const reservation = harness.coordinator.prepareAdmissionInternal(plan);
    expect(reservation).toMatchObject({ status: 'reserved', target: plan.target });
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    // The zero-job scene lease is prepared during reservation but the target
    // is not yet admitted.
    expect(harness.stager.metricsInternal().preparedTargets).toBe(1);
    expect(harness.coordinator.activeTargetInternal).toBeNull();

    const admission = harness.coordinator.activateAdmissionInternal(reservation.handle);
    expect(admission).toMatchObject({ status: 'ready', target: plan.target });
    expect(harness.coordinator.readyLeaseInternal).not.toBeNull();
    harness.coordinator.disposeInternal();
  });

  it('cancel releases a zero-job reservation and its scene lease', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(1, []);

    const reservation = harness.coordinator.prepareAdmissionInternal(plan);
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');
    expect(harness.stager.metricsInternal().preparedTargets).toBe(1);

    harness.coordinator.cancelAdmissionInternal(reservation.handle);
    expect(harness.stager.metricsInternal().preparedTargets).toBe(0);

    // The cancelled reservation consumed nothing: the same plan may still be
    // admitted directly afterwards.
    expect(harness.coordinator.admitInternal(plan)).toMatchObject({
      status: 'ready',
      target: plan.target,
    });
    expect(() => harness.coordinator.activateAdmissionInternal(reservation.handle))
      .not.toThrow();
    expect(harness.coordinator.activateAdmissionInternal(reservation.handle)).toMatchObject({
      status: 'rejected',
      reason: 'superseded-reservation',
    });
    harness.coordinator.disposeInternal();
  });

  it('a newer reservation supersedes the outstanding one', () => {
    const harness = createCoordinatorHarnessInternal();
    const first = harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(1, []),
    );
    if (first.status !== 'reserved') throw new Error('Expected a reservation.');

    const second = harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(2, [], 2),
    );
    expect(second).toMatchObject({ status: 'reserved' });
    if (second.status !== 'reserved') throw new Error('Expected a reservation.');

    // Only the newer zero-job lease is held.
    expect(harness.stager.metricsInternal().preparedTargets).toBe(1);
    expect(harness.coordinator.activateAdmissionInternal(first.handle)).toMatchObject({
      status: 'rejected',
      reason: 'superseded-reservation',
    });
    expect(harness.coordinator.activateAdmissionInternal(second.handle)).toMatchObject({
      status: 'ready',
    });
    harness.coordinator.disposeInternal();
  });

  it('a direct admission supersedes the outstanding reservation', () => {
    const harness = createCoordinatorHarnessInternal();
    const reservation = harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(1, []),
    );
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    expect(harness.coordinator.admitInternal(
      coordinatorTargetPlanInternal(2, [0, 4], 2),
    )).toMatchObject({ status: 'pending' });

    // The reservation's lease was released and its activation is refused.
    expect(harness.coordinator.activateAdmissionInternal(reservation.handle)).toMatchObject({
      status: 'rejected',
      reason: 'superseded-reservation',
    });
    harness.coordinator.disposeInternal();
  });

  it('activation revalidates scheduler admission under drift', () => {
    const harness = createCoordinatorHarnessInternal();
    const plan = coordinatorTargetPlanInternal(2, [0, 4], 2);
    const reservation = harness.coordinator.prepareAdmissionInternal(plan);
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    // Hostile drift: newer work for the same coordinates is enqueued directly
    // into the scheduler between reservation and activation. The injected tick
    // must stay below the coordinator guard's next tick to remain monotonic.
    const newer = coordinatorTargetPlanInternal(5, [0, 4], 5);
    const groups = newer.groups.map((group) => group.group);
    expect(harness.scheduler.enqueueTarget(groups, 2).status).toBe('accepted');

    const admission = harness.coordinator.activateAdmissionInternal(reservation.handle);
    expect(admission).toMatchObject({ status: 'rejected', reason: 'stale-target' });
    expect(harness.coordinator.activeTargetInternal).toBeNull();
    harness.coordinator.disposeInternal();
  });

  it('reservations are blocked while a presentation is in flight', () => {
    const harness = createCoordinatorHarnessInternal();
    expect(harness.coordinator.admitInternal(
      coordinatorTargetPlanInternal(1, []),
    )).toMatchObject({ status: 'ready' });
    const lease = harness.coordinator.readyLeaseInternal!;
    lease.activate();

    expect(harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(2, [], 2),
    )).toMatchObject({ status: 'blocked', reason: 'presentation-in-flight' });

    lease.abort();
    harness.coordinator.settleLeaseInternal(lease);
    harness.coordinator.disposeInternal();
  });

  it('disposal cancels the outstanding reservation', () => {
    const harness = createCoordinatorHarnessInternal();
    const reservation = harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(1, []),
    );
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    expect(harness.coordinator.disposeInternal()).toMatchObject({ status: 'disposed' });
    expect(harness.coordinator.activateAdmissionInternal(reservation.handle)).toEqual({
      status: 'disposed',
    });
    expect(harness.coordinator.cancelAdmissionInternal(reservation.handle)).toEqual({
      status: 'disposed',
    });
  });

  it('cancel is idempotent and safe for settled reservations', () => {
    const harness = createCoordinatorHarnessInternal();
    const reservation = harness.coordinator.prepareAdmissionInternal(
      coordinatorTargetPlanInternal(1),
    );
    if (reservation.status !== 'reserved') throw new Error('Expected a reservation.');

    expect(harness.coordinator.activateAdmissionInternal(reservation.handle)).toMatchObject({
      status: 'pending',
    });
    expect(harness.coordinator.cancelAdmissionInternal(reservation.handle)).toEqual({
      status: 'already-settled',
    });
    expect(harness.coordinator.cancelAdmissionInternal(reservation.handle)).toEqual({
      status: 'already-settled',
    });
    harness.coordinator.disposeInternal();
  });
});
