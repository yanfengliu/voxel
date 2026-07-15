import { describe, expect, it } from 'vitest';
import { Group } from 'three';

import type {
  PresentationAbortSignalV1,
  RenderWorld as RenderWorldType,
} from '../../src/core/index.js';
import { RenderWorld } from '../../src/core/index.js';
import type { CanonicalRenderStateV1 } from '../../src/core/canonical-store.js';
import {
  pendingCanonicalStateForPresentationInternal,
  prepareCanonicalPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
} from '../../src/core/render-world.js';
import { CommittedPresentedQueryAuthorityInternal } from '../../src/three/committedPresentedQueryAuthority.js';
import { RevisionAtomicFrameCommitInternal } from '../../src/three/revisionAtomicFrameCommit.js';
import {
  RevisionAtomicPresentationStagerInternal,
  type RevisionAtomicMountInternal,
} from '../../src/three/revisionAtomicStaging.js';
import { validSnapshot } from '../core/fixtures.js';
import { pickCandidateFixture } from './committed-pick-fixtures.js';
import {
  greedyOutput,
  groupPort,
  preparedGroup,
  presentation,
  profiledRequirement,
  target,
} from './revision-atomic-staging-fixtures.js';

function presentedWorldAtRevisionOne(): RenderWorldType {
  const world = new RenderWorld();
  expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
  expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
  return world;
}

// The canonical world (validSnapshot) and the Three scene fixtures address
// distinct worldId/epoch chains; the frame-commit primitive is deliberately
// chain-agnostic. Use the canonical chain for RenderWorld readiness/waiter
// calls and the scene `target()` for the stager's displayed-target checks.
function coreTarget(revision: number) {
  return { worldId: 'world:test', epoch: 'epoch:one', revision } as const;
}

function acceptRevision(world: RenderWorldType, revision: number): CanonicalRenderStateV1 {
  expect(world.acceptSnapshot(validSnapshot(revision)).status).toBe('accepted');
  return pendingCanonicalStateForPresentationInternal(world)!;
}

function coreTicketFor(world: RenderWorldType, rendered: CanonicalRenderStateV1) {
  const ticket = prepareCanonicalPresentationInternal(world, rendered);
  expect(ticket).not.toBeNull();
  return ticket!;
}

function makeStager(
  root: Group,
  mountInternal?: RevisionAtomicMountInternal,
): RevisionAtomicPresentationStagerInternal {
  return new RevisionAtomicPresentationStagerInternal({
    root,
    maxCpuStagingBytes: 4_000_000,
    maxGpuStagingBytes: 4_000_000,
    maxPreparedTargets: 4,
    ...(mountInternal ? { mountInternal } : {}),
  });
}

interface SceneLeaseOptions {
  readonly currentGetter?: () => boolean;
}

function prepareSceneLease(
  atomic: RevisionAtomicPresentationStagerInternal,
  revision: number,
  options: SceneLeaseOptions = {},
) {
  const output = greedyOutput(`chunk:r${String(revision)}`, { x: 0, y: 0, z: 0 }, revision);
  const requestedTarget = target(revision);
  const port = groupPort(preparedGroup(requestedTarget, output));
  const lease = atomic.prepare({
    target: requestedTarget,
    presentation: presentation(revision, output, requestedTarget.epoch),
    groups: [port],
    profiledChunks: [profiledRequirement(output)],
    targetIsCurrent: options.currentGetter ?? (() => true),
  });
  return { lease, port };
}

/** Commits an R1 scene bundle so a later lease has a predecessor to retire. */
function sceneDisplayingRevisionOne(mountInternal?: RevisionAtomicMountInternal) {
  const root = new Group();
  const atomic = makeStager(root, mountInternal);
  const first = prepareSceneLease(atomic, 1);
  first.lease.activate();
  first.lease.commit();
  return { root, atomic, firstBundle: first.lease.bundleInternal };
}

function hostileRemovalSignal(onRemove: () => void): PresentationAbortSignalV1 {
  let invoked = false;
  return {
    aborted: false,
    addEventListener: () => undefined,
    removeEventListener: () => {
      if (invoked) return;
      invoked = true;
      onRemove();
    },
  };
}

