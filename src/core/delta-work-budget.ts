import {
  supportedTypedArrayKindInternal,
  typedArrayLengthInternal,
  type SupportedTypedArrayInternal,
} from './typed-array-intrinsics.js';

type WorkLimitFailureInternal = (path: string) => never;

function saturatingAdd(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return Number.MAX_SAFE_INTEGER;
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : Number.MAX_SAFE_INTEGER;
}

function saturatingMultiply(left: number, right: number): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return Number.MAX_SAFE_INTEGER;
  const product = left * right;
  return Number.isSafeInteger(product) ? product : Number.MAX_SAFE_INTEGER;
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * How many elements validation will actually scan, read through the captured
 * %TypedArray% getters rather than the view's own `length`. A subclass can
 * report length 0 while its buffer holds thousands of elements that
 * validation reads through a hook-free base view. Such a payload is still
 * rejected — the scan charges its own work and trips the element limit — but
 * only after doing the scan this estimate exists to refuse in advance, so the
 * pre-charge reads the same hook-free length the scan will.
 */
function viewLength(value: unknown): number {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind === undefined) return 0;
  const length = typedArrayLengthInternal(value as SupportedTypedArrayInternal);
  return typeof length === 'number' && Number.isSafeInteger(length) ? length : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function animationWork(value: unknown, instanceCount: number): number {
  const input = asRecord(value);
  if (!input) return 1;
  let work = 8;
  for (const name of [
    'periodsMs',
    'phasesRadians',
    'translationAmplitudes',
    'rotationAmplitudesRadians',
    'scaleAmplitudes',
  ]) {
    work = saturatingAdd(work, saturatingMultiply(viewLength(input[name]), 2));
  }
  // Animated affine validation inspects at most fourteen matrix scalars per instance.
  return saturatingAdd(work, saturatingMultiply(instanceCount, 14));
}

function resourceWork(value: unknown): number {
  const input = asRecord(value);
  if (!input) return 1;
  switch (input.kind) {
    case 'palette':
      return saturatingAdd(8, saturatingMultiply(listLength(input.entries), 6));
    case 'material':
      return 24;
    case 'geometry': {
      const positions = viewLength(input.positions);
      let work = 32;
      work = saturatingAdd(work, saturatingMultiply(positions, 2));
      for (const name of ['normals', 'uvs', 'colors', 'indices']) {
        work = saturatingAdd(work, viewLength(input[name]));
      }
      return saturatingAdd(work, saturatingMultiply(listLength(input.groups), 8));
    }
    default:
      return 4;
  }
}

function chunkWork(value: unknown): number {
  const input = asRecord(value);
  return input ? saturatingAdd(20, viewLength(input.voxels)) : 1;
}

function batchWork(value: unknown): number {
  const input = asRecord(value);
  if (!input) return 1;
  const instances = listLength(input.instanceKeys);
  let work = saturatingAdd(24, saturatingMultiply(instances, 3));
  work = saturatingAdd(work, viewLength(input.matrices));
  work = saturatingAdd(work, viewLength(input.colors));
  if (input.animation !== undefined) {
    work = saturatingAdd(work, animationWork(input.animation, instances));
  }
  return work;
}

/** Conservative pre-traversal work charge for one untrusted operation payload. */
export function estimateRenderOperationWorkInternal(value: unknown): number {
  const input = asRecord(value);
  if (!input) return 1;
  switch (input.op) {
    case 'put-resource':
      return saturatingAdd(8, resourceWork(input.resource));
    case 'put-chunk':
      return saturatingAdd(8, chunkWork(input.chunk));
    case 'put-batch':
      return saturatingAdd(8, batchWork(input.batch));
    case 'patch-batch-instances': {
      const upserts = asRecord(input.upserts);
      let work = saturatingAdd(16, saturatingMultiply(listLength(input.removeInstanceKeys), 3));
      if (upserts) {
        work = saturatingAdd(work, batchWork(upserts));
        work = saturatingAdd(work, listLength(upserts.instanceKeys));
      }
      return work;
    }
    case 'remove-resource':
    case 'remove-chunk':
    case 'remove-batch':
      return 8;
    default:
      return 4;
  }
}

export class DeltaWorkBudgetInternal {
  private used = 0;

  constructor(
    private readonly maximum: number,
    private readonly onExceeded: WorkLimitFailureInternal,
  ) {}

  charge(count: number, path = '$'): void {
    if (!Number.isSafeInteger(count) || count < 0) this.onExceeded(path);
    const next = saturatingAdd(this.used, count);
    if (next > this.maximum) this.onExceeded(path);
    this.used = next;
  }

  get usedElements(): number { return this.used; }
  get remainingElements(): number { return this.maximum - this.used; }
}
