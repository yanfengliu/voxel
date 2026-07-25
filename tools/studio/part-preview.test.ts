import { describe, expect, it } from 'vitest';

import type { PartDefinitionV1 } from './part-definition.js';
import { buildPartPreviewModelV1 } from './part-preview.js';
import { validateModelV1 } from './model.js';
import { boxPart, brickCoursePart, createStudioParts } from './parts.js';
import { mixSeed, type PartV1 } from './recipe.js';

describe('part preview models', () => {
  it('builds every published part into the same valid still preview every time', () => {
    for (const [name, entry] of Object.entries(createStudioParts())) {
      const first = buildPartPreviewModelV1(name, entry);
      expect(buildPartPreviewModelV1(name, entry)).toEqual(first);
      expect(validateModelV1(first)).toEqual([]);
      expect(first.motion.periodMs).toBe(0);
    }
  });

  it('renders declared Brick course defaults with a neutral role palette', () => {
    const first = buildPartPreviewModelV1('brick-course', brickCoursePart);

    expect(first).toMatchObject({
      id: 'studio:part-preview:brick-course',
      label: 'Part: Brick course',
      seed: 0,
      size: [16, 3, 2],
      motion: {
        periodMs: 0,
        phaseRadians: 0,
        translation: [0, 0, 0],
        rotationRadians: [0, 0, 0],
        scale: [0, 0, 0],
      },
    });
    expect(first.voxels.filter((slot) => slot !== 0)).toHaveLength(96);
    expect(first.palette).toHaveLength(5);
    expect(first.palette[0]).toEqual({ r: 0, g: 0, b: 0 });
    expect(new Set(first.palette.slice(1).map((color) => JSON.stringify(color))).size).toBe(4);
  });

  it('avoids every consumer model id that collides with its preview namespace', () => {
    const model = buildPartPreviewModelV1('box', boxPart, [
      'studio:part-preview:box',
      'studio:part-preview:box:2',
    ]);

    expect(model.id).toBe('studio:part-preview:box:3');
  });

  it('generates a safe preview id even when a part name contains a lone surrogate', () => {
    const name = '\ud800';

    expect(buildPartPreviewModelV1(name, boxPart).id).toBe('studio:part-preview:%ud800');
  });

  it('renders a bare part with empty settings and the fixed effective seed', () => {
    const calls: { readonly settings: unknown; readonly seed: number }[] = [];
    const bare: PartV1 = (settings, seed) => {
      calls.push({ settings, seed });
      return { size: [1, 1, 1], roles: ['empty', 'body'], voxels: [1] };
    };

    expect(buildPartPreviewModelV1('bare', bare)).toMatchObject({
      id: 'studio:part-preview:bare',
      label: 'Part: bare',
      size: [1, 1, 1],
      voxels: [1],
    });
    expect(calls).toEqual([
      { settings: {}, seed: mixSeed(0, 0) },
      { settings: {}, seed: mixSeed(0, 0) },
    ]);
  });

  it('names a build failure and tells the publisher what must change', () => {
    const broken: PartDefinitionV1 = {
      title: 'Broken',
      summary: 'A part whose defaults do not build.',
      settings: [],
      build: () => { throw new Error('boom'); },
    };

    expect(() => buildPartPreviewModelV1('broken', broken)).toThrow(
      "Part 'broken' cannot be rendered with its declared default settings: "
      + "its build failed with boom. Fix the part's defaults or build function.",
    );
  });

  it('reports malformed fragment roles through the recipe validator', () => {
    const malformed: PartV1 = () => ({
      size: [1, 1, 1],
      roles: ['paint'],
      voxels: [0],
    });

    expect(() => buildPartPreviewModelV1('malformed', malformed)).toThrow(
      /Part 'malformed'.*Recipe cannot build:.*\$\.roles\[0\] Expected 'empty'/,
    );
  });

  it('turns a non-object build result into an actionable fragment error', () => {
    const returnsNull = (() => null) as unknown as PartV1;

    expect(() => buildPartPreviewModelV1('nothing', returnsNull)).toThrow(
      "Part 'nothing' cannot be rendered with empty settings (this bare part declares no defaults): "
      + "its build returned null, not a fragment object with size, roles, and voxels. Fix the part's build function.",
    );
  });

  it('does not alter a part definition while resolving its defaults', () => {
    const settings = structuredClone(boxPart.settings);
    const presets = structuredClone(boxPart.presets);

    buildPartPreviewModelV1('box', boxPart);

    expect(boxPart.settings).toEqual(settings);
    expect(boxPart.presets).toEqual(presets);
  });
});
