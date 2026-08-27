import { describe, expect, it } from 'vitest';

import {
  createCartStationV1,
  CART_AXLE_JOINT_IDS_V1,
  CART_DRIVE_JOINT_IDS_V1,
  CART_KINGPIN_JOINT_IDS_V1,
  CART_SLAM_TRAVEL_SLOP_V1,
  CART_STEER_LOCK_SLOP_V1,
  CART_STEER_LOCK_V1,
  CART_SUSPENSION_JOINT_IDS_V1,
  CART_SUSPENSION_TRAVEL_V1,
} from '../../tools/studio/physics-playground-cart.js';
import {
  CART_ROAD_POTHOLES_V1,
} from '../../tools/studio/physics-playground-cart-recipes.js';
import {
  solverTicksForSecondsV1,
} from '../../tools/studio/solver-rate.js';
import {
  playgroundPrismaticCoordinateV1,
  playgroundRevoluteCoordinateV1,
} from '../../tools/studio/physics-playground-joint-checks.js';
import type {
  PlaygroundFrameV1,
} from '../../tools/studio/physics-playground-checks.js';
import {
  playgroundBodySpecsV1,
} from '../../tools/studio/physics-playground-bodies.js';
import {
  createPhysicsPlaygroundProfilesV1,
} from '../../tools/studio/physics-playground-profiles.js';
import {
  createCartPurposeGraphV1,
} from '../../tools/studio/scene-purpose-cart.js';
import type {
  PlaygroundActionV1,
  PlaygroundScenarioV1,
  PlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  expectScenarioCorrectV1,
  runPlaygroundScenarioV1,
} from './playground-run.js';
import {
  initPlaygroundRapierV1,
  PlaygroundWorldV1,
} from './playground-world.js';

/**
 * The suspension cart: joint limits and motors under load.
 *
 * The scenarios carry the physical claims; this file adds what a verdict
 * line cannot — the sprung-versus-locked ride comparison, the counter-runs
 * that neutralize a limit or a motor and watch the machine fail, the
 * determinism double-run, and the pins that keep the drawn geometry and
 * the declared constraints telling one story.
 *
 * Measured baselines (2026-08-26, shared 60 Hz lane, rear drive at
 * target -7, factor 120): static sag 0.040 to 0.042 m on stiffness
 * 2000; cruise dips to 0.4 m/s in the pothole exits, peaks 2.3 m/s
 * between them, and runs 2.6 m/s past the ledge, braking to rest near
 * x 16.8; peak chassis vertical acceleration 10.9 m/s2 sprung against
 * 77.3 m/s2 welded across the full drive and 9.0 against 41.6 over the
 * potholed road alone — the suspension's worth holds in both regimes;
 * the -900 slam caught at 0.295 m by the declared 0.25 m stop (0.045
 * solver compliance) against 0.424 m with the limit stripped; the
 * steering servo's slam into its 0.7 rad stop overshoots a transient
 * 0.095 rad before settling.
 */

const station = createCartStationV1();

function scenario(id: string): PlaygroundScenarioV1 {
  const found = station.scenarios.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`The cart declares no scenario '${id}'.`);
  }
  return found;
}

interface RideSample {
  readonly tick: number;
  readonly chassisX: number;
  readonly chassisZ: number;
  readonly chassisVy: number;
  readonly wheelX: number;
  readonly wheelY: number;
  readonly coords: readonly number[];
  /** Kingpin angles in kingpin-id order, radians from the build pose. */
  readonly steer: readonly number[];
}

/**
 * Drives a (possibly modified) station through a scenario's own timeline,
 * sampling every tick. The modified-station door is the counter-run door:
 * a station is plain data, so "the same cart without its limits" is a
 * spread, not a fixture.
 */
