import { describe, expect, it } from 'vitest';

import {
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
  type ContrastFamilyV1,
} from './contrast-recipes.js';
import { createContrastScenes } from './contrast-scenes.js';
import type { ScenePlacementV1, SceneV1 } from './scene.js';
import type { ModelMotionV1 } from './model.js';

/**
 * A contact sheet's layout is authored, so each of its decisions owes a reason:
 * why this order, why this orientation, why this pitch, and what a short last
 * row means. These tests hold those decisions to the sheet's stated job of
 * comparing form.
 */

const FAMILY_SCENE_IDS: Readonly<Record<ContrastFamilyV1, string>> = {
  'arch-void': 'studio:scene:contrast-arch-void',
  'tapered-stepped': 'studio:scene:contrast-tapered-stepped',
  'frame-truss': 'studio:scene:contrast-frame-truss',
  'radial-mechanical': 'studio:scene:contrast-radial-mechanical',
  'branching-organic': 'studio:scene:contrast-branching-organic',
  'asymmetric-hybrid': 'studio:scene:contrast-asymmetric-hybrid',
};

const DISPLAY_GRAIN = 0.65;

function moves(motion: ModelMotionV1 | undefined): boolean {
  if (!motion || motion.periodMs <= 0) return false;
  return motion.translation.some((value) => value !== 0)
    || motion.rotationRadians.some((value) => value !== 0)
    || motion.scale.some((value) => value !== 1);
}

function sheetFor(family: ContrastFamilyV1): SceneV1 {
  const id = FAMILY_SCENE_IDS[family];
  const scene = createContrastScenes().find((entry) => entry.id === id);
  if (!scene) throw new Error(`Contact sheet '${id}' is missing.`);
  return scene;
}

function spanOf(model: string): number {
  const entry = CURATED_CONTRAST_RECIPES.find((item) => item.recipe.id === model);
  if (!entry) throw new Error(`No curated recipe is called '${model}'.`);
  return Math.max(entry.recipe.size[0], entry.recipe.size[2]) * DISPLAY_GRAIN;
}

describe('every contrast contact sheet', () => {
  for (const family of CONTRAST_FAMILIES) {
    describe(family, () => {
      const scene = sheetFor(family);
      const entries = CURATED_CONTRAST_RECIPES.filter(
        (entry) => entry.family === family,
      );

      it('faces every specimen the same way', () => {
        for (const item of scene.placements) {
          expect(
            item.turns ?? 0,
            `${item.id} is turned, so the sheet would compare a different face of it`,
          ).toBe(0);
        }
      });

      it('keeps clear ground between the widest neighbours', () => {
        const byRow = new Map<number, ScenePlacementV1[]>();
        for (const item of scene.placements) {
          const row = byRow.get(item.at[2]) ?? [];
          row.push(item);
          byRow.set(item.at[2], row);
        }
        for (const row of byRow.values()) {
          const ordered = [...row].sort((a, b) => a.at[0] - b.at[0]);
          for (let index = 1; index < ordered.length; index += 1) {
            const left = ordered[index - 1]!;
            const right = ordered[index]!;
            const gap = (right.at[0] - left.at[0])
              - (spanOf(left.model) + spanOf(right.model)) / 2;
            expect(
              gap,
              `${left.id} and ${right.id} leave clear ground between them`,
            ).toBeGreaterThan(0);
          }
        }
      });

      it('centers a trailing partial row on its own item count', () => {
        const rows = new Map<number, number[]>();
        for (const item of scene.placements) {
          const row = rows.get(item.at[2]) ?? [];
          row.push(item.at[0]);
          rows.set(item.at[2], row);
        }
        for (const [z, xs] of rows) {
          const mean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
          expect(
            mean,
            `the row at z=${String(z)} holding ${String(xs.length)} specimens is centered`,
          ).toBeCloseTo(0, 10);
        }
      });

      it('holds exactly the specimens of its own family', () => {
        const placed = scene.placements.map((item) => {
          const entry = CURATED_CONTRAST_RECIPES.find(
            (candidate) => candidate.recipe.id === item.model,
          );
          if (!entry) throw new Error(`'${item.model}' is not a promoted recipe.`);
          return entry.family;
        });

        expect(new Set(placed), 'a sheet mixes no families').toEqual(
          new Set([family]),
        );
        expect(placed).toHaveLength(entries.length);
      });

      it('keeps every specimen on one row, so none can hide behind another', () => {
        // These models are tall enough that a second row would stand behind the
        // first at any raised camera. One row makes that impossible.
        expect(new Set(scene.placements.map((item) => item.at[2]))).toEqual(
          new Set([0]),
        );
      });

      it('claims motion only for specimens that actually move', () => {
        const moving = entries.filter((entry) => moves(entry.recipe.motion));
        const summary = (scene.summary ?? '').toLowerCase();

        if (moving.length === 0) {
          expect(summary, 'a sheet with no motion says so').toContain('static');
        } else {
          expect(summary, 'motion here is authored, not solved or driven')
            .toContain('authored');
        }
      });

      it('never attributes motion to a cause the scene does not simulate', () => {
        const summary = (scene.summary ?? '').toLowerCase();

        for (const phrase of ['wind-driven', 'powered by', 'driven by', 'water-driven']) {
          expect(summary, `'${phrase}' names a cause nothing here simulates`)
            .not.toContain(phrase);
        }
      });
    });
  }
});

describe('the contact sheets as a set', () => {
  it('share one pitch so every sheet stays comparable', () => {
    const pitches = new Set<number>();
    for (const family of CONTRAST_FAMILIES) {
      const scene = sheetFor(family);
      const xs = [...new Set(scene.placements.map((item) => item.at[0]))]
        .sort((a, b) => a - b);
      for (let index = 1; index < xs.length; index += 1) {
        pitches.add(Number((xs[index]! - xs[index - 1]!).toFixed(6)));
      }
    }
    // One row per sheet at one shared pitch, so every gap is the same number.
    expect(pitches.size, 'every neighbouring gap is the same').toBe(1);
  });

  it('derives its pitch from the widest promoted specimen', () => {
    const widest = Math.max(...CURATED_CONTRAST_RECIPES.map(
      (entry) => Math.max(entry.recipe.size[0], entry.recipe.size[2]) * DISPLAY_GRAIN,
    ));
    const scene = sheetFor('arch-void');
    const xs = [...new Set(scene.placements.map((item) => item.at[0]))]
      .sort((a, b) => a - b);
    const pitch = xs[1]! - xs[0]!;

    expect(pitch, 'the pitch clears the widest specimen with room to spare')
      .toBeGreaterThan(widest);
    expect(pitch - widest, 'and the clear gap is the stated five units')
      .toBeCloseTo(5, 10);
  });
});
