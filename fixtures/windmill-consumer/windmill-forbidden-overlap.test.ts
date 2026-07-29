import { describe, expect, it } from 'vitest';

import {
  windmillAllowedContactPairKeysV1,
} from './windmill-forbidden-overlap.js';

describe('windmill intentional compound contact sets', () => {
  it('exempts every cam/follower and head/anvil-face pair, not one index', () => {
    const keys = windmillAllowedContactPairKeysV1({
      camColliderIndices: [10, 11],
      followerColliderIndices: [0, 12],
      headColliderIndices: [6],
      anvilFaceColliderIndices: [2, 3, 4],
    });
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('hammer:12|rotor:11');
    expect(keys).toContain('anvil:4|hammer:6');
  });
});
