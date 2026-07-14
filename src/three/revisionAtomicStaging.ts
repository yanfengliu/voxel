import type { Group } from 'three';

import {
  applySelectedGreedyMeshesInternal,
  estimateRevisionAtomicGpuBytesInternal,
  ThreeRevisionPresentationBundleInternal,
} from './revisionAtomicBundle.js';
import {
  assertRevisionAtomicBudgetInternal,
  assertRevisionAtomicTargetInternal,
  resolveRevisionAtomicProfiledMeshesInternal,
  revisionAtomicCheckCurrentInternal,
  revisionAtomicGroupEligibilityCurrentInternal,
  validateRevisionAtomicGroupsInternal,
} from './revisionAtomicEligibility.js';
import type {
  RevisionAtomicCommitResultInternal,
  RevisionAtomicGroupPortInternal,
  RevisionAtomicLeaseStateInternal,
  RevisionAtomicMountInternal,
  RevisionAtomicPrepareInputInternal,
  RevisionAtomicPresentationStagerOptionsInternal,
  RevisionAtomicPresentationTargetInternal,
  RevisionAtomicProfiledMeshInternal,
  RevisionAtomicStagingMetricsInternal,
} from './revisionAtomicStagingTypes.js';
export type {
  RevisionAtomicCommitResultInternal,
  RevisionAtomicGroupPortInternal,
  RevisionAtomicLeaseStateInternal,
  RevisionAtomicMountInternal,
  RevisionAtomicPrepareInputInternal,
  RevisionAtomicPresentationStagerOptionsInternal,
  RevisionAtomicPresentationTargetInternal,
  RevisionAtomicProfiledChunkRequirementInternal,
  RevisionAtomicProfiledMeshInternal,
  RevisionAtomicStagingMetricsInternal,
} from './revisionAtomicStagingTypes.js';

type GroupStateInternal = 'prepared' | 'committed' | 'cancelled';

function combineErrors(primary: unknown, cleanup: readonly unknown[], message: string): Error {
  if (cleanup.length === 0) return primary instanceof Error ? primary : new Error(String(primary));
  return new AggregateError([primary, ...cleanup], message);
}

export class RevisionAtomicPresentationLeaseInternal {
  stateInternal: RevisionAtomicLeaseStateInternal = 'prepared';
  previousBundleInternal: ThreeRevisionPresentationBundleInternal | null = null;
  readonly groupStatesInternal = new Map<RevisionAtomicGroupPortInternal, GroupStateInternal>();

  constructor(
    private readonly owner: RevisionAtomicPresentationStagerInternal,
    readonly targetInternal: RevisionAtomicPresentationTargetInternal,
    readonly bundleInternal: ThreeRevisionPresentationBundleInternal,
    readonly cpuBytesInternal: number,
    readonly gpuBytesInternal: number,
    readonly groupsInternal: readonly RevisionAtomicGroupPortInternal[],
    readonly targetIsCurrentInternal: () => boolean,
  ) {
    for (const group of groupsInternal) this.groupStatesInternal.set(group, 'prepared');
  }

  swap(): void { this.owner.swapInternal(this); }
  validateForRender(): void { this.owner.validateForRenderInternal(this); }
  commit(): RevisionAtomicCommitResultInternal { return this.owner.commitInternal(this); }
  abort(): void { this.owner.abortInternal(this); }
  dispose(): void { this.abort(); }
}

export class RevisionAtomicPresentationStagerInternal {
  readonly #root: Group;
  readonly #mount: RevisionAtomicMountInternal;
  readonly #maxCpuBytes: number;
  readonly #maxGpuBytes: number;
  readonly #maxPreparedTargets: number;
  readonly #leases = new Set<RevisionAtomicPresentationLeaseInternal>();
  readonly #retired = new Set<ThreeRevisionPresentationBundleInternal>();
  #displayedBundle: ThreeRevisionPresentationBundleInternal | null = null;
  #displayedTarget: RevisionAtomicPresentationTargetInternal | null = null;
  #swapped: RevisionAtomicPresentationLeaseInternal | null = null;
  #cpuBytes = 0;
  #gpuBytes = 0;
  #operationInProgress = false;
  #lifecycle: 'active' | 'disposing' | 'disposed' = 'active';