async function rideRun(
  base: PlaygroundStationV1,
  scenarioId: string,
  overrides?: {
    readonly stripLimits?: boolean;
    readonly stripMotors?: boolean;
  },
): Promise<readonly RideSample[]> {
  await initPlaygroundRapierV1();
  const spec = base.scenarios.find((entry) => entry.id === scenarioId)
    ?? scenario(scenarioId);
  const built: PlaygroundStationV1 = {
    ...base,
    joints: (base.joints ?? []).map((joint) => {
      let out = joint;
      if (overrides?.stripLimits && out.limits !== undefined) {
        const { limits, ...rest } = out;
        void limits;
        out = rest;
      }
      if (overrides?.stripMotors && out.motorVelocity !== undefined) {
        const { motorVelocity, ...rest } = out;
        void motorVelocity;
        out = rest;
      }
      return out;
    }),
  };
  const world = PlaygroundWorldV1.create(built, {
    ...(spec.lockJoints !== undefined ? { lockJoints: spec.lockJoints } : {}),
  });
  const actions: readonly PlaygroundActionV1[] = spec.actions ?? [];
  const samples: RideSample[] = [];
  const reference: PlaygroundFrameV1 = world.snapshot();
  try {
    for (let tick = 0; tick < solverTicksForSecondsV1(spec.seconds); tick += 1) {
      for (const action of actions) {
        if (solverTicksForSecondsV1(action.atSeconds) !== tick) continue;
        if (action.kind === 'motor-velocity') {
          if (overrides?.stripMotors) continue;
          world.setJointMotorVelocity(action.jointId, {
            target: action.target, factor: action.factor,
          });
        } else if (action.kind === 'motor-position') {
          // stripMotors strips the drives; the steering servo and the
          // springs stay, because a cart with no spring is a different
          // counter-run than the one that option names.
          world.setJointMotorPosition(action.jointId, {
            target: action.target,
            stiffness: action.stiffness,
            damping: action.damping,
          });
        } else if (action.kind === 'impulse') {
          world.impulse(action.placementId, action.impulse);
        }
      }
      world.step();
      const frame: PlaygroundFrameV1 = world.snapshot();
      const chassis = frame.bodies.find(
        (body) => body.placementId === 'chassis')!;
      const wheelFl = frame.bodies.find(
        (body) => body.placementId === 'wheel-fl')!;
      samples.push({
        tick: frame.tick,
        chassisX: chassis.translation[0],
        chassisZ: chassis.translation[2],
        chassisVy: chassis.linearVelocity[1],
        wheelX: wheelFl.translation[0],
        wheelY: wheelFl.translation[1],
        coords: CART_SUSPENSION_JOINT_IDS_V1.map((id) => {
          const joint = (built.joints ?? []).find((entry) => entry.id === id)!;
          const a = frame.bodies.find(
            (body) => body.placementId === joint.a)!;
          const b = frame.bodies.find(
            (body) => body.placementId === joint.b)!;
          return playgroundPrismaticCoordinateV1(joint, a, b);
        }),
        steer: CART_KINGPIN_JOINT_IDS_V1.map((id) => {
          const joint = (built.joints ?? []).find((entry) => entry.id === id)!;
          const referenceA = reference.bodies.find(
            (body) => body.placementId === joint.a)!;
          const referenceB = reference.bodies.find(
            (body) => body.placementId === joint.b)!;
          const a = frame.bodies.find(
            (body) => body.placementId === joint.a)!;
          const b = frame.bodies.find(
            (body) => body.placementId === joint.b)!;
          return playgroundRevoluteCoordinateV1(
            joint, { a: referenceA, b: referenceB }, a, b);
        }),
      });
    }
  } finally {
    world.free();
  }
  return samples;
}

/**
 * Peak chassis vertical acceleration from tick-adjacent velocity samples
 * — the ride-quality figure. The spawn settle transient in the first
 * half second is always excluded; the optional window then selects which
 * stretch answers. Across the full drive both lanes peak at the ledge
 * landing, so the road's own contribution is measured separately by
 * windowing on chassis x before the ledge.
 */
function peakVerticalAccel(
  samples: readonly RideSample[],
  window?: (sample: RideSample) => boolean,
): number {
  let peak = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index]!.tick < solverTicksForSecondsV1(0.5)) continue;
    if (window !== undefined && !window(samples[index]!)) continue;
    const dt = (samples[index]!.tick - samples[index - 1]!.tick)
      / solverTicksForSecondsV1(1);
    if (dt <= 0) continue;
    const dv = Math.abs(
      samples[index]!.chassisVy - samples[index - 1]!.chassisVy);
    peak = Math.max(peak, dv / dt);
  }
  return peak;
}

