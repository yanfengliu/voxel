/**
 * The presentation choices the stage remembers between items and visits: real
 * depth, study edges, lighting, scene animation, wireframe, and the grid. These
 * belong to the Studio rather than any one model or scene, so the next item
 * keeps the same view and movement preference.
 *
 * The store is injected so this stays a pure, testable mapping from stored text
 * to a valid preference. The browser backing is `localStorage`; a test hands in
 * a plain map, and a page where storage is blocked gets a no-op that always
 * reads the defaults. A malformed or partial stored value never throws and
 * never half-applies: every missing or wrong field falls back deliberately,
 * so a stored value written by an older studio still opens. A legacy value
 * without the independent animation field migrates its former light-motion
 * choice from `lit`; a fresh Studio still defaults animation on.
 */

export interface ViewPrefsV1 {
  /** Real depth (perspective) on, or the flat voxel view. */
  readonly depth: boolean;
  /** Study edges on (the examining look), or the game look. */
  readonly edges: boolean;
  /** A light source on, so faces shade by how they face it. */
  readonly lit: boolean;
  /** Scene animation may advance automatically; disabled holds every animated scene at its presented time. */
  readonly sceneAnimation: boolean;
  /** Wireframe on: the solid faces give way to a see-through line drawing. */
  readonly wireframe: boolean;
  /** A one-unit ground grid under the model, so a voxel size reads as a scale. */
  readonly grid: boolean;
}

/**
 * The resting presentation, matching what the stage opened on before it
 * remembered anything: real depth, study edges, no light, live scene
 * animation, solid faces, and the reference grid.
 */
export const DEFAULT_VIEW_PREFS: ViewPrefsV1 = {
  depth: true,
  edges: true,
  lit: false,
  sceneAnimation: true,
  wireframe: false,
  // On by default: the grid is what makes a voxel size read as a real scale,
  // and it is the reference the size control leans on.
  grid: true,
};

/** The one place a Studio's presentation choices are kept; versioned so a future shape can migrate rather than misread. */
export const VIEW_PREFS_KEY = 'voxel-studio-view/1';

/** Just the two calls this needs, so `localStorage` fits and a test's map fits. */
export interface ViewPrefsStoreV1 {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readBoolean(source: Record<string, unknown>, field: keyof ViewPrefsV1): boolean {
  const value = source[field];
  return typeof value === 'boolean' ? value : DEFAULT_VIEW_PREFS[field];
}

function readSceneAnimation(source: Record<string, unknown>): boolean {
  if (Object.hasOwn(source, 'sceneAnimation')) {
    return readBoolean(source, 'sceneAnimation');
  }
  // Before this field existed, moving light handles followed `lit`. Preserve
  // that remembered behavior for legacy stored views while making subsequent
  // writes independent.
  return readBoolean(source, 'lit');
}

/**
 * The remembered presentation, or the defaults when nothing was stored or the stored
 * text cannot be trusted. Each field is validated on its own, so a value
 * missing `sceneAnimation` because it was written before that control existed
 * migrates the former light-motion choice from its valid `lit` field.
 */
export function readViewPrefs(store: ViewPrefsStoreV1): ViewPrefsV1 {
  let raw: string | null;
  try {
    raw = store.getItem(VIEW_PREFS_KEY);
  } catch {
    // A store that throws on read (storage disabled, quota, privacy mode) is
    // not an error here: the studio simply opens on its default look.
    return DEFAULT_VIEW_PREFS;
  }
  if (raw === null) return DEFAULT_VIEW_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_VIEW_PREFS;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_VIEW_PREFS;
  }
  const source = parsed as Record<string, unknown>;
  return {
    depth: readBoolean(source, 'depth'),
    edges: readBoolean(source, 'edges'),
    lit: readBoolean(source, 'lit'),
    sceneAnimation: readSceneAnimation(source),
    wireframe: readBoolean(source, 'wireframe'),
    grid: readBoolean(source, 'grid'),
  };
}

/** Records the current look. A store that refuses the write is ignored: a look that could not be saved is not worth crashing the stage over. */
export function writeViewPrefs(store: ViewPrefsStoreV1, prefs: ViewPrefsV1): void {
  try {
    store.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Storage full or blocked; the look just will not persist this visit. */
  }
}

/**
 * The browser's own store, guarded so a page that forbids `localStorage` still
 * mounts. Reaching `window.localStorage` can itself throw, so even acquiring it
 * is wrapped; the fallback reads as empty and drops writes, which `readViewPrefs`
 * turns into the default look.
 */
export function browserViewPrefsStore(): ViewPrefsStoreV1 {
  try {
    const storage = window.localStorage;
    // Touch it once behind the guard so a store that throws only on use is
    // caught here rather than on the first real read.
    storage.getItem(VIEW_PREFS_KEY);
    return storage;
  } catch {
    return { getItem: () => null, setItem: () => { /* no-op */ } };
  }
}
