import type { PatchBatchInstancesV1 } from './contracts.js';
import {
  PagedInstanceBatchErrorInternal,
  buildPagedInstanceBatchPatchPlanInternal,
  commitPagedInstanceBatchPatchPlanInternal,
  type PagedInstanceBatchBudgetInternal,
  type PagedInstanceBatchCopyMetricsInternal,
  type PagedInstanceBatchEffectInternal,
  type PagedInstanceBatchInternal,
  type PagedInstanceBatchPatchPreflightInternal,
  type PagedInstanceBatchPatchResultInternal,
  type PatchPlanInternal,
} from './paged-instance-batch.js';

/** Opaque, allocation-free patch plan. Commit cannot re-run semantic or limit checks. */
export class PreparedPagedInstanceBatchPatchInternal {
  constructor(
    readonly base: PagedInstanceBatchInternal,
    readonly patch: PatchBatchInstancesV1,
    readonly planInternal: PatchPlanInternal,
  ) {
    Object.freeze(this);
  }

  get metrics(): PagedInstanceBatchCopyMetricsInternal { return this.planInternal.metrics; }
  get effect(): PagedInstanceBatchEffectInternal { return this.planInternal.effect; }
  get finalCount(): number { return this.planInternal.finalCount; }
  get finalActiveAnimationCount(): number {
    return this.planInternal.finalActiveAnimationCount;
  }
}

export function preparePagedInstanceBatchPatchInternal(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  budget: PagedInstanceBatchBudgetInternal = {},
): PreparedPagedInstanceBatchPatchInternal {
  return new PreparedPagedInstanceBatchPatchInternal(
    state,
    patch,
    buildPagedInstanceBatchPatchPlanInternal(state, patch, budget),
  );
}

export function preflightPagedInstanceBatchPatchInternal(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  budget: PagedInstanceBatchBudgetInternal = {},
): PagedInstanceBatchPatchPreflightInternal {
  const prepared = preparePagedInstanceBatchPatchInternal(state, patch, budget);
  return Object.freeze({ metrics: prepared.metrics, effect: prepared.effect });
}

export function commitPreparedPagedInstanceBatchPatchInternal(
  prepared: PreparedPagedInstanceBatchPatchInternal,
): PagedInstanceBatchPatchResultInternal {
  if (!(prepared instanceof PreparedPagedInstanceBatchPatchInternal)) {
    throw new PagedInstanceBatchErrorInternal(
      'paged-batch.prepared.invalid',
      'Expected a prepared paged batch patch.',
    );
  }
  return commitPagedInstanceBatchPatchPlanInternal(
    prepared.base,
    prepared.patch,
    prepared.planInternal,
  );
}

export function applyPagedInstanceBatchPatchInternal(
  state: PagedInstanceBatchInternal,
  patch: PatchBatchInstancesV1,
  budget: PagedInstanceBatchBudgetInternal = {},
): PagedInstanceBatchPatchResultInternal {
  return commitPreparedPagedInstanceBatchPatchInternal(
    preparePagedInstanceBatchPatchInternal(state, patch, budget),
  );
}