/** True while the cart is still crossing the potholed road span. */
const onRoad = (sample: RideSample): boolean => sample.chassisX < 9;

describe('the cart scenarios', () => {
  for (const entry of station.scenarios) {
    it(`${entry.id} passes its declared checks`, async () => {
      expectScenarioCorrectV1(await runPlaygroundScenarioV1(station, entry.id));
    }, 240_000);
  }

  it('runs the same drive to the same poses twice', async () => {
    const first = await runPlaygroundScenarioV1(station, 'cart-drive');
    const second = await runPlaygroundScenarioV1(station, 'cart-drive');
    expect(second.finalBodies).toStrictEqual(first.finalBodies);
  }, 240_000);
});

describe('the suspension is what smooths the ride', () => {
  it('welding the springs multiplies peak chassis vertical acceleration', async () => {
    // The same route, the same speed, the same cargo; the only
    // difference is lockJoints, which welds kingpins as well as springs
    // so the control has no compliant joint left. Measured at the
    // rear-drive tune: 10.9 m/s2 sprung against 77.3 m/s2 locked across
    // the full drive; windowed to the potholed road alone, 9.0 against
    // 41.6 — a 4.6x gap. The threefold ratio floor is asserted in both
    // regimes so neither the ledge nor the road carries the claim
    // alone.
    const sprung = await rideRun(station, 'cart-drive');
    const locked = await rideRun(station, 'cart-locked-drive');
    const sprungFull = peakVerticalAccel(sprung);
    const lockedFull = peakVerticalAccel(locked);
    expect(sprungFull).toBeLessThan(25);
    expect(lockedFull).toBeGreaterThan(45);
    expect(lockedFull / sprungFull).toBeGreaterThan(3);
    expect(
      peakVerticalAccel(locked, onRoad) / peakVerticalAccel(sprung, onRoad),
    ).toBeGreaterThan(3);
  }, 480_000);

  it('the wheels ride the road top, never through it', async () => {
    // The scenarios' floor-penetration check reads the station floor at
    // 0.25, so nothing there bounds a wheel burying into the raised
    // road. Two bounds, because the road legitimately has holes: over
    // solid course the tread's lowest point stays at the road top
    // within one impact-burial tolerance, and even inside a pothole it
    // never nears the base course — the designed dip is 0.052 or
    // 0.125 m of rim riding the slot corners, not a fall to the slot
    // floor.
    const samples = await rideRun(station, 'cart-drive');
    const roadTop = 0.75;
    const potholeFloor = 0.5;
    const radius = 0.625;
    const nearPothole = (x: number): boolean =>
      CART_ROAD_POTHOLES_V1.some((pothole) => {
        const west = -3 + pothole.atVoxel * 0.25;
        const east = west + pothole.widthVoxels * 0.25;
        return x > west - radius && x < east + radius;
      });
    let lowestOnCourse = Number.POSITIVE_INFINITY;
    let lowestAnywhere = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      if (sample.tick < solverTicksForSecondsV1(0.5)) continue;
      if (sample.wheelX < -1 || sample.wheelX > 9.5) continue;
      const bottom = sample.wheelY - radius;
      lowestAnywhere = Math.min(lowestAnywhere, bottom);
      if (!nearPothole(sample.wheelX)) {
        lowestOnCourse = Math.min(lowestOnCourse, bottom);
      }
    }
    expect(lowestOnCourse).toBeGreaterThan(roadTop - 0.03);
    expect(lowestAnywhere).toBeGreaterThan(potholeFloor - 0.03);
  }, 240_000);
});