describe('revision-atomic frame commit', () => {
  it('commits a rendered revision across the canonical and scene lanes', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    const result = commit.commitInternal();

    expect(result).toEqual({
      status: 'committed',
      three: {
        status: 'committed',
        target: target(2),
        retirement: 'complete',
        pendingRetiredBundles: 0,
      },
    });
    expect(commit.phaseInternal).toBe('committed');
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(atomic.displayedTargetInternal).toEqual(target(2));
    expect(root.children).toEqual([scene.lease.bundleInternal.rootInternal]);
    expect(firstBundle.isDisposedInternal).toBe(true);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
    expect(world.presentationReadiness(coreTarget(2))).toMatchObject({ status: 'ready' });
  });

  it('keeps the prior presented revision queryable until the draw is acknowledged', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();

    // The scene graph shows the new bundle so the host can draw it, but no
    // query/capture lane has advanced: presented canonical and the displayed
    // pick target both still resolve to the previous revision.
    expect(commit.phaseInternal).toBe('activated');
    expect(root.children).toEqual([scene.lease.bundleInternal.rootInternal]);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(firstBundle.isDisposedInternal).toBe(false);
    expect(world.presentationReadiness(coreTarget(2))).toMatchObject({ status: 'not-ready' });

    commit.commitInternal();
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(atomic.displayedTargetInternal).toEqual(target(2));
  });

  it('restores the prior revision when the frame is aborted after activation', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    commit.abortInternal();

    expect(commit.phaseInternal).toBe('aborted');
    expect(root.children).toEqual([firstBundle.rootInternal]);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(scene.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(world.presentationReadiness(coreTarget(2))).toMatchObject({ status: 'not-ready' });
  });

  it('reports supersession and preserves the prior revision when canonical acceptance drifts', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();

    // A newer snapshot lands after the draw but before the commit settles.
    acceptRevision(world, 3);

    const result = commit.commitInternal();
    expect(result).toEqual({ status: 'superseded', reason: 'canonical-superseded' });
    expect(commit.phaseInternal).toBe('aborted');
    expect(root.children).toEqual([firstBundle.rootInternal]);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(scene.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
  });

  it('rethrows and preserves the prior revision when the scene lane publication fails', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    let current = true;
    const scene = prepareSceneLease(atomic, 2, { currentGetter: () => current });
    const ticket = coreTicketFor(world, rendered);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: ticket,
      sceneLease: scene.lease,
    });
    commit.activateInternal();

    // Eligibility is lost between the draw and the post-draw publication.
    current = false;
    expect(() => commit.commitInternal()).toThrow(/eligibility changed/i);

    expect(commit.phaseInternal).toBe('aborted');
    expect(root.children).toEqual([firstBundle.rootInternal]);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    // The canonical ticket was aborted, so a later acceptance still presents.
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
  });

  it('aggregates a scene rollback failure raised while handling supersession', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    let failDetach = false;
    const mount: RevisionAtomicMountInternal = {
      attach: (child) => { root.add(child); },
      detach: (child) => {
        if (failDetach) throw new Error('mount detach failed during rollback');
        root.remove(child);
      },
    };
    const root = new Group();
    const atomic = makeStager(root, mount);
    const first = prepareSceneLease(atomic, 1);
    first.lease.activate();
    first.lease.commit();
    const scene = prepareSceneLease(atomic, 2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    acceptRevision(world, 3);
    failDetach = true;

    expect(() => commit.commitInternal()).toThrow(AggregateError);
    expect(commit.phaseInternal).toBe('aborted');
  });

  it('guards duplicate and out-of-phase transitions', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });

    expect(() => commit.commitInternal()).toThrow(/prepared/i);
    commit.activateInternal();
    expect(() => commit.activateInternal()).toThrow(/activated/i);
    commit.commitInternal();
    expect(() => commit.commitInternal()).toThrow(/committed/i);
    // Aborting a committed frame is a no-op rather than an error.
    expect(() => commit.abortInternal()).not.toThrow();
    expect(commit.phaseInternal).toBe('committed');
  });

  it('stays committed when a waiter synchronously disposes the scene during finalization', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const disposeDuringFinalize = (): void => { atomic.dispose(); };
    void world.awaitPresented(coreTarget(2), {
      signal: hostileRemovalSignal(disposeDuringFinalize),
    });

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();

    // The canonical ledger commit is irrevocable before scene retirement runs,
    // so the disposal-provoked retirement failure surfaces as an error while
    // the transaction itself reports committed and refuses to roll back.
    expect(() => commit.commitInternal()).toThrow(/retirement/i);
    expect(commit.phaseInternal).toBe('committed');
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(world.presentationReadiness(coreTarget(2))).toMatchObject({ status: 'ready' });
    expect(() => commit.abortInternal()).not.toThrow();
    expect(commit.phaseInternal).toBe('committed');
  });

  it('aborts a never-activated frame without touching the displayed scene', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    const rendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });

    commit.abortInternal();

    expect(commit.phaseInternal).toBe('aborted');
    expect(root.children).toEqual([firstBundle.rootInternal]);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    expect(scene.port.cancelSpy).toHaveBeenCalledTimes(1);
    expect(scene.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
    // The canonical ticket was released, so the same rendered state may be
    // prepared and presented again by a later frame.
    const retry = coreTicketFor(world, rendered);
    expect(retry).not.toBeNull();
  });

  it('rejects a frame built over an already-committed scene lease without disturbing the display', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { root, atomic } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const first = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    first.activateInternal();
    first.commitInternal();

    const third = acceptRevision(world, 3);
    const reuse = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, third),
      sceneLease: scene.lease,
    });

    expect(() => reuse.activateInternal()).toThrow(/foreign/i);
    expect(reuse.phaseInternal).toBe('aborted');
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(atomic.displayedTargetInternal).toEqual(target(2));
    expect(root.children).toEqual([scene.lease.bundleInternal.rootInternal]);
  });

  it('advances the query authority atomically with the canonical and scene lanes', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const base = pickCandidateFixture(1);
    authority.publishInternal(base.candidate).finalizeInternal();
    const baseSnapshot = authority.currentInternal!;
    const next = pickCandidateFixture(2);

    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    // Preparing the candidate after the draw does not advance the authority.
    expect(authority.currentInternal).toBe(baseSnapshot);

    const result = commit.commitInternal({ authority, candidate: next.candidate });

    expect(result).toMatchObject({ status: 'committed', queryRetirement: 'complete' });
    expect(authority.currentInternal?.frameInternal.presentedRevision).toBe(2);
    expect(baseSnapshot.disposalCompleteInternal).toBe(true);
    expect(authority.publicationsInternal).toBe(0);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(atomic.displayedTargetInternal).toEqual(target(2));
  });

  it('restores the query authority when canonical acceptance drifts', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    const scene = prepareSceneLease(atomic, 2);
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const base = pickCandidateFixture(1);
    authority.publishInternal(base.candidate).finalizeInternal();
    const baseSnapshot = authority.currentInternal!;
    const next = pickCandidateFixture(2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    acceptRevision(world, 3);

    const result = commit.commitInternal({ authority, candidate: next.candidate });

    expect(result).toEqual({ status: 'superseded', reason: 'canonical-superseded' });
    expect(authority.currentInternal).toBe(baseSnapshot);
    expect(baseSnapshot.disposalCompleteInternal).toBe(false);
    expect(authority.publicationsInternal).toBe(0);
    expect(atomic.displayedTargetInternal).toEqual(target(1));
    // The superseded candidate's snapshot was published and rolled back.
    expect(() => next.candidate.commitInternal()).toThrow(/committed/i);
  });

  it('discards the candidate without publishing when the scene lane fails first', () => {
    const world = presentedWorldAtRevisionOne();
    const rendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    let current = true;
    const scene = prepareSceneLease(atomic, 2, { currentGetter: () => current });
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const base = pickCandidateFixture(1);
    authority.publishInternal(base.candidate).finalizeInternal();
    const baseSnapshot = authority.currentInternal!;
    const next = pickCandidateFixture(2);
    const commit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, rendered),
      sceneLease: scene.lease,
    });
    commit.activateInternal();
    current = false;

    expect(() => commit.commitInternal({ authority, candidate: next.candidate }))
      .toThrow(/eligibility changed/i);

    expect(authority.currentInternal).toBe(baseSnapshot);
    expect(authority.publicationsInternal).toBe(0);
    // The transaction took ownership of the candidate and released it.
    expect(() => next.candidate.commitInternal()).toThrow(/discarded/i);
  });

  it('chains query authority publications through a reentrant waiter commit', () => {
    const world = presentedWorldAtRevisionOne();
    const secondRendered = acceptRevision(world, 2);
    const { atomic } = sceneDisplayingRevisionOne();
    const second = prepareSceneLease(atomic, 2);
    const third = prepareSceneLease(atomic, 3);
    const authority = new CommittedPresentedQueryAuthorityInternal();
    const secondPick = pickCandidateFixture(2);
    const thirdPick = pickCandidateFixture(3);

    let reentrantError: unknown;
    let thirdResult: unknown;
    const reentrantCommit = (): void => {
      try {
        const thirdRendered = acceptRevision(world, 3);
        const nested = new RevisionAtomicFrameCommitInternal({
          canonicalTicket: coreTicketFor(world, thirdRendered),
          sceneLease: third.lease,
        });
        nested.activateInternal();
        thirdResult = nested.commitInternal({ authority, candidate: thirdPick.candidate });
      } catch (error) {
        reentrantError = error;
      }
    };
    void world.awaitPresented(coreTarget(2), { signal: hostileRemovalSignal(reentrantCommit) });

    const secondCommit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, secondRendered),
      sceneLease: second.lease,
    });
    secondCommit.activateInternal();
    const secondResult = secondCommit.commitInternal({
      authority,
      candidate: secondPick.candidate,
    });

    expect(reentrantError).toBeUndefined();
    expect(thirdResult).toMatchObject({ status: 'committed', queryRetirement: 'complete' });
    expect(secondResult).toMatchObject({ status: 'committed', queryRetirement: 'complete' });
    // The nested successor retired revision 2's snapshot as its predecessor;
    // the outer publication finalized afterwards with nothing left to retire.
    expect(authority.currentInternal?.frameInternal.presentedRevision).toBe(3);
    expect(authority.currentInternal?.disposalCompleteInternal).toBe(false);
    expect(authority.publicationsInternal).toBe(0);
    expect(authority.pendingRetiredInternal).toBe(0);
    expect(atomic.displayedTargetInternal).toEqual(target(3));
  });

  it('presents a newer revision when a waiter synchronously commits during finalization', () => {
    const world = presentedWorldAtRevisionOne();
    const secondRendered = acceptRevision(world, 2);
    const { root, atomic, firstBundle } = sceneDisplayingRevisionOne();
    const second = prepareSceneLease(atomic, 2);
    // The successor scene lease is staged off-screen while R1 is still displayed.
    const third = prepareSceneLease(atomic, 3);

    let thirdResult: unknown;
    let thirdRendered: CanonicalRenderStateV1 | null = null;
    let reentrantError: unknown;
    const reentrantCommit = (): void => {
      try {
        thirdRendered = acceptRevision(world, 3);
        const nested = new RevisionAtomicFrameCommitInternal({
          canonicalTicket: coreTicketFor(world, thirdRendered),
          sceneLease: third.lease,
        });
        nested.activateInternal();
        thirdResult = nested.commitInternal();
      } catch (error) {
        // The ledger swallows structural-signal callback failures, so surface
        // any reentrant transaction error to the assertions below.
        reentrantError = error;
      }
    };
    void world.awaitPresented(coreTarget(2), { signal: hostileRemovalSignal(reentrantCommit) });

    const secondCommit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: coreTicketFor(world, secondRendered),
      sceneLease: second.lease,
    });
    secondCommit.activateInternal();
    const secondResult = secondCommit.commitInternal();

    expect(reentrantError).toBeUndefined();
    expect(secondResult).toMatchObject({ status: 'committed' });
    expect(thirdResult).toMatchObject({ status: 'committed' });
    expect(thirdRendered).not.toBeNull();
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(thirdRendered);
    expect(atomic.displayedTargetInternal).toEqual(target(3));
    expect(root.children).toEqual([third.lease.bundleInternal.rootInternal]);
    // R1 is retired by R2's finalize; R2 is retired by the reentrant R3 finalize.
    expect(firstBundle.isDisposedInternal).toBe(true);
    expect(second.lease.bundleInternal.isDisposedInternal).toBe(true);
    expect(third.lease.bundleInternal.isDisposedInternal).toBe(false);
    expect(atomic.metricsInternal().preparedTargets).toBe(0);
  });
});
