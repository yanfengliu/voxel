import type { ThreeRevisionPresentationBundleInternal } from './revisionAtomicBundle.js';
import type { RevisionAtomicPresentationStagerInternal } from './revisionAtomicStaging.js';
import type {
  RevisionAtomicCommitResultInternal,
  RevisionAtomicGroupPortInternal,
  RevisionAtomicLeaseStateInternal,
  RevisionAtomicPresentationTargetInternal,
} from './revisionAtomicStagingTypes.js';

type GroupStateInternal = 'prepared' | 'committed' | 'cancelled';

export class RevisionAtomicPresentationLeaseInternal {
  stateInternal: RevisionAtomicLeaseStateInternal = 'prepared';
  previousBundleInternal: ThreeRevisionPresentationBundleInternal | null = null;
  previousTargetInternal: RevisionAtomicPresentationTargetInternal | null = null;
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

  activate(): void { this.owner.swapInternal(this); }
  /** Compatibility alias while internal callers migrate to activate(). */
  swap(): void { this.activate(); }
  validateForRender(): void { this.owner.validateForRenderInternal(this); }
  publish(): void { this.owner.publishInternal(this); }
  finalize(): RevisionAtomicCommitResultInternal { return this.owner.finalizeInternal(this); }
  /** Compatibility one-shot for existing internal callers. */
  commit(): RevisionAtomicCommitResultInternal { return this.owner.commitInternal(this); }
  abort(): void { this.owner.abortInternal(this); }
  dispose(): void { this.abort(); }
}
