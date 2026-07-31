import {
  PLAYGROUND_FLOOR_TOP_V1,
  type PlaygroundAlignV1,
  type PlaygroundBodyDefV1,
  type PlaygroundSlopeV1,
  type PlaygroundStationV1,
} from './physics-playground-types.js';

/**
 * Station 5 — rolling bodies on a straight track and a 45-degree twin.
 *
 * Its own module because the station outgrew the shared definitions file
 * when its catch berms came down: the ground it stands on is now derived
 * from a measured run-out and says so, and the run-out itself is a
 * scenario rather than a sentence. `physics-playground-fields.ts` and
 * `physics-playground-trebuchet.ts` left for the same reason.
 */

const FLOOR_TOP = PLAYGROUND_FLOOR_TOP_V1;

/**
 * The rolling station's ground, which is the measured run-out rather than
 * a chosen size.
 *
 * It used to be two tiles and two 1.25 m catch berms, because before
 * rolling resistance was a law a smooth ball never stopped and had to be
 * walled in. It stops now: reaching the flat at about 5 m/s, the ideal
 * ball runs 20.1 m past the slope foot at x -9 and comes to rest 14.5 s
 * after release, most of that spent on the flat. The berms
 * were not merely idle after that — they were falsifying the station's
 * own result. Measured against them, the smooth ball finished 0.18 m
 * ahead of the voxel sphere; measured on ground long enough, 14.64 m
 * ahead. A wall was reporting a tie where the physics had a landslide.
 *
 * So the rule for this ground is: on ground with no edge the racers stay
 * inside x[-30.1, 13.9] and z[-5.9, 16.1] — collider extents, not centres
 * — and one apron slab caps at 64 voxels, so lay a 16 m tile on the 16 m
 * grid wherever a racer travels, and nowhere else. Four tiles satisfy
 * that, and the rule is enforced by subtraction rather than by argument:
 * removing any one of these four fails a rolling scenario.
 *
 * Two cells of the 3x2 grid are deliberately empty, which is why the
 * apron is L-shaped rather than rectangular, and a fifth tile was laid at
 * (8, 16) before that rule was applied honestly. Its stated reason was a
 * near-miss at the z 8 seam. Two independent re-measurements, taking
 * every collider corner at every tick rather than centres on a sampling
 * stride, agree that the near-miss is real and larger than claimed:
 * cylinder-hollow-b's rim crosses the seam to z 8.117 at tick 1762, so
 * for a moment it overhangs the void by 0.117 m. Nothing falls. Its
 * centre is 1.07 m inside the tile it is sitting on, which is not a pose
 * a body tips out of, and removing the fifth tile failed no scenario
 * where removing any of the four fails at least one. A momentary rim
 * overhang is a margin, not a consequence, so the tile went the way the
 * berms went.
 *
 * The margins are stated rather than assumed, including the awkward one.
 * The smooth ball's collider reaches x -30.01 against the west edge at
 * -32, so 1.99 m; irregular-b reaches x 13.86 against 16. The tightest
 * clearance on the station is not either of those, it is the -0.12 m
 * above. Of the two unlaid cells the north-west one is clear by 5.3 m
 * and 9.0 m at its two edges; the north-east one is the seam the
 * cylinder crosses.
 */
const APRON_TILES: readonly PlaygroundBodyDefV1[] = [
  {
    placementId: 'apron-west',
    recipeId: 'studio:pg-apron',
    kind: 'fixed',
    material: 'deck',
    at: [-24, 0, 0],
    tests: 'The far end of the straight run-out, and the ground the old '
      + 'berm stood in place of: the smooth ball crosses onto it and rests '
      + 'at x -29.1, where the catch wall used to stop it at -14.4. '
      + 'Nothing else on either track ever reaches it.',
  },
  {
    placementId: 'apron-mid',
    recipeId: 'studio:pg-apron',
    kind: 'fixed',
    material: 'deck',
    at: [-8, 0, 0],
    tests: 'The grid-aligned track and the near half of its run-out. Every '
      + 'faceted racer on that track stops here under its own rolling '
      + 'resistance — the cylinders by x -12.8, the voxel sphere by -14.5.',
  },
  {
    placementId: 'apron-east',
    recipeId: 'studio:pg-apron',
    kind: 'fixed',
    material: 'deck',
    at: [8, 0, 0],
    tests: 'The 45-degree track, its staging end, and where its cube and '
      + 'cylinders come to rest.',
  },
  {
    placementId: 'apron-north',
    recipeId: 'studio:pg-apron',
    kind: 'fixed',
    material: 'deck',
    at: [-8, 0, 16],
    tests: 'Where the diagonal track actually ends: its smooth ball leaves '
      + 'the slope heading north-west and rests at z 15.1, well past the '
      + 'z 8 edge the old apron stopped at. It is the only body that '
      + 'crosses onto this tile.',
  },
];

