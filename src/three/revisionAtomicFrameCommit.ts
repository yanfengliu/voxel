import type { PreparedCanonicalPresentationInternal } from '../core/prepared-canonical-presentation.js';
import {
  abortPreparedCanonicalPresentationInternal,
  finalizePreparedCanonicalPresentationInternal,
  publishPreparedCanonicalPresentationInternal,
} from '../core/prepared-canonical-presentation.js';
import type { PreparedPresentedPickCandidateInternal } from './committedPresentedPickSnapshot.js';
import type {
  CommittedPresentedQueryAuthorityInternal,
  CommittedPresentedQueryPublicationInternal,
  QueryPublicationRetirementInternal,
} from './committedPresentedQueryAuthority.js';
import type { RevisionAtomicPresentationLeaseInternal } from './revisionAtomicPresentationLease.js';
import { combineRevisionAtomicErrorsInternal } from './revisionAtomicStagingSupport.js';
import type { RevisionAtomicCommitResultInternal } from './revisionAtomicStagingTypes.js';

export type RevisionAtomicFrameCommitPhaseInternal =
  | 'prepared'
  | 'activated'
  | 'committed'
  | 'aborted';

export type RevisionAtomicFrameSupersededReasonInternal =
  | 'canonical-superseded'
  | 'canonical-finalization-superseded';

export type RevisionAtomicFrameCommitOutcomeInternal =
  | {
      readonly status: 'committed';
      readonly three: RevisionAtomicCommitResultInternal;
      readonly queryRetirement?: QueryPublicationRetirementInternal;
    }
  | { readonly status: 'superseded'; readonly reason: RevisionAtomicFrameSupersededReasonInternal };

export interface RevisionAtomicFrameCommitOptionsInternal {
  readonly canonicalTicket: PreparedCanonicalPresentationInternal;
  readonly sceneLease: RevisionAtomicPresentationLeaseInternal;
}

/**
 * Optional committed-query participant. The candidate can only exist after
 * the draw (its manifest snapshots the drawn frame), so it joins the
 * transaction at commit time and the transaction takes its ownership.
 */
export interface RevisionAtomicQueryParticipantInternal {
  readonly authority: CommittedPresentedQueryAuthorityInternal;
  readonly candidate: PreparedPresentedPickCandidateInternal;
}

const ROLLBACK_MESSAGE_INTERNAL = 'Revision-atomic frame rollback failed.';

/** Releases a candidate the transaction owns but never published. */
function disposeCandidate(query: RevisionAtomicQueryParticipantInternal | undefined): unknown[] {
  if (!query) return [];
  try {
    query.candidate.dispose();
    return [];
  } catch (error) {
    return [error];
  }
}

function abortQueryPublication(
  publication: CommittedPresentedQueryPublicationInternal | null,
): unknown[] {
  if (!publication) return [];
  try {
    publication.abortInternal();
    return [];
  } catch (error) {
    return [error];
  }
}

/**
 * Sequences one canonical presentation ticket and one Three scene lease through
 * a single frame-boundary transaction so a rendered revision commits, or the
 * previously displayed revision is preserved, as an atomic unit.
 *
 * Ownership order (per the V-08 contract):
 *   1. Prepare canonical ticket and scene lease off-screen (done by the caller).
 *   2. `activateInternal` swaps in the staged scene and validates the target
 *      immediately before the caller draws. No query/capture lane advances yet.
 *   3. The caller draws once (standalone) or a host draws once and acknowledges.
 *   4. `commitInternal` tentatively publishes the visible scene lane, then the
 *      canonical lane.
 *   5. It finalizes the canonical ticket, whose waiter callbacks run
 *      synchronously and may reentrantly present a newer revision.
 *   6. It retires the superseded scene bundle only after that irrevocable commit.
 *   7. Any pre-finalization failure rolls back in reverse ownership order and
 *      preserves the prior displayed and pickable revision.
 *
 * The commit object itself must stay owned by the single frame driver. Waiter
 * callbacks may start a fresh nested commit against the same stores, but must
 * never receive this object: its phase guards assume one caller.
 */
export class RevisionAtomicFrameCommitInternal {
  readonly #canonicalTicket: PreparedCanonicalPresentationInternal;
  readonly #sceneLease: RevisionAtomicPresentationLeaseInternal;
  #phase: RevisionAtomicFrameCommitPhaseInternal = 'prepared';

  constructor(options: RevisionAtomicFrameCommitOptionsInternal) {
    this.#canonicalTicket = options.canonicalTicket;
    this.#sceneLease = options.sceneLease;
  }

  get phaseInternal(): RevisionAtomicFrameCommitPhaseInternal {
    return this.#phase;
  }

  activateInternal(): void {
    this.#assertPhase('prepared', 'activate');
    try {
      this.#sceneLease.activate();
      this.#sceneLease.validateForRender();
    } catch (error) {
      // The scene lease restored the previously displayed root (or reported a
      // pending restoration) before throwing; release the canonical ticket so
      // no half-open transaction survives.
      this.#phase = 'aborted';
      throw combineRevisionAtomicErrorsInternal(
        error,
        this.#abortCanonicalInternal(),
        'Revision-atomic frame activation failed.',
      );
    }
    this.#phase = 'activated';
  }

