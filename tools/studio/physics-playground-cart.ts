import type {
  PlaygroundBodyDefV1,
  PlaygroundJointV1,
  PlaygroundStationV1,
} from './physics-playground-types.js';
import {
  CART_ROAD_BASE_VOXELS_V1,
  CART_ROAD_LENGTH_VOXELS_V1,
} from './physics-playground-cart-recipes.js';
import { PLAYGROUND_GRAIN_V1 } from './physics-playground-materials.js';

/**
 * The suspension cart — the machine that exercises joint limits and
 * motors, the two constraint capabilities no other station touches.
 *
 * Chassis and cargo are the sprung half; each corner hangs a small
 * carrier on a vertical prismatic joint whose position motor is the
 * spring and whose declared limits are the bump stops; each carrier
 * holds one faceted wheel on a revolute axle whose velocity motor is
 * the drive. The road supplies the argument: two full-width ridges
 * pitch the cart, three half-ridges roll it, and the end ledge drops
 * it half a meter onto the station floor. The cargo rides on friction
 * alone, and the locked-suspension control run is what makes "the
 * suspension did that" a measurement instead of a story.
 *
 * Conventions: the cart drives along +x, axles lie along z, and with
 * the axle axis +z a wheel must spin negative to roll the cart toward
 * +x (right-hand rule at the contact point, confirmed by measurement
 * in the fixture suite).
 */

const GRAIN = PLAYGROUND_GRAIN_V1;

/** World x of the road's west end; it runs east to the drop ledge. */
export const CART_ROAD_WEST_X_V1 = -3;
export const CART_ROAD_EAST_X_V1 =
  CART_ROAD_WEST_X_V1 + CART_ROAD_LENGTH_VOXELS_V1 * GRAIN;
/** Top of the road's base course, the surface the wheels start on. */
export const CART_ROAD_TOP_Y_V1 = 0.25 + CART_ROAD_BASE_VOXELS_V1 * GRAIN;

export const CART_WHEEL_RADIUS_V1 = (5 * GRAIN) / 2;
/** Cart centre x at spawn: run-up west of the first ridge. */
export const CART_SPAWN_X_V1 = -1.5;
/** Axle centres sit this far fore and aft of the cart centre. */
export const CART_AXLE_HALF_SPACING_V1 = 1.0;
/** Wheel centres this far out from the cart's centreline. */
export const CART_WHEEL_HALF_TRACK_V1 = 1.125;
/** Carrier centres tucked inboard, under the deck. */
export const CART_CARRIER_HALF_TRACK_V1 = 0.5;

const WHEEL_CENTRE_Y = CART_ROAD_TOP_Y_V1 + CART_WHEEL_RADIUS_V1;
/** Spawn gap above the road so nothing starts penetrating. */
const SPAWN_GAP = 0.01;
const CHASSIS_CENTRE_Y = 2.6;
const CHASSIS_HALF_HEIGHT = GRAIN;
const CARGO_GAP = 0.02;

/** Suspension travel each way from the build pose, meters. */
export const CART_SUSPENSION_TRAVEL_V1 = 0.25;
/**
 * Slop the slam scenario's travel checks allow past the declared stop —
 * the measured compliance of an impulse-based limit under the -900 hit
 * (caught at 0.295 against 0.25). Exported so the stripped-limit
 * counter-run asserts its measured overrun against the same bound.
 */
export const CART_SLAM_TRAVEL_SLOP_V1 = 0.07;
/**
 * The spring: an acceleration-based position motor. The gains read as
 * mass-normalized but the joint's reduced mass is what they act on, so
 * the numbers are calibrated by measurement, not derived: stiffness 400
 * sagged 0.20 m of the 0.25 m travel under the cart's weight — riding
 * its own bump stops — and 2000 holds the static sag near 0.04 m with
 * a ride the ridges can still visibly work. Damping is set near half
 * of critical at that stiffness. Measured effects are pinned in the
 * fixture suite.
 */
export const CART_SPRING_STIFFNESS_V1 = 2000;
export const CART_SPRING_DAMPING_V1 = 40;

/**
 * Drive targets, rad/s about the axle's +z. Negative rolls the cart
 * toward +x. The acceleration-based motor converges on its target
 * against rolling losses and the cart's inertia, so ground speed sits
 * well below target·radius: measured, target -5 at factor 120 holds
 * 1.6-1.8 m/s across the potholes and 2.2 m/s on the smooth floor past
 * the ledge. Factor 30 was too weak to reach cruise inside the road's
 * length; 120 spins up in about two seconds.
 */
