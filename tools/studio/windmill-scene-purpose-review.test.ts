import { describe, expect, it } from 'vitest';

import {
  createWindmillScenePurposeReviewVariantsV1,
} from './windmill-scene-purpose-review.js';
import { createWindmillScene } from './windmill-scene.js';
import {
  WINDMILL_SYSTEM_PURPOSE_LEDGER_V1,
} from './windmill-system-purpose.js';

describe('windmill scene purpose review', () => {
  it('moves exactly one placement per review and preserves the canonical scene', () => {
    const canonical = createWindmillScene();
    // The mill is solved live, so the canonical scene carries no replay and
    // the review variants no longer have to strip one to isolate their move.
    if (canonical.schemaVersion !== 'studio.scene/3') {
      throw new Error(
        `Canonical windmill review scene uses '${canonical.schemaVersion}', expected 'studio.scene/3'.`,
      );
    }
    expect('poseReplay' in canonical).toBe(false);
    for (const variant of createWindmillScenePurposeReviewVariantsV1()) {
      expect(variant.scene.id).toBe(canonical.id);
      expect(variant.scene.schemaVersion, variant.id)
        .toBe('studio.scene/3');
      expect('poseReplay' in variant.scene).toBe(false);
      const changed = variant.scene.placements.filter(
        (placement, index) =>
          placement.at.some((value, axis) =>
            value !== canonical.placements[index]!.at[axis]),
      );
      expect(changed, variant.id).toHaveLength(1);
      expect(variant.expectedFailure.length, variant.id).toBeGreaterThan(20);
    }
  });

  it('references only exact purpose records and never claims dynamic proof', () => {
    const systemIds = new Set(
      WINDMILL_SYSTEM_PURPOSE_LEDGER_V1.map(({ id }) => id),
    );
    for (const variant of createWindmillScenePurposeReviewVariantsV1()) {
      expect(variant.purposeIds.some((id) =>
        id.startsWith('windmill:system-purpose:')
          ? systemIds.has(id as `windmill:system-purpose:${string}`)
          : id.startsWith('windmill:purpose:'))).toBe(true);
    }
    expect(new Set(WINDMILL_SYSTEM_PURPOSE_LEDGER_V1.map(
      ({ selectedDynamicProof }) => selectedDynamicProof,
    ))).toEqual(new Set([null]));
  });
});