  constructor(options: RevisionAtomicPresentationStagerOptionsInternal) {
    this.#root = options.root;
    this.#maxCpuBytes = assertRevisionAtomicBudgetInternal(
      options.maxCpuStagingBytes,
      'maxCpuStagingBytes',
    );
    this.#maxGpuBytes = assertRevisionAtomicBudgetInternal(
      options.maxGpuStagingBytes,
      'maxGpuStagingBytes',
    );
    this.#maxPreparedTargets = assertRevisionAtomicBudgetInternal(
      options.maxPreparedTargets,
      'maxPreparedTargets',
      true,
    );
    this.#mount = options.mountInternal ?? {
      attach: (root) => { this.#root.add(root); },
      detach: (root) => { this.#root.remove(root); },
    };
  }

  get displayedTargetInternal(): RevisionAtomicPresentationTargetInternal | null {
    return this.#displayedTarget;
  }

  get displayedBundleInternal(): ThreeRevisionPresentationBundleInternal | null {
    return this.#displayedBundle;
  }

  metricsInternal(): RevisionAtomicStagingMetricsInternal {
    return Object.freeze({
      preparedTargets: this.#leases.size,
      cpuStagingBytes: this.#cpuBytes,
      gpuStagingBytes: this.#gpuBytes,
      pendingRetiredBundles: this.#retired.size,
    });
  }

  prepare(input: RevisionAtomicPrepareInputInternal): RevisionAtomicPresentationLeaseInternal {
    return this.#operate(() => {
      this.#assertActive();
      const requestedTarget = assertRevisionAtomicTargetInternal(input.target);
      let reserved = false;
      let reservedCpuBytes = 0;
      let reservedGpuBytes = 0;
      let bundle: ThreeRevisionPresentationBundleInternal | undefined;
      try {
        const retirementErrors = this.#retryRetiredBundles();
        if (retirementErrors.length > 0) {
          throw new AggregateError(
            retirementErrors,
            'Pending revision-atomic bundle retirement could not be completed.',
          );
        }
        if (typeof input.targetIsCurrent !== 'function'
          || !revisionAtomicCheckCurrentInternal(input.targetIsCurrent)) {
          throw new Error('Revision-atomic target is no longer current during preparation.');
        }
        if (this.#displayedTarget
          && this.#displayedTarget.worldId === requestedTarget.worldId
          && this.#displayedTarget.epoch === requestedTarget.epoch
          && this.#displayedTarget.revision >= requestedTarget.revision) {
          throw new Error('Revision-atomic target is not newer than the displayed revision.');
        }
        if ([...this.#leases].some((lease) =>
          lease.targetInternal.worldId === requestedTarget.worldId
          && lease.targetInternal.epoch === requestedTarget.epoch
          && lease.targetInternal.revision === requestedTarget.revision)) {
          throw new Error('Revision-atomic target already has a prepared lease.');
        }
        const validated = validateRevisionAtomicGroupsInternal(
          requestedTarget,
          input.presentation,
          input.groups,
        );
        const priorProfiledMeshes = this.#displayedTarget?.worldId === requestedTarget.worldId
          && this.#displayedTarget.epoch === requestedTarget.epoch
          ? this.#displayedBundle?.profiledMeshesInternal ?? []
          : [];
        const profiledMeshes: readonly RevisionAtomicProfiledMeshInternal[] = input.profiledChunks
          ? resolveRevisionAtomicProfiledMeshesInternal(
              input.presentation,
              validated.outputs,
              priorProfiledMeshes,
              input.profiledChunks,
            )
          : [];
        const selectedMeshes = input.profiledChunks
          ? profiledMeshes.map((mesh) => mesh.output)
          : validated.outputs.map((prepared) => prepared.output);
        const stagedPresentation = applySelectedGreedyMeshesInternal(
          input.presentation,
          selectedMeshes,
        );
        const gpuBytes = estimateRevisionAtomicGpuBytesInternal(stagedPresentation);
        this.#reserve(validated.cpuBytes, gpuBytes);
        reserved = true;
        reservedCpuBytes = validated.cpuBytes;
        reservedGpuBytes = gpuBytes;
        bundle = ThreeRevisionPresentationBundleInternal.createInternal(
          stagedPresentation,
          gpuBytes,
          profiledMeshes,
        );
        const lease = new RevisionAtomicPresentationLeaseInternal(
          this,
          requestedTarget,
          bundle,
          validated.cpuBytes,
          gpuBytes,
          Object.freeze([...input.groups]),
          input.targetIsCurrent,
        );
        this.#leases.add(lease);
        return lease;
      } catch (error) {
        const cleanup: unknown[] = [];
        if (bundle) {
          try { bundle.dispose(); } catch (caught) { cleanup.push(caught); }
        }
        if (reserved) this.#release(reservedCpuBytes, reservedGpuBytes);
        for (const group of input.groups) {
          try { group.cancel(group.token.groupId); } catch (caught) { cleanup.push(caught); }
        }
        throw combineErrors(error, cleanup, 'Revision-atomic preparation cleanup failed.');
      }
    });
  }

  swapInternal(lease: RevisionAtomicPresentationLeaseInternal): void {
    this.#operate(() => {
      this.#assertOwned(lease, 'prepared');
      if (this.#swapped) throw new Error('Another revision-atomic presentation is already swapped.');
      try {
        this.#commitGroups(lease);
        const previous = this.#displayedBundle;
        lease.previousBundleInternal = previous;
        try {
          if (previous) this.#mount.detach(previous.rootInternal);
          this.#mount.attach(lease.bundleInternal.rootInternal);
        } catch (error) {
          const restorationErrors: unknown[] = [];
          try { this.#mount.detach(lease.bundleInternal.rootInternal); } catch (caught) {
            restorationErrors.push(caught);
          }
          if (previous) {
            try { this.#mount.attach(previous.rootInternal); } catch (caught) {
              restorationErrors.push(caught);
            }
          }
          if (restorationErrors.length > 0) {
            lease.stateInternal = 'swapped';
            this.#swapped = lease;
            throw new AggregateError(
              [error, ...restorationErrors],
              'Revision-atomic scene restoration remains pending.',
              { cause: error },
            );
          }
          throw error;
        }
        lease.stateInternal = 'swapped';
        this.#swapped = lease;
      } catch (error) {
        if (lease.stateInternal === 'swapped') throw error;
        const cleanup = this.#finishAbort(lease);
        throw combineErrors(error, cleanup, 'Revision-atomic swap rollback failed.');
      }
    });
  }

  validateForRenderInternal(lease: RevisionAtomicPresentationLeaseInternal): void {
    this.#operate(() => {
      this.#assertOwned(lease, 'swapped');
      if (this.#stillEligible(lease)) return;
      const cleanup = this.#rollbackSwapped(lease);
      throw combineErrors(
        new Error('Revision-atomic target eligibility changed before render.'),
        cleanup,
        'Revision-atomic pre-render rollback failed.',
      );
    });
  }

  commitInternal(
    lease: RevisionAtomicPresentationLeaseInternal,
  ): RevisionAtomicCommitResultInternal {
    return this.#operate(() => {
      this.#assertOwned(lease, 'swapped');
      if (this.#swapped !== lease) throw new Error('Revision-atomic swap ownership was lost.');
      if (!this.#stillEligible(lease)) {
        const cleanup = this.#rollbackSwapped(lease);
        throw combineErrors(
          new Error('Revision-atomic target eligibility changed before post-render commit.'),
          cleanup,
          'Revision-atomic post-render rollback failed.',
        );
      }
      const previous = lease.previousBundleInternal;
      this.#displayedBundle = lease.bundleInternal;
      this.#displayedTarget = lease.targetInternal;
      this.#swapped = null;
      lease.stateInternal = 'committed';
      this.#leases.delete(lease);
      this.#release(lease.cpuBytesInternal, lease.gpuBytesInternal);
      let retirement: RevisionAtomicCommitResultInternal['retirement'] = 'complete';
      if (previous) {
        try {
          previous.dispose();
        } catch {
          this.#retired.add(previous);
          retirement = 'pending';
        }
      }
      return Object.freeze({
        status: 'committed',
        target: lease.targetInternal,
        retirement,
        pendingRetiredBundles: this.#retired.size,
      });
    });
  }

  retryRetiredInternal(): number {
    return this.#operate(() => {
      this.#assertActive();
      const before = this.#retired.size;
      const errors = this.#retryRetiredBundles();
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Revision-atomic retired bundle cleanup failed.');
      }
      return before - this.#retired.size;
    });
  }

  abortInternal(lease: RevisionAtomicPresentationLeaseInternal): void {
    this.#operate(() => {
      if (lease.stateInternal === 'aborted' || lease.stateInternal === 'committed') return;
      if (!this.#leases.has(lease)) throw new Error('Foreign revision-atomic presentation lease.');
      const errors: unknown[] = [];
      if (lease.stateInternal === 'swapped') {
        errors.push(...this.#restoreDisplayedRoot(lease));
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            'Revision-atomic displayed-root restoration remains pending.',
            { cause: errors.at(-1) },
          );
        }
      }
      errors.push(...this.#finishAbort(lease));
      if (errors.length > 0) throw new AggregateError(errors, 'Revision-atomic abort failed.');
    });
  }

  dispose(): void {
    this.#operate(() => {
      if (this.#lifecycle === 'disposed') return;
      this.#lifecycle = 'disposing';
      const errors: unknown[] = [];
      for (const lease of [...this.#leases]) {
        if (lease.stateInternal === 'swapped') {
          try { this.#mount.detach(lease.bundleInternal.rootInternal); } catch (error) { errors.push(error); }
          this.#swapped = null;
        }
        errors.push(...this.#finishAbort(lease));
      }
      if (this.#displayedBundle) {
        try { this.#displayedBundle.dispose(); } catch (error) { errors.push(error); }
        this.#displayedBundle = null;
        this.#displayedTarget = null;
      }
      for (const retired of [...this.#retired]) {
        try {
          retired.dispose();
          this.#retired.delete(retired);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 0) this.#lifecycle = 'disposed';
      if (errors.length > 0) throw new AggregateError(errors, 'Revision-atomic stager disposal failed.');
    });
  }

  #reserve(cpuBytes: number, gpuBytes: number): void {
    if (this.#leases.size >= this.#maxPreparedTargets) {
      throw new RangeError('Revision-atomic prepared target budget is exhausted.');
    }
    if (this.#cpuBytes + cpuBytes > this.#maxCpuBytes) {
      throw new RangeError('Revision-atomic CPU staging budget is exhausted.');
    }
    if (this.#gpuBytes + gpuBytes > this.#maxGpuBytes) {
      throw new RangeError('Revision-atomic GPU staging budget is exhausted.');
    }
    this.#cpuBytes += cpuBytes;
    this.#gpuBytes += gpuBytes;
  }

  #release(cpuBytes: number, gpuBytes: number): void {
    this.#cpuBytes -= cpuBytes;
    this.#gpuBytes -= gpuBytes;
  }

  #commitGroups(lease: RevisionAtomicPresentationLeaseInternal): void {
    if (!revisionAtomicCheckCurrentInternal(lease.targetIsCurrentInternal)) {
      throw new Error('Revision-atomic target eligibility changed before swap.');
    }
    if (!lease.groupsInternal.every(revisionAtomicGroupEligibilityCurrentInternal)) {
      throw new Error('Prepared scheduler group eligibility changed before swap.');
    }
    for (const group of lease.groupsInternal) {
      const result = group.commit(group.token);
      if (result.status !== 'committed'
        || result.outcome.groupId !== group.token.groupId
        || result.outputs !== group.token.outputs) {
        throw new Error(`Prepared scheduler group ${group.token.groupId} failed final commit.`);
      }
      lease.groupStatesInternal.set(group, 'committed');
    }
  }

  #stillEligible(lease: RevisionAtomicPresentationLeaseInternal): boolean {
    return revisionAtomicCheckCurrentInternal(lease.targetIsCurrentInternal)
      && lease.groupsInternal.every(revisionAtomicGroupEligibilityCurrentInternal);
  }

  #restoreDisplayedRoot(lease: RevisionAtomicPresentationLeaseInternal): unknown[] {
    const errors: unknown[] = [];
    try { this.#mount.detach(lease.bundleInternal.rootInternal); } catch (error) { errors.push(error); }
    if (lease.previousBundleInternal) {
      try { this.#mount.attach(lease.previousBundleInternal.rootInternal); } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 0 && this.#swapped === lease) this.#swapped = null;
    return errors;
  }

  #rollbackSwapped(lease: RevisionAtomicPresentationLeaseInternal): unknown[] {
    const restorationErrors = this.#restoreDisplayedRoot(lease);
    return restorationErrors.length > 0
      ? restorationErrors
      : this.#finishAbort(lease);
  }

  #finishAbort(lease: RevisionAtomicPresentationLeaseInternal): unknown[] {
    const errors: unknown[] = [];
    lease.stateInternal = 'aborting';
    for (const group of lease.groupsInternal) {
      if (lease.groupStatesInternal.get(group) !== 'prepared') continue;
      try {
        group.cancel(group.token.groupId);
        lease.groupStatesInternal.set(group, 'cancelled');
      } catch (error) {
        errors.push(error);
      }
    }
    try { lease.bundleInternal.dispose(); } catch (error) { errors.push(error); }
    const hasPreparedGroup = [...lease.groupStatesInternal.values()].includes('prepared');
    if (!hasPreparedGroup && lease.bundleInternal.isDisposedInternal) {
      lease.stateInternal = 'aborted';
      this.#leases.delete(lease);
      this.#release(lease.cpuBytesInternal, lease.gpuBytesInternal);
    }
    return errors;
  }

  #retryRetiredBundles(): unknown[] {
    const errors: unknown[] = [];
    for (const retired of [...this.#retired]) {
      try {
        retired.dispose();
        this.#retired.delete(retired);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  #assertOwned(
    lease: RevisionAtomicPresentationLeaseInternal,
    state: RevisionAtomicLeaseStateInternal,
  ): void {
    this.#assertActive();
    if (!this.#leases.has(lease)) throw new Error('Foreign revision-atomic presentation lease.');
    if (lease.stateInternal !== state) {
      throw new Error(`Revision-atomic presentation lease is ${lease.stateInternal}, expected ${state}.`);
    }
  }

  #assertActive(): void {
    if (this.#lifecycle !== 'active') {
      throw new Error(`Revision-atomic presentation stager is ${this.#lifecycle}.`);
    }
  }

  #operate<Result>(operation: () => Result): Result {
    if (this.#operationInProgress) {
      throw new Error('Revision-atomic presentation stager does not permit reentrant mutations.');
    }
    this.#operationInProgress = true;
    try {
      return operation();
    } finally {
      this.#operationInProgress = false;
    }
  }
}
