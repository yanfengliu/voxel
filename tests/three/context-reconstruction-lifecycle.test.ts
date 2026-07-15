import { describe, expect, it } from 'vitest';

import { ContextReconstructionCoordinatorInternal } from '../../src/three/contextReconstructionCoordinator.js';
import type { ContextReconstructionLifecycleInternal } from '../../src/three/contextReconstructionContracts.js';
import { ContextReconstructionResourceSetInternal } from '../../src/three/contextReconstructionResources.js';
import {
  createReconstructionHarness,
  reconstructionTarget,
} from './context-reconstruction-fixtures.js';

const OPTIONS = Object.freeze({
  maxAttemptsPerGeneration: 2,
  maxResourceLeasesPerAttempt: 8,
});

describe('ContextReconstructionCoordinatorInternal lifecycle and cleanup', () => {
  it('keeps ownership transfer atomic when the destination cannot accept every lease', () => {
    const source = new ContextReconstructionResourceSetInternal(2);
    const destination = new ContextReconstructionResourceSetInternal(1);
    const disposed: string[] = [];
    source.registerInternal({
      resourceIdInternal: 'first',
      disposeInternal: () => { disposed.push('first'); },
    });
    source.registerInternal({
      resourceIdInternal: 'second',
      disposeInternal: () => { disposed.push('second'); },
    });

    expect(() => source.moveIntoInternal(destination)).toThrow(
      'Reconstruction resource lease budget exceeded.',
    );
    expect(source.sizeInternal).toBe(2);
    expect(destination.sizeInternal).toBe(0);
    expect(source.cleanupInternal()).toMatchObject({ attempted: 2, disposed: 2, pending: 0 });
    expect(destination.cleanupInternal()).toMatchObject({ attempted: 0, disposed: 0, pending: 0 });
    expect(disposed).toEqual(['first', 'second']);
  });

  it('retries every failed resource disposal before acquiring replacement resources', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(10) });
    harness.failPhase('draw', new Error('draw failed'));
    harness.failDisposal('gpu', 1);
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);

    const first = coordinator.restoreInternal();
    expect(first).toMatchObject({
      status: 'retryable-failure',
      cleanup: { attempted: 2, disposed: 1, pending: 1 },
    });

    harness.clearPhase('draw');
    const beforeRetry = harness.events.length;
    const second = coordinator.restoreInternal();
    expect(second).toMatchObject({ status: 'restored' });
    const retryEvents = harness.events.slice(beforeRetry);
    expect(retryEvents[0]).toBe('dispose:gpu:10:g2:a1');
    expect(retryEvents.indexOf('dispose:gpu:10:g2:a1')).toBeLessThan(
      retryEvents.indexOf('prepare:checkpoint:10'),
    );
  });

  it('aggregates cleanup debt and makes disposal retryable after a successful restore', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(6) });
    harness.failDisposal('gpu', 1);
    harness.failDisposal('display', 1);
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);
    expect(coordinator.restoreInternal()).toMatchObject({ status: 'restored' });

    const first = coordinator.disposeInternal();
    expect(first).toMatchObject({
      status: 'cleanup-pending',
      cleanup: { attempted: 2, disposed: 0, pending: 2 },
    });
    expect(first.cleanup.errors).toHaveLength(2);
    expect(first.error).toBeInstanceOf(AggregateError);

    const second = coordinator.disposeInternal();
    expect(second).toMatchObject({
      status: 'disposed',
      cleanup: { attempted: 2, disposed: 2, pending: 0, errors: [] },
    });
    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'unavailable',
      reason: 'disposed',
    });
  });

  it.each([
    'initializing',
    'running',
    'lost',
    'restoring',
    'failed',
    'disposed',
  ] satisfies readonly ContextReconstructionLifecycleInternal[])(
    'is safely disposable while the runtime lifecycle is %s',
    (lifecycle) => {
      const harness = createReconstructionHarness({
        presented: reconstructionTarget(1),
        lifecycle,
      });
      const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);

      expect(coordinator.disposeInternal()).toMatchObject({
        status: 'disposed',
        cleanup: { pending: 0 },
      });
      expect(coordinator.disposeInternal()).toMatchObject({ status: 'disposed' });
    },
  );

  it('retires committed generation resources on loss before rebuilding the next generation', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(2) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);
    expect(coordinator.restoreInternal()).toMatchObject({ status: 'restored' });
    harness.loseContext();
    coordinator.invalidateForDeviceTransitionInternal('capture');
    harness.beginRestoration();
    const before = harness.events.length;

    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'restored',
      identity: { deviceGeneration: 4, attempt: 1 },
    });
    const rebuildEvents = harness.events.slice(before);
    expect(rebuildEvents.slice(0, 2)).toEqual([
      'dispose:gpu:2:g2:a1',
      'dispose:display:2:g2:a1',
    ]);
  });

  it('rejects a stale generation callback even if the lifecycle still says restoring', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(13) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);
    harness.onPhase('validate', () => {
      harness.loseContext();
      harness.beginRestoration();
    });

    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'stale',
      reason: 'device-generation-changed',
      cleanup: { pending: 0 },
    });
  });

  it('fails closed when the runtime watermark does not match the retained checkpoint', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(7) });
    harness.setWatermark(reconstructionTarget(8));
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);

    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'terminal-failure',
      phase: 'checkpoint',
      decision: { code: 'three.reconstruction.invariant' },
      cleanup: { pending: 0 },
    });
    expect(harness.createdResourceIds()).toEqual([]);
  });

  it('fails closed if the watermark changes while the prior display is rebuilt', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(7) });
    harness.onPhase('commit', () => harness.setWatermark(reconstructionTarget(8)));
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);

    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'terminal-failure',
      phase: 'commit',
      decision: { code: 'three.reconstruction.invariant' },
      cleanup: { pending: 0 },
    });
  });

  it('reports lifecycle preconditions without creating a reconstruction attempt', () => {
    const lost = createReconstructionHarness({
      presented: reconstructionTarget(1),
      lifecycle: 'lost',
    });
    const running = createReconstructionHarness({
      presented: reconstructionTarget(1),
      lifecycle: 'running',
    });

    expect(new ContextReconstructionCoordinatorInternal(lost.port, OPTIONS).restoreInternal())
      .toMatchObject({ status: 'unavailable', reason: 'context-lost' });
    expect(new ContextReconstructionCoordinatorInternal(running.port, OPTIONS).restoreInternal())
      .toMatchObject({ status: 'unavailable', reason: 'not-restoring' });
    expect(lost.createdResourceIds()).toEqual([]);
    expect(running.createdResourceIds()).toEqual([]);
  });

  it('exposes bounded metrics without claiming integration or real WebGL reconstruction', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(2) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, OPTIONS);
    expect(coordinator.restoreInternal()).toMatchObject({ status: 'restored' });

    expect(coordinator.metricsInternal()).toEqual({
      lifecycle: 'active',
      attempts: 1,
      restored: 1,
      retryableFailures: 0,
      terminalFailures: 0,
      staleAttempts: 0,
      invalidations: 0,
      committedResourceLeases: 2,
      pendingCleanupLeases: 0,
    });
  });
});
