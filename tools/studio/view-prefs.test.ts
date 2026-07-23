import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIEW_PREFS,
  readViewPrefs,
  VIEW_PREFS_KEY,
  writeViewPrefs,
  type ViewPrefsStoreV1,
} from './view-prefs.js';

/** A plain in-memory store, standing in for `localStorage`. */
function mapStore(seed: Record<string, string> = {}): ViewPrefsStoreV1 & { readonly data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
}

describe('remembering the stage look', () => {
  it('opens on the default look when nothing was stored', () => {
    expect(readViewPrefs(mapStore())).toEqual(DEFAULT_VIEW_PREFS);
  });

  it('reads back exactly what was written, so the next visit matches the last', () => {
    const store = mapStore();
    const chosen = { depth: false, edges: false, lit: true, wireframe: true, grid: false };
    writeViewPrefs(store, chosen);
    expect(readViewPrefs(store)).toEqual(chosen);
  });

  it('keeps the fields a stored value did carry when it is missing newer ones', () => {
    // A value written before wireframe and the grid existed. Everything it
    // named is honoured; the fields it never knew about fall back to default.
    const store = mapStore({ [VIEW_PREFS_KEY]: JSON.stringify({ depth: false, edges: false, lit: true }) });
    expect(readViewPrefs(store)).toEqual({ depth: false, edges: false, lit: true, wireframe: false, grid: true });
  });

  it('falls back to the defaults for a wrong-typed field rather than trusting it', () => {
    const store = mapStore({ [VIEW_PREFS_KEY]: JSON.stringify({ depth: 'yes', edges: 0, lit: null, wireframe: true }) });
    expect(readViewPrefs(store)).toEqual({ ...DEFAULT_VIEW_PREFS, wireframe: true });
  });

  it('opens on the defaults for text that is not a preference at all', () => {
    for (const junk of ['not json', '[]', 'null', '42', '"look"']) {
      const store = mapStore({ [VIEW_PREFS_KEY]: junk });
      expect(readViewPrefs(store)).toEqual(DEFAULT_VIEW_PREFS);
    }
  });

  it('opens on the defaults when the store itself refuses to be read', () => {
    const throwing: ViewPrefsStoreV1 = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { /* unreached */ },
    };
    expect(readViewPrefs(throwing)).toEqual(DEFAULT_VIEW_PREFS);
  });

  it('lets a store that refuses the write pass without throwing', () => {
    const throwing: ViewPrefsStoreV1 = {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded'); },
    };
    expect(() => writeViewPrefs(throwing, DEFAULT_VIEW_PREFS)).not.toThrow();
  });
});
