import { createHash } from 'node:crypto';

/**
 * Dependency-free canonical JSON for fixture evidence. This leaf deliberately
 * imports no Studio geometry or legacy windmill configuration.
 */
export function canonicalWindmillEvidenceJsonV1(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `Cannot canonicalize non-finite windmill evidence number `
      + `${String(value)}; every measured value must be finite before hashing.`,
    );
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error(
        `Cannot canonicalize windmill evidence value of type `
        + `'${typeof value}': JSON has no stable encoding for it.`,
      );
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) =>
      canonicalWindmillEvidenceJsonV1(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:`
    + canonicalWindmillEvidenceJsonV1(record[key])).join(',')}}`;
}

export function windmillEvidenceSha256V1(
  parts: readonly (string | Uint8Array)[],
): string {
  const hash = createHash('sha256');
  parts.forEach((part) => hash.update(part));
  return hash.digest('hex');
}
