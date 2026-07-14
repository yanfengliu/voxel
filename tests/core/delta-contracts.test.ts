import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
  DELTA_ISSUE_CODES_V1,
  HARD_RENDER_TRANSACTION_LIMITS_V1,
  RENDER_DELTA_SCHEMA_V1,
} from '../../src/core/index.js';

describe('Delta V1 contracts', () => {
  it('freezes the schema, stable issue codes, and bounded default limits', () => {
    expect(RENDER_DELTA_SCHEMA_V1).toBe('voxel.render-delta/1');
    expect(Object.isFrozen(DELTA_ISSUE_CODES_V1)).toBe(true);
    expect(Object.isFrozen(DEFAULT_RENDER_TRANSACTION_LIMITS_V1)).toBe(true);
    expect(Object.isFrozen(HARD_RENDER_TRANSACTION_LIMITS_V1)).toBe(true);
    for (const name of Object.keys(HARD_RENDER_TRANSACTION_LIMITS_V1) as (
      keyof typeof HARD_RENDER_TRANSACTION_LIMITS_V1
    )[]) {
      expect(DEFAULT_RENDER_TRANSACTION_LIMITS_V1[name]).toBeGreaterThan(0);
      expect(DEFAULT_RENDER_TRANSACTION_LIMITS_V1[name])
        .toBeLessThanOrEqual(HARD_RENDER_TRANSACTION_LIMITS_V1[name]);
    }
    expect(new Set(Object.values(DELTA_ISSUE_CODES_V1)).size)
      .toBe(Object.keys(DELTA_ISSUE_CODES_V1).length);
  });
});
