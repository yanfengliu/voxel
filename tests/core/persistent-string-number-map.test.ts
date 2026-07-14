import { describe, expect, it } from 'vitest';

import { PersistentStringNumberMapInternal } from '../../src/core/persistent-string-number-map.js';

describe('PersistentStringNumberMapInternal', () => {
  it('balances ordered inserts while preserving prior immutable roots', () => {
    const empty = PersistentStringNumberMapInternal.empty();
    let map = empty;
    for (let index = 0; index < 10_000; index += 1) {
      map = map.setMaximum(`key:${String(index).padStart(5, '0')}`, index);
    }

    expect(empty.size).toBe(0);
    expect(map.size).toBe(10_000);
    expect(map.get('key:00000')).toBe(0);
    expect(map.get('key:05000')).toBe(5_000);
    expect(map.get('key:09999')).toBe(9_999);
    expect(map.get('missing')).toBeUndefined();
  });

  it('keeps the maximum value and structurally reuses no-op updates', () => {
    const first = PersistentStringNumberMapInternal.empty().setMaximum('same', 7);
    expect(first.setMaximum('same', 6)).toBe(first);
    expect(first.setMaximum('same', 7)).toBe(first);
    const advanced = first.setMaximum('same', 8);
    expect(advanced).not.toBe(first);
    expect(first.get('same')).toBe(7);
    expect(advanced.get('same')).toBe(8);
    expect(advanced.size).toBe(1);
  });
});
