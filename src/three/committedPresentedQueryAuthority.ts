import type {
  CommittedPresentedPickSnapshotInternal,
  PreparedPresentedPickCandidateInternal,
} from './committedPresentedPickSnapshot.js';

type QueryPublicationStateInternal = 'published' | 'finalized' | 'aborted';

export type QueryPublicationRetirementInternal = 'complete' | 'pending';

/**
 * One reversible publication of a committed pick snapshot. `finalizeInternal`
 * retires this publication's own predecessor only, so a superseded published
 * predecessor may settle after a reentrant successor has already advanced the
 * authority (mirroring the revision-atomic scene lease contract).
 */
export class CommittedPresentedQueryPublicationInternal {
  stateInternal: QueryPublicationStateInternal = 'published';

  constructor(
    private readonly owner: CommittedPresentedQueryAuthorityInternal,
    readonly snapshotInternal: CommittedPresentedPickSnapshotInternal,
    readonly previousInternal: CommittedPresentedPickSnapshotInternal | null,
  ) {}

  finalizeInternal(): QueryPublicationRetirementInternal {
    return this.owner.finalizePublicationInternal(this);
  }

  abortInternal(): void {
    this.owner.abortPublicationInternal(this);
  }
}

/**
 * Owns the committed presented pick snapshot that public queries are allowed
 * to read. Publications are tentative until finalized: the predecessor stays
 * alive so an abort can restore it byte-for-byte, and it is disposed only
 * after the canonical frame commit has become irrevocable.
 */
export class CommittedPresentedQueryAuthorityInternal {
  #current: CommittedPresentedPickSnapshotInternal | null = null;
  readonly #publications = new Set<CommittedPresentedQueryPublicationInternal>();
  readonly #retired = new Set<CommittedPresentedPickSnapshotInternal>();
  #operationInProgress = false;
  #lifecycle: 'active' | 'disposing' | 'disposed' = 'active';

  get currentInternal(): CommittedPresentedPickSnapshotInternal | null {
    return this.#current;
  }

  get publicationsInternal(): number {
    return this.#publications.size;
  }

  get pendingRetiredInternal(): number {
    return this.#retired.size;
  }

  publishInternal(
    candidate: PreparedPresentedPickCandidateInternal,
  ): CommittedPresentedQueryPublicationInternal {
    return this.#operate(() => {
      if (this.#lifecycle !== 'active') {
        let cleanup: unknown;
        try { candidate.dispose(); } catch (caught) { cleanup = caught; }
        const error = new Error(`Committed presented query authority is ${this.#lifecycle}.`);
        if (cleanup !== undefined) {
          throw new AggregateError(
            [error, cleanup],
            'Rejected query publication cleanup failed.',
            { cause: error },
          );
        }
        throw error;
      }
      const retryErrors = this.#retryRetired();
      if (retryErrors.length > 0) {
        throw new AggregateError(
          retryErrors,
          'Pending committed query snapshot retirement could not be completed.',
        );
      }
      const snapshot = candidate.commitInternal();
      const publication = new CommittedPresentedQueryPublicationInternal(
        this,
        snapshot,
        this.#current,
      );
      this.#publications.add(publication);
      this.#current = snapshot;
      return publication;
    });
  }

  finalizePublicationInternal(
    publication: CommittedPresentedQueryPublicationInternal,
  ): QueryPublicationRetirementInternal {
    return this.#operate(() => {
      this.#assertOwned(publication);
      publication.stateInternal = 'finalized';
      this.#publications.delete(publication);
      return this.#retire(publication.previousInternal);
    });
  }

  abortPublicationInternal(publication: CommittedPresentedQueryPublicationInternal): void {
    this.#operate(() => {
      this.#assertOwned(publication);
      if (this.#current !== publication.snapshotInternal) {
        throw new Error('A superseded committed query publication cannot be aborted.');
      }
      this.#current = publication.previousInternal;
      publication.stateInternal = 'aborted';
      this.#publications.delete(publication);
      this.#retire(publication.snapshotInternal);
    });
  }

  /**
   * Drops the committed snapshot at a device transition. The canvas is about
   * to be reconstructed from canonical state, and a snapshot stamped with the
   * lost device's generation must not resurface as "the frame the canvas
   * shows" once the runtime runs again — picking would then describe a frame
   * capture no longer agrees exists. Queries report no-presented-frame until
   * the next revision commits after restoration.
   */
  invalidateForDeviceTransitionInternal(): void {
    this.#operate(() => {
      if (this.#lifecycle !== 'active') return;
      const current = this.#current;
      this.#current = null;
      this.#retire(current);
    });
  }

  retryRetiredInternal(): number {
    return this.#operate(() => {
      this.#assertActive();
      const before = this.#retired.size;
      const errors = this.#retryRetired();
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Committed query snapshot retirement retry failed.');
      }
      return before - this.#retired.size;
    });
  }

  dispose(): void {
    this.#operate(() => {
      if (this.#lifecycle === 'disposed') return;
      this.#lifecycle = 'disposing';
      const snapshots = new Set<CommittedPresentedPickSnapshotInternal>(this.#retired);
      for (const publication of this.#publications) {
        snapshots.add(publication.snapshotInternal);
        if (publication.previousInternal) snapshots.add(publication.previousInternal);
        publication.stateInternal = 'aborted';
      }
      if (this.#current) snapshots.add(this.#current);
      this.#publications.clear();
      this.#current = null;
      const errors: unknown[] = [];
      for (const snapshot of snapshots) {
        try {
          snapshot.dispose();
          this.#retired.delete(snapshot);
        } catch (error) {
          // Retain the debt so a repeated dispose can retry it to completion.
          this.#retired.add(snapshot);
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(
          errors,
          'Committed presented query authority disposal failed.',
        );
      }
      this.#lifecycle = 'disposed';
    });
  }

  #retire(
    snapshot: CommittedPresentedPickSnapshotInternal | null,
  ): QueryPublicationRetirementInternal {
    if (!snapshot) return 'complete';
    try {
      snapshot.dispose();
      this.#retired.delete(snapshot);
      return 'complete';
    } catch {
      this.#retired.add(snapshot);
      return 'pending';
    }
  }

  #retryRetired(): unknown[] {
    const errors: unknown[] = [];
    for (const snapshot of [...this.#retired]) {
      try {
        snapshot.dispose();
        this.#retired.delete(snapshot);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  #assertOwned(publication: CommittedPresentedQueryPublicationInternal): void {
    this.#assertActive();
    if (publication.stateInternal !== 'published') {
      throw new Error(
        `Committed query publication is already ${publication.stateInternal}.`,
      );
    }
    if (!this.#publications.has(publication)) {
      throw new Error('Foreign committed query publication.');
    }
  }

  #assertActive(): void {
    if (this.#lifecycle !== 'active') {
      throw new Error(`Committed presented query authority is ${this.#lifecycle}.`);
    }
  }

  #operate<Result>(operation: () => Result): Result {
    if (this.#operationInProgress) {
      throw new Error(
        'Committed presented query authority does not permit reentrant mutations.',
      );
    }
    this.#operationInProgress = true;
    try {
      return operation();
    } finally {
      this.#operationInProgress = false;
    }
  }
}
