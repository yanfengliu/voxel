type ValidationFailInternal = (code: string, path: string, message: string) => never;

function inspectView(
  value: ArrayBufferView,
  path: string,
  fail: ValidationFailInternal,
): void {
  if (
    typeof SharedArrayBuffer !== 'undefined'
    && value.buffer instanceof SharedArrayBuffer
  ) {
    fail('buffer.shared', path, 'SharedArrayBuffer-backed inputs are not accepted.');
  }
  try {
    // Constructing even a zero-length view fails for a detached ArrayBuffer.
    new Uint8Array(value.buffer, value.byteOffset, 0);
  } catch {
    fail('buffer.detached', path, 'Detached typed-array inputs are not accepted.');
  }
}

export function float32(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Float32Array {
  if (!(value instanceof Float32Array)) fail('type.float32-array', path, 'Expected Float32Array.');
  inspectView(value, path, fail);
  return value;
}

export function uint8(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint8Array {
  if (!(value instanceof Uint8Array)) fail('type.uint8-array', path, 'Expected Uint8Array.');
  inspectView(value, path, fail);
  return value;
}

export function uint16(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint16Array {
  if (!(value instanceof Uint16Array)) fail('type.uint16-array', path, 'Expected Uint16Array.');
  inspectView(value, path, fail);
  return value;
}

export function indices(
  value: unknown,
  path: string,
  fail: ValidationFailInternal,
): Uint16Array | Uint32Array {
  if (!(value instanceof Uint16Array) && !(value instanceof Uint32Array)) {
    fail('type.index-array', path, 'Expected Uint16Array or Uint32Array.');
  }
  inspectView(value, path, fail);
  return value;
}

export function finiteArray(
  value: Float32Array,
  path: string,
  fail: ValidationFailInternal,
): void {
  for (let index = 0; index < value.length; index += 1) {
    if (!Number.isFinite(value[index])) {
      fail('number.non-finite', `${path}[${String(index)}]`, 'Expected a finite number.');
    }
  }
}
