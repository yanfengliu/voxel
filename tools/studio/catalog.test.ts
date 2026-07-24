import { describe, expect, it } from 'vitest';

import { createStudioCatalog } from './catalog.js';
import { createStudioRecipeBook } from './recipes.js';

/**
 * The discoverability contract: a saved recipe that cannot be found is a
 * bug, not a state. These pins make the failure modes loud — a recipe
 * added to a section book but not the shelf, a shelf entry disagreeing
 * with its own recipe's name, or two entries claiming one id.
 */
describe('the studio shelf', () => {
  it('shows every saved recipe exactly once, under its own name', () => {
    const catalog = createStudioCatalog();
    const entries = catalog.sections.flatMap((section) => section.models);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of entries) {
      const made = entry.howItsMade();
      expect(made.recipe.id, entry.id).toBe(entry.id);
      expect(made.recipe.label, entry.id).toBe(entry.label);
      // Every entry can place any saved recipe; the book rides along.
      expect(made.book, entry.id).toBeDefined();
    }
    expect([...Object.keys(createStudioRecipeBook())].sort()).toEqual([...ids].sort());
  });

  it('keeps each section a coherent home with a stable order', () => {
    const catalog = createStudioCatalog();
    expect(catalog.sections.map(({ name, models }) => ({ name, count: models.length }))).toEqual([
      { name: 'Shapes', count: 1 },
      { name: 'Walls', count: 2 },
      { name: 'Garden', count: 3 },
      { name: 'Furniture', count: 3 },
      { name: 'Bedroom furniture', count: 8 },
      { name: 'Roof studies', count: 3 },
      { name: 'House', count: 2 },
      { name: 'Home', count: 3 },
      { name: 'Home furnishings', count: 10 },
      { name: 'Outdoors', count: 4 },
    ]);
  });
});