export const CART_DRIVE_TARGET_V1 = -5;
export const CART_REVERSE_TARGET_V1 = 4;
/** Velocity-error gain of the axle motors; brake and drive share it. */
export const CART_DRIVE_FACTOR_V1 = 120;

const CORNERS: readonly {
  readonly id: string;
  readonly dx: number;
  readonly dz: number;
}[] = [
  { id: 'fl', dx: CART_AXLE_HALF_SPACING_V1, dz: CART_WHEEL_HALF_TRACK_V1 },
  { id: 'fr', dx: CART_AXLE_HALF_SPACING_V1, dz: -CART_WHEEL_HALF_TRACK_V1 },
  { id: 'rl', dx: -CART_AXLE_HALF_SPACING_V1, dz: CART_WHEEL_HALF_TRACK_V1 },
  { id: 'rr', dx: -CART_AXLE_HALF_SPACING_V1, dz: -CART_WHEEL_HALF_TRACK_V1 },
];

export const CART_SUSPENSION_JOINT_IDS_V1: readonly string[] =
  CORNERS.map((corner) => `suspension-${corner.id}`);
export const CART_AXLE_JOINT_IDS_V1: readonly string[] =
  CORNERS.map((corner) => `axle-${corner.id}`);

function driveActions(target: number): readonly {
  readonly kind: 'motor-velocity';
  readonly atSeconds: number;
  readonly jointId: string;
  readonly target: number;
  readonly factor: number;
}[] {
  return CART_AXLE_JOINT_IDS_V1.map((jointId) => ({
    kind: 'motor-velocity' as const,
    atSeconds: 0,
    jointId,
    target,
    factor: CART_DRIVE_FACTOR_V1,
  }));
}

/** The same retargets, timed for a scenario's own timeline. */
function timedDriveActions(atSeconds: number, target: number): readonly {
  readonly kind: 'motor-velocity';
  readonly atSeconds: number;
  readonly jointId: string;
  readonly target: number;
  readonly factor: number;
}[] {
  return CART_AXLE_JOINT_IDS_V1.map((jointId) => ({
    kind: 'motor-velocity' as const,
    atSeconds,
    jointId,
    target,
    factor: CART_DRIVE_FACTOR_V1,
  }));
}

