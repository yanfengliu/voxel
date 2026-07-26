import { describe, expect, it } from 'vitest';

import {
  archSpanPart,
  branchingFormPart,
  createStudioParts,
  openFramePart,
  radialWheelPart,
  stairRunPart,
  taperedMassPart,
  trussSpanPart,
} from './parts.js';
import { partInfoV1, type PartDefinitionV1 } from './part-definition.js';
import type { PartFragmentV1, PartSettingsV1 } from './recipe.js';

const DEFINITIONS = {
  'arch-span': archSpanPart,
  'tapered-mass': taperedMassPart,
  'open-frame': openFramePart,
  'stair-run': stairRunPart,
  'radial-wheel': radialWheelPart,
  'branching-form': branchingFormPart,
  'truss-span': trussSpanPart,
} as const;

function cell(fragment: PartFragmentV1, x: number, y: number, z: number): number {
  const [sx, sy] = fragment.size;
  return fragment.voxels[x + sx * (y + sy * z)]!;
}

function expectValid(fragment: PartFragmentV1): void {
  expect(fragment.roles[0]).toBe('empty');
  expect(fragment.size.every((dimension) => Number.isInteger(dimension) && dimension >= 1 && dimension <= 64)).toBe(true);
  expect(fragment.voxels).toHaveLength(fragment.size[0] * fragment.size[1] * fragment.size[2]);
  expect(fragment.voxels.every((voxel) => Number.isInteger(voxel) && voxel >= 0 && voxel < fragment.roles.length)).toBe(true);
  expect(fragment.voxels.some((voxel) => voxel > 0)).toBe(true);
}

function expectOccupiedConnected(fragment: PartFragmentV1, label = 'part'): void {
  const [sx, sy, sz] = fragment.size;
  const occupied = fragment.voxels.flatMap((voxel, index) => voxel > 0 ? [index] : []);
  const remaining = new Set(occupied);
  const first = occupied[0];
  expect(first).toBeDefined();
  const queue = [first!];
  remaining.delete(first!);
  while (queue.length > 0) {
    const index = queue.shift()!;
    const x = index % sx;
    const y = Math.floor(index / sx) % sy;
    const z = Math.floor(index / (sx * sy));
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < sx ? index + 1 : -1,
      y > 0 ? index - sx : -1,
      y + 1 < sy ? index + sx : -1,
      z > 0 ? index - sx * sy : -1,
      z + 1 < sz ? index + sx * sy : -1,
    ];
    for (const neighbor of neighbors) {
      if (remaining.delete(neighbor)) queue.push(neighbor);
    }
  }
  expect(remaining.size, `${label} has disconnected occupied cells`).toBe(0);
}

function highSettings(definition: PartDefinitionV1): PartSettingsV1 {
  const settings: Record<string, number | string | boolean> = {};
  for (const setting of definition.settings) {
    if (setting.kind === 'name') settings[setting.key] = '';
    else if (setting.kind === 'boolean') settings[setting.key] = true;
    else settings[setting.key] = 999;
  }
  return settings;
}

function lowSettings(definition: PartDefinitionV1): PartSettingsV1 {
  const settings: Record<string, number | string | boolean> = {};
  for (const setting of definition.settings) {
    if (setting.kind === 'name') settings[setting.key] = '';
    else if (setting.kind === 'boolean') settings[setting.key] = false;
    else settings[setting.key] = -999;
  }
  return settings;
}

describe('the creative part vocabulary', () => {
  it('publishes seven self-described, preset-backed contracts', () => {
    const shelf = createStudioParts();
    const expectedPresets = {
      'arch-span': ['Gateway', 'Arcade'],
      'tapered-mass': ['Pyramid', 'Buttress'],
      'open-frame': ['Cube cage', 'Portal frame'],
      'stair-run': ['Stoop', 'Monumental'],
      'radial-wheel': ['Wagon wheel', 'Flywheel'],
      'branching-form': ['Sapling', 'Canopy scaffold'],
      'truss-span': ['Footbridge', 'Roof truss'],
    };
    for (const [name, definition] of Object.entries(DEFINITIONS)) {
      expect(shelf[name]).toBe(definition);
      const info = partInfoV1(name, definition);
      expect(info).toMatchObject({ name, selfDescribed: true });
      expect(info.summary.length).toBeGreaterThan(20);
      expect(info.settings.length).toBeGreaterThan(0);
      expect(info.presets.map((preset) => preset.name)).toEqual(expectedPresets[name as keyof typeof expectedPresets]);
      for (const preset of info.presets) expectValid(definition.build(preset.settings, 42));
    }
  });

  it('is deterministic and every default is connected with real negative space', () => {
    for (const definition of Object.values(DEFINITIONS)) {
      const first = definition.build({}, 1234);
      expect(definition.build({}, 1234)).toEqual(first);
      expectValid(first);
      expectOccupiedConnected(first, definition.title);
      expect(first.voxels).toContain(0);
    }
  });

  it('keeps every fragment valid at both setting boundaries', () => {
    const expectedSizes = {
      'arch-span': { low: [5, 4, 1], high: [64, 64, 64] },
      'tapered-mass': { low: [1, 2, 1], high: [64, 64, 64] },
      'open-frame': { low: [3, 3, 1], high: [64, 64, 64] },
      'stair-run': { low: [1, 1, 1], high: [64, 64, 64] },
      'radial-wheel': { low: [5, 5, 1], high: [63, 63, 64] },
      'branching-form': { low: [5, 4, 5], high: [31, 64, 31] },
      'truss-span': { low: [5, 3, 1], high: [64, 32, 64] },
    };
    for (const [name, definition] of Object.entries(DEFINITIONS)) {
      const low = definition.build(lowSettings(definition), 7);
      const high = definition.build(highSettings(definition), 7);
      expectValid(low);
      expectValid(high);
      expectOccupiedConnected(low, `${definition.title} at minimum settings`);
      const sizes = expectedSizes[name as keyof typeof expectedSizes];
      expect(low.size).toEqual(sizes.low);
      expect(high.size).toEqual(sizes.high);
      for (const spec of definition.settings) {
        if (spec.kind === 'name') {
          expect(low.roles).not.toContain('');
          expect(high.roles).not.toContain('');
        }
      }
    }
  });
});

