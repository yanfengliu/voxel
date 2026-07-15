import type { CanonicalRenderStateV1 } from '../core/canonical-store.js';
import {
  PresentationStagingTrackerInternal,
  type PresentationStagingHoldInternal,
  type PresentationStagingMetricsSnapshotInternal,
} from './presentationStagingMetrics.js';
import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export type RuntimePresentationRoleInternal = 'pending' | 'presented';

/**
 * Owns runtime presentation identity and CPU staging retention independently
 * from ingest, frame settlement, rendering, and lifecycle policy.
 */
export class RuntimePresentationRetentionInternal {
  readonly #byCanonicalState = new WeakMap<
    CanonicalRenderStateV1,
    ThreePresentationSnapshot
  >();
  readonly #hostHolds = new Map<object, PresentationStagingHoldInternal | null>();
  readonly #staging: PresentationStagingTrackerInternal;
  #pending: ThreePresentationSnapshot | null = null;
  #presented: ThreePresentationSnapshot | null = null;
  #pendingHold: PresentationStagingHoldInternal | null = null;

  constructor(
    getPresentedCanonicalState: () => CanonicalRenderStateV1 | null,
  ) {
    this.#staging = new PresentationStagingTrackerInternal(() => {
      const state = getPresentedCanonicalState();
      return [
        this.#presented,
        state ? this.#byCanonicalState.get(state) : null,
      ];
    });
  }

  get pendingInternal(): ThreePresentationSnapshot | null {
    return this.#pending;
  }

  get presentedInternal(): ThreePresentationSnapshot | null {
    return this.#presented;
  }

  retainCandidateInternal(
    presentation: ThreePresentationSnapshot,
  ): PresentationStagingHoldInternal {
    return this.#staging.retainInternal(presentation);
  }

  rememberInternal(
    state: CanonicalRenderStateV1,
    presentation: ThreePresentationSnapshot,
  ): void {
    this.#byCanonicalState.set(state, presentation);
  }

  resolveInternal(
    state: CanonicalRenderStateV1,
    role: RuntimePresentationRoleInternal,
  ): ThreePresentationSnapshot | null {
    return this.#byCanonicalState.get(state)
      ?? (role === 'pending' ? this.#pending : this.#presented);
  }

  setPendingInternal(presentation: ThreePresentationSnapshot | null): void {
    if (this.#pending === presentation) return;
    const nextHold = presentation ? this.#staging.retainInternal(presentation) : null;
    const previousHold = this.#pendingHold;
    this.#pending = presentation;
    this.#pendingHold = nextHold;
    previousHold?.releaseInternal();
  }

  markCommittedInternal(presentation: ThreePresentationSnapshot): void {
    this.#staging.markCommittedInternal(presentation);
  }

  setPresentedInternal(presentation: ThreePresentationSnapshot | null): void {
    this.#presented = presentation;
  }

  retainHostFrameInternal(
    owner: object,
    presentation: ThreePresentationSnapshot | null,
  ): void {
    if (this.#hostHolds.has(owner)) {
      throw new Error('The host presentation is already retained.');
    }
    this.#hostHolds.set(
      owner,
      presentation ? this.#staging.retainInternal(presentation) : null,
    );
  }

  releaseHostFrameInternal(owner: object): void {
    if (!this.#hostHolds.has(owner)) return;
    this.#hostHolds.get(owner)?.releaseInternal();
    this.#hostHolds.delete(owner);
  }

  metricsInternal(): PresentationStagingMetricsSnapshotInternal {
    return this.#staging.metricsInternal();
  }

  disposeInternal(): void {
    this.#pendingHold?.releaseInternal();
    this.#pendingHold = null;
    for (const hold of this.#hostHolds.values()) hold?.releaseInternal();
    this.#hostHolds.clear();
    this.#staging.disposeInternal();
    this.#pending = null;
    this.#presented = null;
  }
}
