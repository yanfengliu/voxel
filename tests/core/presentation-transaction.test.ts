import { describe, expect, it } from 'vitest';

import type { PresentationAbortSignalV1 } from '../../src/core/index.js';
import { RenderWorld } from '../../src/core/index.js';
import {
  abortCanonicalPresentationInternal,
  finalizeCanonicalPresentationInternal,
  pendingCanonicalStateForPresentationInternal,
  prepareCanonicalPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
  publishCanonicalPresentationInternal,
  renderWorldPresentationWaiterCountInternal,
  setRenderWorldPresentationAvailabilityInternal,
} from '../../src/core/render-world.js';
import { readRenderWorldOwnershipMetricsForTesting } from '../../src/testing/index.js';
import { validSnapshot } from './fixtures.js';

function target(revision: number) {
  return { worldId: 'world:test', epoch: 'epoch:one', revision } as const;
}

function signalWithHostileRemoval(onRemove: () => void): PresentationAbortSignalV1 {
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

function presentedWorldAtRevisionOne(): RenderWorld {
  const world = new RenderWorld();
  expect(world.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
  expect(world.markPresented(1, 'epoch:one', 'world:test')).toBe(true);
  return world;
}

describe('prepared canonical presentation transaction', () => {
  it('publishes tentatively without settling waiters and aborts exactly', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    void world.awaitPresented(target(2));
    const metricsBefore = readRenderWorldOwnershipMetricsForTesting(world);

    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(1);

    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBeNull();
    expect(world.presentationReadiness(target(2))).toMatchObject({
      status: 'not-ready',
      reason: 'pending',
    });
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsBefore);
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(1);

    abortCanonicalPresentationInternal(ticket);
    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(readRenderWorldOwnershipMetricsForTesting(world)).toEqual(metricsBefore);
    expect(renderWorldPresentationWaiterCountInternal(world)).toBe(1);
    world.dispose();
  });

  it('settles readiness only after the caller has published all committed state', async () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    let runtimeStatePublished = false;
    let callbackObservedPublishedState = false;
    const wait = world.awaitPresented(target(2), {
      signal: signalWithHostileRemoval(() => {
        callbackObservedPublishedState = runtimeStatePublished
          && world.presentedRevision === 2
          && renderWorldPresentationWaiterCountInternal(world) === 0;
      }),
    });
    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;

    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);
    runtimeStatePublished = true;
    expect(finalizeCanonicalPresentationInternal(ticket)).toBe(true);

    await expect(wait).resolves.toMatchObject({ status: 'ready', target: target(2) });
    expect(callbackObservedPublishedState).toBe(true);
  });

  it('preserves a synchronously presented newer revision during outer finalization', async () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    let nestedFinalized = false;
    const wait = world.awaitPresented(target(2), {
      signal: signalWithHostileRemoval(() => {
        expect(world.acceptSnapshot(validSnapshot(3)).status).toBe('accepted');
        const nestedRendered = pendingCanonicalStateForPresentationInternal(world)!;
        const nested = prepareCanonicalPresentationInternal(world, nestedRendered)!;
        expect(publishCanonicalPresentationInternal(nested)).toBe(true);
        nestedFinalized = finalizeCanonicalPresentationInternal(nested);
      }),
    });
    const outer = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(publishCanonicalPresentationInternal(outer)).toBe(true);

    expect(finalizeCanonicalPresentationInternal(outer)).toBe(true);

    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    expect(nestedFinalized).toBe(true);
    expect(world.acceptedRevision).toBe(3);
    expect(world.presentedRevision).toBe(3);
    expect(world.pendingSnapshot()).toBeNull();
  });

  it('consumes stale and duplicate tickets without mutating newer state', () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const renderedTwo = pendingCanonicalStateForPresentationInternal(world)!;
    const stale = prepareCanonicalPresentationInternal(world, renderedTwo)!;
    expect(world.acceptSnapshot(validSnapshot(3)).status).toBe('accepted');
    const renderedThree = pendingCanonicalStateForPresentationInternal(world)!;

    expect(publishCanonicalPresentationInternal(stale)).toBe(false);
    expect(presentedCanonicalStateForPresentationInternal(world)?.revision).toBe(1);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(renderedThree);

    const current = prepareCanonicalPresentationInternal(world, renderedThree)!;
    expect(publishCanonicalPresentationInternal(current)).toBe(true);
    expect(publishCanonicalPresentationInternal(current)).toBe(false);
    expect(finalizeCanonicalPresentationInternal(current)).toBe(true);
    expect(finalizeCanonicalPresentationInternal(current)).toBe(false);
    abortCanonicalPresentationInternal(current);
    expect(world.presentedRevision).toBe(3);
  });

  it('rolls back a tentative publication when final readiness becomes unavailable', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);

    setRenderWorldPresentationAvailabilityInternal(world, 'context-lost');
    expect(finalizeCanonicalPresentationInternal(ticket)).toBe(false);

    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(rendered);
    expect(world.presentationReadiness(target(2))).toMatchObject({
      status: 'not-ready',
      reason: 'context-lost',
    });
  });

  it('restores the prior display without discarding a newer accepted pending state', () => {
    const world = presentedWorldAtRevisionOne();
    const previous = presentedCanonicalStateForPresentationInternal(world);
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);
    expect(world.acceptSnapshot(validSnapshot(3)).status).toBe('accepted');
    const newer = pendingCanonicalStateForPresentationInternal(world);

    abortCanonicalPresentationInternal(ticket);

    expect(presentedCanonicalStateForPresentationInternal(world)).toBe(previous);
    expect(pendingCanonicalStateForPresentationInternal(world)).toBe(newer);
    expect(world.acceptedRevision).toBe(3);
    expect(world.presentedRevision).toBe(1);
  });

  it('rejects foreign canonical state and forged presentation tickets', () => {
    const first = presentedWorldAtRevisionOne();
    const second = presentedWorldAtRevisionOne();
    expect(first.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    expect(second.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const foreign = pendingCanonicalStateForPresentationInternal(first)!;
    const local = pendingCanonicalStateForPresentationInternal(second)!;

    expect(prepareCanonicalPresentationInternal(second, foreign)).toBeNull();
    expect(pendingCanonicalStateForPresentationInternal(second)).toBe(local);
    expect(() => publishCanonicalPresentationInternal({} as never)).toThrow(
      /invalid prepared canonical presentation ticket/i,
    );

    const aborted = prepareCanonicalPresentationInternal(second, local)!;
    abortCanonicalPresentationInternal(aborted);
    expect(publishCanonicalPresentationInternal(aborted)).toBe(false);
    expect(finalizeCanonicalPresentationInternal(aborted)).toBe(false);
  });

  it('bounds outstanding tickets and invalidates one before accepting newer state', () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const renderedTwo = pendingCanonicalStateForPresentationInternal(world)!;
    const first = prepareCanonicalPresentationInternal(world, renderedTwo)!;

    expect(prepareCanonicalPresentationInternal(world, renderedTwo)).toBeNull();
    expect(world.acceptSnapshot(validSnapshot(3)).status).toBe('accepted');
    expect(publishCanonicalPresentationInternal(first)).toBe(false);

    const renderedThree = pendingCanonicalStateForPresentationInternal(world)!;
    const current = prepareCanonicalPresentationInternal(world, renderedThree);
    expect(current).not.toBeNull();
    abortCanonicalPresentationInternal(current!);
  });

  it('rejects an old canonical object after its epoch tuple is reused', () => {
    const world = new RenderWorld();
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:reused')).status).toBe('accepted');
    const old = pendingCanonicalStateForPresentationInternal(world)!;
    expect(world.markPresented(1, 'epoch:reused', 'world:test')).toBe(true);
    expect(world.acceptSnapshot(validSnapshot(0, 'epoch:middle')).status).toBe('accepted');
    expect(world.markPresented(0, 'epoch:middle', 'world:test')).toBe(true);
    expect(world.acceptSnapshot(validSnapshot(1, 'epoch:reused')).status).toBe('accepted');
    const current = pendingCanonicalStateForPresentationInternal(world)!;

    expect(prepareCanonicalPresentationInternal(world, old)).toBeNull();
    const ticket = prepareCanonicalPresentationInternal(world, current);
    expect(ticket).not.toBeNull();
    abortCanonicalPresentationInternal(ticket!);
  });

  it('reports an irrevocable commit when waiter cleanup disposes the world', async () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const wait = world.awaitPresented(target(2), {
      signal: signalWithHostileRemoval(() => { world.dispose(); }),
    });
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);

    expect(finalizeCanonicalPresentationInternal(ticket)).toBe(true);

    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    expect(world.lifecycle).toBe('disposed');
    expect(readRenderWorldOwnershipMetricsForTesting(world).retainedTypedArrayBytes).toBe(0);
  });

  it('reports an irrevocable commit when waiter cleanup observes context loss', async () => {
    const world = presentedWorldAtRevisionOne();
    expect(world.acceptSnapshot(validSnapshot(2)).status).toBe('accepted');
    const wait = world.awaitPresented(target(2), {
      signal: signalWithHostileRemoval(() => {
        setRenderWorldPresentationAvailabilityInternal(world, 'context-lost');
      }),
    });
    const rendered = pendingCanonicalStateForPresentationInternal(world)!;
    const ticket = prepareCanonicalPresentationInternal(world, rendered)!;
    expect(publishCanonicalPresentationInternal(ticket)).toBe(true);

    expect(finalizeCanonicalPresentationInternal(ticket)).toBe(true);

    await expect(wait).resolves.toMatchObject({ status: 'ready' });
    expect(world.presentedRevision).toBe(2);
    expect(world.presentationReadiness(target(2))).toMatchObject({
      status: 'not-ready',
      reason: 'context-lost',
    });
  });
});