describe('architectural parts', () => {
  it('builds a curved arch over an open portal', () => {
    const built = archSpanPart.build({ width: 9, height: 7, depth: 2, thickness: 1, role: 'masonry' }, 0);
    expect(built.size).toEqual([9, 7, 2]);
    expect(built.roles).toEqual(['empty', 'masonry']);
    expect(cell(built, 4, 0, 0)).toBe(0);
    expect(cell(built, 4, 6, 0)).toBe(1);
    expect(cell(built, 0, 0, 0)).toBe(1);
  });

  it('narrows a tapered mass from its full base to its requested crown', () => {
    const built = taperedMassPart.build({
      width: 7, height: 5, depth: 5, topWidth: 3, topDepth: 1, role: 'earth',
    }, 0);
    expect(built.size).toEqual([7, 5, 5]);
    expect(built.roles).toEqual(['empty', 'earth']);
    const baseCells = Array.from({ length: 7 * 5 }, (_, index) => cell(built, index % 7, 0, Math.floor(index / 7)));
    const topCells = Array.from({ length: 7 * 5 }, (_, index) => cell(built, index % 7, 4, Math.floor(index / 7)));
    expect(baseCells.filter(Boolean)).toHaveLength(35);
    expect(topCells.filter(Boolean)).toHaveLength(3);
  });

  it('leaves faces open while joining the twelve members of an open frame', () => {
    const built = openFramePart.build({ width: 7, height: 7, depth: 7, thickness: 1, role: 'timber' }, 0);
    expect(built.size).toEqual([7, 7, 7]);
    expect(built.roles).toEqual(['empty', 'timber']);
    expect(cell(built, 3, 3, 0)).toBe(0);
    expect(cell(built, 0, 3, 0)).toBe(1);
    expect(cell(built, 0, 0, 3)).toBe(1);
  });

  it('turns step count, rise, and run into an ascending solid', () => {
    const built = stairRunPart.build({ steps: 3, width: 4, rise: 2, run: 2, role: 'step' }, 0);
    expect(built.size).toEqual([4, 6, 6]);
    expect(built.roles).toEqual(['empty', 'step']);
    expect(cell(built, 2, 1, 0)).toBe(1);
    expect(cell(built, 2, 2, 0)).toBe(0);
    expect(cell(built, 2, 5, 5)).toBe(1);
  });
});

describe('expressive parts', () => {
  it('separates a wheel into rim, hub, and spoke roles around open cells', () => {
    const built = radialWheelPart.build({
      radius: 6, depth: 2, hubRadius: 1, spokes: 8, rimRole: 'iron', hubRole: 'axle', spokeRole: 'wood',
    }, 0);
    expect(built.size).toEqual([13, 13, 2]);
    expect(built.roles).toEqual(['empty', 'iron', 'axle', 'wood']);
    expect(cell(built, 6, 6, 0)).toBe(2);
    expect(cell(built, 6, 0, 0)).toBe(1);
    expect(cell(built, 0, 0, 0)).toBe(0);
  });

  it('uses the seed for bounded wheel, branch, and truss structure changes', () => {
    for (const definition of [radialWheelPart, branchingFormPart, trussSpanPart]) {
      const even = definition.build({}, 0);
      const odd = definition.build({}, 1);
      expect(odd.voxels).not.toEqual(even.voxels);
      expect(definition.build({}, 1)).toEqual(odd);
      expect(odd.size).toEqual(even.size);
      expect(odd.roles).toEqual(even.roles);
      expectValid(even);
      expectValid(odd);
    }
  });

  it('keeps every seeded branch attached to its trunk', () => {
    for (const seed of [0, 1, 2, 17, 999]) {
      const built = branchingFormPart.build({
        height: 14, spread: 6, trunk: 2, branches: 8, trunkRole: 'stem', branchRole: 'limb',
      }, seed);
      expect(built.size).toEqual([13, 14, 13]);
      expect(built.roles).toEqual(['empty', 'stem', 'limb']);
      expect(built.voxels).toContain(2);
      expectOccupiedConnected(built);
    }
  });

  it('leaves open truss bays between connected chords and braces', () => {
    const built = trussSpanPart.build({
      length: 16, height: 6, depth: 2, chordRole: 'beam', braceRole: 'diagonal',
    }, 0);
    expect(built.size).toEqual([16, 6, 2]);
    expect(built.roles).toEqual(['empty', 'beam', 'diagonal']);
    expect(built.voxels).toContain(0);
    expect(built.voxels).toContain(1);
    expect(built.voxels).toContain(2);
    expectOccupiedConnected(built);
  });
});
