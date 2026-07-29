import { createHash } from 'node:crypto';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function canonicalJson(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `Cannot canonicalize non-finite windmill search evidence number `
      + `${String(value)}.`,
    );
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error(
        `Cannot canonicalize windmill search evidence value of type `
        + `'${typeof value}'.`,
      );
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function withoutField(record, field) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== field),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSha256(value, description) {
  assert(
    typeof value === 'string' && SHA256_PATTERN.test(value),
    `${description} must be one lowercase SHA-256 digest; received `
      + `${JSON.stringify(value)}.`,
  );
}

function assertUnique(values, description) {
  const seen = new Set();
  for (const value of values) {
    assert(
      !seen.has(value),
      `${description} repeats '${String(value)}'.`,
    );
    seen.add(value);
  }
}

function assertCanonicalEqual(actual, expected, description) {
  assert(
    canonicalJson(actual) === canonicalJson(expected),
    `${description} does not match the parent-owned canonical value.`,
  );
}

export function validateWindmillPhysicsManifest(manifest) {
  assert(
    manifest.schema ===
      'fixture.windmill-compact-physics-search-manifest/1',
    `Manifest schema is '${String(manifest.schema)}', not the supported v1.`,
  );
  assert(manifest.declaredAttemptCount === 144,
    `Manifest declares ${String(manifest.declaredAttemptCount)} attempts, `
    + `not 144.`);
  assert(manifest.generationRejectedCount === 0,
    `Manifest retains ${String(manifest.generationRejectedCount)} generation `
    + `rejections, not 0.`);
  assert(manifest.analyticAcceptedCount === 144,
    `Manifest retains ${String(manifest.analyticAcceptedCount)} analytic `
    + `candidates, not 144.`);
  assert(Array.isArray(manifest.orderedCandidateKeys)
    && manifest.orderedCandidateKeys.length === 144,
  `Manifest ordered candidate list does not contain 144 keys.`);
  assertUnique(manifest.orderedCandidateKeys, 'Manifest candidate order');
  assert(typeof manifest.defaultParameterKey === 'string'
    && manifest.orderedCandidateKeys.includes(manifest.defaultParameterKey),
  `Manifest default parameter key is missing from the ordered candidates.`);
  assert(Array.isArray(manifest.generationRejections)
    && manifest.generationRejections.length === 0,
  `Manifest generation rejection list is not empty.`);
  assert(Array.isArray(manifest.analyticRecords)
    && manifest.analyticRecords.length === 144,
  `Manifest analytic record list does not contain 144 records.`);
  assertUnique(
    manifest.analyticRecords.map(({ parameterKey }) => parameterKey),
    'Manifest analytic records',
  );
  assertCanonicalEqual(
    manifest.analyticRecords.map(({ parameterKey }) => parameterKey),
    manifest.orderedCandidateKeys,
    'Manifest analytic-record order',
  );
  assertSha256(manifest.manifestSha256, 'Manifest hash');
  assert(
    sha256Canonical(withoutField(manifest, 'manifestSha256'))
      === manifest.manifestSha256,
    `Manifest hash '${manifest.manifestSha256}' does not recompute.`,
  );
}

function validateRunRecord(record, description) {
  assert(typeof record.parameterKey === 'string'
    && record.parameterKey.length > 0,
  `${description} has no parameter key.`);
  assertSha256(record.combinedEvaluationSha256,
    `${description} combined evaluation hash`);
  assertSha256(record.runEvidenceSha256,
    `${description} run evidence hash`);
  assert(Array.isArray(record.evaluationFailedGateIds),
    `${description} has no evaluation failure list.`);
  assert(typeof record.passesEvaluation === 'boolean',
    `${description} has no explicit evaluation acceptance result.`);
  assert(record.passesEvaluation
    === (record.evaluationFailedGateIds.length === 0),
  `${description} acceptance does not match its evaluation failure list.`);
}