  commitInternal(
    query?: RevisionAtomicQueryParticipantInternal,
  ): RevisionAtomicFrameCommitOutcomeInternal {
    this.#assertPhase('activated', 'commit');
    // Step 4: publish the visible scene lane tentatively.
    try {
      this.#sceneLease.publish();
    } catch (error) {
      this.#phase = 'aborted';
      throw combineRevisionAtomicErrorsInternal(
        error,
        [...this.#abortCanonicalInternal(), ...disposeCandidate(query)],
        ROLLBACK_MESSAGE_INTERNAL,
      );
    }
    // Step 4 (continued): publish the committed query lane tentatively so a
    // waiter observing canonical readiness can already pick the same frame.
    let queryPublication: CommittedPresentedQueryPublicationInternal | null = null;
    if (query) {
      try {
        queryPublication = query.authority.publishInternal(query.candidate);
      } catch (error) {
        this.#phase = 'aborted';
        throw combineRevisionAtomicErrorsInternal(
          error,
          [
            ...this.#abortCanonicalInternal(),
            ...this.#abortSceneInternal(),
            ...disposeCandidate(query),
          ],
          ROLLBACK_MESSAGE_INTERNAL,
        );
      }
    }
    // Step 4 (continued): publish the canonical lane tentatively.
    let canonicalPublished: boolean;
    try {
      canonicalPublished = publishPreparedCanonicalPresentationInternal(this.#canonicalTicket);
    } catch (error) {
      this.#phase = 'aborted';
      throw combineRevisionAtomicErrorsInternal(
        error,
        [...abortQueryPublication(queryPublication), ...this.#abortSceneInternal()],
        ROLLBACK_MESSAGE_INTERNAL,
      );
    }
    if (!canonicalPublished) {
      // A newer revision was accepted after preparation; the canonical ticket
      // rolled its own tentative state back. Restore the query and scene lanes.
      return this.#supersedeInternal('canonical-superseded', queryPublication);
    }
    // Step 5: irrevocable canonical commit. Waiter callbacks run synchronously
    // here and may accept or present a newer revision reentrantly.
    //
    // Rolling the scene back in this catch is sound only because a finalize
    // throw implies the ledger commit did not land: the post-markPresented
    // path in render-world-presentation runs pure retained-byte arithmetic
    // and settles waiters through resolve/removeAbortListener guards that do
    // not propagate callback failures. Only pre-commit accounting can throw,
    // and the ticket restores its tentative canonical publication first.
    let canonicalFinalized: boolean;
    try {
      canonicalFinalized = finalizePreparedCanonicalPresentationInternal(this.#canonicalTicket);
    } catch (error) {
      this.#phase = 'aborted';
      throw combineRevisionAtomicErrorsInternal(
        error,
        [...abortQueryPublication(queryPublication), ...this.#abortSceneInternal()],
        ROLLBACK_MESSAGE_INTERNAL,
      );
    }
    if (!canonicalFinalized) {
      // Defensive: a successful publication guarantees a successful ledger
      // commit unless a reentrant settlement invalidated it. Treat the same as
      // supersession and preserve the prior displayed revision. Rolling the
      // query lane back here cannot see a reentrant successor: waiters only
      // run inside a successful ledger commit, and this branch means that
      // commit did not land, so this publication is still the newest one.
      return this.#supersedeInternal('canonical-finalization-superseded', queryPublication);
    }
    // Step 6: retire the superseded query snapshot and scene bundle now that
    // the commit is irrevocable. A reentrant successor may already have
    // retired this frame's own snapshot/bundle; finalize only releases this
    // frame's predecessors. A waiter callback may also have disposed either
    // owner outright, so a retirement failure here is reported over a
    // committed transaction: the canonical lane cannot roll back, and abort
    // must stay a no-op.
    this.#phase = 'committed';
    const retirementErrors: unknown[] = [];
    let queryRetirement: QueryPublicationRetirementInternal | undefined;
    if (queryPublication) {
      try {
        queryRetirement = queryPublication.finalizeInternal();
      } catch (error) {
        retirementErrors.push(error);
      }
    }
    let three: RevisionAtomicCommitResultInternal | undefined;
    try {
      three = this.#sceneLease.finalize();
    } catch (error) {
      retirementErrors.push(error);
    }
    if (three === undefined || retirementErrors.length > 0) {
      throw new AggregateError(
        retirementErrors,
        'Revision-atomic frame committed; retirement failed.',
        { cause: retirementErrors[0] },
      );
    }
    return Object.freeze({
      status: 'committed',
      three,
      ...(queryRetirement !== undefined ? { queryRetirement } : {}),
    });
  }

  abortInternal(): void {
    if (this.#phase === 'committed' || this.#phase === 'aborted') return;
    this.#phase = 'aborted';
    // Reverse ownership order: restore the scene lane, then the canonical lane.
    const errors = [...this.#abortSceneInternal(), ...this.#abortCanonicalInternal()];
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Revision-atomic frame abort failed.');
    }
  }

  #supersedeInternal(
    reason: RevisionAtomicFrameSupersededReasonInternal,
    queryPublication: CommittedPresentedQueryPublicationInternal | null,
  ): RevisionAtomicFrameCommitOutcomeInternal {
    this.#phase = 'aborted';
    const rollbackErrors = [
      ...abortQueryPublication(queryPublication),
      ...this.#abortSceneInternal(),
    ];
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        rollbackErrors,
        `Revision-atomic frame rollback failed after ${reason}.`,
      );
    }
    return Object.freeze({ status: 'superseded', reason });
  }

  #abortSceneInternal(): unknown[] {
    try {
      this.#sceneLease.abort();
      return [];
    } catch (error) {
      return [error];
    }
  }

  #abortCanonicalInternal(): unknown[] {
    try {
      abortPreparedCanonicalPresentationInternal(this.#canonicalTicket);
      return [];
    } catch (error) {
      return [error];
    }
  }

  #assertPhase(expected: RevisionAtomicFrameCommitPhaseInternal, action: string): void {
    if (this.#phase !== expected) {
      throw new Error(
        `Revision-atomic frame commit cannot ${action} while ${this.#phase}; expected ${expected}.`,
      );
    }
  }
}
