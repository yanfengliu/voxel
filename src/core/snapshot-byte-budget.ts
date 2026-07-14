import { copyTypedArrayInternal } from './typed-array-copy.js';
import {
  baseTypedArrayViewInternal,
  isSharedArrayBufferInternal,
  supportedTypedArrayKindInternal,
  typedArrayViewMetadataInternal,
  type SupportedTypedArrayInternal,
} from './typed-array-intrinsics.js';

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
    const kind = supportedTypedArrayKindInternal(value);
    if (kind === undefined) {
      return failValidationInternal('type.typed-array', path, 'Expected a typed-array input.');
    }
    let metadata;
    try {
      metadata = typedArrayViewMetadataInternal(
        value as unknown as SupportedTypedArrayInternal,
      );
    } catch {
      return failValidationInternal(
        'buffer.detached',
        path,
        'Detached typed-array inputs are not accepted.',
      );
    }
    const byteLength = metadata.byteLength;
    if (this.metrics) this.metrics.inputTypedArrayBytes += byteLength;
    if (isSharedArrayBufferInternal(metadata.buffer)) {
      failValidationInternal(
        'buffer.shared',
        path,
        'SharedArrayBuffer-backed inputs are not accepted.',
      );
    }
    if (this.used + byteLength > this.maximum) {
      failValidationInternal(
        'limit.total-bytes',
        '$',
        `Typed-array data exceeds the ${String(this.maximum)}-byte snapshot budget.`,
      );
    }
    let copy: T;
    if (this.copyArrays) {
      try {
        copy = copyTypedArrayInternal(
          value as unknown as SupportedTypedArrayInternal,
        ) as unknown as T;
      } catch {
        return failValidationInternal(
          'buffer.detached',
          path,
          'Detached typed-array inputs are not accepted.',
        );
      }
    } else {
      try {
        copy = baseTypedArrayViewInternal(kind, metadata) as unknown as T;
      } catch {
        return failValidationInternal(
          'buffer.detached',
          path,
          'Detached typed-array inputs are not accepted.',
        );
      }
    }
    this.used += byteLength;
    if (this.metrics && this.copyArrays) {
      this.metrics.copiedTypedArrayBytes += byteLength;
      this.metrics.copyOperations += 1;
    }
    return copy;
  }
}