export function validateWindmillPhysicsShard(
  shard,
  manifest,
  start,
  end,
  expectedKeys,
) {
  const description = `Shard [${String(start)}, ${String(end)})`;
  assert(
    shard.schema === 'fixture.windmill-compact-physics-search/1',
    `${description} schema is '${String(shard.schema)}', not v1.`,
  );
  assert(shard.manifestSha256 === manifest.manifestSha256,
    `${description} manifest hash drifted.`);
  assert(shard.enumerationFingerprint === manifest.enumerationFingerprint,
    `${description} enumeration fingerprint drifted.`);
  assert(shard.declaredAttemptCount === 144
    && shard.generationRejectedCount === 0
    && shard.analyticAcceptedCount === 144,
  `${description} changed the frozen 144/0/144 search counts.`);
  assertCanonicalEqual(
    shard.generationRejections,
    manifest.generationRejections,
    `${description} generation rejections`,
  );
  assertCanonicalEqual(
    shard.analyticRecords,
    manifest.analyticRecords,
    `${description} analytic manifest`,
  );
  assert(shard.shortRangeStart === start
    && shard.shortRangeEndExclusive === end,
  `${description} reported range [${String(shard.shortRangeStart)}, `
    + `${String(shard.shortRangeEndExclusive)}).`);
  assertCanonicalEqual(
    shard.rangeParameterKeys,
    expectedKeys,
    `${description} candidate keys`,
  );
  assert(shard.shortEvaluatedCount === expectedKeys.length,
    `${description} evaluated ${String(shard.shortEvaluatedCount)} short `
    + `runs, not ${String(expectedKeys.length)}.`);
  assert(Array.isArray(shard.shortRecords)
    && shard.shortRecords.length === expectedKeys.length,
  `${description} did not return one short record per key.`);
  assertCanonicalEqual(
    shard.shortRecords.map(({ parameterKey }) => parameterKey),
    expectedKeys,
    `${description} short-record order`,
  );
  shard.shortRecords.forEach((record, index) => {
    validateRunRecord(record, `${description} short record ${String(index)}`);
    assert(Array.isArray(record.shortMonotoneFailedGateIds),
      `${description} short record '${record.parameterKey}' has no monotone `
      + `failure list.`);
  });
  const shortRejectedCount = shard.shortRecords.filter(
    ({ shortMonotoneFailedGateIds }) =>
      shortMonotoneFailedGateIds.length > 0,
  ).length;
  assert(shard.shortRejectedCount === shortRejectedCount,
    `${description} reports ${String(shard.shortRejectedCount)} short `
    + `rejections but returns ${String(shortRejectedCount)} monotone-failed `
    + `records.`);
  const survivorKeys = shard.shortRecords
    .filter(({ shortMonotoneFailedGateIds }) =>
      shortMonotoneFailedGateIds.length === 0)
    .map(({ parameterKey }) => parameterKey);
  assert(Array.isArray(shard.fullRecords),
    `${description} has no full-record list.`);
  assertCanonicalEqual(
    shard.fullRecords.map(({ parameterKey }) => parameterKey),
    survivorKeys,
    `${description} full survivor order`,
  );
  shard.fullRecords.forEach((record, index) =>
    validateRunRecord(record, `${description} full record ${String(index)}`));
  const passingRecords = shard.fullRecords.filter(
    ({ passesEvaluation }) => passesEvaluation,
  );
  assert(shard.fullPassingCount === passingRecords.length,
    `${description} reports ${String(shard.fullPassingCount)} passes but `
    + `returns ${String(passingRecords.length)} accepted records.`);
  assertCanonicalEqual(
    shard.passingParameters,
    passingRecords.map(({ parameters }) => parameters),
    `${description} passing parameters`,
  );
  const firstPassing = passingRecords[0] ?? null;
  assert(
    shard.firstPassingParameterKey
      === (firstPassing?.parameterKey ?? null)
    && shard.firstPassingCombinedEvaluationSha256
      === (firstPassing?.combinedEvaluationSha256 ?? null),
    `${description} first-pass fields do not bind its first accepted full run.`,
  );
  const defaultIndex = expectedKeys.indexOf(manifest.defaultParameterKey);
  if (shard.defaultFullRecord === null) {
    assert(!shard.defaultWasSeparateAudit && defaultIndex === -1,
      `${description} omitted or misclassified its default full audit.`);
  } else {
    validateRunRecord(shard.defaultFullRecord,
      `${description} default full record`);
    assert(defaultIndex >= 0,
      `${description} returned the default audit outside its key range.`);
    assert(shard.defaultFullRecord.parameterKey
      === manifest.defaultParameterKey,
    `${description} returned default record `
      + `'${shard.defaultFullRecord.parameterKey}' instead of manifest `
      + `default '${manifest.defaultParameterKey}'.`);
    const defaultInFull = shard.fullRecords.find(({ parameterKey }) =>
      parameterKey === shard.defaultFullRecord.parameterKey);
    if (shard.defaultWasSeparateAudit) {
      assert(defaultInFull === undefined,
        `${description} marks the default as a separate audit but also `
        + `includes it in canonical full records.`);
      assert(!shard.defaultFullRecord.passesEvaluation,
        `${description} omitted a passing separately audited default from `
        + `its pass count.`);
      const shortDefault = shard.shortRecords.find(({ parameterKey }) =>
        parameterKey === shard.defaultFullRecord.parameterKey);
      assert(shortDefault !== undefined,
        `${description} separate default audit has no matching short run.`);
      assert(shortDefault.shortMonotoneFailedGateIds.length > 0,
        `${description} separately audited a default that survived short `
        + `monotone pruning.`);
    } else {
      assert(defaultInFull !== undefined,
        `${description} says its default audit is in-order, but no matching `
        + `full record exists.`);
      assertCanonicalEqual(
        shard.defaultFullRecord,
        defaultInFull,
        `${description} in-order default record`,
      );
    }
  }
  const expectedFullEvaluatedCount = shard.fullRecords.length
    + (shard.defaultWasSeparateAudit ? 1 : 0);
  assert(shard.fullEvaluatedCount === expectedFullEvaluatedCount,
    `${description} reports ${String(shard.fullEvaluatedCount)} full `
    + `evaluations, not ${String(expectedFullEvaluatedCount)}.`);
  assertSha256(shard.searchEvidenceSha256, `${description} evidence hash`);
  assert(
    sha256Canonical(withoutField(shard, 'searchEvidenceSha256'))
      === shard.searchEvidenceSha256,
    `${description} evidence hash '${shard.searchEvidenceSha256}' does not `
    + `recompute.`,
  );
}