describe('limits and motors are load-bearing, by subtraction', () => {
  it('the slam overruns the declared travel once the limits are stripped', async () => {
    // Measured, not inferred from a failing check: an earlier version
    // stripped the limits from the station and asserted the travel
    // checks failed — but they failed in the missing-declaration branch
    // before a single frame was judged, so a builder that silently
    // dropped the limits would have left that counter-run green. This
    // one runs the stripped world and reads the coordinate: the slam
    // must overrun the bound the declared stop holds it to.
    const stripped = await rideRun(station, 'cart-drop-slam', {
      stripLimits: true,
    });
    const limited = await rideRun(station, 'cart-drop-slam');
    const strippedPeak = Math.max(
      ...stripped.flatMap((sample) => sample.coords));
    const limitedPeak = Math.max(
      ...limited.flatMap((sample) => sample.coords));
    // Measured 0.424 stripped against 0.295 caught.
    expect(strippedPeak).toBeGreaterThan(
      CART_SUSPENSION_TRAVEL_V1 + CART_SLAM_TRAVEL_SLOP_V1);
    expect(limitedPeak).toBeLessThan(strippedPeak - 0.05);
  }, 240_000);

  it('the slam within limits actually reaches the stops', async () => {
    // Guards the counter-run against decay into vacuity: if a future
    // spring change absorbs the slam before the stop engages, the limit
    // check would pass without the limit doing anything, and the stripped
    // run above would be the only thing noticing.
    const samples = await rideRun(station, 'cart-drop-slam');
    const peak = Math.max(...samples.flatMap((sample) => sample.coords));
    expect(peak).toBeGreaterThan(CART_SUSPENSION_TRAVEL_V1);
  }, 240_000);

  it('the servo overruns the steering stops once the limits are stripped', async () => {
    // The revolute twin of the slam counter-run, and the reason the
    // builder applies limits through the runtime setLimits path: in the
    // installed Rapier, declarative revolute limits are silently ignored,
    // so only a measured overrun distinguishes a working stop from a
    // decorative declaration. The scenario shoves the servo to 1.2 rad
    // against stops at 0.7.
    const stripped = await rideRun(station, 'cart-steer-lock', {
      stripLimits: true,
    });
    const limited = await rideRun(station, 'cart-steer-lock');
    const strippedPeak = Math.max(...stripped.flatMap(
      (sample) => sample.steer.map((angle) => Math.abs(angle))));
    const limitedPeak = Math.max(...limited.flatMap(
      (sample) => sample.steer.map((angle) => Math.abs(angle))));
    expect(strippedPeak).toBeGreaterThan(
      CART_STEER_LOCK_V1 + CART_STEER_LOCK_SLOP_V1);
    expect(limitedPeak).toBeLessThan(strippedPeak - 0.1);
  }, 240_000);

  it('the overdriven servo actually reaches the steering stops', async () => {
    // The same vacuity guard the slam has: if a future servo change
    // stops short of the stops, the limit check would pass with the
    // limit idle.
    const samples = await rideRun(station, 'cart-steer-lock');
    const peak = Math.max(...samples.flatMap(
      (sample) => sample.steer.map((angle) => Math.abs(angle))));
    expect(peak).toBeGreaterThan(CART_STEER_LOCK_V1);
  }, 240_000);

  it('a left-lock command steers negative coordinates and drifts the cart to +z', async () => {
    // Every other steering assertion is magnitude-only — symmetric
    // limits, absolute peaks — so a global sign flip in the coordinate
    // reader, the servo command, or the convention comment would pass
    // the whole suite. This is the one signed pin: the circle commands
    // -0.7, the hinges must sit negative, and the cart must come round
    // to the +z (left) side of the road.
    const samples = await rideRun(station, 'cart-circle');
    const settled = samples.filter(
      (sample) => sample.tick > solverTicksForSecondsV1(2));
    const meanSteer = settled.reduce(
      (sum, sample) => sum
        + sample.steer.reduce((inner, angle) => inner + angle, 0)
        / sample.steer.length,
      0) / settled.length;
    expect(meanSteer).toBeLessThan(-0.3);
    const peakZ = Math.max(...samples.map((sample) => sample.chassisZ));
    expect(peakZ).toBeGreaterThan(4);
  }, 240_000);

  it('stripping the axle motors parks the cart', async () => {
    const samples = await rideRun(station, 'cart-drive', { stripMotors: true });
    const last = samples[samples.length - 1]!;
    const start = -1.5;
    expect(Math.abs(last.chassisX - start)).toBeLessThan(1);
  }, 240_000);
});

