import { describe, expect, it } from 'vitest';

import {
  createBedroomFurnitureSetRecipe,
  createHouseholdRecipeBook,
  createMadeBedRecipe,
} from './household-recipes.js';
import {
  createHouseholdPhysicalBook,
} from './household-physical-assets.js';
import { validatePhysicalAssetV1 } from './physical-asset.js';
import { compilePhysicalModelV1 } from './physical-compile.js';
import { createStudioParts } from './parts.js';

const parts = createStudioParts();
const book = createHouseholdRecipeBook();
const physical = createHouseholdPhysicalBook();

const BED = 'studio:made-bed';
const SET = 'studio:bedroom-furniture-set';
const SET_BED = `${SET}/steps[0]<studio:made-bed>`;
const SET_NIGHTSTAND = `${SET}/steps[1]<studio:nightstand>`;
const SET_LAMP = `${SET}/steps[2]<studio:table-lamp>`;
// The set's own mirror step copies the bedside pair; the marker sits at the
// set's level because the set's mirror ran, not one inside the furniture.
const SET_NIGHTSTAND_COPY = `${SET}/mirrors[3:x]/steps[1]<studio:nightstand>`;
const SET_LAMP_COPY = `${SET}/mirrors[3:x]/steps[2]<studio:table-lamp>`;

