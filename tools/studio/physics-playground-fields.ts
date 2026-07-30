import {
  PLAYGROUND_FLOOR_TOP_V1,
  type PlaygroundBodyDefV1,
  type PlaygroundStationV1,
} from './physics-playground-types.js';
import type { PlaygroundMaterialIdV1 } from './physics-playground-materials.js';

/**
 * The three preset fields: the same drop pile at ten, one hundred, and
 * five hundred blocks. Small is for routine debugging, medium for
 * profiling ordinary loads, stress for finding scaling problems — it does
 * not promise the target frame rate, it promises honest timing numbers.
 */

const FLOOR_TOP = PLAYGROUND_FLOOR_TOP_V1;

function fieldFloor(): PlaygroundBodyDefV1 {
  return {
    placementId: 'floor',
    recipeId: 'studio:pg-floor',
    kind: 'fixed',
    material: 'deck',
    at: [0, 0, 0],
    tests: 'Every station needs one honest ground: bodies must rest on it, '
      + 'never sink into it, and its multiply combine rule lets each '
      + 'contact read the touching material undiluted.',
  };
}

/** The preset fields: the same drop pile at three scales. */
function fieldStation(
  suffix: 'small' | 'medium' | 'stress',
  count: number,
  summary: string,
): PlaygroundStationV1 {
  const materials: readonly PlaygroundMaterialIdV1[] =
    ['wood', 'stone', 'steel', 'ice'];
  const perLayer = 100;
  const bodies = Array.from({ length: count }, (_, index): PlaygroundBodyDefV1 => {
    const layer = Math.floor(index / perLayer);
    const inLayer = index % perLayer;
    const row = Math.floor(inLayer / 10);
    const column = inLayer % 10;
    const material = materials[index % materials.length] ?? 'stone';
    const nudge = ((index * 7) % 5 - 2) * 0.02;
    return {
      placementId: `field-${String(index).padStart(3, '0')}`,
      recipeId: `studio:pg-block-${material}`,
      kind: 'dynamic',
      material,
      at: [
        -4.95 + column * 1.1 + nudge,
        1.5 + layer * 1.3,
        -4.95 + row * 1.1 - nudge,
      ],
      tests: 'One unit of the load field: the preset exists to scale body '
        + 'count, so every block is the same known cube and the only '
        + 'variable is how many there are.',
    };
  });
  return {
    sceneId: `studio:scene:physics-field-${suffix}`,
    label: `Physics: field (${suffix})`,
    summary,
    bodies: [fieldFloor(), ...bodies],
    slopes: [],
    cases: [],
    scenarios: [{
      id: `field-${suffix}-settles`,
      label: suffix === 'stress'
        ? 'The stress field drops, stays finite, and reports timing'
        : `The ${suffix} field drops, settles, and stays finite`,
      ticks: suffix === 'stress' ? 480 : 960,
      checks: [
        { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.05 },
        // Small and medium must actually come to rest; the stress preset
        // deliberately stops early and reports timing instead of settling.
        ...(suffix === 'stress'
          ? []
          : [{ check: 'all-asleep-or-slow', maxSpeed: 0.15 } as const]),
        { check: 'all-finite' },
      ],
    }],
  };
}

export function createPlaygroundFieldStationsV1(): readonly PlaygroundStationV1[] {
  return [
    fieldStation('small', 10,
      'Ten blocks drop onto the floor: the routine-debugging preset. Small '
      + 'enough to read individual contacts in the overlay.'),
    fieldStation('medium', 100,
      'One hundred blocks drop in layers: the ordinary-gameplay profiling '
      + 'preset. Watch the physics-time readout while it settles.'),
    fieldStation('stress', 500,
      'Five hundred blocks drop in five layers: the scaling-problem finder. '
      + 'It does not promise the target frame rate — it promises honest '
      + 'timing numbers instead.'),
  ];
}
