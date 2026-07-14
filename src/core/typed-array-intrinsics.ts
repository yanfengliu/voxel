/* eslint-disable @typescript-eslint/unbound-method -- Captured intrinsics use Reflect.apply. */

export type SupportedTypedArrayInternal =
  | Float32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

export type SupportedTypedArrayKindInternal =
  | 'Float32Array'
  | 'Uint8Array'
  | 'Uint16Array'
  | 'Uint32Array';

export interface TypedArrayViewMetadataInternal {
  readonly buffer: ArrayBufferLike;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly length: number;
}

const ArrayBufferIntrinsic = ArrayBuffer;
const Float32ArrayIntrinsic = Float32Array;
const Uint8ArrayIntrinsic = Uint8Array;
const Uint16ArrayIntrinsic = Uint16Array;
const Uint32ArrayIntrinsic = Uint32Array;
const arrayBufferIsViewIntrinsic = ArrayBufferIntrinsic.isView;
const typedArrayPrototype = Object.getPrototypeOf(Uint8ArrayIntrinsic.prototype) as object;

function captureGetter(key: PropertyKey): (this: object) => unknown {
  const getter = Object.getOwnPropertyDescriptor(typedArrayPrototype, key)?.get;
  if (getter === undefined) throw new Error(`Missing TypedArray intrinsic getter: ${String(key)}.`);
  return getter;
}

const bufferGetterIntrinsic = captureGetter('buffer');
const byteOffsetGetterIntrinsic = captureGetter('byteOffset');
const byteLengthGetterIntrinsic = captureGetter('byteLength');
const lengthGetterIntrinsic = captureGetter('length');
const tagGetterIntrinsic = captureGetter(Symbol.toStringTag);
const float32SetIntrinsic = Float32ArrayIntrinsic.prototype.set;
const uint8SetIntrinsic = Uint8ArrayIntrinsic.prototype.set;
const uint16SetIntrinsic = Uint16ArrayIntrinsic.prototype.set;
const uint32SetIntrinsic = Uint32ArrayIntrinsic.prototype.set;
const sharedArrayBufferByteLengthGetterIntrinsic = typeof SharedArrayBuffer === 'undefined'
  ? undefined
  : Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'byteLength')?.get;

function readGetter(getter: (this: object) => unknown, value: object): unknown {
  return Reflect.apply(getter, value, []);
}

/** Returns the engine-supported intrinsic view kind without consulting subclass hooks. */
export function supportedTypedArrayKindInternal(
  value: unknown,
): SupportedTypedArrayKindInternal | undefined {
  if (!Reflect.apply(arrayBufferIsViewIntrinsic, ArrayBufferIntrinsic, [value])) return undefined;
  const tag = readGetter(tagGetterIntrinsic, value as object);
  switch (tag) {
    case 'Float32Array':
    case 'Uint8Array':
    case 'Uint16Array':
    case 'Uint32Array':
      return tag;
    default:
      return undefined;
  }
}

/** Reads view metadata through captured %TypedArray%.prototype accessors only. */
export function typedArrayViewMetadataInternal(
  value: SupportedTypedArrayInternal,
): TypedArrayViewMetadataInternal {
  return {
    buffer: readGetter(bufferGetterIntrinsic, value) as ArrayBufferLike,
    byteOffset: readGetter(byteOffsetGetterIntrinsic, value) as number,
    byteLength: readGetter(byteLengthGetterIntrinsic, value) as number,
    length: readGetter(lengthGetterIntrinsic, value) as number,
  };
}

export function typedArrayByteLengthInternal(value: SupportedTypedArrayInternal): number {
  return readGetter(byteLengthGetterIntrinsic, value) as number;
}

export function typedArrayLengthInternal(value: SupportedTypedArrayInternal): number {
  return readGetter(lengthGetterIntrinsic, value) as number;
}

export function isSharedArrayBufferInternal(value: ArrayBufferLike): boolean {
  if (sharedArrayBufferByteLengthGetterIntrinsic === undefined) return false;
  try {
    readGetter(sharedArrayBufferByteLengthGetterIntrinsic, value);
    return true;
  } catch {
    return false;
  }
}

/** Creates a hook-free base view over the exact same declared byte range. */
export function baseTypedArrayViewInternal(
  kind: SupportedTypedArrayKindInternal,
  metadata: TypedArrayViewMetadataInternal,
): SupportedTypedArrayInternal {
  const { buffer, byteOffset, length } = metadata;
  switch (kind) {
    case 'Float32Array': return new Float32ArrayIntrinsic(buffer, byteOffset, length);
    case 'Uint8Array': return new Uint8ArrayIntrinsic(buffer, byteOffset, length);
    case 'Uint16Array': return new Uint16ArrayIntrinsic(buffer, byteOffset, length);
    case 'Uint32Array': return new Uint32ArrayIntrinsic(buffer, byteOffset, length);
  }
}

/** Copies through captured native set functions, bypassing subclass methods. */
export function copyTypedArrayWithIntrinsicsInternal(
  value: SupportedTypedArrayInternal,
): SupportedTypedArrayInternal {
  const kind = supportedTypedArrayKindInternal(value);
  if (kind === undefined) throw new TypeError('Expected a supported typed-array view.');
  const length = typedArrayLengthInternal(value);
  switch (kind) {
    case 'Float32Array': {
      const copy = new Float32ArrayIntrinsic(length);
      Reflect.apply(float32SetIntrinsic, copy, [value]);
      return copy;
    }
    case 'Uint8Array': {
      const copy = new Uint8ArrayIntrinsic(length);
      Reflect.apply(uint8SetIntrinsic, copy, [value]);
      return copy;
    }
    case 'Uint16Array': {
      const copy = new Uint16ArrayIntrinsic(length);
      Reflect.apply(uint16SetIntrinsic, copy, [value]);
      return copy;
    }
    case 'Uint32Array': {
      const copy = new Uint32ArrayIntrinsic(length);
      Reflect.apply(uint32SetIntrinsic, copy, [value]);
      return copy;
    }
  }
}
