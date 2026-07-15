import {
  failMeshSchedulerGroupV1Internal,
  removeTerminalGroupWhenIdleV1Internal,
  settleWorkerJobV1Internal,
} from './voxel-mesh-scheduler-lifecycle.js';
import type { MeshSchedulerStateInternal } from './voxel-mesh-scheduler-state.js';

/** Mutates an already-validated active scheduler to one authoritative epoch. */
export function replaceMeshSchedulerEpochV1Internal(
  state: MeshSchedulerStateInternal,
  worldId: string,
  epoch: string,
  logicalTick: number,
): readonly string[] {
  const previousEpoch = state.worldEpochs.get(worldId);
  if (previousEpoch === epoch) return Object.freeze([]);
  state.worldEpochs.set(worldId, epoch);
  if (previousEpoch !== undefined) {
    state.latestTargets.delete(state.worldEpochKey(worldId, previousEpoch));
  }
  const cancelled = [...state.groups.values()]
    .filter((group) => group.worldId === worldId && group.epoch !== epoch)
    .sort((left, right) => left.groupId < right.groupId ? -1 : 1);
  for (const group of cancelled) {
    failMeshSchedulerGroupV1Internal(state, group, 'epoch-replaced', logicalTick);
  }
  for (const slot of state.slots) {
    const active = slot.active;
    if (active !== undefined) {
      settleWorkerJobV1Internal(state, slot, active);
      const group = state.groups.get(active.normalized.eligibility.groupId);
      if (group?.state === 'active') {
        active.state = 'retry-pending';
        slot.retry = active;
      } else {
        active.state = 'terminal';
        if (group !== undefined) removeTerminalGroupWhenIdleV1Internal(state, group);
      }
    }
    if (state.refreshPort(slot).status !== 'started' && slot.retry !== undefined) {
      const retry = slot.retry;
      slot.retry = undefined;
      retry.state = 'terminal';
      const group = state.groups.get(retry.normalized.eligibility.groupId);
      if (group !== undefined) {
        failMeshSchedulerGroupV1Internal(
          state,
          group,
          'worker-startup-failed',
          logicalTick,
        );
      }
    }
  }
  return Object.freeze(cancelled.map((group) => group.groupId));
}
