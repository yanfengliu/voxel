import {
  PLAYGROUND_RAMP_ANGLES_V1,
  PLAYGROUND_RAMP_DEFAULT_ANGLE_V1,
  type PlaygroundMaterialIdV1,
} from './physics-playground-materials.js';
import { createPlaygroundFieldStationsV1 } from './physics-playground-fields.js';
import { createTrebuchetStationV1 } from './physics-playground-trebuchet.js';
import { createCartStationV1 } from './physics-playground-cart.js';
import { createRollingStationV1 } from './physics-playground-rolling.js';
import {
  PLAYGROUND_FLOOR_TOP_V1,
  type PlaygroundBodyDefV1,
  type PlaygroundStationV1,
} from './physics-playground-types.js';

export * from './physics-playground-types.js';

/**
 * The five playground stations plus the three preset fields, as data.
 *
 * A station is a scene the studio can open plus the exact bodies, slopes,
 * spawn cases, and deterministic scenarios both lanes build from. The live
 * lane and the headless fixture consume the same definitions through
 * `physics-playground-bodies.ts`, which is what makes an in-studio
 * observation reproducible in a test and vice versa.
 *
 * Every body carries a `tests` sentence naming the diagnostic it serves —
 * the playground's version of the no-orphan rule. A body that tested
 * nothing would be decoration, and decoration is an uncontrolled variable.
 *
 * Size note: this file crossed 1,000 counted lines and the recorded
 * trigger fired. Rolling left rather than the launcher this note
 * predicted, because rolling is what grew — its catch berms came down and
 * the ground and run-out that replaced them are both explained where they
 * are declared. It joins physics-playground-fields.ts,
 * physics-playground-trebuchet.ts, and now
 * physics-playground-rolling.ts. Four stations remain here; the launcher
 * is still the largest and still the next to go.
 */

const FLOOR_TOP = PLAYGROUND_FLOOR_TOP_V1;

function floorBody(recipeId = 'studio:pg-floor'): PlaygroundBodyDefV1 {
  return {
    placementId: 'floor',
    recipeId,
    kind: 'fixed',
    material: 'deck',
    at: [0, 0, 0],
    tests: 'Every station needs one honest ground: bodies must rest on it, '
      + 'never sink into it, and its multiply combine rule lets each contact '
      + 'read the touching object\'s own material.',
  };
}

function magazineBodies(count: number, edgeZ: number): PlaygroundBodyDefV1[] {
  return Array.from({ length: count }, (_, index) => ({
    placementId: `magazine-${String(index).padStart(2, '0')}`,
    recipeId: 'studio:pg-block-stone',
    kind: 'dynamic' as const,
    material: 'stone' as const,
    at: [-4.4 + index * 1.4, FLOOR_TOP, edgeZ] as const,
    spawnOnly: true,
    tests: 'The visible spawn magazine: the Spawn control takes the next '
      + 'queued block, so added mass has a drawn source instead of appearing '
      + 'from nowhere.',
  }));
}

