import { describe, expect, it } from 'vitest';

import { CommittedPresentedQueryAuthorityInternal } from '../../src/three/committedPresentedQueryAuthority.js';
import { pickCandidateFixture } from './committed-pick-fixtures.js';

describe('committed presented query authority', () => {
  it('publishes tentatively and retains the predecessor snapshot', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    const firstPublication = authority.publishInternal(first.candidate);
    expect(firstPublication.finalizeInternal()).toBe('complete');
    const firstSnapshot = authority.currentInternal!;

    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    expect(authority.currentInternal).toBe(publication.snapshotInternal);
    expect(authority.currentInternal?.frameInternal.presentedRevision).toBe(2);
    expect(firstSnapshot.disposalCompleteInternal).toBe(false);
    expect(authority.publicationsInternal).toBe(1);
  });

  it('finalize disposes exactly the predecessor', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    authority.publishInternal(first.candidate).finalizeInternal();
    const firstSnapshot = authority.currentInternal!;
    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    expect(publication.finalizeInternal()).toBe('complete');

    expect(firstSnapshot.disposalCompleteInternal).toBe(true);
    expect(authority.currentInternal).toBe(publication.snapshotInternal);
    expect(authority.currentInternal?.disposalCompleteInternal).toBe(false);
    expect(authority.publicationsInternal).toBe(0);
    expect(first.releaseAttempts()).toBe(1);
  });

  it('reports pending retirement on predecessor disposal failure and retries later', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1, { failLeaseReleases: 1 });
    authority.publishInternal(first.candidate).finalizeInternal();
    const firstSnapshot = authority.currentInternal!;
    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    expect(publication.finalizeInternal()).toBe('pending');
    expect(firstSnapshot.disposalCompleteInternal).toBe(false);
    expect(authority.pendingRetiredInternal).toBe(1);

    expect(authority.retryRetiredInternal()).toBe(1);
    expect(firstSnapshot.disposalCompleteInternal).toBe(true);
    expect(authority.pendingRetiredInternal).toBe(0);
    expect(first.releaseAttempts()).toBe(2);
  });

  it('abort restores the predecessor and disposes the aborted snapshot', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    authority.publishInternal(first.candidate).finalizeInternal();
    const firstSnapshot = authority.currentInternal!;
    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    publication.abortInternal();

    expect(authority.currentInternal).toBe(firstSnapshot);
    expect(firstSnapshot.disposalCompleteInternal).toBe(false);
    expect(publication.snapshotInternal.disposalCompleteInternal).toBe(true);
    expect(authority.publicationsInternal).toBe(0);
  });

  it('refuses to abort a superseded publication and keeps the successor authority', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    const firstPublication = authority.publishInternal(first.candidate);
    const second = pickCandidateFixture(2);
    const secondPublication = authority.publishInternal(second.candidate);

    expect(() => firstPublication.abortInternal()).toThrow(/superseded/i);
    expect(authority.currentInternal).toBe(secondPublication.snapshotInternal);
  });

  it('lets a superseded published predecessor finalize its own predecessor only', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const base = pickCandidateFixture(1);
    authority.publishInternal(base.candidate).finalizeInternal();
    const baseSnapshot = authority.currentInternal!;

    const second = pickCandidateFixture(2);
    const secondPublication = authority.publishInternal(second.candidate);
    const secondSnapshot = secondPublication.snapshotInternal;
    const third = pickCandidateFixture(3);
    const thirdPublication = authority.publishInternal(third.candidate);

    // The successor settles first (the reentrant waiter pattern), then the
    // superseded predecessor finalizes after it.
    expect(thirdPublication.finalizeInternal()).toBe('complete');
    expect(secondSnapshot.disposalCompleteInternal).toBe(true);
    expect(baseSnapshot.disposalCompleteInternal).toBe(false);

    expect(secondPublication.finalizeInternal()).toBe('complete');
    expect(baseSnapshot.disposalCompleteInternal).toBe(true);
    expect(authority.currentInternal).toBe(thirdPublication.snapshotInternal);
    expect(authority.currentInternal?.disposalCompleteInternal).toBe(false);
    expect(authority.publicationsInternal).toBe(0);
  });

  it('rejects publication reuse and repeated settlement', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    const publication = authority.publishInternal(first.candidate);
    expect(publication.finalizeInternal()).toBe('complete');

    expect(() => publication.finalizeInternal()).toThrow(/finalized/i);
    expect(() => publication.abortInternal()).toThrow(/finalized/i);
    expect(() => authority.publishInternal(first.candidate)).toThrow(/committed/i);
  });

  it('does not permit reentrant mutation from a disposal callback', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    let reentrantError: unknown;
    const first = pickCandidateFixture(1, {
      onLeaseRelease: () => {
        try {
          authority.publishInternal(pickCandidateFixture(9).candidate);
        } catch (error) {
          reentrantError = error;
          throw error;
        }
      },
    });
    authority.publishInternal(first.candidate).finalizeInternal();
    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    // The hostile lease release runs inside finalize; its reentrant publish
    // must be refused and the retirement recorded as pending.
    expect(publication.finalizeInternal()).toBe('pending');
    expect(reentrantError).toBeInstanceOf(Error);
    expect(String(reentrantError)).toMatch(/reentrant/i);
  });

  it('retries disposal debt when a snapshot fails to dispose during dispose', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1, { failLeaseReleases: 1 });
    authority.publishInternal(first.candidate).finalizeInternal();
    const firstSnapshot = authority.currentInternal!;

    expect(() => authority.dispose()).toThrow(AggregateError);
    expect(firstSnapshot.disposalCompleteInternal).toBe(false);

    // A repeated dispose retries the retained disposal debt to completion.
    expect(() => authority.dispose()).not.toThrow();
    expect(firstSnapshot.disposalCompleteInternal).toBe(true);
    expect(first.releaseAttempts()).toBe(2);
    const late = pickCandidateFixture(2);
    expect(() => authority.publishInternal(late.candidate)).toThrow(/dispos/i);
  });

  it('dispose settles every retained snapshot and refuses later publications', () => {
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const first = pickCandidateFixture(1);
    authority.publishInternal(first.candidate).finalizeInternal();
    const firstSnapshot = authority.currentInternal!;
    const second = pickCandidateFixture(2);
    const publication = authority.publishInternal(second.candidate);

    authority.dispose();

    expect(firstSnapshot.disposalCompleteInternal).toBe(true);
    expect(publication.snapshotInternal.disposalCompleteInternal).toBe(true);
    expect(authority.currentInternal).toBeNull();
    expect(authority.publicationsInternal).toBe(0);

    const late = pickCandidateFixture(3);
    expect(() => authority.publishInternal(late.candidate)).toThrow(/disposed/i);
    // The rejected candidate must not leak its snapshot.
    expect(() => late.candidate.commitInternal()).toThrow(/discarded/i);
  });
});
