import type { RecipeV1 } from './recipe.js';
import {
  boxStep,
  playgroundRecipe,
  sphereCells,
  materialPalette,
} from './physics-playground-recipes.js';
import { PLAYGROUND_FLOOR_TOP_V1 } from './physics-playground-types.js';
import type {
  PlaygroundBodyDefV1,
  PlaygroundJointV1,
  PlaygroundStationV1,
} from './physics-playground-types.js';

/**
 * The trebuchet — the playground's first whole machine, exercising what no
 * earlier station does: joints. A hinged counterweight drives an arm on an
 * axle, a rigid-link sling whips a ball out of an open pouch, and a rope
 * tie holds the machine cocked until the fire case releases it.
 *
 * Every constraint's ENDS anchor on drawn geometry: the axle joint sits
 * on the axle rod that visibly passes through the frame's bearing rings,
 * the counterweight hinge on the hanger rod its eye rings wrap, and the
 * sling pivot on the tip crossbar its hook wraps. The trigger is the
 * stated exception — a rope constraint between two drawn points with no
 * rope drawn between them, so the cocked arm appears to hang on nothing.
 * Drawing joints is not something this repo's overlay does yet.
 *
 * What the geometry does and does not do is worth stating plainly,
 * because a reviewer measured it: the frame and the trigger post are
 * fixed bodies that nothing ever touches. Deleting all of their colliders
 * reproduces the throw to within solver noise. Their voxels exist to make
 * the load path legible — where the axle is carried, what the lashing is
 * tied to — not to bear load, because a revolute joint on a fixed body
 * needs no geometry at all. The bearing rings likewise never touch the
 * rod they surround.
 *
 * The release, by contrast, is genuinely physical: no action touches the
 * ball, which leaves the open pouch front by contact alone when the whip
 * swings past it.
 *
 * Size note: this module runs to roughly 740 lines because one machine's
 * recipes, cocked-pose math, station, and joints live together, and
 * splitting them would separate the pose numbers from the geometry they
 * derive from — the exact coupling the tests pin. The recorded extraction
 * plan is recipes into `physics-playground-trebuchet-recipes.ts` and the
 * pose math into `-pose.ts` the first time a second jointed machine wants
 * either, which is also when the shared parts become visible.
 *
 * The machine is authored flat like every playground body and posed
 * cocked at world build, the same authored-flat convention the ramp uses.
 * The arm's joint anchors derive from the constants that draw its rods,
 * and `playground-trebuchet.test.ts` pins the frame, counterweight, and
 * sling anchors against their drawn cells.
 */

// ---- machine geometry, world meters ----

/** Axle line: x through this point, the machine's one shared datum. */
export const TREBUCHET_AXLE_Y_V1 = 3.625;
export const TREBUCHET_AXLE_Z_V1 = -1.7;
/**
 * Axle to long-arm tip (throw side, +z when cocked) and axle to hanger.
 * Both are derived below from the arm's drawn rod positions rather than
 * restated, so the 3:1 ratio cannot drift away from the geometry.
 */
export const TREBUCHET_SHORT_ARM_V1 = 1.5;
/** Cocked pitch, in degrees below horizontal.
 *
 * The binding constraint is floor clearance, not the rope: the anchor
 * post is placed from the tip, so the tie is taut at any angle. At 38.4
 * degrees the tip sat at 0.83 m and buried the sling hook 4 cm into the
 * floor, and the solver's build-time ejection travelled the joint chain
 * and threw the ball sideways at 36 m/s. The tip must clear the floor by
 * more than the hook's half-height; the cocked-pose test pins it. */
export const TREBUCHET_COCKED_DEGREES_V1 = 32.61;
/** Sling pivot to pouch center. A short sling whips around early and
 * spikes the ball up and backward — the 2.0 m first cut did exactly that
 * at 24 m/s. Near-arm-length slings release later and flatter. */
export const TREBUCHET_SLING_LENGTH_V1 = 3.0;

/** Trigger rope maximum length: taut within one tick of building. The
 * tie runs from the tip crossbar's east end down to the post beside it —
 * a block under the tip itself sat in the sling's hang path, and the
 * build gate measured 0.48 m of sling-through-anchor penetration. */
