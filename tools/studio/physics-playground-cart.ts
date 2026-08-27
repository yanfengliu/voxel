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
 * spring and whose declared limits are the bump stops; each rear
 * carrier holds one wheel on a revolute axle whose velocity motor is
 * the drive. The front corners add steering: a kingpin revolute swings
 * a knuckle plate about the wheel's own vertical centre line, its
 * position motor is the steering servo, and its declared limits are
 * the steering stops — the first revolute limits in the playground.
 * The road supplies the argument: two full-width potholes pitch the
 * cart, three half-width ones roll it, and the end ledge drops it
 * half a meter. The cargo rides on friction alone, and the
 * locked-suspension control run is what makes "the suspension did
 * that" a measurement instead of a story.
 *
 * Conventions: the cart drives along +x, axles lie along z, and with
 * the axle axis +z a wheel must spin negative to roll the cart toward
 * +x (right-hand rule at the contact point, confirmed by measurement
 * in the fixture suite). The road's 'left' is +z, and a positive
 * kingpin angle about +y steers the rolling direction toward -z, so
 * the left-turn case commands a negative target — also confirmed by
 * measurement, in the circle run's signed drift.
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
/** Steering-knuckle plate centres, outboard of the front wheels. */
export const CART_KNUCKLE_HALF_TRACK_V1 = 1.56;

const WHEEL_CENTRE_Y = CART_ROAD_TOP_Y_V1 + CART_WHEEL_RADIUS_V1;
/** Spawn gap above the road so nothing starts penetrating. */
const SPAWN_GAP = 0.01;
const CHASSIS_CENTRE_Y = 2.6;
const CHASSIS_HALF_HEIGHT = GRAIN;
const CARGO_GAP = 0.02;
const KNUCKLE_HALF_HEIGHT = GRAIN;

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
 * toward +x. Only the rear axles carry these (see the drive-ids note),
 * so the target is higher than the four-wheel build's -5: measured at
 * -7, factor 120, the cart dips to 0.4 m/s digging out of pothole
 * exits, peaks 2.3 m/s between them, and runs 2.6 m/s on the smooth
 * floor past the ledge. Factor 30 was too weak to reach cruise inside
 * the road's length; 120 spins up in about two seconds.
 */
export const CART_DRIVE_TARGET_V1 = -7;
export const CART_REVERSE_TARGET_V1 = 5;
/** Velocity-error gain of the axle motors; brake and drive share it. */
export const CART_DRIVE_FACTOR_V1 = 120;

/**
 * The steering stops: 0.7 rad (40°) each way about the kingpin — a
 * cart's tight lock, and a sized one: the full-lock circle's diameter
 * is 2·wheelbase/tan(lock) ≈ 4.7 m, which is what fits the floor
 * tiles' ±6 m with the wheels aboard before scrub widens it. The
 * first cut at 0.44 rad needed an 8.5 m kinematic circle before any
 * scrub and drove the cart clean off the world. This
 * is the first revolute limit in the playground, and the reason the
 * limit lands through the runtime setLimits path — declarative
 * JointData limits silently reach only prismatic joints in the
 * installed Rapier, which a hinge with a dead stop would never reveal
 * on its own. The steer-lock scenario drives the servo far past the
 * stop and reads the angle.
 */
export const CART_STEER_LOCK_V1 = 0.7;
/**
 * Slop the steer-lock check allows past the stop: the 8000-stiff servo
 * slams the hinge into the limit and the impulse-based stop yields a
 * measured 0.095 rad transient before settling inside the range — the
 * revolute cousin of the slam's 0.045 prismatic compliance, larger
 * because the servo keeps pushing where the slam was a single hit.
 * The stripped-limit counter-run still clears this bound by a wide
 * margin, so the slop cannot hide a dead stop.
 */
export const CART_STEER_LOCK_SLOP_V1 = 0.12;
/**
 * The steering servo: an acceleration-based position motor about the
 * kingpin, calibrated by measurement like the springs — and the
 * measurement is a finding. At stiffness 300 the parked cart cannot be
 * steered at all: the loaded tread's friction holds the line contact
 * and the servo winds up 0.006 rad against a 1.2 rad command, while
 * the same servo with the wheels removed snaps to the stop instantly.
 * Dry steering is a fight against the full contact patch, and 2000
 * wins that one — but rolling adds a second opponent: the cylinder
 * tread's two-point contact works a 0.25 m lever about the kingpin,
 * and in the first full-lock circle it shoved the inner hinge from
 * -0.71 back to -0.09 rad against the 2000 servo, toeing the fronts
 * 33° apart until the cart ran straight. The moment that wheel left
 * the ground the servo snapped back to the stop, which is what proved
 * the opponent was contact torque. 8000 holds the turn: the inner
 * hinge still gives up to 0.23 rad back to scrub in the worst of the
 * circle — measured, and stated rather than rounded to “holds” —
 * against the 0.61 rad collapse at 2000. A steering linkage is a
 * rigid thing, and the gain says so.
 */