export function createCartStationV1(): PlaygroundStationV1 {
  const bodies: PlaygroundBodyDefV1[] = [
    {
      placementId: 'floor',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [0, 0, 0],
      tests: 'The ground under the road and the west run-up; deck combine '
        + 'reads each body\'s own friction undiluted.',
    },
    {
      placementId: 'floor-east',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [12, 0, 0],
      tests: 'The landing ground past the ledge: the cart drops onto this '
        + 'tile and brakes to rest on it, so the drop test has somewhere '
        + 'honest to land.',
    },
    {
      placementId: 'floor-far',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [24, 0, 0],
      tests: 'The braking ground: the cart lands off the ledge doing '
        + 'about 2.2 m/s and needs the room past x 18 to brake to rest '
        + 'without running out of world.',
    },
    {
      placementId: 'floor-west',
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [-12, 0, 0],
      tests: 'The ground behind the road\'s west end: the reverse run '
        + 'drops its own half-meter ledge backward and needs somewhere '
        + 'to land and brake, or the scenario would be measuring a fall '
        + 'off the world.',
    },
    {
      placementId: 'road',
      recipeId: 'studio:pg-cart-road',
      kind: 'fixed',
      material: 'deck',
      at: [
        CART_ROAD_WEST_X_V1
        + (CART_ROAD_LENGTH_VOXELS_V1 * GRAIN) / 2,
        0.25,
        0,
      ],
      tests: 'The raised course whose ridges pitch and roll the cart and '
        + 'whose east ledge drops it; every suspension claim is a claim '
        + 'about crossing this road.',
    },
    {
      placementId: 'chassis',
      recipeId: 'studio:pg-cart-chassis',
      kind: 'dynamic',
      material: 'wood',
      at: [CART_SPAWN_X_V1, CHASSIS_CENTRE_Y - CHASSIS_HALF_HEIGHT, 0],
      tests: 'The sprung deck: its ride height and level are what the '
        + 'four springs answer for, and the locked control measures what '
        + 'happens without them.',
    },
    {
      placementId: 'cargo',
      recipeId: 'studio:pg-cart-cargo',
      kind: 'dynamic',
      material: 'stone',
      at: [
        CART_SPAWN_X_V1,
        CHASSIS_CENTRE_Y + CHASSIS_HALF_HEIGHT + CARGO_GAP,
        0,
      ],
      tests: 'Rides the deck on friction alone. Still aboard after the '
        + 'ridges and the ledge is the suspension\'s report card; the '
        + 'locked control grades it.',
    },
    ...CORNERS.flatMap((corner): PlaygroundBodyDefV1[] => [
      {
        placementId: `carrier-${corner.id}`,
        recipeId: 'studio:pg-cart-carrier',
        kind: 'dynamic',
        material: 'wood',
        at: [
          CART_SPAWN_X_V1 + corner.dx,
          WHEEL_CENTRE_Y + SPAWN_GAP - GRAIN,
          Math.sign(corner.dz) * CART_CARRIER_HALF_TRACK_V1,
        ],
        tests: 'The unsprung knuckle of one corner: it rides the vertical '
          + 'prismatic joint and holds the axle, so wheel motion becomes '
          + 'spring travel instead of deck motion.',
      },
      {
        placementId: `wheel-${corner.id}`,
        recipeId: 'studio:pg-cart-wheel',
        kind: 'dynamic',
        material: 'wood',
        collider: 'cylinder-z',
        at: [
          CART_SPAWN_X_V1 + corner.dx,
          CART_ROAD_TOP_Y_V1 + SPAWN_GAP,
          corner.dz,
        ],
        tests: 'One driven wheel on the smooth-tread simplification: '
          + 'measured with its exact faceted collider, ten times the '
          + 'drive torque wheelied the cart without tipping the wheel '
          + 'off its own flat — a drawn facet is a chock, so a driven '
          + 'wheel gets the round collider its job requires.',
      },
    ]),
  ];

  const joints: PlaygroundJointV1[] = CORNERS.flatMap(
    (corner): PlaygroundJointV1[] => {
      const carrierDz = Math.sign(corner.dz) * CART_CARRIER_HALF_TRACK_V1;
      return [
        {
          id: `suspension-${corner.id}`,
          kind: 'prismatic',
          a: 'chassis',
          b: `carrier-${corner.id}`,
          anchorA: [
            corner.dx,
            WHEEL_CENTRE_Y - CHASSIS_CENTRE_Y,
            carrierDz,
          ],
          anchorB: [0, 0, 0],
          axis: [0, 1, 0],
          limits: [-CART_SUSPENSION_TRAVEL_V1, CART_SUSPENSION_TRAVEL_V1],
          motorPosition: {
            target: 0,
            stiffness: CART_SPRING_STIFFNESS_V1,
            damping: CART_SPRING_DAMPING_V1,
          },
          tests: 'One corner\'s spring and bump stops: the position motor '
            + 'is the coil, the declared limits are the stops the drop '
            + 'test drives it into.',
        },
        {
          id: `axle-${corner.id}`,
          kind: 'revolute',
          a: `carrier-${corner.id}`,
          b: `wheel-${corner.id}`,
          anchorA: [0, 0, corner.dz - carrierDz],
          anchorB: [0, 0, 0],
          axis: [0, 0, 1],
          motorVelocity: { target: 0, factor: CART_DRIVE_FACTOR_V1 },
          tests: 'One axle and its drive: target zero is the parking '
            + 'brake, and the drive case retargets it. The spokes '
            + 'between carrier and rim are not drawn; the ledger records '
            + 'that honestly.',
        },
      ];
    },
  );

  return {
    sceneId: 'studio:scene:physics-cart',
    label: 'Physics: suspension cart',
    summary: 'A driven cart whose corners ride sprung, travel-limited '
      + 'prismatic joints: motors drive the axles, limits are the bump '
      + 'stops, and a potholed road with an end ledge is the examiner.',
    bodies,
    slopes: [],
    joints,
    contactPolicy: {
      pairs: [
        ...CORNERS.flatMap((corner): (readonly [string, string])[] => [
          [`wheel-${corner.id}`, 'road'],
          [`wheel-${corner.id}`, 'floor'],
          [`wheel-${corner.id}`, 'floor-east'],
          [`wheel-${corner.id}`, 'floor-far'],
          [`wheel-${corner.id}`, 'floor-west'],
          [`wheel-${corner.id}`, 'cargo'],
        ]),
        ['cargo', 'chassis'],
        ['cargo', 'road'],
        ['cargo', 'floor'],
        ['cargo', 'floor-east'],
        ['cargo', 'floor-far'],
        ['cargo', 'floor-west'],
      ],
    },
    cases: [
      {
        id: 'cart-drive-forward',
        label: 'drive',
        actions: driveActions(CART_DRIVE_TARGET_V1),
      },
      {
        id: 'cart-stop',
        label: 'stop',
        actions: driveActions(0),
      },
      {
        id: 'cart-reverse',
        label: 'reverse',
        actions: driveActions(CART_REVERSE_TARGET_V1),
      },
    ],
    scenarios: [
      {
        id: 'cart-hold',
        label: 'Parked on its brakes, nothing moves',
        seconds: 3,
        checks: [
          {
            check: 'holds-still',
            placementIds: [
              'chassis', 'cargo',
              ...CORNERS.map((corner) => `carrier-${corner.id}`),
              ...CORNERS.map((corner) => `wheel-${corner.id}`),
            ],
            maxDriftMeters: 0.08,
          },
          {
            // Parked is not merely slow: on its zero-target brakes the
            // whole machine goes to sleep, and this is the gate behind
            // the guide's saying so.
            check: 'all-asleep-or-slow',
            maxSpeed: 0.05,
          },
          ...CART_SUSPENSION_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            slop: 0.02,
          })),
          { check: 'ends-within', a: 'cargo', b: 'chassis', maxDistanceMeters: 1.0, expect: 'near' as const },
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'cart-drive',
        label: 'Drives the ridges, drops the ledge, keeps its cargo',
        actions: [
          ...timedDriveActions(0.5, CART_DRIVE_TARGET_V1),
          ...timedDriveActions(10, 0),
        ],
        seconds: 14,
        checks: [
          { check: 'moved-at-least', placementId: 'chassis', minTravelMeters: 10 },
          { check: 'crossed-plane', placementId: 'chassis', axis: 0, threshold: 9.5, direction: 1, expect: 'crossed' },
          ...CART_SUSPENSION_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            slop: 0.02,
          })),
          // 1.0 m discriminates by construction: aboard, the cargo's
          // centre sits 0.50 m from the chassis centre; the nearest
          // off-deck resting pose (perched on a wheel top) is about
          // 1.18 m and the ground beside a stopped cart about 1.5 m.
          // Measured ending: 0.65 m.
          { check: 'ends-within', a: 'cargo', b: 'chassis', maxDistanceMeters: 1.0, expect: 'near' as const },
          // floorTopY here is the station floor; penetration into the
          // raised road's own top is bounded by the fixture suite's ride
          // test, which tracks wheel height across the road span.
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'cart-locked-drive',
        label: 'The same run with the suspension welded — the control',
        lockJoints: [...CART_SUSPENSION_JOINT_IDS_V1],
        actions: [
          ...timedDriveActions(0.5, CART_DRIVE_TARGET_V1),
          ...timedDriveActions(10, 0),
        ],
        seconds: 14,
        checks: [
          { check: 'moved-at-least', placementId: 'chassis', minTravelMeters: 6 },
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'cart-drop-slam',
        label: 'A downward slam drives the springs into their stops',
        actions: [{
          kind: 'impulse',
          atSeconds: 1,
          placementId: 'chassis',
          // Sized so the springs alone cannot absorb it: measured, -600
          // peaked at 0.224 — inside the travel, so the stop never worked.
          // -900 drives the coordinate onto the declared limit, which is
          // what makes the travel check a claim about the stop.
          impulse: [0, -900, 0],
        }],
        seconds: 4,
        checks: [
          ...CART_SUSPENSION_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            // An impulse-based stop yields under a slam before it holds:
            // measured, this hit caught at 0.295 against the declared
            // 0.25 — 0.045 of solver compliance — while the same slam
            // with the limit stripped ran to 0.424. The slop admits the
            // measured compliance and still fails the stripped run by
            // 0.10; the fixture suite measures that stripped overrun
            // directly, so this margin cannot rot unnoticed.
            slop: CART_SLAM_TRAVEL_SLOP_V1,
          })),
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'cart-reverse-run',
        label: 'Reverses off the west end of the road and brakes',
        actions: [
          ...timedDriveActions(0.5, CART_REVERSE_TARGET_V1),
          ...timedDriveActions(4, 0),
        ],
        seconds: 9,
        checks: [
          { check: 'moved-at-least', placementId: 'chassis', minTravelMeters: 2 },
          { check: 'crossed-plane', placementId: 'chassis', axis: 0, threshold: -3.5, expect: 'crossed' },
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}
