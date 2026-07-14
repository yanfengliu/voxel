import type { Int3V1 } from '../core/contracts.js';
import type {
  MesherValidationIssueV1,
  MesherValidationResultV1,
} from './mesher-contract.js';

export class MesherValidationFailureInternal extends Error {
  constructor(
    readonly code: MesherValidationIssueV1['code'],
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'MesherValidationFailureInternal';
  }
}

export function captureMesherValidationInternal<Value>(
  parse: () => Value,
): MesherValidationResultV1<Value> {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof MesherValidationFailureInternal) {
      return {
        ok: false,
        issue: { code: error.code, path: error.path, message: error.message },
      };
    }
    throw error;
  }
}

export function failMesherValidationInternal(
  code: MesherValidationIssueV1['code'],
  path: string,
  message: string,
): never {
  throw new MesherValidationFailureInternal(code, path, message);
}

export function objectMesherInternal(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failMesherValidationInternal('mesher.type', path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function literalMesherInternal<const Value extends string>(
  value: unknown,
  expected: Value,
  path: string,
): Value {
  if (value !== expected) {
    failMesherValidationInternal(
      'mesher.schema',
      path,
      `${path} must equal ${expected}.`,
    );
  }
  return expected;
}

export function boundedStringMesherInternal(
  value: unknown,
  path: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    failMesherValidationInternal('mesher.type', path, `${path} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    failMesherValidationInternal(
      'mesher.limit',
      path,
      `${path} exceeds ${String(maxLength)} UTF-16 code units.`,
    );
  }
  return value;
}

export function safeIntegerMesherInternal(
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    failMesherValidationInternal(
      'mesher.value',
      path,
      `${path} must be a safe integer from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
  return value as number;
}

export function finiteMesherInternal(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failMesherValidationInternal('mesher.value', path, `${path} must be finite.`);
  }
  return value;
}

export function int3MesherInternal(
  value: unknown,
  path: string,
  minimum = Number.MIN_SAFE_INTEGER,
  maximum = Number.MAX_SAFE_INTEGER,
): Int3V1 {
  const input = objectMesherInternal(value, path);
  return Object.freeze({
    x: safeIntegerMesherInternal(input.x, `${path}.x`, minimum, maximum),
    y: safeIntegerMesherInternal(input.y, `${path}.y`, minimum, maximum),
    z: safeIntegerMesherInternal(input.z, `${path}.z`, minimum, maximum),
  });
}

export function checkedAddMesherInternal(
  left: number,
  right: number,
  path: string,
): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    failMesherValidationInternal('mesher.limit', path, `${path} exceeds safe-integer range.`);
  }
  return result;
}

export function checkedMultiplyMesherInternal(
  left: number,
  right: number,
  path: string,
): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    failMesherValidationInternal('mesher.limit', path, `${path} exceeds safe-integer range.`);
  }
  return result;
}

export function sameInt3MesherInternal(left: Int3V1, right: Int3V1): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export function typedArrayMesherInternal<ArrayType extends ArrayBufferView>(
  value: unknown,
  constructor: (new (length: number) => ArrayType) & { readonly name: string },
  path: string,
): ArrayType {
  if (!(value instanceof constructor)) {
    failMesherValidationInternal(
      'mesher.type',
      path,
      `${path} must be a ${constructor.name}.`,
    );
  }
  if (!(value.buffer instanceof ArrayBuffer)) {
    failMesherValidationInternal(
      'mesher.type',
      path,
      `${path} must use an exclusively transferable ArrayBuffer.`,
    );
  }
  return value;
}