export const CART_STEER_STIFFNESS_V1 = 8000;
export const CART_STEER_DAMPING_V1 = 160;
/** The servo target the lock scenario commands: far past the stop. */
export const CART_STEER_OVERDRIVE_TARGET_V1 = 1.2;

const CORNERS: readonly {
  readonly id: string;
  readonly dx: number;
  readonly dz: number;
  readonly front: boolean;
}[] = [
  {
    id: 'fl', dx: CART_AXLE_HALF_SPACING_V1,
    dz: CART_WHEEL_HALF_TRACK_V1, front: true,
  },
  {
    id: 'fr', dx: CART_AXLE_HALF_SPACING_V1,
    dz: -CART_WHEEL_HALF_TRACK_V1, front: true,
  },
  {
    id: 'rl', dx: -CART_AXLE_HALF_SPACING_V1,
    dz: CART_WHEEL_HALF_TRACK_V1, front: false,
  },
  {
    id: 'rr', dx: -CART_AXLE_HALF_SPACING_V1,
    dz: -CART_WHEEL_HALF_TRACK_V1, front: false,
  },
];

const FRONT_CORNERS = CORNERS.filter((corner) => corner.front);

export const CART_SUSPENSION_JOINT_IDS_V1: readonly string[] =
  CORNERS.map((corner) => `suspension-${corner.id}`);
export const CART_AXLE_JOINT_IDS_V1: readonly string[] =
  CORNERS.map((corner) => `axle-${corner.id}`);
/**
 * Only the rear axles carry drive motors. The first steered build drove
 * all four, and the cart plowed straight ahead at full lock: a tread
 * spending its friction on commanded spin has little left for cornering
 * — the friction circle, measured here as a 9.5 m turn radius against
 * the 4.2 m centreline radius its 0.44 rad lock then commanded,
 * understeering clean off the field. Freeing the front wheels to roll returns their grip to
 * steering, which is why powered vehicles that must steer hard drive
 * the axle that is not doing the steering.
 */
export const CART_DRIVE_JOINT_IDS_V1: readonly string[] =
  CORNERS.filter((corner) => !corner.front)
    .map((corner) => `axle-${corner.id}`);
export const CART_KINGPIN_JOINT_IDS_V1: readonly string[] =
  FRONT_CORNERS.map((corner) => `kingpin-${corner.id}`);

