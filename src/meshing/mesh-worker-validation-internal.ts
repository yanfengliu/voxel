import type {
  MeshWorkerValidationIssueV1,
  MeshWorkerValidationResultV1,
} from './mesh-worker-contract.js';

export class MeshWorkerValidationFailureInternal extends Error {
  constructor(
    readonly issue: MeshWorkerValidationIssueV1,
  ) {
    super(issue.message);
    this.name = 'MeshWorkerValidationFailureInternal';
  }
}

export function failMeshWorkerInternal(
  code: MeshWorkerValidationIssueV1['code'],
  path: string,
  message: string,
): never {
  throw new MeshWorkerValidationFailureInternal({ code, path, message });
}

export function captureMeshWorkerInternal<Value>(
  path: string,
  parse: () => Value,
): MeshWorkerValidationResultV1<Value> {
  try {
    return { ok: true, value: parse() };
  } catch (error) {
    if (error instanceof MeshWorkerValidationFailureInternal) {
      return { ok: false, issue: error.issue };
    }
    return {
      ok: false,
      issue: {
        code: 'worker.value',
        path,
        message: `${path} could not be inspected safely.`,
      },
    };
  }
}

export function recordMeshWorkerInternal(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    failMeshWorkerInternal('worker.type', path, `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function exactKeysMeshWorkerInternal(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  required: readonly string[] = allowed,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowedKeys.has(key)) {
      failMeshWorkerInternal(
        'worker.value',
        path,
        `${path} contains an unknown field.`,
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      failMeshWorkerInternal(
        'worker.type',
        `${path}.${key}`,
        `${path}.${key} is required.`,
      );
    }
  }
}

export function literalMeshWorkerInternal<const Value extends string>(
  value: unknown,
  expected: Value,
  path: string,
): Value {
  if (value !== expected) {
    failMeshWorkerInternal('worker.schema', path, `${path} must equal ${expected}.`);
  }
  return expected;
}

export function stringMeshWorkerInternal(
  value: unknown,
  path: string,
  maximum: number,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    failMeshWorkerInternal('worker.type', path, `${path} must be a non-empty string.`);
  }
  if (value.length > maximum) {
    failMeshWorkerInternal('worker.limit', path, `${path} exceeds its string limit.`);
  }
  return value;
}

export function integerMeshWorkerInternal(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    failMeshWorkerInternal(
      'worker.value',
      path,
      `${path} must be a non-negative safe integer.`,
    );
  }
  return value as number;
}

export function fullTransferBufferMeshWorkerInternal(
  value: ArrayBufferView,
  path: string,
): ArrayBuffer {
  if (!(value.buffer instanceof ArrayBuffer)) {
    failMeshWorkerInternal(
      'worker.buffer',
      path,
      `${path} must use a transferable ArrayBuffer.`,
    );
  }
  if (value.byteOffset !== 0 || value.byteLength !== value.buffer.byteLength) {
    failMeshWorkerInternal(
      'worker.buffer',
      path,
      `${path} must exclusively cover its complete transfer buffer.`,
    );
  }
  return value.buffer;
}
