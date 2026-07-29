import { createHash } from 'node:crypto';

/**
 * Canonical JSON and hashing for fixture evidence, shared by every consumer.
 *
 * This began as `windmill-evidence-hash.ts`, whose own comment described it as
 * "dependency-free canonical JSON for fixture evidence" — nothing about it was
 * ever windmill-specific except the name. Machine Works, Riverfall and the
 * chain all hash evidence too, so it lives here now.
 *
 * Object keys are sorted so two runs that differ only in property order hash
 * the same, and non-finite numbers are refused outright: a NaN that reaches a
 * digest turns a reproducibility check into a coin flip.
 */

export function canonicalEvidenceJsonV1(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(
      `Cannot canonicalize non-finite evidence number ${String(value)}; every `
      + 'measured value must be finite before hashing.',
    );
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error(
        `Cannot canonicalize evidence value of type '${typeof value}': JSON `
        + 'has no stable encoding for it.',
      );
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalEvidenceJsonV1(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalEvidenceJsonV1(record[key])}`).join(',')}}`;
}

export function evidenceSha256V1(
  parts: readonly (string | Uint8Array)[],
): string {
  const hash = createHash('sha256');
  parts.forEach((part) => hash.update(part));
  return hash.digest('hex');
}

/** `sha256:`-prefixed digest of one canonical value, which is what traces carry. */
export function canonicalEvidenceDigestV1(value: unknown): string {
  return `sha256:${evidenceSha256V1([canonicalEvidenceJsonV1(value)])}`;
}
