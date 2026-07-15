import { describe, expect, it } from 'vitest';

import {
  ContextReconstructionCoordinatorInternal,
  ContextReconstructionProtocolErrorInternal,
} from '../../src/three/contextReconstructionCoordinator.js';
import {
  createReconstructionHarness,
  reconstructionTarget,
} from './context-reconstruction-fixtures.js';

describe('ContextReconstructionCoordinatorInternal contract', () => {
  it('reconstructs and draws the exact committed CPU checkpoint before exposing a newer target', () => {
    const harness = createReconstructionHarness({
      presented: reconstructionTarget(7),
      accepted: reconstructionTarget(9),
    });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });

    const result = coordinator.restoreInternal();

    expect(result).toMatchObject({
      status: 'restored',
      identity: { deviceGeneration: 2, attempt: 1 },
      checkpointId: 'checkpoint:7',
      presentedTarget: reconstructionTarget(7),
      nextTarget: reconstructionTarget(9),
      committedResourceLeases: 2,
    });
    expect(harness.events).toEqual([
      'checkpoint',
      'watermark',
      'prepare:checkpoint:7',
      'acquire:gpu:7',
      'swap:display:7',
      'validate:display:7',
      'draw:display:7',
      'commit:display:7',
      'watermark',
      'accepted',
      'available:checkpoint:7',
      'watermark',
    ]);
    expect(harness.port.presentedWatermarkInternal()).toEqual(reconstructionTarget(7));
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== 'restored') throw new Error('Expected restored result.');
    expect(Object.isFrozen(result.cleanup)).toBe(true);
  });

  it('consults accepted work only after the prior draw commits and exposes it after readiness', () => {
    const harness = createReconstructionHarness({
      presented: reconstructionTarget(3),
      accepted: reconstructionTarget(4),
    });
    harness.onPhase('commit', () => {
      expect(harness.events).not.toContain('available:checkpoint:3');
      expect(harness.events).not.toContain('accepted');
    });
    harness.onPhase('accepted', () => {
      expect(harness.events).toContain('draw:display:3');
      expect(harness.events).toContain('commit:display:3');
      expect(harness.events).not.toContain('available:checkpoint:3');
    });
    harness.onPhase('availability', () => {
      expect(harness.events).toContain('draw:display:3');
      expect(harness.events).toContain('commit:display:3');
      expect(harness.events).toContain('accepted');
    });

    const result = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    }).restoreInternal();

    expect(result.status).toBe('restored');
    expect(harness.events.indexOf('accepted')).toBeGreaterThan(
      harness.events.indexOf('commit:display:3'),
    );
    expect(harness.events.indexOf('available:checkpoint:3')).toBeGreaterThan(
      harness.events.indexOf('accepted'),
    );
  });

  it('preserves an empty prior watermark and defers an accepted first target', () => {
    const harness = createReconstructionHarness({ presented: null, accepted: reconstructionTarget(1) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });

    const result = coordinator.restoreInternal();

    expect(result).toMatchObject({
      status: 'restored',
      checkpointId: 'checkpoint:empty',
      presentedTarget: null,
      nextTarget: reconstructionTarget(1),
    });
    expect(harness.port.presentedWatermarkInternal()).toBeNull();
  });

  it('returns no post-restore staging decision for an incomplete or already-presented target', () => {
    const incomplete = createReconstructionHarness({ presented: reconstructionTarget(2) });
    const duplicate = createReconstructionHarness({
      presented: reconstructionTarget(2),
      accepted: reconstructionTarget(2),
    });

    const first = new ContextReconstructionCoordinatorInternal(incomplete.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    }).restoreInternal();
    const second = new ContextReconstructionCoordinatorInternal(duplicate.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    }).restoreInternal();

    expect(first).toMatchObject({ status: 'restored', nextTarget: null });
    expect(second).toMatchObject({ status: 'restored', nextTarget: null });
  });

  it.each([
    ['prepare', 'worker'],
    ['upload', 'upload'],
    ['draw', 'host-ticket'],
    ['commit', 'capture'],
  ] as const)('aborts a loss during %s without publishing readiness', (phase, reason) => {
    const harness = createReconstructionHarness({
      presented: reconstructionTarget(5),
      accepted: reconstructionTarget(6),
    });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });
    harness.onPhase(phase, () => {
      harness.loseContext();
      coordinator.invalidateForDeviceTransitionInternal(reason);
    });

    const result = coordinator.restoreInternal();

    expect(result).toMatchObject({
      status: 'stale',
      reason: 'device-generation-changed',
      invalidationReason: reason,
      cleanup: { pending: 0 },
    });
    expect(harness.events.some((event) => event.startsWith('available:'))).toBe(false);
    expect(harness.disposalCalls()).toBeGreaterThan(0);
  });

  it('recovers on a fresh generation after repeated loss and never reuses stale resources', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(4) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });
    harness.onPhase('draw', () => {
      harness.clearPhase('draw');
      harness.loseContext();
      coordinator.invalidateForDeviceTransitionInternal('external');
    });

    expect(coordinator.restoreInternal()).toMatchObject({ status: 'stale' });
    harness.beginRestoration();
    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'restored',
      identity: { deviceGeneration: 4, attempt: 1 },
    });
    expect(harness.createdResourceIds()).toEqual([
      'gpu:4:g2:a1',
      'display:4:g2:a1',
      'gpu:4:g4:a1',
      'display:4:g4:a1',
    ]);
  });

  it('rejects a reentrant restoration and aborts the outer transaction when it escapes', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(8) });
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });
    harness.onPhase('prepare', () => coordinator.restoreInternal());

    const result = coordinator.restoreInternal();

    expect(result.status).toBe('retryable-failure');
    if (result.status !== 'retryable-failure') throw new Error('Expected retryable failure.');
    expect(result.phase).toBe('prepare');
    expect(result.error).toBeInstanceOf(ContextReconstructionProtocolErrorInternal);
    expect((result.error as ContextReconstructionProtocolErrorInternal).code).toBe(
      'three.reconstruction.reentrant',
    );
    expect(result.cleanup.pending).toBe(0);
  });

  it('returns a bounded typed terminal decision after failed rebuild attempts', () => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(1) });
    harness.failPhase('prepare', new Error('rebuild unavailable'));
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });

    expect(coordinator.restoreInternal()).toMatchObject({
      status: 'retryable-failure',
      phase: 'prepare',
      remainingAttempts: 1,
    });
    const terminal = coordinator.restoreInternal();
    expect(terminal).toMatchObject({
      status: 'terminal-failure',
      phase: 'prepare',
      decision: {
        transition: 'failed',
        readiness: 'failed',
        code: 'three.reconstruction.exhausted',
      },
    });
    expect(coordinator.restoreInternal()).toBe(terminal);
  });

  it.each(['draw', 'commit'] as const)('rolls back and accounts cleanup after failed %s', (phase) => {
    const harness = createReconstructionHarness({ presented: reconstructionTarget(12) });
    harness.failPhase(phase, new Error(`${phase} failed`));
    const coordinator = new ContextReconstructionCoordinatorInternal(harness.port, {
      maxAttemptsPerGeneration: 2,
      maxResourceLeasesPerAttempt: 8,
    });

    const result = coordinator.restoreInternal();

    expect(result).toMatchObject({
      status: 'retryable-failure',
      phase,
      cleanup: { attempted: 2, disposed: 2, pending: 0, errors: [] },
    });
    expect(harness.port.presentedWatermarkInternal()).toEqual(reconstructionTarget(12));
  });
});
