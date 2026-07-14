import {
  baseTypedArrayViewInternal,
  isSharedArrayBufferInternal,
  supportedTypedArrayKindInternal,
  typedArrayLengthInternal,
  typedArrayViewMetadataInternal,
  type SupportedTypedArrayInternal,
  type SupportedTypedArrayKindInternal,
} from './typed-array-intrinsics.js';

type ValidationFailInternal = (code: string, path: string, message: string) => never;

function inspectView(
  value: SupportedTypedArrayInternal,
  kind: SupportedTypedArrayKindInternal,
  path: string,
  fail: ValidationFailInternal,
): SupportedTypedArrayInternal {
  let metadata;
  try {
    metadata = typedArrayViewMetadataInternal(value);
  } catch {
    return fail('buffer.detached', path, 'Detached typed-array inputs are not accepted.');
  }
  if (isSharedArrayBufferInternal(metadata.buffer)) {
    fail('buffer.shared', path, 'SharedArrayBuffer-backed inputs are not accepted.');
  }
  try {
    return baseTypedArrayViewInternal(kind, metadata);
  } catch {
    return fail('buffer.detached', path, 'Detached typed-array inputs are not accepted.');
  }
}

export function float32(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Float32Array {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind !== 'Float32Array') fail('type.float32-array', path, 'Expected Float32Array.');
  return inspectView(value as Float32Array, kind, path, fail) as Float32Array;
}

export function uint8(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint8Array {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind !== 'Uint8Array') fail('type.uint8-array', path, 'Expected Uint8Array.');
  return inspectView(value as Uint8Array, kind, path, fail) as Uint8Array;
}

export function uint16(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint16Array {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind !== 'Uint16Array') fail('type.uint16-array', path, 'Expected Uint16Array.');
  return inspectView(value as Uint16Array, kind, path, fail) as Uint16Array;
}

export function indices(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint16Array | Uint32Array {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind !== 'Uint16Array' && kind !== 'Uint32Array') {
    fail('type.index-array', path, 'Expected Uint16Array or Uint32Array.');
  }
  return inspectView(value as Uint16Array | Uint32Array, kind, path, fail) as
    Uint16Array | Uint32Array;
}

export function finiteArray(
  value: Float32Array,
  path: string,
  fail: ValidationFailInternal,
): void {
  const length = typedArrayLengthInternal(value);
  for (let index = 0; index < length; index += 1) {
    if (!Number.isFinite(value[index])) {
      fail('number.non-finite', `${path}[${String(index)}]`, 'Expected a finite number.');
    }
  }
}
