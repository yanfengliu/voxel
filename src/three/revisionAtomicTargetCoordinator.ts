import type {
  MeshSchedulerCompleteGroupResultV1,
  MeshSchedulerGroupOutcomeV1,
  VoxelMeshSchedulerV1,
} from '../meshing/index.js';
import type { ProfiledWorkerTargetPlanInternal } from './profiledWorkerTargetPlan.js';
import type {
  RevisionAtomicPresentationLeaseInternal,
  RevisionAtomicPresentationStagerInternal,
  RevisionAtomicPresentationTargetInternal,
} from './revisionAtomicStaging.js';
import {
  CoordinatorTargetRecordInternal,
  coordinatorErrorMessageInternal,
  createCoordinatorGroupPortsInternal,
  retireCoordinatorTargetRecordInternal,
} from './revisionAtomicTargetCoordinatorRecord.js';
import { RevisionAtomicTargetCoordinatorGuardInternal } from './revisionAtomicTargetCoordinatorGuard.js';
import type {
  CoordinatorLifecycleInternal,
  RevisionAtomicAdmissionCancelResultInternal,
  RevisionAtomicAdmissionReservationHandleInternal,
  RevisionAtomicAdmissionReservationResultInternal,
  RevisionAtomicTargetAdmissionResultInternal,
  RevisionAtomicTargetCrashResultInternal,
  RevisionAtomicTargetCoordinatorOptionsInternal,
  RevisionAtomicTargetProgressResultInternal,
  RevisionAtomicTargetPumpResultInternal,
  RevisionAtomicTargetTerminalInternal,
  RevisionAtomicTargetTerminalReasonInternal,
} from './revisionAtomicTargetCoordinatorTypes.js';
export type {
  RevisionAtomicAdmissionCancelResultInternal,
  RevisionAtomicAdmissionReservationHandleInternal,
  RevisionAtomicAdmissionReservationResultInternal,
  RevisionAtomicTargetAdmissionResultInternal,
  RevisionAtomicTargetCrashResultInternal,
  RevisionAtomicTargetCoordinatorOptionsInternal,
  RevisionAtomicTargetProgressResultInternal,
  RevisionAtomicTargetPumpResultInternal,
  RevisionAtomicTargetTerminalInternal,
  RevisionAtomicTargetTerminalReasonInternal,
} from './revisionAtomicTargetCoordinatorTypes.js';

interface CoordinatorReservationInternal {
  readonly handle: RevisionAtomicAdmissionReservationHandleInternal;
  readonly plan: ProfiledWorkerTargetPlanInternal;
  /** Held only for zero-job targets, whose scene lease is prepared eagerly. */
  readonly record: CoordinatorTargetRecordInternal | null;
}

/**
 * Joins target planning, worker scheduling, exact completion, and off-scene
 * Three staging. Runtime frame ownership deliberately remains outside.
 */
export class RevisionAtomicTargetCoordinatorInternal {
  readonly #scheduler: VoxelMeshSchedulerV1;
  readonly #stager: RevisionAtomicPresentationStagerInternal;
  readonly #worldEpochs = new Map<string, string>();
  readonly #retiring = new Set<CoordinatorTargetRecordInternal>();
  readonly #guard = new RevisionAtomicTargetCoordinatorGuardInternal();
  #current: CoordinatorTargetRecordInternal | null = null;
  #provisional: CoordinatorTargetRecordInternal | null = null;
  #reservation: CoordinatorReservationInternal | null = null;
  #lastTerminal: RevisionAtomicTargetTerminalInternal | null = null;
  #lastTargetSequence = 0;
  #lifecycle: CoordinatorLifecycleInternal = 'active';

  constructor(options: RevisionAtomicTargetCoordinatorOptionsInternal) {
    this.#scheduler = options.schedulerInternal;
    this.#stager = options.stagerInternal;
  }

  get activeTargetInternal(): RevisionAtomicPresentationTargetInternal | null {
    return this.#current?.plan.target ?? null;
  }
  get readyLeaseInternal(): RevisionAtomicPresentationLeaseInternal | null {
    return this.#current?.phase === 'ready' ? this.#current.lease : null;
  }

  get lastTerminalInternal(): RevisionAtomicTargetTerminalInternal | null {
    return this.#lastTerminal;
  }

