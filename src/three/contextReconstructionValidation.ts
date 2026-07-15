import type {
  ContextReconstructionCleanupReportInternal,
  ContextReconstructionTargetInternal,
} from './contextReconstructionContracts.js';

type ProtocolCodeInternal =
  | 'three.reconstruction.reentrant'
  | 'three.reconstruction.invalid-options';

export class ContextReconstructionProtocolErrorInternal extends Error {
  override readonly name = 'ContextReconstructionProtocolErrorInternal';

  constructor(
    readonly code: ProtocolCodeInternal,
    message: string,
  ) {
    super(message);
  }
}

export function assertReconstructionBoundedPositiveIntegerInternal(
  value: number,
  name: string,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ContextReconstructionProtocolErrorInternal(
      'three.reconstruction.invalid-options',
      `${name} must be a positive safe integer no greater than ${String(maximum)}.`,
    );
  }
  return value;
}

export function assertReconstructionTargetInternal(
  value: ContextReconstructionTargetInternal,
): ContextReconstructionTargetInternal {
  if (typeof value.worldId !== 'string' || value.worldId.trim().length === 0
    || typeof value.epoch !== 'string' || value.epoch.trim().length === 0
    || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new TypeError('Reconstruction target is invalid.');
  }
  return value;
}

export function reconstructionTargetsEqualInternal(
  left: ContextReconstructionTargetInternal | null,
  right: ContextReconstructionTargetInternal | null,
): boolean {
  if (left === null || right === null) return left === right;
  return left.worldId === right.worldId
    && left.epoch === right.epoch
    && left.revision === right.revision;
}

export function copyReconstructionTargetInternal(
  target: ContextReconstructionTargetInternal | null,
): ContextReconstructionTargetInternal | null {
  if (target === null) return null;
  assertReconstructionTargetInternal(target);
  return Object.freeze({
    worldId: target.worldId,
    epoch: target.epoch,
    revision: target.revision,
  });
}

export function isPostRestoreTargetInternal(
  presented: ContextReconstructionTargetInternal | null,
  accepted: ContextReconstructionTargetInternal,
): boolean {
  if (presented === null) return true;
  if (presented.worldId !== accepted.worldId || presented.epoch !== accepted.epoch) return true;
  return accepted.revision > presented.revision;
}

export function aggregateReconstructionFailureInternal(
  primary: unknown,
  cleanup: ContextReconstructionCleanupReportInternal,
): unknown {
  if (cleanup.errors.length === 0) return primary;
  return new AggregateError(
    [primary, ...cleanup.errors.map((entry) => entry.error)],
    'Context reconstruction and cleanup both failed.',
    { cause: primary },
  );
}
