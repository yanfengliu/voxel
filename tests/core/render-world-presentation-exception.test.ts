import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import { PresentationLedgerInternal } from '../../src/core/presentation-ledger.js';
import {
  prepareRenderWorldCanonicalPresentationInternal,
  type RenderWorldPresentationStateInternal,
} from '../../src/core/render-world-presentation.js';
import {
  finalizePreparedCanonicalPresentationInternal,
  publishPreparedCanonicalPresentationInternal,
} from '../../src/core/prepared-canonical-presentation.js';
import { pendingCanonicalStateForPresentationInternal } from '../../src/core/render-world.js';
import { validSnapshot } from './fixtures.js';

function harness() {
  const source = new RenderWorld();
  expect(source.acceptSnapshot(validSnapshot(1)).status).toBe('accepted');
  const rendered = pendingCanonicalStateForPresentationInternal(source)!;
  const presentation = new PresentationLedgerInternal();
  const canonicalMemberships: RenderWorldPresentationStateInternal['canonicalMemberships'] =
    new WeakMap();
  presentation.accept(
    { worldId: rendered.worldId, epoch: rendered.epoch, revision: rendered.revision },
    4,
    (membership) => { canonicalMemberships.set(rendered, membership); },
  );
  const state: RenderWorldPresentationStateInternal = {
    accepted: rendered,
    pending: rendered,
    presented: null,
    canonicalMemberships,
    activePresentationTransaction: null,
    finalizingPresentationTransactions: new Set(),
    presentation,
    lifecycle: 'active',
  };
  return { rendered, state };
}

describe('render-world presentation exception safety', () => {
  it('restores state and releases ownership when publication accounting throws', () => {
    const { rendered, state } = harness();
    let updates = 0;
    const ticket = prepareRenderWorldCanonicalPresentationInternal(
      state,
      rendered,
      false,
      () => {
        updates += 1;
        if (updates === 2) throw new Error('synthetic publication accounting failure');
      },
    )!;

    expect(() => publishPreparedCanonicalPresentationInternal(ticket)).toThrow(
      /synthetic publication accounting failure/,
    );
    expect(state.presented).toBeNull();
    expect(state.pending).toBe(rendered);
    expect(state.activePresentationTransaction).toBeNull();
    expect(state.finalizingPresentationTransactions.size).toBe(0);
  });

  it('restores state and releases ownership when pre-ledger finalization throws', () => {
    const { rendered, state } = harness();
    let updates = 0;
    const ticket = prepareRenderWorldCanonicalPresentationInternal(
      state,
      rendered,
      false,
      () => {
        updates += 1;
        if (updates === 3) throw new Error('synthetic finalization accounting failure');
      },
    )!;
    expect(publishPreparedCanonicalPresentationInternal(ticket)).toBe(true);

    expect(() => finalizePreparedCanonicalPresentationInternal(ticket)).toThrow(
      /synthetic finalization accounting failure/,
    );
    expect(state.presented).toBeNull();
    expect(state.pending).toBe(rendered);
    expect(state.activePresentationTransaction).toBeNull();
    expect(state.finalizingPresentationTransactions.size).toBe(0);
  });
});
