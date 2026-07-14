import {
  copyTypedArrayWithIntrinsicsInternal,
  type SupportedTypedArrayInternal,
} from './typed-array-intrinsics.js';

/**
 * Copies one supported typed-array view without invoking methods supplied by
 * an untrusted subclass. Only the declared view range is retained.
 */
export function copyTypedArrayInternal<T extends SupportedTypedArrayInternal>(value: T): T {
  return copyTypedArrayWithIntrinsicsInternal(value) as T;
}
