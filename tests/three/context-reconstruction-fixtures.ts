import type {
  ContextReconstructionDisplayLeaseInternal,
  ContextReconstructionLifecycleInternal,
  ContextReconstructionPortInternal,
  ContextReconstructionPrepareInputInternal,
  ContextReconstructionPresentedCheckpointInternal,
  ContextReconstructionTargetInternal,
} from '../../src/three/contextReconstructionContracts.js';

type HarnessPhase =
  | 'prepare'
  | 'upload'
  | 'swap'
  | 'validate'
  | 'draw'
  | 'commit'
  | 'availability'
  | 'accepted';

export function reconstructionTarget(
  revision: number,
  epoch = 'epoch:reconstruction',
): ContextReconstructionTargetInternal {
  return Object.freeze({ worldId: 'world:reconstruction', epoch, revision });
}

export interface ReconstructionHarness {
  readonly port: ContextReconstructionPortInternal;
  readonly events: string[];
  onPhase(phase: HarnessPhase, callback: () => void): void;
  clearPhase(phase: HarnessPhase): void;
  failPhase(phase: HarnessPhase, error: unknown): void;
  failDisposal(resourcePrefix: string, count: number): void;
  loseContext(): void;
  beginRestoration(): void;
  setLifecycle(lifecycle: ContextReconstructionLifecycleInternal): void;
  setAccepted(target: ContextReconstructionTargetInternal | null): void;
  setWatermark(target: ContextReconstructionTargetInternal | null): void;
  disposalCalls(): number;
  createdResourceIds(): readonly string[];
}

export function createReconstructionHarness(options: {
  readonly presented: ContextReconstructionTargetInternal | null;
  readonly accepted?: ContextReconstructionTargetInternal | null;
  readonly lifecycle?: ContextReconstructionLifecycleInternal;
  readonly generation?: number;
}): ReconstructionHarness {
  const events: string[] = [];
  const callbacks = new Map<HarnessPhase, () => void>();
  const failures = new Map<HarnessPhase, unknown>();
  const disposalFailures = new Map<string, number>();
  const resourceIds: string[] = [];
  let disposalCallCount = 0;
  let lifecycle = options.lifecycle ?? 'restoring';
  let generation = options.generation ?? 2;
  let watermark = options.presented;
  let accepted = options.accepted ?? null;
  const label = options.presented ? String(options.presented.revision) : 'empty';
  const checkpoint: ContextReconstructionPresentedCheckpointInternal = Object.freeze({
    checkpointIdInternal: `checkpoint:${label}`,
    targetInternal: options.presented,
    canonicalStateInternal: Object.freeze({ exactPresentedCpuState: label }),
  });

  const run = (phase: HarnessPhase): void => {
    callbacks.get(phase)?.();
    if (failures.has(phase)) throw failures.get(phase);
  };

  const resource = (
    id: string,
    preparedCheckpoint: ContextReconstructionPresentedCheckpointInternal,
    isDisplay: boolean,
  ): ContextReconstructionDisplayLeaseInternal => {
    resourceIds.push(id);
    const prefix = id.split(':')[0] ?? id;
    const eventId = id.replace(/:g\d+:a\d+$/, '');
    const dispose = (): void => {
      disposalCallCount += 1;
      events.push(`dispose:${id}`);
      const remaining = disposalFailures.get(prefix) ?? 0;
      if (remaining > 0) {
        disposalFailures.set(prefix, remaining - 1);
        throw new Error(`dispose failed for ${id}`);
      }
    };
    return {
      resourceIdInternal: id,
      checkpointInternal: preparedCheckpoint,
      swapInternal: () => {
        if (!isDisplay) throw new Error('Auxiliary resource cannot swap.');
        events.push(`swap:${eventId}`);
        run('swap');
      },
      validateForDrawInternal: () => {
        if (!isDisplay) throw new Error('Auxiliary resource cannot validate.');
        events.push(`validate:${eventId}`);
        run('validate');
      },
      drawInternal: () => {
        if (!isDisplay) throw new Error('Auxiliary resource cannot draw.');
        events.push(`draw:${eventId}`);
        run('draw');
      },
      commitInternal: () => {
        if (!isDisplay) throw new Error('Auxiliary resource cannot commit.');
        events.push(`commit:${eventId}`);
        run('commit');
      },
      disposeInternal: dispose,
    };
  };

  const port: ContextReconstructionPortInternal = {
    lifecycleInternal: () => lifecycle,
    deviceGenerationInternal: () => generation,
    presentedCheckpointInternal: () => {
      events.push('checkpoint');
      return checkpoint;
    },
    presentedWatermarkInternal: () => {
      events.push('watermark');
      return watermark;
    },
    preparePresentedCheckpointInternal: (input: ContextReconstructionPrepareInputInternal) => {
      events.push(`prepare:${input.checkpointInternal.checkpointIdInternal}`);
      run('prepare');
      const suffix = `g${String(input.identityInternal.deviceGeneration)}:a${String(input.identityInternal.attempt)}`;
      const gpu = resource(`gpu:${label}:${suffix}`, input.checkpointInternal, false);
      events.push(`acquire:gpu:${label}`);
      input.registerResourceLeaseInternal(gpu);
      run('upload');
      return resource(`display:${label}:${suffix}`, input.checkpointInternal, true);
    },
    publishRestoredAvailabilityInternal: (input) => {
      events.push(`available:${input.checkpointInternal.checkpointIdInternal}`);
      run('availability');
      lifecycle = 'running';
    },
    completeAcceptedTargetInternal: () => {
      events.push('accepted');
      run('accepted');
      return accepted;
    },
  };

  return {
    port,
    events,
    onPhase: (phase, callback) => { callbacks.set(phase, callback); },
    clearPhase: (phase) => {
      callbacks.delete(phase);
      failures.delete(phase);
    },
    failPhase: (phase, error) => { failures.set(phase, error); },
    failDisposal: (prefix, count) => { disposalFailures.set(prefix, count); },
    loseContext: () => {
      lifecycle = 'lost';
      generation += 1;
    },
    beginRestoration: () => {
      lifecycle = 'restoring';
      generation += 1;
    },
    setLifecycle: (value) => { lifecycle = value; },
    setAccepted: (value) => { accepted = value; },
    setWatermark: (value) => { watermark = value; },
    disposalCalls: () => disposalCallCount,
    createdResourceIds: () => Object.freeze([...resourceIds]),
  };
}
