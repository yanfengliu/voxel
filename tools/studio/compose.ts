import type { PartSettingsV1, RecipeStepV1 } from './recipe.js';

/**
 * Ways of arranging parts, written to be borrowed.
 *
 * A recipe that hardcodes its own arrangement teaches nothing twice: the next
 * model starts from a blank page even when it is the same idea in different
 * clothes. So the arrangement is written here, generally, and a recipe becomes
 * a short statement of which arrangement with which numbers.
 *
 * These produce plain-data steps. They are helpers for *writing* a recipe, not
 * new kinds of step: the step menu stays at three, the saved recipe stays a
 * flat list anyone can read, and nothing here can appear in a recipe file.
 */

export interface StackOptionsV1 {
  /** The part to repeat, by the name the recipe's part shelf uses. */
  readonly part: string;
  /** How many repetitions to attempt. Fewer may be produced; see `settings`. */
  readonly count: number;
  /** Where the first repetition goes. */
  readonly at: readonly [number, number, number];
  /** How far each repetition moves from the one before it. */
  readonly spacing: readonly [number, number, number];
  /**
   * Settings for repetition `index`. Returning null ends the run, which is
   * how a stack stops when the next repetition would not fit — the caller
   * knows its own geometry, and this does not need to.
   */
  readonly settings: (index: number) => PartSettingsV1 | null;
  /** Plain words for repetition `index`, shown while the model is built. */
  readonly note?: (index: number) => string;
}

/**
 * Repeats one part along a line, varying it as it goes.
 *
 * The general shape behind a surprising number of things: courses up a wall,
 * posts along a fence, floors up a tower, planks across a deck, teeth on a
 * cog. What differs between them is the part, the spacing, and how the
 * settings change with the index — so those are exactly what this takes.
 */
export function stackSteps(options: StackOptionsV1): RecipeStepV1[] {
  const [ax, ay, az] = options.at;
  const [dx, dy, dz] = options.spacing;
  const steps: RecipeStepV1[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const settings = options.settings(index);
    if (settings === null) break;
    const note = options.note?.(index);
    steps.push({
      kind: 'part',
      part: options.part,
      at: [ax + dx * index, ay + dy * index, az + dz * index],
      settings,
      ...(note === undefined ? {} : { note }),
    });
  }
  return steps;
}

/**
 * Alternates between two values by index. The plainest possible statement of
 * a rhythm, and the one that turns a stack of identical courses into a bond.
 */
export function alternate<T>(index: number, even: T, odd: T): T {
  return index % 2 === 0 ? even : odd;
}