/** Builds station 5, for the station registry. */
export function createRollingStationV1(): PlaygroundStationV1 {
  const racers = (track: 'a' | 'b'): PlaygroundBodyDefV1[] => {
    const slopeAligned = 'slope' as const;
    const worldAligned = 'world' as const;
    const entries: readonly {
      id: string;
      recipeId: string;
      lateral: number;
      collider?: 'ball';
      align: PlaygroundAlignV1;
      tests: string;
    }[] = [
      {
        id: 'sphere-voxel',
        recipeId: 'studio:pg-sphere',
        lateral: -3.875,
        align: worldAligned,
        tests: 'The voxel sphere with its exact stepped colliders: its '
          + 'clatter, bounce, and drift against the ideal-ball twin measure '
          + 'the grid-stepping artifact directly.',
      },
      {
        id: 'sphere-ball',
        recipeId: 'studio:pg-sphere',
        lateral: -1.925,
        collider: 'ball',
        align: worldAligned,
        tests: 'The same sphere with a primitive ball collider — a stated '
          + 'simplification. It rolls smoothly on any track heading, which '
          + 'is what makes it the control for the voxel twin.',
      },
      {
        id: 'cylinder-solid',
        recipeId: 'studio:pg-cylinder-solid',
        lateral: -0.1,
        align: slopeAligned,
        tests: 'The solid roller: lowest rotational inertia per mass of the '
          + 'pair, so it must finish ahead of the hollow twin.',
      },
      {
        id: 'cylinder-hollow',
        recipeId: 'studio:pg-cylinder-hollow',
        lateral: 1.6,
        align: slopeAligned,
        tests: 'The hollow roller: rim-heavy, so it must trail the solid '
          + 'cylinder on the same slope — the rotational-inertia race.',
      },
      {
        id: 'cube',
        recipeId: 'studio:pg-block-wood',
        lateral: 3.05,
        align: slopeAligned,
        tests: 'The cube control: it must slide or tumble, never roll '
          + 'smoothly — if it keeps pace with the rollers, friction or '
          + 'contact is wrong.',
      },
      {
        id: 'irregular',
        recipeId: 'studio:pg-irregular',
        lateral: 4.25,
        align: slopeAligned,
        tests: 'The asymmetric chunk: its offset center of mass must make '
          + 'it tumble irregularly and settle in a biased pose, the '
          + 'stability probe for non-ideal shapes.',
      },
    ];
    return entries.map((entry): PlaygroundBodyDefV1 => ({
      placementId: `${entry.id}-${track}`,
      recipeId: entry.recipeId,
      kind: 'dynamic',
      material: entry.recipeId === 'studio:pg-block-wood' ? 'wood' : 'stone',
      at: [0, 0, 0],
      onSlope: {
        slopeId: `track-${track}`,
        along: 6.8,
        lateral: entry.lateral,
        gap: 0.04,
        align: entry.align,
      },
      ...(entry.collider === 'ball' ? { collider: 'ball' as const } : {}),
      tests: entry.tests,
    }));
  };
  const slope = (
    slopeId: string,
    yawDegrees: number,
    foot: readonly [number, number],
  ): PlaygroundSlopeV1 => ({
    slopeId,
    // 28 degrees, not 20: a d7 voxel cylinder rests on a 0.75 m flat facet
    // and only tips over its edge above roughly 24 degrees, so on gentler
    // slopes the faceted rollers sit still forever — a real voxel-physics
    // finding this station exists to expose, and the race needs them moving.
    angleDegrees: 28,
    yawDegrees,
    foot,
    footY: FLOOR_TOP,
    thicknessMeters: 0.25,
  });
  return {
    sceneId: 'studio:scene:physics-rolling',
    label: 'Physics: rolling and rotation',
    summary: 'Six bodies race down a 28-degree slope: voxel sphere, '
      + 'ideal-ball twin, solid and hollow cylinders, a cube, and an '
      + 'asymmetric chunk. A second identical track runs 45 degrees to the '
      + 'voxel grid; the spheres stay world-aligned on it, so any behaviour '
      + 'difference between tracks is the grid-direction artifact.',
    bodies: [
      ...APRON_TILES,
      {
        placementId: 'track-a',
        recipeId: 'studio:pg-track',
        kind: 'fixed',
        material: 'deck',
        at: [0, 0, 0],
        onSlope: { slopeId: 'track-a', along: 0, lateral: 0, gap: 0, align: 'slope' },
        tests: 'The grid-aligned slope: downhill runs along the voxel x '
          + 'axis, the baseline every rolling measurement compares against.',
      },
      {
        placementId: 'track-b',
        recipeId: 'studio:pg-track',
        kind: 'fixed',
        material: 'deck',
        at: [0, 0, 0],
        onSlope: { slopeId: 'track-b', along: 0, lateral: 0, gap: 0, align: 'slope' },
        tests: 'The 45-degree twin: same slab, same angle, yawed against '
          + 'the grid so voxel-stepped surfaces roll diagonally across '
          + 'their own steps.',
      },
      ...racers('a'),
      ...racers('b'),
    ],
    slopes: [
      slope('track-a', 0, [-9, 0]),
      slope('track-b', 45, [5.8, 2.2]),
    ],
    cases: [],
    scenarios: [
      {
        id: 'rolling-inertia-race',
        label: 'The smooth ball beats both faceted cylinders, which do roll',
        ticks: 1200,
        checks: [
          // On smooth rims the solid cylinder beats the hollow one. Voxel
          // rims are twelve-sided prisms, tip-rolling speed is
          // corner-impact-loss dominated, and the measured solid-hollow gap
          // flips sign with centimeter-scale changes to the spawn pose
          // (±0.05–0.25 m over this slope, both orderings observed). The
          // scenario therefore pins only what is robust — the smooth-
          // collider control wins decisively and both faceted rollers
          // actually roll — and records the unstable ordering as a
          // documented grid artifact: bodies meant to race by inertia need
          // smooth colliders.
          { check: 'ends-behind', leader: 'sphere-ball-a', trailer: 'cylinder-solid-a', axis: 0, sign: -1 },
          { check: 'ends-behind', leader: 'sphere-ball-a', trailer: 'cylinder-hollow-a', axis: 0, sign: -1 },
          { check: 'moved-at-least', placementId: 'cylinder-solid-a', minTravelMeters: 2 },
          { check: 'moved-at-least', placementId: 'cylinder-hollow-a', minTravelMeters: 2 },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.05 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'rolling-grid-artifact',
        label: 'The ideal ball behaves alike on both tracks; the voxel sphere may not',
        ticks: 900,
        checks: [
          { check: 'moved-at-least', placementId: 'sphere-ball-a', minTravelMeters: 4 },
          { check: 'moved-at-least', placementId: 'sphere-ball-b', minTravelMeters: 4 },
          { check: 'moved-at-least', placementId: 'sphere-voxel-a', minTravelMeters: 1 },
          { check: 'moved-at-least', placementId: 'sphere-voxel-b', minTravelMeters: 1 },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.05 },
          { check: 'all-finite' },
        ],
      },
      {
        // The measurement the catch berms were hiding. A wall stopped the
        // smooth ball 0.18 m past the voxel sphere; its own rolling
        // resistance stops it 14.64 m past. This scenario is what makes
        // re-walling the run-out fail rather than pass quietly: the lead
        // shrinks below the floor stated here as soon as anything stands
        // in the way.
        //
        // Which check carries which claim is worth being exact about,
        // because it is not the obvious split. The two lead checks pin
        // that no wall is truncating the run-out — they do NOT test
        // rolling resistance, and in fact pass by *more* without it (79 m
        // and 60 m), because a ball that never slows simply goes further.
        // Rolling resistance is carried by the two checks below them: with
        // the law overridden to zero the smooth ball leaves the apron and
        // is 884 m below the floor at the last frame, still doing 120 m/s.
        id: 'rolling-run-out',
        label: 'Every racer stops on the apron, and the smooth ball outrolls the voxel sphere',
        ticks: 4800,
        checks: [
          // Measured leads at rest: 14.64 m along world x on the straight
          // track, and on the diagonal 8.81 m of world +z, which is the
          // component this check reads rather than the 10.81 m the two
          // balls are actually apart. The floors sit well below both,
          // because a run-out length is not a number this station pins —
          // only that the gap is metres rather than noise.
          {
            check: 'ends-behind',
            leader: 'sphere-ball-a',
            trailer: 'sphere-voxel-a',
            axis: 0,
            sign: -1,
            minLeadMeters: 8,
          },
          {
            check: 'ends-behind',
            leader: 'sphere-ball-b',
            trailer: 'sphere-voxel-b',
            axis: 2,
            sign: 1,
            minLeadMeters: 5,
          },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.05 },
          // 4800 ticks is 20 s; the slowest racer settles at 14.5 s.
          { check: 'all-asleep-or-slow', maxSpeed: 0.05 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}

