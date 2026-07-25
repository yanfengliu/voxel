import { describe, expect, it } from 'vitest';

import type { ShelfModelV1, ShelfSectionV1 } from './catalog.js';
import { createModelLabelWorkspace } from './model-label-workspace.js';

function model(id: string, label: string): ShelfModelV1 {
  return {
    id,
    label,
    load: () => { throw new Error('This label-workspace fixture must not load a model.'); },
    howItsMade: () => { throw new Error('This label-workspace fixture must not read a recipe.'); },
  };
}

function sections(...models: readonly ShelfModelV1[]): readonly ShelfSectionV1[] {
  return [{ name: 'Furniture', models }];
}

describe('model label workspace', () => {
  it('overlays a trimmed display name while preserving stable identity and consumer input', () => {
    const chair = Object.freeze(model('studio:chair', 'Chair'));
    const source = Object.freeze([
      Object.freeze({
        name: 'Furniture',
        models: Object.freeze([chair]),
      }),
    ]);
    const workspace = createModelLabelWorkspace(source);

    expect(workspace.rename('studio:chair', '  Reading chair  ')).toEqual({
      id: 'studio:chair',
      label: 'Reading chair',
      originalLabel: 'Chair',
      renamed: true,
    });
    expect(workspace.sections()).toEqual([{
      name: 'Furniture',
      models: [{
        id: 'studio:chair',
        label: 'Reading chair',
        originalLabel: 'Chair',
        renamed: true,
      }],
    }]);
    expect(source[0]?.models[0]).toBe(chair);
    expect(source[0]?.models[0]?.label).toBe('Chair');
  });

  it('resolves effective and fallback labels for model and scene presentation', () => {
    const workspace = createModelLabelWorkspace(sections(model('studio:chair', 'Chair')));

    expect(workspace.label('studio:chair', 'Recipe chair')).toBe('Chair');
    expect(workspace.label('studio:missing', 'Missing recipe')).toBe('Missing recipe');

    workspace.rename('studio:chair', 'Reading chair');

    expect(workspace.label('studio:chair', 'Recipe chair')).toBe('Reading chair');
  });

  it('restores the canonical label explicitly or by renaming back to it', () => {
    const workspace = createModelLabelWorkspace(sections(model('studio:chair', 'Chair')));

    workspace.rename('studio:chair', 'Reading chair');
    expect(workspace.restore('studio:chair')).toEqual({
      id: 'studio:chair',
      label: 'Chair',
      originalLabel: 'Chair',
      renamed: false,
    });

    workspace.rename('studio:chair', 'Reading chair');
    expect(workspace.rename('studio:chair', '  Chair  ').renamed).toBe(false);
    expect(workspace.label('studio:chair', 'Recipe chair')).toBe('Chair');
  });

  it('rejects invalid and unresolvable renames with actionable diagnostics', () => {
    const workspace = createModelLabelWorkspace(sections(
      model('studio:chair', 'Chair'),
      model('studio:same', 'First'),
      model('studio:same', 'Second'),
    ));

    expect(() => workspace.rename('studio:chair', 42)).toThrow(
      "Model 'studio:chair' cannot be renamed because its new display name must be a string; "
      + 'received number.',
    );
    expect(() => workspace.rename('studio:chair', '   ')).toThrow(
      "Model 'studio:chair' cannot be renamed to an empty display name; "
      + 'enter at least one non-whitespace character.',
    );
    expect(() => workspace.rename('studio:missing', 'Anything')).toThrow(
      "No model in this studio has the id 'studio:missing', so its display name cannot be renamed. "
      + 'Choose an id returned by sections().',
    );
    expect(() => workspace.rename('studio:same', 'Anything')).toThrow(
      "Model id 'studio:same' appears 2 times, so its display name cannot be renamed; "
      + 'give every manageable model a unique id.',
    );
    expect(() => workspace.restore('studio:same')).toThrow(
      "Model id 'studio:same' appears 2 times, so its display name cannot be restored; "
      + 'give every manageable model a unique id.',
    );
    expect(workspace.label('studio:same', 'Ambiguous recipe')).toBe('Ambiguous recipe');
  });

  it('allows duplicate display names because ids remain authoritative', () => {
    const workspace = createModelLabelWorkspace(sections(
      model('studio:chair', 'Chair'),
      model('studio:table', 'Table'),
    ));

    workspace.rename('studio:chair', 'Furniture');
    workspace.rename('studio:table', 'Furniture');

    expect(workspace.sections()[0]?.models.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'studio:chair', label: 'Furniture' },
      { id: 'studio:table', label: 'Furniture' },
    ]);
  });
});
