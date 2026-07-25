import { describe, expect, it } from 'vitest';

import type { ShelfModelV1, StudioCatalogV1 } from './catalog.js';
import { openingModel } from './studio-app-helpers.js';
import type { StudioModelV1 } from './model.js';

function model(id: string): StudioModelV1 {
  return {
    schemaVersion: 'studio.voxel-model/1',
    id,
    label: id,
    seed: 1,
    size: [1, 1, 1],
    palette: [{ r: 0, g: 0, b: 0 }],
    voxels: [0],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

function entry(id: string, loadedId = id): ShelfModelV1 {
  return {
    id,
    label: id,
    load: () => model(loadedId),
    howItsMade: () => {
      throw new Error('The opening-model identity fixture must not inspect a recipe.');
    },
  };
}

function catalog(...models: readonly ShelfModelV1[]): StudioCatalogV1 {
  return { sections: [{ name: 'Models', models }] };
}

describe('opening model identity', () => {
  it('opens one exact requested shelf identity', () => {
    expect(openingModel(catalog(entry('first'), entry('second')), 'second').id).toBe('second');
  });

  it('rejects a shelf entry whose loaded model changes identity', () => {
    expect(() => openingModel(catalog(entry('shelf:id', 'model:id')), 'shelf:id')).toThrow(
      "Shelf entry 'shelf:id' loaded model 'model:id', so its stable identity is ambiguous. "
      + "Make ShelfModelV1.id and load().id both 'shelf:id'.",
    );
  });

  it('rejects an explicitly requested duplicate id instead of opening the first match', () => {
    expect(() => openingModel(catalog(entry('duplicate'), entry('duplicate')), 'duplicate')).toThrow(
      "The shelf contains 2 models called 'duplicate', so none can be opened unambiguously. "
      + 'Give every shelf model a unique id.',
    );
  });

  it('rejects a duplicate default id instead of silently opening the first match', () => {
    expect(() => openingModel(catalog(entry('duplicate'), entry('duplicate')), undefined)).toThrow(
      "The shelf contains 2 models called 'duplicate', so none can be opened unambiguously. "
      + 'Give every shelf model a unique id.',
    );
  });
});