export const TREBUCHET_TRIGGER_ROPE_V1 = 0.24;

const FLOOR = PLAYGROUND_FLOOR_TOP_V1;
const COCKED = (TREBUCHET_COCKED_DEGREES_V1 * Math.PI) / 180;

// ---- recipes ----

/**
 * Two trestle sides: skid, two posts, two crossbeams, and a closed bearing
 * ring whose 3-cell hole the arm's axle rod passes through with a quarter
 * clearance all round — the joint keeps the rod centered, so ring and rod
 * never actually touch, and the ring's job is to make the load path
 * legible.
 *
 * The frame is staked (a fixed body), exactly like the real machine. The
 * first free-standing fire proved why: the wood frame somersaulted,
 * tangled its own arm, and rolled off the world, because reaction torque
 * flips whichever end of the mechanism is lighter. The shipped frame
 * masses 70.8 against the crate's 317.5 — a 4.5:1 ratio it would still
 * lose. A free-standing frame with drawn stone ballast is the recorded
 * deferred improvement.
 */
export function createTrebuchetFrameRecipe(): RecipeV1 {
  // The recipe schema is constructive (a zero voxel leaves what is there,
  // it never erases), so each closed bearing ring is drawn as four bars
  // around its 3-cell hole rather than a block minus a hole.
  const side = (x: number) => [
    boxStep([x, 0, 1], [1, 1, 13], 'wood', 'Ground skid, showing where the trestle is footed'),
    boxStep([x, 1, 2], [1, 12, 1], 'wood', 'Fore post carrying the bearing'),
    boxStep([x, 1, 12], [1, 12, 1], 'wood', 'Aft post carrying the bearing'),
    boxStep([x, 13, 2], [1, 1, 3], 'wood', 'Fore crossbeam into the ring'),
    boxStep([x, 13, 10], [1, 1, 3], 'wood', 'Aft crossbeam into the ring'),
    boxStep([x, 11, 5], [1, 1, 5], 'wood', 'Bearing ring, lower bar'),
    boxStep([x, 15, 5], [1, 1, 5], 'wood', 'Bearing ring, upper bar'),
    boxStep([x, 12, 5], [1, 3, 1], 'wood', 'Bearing ring, fore cheek'),
    boxStep([x, 12, 9], [1, 3, 1], 'wood', 'Bearing ring, aft cheek'),
  ];
  return playgroundRecipe({
    id: 'studio:pg-treb-frame',
    label: 'Trebuchet frame',
    summary: 'Two trestles with closed bearing rings, staked to the ground '
      + 'like the real machine — free-standing, this 70.8-mass frame '
      + 'somersaulted under the 317.5-mass crate it reacts, which is why '
      + 'stakes existed. The trestles stand outboard of the counterweight, '
      + 'whose swing passes between them; the first narrow frame jammed '
      + 'the weight against its own fore posts early in the drop. Staked, '
      + 'the geometry carries no load: it shows where the axle is borne.',
    size: [10, 16, 15],
    material: 'wood',
    steps: [...side(0), ...side(9)],
  });
}

/**
 * The arm: one long shaft, an axle rod through the frame bearings, a
 * hanger rod the counterweight swings on, and a tip crossbar the sling
 * hook wraps. All three rods run along x. The axle rod runs the full
 * width and stands proud of both bearings; the hanger rod and crossbar
 * end flush with the rings that wrap them.
 */
export function createTrebuchetArmRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-treb-arm',
    label: 'Trebuchet arm',
    summary: 'A 3:1 lever — 4.5 m to the tip against 1.5 m to the hanger. '
      + 'Its three rods are where the joints anchor: the axle rod through '
      + 'the frame bearings, the hanger rod inside the counterweight eyes, '
      + 'and the tip crossbar inside the sling hook. Each rod is centered '
      + 'in its ring by the joint and never touches it.',
    size: [11, 1, 25],
    material: 'wood',
    steps: [
      boxStep([5, 0, 0], [1, 1, 25], 'wood',
        'The lever shaft, short end to long tip'),
      boxStep([0, 0, 6], [11, 1, 1], 'wood',
        'Axle rod, spanning both bearing rings'),
      boxStep([2, 0, 0], [7, 1, 1], 'wood',
        'Hanger rod the counterweight eyes wrap'),
      boxStep([2, 0, 24], [7, 1, 1], 'wood',
        'Tip crossbar the sling eye wraps'),
    ],
  });
}