function driveActions(target: number): readonly {
  readonly kind: 'motor-velocity';
  readonly atSeconds: number;
  readonly jointId: string;
  readonly target: number;
  readonly factor: number;
}[] {
  return CART_DRIVE_JOINT_IDS_V1.map((jointId) => ({
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
  return CART_DRIVE_JOINT_IDS_V1.map((jointId) => ({
    kind: 'motor-velocity' as const,
    atSeconds,
    jointId,
    target,
    factor: CART_DRIVE_FACTOR_V1,
  }));
}

/** Servo retargets for both kingpins at one moment. */
function steerActions(atSeconds: number, target: number): readonly {
  readonly kind: 'motor-position';
  readonly atSeconds: number;
  readonly jointId: string;
  readonly target: number;
  readonly stiffness: number;
  readonly damping: number;
}[] {
  return CART_KINGPIN_JOINT_IDS_V1.map((jointId) => ({
    kind: 'motor-position' as const,
    atSeconds,
    jointId,
    target,
    stiffness: CART_STEER_STIFFNESS_V1,
    damping: CART_STEER_DAMPING_V1,
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
      tests: 'The braking margin: the cart lands off the ledge doing '
        + 'about 2.6 m/s and brakes to rest near x 17 on the east tile; '
        + 'this tile is what keeps a hotter run on drawn ground instead '
        + 'of over the edge of the world.',
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
        + 'off the world. The circle run carves its loop here too.',
    },
    ...([
      ['floor-north', 0, 12],
      ['floor-north-west', -12, 12],
      ['floor-south', 0, -12],
      ['floor-south-west', -12, -12],
    ] as const).map(([placementId, x, z]): PlaygroundBodyDefV1 => ({
      placementId,
      recipeId: 'studio:pg-floor',
      kind: 'fixed',
      material: 'deck',
      at: [x, 0, z],
      tests: 'Steering apron: the full-lock circle sweeps a measured '
        + '9.9 m of z extent (10.3 m at its farthest reach) — tread '
        + 'scrub roughly doubles the kinematic 4.7 m diameter — and '
        + 'the first cut without these tiles dropped the cart off the '
        + 'world mid-turn. Four tiles ring the field so a panel driver '
        + 'can turn either way.',
    })),
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
        tests: 'The unsprung block of one corner: it rides the vertical '
          + 'prismatic joint, so wheel motion becomes spring travel '
          + 'instead of deck motion. Front corners hang their kingpin '
          + 'from it; rear corners hold the axle directly.',
      },
      ...(corner.front
        ? [{
          placementId: `knuckle-${corner.id}`,
          recipeId: 'studio:pg-cart-knuckle',
          kind: 'dynamic' as const,
          material: 'wood' as const,
          at: [
            CART_SPAWN_X_V1 + corner.dx,
            WHEEL_CENTRE_Y + SPAWN_GAP - KNUCKLE_HALF_HEIGHT,
            Math.sign(corner.dz) * CART_KNUCKLE_HALF_TRACK_V1,
          ] as const,
          tests: 'The steering plate outboard of one front wheel: the '
            + 'kingpin swings it about the wheel\'s vertical centre '
            + 'line, and the axle it carries points the wheel wherever '
            + 'it faces.',
        }]
        : []),
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
      const knuckleDz = Math.sign(corner.dz) * CART_KNUCKLE_HALF_TRACK_V1;
      const suspension: PlaygroundJointV1 = {
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
      };
      if (!corner.front) {
        return [
          suspension,
          {
            id: `axle-${corner.id}`,
            kind: 'revolute',
            a: `carrier-${corner.id}`,
            b: `wheel-${corner.id}`,
            anchorA: [0, 0, corner.dz - carrierDz],
            anchorB: [0, 0, 0],
            axis: [0, 0, 1],
            motorVelocity: { target: 0, factor: CART_DRIVE_FACTOR_V1 },
            tests: 'One rear axle and its drive: target zero is the '
              + 'parking brake, and the drive case retargets it. The '
              + 'spokes between carrier and rim are not drawn; the '
              + 'ledger records that honestly.',
          },
        ];
      }
      return [
        suspension,
        {
          id: `kingpin-${corner.id}`,
          kind: 'revolute',
          a: `carrier-${corner.id}`,
          b: `knuckle-${corner.id}`,
          // Both anchors are the wheel's own centre, so steering swings
          // the knuckle — and the axle it carries — about the wheel's
          // vertical centre line and the tread never scrubs sideways.
          anchorA: [0, 0, corner.dz - carrierDz],
          anchorB: [0, 0, corner.dz - knuckleDz],
          axis: [0, 1, 0],
          limits: [-CART_STEER_LOCK_V1, CART_STEER_LOCK_V1],
          motorPosition: {
            target: 0,
            stiffness: CART_STEER_STIFFNESS_V1,
            damping: CART_STEER_DAMPING_V1,
          },
          tests: 'One kingpin: the position motor is the steering servo, '
            + 'and the declared stops are the playground\'s first '
            + 'revolute limits — the steer-lock scenario drives the '
            + 'servo far past them and reads the angle that results.',
        },
        {
          id: `axle-${corner.id}`,
          kind: 'revolute',
          a: `knuckle-${corner.id}`,
          b: `wheel-${corner.id}`,
          anchorA: [0, 0, corner.dz - knuckleDz],
          anchorB: [0, 0, 0],
          axis: [0, 0, 1],
          tests: 'One front axle, hung from the steering knuckle so the '
            + 'wheel rolls wherever the plate points. Undriven on '
            + 'purpose: a tread spending its friction on commanded spin '
            + 'has little left for cornering, and the first build drove '
            + 'all four wheels straight off the field at full lock.',
        },
      ];
    },
  );

  return {
    sceneId: 'studio:scene:physics-cart',
    label: 'Physics: suspension cart',
    summary: 'A driven, steered cart whose corners ride sprung, '
      + 'travel-limited prismatic joints: velocity motors drive the '
      + 'axles, a position-motor servo steers the front kingpins between '
      + 'revolute stops, and a potholed road with an end ledge is the '
      + 'examiner.',
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
          [`wheel-${corner.id}`, 'floor-north'],
          [`wheel-${corner.id}`, 'floor-north-west'],
          [`wheel-${corner.id}`, 'floor-south'],
          [`wheel-${corner.id}`, 'floor-south-west'],
          [`wheel-${corner.id}`, 'cargo'],
        ]),
        ...FRONT_CORNERS.map((corner): readonly [string, string] =>
          [`knuckle-${corner.id}`, 'cargo']),
        ['cargo', 'chassis'],
        ['cargo', 'road'],
        ['cargo', 'floor'],
        ['cargo', 'floor-east'],
        ['cargo', 'floor-far'],
        ['cargo', 'floor-west'],
        ['cargo', 'floor-north'],
        ['cargo', 'floor-north-west'],
        ['cargo', 'floor-south'],
        ['cargo', 'floor-south-west'],
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
      {
        id: 'cart-steer-left',
        label: 'steer left',
        actions: steerActions(0, -CART_STEER_LOCK_V1),
      },
      {
        id: 'cart-steer-right',
        label: 'steer right',
        actions: steerActions(0, CART_STEER_LOCK_V1),
      },
      {
        id: 'cart-steer-straight',
        label: 'steer straight',
        actions: steerActions(0, 0),
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
              ...FRONT_CORNERS.map((corner) => `knuckle-${corner.id}`),
              ...CORNERS.map((corner) => `wheel-${corner.id}`),
            ],
            // Measured 0.119 at authoring, nearly all of it the cargo
            // and chassis riding the springs down through spawn settle;
            // the sleep check below owns the claim that it then stops.
            maxDriftMeters: 0.15,
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
          ...CART_KINGPIN_JOINT_IDS_V1.map((jointId) => ({
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
          // The servo holds straight while the road pitches and rolls
          // the cart: the kingpins must stay near centre, nowhere near
          // their stops.
          ...CART_KINGPIN_JOINT_IDS_V1.map((jointId) => ({
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
        lockJoints: [
          ...CART_SUSPENSION_JOINT_IDS_V1,
          ...CART_KINGPIN_JOINT_IDS_V1,
        ],
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
      {
        id: 'cart-steer-lock',
        label: 'The servo shoves past the stops; the stops answer',
        // The wheels creep while the servo shoves, because rolling is
        // how a cart takes full lock — steering torque a parked tread
        // resists comes almost free once the contact rolls. Not because
        // the limit needs it: at the shipped gains even the parked shove
        // reaches the stop (0.792 rad transient against 0.7, measured);
        // it was the earlier 300 and 2000 servos that parked friction
        // stalled short.
        actions: [
          ...timedDriveActions(0.5, -3),
          ...steerActions(0.5, CART_STEER_OVERDRIVE_TARGET_V1),
          ...timedDriveActions(2.5, 0),
        ],
        seconds: 4,
        checks: [
          // The whole scenario: a servo target of 1.2 rad against stops
          // at 0.7. The angle the hinge actually reaches is the limit's
          // testimony — and the fixture suite runs the same shove with
          // the stops stripped and measures the servo win.
          ...CART_KINGPIN_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            slop: CART_STEER_LOCK_SLOP_V1,
          })),
          // The creep carries the cart a couple of meters while the
          // stops are proven; the cargo must simply still be riding.
          { check: 'ends-within', a: 'cargo', b: 'chassis', maxDistanceMeters: 1.0, expect: 'near' as const },
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
      {
        id: 'cart-circle',
        label: 'Full left lock and drive: the cart comes back around',
        actions: [
          ...steerActions(0.3, -CART_STEER_LOCK_V1),
          ...timedDriveActions(0.5, CART_DRIVE_TARGET_V1),
        ],
        seconds: 20,
        checks: [
          // A circle is heading change without displacement: the chassis
          // sweeps most of a turn while never leaving the field a
          // straight run of the same duration would have left long ago.
          { check: 'rotated-at-least', placementId: 'chassis', minDegrees: 270 },
          { check: 'moved-at-most', placementId: 'chassis', maxTravelMeters: 11 },
          ...CART_SUSPENSION_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            slop: 0.02,
          })),
          ...CART_KINGPIN_JOINT_IDS_V1.map((jointId) => ({
            check: 'joint-travel-within-limits' as const,
            jointId,
            // Dynamic compliance: riding the road's side ledge down at
            // full lock shoves the hinge harder than the parked servo
            // ever can. Measured against the static 0.009.
            slop: 0.1,
          })),
          { check: 'ends-within', a: 'cargo', b: 'chassis', maxDistanceMeters: 1.0, expect: 'near' as const },
          { check: 'no-floor-penetration', floorTopY: 0.25, toleranceMeters: 0.02 },
          { check: 'all-finite' },
        ],
      },
    ],
  };
}