describe('household physical assets', () => {
  it('saves a valid sidecar for every rigid object and none for the rest', () => {
    expect(Object.keys(physical)).toEqual([
      'studio:bed-frame',
      'studio:mattress',
      'studio:pillow',
      'studio:nightstand',
      'studio:table-lamp',
    ]);
    for (const [slot, asset] of Object.entries(physical)) {
      expect(validatePhysicalAssetV1(asset), slot).toEqual([]);
      expect(asset.recipeId, slot).toBe(slot);
    }
    // The blanket has no honest rigid shape, and the compositions' physical
    // content is exactly their placed parts — no sidecar means no claims.
    expect(physical['studio:blanket']).toBeUndefined();
    expect(physical[BED]).toBeUndefined();
    expect(physical[SET]).toBeUndefined();
  });

  it('compiles the made bed into one body per rigid piece, resting unattached', () => {
    const compiled = compilePhysicalModelV1(createMadeBedRecipe(), parts, book, physical);
    expect(compiled.occurrences.map(({ path, reflected }) => ({ path, reflected }))).toEqual([
      { path: `${BED}/steps[0]<studio:bed-frame>`, reflected: false },
      { path: `${BED}/steps[1]<studio:mattress>`, reflected: false },
      { path: `${BED}/steps[2]<studio:pillow>`, reflected: false },
      { path: `${BED}/mirrors[3:x]/steps[2]<studio:pillow>`, reflected: true },
    ]);
    expect(compiled.bodies.map(({ key, pose }) => ({ key, pose }))).toEqual([
      { key: `${BED}/steps[0]<studio:bed-frame>#body:frame`, pose: { position: [5.5, 2, 8.5] } },
      { key: `${BED}/steps[1]<studio:mattress>#body:mattress`, pose: { position: [5.5, 5, 8.5] } },
      { key: `${BED}/steps[2]<studio:pillow>#body:pillow`, pose: { position: [3, 7, 2.5] } },
      { key: `${BED}/mirrors[3:x]/steps[2]<studio:pillow>#body:pillow`, pose: { position: [8, 7, 2.5] } },
    ]);
    // Resting is placement, not attachment: no joint says mattress-on-frame.
    expect(compiled.constraints).toEqual([]);
  });

  it('compiles the furniture set into distinct bodies with working mirrored drawers', () => {
    const compiled = compilePhysicalModelV1(
      createBedroomFurnitureSetRecipe(), parts, book, physical,
    );
    // The mirrored bed reflects onto itself — an authored symmetric no-op —
    // so only the bedside pair gains mirrored occurrences.
    expect(compiled.occurrences.map(({ path, reflected }) => ({ path, reflected }))).toEqual([
      { path: `${SET_BED}/steps[0]<studio:bed-frame>`, reflected: false },
      { path: `${SET_BED}/steps[1]<studio:mattress>`, reflected: false },
      { path: `${SET_BED}/steps[2]<studio:pillow>`, reflected: false },
      { path: `${SET_BED}/mirrors[3:x]/steps[2]<studio:pillow>`, reflected: true },
      { path: SET_NIGHTSTAND, reflected: false },
      { path: SET_LAMP, reflected: false },
      { path: SET_NIGHTSTAND_COPY, reflected: true },
      { path: SET_LAMP_COPY, reflected: true },
    ]);
    expect(compiled.bodies.map(({ key, pose }) => ({ key, pose }))).toEqual([
      { key: `${SET_BED}/steps[0]<studio:bed-frame>#body:frame`, pose: { position: [13.5, 2, 11.5] } },
      { key: `${SET_BED}/steps[1]<studio:mattress>#body:mattress`, pose: { position: [13.5, 5, 11.5] } },
      { key: `${SET_BED}/steps[2]<studio:pillow>#body:pillow`, pose: { position: [11, 7, 5.5] } },
      { key: `${SET_BED}/mirrors[3:x]/steps[2]<studio:pillow>#body:pillow`, pose: { position: [16, 7, 5.5] } },
      { key: `${SET_NIGHTSTAND}#body:cabinet`, pose: { position: [3.5, 3, 7.5] } },
      { key: `${SET_NIGHTSTAND}#body:drawer`, pose: { position: [3.5, 4.5, 4.5] } },
      { key: `${SET_LAMP}#body:lamp`, pose: { position: [3.5, 9, 6.5] } },
      { key: `${SET_NIGHTSTAND_COPY}#body:cabinet`, pose: { position: [23.5, 3, 7.5] } },
      { key: `${SET_NIGHTSTAND_COPY}#body:drawer`, pose: { position: [23.5, 4.5, 4.5] } },
      { key: `${SET_LAMP_COPY}#body:lamp`, pose: { position: [23.5, 9, 6.5] } },
    ]);
    // Both drawers still pull out of the cabinet's front face: a slide is
    // an ordinary direction and this one is untouched by an x mirror.
    expect(compiled.constraints.map(({ key, bodyA, bodyB, axis, limits }) => ({
      key, bodyA, bodyB, axis, limits,
    }))).toEqual([
      {
        key: `${SET_NIGHTSTAND}#constraint:drawer-slide`,
        bodyA: `${SET_NIGHTSTAND}#body:cabinet`,
        bodyB: `${SET_NIGHTSTAND}#body:drawer`,
        axis: [0, 0, -1],
        limits: [0, 2],
      },
      {
        key: `${SET_NIGHTSTAND_COPY}#constraint:drawer-slide`,
        bodyA: `${SET_NIGHTSTAND_COPY}#body:cabinet`,
        bodyB: `${SET_NIGHTSTAND_COPY}#body:drawer`,
        axis: [0, 0, -1],
        limits: [0, 2],
      },
    ]);
    expect(compiled.ports.map(({ key, frame }) => ({ key, frame }))).toEqual([
      { key: `${SET_LAMP}#port:base`, frame: { position: [0, -3, 0] } },
      { key: `${SET_LAMP_COPY}#port:base`, frame: { position: [0, -3, 0] } },
    ]);
  });

  it('carries authored material values through the compile untouched', () => {
    const compiled = compilePhysicalModelV1(createMadeBedRecipe(), parts, book, physical);
    const mattress = compiled.colliders.find(
      ({ body }) => body === `${BED}/steps[1]<studio:mattress>#body:mattress`,
    );
    expect(mattress?.density).toBe(0.3);
    expect(mattress?.friction).toBe(0.8);
    const frameColliders = compiled.colliders.filter(
      ({ body }) => body === `${BED}/steps[0]<studio:bed-frame>#body:frame`,
    );
    expect(frameColliders).toHaveLength(10);
  });
});