/**
 * The counterweight: a stone-filled crate hung from two eye rings that
 * wrap the arm's hanger rod — rubble in a box, exactly what the real
 * machines swung. Hinged, not fixed: a hanging weight falls plumb, and
 * the hinge is the second revolute joint this machine exists to
 * exercise. Stone, not steel, is the range governor: a steel crate of
 * this size threw the ball clean off the world, and taming that by
 * making the ball heavier deadened the whip instead — the payload has to
 * stay light for the sling to multiply its speed.
 */
export function createTrebuchetCounterweightRecipe(): RecipeV1 {
  const eye = (x: number) => [
    boxStep([x, 4, 0], [1, 1, 5], 'stone', 'Eye ring, lower bar'),
    boxStep([x, 8, 0], [1, 1, 5], 'stone', 'Eye ring, upper bar'),
    boxStep([x, 5, 0], [1, 3, 1], 'stone', 'Eye ring, fore cheek'),
    boxStep([x, 5, 4], [1, 3, 1], 'stone', 'Eye ring, aft cheek'),
  ];
  return playgroundRecipe({
    id: 'studio:pg-treb-cw',
    label: 'Trebuchet counterweight',
    summary: 'A hinged crate of stone at 317.5 mass, thirty-seven times '
      + 'the ball — the machine\'s only power source and its range '
      + 'governor. Remove it and the fire case does nothing: the '
      + 'no-counterweight scenario measures the fired arm sweeping 0.4 '
      + 'degrees and the ball moving 9 cm.',
    size: [7, 9, 5],
    material: 'stone',
    steps: [
      ...eye(0), ...eye(6),
      boxStep([0, 2, 0], [1, 2, 5], 'stone', 'West strap joining eye to box'),
      boxStep([6, 2, 0], [1, 2, 5], 'stone', 'East strap joining eye to box'),
      boxStep([1, 0, 0], [5, 3, 5], 'stone', 'The stone-filled crate itself'),
    ],
  });
}

/**
 * The sling as a rigid link: eye ring, bar, and an open pouch — the
 * standard rigid-sling trebuchet study, stated as such. A flexible rope
 * sling is deferred; the rigid link still whips as the second pendulum
 * and the open pouch still releases the ball by geometry alone.
 */
export function createTrebuchetSlingRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-treb-sling',
    label: 'Trebuchet sling',
    summary: 'A rigid-link sling with an open-fronted pouch: the second '
      + 'pendulum of the whip, stated as the rigid-sling study. The tall '
      + 'tail rim holds the ball through the drag, the open front is the '
      + 'release gate, and the ball flies when the whip swings past it — '
      + 'release is geometry, not script.',
    size: [5, 5, 17],
    material: 'wood',
    steps: [
      // A C-hook, not a closed ring: the arm's shaft runs along the
      // crossbar's near side, so the hook opens toward the shaft (the
      // build gate measured the closed ring's near cheek 0.25 m inside
      // it). Like every ring in this machine the hook never touches the
      // crossbar — the joint carries the pull — so its job is to show
      // where the sling is hung.
      //
      // Sling mass is a real limit, though not a knife-edge one: the
      // shipped sling masses 30.6 against the ball's 8.5, and scaling it
      // to 1.5x stops the ball separating at all. The whip only
      // multiplies speed while the payload stays much lighter than the
      // arm that throws it.
      boxStep([2, 0, 2], [1, 1, 3], 'wood', 'Eye hook, lower bar'),
      boxStep([2, 4, 2], [1, 1, 3], 'wood', 'Eye hook, upper bar'),
      boxStep([2, 1, 4], [1, 3, 1], 'wood', 'Eye hook, bearing cheek'),
      boxStep([2, 2, 5], [1, 1, 8], 'wood', 'Link bar from eye to pouch'),
      boxStep([0, 1, 13], [5, 1, 4], 'wood', 'Pouch plate the ball rests on'),
      // Measured, these two do not stop lateral escape — the revolute
      // sling pivot already forbids it, and removing them leaves the
      // ball's sideways wander under 9 cm. What they do is delay
      // separation by about 190 ticks, which is what aims the throw.
      boxStep([0, 2, 13], [1, 1, 4], 'wood', 'West cup wall, holding release late'),
      boxStep([4, 2, 13], [1, 1, 4], 'wood', 'East cup wall, holding release late'),
      boxStep([1, 2, 16], [3, 2, 1], 'wood',
        'Tall tail rim: the steeper short-sling drag rolled the ball '
        + 'over a one-cell rim and left it on the floor'),
    ],
  });
}

