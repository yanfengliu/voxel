import {
  expect,
  it,
} from 'vitest';

import {
  createWindmillCompactPhysicsSearchManifestV1,
  runWindmillCompactPhysicsSearchV1,
} from './windmill-compact-physics-search.js';

const workerEnabled =
  process.env.WINDMILL_PHYSICS_SEARCH_WORKER === '1';

function strictNonnegativeInteger(
  name: string,
): number {
  const text = process.env[name];
  if (text === undefined || !/^(0|[1-9]\d*)$/.test(text)) {
    throw new Error(
      `Cannot run compact windmill physics worker: ${name} must be an `
      + `explicit canonical nonnegative decimal integer; received `
      + `${text === undefined ? 'no value' : `'${text}'`}.`,
    );
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `Cannot run compact windmill physics worker: ${name} '${text}' is `
      + `outside JavaScript's safe-integer range.`,
    );
  }
  return value;
}

function expectedParameterKeys(): readonly string[] {
  const text = process.env.WINDMILL_SEARCH_EXPECTED_KEYS;
  if (text === undefined) {
    throw new Error(
      `Cannot run compact windmill physics shard: `
      + `WINDMILL_SEARCH_EXPECTED_KEYS is missing.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Cannot run compact windmill physics shard: `
      + `WINDMILL_SEARCH_EXPECTED_KEYS is not JSON: `
      + `${error instanceof Error ? error.message : String(error)}.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed)
    || parsed.some((value) =>
      typeof value !== 'string' || value.length === 0)) {
    throw new Error(
      `Cannot run compact windmill physics shard: `
      + `WINDMILL_SEARCH_EXPECTED_KEYS must be a JSON array of nonempty `
      + `parameter-key strings.`,
    );
  }
  return Object.freeze([...parsed]);
}

it.skipIf(!workerEnabled)(
  'runs one explicitly owned compact windmill physics search worker',
  async () => {
    const mode = process.env.WINDMILL_PHYSICS_SEARCH_MODE;
    if (mode === 'manifest') {
      const manifest = createWindmillCompactPhysicsSearchManifestV1();
      console.log(`WINDMILL_MANIFEST ${JSON.stringify(manifest)}`);
      expect(manifest.declaredAttemptCount).toBe(144);
      expect(manifest.generationRejectedCount).toBe(0);
      expect(manifest.analyticAcceptedCount).toBe(144);
      expect(manifest.orderedCandidateKeys).toHaveLength(144);
      return;
    }
    if (mode !== 'shard') {
      throw new Error(
        `Cannot run compact windmill physics worker: `
        + `WINDMILL_PHYSICS_SEARCH_MODE must be 'manifest' or 'shard'; `
        + `received ${mode === undefined ? 'no value' : `'${mode}'`}.`,
      );
    }
    const rangeStart = strictNonnegativeInteger('WINDMILL_SEARCH_START');
    const rangeEndExclusive = strictNonnegativeInteger(
      'WINDMILL_SEARCH_END',
    );
    const expectedKeys = expectedParameterKeys();
    const expectedManifestSha256 =
      process.env.WINDMILL_SEARCH_MANIFEST_SHA256;
    if (expectedManifestSha256 === undefined
      || !/^[a-f0-9]{64}$/.test(expectedManifestSha256)) {
      throw new Error(
        `Cannot run compact windmill physics shard: `
        + `WINDMILL_SEARCH_MANIFEST_SHA256 must be one lowercase SHA-256 `
        + `hex digest; received `
        + `${expectedManifestSha256 === undefined
          ? 'no value'
          : `'${expectedManifestSha256}'`}.`,
      );
    }
    if (expectedKeys.length !== rangeEndExclusive - rangeStart) {
      throw new Error(
        `Cannot run compact windmill physics shard range `
        + `[${String(rangeStart)}, ${String(rangeEndExclusive)}): parent `
        + `supplied ${String(expectedKeys.length)} keys instead of `
        + `${String(rangeEndExclusive - rangeStart)}.`,
      );
    }
    const evidence = await runWindmillCompactPhysicsSearchV1(
      () => undefined,
      {
        rangeStart,
        rangeEndExclusive,
        expectedManifestSha256,
        expectedRangeParameterKeys: expectedKeys,
      },
    );
    console.log(`WINDMILL_SHARD ${JSON.stringify(evidence)}`);
    expect(evidence.declaredAttemptCount).toBe(144);
    expect(evidence.generationRejectedCount).toBe(0);
    expect(evidence.analyticAcceptedCount).toBe(144);
    expect(evidence.shortRangeStart).toBe(rangeStart);
    expect(evidence.shortRangeEndExclusive).toBe(rangeEndExclusive);
    expect(evidence.rangeParameterKeys).toEqual(expectedKeys);
    expect(evidence.shortEvaluatedCount).toBe(expectedKeys.length);
  },
  600_000,
);