describe('the twin forgets a released body, like the live lane', () => {
  it('bearing friction stops when the last joint lets go', async () => {
    await initPlaygroundRapierV1();
    const world = PlaygroundWorldV1.create(station);
    try {
      // The laws are applied inside step(), so the held reading needs one.
      world.step();
      const before = world.angularDampingOfV1('carrier-fl');
      // A front carrier is held by two joints since steering landed —
      // spring and kingpin; the axle moved to the knuckle — and the
      // bearing law must persist until the LAST one lets go, which is
      // exactly what this test is for.
      world.detachJoint('suspension-fl');
      world.detachJoint('kingpin-fl');
      world.step();
      const after = world.angularDampingOfV1('carrier-fl');
      // Wood: air spin 0.02 + bearing 0.8 while held; air alone once free
      // (the carrier's collider is policy-inert, so no rolling term).
      expect(before).toBeCloseTo(0.82, 5);
      expect(after).toBeCloseTo(0.02, 5);
    } finally {
      world.free();
    }
  }, 120_000);
});

describe('the cart ledger against the live station', () => {
  // Same hole the trebuchet's ledger test closes: a `provenBy` string is
  // free text, so a binding can name a scenario that asserts nothing of
  // the kind. Every vitest binding must name a scenario this station
  // declares or point at this test file, and every scenario must be
  // named by something.
  const graph = createCartPurposeGraphV1();
  const scenarioIds = new Set(station.scenarios.map((entry) => entry.id));

  function vitestProofIds(): readonly string[] {
    return graph.nodes
      .map((node) => node.evidence)
      .filter((evidence) => evidence.kind === 'bound')
      .map((evidence) => evidence.proofId)
      .filter((proofId) => proofId.startsWith('vitest '));
  }

  it('binds only to scenarios this station declares', () => {
    for (const proofId of vitestProofIds()) {
      const named = [...scenarioIds].filter((id) => proofId.includes(id));
      expect(
        named.length > 0 || proofId.includes('playground-cart.test.ts'),
        `'${proofId}' names no scenario this station declares`,
      ).toBe(true);
    }
  });

  it('leaves no scenario unclaimed by the ledger', () => {
    const allProofs = vitestProofIds().join(' | ');
    for (const id of scenarioIds) {
      expect(allProofs.includes(id), `no ledger node cites '${id}'`)
        .toBe(true);
    }
  });

  it('states an open obligation where nothing proves the claim', () => {
    // The powered-energy hole is real: nothing meters the motor's
    // injection while it drives. A ledger in which everything is 'bound'
    // is the smell this guards against.
    const open = graph.nodes.filter((node) => node.evidence.kind === 'open');
    expect(open.length, 'something here should still be unproven')
      .toBeGreaterThan(0);
    for (const node of open) {
      const evidence = node.evidence;
      if (evidence.kind !== 'open') continue;
      expect(evidence.wouldBeClosedBy.length,
        `${node.id} must say what would close it`).toBeGreaterThan(20);
    }
  });
});

