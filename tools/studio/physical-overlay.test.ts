import { describe, expect, it } from 'vitest';

import {
  createBedroomFurnitureSetRecipe,
  createHouseholdRecipeBook,
} from './household-recipes.js';
import { createHouseholdPhysicalBook } from './household-physical-assets.js';
import { createStudioParts } from './parts.js';
import { STUDIO_PHYSICAL_ASSET_SCHEMA_V1 } from './physical-asset.js';
import { compilePhysicalModelV1, type CompiledPhysicalModelV1 } from './physical-compile.js';
import { physicalOverlaySegmentsV1 } from './physical-overlay.js';

const HALF = Math.SQRT1_2;

function compiledWith(
  partial: Partial<CompiledPhysicalModelV1>,
): CompiledPhysicalModelV1 {
  return {
    occurrences: [], bodies: [], colliders: [], constraints: [], ports: [], ...partial,
  };
}

describe('physicalOverlaySegmentsV1', () => {
  const BODY = {
    key: 'test:one#body:b',
    occurrence: 'test:one',
    localKey: 'b',
    type: 'fixed' as const,
    pose: { position: [2, 3, 4] as const },
  };

  it('outlines a box as twelve edges around its posed corners', () => {
    const segments = physicalOverlaySegmentsV1(compiledWith({
      bodies: [BODY],
      colliders: [{
        occurrence: 'test:one',
        body: BODY.key,
        shape: { kind: 'box', halfExtents: [1, 0.5, 2] },
        pose: { position: [0, 0, 0] },
      }],
    }));
    expect(segments).toHaveLength(12);
    expect(segments.every(({ kind }) => kind === 'collider')).toBe(true);
    const corners = new Set(segments.flatMap(({ a, b }) => [a.join(','), b.join(',')]));
    expect([...corners].sort()).toEqual([
      '1,2.5,2', '1,2.5,6', '1,3.5,2', '1,3.5,6',
      '3,2.5,2', '3,2.5,6', '3,3.5,2', '3,3.5,6',
    ].sort());
  });

  it('turns a box with its body rotation', () => {
    const segments = physicalOverlaySegmentsV1(compiledWith({
      bodies: [{
        ...BODY,
        pose: { position: [0, 0, 0] as const, rotation: [0, HALF, 0, HALF] as const },
      }],
      colliders: [{
        occurrence: 'test:one',
        body: BODY.key,
        shape: { kind: 'box', halfExtents: [2, 1, 1] },
        pose: { position: [0, 0, 0] },
      }],
    }));
    // A quarter turn about Y carries the corner (2, 1, 1) to (1, 1, -2).
    const points = segments.flatMap(({ a, b }) => [a, b]);
    const hit = points.some(([x, y, z]) =>
      Math.abs(x - 1) < 1e-9 && Math.abs(y - 1) < 1e-9 && Math.abs(z + 2) < 1e-9);
    expect(hit).toBe(true);
  });

  it('composes the collider local pose through the body pose', () => {
    const segments = physicalOverlaySegmentsV1(compiledWith({
      bodies: [{
        ...BODY,
        pose: { position: [10, 0, 0] as const, rotation: [0, HALF, 0, HALF] as const },
      }],
      ports: [{
        key: 'test:one#port:p',
        occurrence: 'test:one',
        localKey: 'p',
        body: BODY.key,
        frame: { position: [1, 0, 0] },
      }],
    }));
    // The port sits one unit along the body's local X, which the quarter
    // turn points down -Z: every axis arm is centred on (10, 0, -1).
    expect(segments).toHaveLength(3);
    expect(segments.every(({ kind }) => kind === 'port')).toBe(true);
    for (const { a, b } of segments) {
      expect((a[0] + b[0]) / 2).toBeCloseTo(10, 9);
      expect((a[1] + b[1]) / 2).toBeCloseTo(0, 9);
      expect((a[2] + b[2]) / 2).toBeCloseTo(-1, 9);
    }
  });

  it('tags sensors apart and counts each round shape honestly', () => {
    const round = (shape: { kind: 'sphere'; radius: number }
    | { kind: 'capsule' | 'cylinder'; halfHeight: number; radius: number }) =>
      physicalOverlaySegmentsV1(compiledWith({
        bodies: [BODY],
        colliders: [{
          occurrence: 'test:one', body: BODY.key, shape, pose: { position: [0, 0, 0] }, role: 'sensor',
        }],
      }));
    const sphere = round({ kind: 'sphere', radius: 2 });
    expect(sphere).toHaveLength(48);
    expect(sphere.every(({ kind }) => kind === 'sensor')).toBe(true);
    expect(round({ kind: 'cylinder', halfHeight: 2, radius: 1 })).toHaveLength(36);
    expect(round({ kind: 'capsule', halfHeight: 2, radius: 1 })).toHaveLength(68);
  });

  it('outlines the whole bedroom furniture set deterministically', () => {
    const compiled = compilePhysicalModelV1(
      createBedroomFurnitureSetRecipe(),
      createStudioParts(),
      createHouseholdRecipeBook(),
      createHouseholdPhysicalBook(),
    );
    const segments = physicalOverlaySegmentsV1(compiled);
    // 39 box colliders of 12 edges each, plus two lamp ports of 3 arms.
    expect(segments).toHaveLength(474);
    expect(segments.filter(({ kind }) => kind === 'port')).toHaveLength(6);
    expect(segments.filter(({ kind }) => kind === 'sensor')).toHaveLength(0);
    expect(physicalOverlaySegmentsV1(compiled)).toEqual(segments);
  });

  it('draws nothing for a compiled model with no physical content', () => {
    expect(physicalOverlaySegmentsV1(compiledWith({}))).toEqual([]);
    // A schema-valid but empty sidecar compiles to nothing and draws nothing.
    expect(STUDIO_PHYSICAL_ASSET_SCHEMA_V1).toBe('studio.physical-asset/1');
  });
});