/** The payload: a wood ball, deliberately light. The whip only works
 * with the ball much lighter than the sling — a stone ball as heavy as
 * the sling deadened the whip and dribbled out backward at 4 m/s. */
export function createTrebuchetBallRecipe(): RecipeV1 {
  const diameter = 3;
  const { roles, palette } = materialPalette('wood');
  return {
    schemaVersion: 'studio.voxel-recipe/1',
    id: 'studio:pg-treb-ball',
    label: 'Trebuchet ball',
    summary: 'The payload. Declared a primitive ball collider so the pouch '
      + 'launch reads whip dynamics, not voxel-corner snags — the rolling '
      + 'station already measures that artifact separately.',
    seed: 1,
    size: [diameter, diameter, diameter],
    roles,
    palette,
    tags: ['physics', 'playground'],
    steps: [{
      kind: 'voxels',
      at: [0, 0, 0],
      size: [diameter, diameter, diameter],
      voxels: sphereCells(diameter),
      note: 'The exact squared-integer ball',
    }],
    motion: {
      periodMs: 0,
      phaseRadians: 0,
      translation: [0, 0, 0],
      rotationRadians: [0, 0, 0],
      scale: [0, 0, 0],
    },
  };
}

/** The trigger anchor: a stone block the cocked arm is roped down to. */
export function createTrebuchetAnchorRecipe(): RecipeV1 {
  return playgroundRecipe({
    id: 'studio:pg-treb-anchor',
    label: 'Trebuchet anchor',
    summary: 'The slender staked post the trigger lashing ties the tip '
      + 'crossbar to, standing beside the sling hang path — a block under '
      + 'the tip itself measured 0.48 m of sling penetration at build. '
      + 'Firing detaches the lashing; the post stays, drawn and solid.',
    size: [1, 3, 3],
    material: 'stone',
    steps: [boxStep([0, 0, 0], [1, 3, 3], 'stone', 'The staked trigger post')],
  });
}

export function createTrebuchetRecipesV1(): readonly RecipeV1[] {
  return [
    createTrebuchetFrameRecipe(),
    createTrebuchetArmRecipe(),
    createTrebuchetCounterweightRecipe(),
    createTrebuchetSlingRecipe(),
    createTrebuchetBallRecipe(),
    createTrebuchetAnchorRecipe(),
  ];
}

// ---- cocked pose math, from the same constants ----

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

function quatAboutX(radians: number): Quat {
  return [Math.sin(radians / 2), 0, 0, Math.cos(radians / 2)];
}