describe('drawn geometry and declared constraints tell one story', () => {
  it('the wheel spec carries the smooth tread its drawn disc implies', () => {
    const specs = playgroundBodySpecsV1(station);
    for (const corner of ['fl', 'fr', 'rl', 'rr']) {
      const wheel = specs.get(`wheel-${corner}`)!;
      expect(wheel.cylinderZ).toStrictEqual({ radius: 0.625, halfWidth: 0.25 });
      // The drawn wheel is the 13-cell plus disc through two layers: its
      // farthest drawn corner reaches 0.637 m against the 0.625 m tread,
      // so the drawn wheel never visibly enters the drawn road.
      expect(wheel.voxelCount).toBe(26);
    }
  });

  it('suspension anchors sit at the chassis corners, axles at wheel centres', () => {
    const specs = playgroundBodySpecsV1(station);
    const chassis = specs.get('chassis')!;
    const tolerance = 1e-9;
    for (const joint of station.joints ?? []) {
      const a = specs.get(joint.a)!;
      const b = specs.get(joint.b)!;
      if (joint.kind === 'prismatic') {
        // anchorA on the chassis resolves to the carrier's build centre —
        // the joint coordinate opens at zero, so the declared limits mean
        // travel from the drawn pose, not from an arbitrary origin.
        for (const axisIndex of [0, 1, 2] as const) {
          expect(Math.abs(
            chassis.centre[axisIndex] + joint.anchorA[axisIndex]
            - b.centre[axisIndex],
          )).toBeLessThan(0.011 + tolerance);
        }
      } else if (joint.id.startsWith('kingpin-')) {
        // Both kingpin anchors resolve to the wheel's build centre: the
        // steering axis passes through the wheel, not through either of
        // the bodies it joins, so the tread never scrubs sideways.
        const wheel = specs.get(`wheel-${joint.id.slice('kingpin-'.length)}`)!;
        for (const axisIndex of [0, 1, 2] as const) {
          expect(Math.abs(
            a.centre[axisIndex] + joint.anchorA[axisIndex]
            - wheel.centre[axisIndex],
          )).toBeLessThan(0.011 + tolerance);
          expect(Math.abs(
            b.centre[axisIndex] + joint.anchorB[axisIndex]
            - wheel.centre[axisIndex],
          )).toBeLessThan(0.011 + tolerance);
        }
      } else {
        // anchorA on the axle's hub body resolves to the wheel's build
        // centre — the carrier behind, or the steering knuckle in front.
        for (const axisIndex of [0, 1, 2] as const) {
          expect(Math.abs(
            a.centre[axisIndex] + joint.anchorA[axisIndex]
            - b.centre[axisIndex],
          )).toBeLessThan(0.011 + tolerance);
        }
      }
    }
  });

  it('the road cuts exactly the declared potholes through its top course', () => {
    const specs = playgroundBodySpecsV1(station);
    const road = specs.get('road')!;
    // 52x12 base + top course minus the cut cells.
    const holeCells = CART_ROAD_POTHOLES_V1.reduce(
      (total, pothole) => total
        + pothole.widthVoxels * (pothole.side === 'full' ? 12 : 6),
      0);
    expect(road.voxelCount).toBe(52 * 12 * 2 - holeCells);
  });

  it('the live profile carries the contact policy and both motor kinds', () => {
    const profile =
      createPhysicsPlaygroundProfilesV1()['studio:scene:physics-cart'];
    expect(profile).toBeDefined();
    expect(profile!.contactPolicy?.pairs.length).toBe(52);
    const joints = profile!.joints ?? [];
    for (const id of ['axle-fl', 'axle-fr']) {
      expect(
        joints.find((joint) => joint.id === id)?.motorVelocity,
        `${id} must roll free: driven front wheels understeer off the field`,
      ).toBeUndefined();
    }
    for (const id of ['kingpin-fl', 'kingpin-fr']) {
      const kingpin = joints.find((joint) => joint.id === id);
      expect(kingpin?.motorPosition, `${id} carries the steering servo`)
        .toBeDefined();
      expect(kingpin?.limits, `${id} carries the steering stops`)
        .toStrictEqual([-CART_STEER_LOCK_V1, CART_STEER_LOCK_V1]);
    }
    const suspension = joints.filter(
      (joint) => CART_SUSPENSION_JOINT_IDS_V1.includes(joint.id));
    const axles = joints.filter(
      (joint) => CART_AXLE_JOINT_IDS_V1.includes(joint.id));
    expect(suspension.length).toBe(4);
    expect(axles.length).toBe(4);
    for (const joint of suspension) {
      expect(joint.kind).toBe('prismatic');
      expect(joint.limits).toStrictEqual(
        [-CART_SUSPENSION_TRAVEL_V1, CART_SUSPENSION_TRAVEL_V1]);
      expect(joint.motorPosition).toBeDefined();
    }
    for (const joint of axles) {
      expect(joint.kind).toBe('revolute');
      // Rear axles carry the drive; front axles roll free for steering
      // grip, asserted by id above.
      expect(joint.motorVelocity !== undefined)
        .toBe(CART_DRIVE_JOINT_IDS_V1.includes(joint.id));
    }
  });
});
