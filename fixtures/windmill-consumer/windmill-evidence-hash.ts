import {
  canonicalEvidenceJsonV1,
  evidenceSha256V1,
} from '../evidence-hash.js';

/**
 * Windmill's names for the shared fixture-evidence helpers.
 *
 * The implementation moved to `fixtures/evidence-hash.ts` because nothing about
 * it was windmill-specific; these aliases keep the eight call sites reading the
 * way their surrounding code does.
 */

export const canonicalWindmillEvidenceJsonV1 = canonicalEvidenceJsonV1;
export const windmillEvidenceSha256V1 = evidenceSha256V1;