function rotateX(v: Vec3, radians: number): Vec3 {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [v[0], v[1] * cos - v[2] * sin, v[1] * sin + v[2] * cos];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Arm-local offsets, meters from the arm model's center. The axle rod is
 * drawn at z cell 6 of 25, so its center sits 1.5 m short of the model
 * center; the rods at cells 0 and 24 sit 3 m out. These are the joint
 * anchors AND the pose pivots — one set of numbers for both.
 */
export const TREBUCHET_ARM_LOCAL_V1 = {
  axle: [0, 0, -1.5] as Vec3,
  hanger: [0, 0, -3.0] as Vec3,
  tip: [0, 0, 3.0] as Vec3,
};

/** Counterweight-local hinge: the eye-hole center, above the box. */
export const TREBUCHET_CW_LOCAL_HINGE_V1: Vec3 = [0, 0.5, 0];

/** Sling-local pivot (eye center) and pouch center. */
export const TREBUCHET_SLING_LOCAL_V1 = {
  eye: [0, 0, -1.5] as Vec3,
  pouchCentre: [0, 0, 1.5] as Vec3,
  /** Pouch plate top relative to the model center, for seating the ball. */
  plateTopY: -0.125,
};

/** Axle-to-tip reach, straight off the drawn rods: 3.0 - (-1.5) = 4.5 m. */
export const TREBUCHET_LONG_ARM_V1 =
  TREBUCHET_ARM_LOCAL_V1.tip[2] - TREBUCHET_ARM_LOCAL_V1.axle[2];

/** Axle-to-hanger reach, likewise drawn: -1.5 - (-3.0) = 1.5 m. */
export const TREBUCHET_HANGER_REACH_V1 =
  TREBUCHET_ARM_LOCAL_V1.axle[2] - TREBUCHET_ARM_LOCAL_V1.hanger[2];

export interface TrebuchetPosesV1 {
  readonly arm: { readonly centre: Vec3; readonly quaternion: Quat };
  readonly cw: { readonly centre: Vec3; readonly quaternion: Quat };
  readonly sling: { readonly centre: Vec3; readonly quaternion: Quat };
  readonly ball: { readonly centre: Vec3; readonly quaternion: Quat };
  /** World tip-crossbar center, where the trigger rope leaves the arm. */
  readonly tip: Vec3;
  /** World anchor-block position (bottom-center on the floor). */
  readonly anchorAt: Vec3;
}

/**
 * The cocked machine, computed: pitch the arm tip-down about the axle
 * until the trigger rope reaches its anchor, hang the counterweight plumb
 * from the pitched hanger rod, lay the sling from the lowered tip back
 * along the ground, and seat the ball on the pouch plate.
 */
export function trebuchetCockedPosesV1(): TrebuchetPosesV1 {
  const axle: Vec3 = [0, TREBUCHET_AXLE_Y_V1, TREBUCHET_AXLE_Z_V1];
  // +x rotation moves +z downward: the long (+z) arm dips toward the floor.
  const pitch = COCKED;
  const armQuat = quatAboutX(pitch);
  const armCentre = add(axle, rotateX(
    [
      -TREBUCHET_ARM_LOCAL_V1.axle[0],
      -TREBUCHET_ARM_LOCAL_V1.axle[1],
      -TREBUCHET_ARM_LOCAL_V1.axle[2],
    ],
    pitch,
  ));
  const tip = add(armCentre, rotateX(TREBUCHET_ARM_LOCAL_V1.tip, pitch));
  const hanger = add(armCentre, rotateX(TREBUCHET_ARM_LOCAL_V1.hanger, pitch));
  // The counterweight hangs plumb: identity rotation, eye on the hanger rod.
  const cwCentre = add(hanger, [
    -TREBUCHET_CW_LOCAL_HINGE_V1[0],
    -TREBUCHET_CW_LOCAL_HINGE_V1[1],
    -TREBUCHET_CW_LOCAL_HINGE_V1[2],
  ]);
  // The sling leans from the lowered tip back toward the ground; the ball
  // sits on the pouch plate. Solved so the pouch bottom rests on the floor.
  // Hang height of the pouch in the cocked pose. Not a settled rest: the
  // hold scenario measures the sling easing down about 4 cm and the ball
  // about 8 cm over its first seconds before contact takes over.
  const pouchRest = FLOOR + 0.55;
  const lean = Math.asin(Math.max(-1, Math.min(1,
    (tip[1] - pouchRest) / TREBUCHET_SLING_LENGTH_V1)));
  const slingQuat = quatAboutX(lean);
  const slingCentre = add(tip, rotateX(
    [
      -TREBUCHET_SLING_LOCAL_V1.eye[0],
      -TREBUCHET_SLING_LOCAL_V1.eye[1],
      -TREBUCHET_SLING_LOCAL_V1.eye[2],
    ],
    lean,
  ));
  const ballCentre = add(slingCentre, rotateX(
    [0, TREBUCHET_SLING_LOCAL_V1.plateTopY + 0.375,
      TREBUCHET_SLING_LOCAL_V1.pouchCentre[2]],
    lean,
  ));
  return {
    arm: { centre: armCentre, quaternion: armQuat },
    cw: { centre: cwCentre, quaternion: [0, 0, 0, 1] },
    sling: { centre: slingCentre, quaternion: slingQuat },
    ball: { centre: ballCentre, quaternion: [0, 0, 0, 1] },
    tip,
    anchorAt: [tip[0] + 0.875, FLOOR, tip[2]],
  };
}

// ---- the station ----

export function createTrebuchetStationV1(): PlaygroundStationV1 {
  const poses = trebuchetCockedPosesV1();
  const bodies: PlaygroundBodyDefV1[] = [
    {
      placementId: 'floor',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [0, 0, 0],
      tests: 'The ground under the machine; deck combine reads each '
        + 'body\'s own friction undiluted.',
    },
    {
      placementId: 'floor-downrange',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [0, 0, -12],
      tests: 'The landing ground: the fire scenario\'s range checks need '
        + 'a floor where the ball comes down, flush at the z -6 seam.',
    },
    {
      placementId: 'floor-downrange-2',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [0, 0, -24],
      tests: 'The long-shot margin: the ball lands near z -11 and then '
        + 'rolls, so the field must reach well past the landing point.',
    },
    {
      placementId: 'catch-berm',
      recipeId: 'studio:pg-berm',
      kind: 'fixed',
      material: 'stone',
      at: [0, FLOOR, -29.6],
      turns: 1,
      tests: 'The end of the field. Rapier models no rolling resistance, '
        + 'so the landed ball rolls at a constant 4 m/s forever: measured '
        + 'without this berm it left the last tile around tick 2100 and '
        + 'fell out of the world. The rolling station found the same thing '
        + 'and answered it the same way.',
    },
    {
      placementId: 'frame',
      recipeId: 'studio:pg-treb-frame',
      kind: 'fixed',
      material: 'wood',
      at: [0, FLOOR, TREBUCHET_AXLE_Z_V1],
      tests: 'Bears the axle load, staked like the real machine: the '
        + 'free-standing first fire somersaulted — the reaction torque '
        + 'flips whichever end is lighter, and here that was the frame.',
    },
    {
      placementId: 'arm',
      recipeId: 'studio:pg-treb-arm',
      kind: 'dynamic',
      material: 'wood',
      at: [0, TREBUCHET_AXLE_Y_V1 - 0.125, TREBUCHET_AXLE_Z_V1 + 1.5],
      poseOverride: {
        centre: poses.arm.centre,
        quaternion: poses.arm.quaternion,
      },
      tests: 'The lever. Cocked pitch comes from the pose override; the '
        + 'authored scene shows it balanced in its bearings.',
    },
    {
      placementId: 'cw',
      recipeId: 'studio:pg-treb-cw',
      kind: 'dynamic',
      material: 'stone',
      // Authored hanging: the eye-hole center (1.625 above the model
      // base) must land exactly on the authored hanger rod at 3.625.
      at: [0, TREBUCHET_AXLE_Y_V1 - 1.625,
        TREBUCHET_AXLE_Z_V1 - TREBUCHET_SHORT_ARM_V1],
      poseOverride: {
        centre: poses.cw.centre,
        quaternion: poses.cw.quaternion,
      },
      tests: 'The power source, hinged so it falls plumb. The '
        + 'no-counterweight run proves the fire case is inert without it.',
    },
    {
      placementId: 'sling',
      recipeId: 'studio:pg-treb-sling',
      kind: 'dynamic',
      material: 'wood',
      at: [2.2, FLOOR, 0.85],
      poseOverride: {
        centre: poses.sling.centre,
        quaternion: poses.sling.quaternion,
      },
      tests: 'The whip\'s second pendulum. The no-sling run proves the '
        + 'ball goes nowhere without it.',
    },
    {
      placementId: 'ball',
      recipeId: 'studio:pg-treb-ball',
      kind: 'dynamic',
      material: 'wood',
      at: [2.2, FLOOR, 4.97],
      collider: 'ball',
      ccd: true,
      poseOverride: {
        centre: poses.ball.centre,
        quaternion: poses.ball.quaternion,
      },
      tests: 'The payload, CCD on: at release speed it must not tunnel '
        + 'the landing floor.',
    },
    {
      placementId: 'anchor',
      recipeId: 'studio:pg-treb-anchor',
      kind: 'fixed',
      material: 'stone',
      at: [poses.anchorAt[0], poses.anchorAt[1], poses.anchorAt[2]],
      tests: 'The tie-down the trigger rope holds the cocked tip against; '
        + 'stays drawn and solid after firing.',
    },
  ];
  const joints: PlaygroundJointV1[] = [
    {
      id: 'axle',
      kind: 'revolute',
      a: 'frame',
      b: 'arm',
      // Frame-local: the bearing-hole center. The frame model is 16 cells
      // tall standing on the floor, so its center sits at y 2.25; the
      // hole center (cell 13) sits at 3.625 — offset +1.375. Hole z cell
      // 7 of 15 is the model center — offset 0.
      anchorA: [0, 1.375, 0],
      anchorB: [
        TREBUCHET_ARM_LOCAL_V1.axle[0],
        TREBUCHET_ARM_LOCAL_V1.axle[1],
        TREBUCHET_ARM_LOCAL_V1.axle[2],
      ],
      axis: [1, 0, 0],
      tests: 'The bearing: the drawn axle rod centered in the drawn rings.',
    },
    {
      id: 'cw-hinge',
      kind: 'revolute',
      a: 'arm',
      b: 'cw',
      anchorA: [
        TREBUCHET_ARM_LOCAL_V1.hanger[0],
        TREBUCHET_ARM_LOCAL_V1.hanger[1],
        TREBUCHET_ARM_LOCAL_V1.hanger[2],
      ],
      anchorB: [
        TREBUCHET_CW_LOCAL_HINGE_V1[0],
        TREBUCHET_CW_LOCAL_HINGE_V1[1],
        TREBUCHET_CW_LOCAL_HINGE_V1[2],
      ],
      axis: [1, 0, 0],
      tests: 'The hanger: eye rings on the drawn rod, weight falls plumb.',
    },
    {
      // A hinge, not a ball joint: the drawn eye ring on the drawn
      // crossbar is a hinge, and a real sling's two cords keep the whip
      // in the firing plane. The first spherical-jointed fire proved the
      // point — free roll let the drag phase dump the ball over a side
      // rim and the throw went wildly lateral.
      id: 'sling-pivot',
      kind: 'revolute',
      a: 'arm',
      b: 'sling',
      anchorA: [
        TREBUCHET_ARM_LOCAL_V1.tip[0],
        TREBUCHET_ARM_LOCAL_V1.tip[1],
        TREBUCHET_ARM_LOCAL_V1.tip[2],
      ],
      anchorB: [
        TREBUCHET_SLING_LOCAL_V1.eye[0],
        TREBUCHET_SLING_LOCAL_V1.eye[1],
        TREBUCHET_SLING_LOCAL_V1.eye[2],
      ],
      axis: [1, 0, 0],
      tests: 'The sling eye hinging on the drawn tip crossbar, whipping '
        + 'in the firing plane like a two-cord sling.',
    },
    {
      id: 'trigger',
      kind: 'rope',
      a: 'arm',
      b: 'anchor',
      anchorA: [0.75, 0, TREBUCHET_ARM_LOCAL_V1.tip[2]],
      anchorB: [0, 0.375, 0],
      lengthMeters: TREBUCHET_TRIGGER_ROPE_V1,
      tests: 'The trigger: a 24 cm lashing from the tip crossbar\'s east '
        + 'end down to the post beside it, taut under the '
        + 'counterweight\'s torque until fired. Not drawn — both ends are '
        + 'drawn, the tie between them is not.',
    },
  ];
  return {
    sceneId: 'studio:scene:physics-trebuchet',
    label: 'Trebuchet',
    summary: 'The first whole machine: axle and hanger hinges, a sling '
      + 'pivot, and a rope trigger. Fire detaches the rope; the '
      + 'counterweight falls, the arm whips the sling, and the open pouch '
      + 'lets the ball fly by geometry alone. Ablation runs prove the '
      + 'counterweight and sling each earn their place.',
    bodies,
    slopes: [],
    joints,
    cases: [
      {
        id: 'fire',
        label: 'fire',
        actions: [{ kind: 'detach-joint', atTick: 30, jointId: 'trigger' }],
      },
    ],
    scenarios: [
      {
        id: 'treb-hold',
        label: 'Cocked and holding: the trigger rope carries the torque',
        ticks: 720,
        checks: [
          {
            check: 'holds-still',
            placementIds: ['frame', 'arm', 'cw', 'sling', 'ball', 'anchor'],
            maxDriftMeters: 0.12,
          },
          { check: 'no-floor-penetration', floorTopY: FLOOR, toleranceMeters: 0.005 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'treb-fire',
        label: 'Fire: the whip throws the ball downrange',
        caseId: 'fire',
        // Long enough to reach the far berm: the ball lands near tick
        // 1055 and rolls the remaining 19 m at a constant 4 m/s, so a
        // 1,680-tick window ended while it was still travelling and
        // proved nothing about where it stops.
        ticks: 3600,
        checks: [
          // Swept angle, not final attitude: the arm passes 170 degrees.
          { check: 'rotated-at-least', placementId: 'arm', minDegrees: 100 },
          // Windowed at tick 900, before the ball lands at ~1055. The
          // unwindowed peak was 14.6 m/s — the landing impact, reachable
          // by dropping from the same height with no machine at all. The
          // ball actually leaves the sling at 6.6 m/s around tick 818,
          // so 5 m/s is a real margin on what the whip delivered.
          {
            check: 'peak-speed-at-least',
            placementId: 'ball',
            minSpeed: 5,
            throughTick: 900,
          },
          { check: 'crossed-plane', placementId: 'ball', axis: 2, threshold: -8, expect: 'crossed' },
          { check: 'moved-at-least', placementId: 'ball', minTravelMeters: 15 },
          // The ball must stop, not merely stay: measured, it reaches the
          // berm at tick 2092 and is asleep by the window's end. Scoped
          // to the ball on purpose — the arm hangs on frictionless
          // hinges and is still swinging at 0.18 m/s here, which is the
          // solver's honest answer, not a defect to threshold away.
          {
            check: 'all-asleep-or-slow',
            maxSpeed: 0.1,
            placementIds: ['ball'],
          },
          // 6 cm, not the resting 5 mm: the ball lands at ~14 m/s and a
          // sampled landing frame legitimately reads up to one step's
          // travel of contact compression (the reference run measured
          // 4.2 cm at touchdown). Ending below the floor would still
          // fail every later frame.
          { check: 'no-floor-penetration', floorTopY: FLOOR, toleranceMeters: 0.06 },
          { check: 'all-finite' },
        ],
      },
      {
        // Negative control. The runner is expected to report FAIL here:
        // without the berm the rolling ball leaves the last tile and
        // falls, which the floor-penetration check reads as an enormous
        // dip. The test asserts the failure, so the berm's stated job is
        // evidence rather than assertion.
        id: 'treb-fire-no-berm',
        label: 'Control: without the catch berm the ball leaves the world',
        caseId: 'fire',
        omit: ['catch-berm'],
        ticks: 3600,
        checks: [
          { check: 'no-floor-penetration', floorTopY: FLOOR, toleranceMeters: 0.06 },
        ],
      },
      {
        id: 'treb-fire-no-cw',
        label: 'Subtraction: no counterweight, the fire case is inert',
        caseId: 'fire',
        omit: ['cw'],
        ticks: 720,
        checks: [
          { check: 'rotated-at-most', placementId: 'arm', maxDegrees: 15 },
          { check: 'moved-at-most', placementId: 'ball', maxTravelMeters: 0.4 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'treb-fire-no-sling',
        label: 'Subtraction: no sling, the swing carries nothing',
        caseId: 'fire',
        omit: ['sling'],
        ticks: 1680,
        checks: [
          { check: 'rotated-at-least', placementId: 'arm', minDegrees: 100 },
          { check: 'moved-at-most', placementId: 'ball', maxTravelMeters: 1.2 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}
