import type {
  PartFragmentV1,
  PartSettingsV1,
  PartSettingValueV1,
  PartV1,
} from './recipe.js';

/**
 * A part that describes itself. A bare `PartV1` function still works — the
 * shelf accepts either — but a definition carries what a human or an agent
 * needs to find and use the part without reading its source: what it is, what
 * it makes, which settings it takes with their bounds and defaults, and a few
 * named presets. The description lives with the part, so it cannot drift from
 * the code the way a separate registry would.
 *
 * The settings schema is not decoration: `resolvePartSettingsV1` reads the
 * part's inputs *through* it, so the declared bounds and defaults are the same
 * ones the build actually uses. A part's schema is therefore a promise it
 * keeps, which is the whole point of publishing it.
 */
export interface PartSettingSpecV1 {
  /** The settings key this describes, e.g. 'sizeX'. */
  readonly key: string;
  /** A short human label, e.g. 'Width'. */
  readonly label: string;
  /** One line on what the setting does, when the label is not enough. */
  readonly summary?: string;
  /**
   * How the value is read and clamped. 'int' floors at 1 (a size of zero is a
   * mistake); 'count' floors at 0 (no bed joint is an ordinary thing to ask
   * for); 'name' is a non-empty string; 'boolean' is a flag.
   */
  readonly kind: 'int' | 'count' | 'name' | 'boolean';
  /** Lower bound for 'int'/'count'; defaults to 1 and 0 respectively. */
  readonly min?: number;
  /** Upper bound for 'int'/'count'; defaults to the max part dimension. */
  readonly max?: number;
  /** Used when the setting is absent or the wrong type. */
  readonly default: PartSettingValueV1;
}

/** A named starting point for a part's settings, so a good default is one click, not guesswork. */
export interface PartPresetV1 {
  readonly name: string;
  readonly summary?: string;
  readonly settings: PartSettingsV1;
}

export interface PartDefinitionV1 {
  /** A short human title, e.g. 'Brick course'. */
  readonly title: string;
  /** What the part makes, in a sentence a person reads rather than decodes. */
  readonly summary: string;
  /** A grouping for browsing, e.g. 'masonry'. */
  readonly category?: string;
  /** Free tags for search, e.g. ['wall', 'brick']. */
  readonly tags?: readonly string[];
  readonly settings: readonly PartSettingSpecV1[];
  readonly presets?: readonly PartPresetV1[];
  /** Settings and a seed in, a fragment out — the part itself. */
  readonly build: PartV1;
}

/** A shelf entry is a described part or a bare function; both build the same way. */
export type PartShelfEntryV1 = PartV1 | PartDefinitionV1;

/** The largest a part dimension may be; the default upper bound for numeric settings. */
export const MAX_PART_DIMENSION = 64;

export function isPartDefinitionV1(entry: PartShelfEntryV1): entry is PartDefinitionV1 {
  return typeof entry !== 'function';
}

/** The build function of a shelf entry, whichever form it took. */
export function partBuildV1(entry: PartShelfEntryV1): PartV1 {
  return typeof entry === 'function' ? entry : entry.build;
}

/**
 * A part reduced to what discovery needs, whether it arrived as a rich
 * definition or a bare function. A bare function reports itself honestly:
 * its name, no description, and `selfDescribed: false`, so a browser can
 * nudge it toward becoming a definition rather than pretending it is one.
 */
export interface PartInfoV1 {
  readonly name: string;
  readonly title: string;
  readonly summary: string;
  readonly category?: string;
  readonly tags: readonly string[];
  readonly settings: readonly PartSettingSpecV1[];
  readonly presets: readonly PartPresetV1[];
  readonly selfDescribed: boolean;
}

export function partInfoV1(name: string, entry: PartShelfEntryV1): PartInfoV1 {
  if (typeof entry === 'function') {
    return { name, title: name, summary: '', tags: [], settings: [], presets: [], selfDescribed: false };
  }
  return {
    name,
    title: entry.title,
    summary: entry.summary,
    ...(entry.category === undefined ? {} : { category: entry.category }),
    tags: entry.tags ?? [],
    settings: entry.settings,
    presets: entry.presets ?? [],
    selfDescribed: true,
  };
}

/** Clamps one setting through its spec, the same read the build uses. */
export function resolvePartSettingV1(
  spec: PartSettingSpecV1,
  settings: PartSettingsV1,
): PartSettingValueV1 {
  const value = settings[spec.key];
  switch (spec.kind) {
    case 'int':
    case 'count': {
      const min = spec.min ?? (spec.kind === 'int' ? 1 : 0);
      const max = spec.max ?? MAX_PART_DIMENSION;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return spec.default;
      }
      return Math.min(max, Math.max(min, Math.round(value)));
    }
    case 'name':
      return typeof value === 'string' && value.length > 0 ? value : spec.default;
    case 'boolean':
      return typeof value === 'boolean' ? value : spec.default;
  }
}

/**
 * Every declared setting, clamped through its spec, as a plain object the build
 * reads by key. This is what makes the published schema honest: the bounds an
 * agent sees are the bounds the part enforces, because they are the same code.
 */
export function resolvePartSettingsV1(
  specs: readonly PartSettingSpecV1[],
  settings: PartSettingsV1,
): Record<string, PartSettingValueV1> {
  const resolved: Record<string, PartSettingValueV1> = {};
  for (const spec of specs) resolved[spec.key] = resolvePartSettingV1(spec, settings);
  return resolved;
}

export type { PartFragmentV1 };