/** Station 1 — falling objects over a flat floor. */
function fallingStation(): PlaygroundStationV1 {
  const drop = (
    placementId: string,
    recipeId: string,
    material: PlaygroundMaterialIdV1,
    x: number,
    tests: string,
  ): PlaygroundBodyDefV1 => ({
    placementId, recipeId, kind: 'dynamic', material, at: [x, 6, 0], tests,
  });
  const droppers = ['cube-stone-solid', 'cube-stone-hollow', 'cube-wood', 'beam'];
  return {
    sceneId: 'studio:scene:physics-falling',
    label: 'Physics: falling objects',
    summary: 'Four bodies drop from the same height onto a flat floor: '
      + 'solid stone, hollow stone, wood, and a long beam. Gravity must '
      + 'accelerate them equally regardless of mass, the mass readouts must '
      + 'differ, and everything must land and stay put.',
    bodies: [
      floorBody(),
      drop('cube-stone-solid', 'studio:pg-cube-stone-solid', 'stone', -4.5,
        'The solid reference mass: falls at g, lands flat, and anchors the '
        + 'solid-versus-hollow mass comparison.'),
      drop('cube-stone-hollow', 'studio:pg-cube-stone-hollow', 'stone', -1.5,
        'Same outer size as the solid cube with the interior removed: its '
        + 'lower mass must not change its fall acceleration, only its readout.'),
      drop('cube-wood', 'studio:pg-cube-wood', 'wood', 1.5,
        'The light material contrast: a wood cube of the same size falls '
        + 'level with the stone ones, or gravity is mass-dependent and wrong.'),
      drop('beam', 'studio:pg-beam', 'stone', 4.5,
        'The elongated shape: a beam that lands flat must settle without '
        + 'rocking apart, which cubes cannot test.'),
      ...magazineBodies(4, 5),
    ],
    slopes: [],
    cases: [],
    scenarios: [{
      id: 'falling-settle',
      label: 'All four objects fall, land, and rest',
      seconds: 3,
      checks: [
        { check: 'settles-on-floor', placementIds: droppers, floorTopY: FLOOR_TOP },
        { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
        {
          check: 'equal-fall-acceleration',
          placementIds: ['cube-stone-solid', 'cube-wood'],
          // Touchdown is read from 8-tick-strided frames over a ~260-tick
          // fall, so one sample is ~3%; 4% binds Galileo without claiming
          // sub-sample resolution.
          toleranceRatio: 0.04,
        },
        { check: 'mass-ordering', heavier: 'cube-stone-solid', lighter: 'cube-stone-hollow' },
        { check: 'mass-ordering', heavier: 'cube-stone-solid', lighter: 'cube-wood' },
        { check: 'all-finite' },
        { check: 'all-asleep-or-slow', maxSpeed: 0.05 },
      ],
    }],
  };
}

/** Station 2 — the adjustable ramp and the four-material friction lineup. */
function rampStation(): PlaygroundStationV1 {
  // Blocks are a meter wide; a 1.1 m pitch leaves a 0.1 m gap. The first
  // authored lineup used 0.9 m and the four blocks spawned overlapping, so
  // the solver's penetration ejection shoved the row sideways ~0.17 m —
  // the spawn-overlap data test now guards this class of mistake.
  const lineup: readonly { material: PlaygroundMaterialIdV1; lateral: number }[] = [
    { material: 'wood', lateral: -1.65 },
    { material: 'stone', lateral: -0.55 },
    { material: 'steel', lateral: 0.55 },
    { material: 'ice', lateral: 1.65 },
  ];
  const blocks = lineup.map(({ material, lateral }): PlaygroundBodyDefV1 => ({
    placementId: `block-${material}`,
    recipeId: `studio:pg-block-${material}`,
    kind: 'dynamic',
    material,
    at: [0, 0, 0],
    onSlope: { slopeId: 'ramp', along: 7.5, lateral, gap: 0.002, align: 'slope' },
    tests: `The ${material} sample: on a multiply-combine deck its pair `
      + 'friction is exactly its own coefficient, so it must hold below '
      + 'atan(friction) and slide above it, in material order.',
  }));
  return {
    sceneId: 'studio:scene:physics-ramp',
    label: 'Physics: ramp and friction',
    summary: 'Four material blocks rest on a smooth ramp whose angle the '
      + 'panel selects. Below each material\'s friction angle the block '
      + 'holds; above it, it slides. Ice goes first, stone last.',
    bodies: [
      floorBody(),
      {
        placementId: 'ramp',
        recipeId: 'studio:pg-ramp',
        kind: 'fixed',
        material: 'deck',
        at: [0, 0, 0],
        onSlope: { slopeId: 'ramp', along: 0, lateral: 0, gap: 0, align: 'slope' },
        tests: 'The comparison surface: one smooth pose-pitched slab, because '
          + 'a voxel staircase would add geometric friction and drown the '
          + 'material differences under test.',
      },
      ...blocks,
      {
        placementId: 'berm',
        recipeId: 'studio:pg-berm',
        kind: 'fixed',
        material: 'stone',
        at: [-5.7, FLOOR_TOP, 0],
        tests: 'The catch wall below the ramp, and the one berm the '
          + 'playground still needs. Its job is sliding friction doing '
          + 'exactly what it is declared to do, not a force left out: at '
          + 'the default 20 degrees ice leaves the ramp at 6.52 m/s and '
          + 'slides 40.7 m past its foot before stopping, against the 1.5 m '
          + 'of floor there is. Nor is ice the only one: measured with the '
          + 'berm removed and the floor extended, steel needs 3.1 m of '
          + 'run-out at 30 degrees and wood 2.3 m at 40, both of them past '
          + 'the floor edge too. A floor the size ice wants would itself be '
          + 'the scenery, so the wall stays.',
      },
      ...magazineBodies(4, 5),
    ],
    slopes: [{
      slopeId: 'ramp',
      angleDegrees: 'ramp-angle',
      yawDegrees: 0,
      foot: [-4.5, 0],
      footY: FLOOR_TOP,
      thicknessMeters: 0.25,
    }],
    cases: [],
    rampAngles: PLAYGROUND_RAMP_ANGLES_V1,
    defaultRampAngleDegrees: PLAYGROUND_RAMP_DEFAULT_ANGLE_V1,
    scenarios: [
      {
        id: 'ramp-10-all-hold',
        label: 'At 10 degrees every material except ice holds',
        angleDegrees: 10,
        seconds: 3,
        checks: [
          { check: 'holds-still', placementIds: ['block-wood', 'block-stone', 'block-steel'], maxDriftMeters: 0.08 },
          { check: 'slides-downhill', placementIds: ['block-ice'], minTravelMeters: 0.5 },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'ramp-20-split',
        label: 'At 20 degrees ice and steel slide, wood and stone hold',
        angleDegrees: 20,
        seconds: 3,
        checks: [
          { check: 'holds-still', placementIds: ['block-wood', 'block-stone'], maxDriftMeters: 0.08 },
          { check: 'slides-downhill', placementIds: ['block-ice', 'block-steel'], minTravelMeters: 0.5 },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'ramp-40-all-slide',
        label: 'At 40 degrees every material slides',
        angleDegrees: 40,
        seconds: 3,
        checks: [
          {
            check: 'slides-downhill',
            placementIds: ['block-wood', 'block-stone', 'block-steel', 'block-ice'],
            minTravelMeters: 0.5,
          },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        // The berm's subtraction test, kept as a run rather than a
        // sentence. The rolling station's catch walls went when rolling
        // resistance made them liars; this one stays, and the difference
        // is that nothing here is missing. Ice really does have friction
        // 0.04, really does leave the ramp at 6.52 m/s, and really does
        // need 40.7 m to stop against the 1.5 m of floor past the ramp
        // foot. Take the wall away and it is gone off the edge.
        id: 'ramp-berm-control',
        label: 'Without the berm, ice slides off the world',
        angleDegrees: 20,
        seconds: 6,
        omit: ['berm'],
        checks: [
          // Ice clears the floor edge at about 2.4 s and is in free fall
          // from there; by 6 s it is tens of metres down. A threshold of
          // -5 m is unreachable by anything still on the floor, whose top
          // is at y 0.25.
          {
            check: 'crossed-plane',
            placementId: 'block-ice',
            axis: 1,
            threshold: -5,
            expect: 'crossed',
          },
          // Steel stops at x -5.81 at this angle, 0.19 m short of the
          // edge, so the berm is not what holds it — the wall earns its
          // place on ice alone here, and on steel and wood at 30 and 40.
          { check: 'holds-still', placementIds: ['block-stone', 'block-wood'], maxDriftMeters: 0.08 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}

/** Station 3 — the launcher: five collision cases down five lanes. */
function launcherStation(): PlaygroundStationV1 {
  const muzzle = (x: number): readonly [number, number, number] => [x, 1.2, 5];
  const stackRow = (
    index: number,
    x: number,
    y: number,
  ): PlaygroundBodyDefV1 => ({
    placementId: `stack-${String(index).padStart(2, '0')}`,
    recipeId: 'studio:pg-stack-block',
    kind: 'dynamic',
    material: 'wood',
    at: [x, y, -3],
    tests: 'One block of the knock-down pyramid: it must stand under '
      + 'gravity until the projectile arrives and scatter honestly when it '
      + 'does — many simultaneous contacts in one impact.',
  });
  return {
    sceneId: 'studio:scene:physics-launcher',
    label: 'Physics: collision range',
    summary: 'Five lanes, five collision experiments: light into heavy, '
      + 'heavy into light, equal masses, a fast shot at a one-voxel wall '
      + 'with and without continuous collision detection, and a pyramid '
      + 'knock-down. Fire each case from the panel.',
    bodies: [
      {
        placementId: 'floor-north',
        recipeId: 'studio:pg-apron',
        kind: 'fixed',
        material: 'deck',
        at: [0, 0, -8],
        tests: 'The downrange half of the range floor: struck blocks '
          + 'scatter ten meters and more along the firing direction, and a '
          + 'block leaving the ground reads as a vanishing-object bug.',
      },
      {
        placementId: 'floor-south',
        recipeId: 'studio:pg-apron',
        kind: 'fixed',
        material: 'deck',
        at: [0, 0, 8],
        tests: 'The uprange half of the range floor, under the muzzle line '
          + 'and the queued projectiles.',
      },
      {
        placementId: 'proj-light',
        recipeId: 'studio:pg-projectile-wood',
        kind: 'dynamic',
        material: 'wood',
        at: [-4, FLOOR_TOP, 6.5],
        spawnOnly: true,
        tests: 'The light projectile: wood into a steel target roughly a hundred '
          + 'times heavier (16.2 vs 1684.8 mass units) must bounce back or '
          + 'stop while the target barely moves — momentum transfer in the '
          + 'extreme mass ratio.',
      },
      {
        placementId: 'target-heavy',
        recipeId: 'studio:pg-target-steel',
        kind: 'dynamic',
        material: 'steel',
        at: [-4, FLOOR_TOP, -3],
        tests: 'The heavy target: its post-impact drift measures how little '
          + 'momentum a light projectile carries.',
      },
      {
        placementId: 'proj-heavy',
        recipeId: 'studio:pg-projectile-steel',
        kind: 'dynamic',
        material: 'steel',
        at: [-2, FLOOR_TOP, 6.5],
        spawnOnly: true,
        tests: 'The heavy projectile: steel into a light wood block must '
          + 'plough through, keeping most of its speed — the reverse mass '
          + 'ratio of lane one.',
      },
      {
        placementId: 'target-light',
        recipeId: 'studio:pg-projectile-wood',
        kind: 'dynamic',
        material: 'wood',
        at: [-2, FLOOR_TOP, -3],
        tests: 'The light target: it must fly off carrying the momentum the '
          + 'heavy projectile barely notices losing.',
      },
      {
        placementId: 'proj-equal',
        recipeId: 'studio:pg-projectile-wood',
        kind: 'dynamic',
        material: 'wood',
        at: [0, FLOOR_TOP, 6.5],
        spawnOnly: true,
        tests: 'The equal-mass projectile: against an identical resting twin '
          + 'it must hand over most of its momentum, the classic '
          + 'near-elastic exchange.',
      },
      {
        placementId: 'target-equal',
        recipeId: 'studio:pg-projectile-wood',
        kind: 'dynamic',
        material: 'wood',
        at: [0, FLOOR_TOP, -3],
        tests: 'The equal-mass target: it should leave with roughly the '
          + 'speed the projectile arrived with, less friction and '
          + 'restitution losses.',
      },
      {
        placementId: 'proj-fast',
        recipeId: 'studio:pg-projectile-steel',
        kind: 'dynamic',
        material: 'steel',
        at: [2, FLOOR_TOP, 6.5],
        spawnOnly: true,
        ccd: true,
        tests: 'The tunneling probe with continuous collision detection ON: '
          + 'at 300 m/s it travels 1.25 m per solver step — five wall '
          + 'thicknesses — and must still be stopped.',
      },
      {
        placementId: 'proj-fast-noccd',
        recipeId: 'studio:pg-projectile-steel',
        kind: 'dynamic',
        material: 'steel',
        at: [3.2, FLOOR_TOP, 6.5],
        spawnOnly: true,
        tests: 'The same shot with continuous collision detection OFF: its '
          + 'per-step travel exceeds the wall-plus-projectile support, so '
          + 'discrete stepping never sees an overlap and it passes straight '
          + 'through — the demonstration of why declared fast bodies need CCD.',
      },
      {
        placementId: 'wall-thin',
        recipeId: 'studio:pg-wall-thin',
        kind: 'fixed',
        material: 'stone',
        at: [2, FLOOR_TOP, -3],
        tests: 'The one-voxel wall: thin enough that a fast body crosses it '
          + 'inside one timestep, which is exactly what makes it the '
          + 'tunneling oracle.',
      },
      stackRow(0, 4.25, FLOOR_TOP),
      stackRow(1, 4.75, FLOOR_TOP),
      stackRow(2, 5.25, FLOOR_TOP),
      stackRow(3, 4.5, FLOOR_TOP + 0.5),
      stackRow(4, 5.0, FLOOR_TOP + 0.5),
      stackRow(5, 4.75, FLOOR_TOP + 1.0),
      {
        placementId: 'proj-stack',
        recipeId: 'studio:pg-projectile-wood',
        kind: 'dynamic',
        material: 'wood',
        at: [4.75, FLOOR_TOP, 6.5],
        spawnOnly: true,
        tests: 'The pyramid shot: one moderate impact into six stacked '
          + 'blocks — the many-contact scatter case.',
      },
    ],
    slopes: [],
    cases: [
      {
        id: 'light-into-heavy',
        label: 'Light wood into heavy steel',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-light', centre: muzzle(-4), velocity: [0, 0, -12] }],
      },
      {
        id: 'heavy-into-light',
        label: 'Heavy steel into light wood',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-heavy', centre: muzzle(-2), velocity: [0, 0, -12] }],
      },
      {
        id: 'equal-masses',
        label: 'Equal masses exchange momentum',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-equal', centre: muzzle(0), velocity: [0, 0, -12] }],
      },
      {
        // Two bodies meeting in open air, nothing else touching either.
        // This is the one arrangement in the playground where Newton's
        // third law is checkable exactly: gravity is the only outside
        // force and its impulse subtracts cleanly, so whatever momentum
        // one body gains the other must have lost. On the ground the
        // floor quietly takes momentum through friction — measured at
        // the equal-mass lane, the pair's momentum drifts 7.7% across
        // even a 4-tick window and grows linearly with it, which is
        // friction, not a solver fault.
        id: 'head-on-midair',
        label: 'Two shots meet in mid-air',
        actions: [
          {
            kind: 'spawn',
            atSeconds: 0,
            placementId: 'proj-heavy',
            centre: [6, 9, 4],
            velocity: [0, 0, -14],
          },
          {
            kind: 'spawn',
            atSeconds: 0,
            placementId: 'proj-equal',
            centre: [6, 9, -4],
            velocity: [0, 0, 10],
          },
        ],
      },
      {
        id: 'fast-wall-ccd',
        label: 'Fast shot at the thin wall (CCD on)',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-fast', centre: [2, 1.2, 5.1], velocity: [0, 0, -300], ccd: true }],
      },
      {
        // 300 m/s is 1.25 m per 1/240 s step, more than the 1.0 m
        // wall-plus-projectile support, and the 5.1 start keeps the sampled
        // positions clear of the wall — so discrete stepping deterministically
        // never sees an overlap.
        id: 'fast-wall-noccd',
        label: 'Fast shot at the thin wall (CCD off)',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-fast-noccd', centre: [3.2, 1.2, 5.1], velocity: [0, 0, -300] }],
      },
      {
        id: 'stack-knockdown',
        label: 'Knock the pyramid down',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'proj-stack', centre: muzzle(4.75), velocity: [0, 0, -15] }],
      },
    ],
    scenarios: [
      {
        id: 'launcher-light-heavy',
        label: 'Light projectile barely moves the heavy target',
        caseId: 'light-into-heavy',
        seconds: 2.5,
        checks: [
          { check: 'moved-at-most', placementId: 'target-heavy', maxTravelMeters: 0.6 },
          { check: 'moved-at-least', placementId: 'proj-light', minTravelMeters: 3 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'launcher-heavy-light',
        label: 'Heavy projectile sends the light target flying',
        caseId: 'heavy-into-light',
        seconds: 2.5,
        checks: [
          { check: 'moved-at-least', placementId: 'target-light', minTravelMeters: 2 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'launcher-equal',
        label: 'Equal masses exchange momentum',
        caseId: 'equal-masses',
        seconds: 2.5,
        checks: [
          { check: 'moved-at-least', placementId: 'target-equal', minTravelMeters: 1.5 },
          { check: 'all-finite' },
        ],
      },
      {
        // The collision happens around tick 80 while both bodies are
        // still 8 m up; the window brackets it and both are airborne
        // throughout, so the only outside force is gravity.
        id: 'launcher-midair-momentum',
        label: 'Mid-air collision conserves momentum',
        caseId: 'head-on-midair',
        seconds: 0.833333,
        checks: [
          {
            check: 'momentum-conserved',
            placementIds: ['proj-heavy', 'proj-equal'],
            fromSeconds: 0.166667,
            toSeconds: 0.5,
            toleranceFraction: 0.01,
          },
          { check: 'all-finite' },
        ],
      },
      {
        // Negative control for the law above: one body of a colliding
        // pair does not conserve its own momentum, and must not appear
        // to. If this passed, the check would be measuring nothing.
        id: 'launcher-midair-one-body',
        label: 'Control: one body of the pair does not conserve momentum',
        caseId: 'head-on-midair',
        seconds: 0.833333,
        checks: [
          {
            check: 'momentum-conserved',
            placementIds: ['proj-heavy'],
            fromSeconds: 0.166667,
            toSeconds: 0.5,
            toleranceFraction: 0.01,
          },
        ],
      },
      {
        id: 'launcher-ccd-stops',
        label: 'CCD stops the fast shot at the wall',
        caseId: 'fast-wall-ccd',
        seconds: 2,
        checks: [
          { check: 'crossed-plane', placementId: 'proj-fast', axis: 2, threshold: -3.4, expect: 'stopped' },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'launcher-noccd-tunnels',
        label: 'Without CCD the fast shot tunnels (known artifact)',
        caseId: 'fast-wall-noccd',
        seconds: 2,
        checks: [
          { check: 'crossed-plane', placementId: 'proj-fast-noccd', axis: 2, threshold: -3.4, expect: 'crossed' },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'launcher-stack',
        label: 'The pyramid scatters but stays finite',
        caseId: 'stack-knockdown',
        seconds: 3,
        checks: [
          { check: 'moved-at-least', placementId: 'stack-05', minTravelMeters: 0.3 },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}

/** Station 4 — stacked, spanning, clamped, and bridging structures. */
function structuresStation(): PlaygroundStationV1 {
  const tower = Array.from({ length: 5 }, (_, level): PlaygroundBodyDefV1 => ({
    placementId: `tower-${String(level)}`,
    recipeId: 'studio:pg-tower-block',
    kind: 'dynamic',
    material: 'stone',
    at: [-4.5, FLOOR_TOP + level * 0.75, -3],
    tests: 'One course of the five-block tower: the settled column must '
      + 'neither creep sideways nor explode, the plainest stacking-stability '
      + 'oracle there is.',
  }));
  const pier = (id: string, x: number): PlaygroundBodyDefV1 => ({
    placementId: id,
    recipeId: 'studio:pg-tower-block',
    kind: 'dynamic',
    material: 'stone',
    at: [x, FLOOR_TOP, 2],
    tests: 'A bridge pier: it carries a deck plank end, and removing the '
      + 'middle pier must drop exactly the spans it supported.',
  });
  return {
    sceneId: 'studio:scene:physics-structures',
    label: 'Physics: structures',
    summary: 'A tower, a post-and-lintel arch, a supported beam, a clamped '
      + 'cantilever, and a three-pier bridge. Drop weights on them from the '
      + 'panel, or remove the bridge\'s middle pier and watch the load path '
      + 'fail. Rigid bodies only — no deformation, no stress field.',
    bodies: [
      floorBody(),
      ...tower,
      {
        placementId: 'arch-pillar-west',
        recipeId: 'studio:pg-pillar',
        kind: 'dynamic',
        material: 'stone',
        at: [-0.875, FLOOR_TOP, -3],
        tests: 'The arch\'s west leg: a tall narrow column that must carry '
          + 'half the lintel and topple honestly if overloaded off-center.',
      },
      {
        placementId: 'arch-pillar-east',
        recipeId: 'studio:pg-pillar',
        kind: 'dynamic',
        material: 'stone',
        at: [0.875, FLOOR_TOP, -3],
        tests: 'The arch\'s east leg, the west leg\'s mirror: together they '
          + 'make the simplest two-path load transfer.',
      },
      {
        placementId: 'arch-lintel',
        recipeId: 'studio:pg-lintel',
        kind: 'dynamic',
        material: 'stone',
        at: [0, FLOOR_TOP + 2, -3],
        tests: 'The lintel: it rests on both pillars and routes a dropped '
          + 'weight into them. A voxel compression arch is deferred; this '
          + 'is the honest post-and-lintel version.',
      },
      {
        placementId: 'beam-support-west',
        recipeId: 'studio:pg-tower-block',
        kind: 'dynamic',
        material: 'stone',
        at: [3, FLOOR_TOP, -3],
        tests: 'The supported beam\'s west abutment.',
      },
      {
        placementId: 'beam-support-east',
        recipeId: 'studio:pg-tower-block',
        kind: 'dynamic',
        material: 'stone',
        at: [5, FLOOR_TOP, -3],
        tests: 'The supported beam\'s east abutment.',
      },
      {
        placementId: 'beam-span',
        recipeId: 'studio:pg-plank',
        kind: 'dynamic',
        material: 'wood',
        at: [4, FLOOR_TOP + 0.75, -3],
        tests: 'A beam supported at both ends: it must sit still under its '
          + 'own weight and transfer a dropped load into both supports '
          + 'without sliding off.',
      },
      {
        placementId: 'clamp-jaw-bottom',
        recipeId: 'studio:pg-clamp-jaw',
        kind: 'fixed',
        material: 'stone',
        at: [-4, FLOOR_TOP, 1],
        tests: 'The cantilever clamp\'s lower jaw: fixed, because the wall '
          + 'it stands for is not under test — the plank\'s contact hold is.',
      },
      {
        placementId: 'cantilever',
        recipeId: 'studio:pg-plank',
        kind: 'dynamic',
        material: 'wood',
        at: [-2.875, FLOOR_TOP + 0.5, 1],
        tests: 'The cantilever: clamped by contact at one end, free at the '
          + 'other. The live lane has no joints, so this is the honest '
          + 'version of "attached" — and it must hold or slip visibly, '
          + 'never invisibly.',
      },
      {
        placementId: 'clamp-jaw-top',
        recipeId: 'studio:pg-clamp-jaw',
        kind: 'fixed',
        material: 'stone',
        at: [-4, FLOOR_TOP + 0.75, 1],
        tests: 'The clamp\'s upper jaw: pinches the plank root so the '
          + 'overhang is carried by friction and contact, the only '
          + 'attachment the solver is allowed here.',
      },
      pier('bridge-pier-west', 0.75),
      pier('bridge-pier-mid', 3),
      pier('bridge-pier-east', 5.25),
      {
        placementId: 'bridge-deck-west',
        recipeId: 'studio:pg-plank',
        kind: 'dynamic',
        material: 'wood',
        at: [1.74, FLOOR_TOP + 0.75, 2],
        tests: 'The bridge\'s west span: rests on the west and middle piers; '
          + 'removing the middle pier must drop its east end.',
      },
      {
        placementId: 'bridge-deck-east',
        recipeId: 'studio:pg-plank',
        kind: 'dynamic',
        material: 'wood',
        at: [4.26, FLOOR_TOP + 0.75, 2],
        tests: 'The bridge\'s east span: the middle pier\'s other dependent, '
          + 'so one removal visibly fails two spans through one support.',
      },
      {
        placementId: 'weight-a',
        recipeId: 'studio:pg-weight',
        kind: 'dynamic',
        material: 'steel',
        at: [-6, FLOOR_TOP, 5],
        spawnOnly: true,
        tests: 'The first droppable load: dense and small so the load point '
          + 'is unambiguous.',
      },
      {
        placementId: 'weight-b',
        recipeId: 'studio:pg-weight',
        kind: 'dynamic',
        material: 'steel',
        at: [-4.8, FLOOR_TOP, 5],
        spawnOnly: true,
        tests: 'The second droppable load, so two structures can be loaded '
          + 'in one session.',
      },
    ],
    slopes: [],
    cases: [
      {
        id: 'load-lintel',
        label: 'Drop a weight on the lintel',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'weight-a', centre: [0, 4.5, -3] }],
      },
      {
        id: 'load-beam',
        label: 'Drop a weight on the supported beam',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'weight-a', centre: [4, 3.5, -3] }],
      },
      {
        id: 'load-cantilever-tip',
        label: 'Drop a weight on the cantilever tip',
        actions: [{ kind: 'spawn', atSeconds: 0, placementId: 'weight-b', centre: [-1.9, 3, 1] }],
      },
      {
        id: 'remove-mid-pier',
        label: 'Remove the bridge\'s middle pier',
        actions: [{ kind: 'remove', atSeconds: 0.5, placementId: 'bridge-pier-mid' }],
      },
    ],
    scenarios: [
      {
        id: 'structures-stand',
        label: 'Everything stands under its own weight',
        seconds: 4,
        checks: [
          {
            check: 'holds-still',
            placementIds: [
              'tower-4', 'arch-lintel', 'beam-span', 'cantilever',
              'bridge-deck-west', 'bridge-deck-east',
            ],
            maxDriftMeters: 0.12,
          },
          { check: 'no-floor-penetration', floorTopY: FLOOR_TOP, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'structures-bridge-collapse',
        label: 'Removing the middle pier drops both spans',
        caseId: 'remove-mid-pier',
        seconds: 4,
        checks: [
          // A span's free end tilt-drops 0.75 m to the floor, moving the
          // plank's center about a quarter meter.
          { check: 'moved-at-least', placementId: 'bridge-deck-west', minTravelMeters: 0.2 },
          { check: 'moved-at-least', placementId: 'bridge-deck-east', minTravelMeters: 0.2 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'structures-lintel-load',
        label: 'The lintel carries a dropped weight',
        caseId: 'load-lintel',
        seconds: 4,
        checks: [
          { check: 'moved-at-most', placementId: 'weight-a', maxTravelMeters: 3.2 },
          { check: 'holds-still', placementIds: ['arch-pillar-west', 'arch-pillar-east'], maxDriftMeters: 0.25 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}

export function createPhysicsPlaygroundStationsV1(): readonly PlaygroundStationV1[] {
  return Object.freeze([
    fallingStation(),
    rampStation(),
    launcherStation(),
    structuresStation(),
    createRollingStationV1(),
    createTrebuchetStationV1(),
    createCartStationV1(),
    ...createPlaygroundFieldStationsV1(),
  ]);
}

/** The station covering `sceneId`, or undefined when none does. */
export function physicsPlaygroundStationV1(
  sceneId: string,
): PlaygroundStationV1 | undefined {
  return createPhysicsPlaygroundStationsV1().find(
    (station) => station.sceneId === sceneId,
  );
}
