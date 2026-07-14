export class ValidationFailureInternal extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

export function failValidationInternal(
  code: string,
  path: string,
  message: string,
): never {
  throw new ValidationFailureInternal(code, path, message);
}

export interface SnapshotCopyMetricsInternal {
  inputTypedArrayBytes: number;
  copiedTypedArrayBytes: number;
  copyOperations: number;
}

export class SnapshotByteBudgetInternal {
  private used = 0;

  constructor(
    private readonly maximum: number,
    private readonly metrics?: SnapshotCopyMetricsInternal,
    private readonly copyArrays = true,
  ) {}

  retain<T extends ArrayBufferView & { slice(): T }>(value: T, path: string): T {
    if (this.metrics) this.metrics.inputTypedArrayBytes += value.byteLength;
    if (
      typeof SharedArrayBuffer !== 'undefined'
      && value.buffer instanceof SharedArrayBuffer
    ) {
      failValidationInternal(
        'buffer.shared',
        path,
        'SharedArrayBuffer-backed inputs are not accepted.',
      );
    }
    if (this.used + value.byteLength > this.maximum) {
      failValidationInternal(
        'limit.total-bytes',
        '$',
        `Typed-array data exceeds the ${String(this.maximum)}-byte snapshot budget.`,
      );
    }
    let copy: T;
    if (this.copyArrays) {
      try {
        copy = value.slice();
      } catch {
        return failValidationInternal(
          'buffer.detached',
          path,
          'Detached typed-array inputs are not accepted.',
        );
      }
    } else {
      copy = value;
    }
    this.used += value.byteLength;
    if (this.metrics && this.copyArrays) {
      this.metrics.copiedTypedArrayBytes += value.byteLength;
      this.metrics.copyOperations += 1;
    }
    return copy;
  }
}