  get pendingRetirementsInternal(): number {
    return this.#retiring.size;
  }

  admitInternal(
    plan: ProfiledWorkerTargetPlanInternal,
  ): RevisionAtomicTargetAdmissionResultInternal {
    return this.#operate(() => {
      const reservation = this.#reserveInternal(plan);
      if (reservation.status !== 'reserved') return reservation;
      return this.#activateInternal(reservation.handle);
    });
  }

  /**
   * Validates a target admission and holds a single-use reservation without
   * enqueueing workers, superseding older targets, or cancelling epochs, so a
   * runtime can gate canonical acceptance on admissibility. A newer
   * reservation or a direct admission supersedes the outstanding handle.
   */
  prepareAdmissionInternal(
    plan: ProfiledWorkerTargetPlanInternal,
  ): RevisionAtomicAdmissionReservationResultInternal {
    return this.#operate(() => this.#reserveInternal(plan));
  }

  /**
   * Performs the reserved admission. Scheduler admission is revalidated, so
   * state drift since the reservation surfaces as an explicit rejection or
   * failure rather than corrupting accepted state.
   */
  activateAdmissionInternal(
    handle: RevisionAtomicAdmissionReservationHandleInternal,
  ): RevisionAtomicTargetAdmissionResultInternal {
    return this.#operate(() => this.#activateInternal(handle));
  }

  cancelAdmissionInternal(
    handle: RevisionAtomicAdmissionReservationHandleInternal,
  ): RevisionAtomicAdmissionCancelResultInternal {
    return this.#operate(() => {
      if (this.#lifecycle !== 'active') return Object.freeze({ status: 'disposed' });
      const reservation = this.#reservation;
      if (!reservation || reservation.handle !== handle) {
        return Object.freeze({ status: 'already-settled' });
      }
      this.#reservation = null;
      this.#releaseReservationInternal(reservation, 'cancelled');
      return Object.freeze({ status: 'cancelled' });
    });
  }

  #reserveInternal(
    plan: ProfiledWorkerTargetPlanInternal,
  ): RevisionAtomicAdmissionReservationResultInternal {
    if (this.#lifecycle !== 'active') return Object.freeze({ status: 'disposed' });
    this.#supersedeReservationInternal();
    this.#retryRetiringInternal();
    const target = plan.target;
    if (this.#current?.lease?.stateInternal === 'swapped') {
      return Object.freeze({
        status: 'blocked',
        target,
        reason: 'presentation-in-flight',
      });
    }
    if (plan.targetSequence <= this.#lastTargetSequence) {
      return Object.freeze({ status: 'rejected', target, reason: 'stale-sequence' });
    }
    const priorEpoch = this.#worldEpochs.get(target.worldId);
    const replacesEpoch = priorEpoch !== undefined && priorEpoch !== target.epoch;
    const handle: RevisionAtomicAdmissionReservationHandleInternal = Object.freeze({
      targetInternal: target,
    });
    if (plan.groups.length > 0) {
      const groups = Object.freeze(plan.groups.map((group) => group.group));
      const tick = this.#nextTickInternal();
      const verdict = replacesEpoch
        ? this.#scheduler.preflightReplacingEpochTarget(groups, tick)
        : this.#scheduler.preflightTarget(groups, tick);
      if (verdict.status === 'rejected') {
        return Object.freeze({ status: 'rejected', target, reason: verdict.reason });
      }
      if (verdict.status === 'duplicate') {
        return Object.freeze({ status: 'rejected', target, reason: 'duplicate-group' });
      }
      if (verdict.status === 'disposed') {
        this.#lifecycle = 'disposing';
        return Object.freeze({ status: 'disposed' });
      }
      this.#reservation = { handle, plan, record: null };
    } else {
      // The zero-job scene lease is prepared eagerly because staging is the
      // only fallible admission step for an empty target. The lease is held
      // reversibly: cancellation or supersession aborts it exactly.
      const record = this.#createRecordInternal(plan);
      this.#provisional = record;
      const terminal = this.#prepareTargetInternal(record);
      if (terminal) {
        this.#provisional = null;
        return Object.freeze({ status: 'failed', target, terminal });
      }
      this.#reservation = { handle, plan, record };
    }
    return Object.freeze({
      status: 'reserved',
      target,
      groupCount: plan.groups.length,
      jobCount: plan.scheduledJobCount,
      handle,
    });
  }

  #activateInternal(
    handle: RevisionAtomicAdmissionReservationHandleInternal,
  ): RevisionAtomicTargetAdmissionResultInternal {
    if (this.#lifecycle !== 'active') return Object.freeze({ status: 'disposed' });
    const reservation = this.#reservation;
    if (!reservation || reservation.handle !== handle) {
      return Object.freeze({
        status: 'rejected',
        target: handle.targetInternal,
        reason: 'superseded-reservation',
      });
    }
    this.#reservation = null;
    const plan = reservation.plan;
    const target = plan.target;
    if (this.#current?.lease?.stateInternal === 'swapped') {
      this.#releaseReservationInternal(reservation, 'blocked');
      return Object.freeze({
        status: 'blocked',
        target,
        reason: 'presentation-in-flight',
      });
    }
    if (plan.targetSequence <= this.#lastTargetSequence) {
      this.#releaseReservationInternal(reservation, 'stale');
      return Object.freeze({ status: 'rejected', target, reason: 'stale-sequence' });
    }
    const priorEpoch = this.#worldEpochs.get(target.worldId);
    const replacesEpoch = priorEpoch !== undefined && priorEpoch !== target.epoch;
    const old = this.#current;
    let record: CoordinatorTargetRecordInternal;
    let coalescedGroupIds: readonly string[] = Object.freeze([]);
    if (plan.groups.length > 0) {
      record = this.#createRecordInternal(plan);
      const groups = Object.freeze(plan.groups.map((group) => group.group));
      const tick = this.#nextTickInternal();
      const admission = replacesEpoch
        ? this.#scheduler.enqueueReplacingEpochTarget(groups, tick)
        : this.#scheduler.enqueueTarget(groups, tick);
      if (admission.status === 'rejected') {
        return Object.freeze({ status: 'rejected', target, reason: admission.reason });
      }
      if (admission.status === 'duplicate') {
        return Object.freeze({ status: 'rejected', target, reason: 'duplicate-group' });
      }
      if (admission.status === 'disposed') {
        this.#lifecycle = 'disposing';
        return Object.freeze({ status: 'disposed' });
      }
      coalescedGroupIds = admission.coalescedGroups;
      this.#current = record;
    } else {
      record = reservation.record!;
      if (replacesEpoch) {
        const replacement = this.#scheduler.replaceEpoch(
          target.worldId,
          target.epoch,
          this.#nextTickInternal(),
        );
        if (replacement.status === 'disposed') {
          this.#lifecycle = 'disposing';
          this.#failRecordInternal(
            record,
            'disposed',
            'Scheduler was disposed during zero-job epoch replacement.',
          );
          return Object.freeze({ status: 'disposed' });
        }
      }
      this.#current = record;
      this.#provisional = null;
    }
    this.#lastTargetSequence = plan.targetSequence;
    this.#worldEpochs.set(target.worldId, target.epoch);
    this.#lastTerminal = null;
    if (old && old !== record) {
      this.#retireRecordInternal(old, replacesEpoch ? 'epoch-replaced' : 'superseded');
    }
    return Object.freeze({
      status: record.phase === 'ready' ? 'ready' : 'pending',
      target,
      groupCount: record.groupIds.length,
      jobCount: plan.scheduledJobCount,
      coalescedGroupIds,
      cleanupPending: this.#retiring.size > 0,
    });
  }

  #supersedeReservationInternal(): void {
    const reservation = this.#reservation;
    if (!reservation) return;
    this.#reservation = null;
    this.#releaseReservationInternal(reservation, 'superseded');
  }

  #releaseReservationInternal(
    reservation: CoordinatorReservationInternal,
    cause: string,
  ): void {
    const record = reservation.record;
    if (!record) return;
    if (this.#provisional === record) this.#provisional = null;
    this.#retireRecordInternal(
      record,
      'superseded',
      `Revision-atomic admission reservation was ${cause}.`,
    );
  }

  pumpInternal(): RevisionAtomicTargetPumpResultInternal {
    return this.#operate(() => {
      if (this.#lifecycle !== 'active') {
        const schedulerInternal = Object.freeze({
          status: 'disposed' as const,
          dispatches: Object.freeze([]),
        });
        return Object.freeze({
          status: 'disposed',
          dispatches: schedulerInternal.dispatches,
          schedulerInternal,
        });
      }
      this.#retryRetiringInternal();
      const record = this.#current;
      if (record?.phase !== 'pending') {
        const schedulerInternal = Object.freeze({
          status: 'active' as const,
          dispatches: Object.freeze([]),
        });
        return Object.freeze({
          status: record?.phase === 'ready' ? 'ready' : 'idle',
          dispatches: schedulerInternal.dispatches,
          schedulerInternal,
        });
      }
      const schedulerInternal = this.#scheduler.pump(
        this.#nextTickInternal(),
        record.dispatch.allocate,
      );
      const terminal = this.#probeGroupsInternal(record);
      return Object.freeze({
        status: terminal ? 'target-failed' : record.phase,
        dispatches: schedulerInternal.dispatches,
        schedulerInternal,
        ...(terminal ? { terminal } : {}),
      });
    });
  }

  receiveInternal(
    workerId: string,
    value: unknown,
  ): RevisionAtomicTargetProgressResultInternal {
    return this.#operate(() => {
      const record = this.#current;
      const schedulerInternal = this.#scheduler.receive(
        workerId,
        value,
        this.#nextTickInternal(),
        record?.resolveCurrent ?? (() => null),
      );
      if (this.#lifecycle !== 'active' || schedulerInternal.status === 'disposed') {
        return Object.freeze({ status: 'disposed', schedulerInternal });
      }
      if (!record || this.#current !== record || record.phase !== 'pending') {
        return Object.freeze({
          status: 'ignored',
          reason: schedulerInternal.status === 'duplicate-result'
            ? 'duplicate-result'
            : schedulerInternal.status === 'stale-result'
              ? 'stale-result'
              : 'non-current',
          schedulerInternal,
        });
      }
      if (schedulerInternal.status === 'terminal') {
        if (record.groupIds.includes(schedulerInternal.outcome.groupId)) {
          const terminal = this.#failRecordInternal(
            record,
            'group-terminal',
            `Scheduler group ${schedulerInternal.outcome.groupId} became terminal.`,
            schedulerInternal.outcome,
          );
          return Object.freeze({
            status: 'target-failed',
            target: record.plan.target,
            terminal,
            schedulerInternal,
          });
        }
        return Object.freeze({
          status: 'ignored',
          reason: 'non-current',
          schedulerInternal,
        });
      }
      if (schedulerInternal.status === 'duplicate-result'
        || schedulerInternal.status === 'stale-result') {
        return Object.freeze({
          status: 'ignored',
          reason: schedulerInternal.status,
          schedulerInternal,
        });
      }
      if (schedulerInternal.status !== 'staged' || !schedulerInternal.groupReady) {
        return Object.freeze({
          status: 'progress',
          target: record.plan.target,
          remainingGroups: record.groupIds.length - record.preparedById.size,
          schedulerInternal,
        });
      }
      const completion = this.#completeGroupInternal(record, schedulerInternal.groupId);
      if (completion.terminal) {
        return Object.freeze({
          status: 'target-failed',
          target: record.plan.target,
          terminal: completion.terminal,
          schedulerInternal,
        });
      }
      return Object.freeze({
        status: record.lease ? 'target-ready' : 'group-prepared',
        target: record.plan.target,
        remainingGroups: record.groupIds.length - record.preparedById.size,
        schedulerInternal,
      });
    });
  }

  workerCrashedInternal(workerId: string): RevisionAtomicTargetCrashResultInternal {
    return this.#operate(() => {
      const record = this.#current;
      const schedulerInternal = this.#scheduler.workerCrashed(
        workerId,
        this.#nextTickInternal(),
      );
      if (this.#lifecycle !== 'active' || schedulerInternal.status === 'disposed') {
        return Object.freeze({ status: 'disposed', schedulerInternal });
      }
      if (schedulerInternal.status === 'worker-replaced') {
        return Object.freeze({ status: 'worker-replaced', schedulerInternal });
      }
      if (schedulerInternal.status === 'worker-unavailable') {
        return Object.freeze({ status: 'worker-unavailable', schedulerInternal });
      }
      if (schedulerInternal.status === 'stale-worker') {
        return Object.freeze({
          status: 'ignored',
          reason: 'stale-worker',
          schedulerInternal,
        });
      }
      const ownsGroup = record !== null
        && this.#current === record
        && record.phase === 'pending'
        && record.groupIds.includes(
          schedulerInternal.status === 'terminal'
            ? schedulerInternal.outcome.groupId
            : schedulerInternal.groupId,
        );
      if (!ownsGroup) {
        return Object.freeze({ status: 'ignored', reason: 'non-current', schedulerInternal });
      }
      if (schedulerInternal.status === 'retry-pending') {
        return Object.freeze({
          status: 'retry-pending',
          target: record.plan.target,
          schedulerInternal,
        });
      }
      const terminal = this.#failRecordInternal(
        record,
        'group-terminal',
        `Scheduler group ${schedulerInternal.outcome.groupId} became terminal after worker crash.`,
        schedulerInternal.outcome,
      );
      return Object.freeze({
        status: 'target-failed',
        target: record.plan.target,
        terminal,
        schedulerInternal,
      });
    });
  }

  settleLeaseInternal(lease: RevisionAtomicPresentationLeaseInternal) {
    return this.#operate(() => {
      const record = this.#current;
      if (record?.lease !== lease) {
        throw new Error('Revision-atomic coordinator does not own this presentation lease.');
      }
      if (lease.stateInternal === 'committed') {
        record.phase = 'presented';
        this.#current = null;
        record.preparedById.clear();
        return Object.freeze({ status: 'presented' as const, target: record.plan.target });
      }
      if (lease.stateInternal === 'aborted') {
        const terminal = this.#failRecordInternal(
          record,
          'frame-aborted',
          'Revision-atomic frame presentation was aborted.',
        );
        return Object.freeze({
          status: 'aborted' as const,
          target: record.plan.target,
          terminal,
          requiresFreshTargetSequence: true,
        });
      }
      throw new Error(`Revision-atomic presentation lease is still ${lease.stateInternal}.`);
    });
  }

  disposeInternal() {
    return this.#operate(() => {
      if (this.#lifecycle === 'disposed') {
        return Object.freeze({ status: 'already-disposed' as const });
      }
      this.#lifecycle = 'disposing';
      const errors: unknown[] = [];
      const reservation = this.#reservation;
      this.#reservation = null;
      if (reservation) {
        try {
          this.#releaseReservationInternal(reservation, 'disposed');
        } catch (error) {
          errors.push(error);
        }
      }
      const current = this.#current;
      this.#current = null;
      this.#provisional = null;
      if (current) {
        try { this.#retireRecordInternal(current, 'disposed'); } catch (error) { errors.push(error); }
      }
      try { this.#retryRetiringInternal(); } catch (error) { errors.push(error); }
      try { this.#stager.dispose(); } catch (error) { errors.push(error); }
      try { this.#retryRetiringInternal(); } catch (error) { errors.push(error); }
      const scheduler = this.#scheduler.dispose(this.#nextTickInternal());
      if (scheduler.pendingWorkerTerminations > 0) {
        errors.push(new Error('Revision-atomic worker termination remains pending.'));
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Revision-atomic coordinator disposal failed.');
      }
      this.#lifecycle = 'disposed';
      return Object.freeze({ status: 'disposed' as const, scheduler });
    });
  }

  #createRecordInternal(
    plan: ProfiledWorkerTargetPlanInternal,
  ): CoordinatorTargetRecordInternal {
    return new CoordinatorTargetRecordInternal(
      plan,
      (record) => this.#lifecycle === 'active' && this.#current === record,
    );
  }

  #presentationIsCurrentInternal(record: CoordinatorTargetRecordInternal): boolean {
    return this.#lifecycle === 'active'
      && (this.#current === record || this.#provisional === record);
  }

  #probeGroupsInternal(
    record: CoordinatorTargetRecordInternal,
  ): RevisionAtomicTargetTerminalInternal | null {
    for (const groupId of record.groupIds) {
      if (record.preparedById.has(groupId)) continue;
      const completion = this.#scheduler.completeGroup(
        groupId,
        this.#nextTickInternal(),
        record.resolveCurrent,
      );
      if (completion.status === 'not-ready') continue;
      const processed = this.#processCompletionInternal(record, groupId, completion);
      if (processed) return processed;
    }
    return null;
  }

  #completeGroupInternal(
    record: CoordinatorTargetRecordInternal,
    groupId: string,
  ): { readonly terminal: RevisionAtomicTargetTerminalInternal | null } {
    const completion = this.#scheduler.completeGroup(
      groupId,
      this.#nextTickInternal(),
      record.resolveCurrent,
    );
    const terminal = this.#processCompletionInternal(record, groupId, completion);
    return Object.freeze({ terminal });
  }

  #processCompletionInternal(
    record: CoordinatorTargetRecordInternal,
    groupId: string,
    completion: MeshSchedulerCompleteGroupResultV1,
  ): RevisionAtomicTargetTerminalInternal | null {
    if (completion.status === 'prepared' || completion.status === 'already-prepared') {
      const prior = record.preparedById.get(groupId);
      if (prior && prior !== completion.prepared) {
        return this.#failRecordInternal(
          record,
          'invariant-failed',
          `Scheduler group ${groupId} changed its completion token.`,
        );
      }
      record.preparedById.set(groupId, completion.prepared);
      return record.preparedById.size === record.groupIds.length
        ? this.#prepareTargetInternal(record)
        : null;
    }
    if (completion.status === 'terminal') {
      return this.#failRecordInternal(
        record,
        'group-terminal',
        `Scheduler group ${groupId} became terminal during completion.`,
        completion.outcome,
      );
    }
    if (completion.status === 'not-ready') return null;
    return this.#failRecordInternal(
      record,
      'invariant-failed',
      `Scheduler group ${groupId} could not produce a completion token (${completion.status}).`,
    );
  }

  #prepareTargetInternal(
    record: CoordinatorTargetRecordInternal,
  ): RevisionAtomicTargetTerminalInternal | null {
    if (record.lease) return null;
    try {
      const ports = createCoordinatorGroupPortsInternal(
        record,
        this.#scheduler,
        () => this.#nextTickInternal(),
      );
      record.lease = this.#stager.prepare({
        target: record.plan.target,
        presentation: record.plan.presentation,
        groups: Object.freeze(ports),
        profiledChunks: record.plan.requirements,
        targetIsCurrent: () => this.#presentationIsCurrentInternal(record),
      });
      record.phase = 'ready';
      return null;
    } catch (error) {
      return this.#failRecordInternal(
        record,
        'staging-failed',
        coordinatorErrorMessageInternal(error),
      );
    }
  }

  #failRecordInternal(
    record: CoordinatorTargetRecordInternal,
    reason: RevisionAtomicTargetTerminalReasonInternal,
    message: string,
    primaryGroup?: MeshSchedulerGroupOutcomeV1,
  ): RevisionAtomicTargetTerminalInternal {
    if (this.#current === record) this.#current = null;
    if (this.#provisional === record) this.#provisional = null;
    const terminal = this.#retireRecordInternal(record, reason, message, primaryGroup);
    this.#lastTerminal = terminal;
    return terminal;
  }

  #retireRecordInternal(
    record: CoordinatorTargetRecordInternal,
    reason: RevisionAtomicTargetTerminalReasonInternal,
    message = `Revision-atomic target became ${reason}.`,
    primaryGroup?: MeshSchedulerGroupOutcomeV1,
  ): RevisionAtomicTargetTerminalInternal {
    const terminal = retireCoordinatorTargetRecordInternal(
      record,
      this.#scheduler,
      () => this.#nextTickInternal(),
      reason,
      message,
      primaryGroup,
    );
    if (terminal.cleanupPending) this.#retiring.add(record);
    else this.#retiring.delete(record);
    return terminal;
  }

  #retryRetiringInternal(): void {
    const errors: unknown[] = [];
    for (const record of [...this.#retiring]) {
      try {
        const terminal = this.#retireRecordInternal(
          record,
          record.terminal?.reason ?? 'invariant-failed',
          record.terminal?.message ?? 'Revision-atomic cleanup retry.',
          record.terminal?.primaryGroup,
        );
        if (!terminal.cleanupPending) this.#retiring.delete(record);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Revision-atomic target cleanup retry failed.');
    }
  }

  #nextTickInternal(): number {
    return this.#guard.nextTickInternal();
  }

  #operate<Result>(operation: () => Result): Result {
    return this.#guard.operateInternal(operation);
  }
}