export function aggregateWindmillPhysicsEvidence(
  manifest,
  shards,
  shardSize,
) {
  const shortRecords = shards.flatMap(({ evidence }) =>
    evidence.shortRecords);
  assertCanonicalEqual(
    shortRecords.map(({ parameterKey }) => parameterKey),
    manifest.orderedCandidateKeys,
    'Merged short-run coverage',
  );
  assertUnique(
    shortRecords.map(({ parameterKey }) => parameterKey),
    'Merged short-run coverage',
  );
  const fullRecords = shards.flatMap(({ evidence }) =>
    evidence.fullRecords);
  const expectedFullKeys = shortRecords
    .filter(({ shortMonotoneFailedGateIds }) =>
      shortMonotoneFailedGateIds.length === 0)
    .map(({ parameterKey }) => parameterKey);
  assertCanonicalEqual(
    fullRecords.map(({ parameterKey }) => parameterKey),
    expectedFullKeys,
    'Merged full-run survivor order',
  );
  const passingRecords = fullRecords.filter(
    ({ passesEvaluation }) => passesEvaluation,
  );
  const defaultShards = shards.filter(({ evidence }) =>
    evidence.defaultFullRecord !== null);
  assert(defaultShards.length === 1,
    `Merged search found ${String(defaultShards.length)} default full `
    + `records; expected exactly one.`);
  const defaultEvidence = defaultShards[0].evidence;
  const firstPassing = passingRecords[0] ?? null;
  const withoutHash = {
    schema: 'fixture.windmill-compact-physics-search-aggregate/1',
    enumerationFingerprint: manifest.enumerationFingerprint,
    manifestSha256: manifest.manifestSha256,
    declaredAttemptCount: manifest.declaredAttemptCount,
    generationRejectedCount: manifest.generationRejectedCount,
    analyticAcceptedCount: manifest.analyticAcceptedCount,
    generationRejections: manifest.generationRejections,
    analyticRecords: manifest.analyticRecords,
    orderedCandidateKeys: manifest.orderedCandidateKeys,
    shardSize,
    shards: shards.map(({ end, evidence, start }) => ({
      rangeStart: start,
      rangeEndExclusive: end,
      rangeParameterKeys: evidence.rangeParameterKeys,
      searchEvidenceSha256: evidence.searchEvidenceSha256,
    })),
    shortEvaluatedCount: shortRecords.length,
    shortRejectedCount: shortRecords.filter(
      ({ shortMonotoneFailedGateIds }) =>
        shortMonotoneFailedGateIds.length > 0,
    ).length,
    shortRecords,
    fullEvaluatedCount: fullRecords.length
      + (defaultEvidence.defaultWasSeparateAudit ? 1 : 0),
    fullPassingCount: passingRecords.length,
    fullRecords,
    passingParameters: passingRecords.map(({ parameters }) => parameters),
    firstPassingParameterKey: firstPassing?.parameterKey ?? null,
    firstPassingCombinedEvaluationSha256:
      firstPassing?.combinedEvaluationSha256 ?? null,
    defaultFullRecord: defaultEvidence.defaultFullRecord,
    defaultWasSeparateAudit: defaultEvidence.defaultWasSeparateAudit,
  };
  return {
    ...withoutHash,
    searchEvidenceSha256: sha256Canonical(withoutHash),
  };
}
