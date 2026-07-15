import type {
  MeshSchedulerCancellationReasonV1,
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerGroupOutcomeV1,
  MeshSchedulerPreparedGroupV1,
  VoxelMeshSchedulerV1,
} from '../meshing/index.js';
import { ProfiledWorkerDispatchIndexInternal } from './profiledWorkerDispatch.js';
import type { ProfiledWorkerTargetPlanInternal } from './profiledWorkerTargetPlan.js';
import type {
  RevisionAtomicGroupPortInternal,
  RevisionAtomicPresentationLeaseInternal,
} from './revisionAtomicStaging.js';
import type {
  CoordinatorTargetPhaseInternal,
  RevisionAtomicTargetTerminalInternal,
  RevisionAtomicTargetTerminalReasonInternal,
} from './revisionAtomicTargetCoordinatorTypes.js';

type CoordinatorCurrentPredicateInternal = (
  record: CoordinatorTargetRecordInternal,
) => boolean;

export class CoordinatorTargetRecordInternal {
  readonly dispatch: ProfiledWorkerDispatchIndexInternal;
  readonly groupIds: readonly string[];
  readonly preparedById = new Map<string, MeshSchedulerPreparedGroupV1>();
  readonly consumedGroupIds = new Set<string>();
  readonly cancelledGroupIds = new Set<string>();
  readonly resolveCurrent: MeshSchedulerEligibilityResolverV1;
  phase: CoordinatorTargetPhaseInternal = 'pending';
  lease: RevisionAtomicPresentationLeaseInternal | null = null;
  terminal: RevisionAtomicTargetTerminalInternal | null = null;

  constructor(
    readonly plan: ProfiledWorkerTargetPlanInternal,
    isCurrent: CoordinatorCurrentPredicateInternal,
  ) {
    this.dispatch = new ProfiledWorkerDispatchIndexInternal(plan);
    this.groupIds = Object.freeze(plan.groups.map((group) => group.group.groupId));
    this.resolveCurrent = (registered) => isCurrent(this)
      ? this.dispatch.resolveCurrent(registered, plan.target)
      : null;
  }
}

export function coordinatorErrorMessageInternal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (message || 'Unknown revision-atomic coordinator failure.').slice(0, 512);
}

export function createCoordinatorGroupPortsInternal(
  record: CoordinatorTargetRecordInternal,
  scheduler: VoxelMeshSchedulerV1,
  nextTick: () => number,
): readonly RevisionAtomicGroupPortInternal[] {
  return Object.freeze(record.groupIds.map((groupId) => {
    const token = record.preparedById.get(groupId);
    if (!token) throw new Error(`Missing prepared scheduler group ${groupId}.`);
    return Object.freeze({
      token,
      resolveCurrent: record.resolveCurrent,
      commit: (provided: MeshSchedulerPreparedGroupV1) => {
        if (provided !== token) {
          throw new Error(`Prepared scheduler group ${groupId} received a foreign token.`);
        }
        const result = scheduler.commitGroup(provided, nextTick(), record.resolveCurrent);
        if (result.status === 'committed') record.consumedGroupIds.add(groupId);
        return result;
      },
      cancel: (requestedGroupId: string) => {
        if (requestedGroupId !== groupId) {
          throw new Error(`Prepared scheduler group ${groupId} received a foreign cancellation.`);
        }
        const result = scheduler.cancelGroup(requestedGroupId, nextTick());
        if (result.status === 'cancelled'
          || (result.status === 'terminal' && result.outcome.code !== 'committed')) {
          record.cancelledGroupIds.add(requestedGroupId);
        }
        return result;
      },
    });
  }));
}

export function retireCoordinatorTargetRecordInternal(
  record: CoordinatorTargetRecordInternal,
  scheduler: VoxelMeshSchedulerV1,
  nextTick: () => number,
  reason: RevisionAtomicTargetTerminalReasonInternal,
  message: string,
  primaryGroup?: MeshSchedulerGroupOutcomeV1,
): RevisionAtomicTargetTerminalInternal {
  record.phase = 'terminal';
  for (const groupId of record.groupIds) {
    const result = scheduler.cancelGroup(
      groupId,
      nextTick(),
      coordinatorCancellationReasonInternal(reason),
    );
    if (result.status === 'cancelled'
      || (result.status === 'terminal' && result.outcome.code !== 'committed')) {
      record.cancelledGroupIds.add(groupId);
    }
    if (result.status === 'terminal' && result.outcome.code === 'committed') {
      record.consumedGroupIds.add(groupId);
    }
  }
  let cleanupPending = false;
  if (record.lease?.stateInternal !== undefined
    && record.lease.stateInternal !== 'committed'
    && record.lease.stateInternal !== 'aborted') {
    try { record.lease.abort(); } catch { cleanupPending = true; }
  }
  if (record.lease?.stateInternal === 'committed') {
    for (const groupId of record.groupIds) record.consumedGroupIds.add(groupId);
  }
  if (record.lease?.stateInternal !== undefined
    && record.lease.stateInternal !== 'committed'
    && record.lease.stateInternal !== 'aborted') {
    cleanupPending = true;
  }
  record.preparedById.clear();
  const terminal = Object.freeze({
    reason,
    message: message.slice(0, 512),
    ...(primaryGroup ? { primaryGroup } : {}),
    consumedGroupIds: Object.freeze([...record.consumedGroupIds].sort()),
    cancelledGroupIds: Object.freeze([...record.cancelledGroupIds].sort()),
    cleanupPending,
  });
  record.terminal = terminal;
  return terminal;
}

function coordinatorCancellationReasonInternal(
  reason: RevisionAtomicTargetTerminalReasonInternal,
): MeshSchedulerCancellationReasonV1 {
  if (reason === 'superseded') return 'superseded';
  if (reason === 'epoch-replaced') return 'epoch-replaced';
  if (reason === 'disposed') return 'disposed';
  return 'cooperative';
}
