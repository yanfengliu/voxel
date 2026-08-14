import { solverTicksForSecondsV1 } from './solver-rate.js';
import type {
  PlaygroundBodySpecV1,
} from './physics-playground-bodies.js';
import {
  PLAYGROUND_GRAVITY_V1,
  PLAYGROUND_TIMESTEP_S_V1,
} from './physics-playground-materials.js';
import {
  PLAYGROUND_FLOOR_TOP_V1,
  type PlaygroundCheckRefV1,
  type PlaygroundScenarioV1,
  type PlaygroundStationV1,
} from './physics-playground-stations.js';

/**
 * Size note: this module passed 700 lines when the two conservation laws
 * landed. Energy and momentum are a check family of their own, which is
 * the recorded extraction trigger: the plan is physics-playground-laws.ts
 * for the conservation checks the next time a law is added, keeping the
 * geometric checks here.
 *
 * Scenario evaluation over recorded solver frames.
 *
 * Pure data in, pure verdicts out. Today the headless fixture runner is
 * the one consumer; an in-studio "run scenario" action is deferred and
 * would feed the same frames through the same checks. Every failure
 * message names the body, the measured value, and the expectation — a
 * verdict that sends someone to the source to learn what went wrong is
 * itself a defect.
 *
 * Floor penetration is measured exactly: each body's lowest world point is
 * the minimum over its rotated collider-box corners (or sphere bottom), so
 * a tilted beam is judged by its actual geometry, not a bounding guess.
 *
 * Ratchet note: this file passed 500 lines when the trebuchet added swept
 * rotation and windowed peak speed. Both belong beside the other verdicts
 * because they share the frame-walking and message conventions, and the
 * exhaustive switch is what forces a new check to be implemented rather
 * than silently ignored. The recorded extraction plan is to split the
 * verdict vocabulary from the evaluator (`-check-kinds.ts` beside
 * `-checks.ts`) the first time a station needs a check family of its own.
 */

export interface PlaygroundBodySnapshotV1 {
  readonly placementId: string;
  readonly translation: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly linearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
  readonly sleeping: boolean;
  readonly mass: number;
  /**
   * Principal moments of inertia and the rotation from the body frame
   * into those principal axes. Both are needed to state rotational
   * energy honestly: a compound of offset boxes has no reason for its
   * inertia tensor to be diagonal in the body frame.
   */
  readonly principalInertia: readonly [number, number, number];
  readonly principalInertiaFrame: readonly [number, number, number, number];
}

export interface PlaygroundFrameV1 {
  readonly tick: number;
  readonly bodies: readonly PlaygroundBodySnapshotV1[];
}

export interface PlaygroundCheckResultV1 {
  readonly check: string;
  readonly status: 'pass' | 'fail';
  readonly detail: string;
}

export interface PlaygroundScenarioResultV1 {
  readonly scenarioId: string;
  readonly sceneId: string;
  readonly ticks: number;
  /**
   * The verdict, from the checks alone.
   *
   * It used to be `failed ? 'fail' : slow ? 'warn' : 'pass'`, which made a
   * wall-clock measurement part of a result that is otherwise a pure function
   * of the physics — the same scenario could return `pass` or `warn` on
   * identical inputs depending on host scheduling, and the determinism test
   * had to tolerate that. Timing is still reported, in `maxStepMs`,
   * `meanStepMs`, and `timingNote`; it is no longer a verdict input, which is
   * what the field below always claimed.
   */
  readonly status: 'pass' | 'fail';
  readonly checks: readonly PlaygroundCheckResultV1[];
  readonly finalBodies: readonly PlaygroundBodySnapshotV1[];
  /** Count of non-finite numbers seen across every sampled frame. */
  readonly nonFiniteSamples: number;
  /** Deepest measured dip below the floor top across all frames, meters. */
  readonly maxFloorPenetration: number;
  /**
   * Deepest overlap while a body was still moving fast — a landing, not a
   * rest. Bounded by one step of travel at the impact speed, which is what a
   * discrete solver must let through before it sees the contact at all.
   */
  readonly maxImpactBurial: number;
  /** Wall-clock stepping cost; reported, never part of the verdict inputs. */
  readonly maxStepMs: number;
  readonly meanStepMs: number;
  /** Set when timing exceeded the reporting budget — a warning, not a failure. */
  readonly timingNote?: string;
}

function rotate(
  quaternion: readonly [number, number, number, number],
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  const [qx, qy, qz, qw] = quaternion;
  const [vx, vy, vz] = vector;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

/** Hamilton product `a*b`: the rotation `b` applied first, then `a`. */
function multiplyQuaternion(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Rotates a world vector into the frame the quaternion describes. */
function rotateByInverse(
  quaternion: readonly [number, number, number, number],
  vector: readonly [number, number, number],
): readonly [number, number, number] {
  const [qx, qy, qz, qw] = quaternion;
  return rotate([-qx, -qy, -qz, qw], vector);
}

/** The lowest world-space point of a body's colliders at a pose. */
export function playgroundLowestPointV1(
  spec: PlaygroundBodySpecV1,
  snapshot: PlaygroundBodySnapshotV1,
): number {
  if (spec.ballRadius !== undefined) {
    return snapshot.translation[1] - spec.ballRadius;
  }
  let lowest = Number.POSITIVE_INFINITY;
  for (const box of spec.boxes) {
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const corner = rotate(snapshot.quaternion, [
            box.at[0] + sx * box.half[0],
            box.at[1] + sy * box.half[1],
            box.at[2] + sz * box.half[2],
          ]);
          const y = snapshot.translation[1] + corner[1];
          if (y < lowest) lowest = y;
        }
      }
    }
  }
  return lowest;
}

function speed(snapshot: PlaygroundBodySnapshotV1): number {
  const [x, y, z] = snapshot.linearVelocity;
  return Math.sqrt(x * x + y * y + z * z);
}

function travel(
  first: PlaygroundBodySnapshotV1,
  last: PlaygroundBodySnapshotV1,
): number {
  const dx = last.translation[0] - first.translation[0];
  const dy = last.translation[1] - first.translation[1];
  const dz = last.translation[2] - first.translation[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function frameBody(
  frame: PlaygroundFrameV1,
  placementId: string,
): PlaygroundBodySnapshotV1 | undefined {
  return frame.bodies.find((body) => body.placementId === placementId);
}

function requireBody(
  frame: PlaygroundFrameV1,
  placementId: string,
  check: string,
): PlaygroundBodySnapshotV1 {
  const body = frameBody(frame, placementId);
  if (!body) {
    throw new Error(
      `Check '${check}' names body '${placementId}', but the recorded frame `
      + `at tick ${String(frame.tick)} has no such body. Either the station `
      + 'definition dropped it or the scenario removed it before this check '
      + 'expected to read it.',
    );
  }
  return body;
}

/**
 * The body's first recorded snapshot. Spawned bodies do not exist at frame
 * zero, so travel is always measured from first appearance.
 */
function firstAppearance(
  frames: readonly PlaygroundFrameV1[],
  placementId: string,
  check: string,
): PlaygroundBodySnapshotV1 {
  for (const frame of frames) {
    const body = frameBody(frame, placementId);
    if (body) return body;
  }
  throw new Error(
    `Check '${check}' names body '${placementId}', but it never appears in `
    + 'the recorded frames — its spawn case never fired or the station '
    + 'definition dropped it.',
  );
}

function countNonFinite(frames: readonly PlaygroundFrameV1[]): number {
  let count = 0;
  for (const frame of frames) {
    for (const body of frame.bodies) {
      const values = [
        ...body.translation, ...body.quaternion,
        ...body.linearVelocity, ...body.angularVelocity, body.mass,
      ];
      for (const value of values) {
        if (!Number.isFinite(value)) count += 1;
      }
    }
  }
  return count;
}

/** How far a body ever got from where it started, across sampled frames. */
function farthestReach(
  frames: readonly PlaygroundFrameV1[],
  placementId: string,
  start: PlaygroundBodySnapshotV1,
): number {
  let farthest = 0;
  for (const frame of frames) {
    const body = frameBody(frame, placementId);
    if (body) farthest = Math.max(farthest, travel(start, body));
  }
  return farthest;
}

function evaluateCheck(
  ref: PlaygroundCheckRefV1,
  frames: readonly PlaygroundFrameV1[],
  specs: ReadonlyMap<string, PlaygroundBodySpecV1>,
): PlaygroundCheckResultV1 {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) {
    return {
      check: ref.check,
      status: 'fail',
      detail: 'The scenario recorded no frames, so nothing can be checked. '
        + 'The runner must record at least the opening and final frames.',
    };
  }
  const pass = (detail: string): PlaygroundCheckResultV1 =>
    ({ check: ref.check, status: 'pass', detail });
  const fail = (detail: string): PlaygroundCheckResultV1 =>
    ({ check: ref.check, status: 'fail', detail });

  switch (ref.check) {
    case 'settles-on-floor': {
      for (const id of ref.placementIds) {
        const spec = specs.get(id);
        const body = requireBody(last, id, ref.check);
        if (!spec) return fail(`No body spec exists for '${id}'.`);
        const lowest = playgroundLowestPointV1(spec, body);
        const gap = lowest - ref.floorTopY;
        if (gap > 0.15) {
          return fail(
            `'${id}' ended ${gap.toFixed(3)} m above the floor top — it `
            + 'never landed. A falling body must reach the floor.',
          );
        }
        const bodySpeed = speed(body);
        if (bodySpeed > 0.15) {
          return fail(
            `'${id}' is still moving at ${bodySpeed.toFixed(3)} m/s at the `
            + 'final tick — it landed but never came to rest.',
          );
        }
      }
      return pass(
        `All of [${ref.placementIds.join(', ')}] rest on the floor within `
        + '0.15 m and 0.15 m/s.',
      );
    }
    case 'no-floor-penetration': {
      // Two different claims used to share one number, and the number was
      // measuring the wrong one. "A resting body must not sink into the
      // ground" is a statement about contact quality. "A body arriving at ten
      // metres a second must not bury itself" is a statement about what a
      // discrete step can resolve, and it is proportional to the step by
      // construction: one tick of unopposed travel at the impact speed. At
      // 240 Hz the two happened to sit either side of the same tolerance, so
      // one number appeared to cover both; at 60 Hz a landing buries four
      // times deeper, tripped the gate, and the failure message blamed
      // resting contact — which measured 0.0013 m, identically at both rates.
      //
      // So they are judged apart. Resting depth is held to the declared
      // tolerance. Impact burial is allowed up to one step's travel, which is
      // what the solver must do, and is then required to RECOVER: a body that
      // stays buried has genuinely fallen through, and that is the failure
      // this check exists to catch.
      // Resting means slow and having STAYED slow. A body is momentarily slow
      // at the top of its rebound a few milliseconds after landing, still deep
      // in the floor and still recovering; counting that instant as rest put
      // the impact back into the resting number under a different name.
      const restingSpeed = 0.1;
      const restingForSeconds = 0.2;
      const recoverySeconds = 0.25;
      const slowSince = new Map<string, number>();
      let deepestResting = 0;
      let restingCulprit = '';
      let deepestImpact = 0;
      let impactCulprit = '';
      const buriedSince = new Map<string, number>();
      let strandedDetail = '';
      for (const frame of frames) {
        for (const body of frame.bodies) {
          const spec = specs.get(body.placementId);
          if (spec?.kind !== 'dynamic') continue;
          const dip = ref.floorTopY - playgroundLowestPointV1(spec, body);
          const speed = Math.hypot(...body.linearVelocity);
          if (speed <= restingSpeed) {
            const since = slowSince.get(body.placementId) ?? frame.tick;
            slowSince.set(body.placementId, since);
            const restedFor = (frame.tick - since) * PLAYGROUND_TIMESTEP_S_V1;
            if (restedFor >= restingForSeconds && dip > deepestResting) {
              deepestResting = dip;
              restingCulprit = `'${body.placementId}' at tick ${String(frame.tick)}`;
            }
          } else if ((slowSince.delete(body.placementId), dip > deepestImpact)) {
            deepestImpact = dip;
            impactCulprit = `'${body.placementId}' at tick ${String(frame.tick)} `
              + `arriving at ${speed.toFixed(1)} m/s`;
          }
          // One step of unopposed travel at this speed is the most a discrete
          // solver can let through before it sees the contact at all.
          const oneStep = speed * PLAYGROUND_TIMESTEP_S_V1;
          const buried = dip > Math.max(ref.toleranceMeters, oneStep);
          const since = buriedSince.get(body.placementId);
          if (!buried) {
            buriedSince.delete(body.placementId);
          } else if (since === undefined) {
            buriedSince.set(body.placementId, frame.tick);
          } else if (
            (frame.tick - since) * PLAYGROUND_TIMESTEP_S_V1 > recoverySeconds
            && strandedDetail === ''
          ) {
            strandedDetail = `'${body.placementId}' stayed more than one step `
              + `deep in the floor from tick ${String(since)} through `
              + `${String(frame.tick)} — over ${String(recoverySeconds)} s. `
              + 'That is falling through, not an impact the solver recovers from.';
          }
        }
      }
      if (strandedDetail !== '') return fail(strandedDetail);
      if (deepestResting > ref.toleranceMeters) {
        return fail(
          `${restingCulprit} rested ${deepestResting.toFixed(4)} m below the `
          + `floor top; the tolerance is ${String(ref.toleranceMeters)} m. `
          + 'Resting contact is leaking through the floor.',
        );
      }
      return pass(
        `Deepest resting dip was ${deepestResting.toFixed(4)} m, within the `
        + `${String(ref.toleranceMeters)} m tolerance`
        + (deepestImpact > 0
          ? `; deepest impact burial ${deepestImpact.toFixed(4)} m (${
            impactCulprit}), recovered within ${String(recoverySeconds)} s.`
          : '.'),
      );
    }
    case 'equal-fall-acceleration': {
      const touchTicks: number[] = [];
      for (const id of ref.placementIds) {
        const spec = specs.get(id);
        if (!spec) return fail(`No body spec exists for '${id}'.`);
        let touch: number | undefined;
        for (const frame of frames) {
          const body = frameBody(frame, id);
          if (!body) continue;
          if (playgroundLowestPointV1(spec, body) <= 0.27) {
            touch = frame.tick;
            break;
          }
        }
        if (touch === undefined) {
          return fail(`'${id}' never reached the floor, so fall time cannot be compared.`);
        }
        touchTicks.push(touch);
      }
      const [a, b] = touchTicks;
      if (a === undefined || b === undefined) {
        return fail('The check needs exactly two bodies to compare.');
      }
      if (a === 0 && b === 0) {
        return fail(
          'Both bodies were already touching the floor at tick zero, so no '
          + 'fall exists to compare. Raise their drop height.',
        );
      }
      // Touchdown ticks come from the runner's sampled frames, so this
      // resolves to one snapshot stride, not one solver tick.
      const ratio = Math.abs(a - b) / Math.max(a, b);
      if (ratio > ref.toleranceRatio) {
        return fail(
          `Touch-down ticks differ by ${(ratio * 100).toFixed(1)} % `
          + `(${String(a)} vs ${String(b)}); gravity must accelerate unequal `
          + `masses equally within ${String(ref.toleranceRatio * 100)} %.`,
        );
      }
      return pass(
        `Touch-down ticks ${String(a)} and ${String(b)} agree within `
        + `${(ratio * 100).toFixed(2)} % — fall acceleration is mass-independent.`,
      );
    }
    case 'mass-ordering': {
      const heavier = requireBody(last, ref.heavier, ref.check);
      const lighter = requireBody(last, ref.lighter, ref.check);
      if (heavier.mass <= lighter.mass) {
        return fail(
          `'${ref.heavier}' weighs ${heavier.mass.toFixed(2)} but `
          + `'${ref.lighter}' weighs ${lighter.mass.toFixed(2)} — the solid `
          + 'or denser body must be strictly heavier.',
        );
      }
      return pass(
        `'${ref.heavier}' (${heavier.mass.toFixed(2)}) outweighs `
        + `'${ref.lighter}' (${lighter.mass.toFixed(2)}).`,
      );
    }
    case 'holds-still': {
      for (const id of ref.placementIds) {
        const start = firstAppearance(frames, id, ref.check);
        const end = requireBody(last, id, ref.check);
        const drift = travel(start, end);
        if (drift > ref.maxDriftMeters) {
          return fail(
            `'${id}' drifted ${drift.toFixed(3)} m but must stay within `
            + `${String(ref.maxDriftMeters)} m — static friction or stacking `
            + 'stability is not holding.',
          );
        }
      }
      return pass(
        `All of [${ref.placementIds.join(', ')}] stayed within `
        + `${String(ref.maxDriftMeters)} m of their start.`,
      );
    }
    case 'slides-downhill': {
      for (const id of ref.placementIds) {
        const start = firstAppearance(frames, id, ref.check);
        const end = requireBody(last, id, ref.check);
        const moved = travel(start, end);
        if (moved < ref.minTravelMeters) {
          return fail(
            `'${id}' moved only ${moved.toFixed(3)} m but the slope should `
            + `carry it at least ${String(ref.minTravelMeters)} m — kinetic `
            + 'friction is too strong or the block is stuck.',
          );
        }
      }
      return pass(
        `All of [${ref.placementIds.join(', ')}] slid at least `
        + `${String(ref.minTravelMeters)} m.`,
      );
    }
    case 'ends-behind': {
      const leader = requireBody(last, ref.leader, ref.check);
      const trailer = requireBody(last, ref.trailer, ref.check);
      const lead = (leader.translation[ref.axis] - trailer.translation[ref.axis])
        * ref.sign;
      const wanted = ref.minLeadMeters ?? 0.05;
      if (lead <= wanted) {
        return fail(
          `'${ref.leader}' should finish at least ${wanted.toFixed(2)} m `
          + `ahead of '${ref.trailer}' along axis ${String(ref.axis)}, but `
          + `leads by ${lead.toFixed(3)} m. Either the shapes are no longer `
          + 'separating, or the run-out ends before the leader does — a wall '
          + 'or an apron edge in the way truncates this gap.',
        );
      }
      return pass(
        `'${ref.leader}' finished ${lead.toFixed(3)} m ahead of `
        + `'${ref.trailer}' (at least ${wanted.toFixed(2)} m wanted).`,
      );
    }
    case 'crossed-plane': {
      // Convention: playground shots travel toward the negative axis, so
      // 'crossed' means the final coordinate sits below the threshold. A
      // future positive-travel station needs a direction field here, not a
      // silent reuse.
      const body = requireBody(last, ref.placementId, ref.check);
      const crossed = body.translation[ref.axis] < ref.threshold;
      // Axis 1 is down, so a plane below the floor means falling out of
      // the world; the horizontal axes mean a shot passing a wall. Saying
      // 'tunnel' for both sent a maintainer whose ice stopped on the floor
      // looking for a continuous-collision bug that was never involved.
      const passing = ref.axis === 1 ? 'fall past' : 'pass';
      const beyond = ref.axis === 1
        ? 'expected it to fall out of the world below that plane'
        : 'expected it to tunnel through (the documented no-CCD artifact)';
      if (ref.expect === 'crossed' && !crossed) {
        return fail(
          `'${ref.placementId}' stopped at `
          + `${body.translation[ref.axis].toFixed(3)} on axis `
          + `${String(ref.axis)} and never got ${passing} `
          + `${String(ref.threshold)} — ${beyond}. Something is holding it `
          + 'up that the run expects to be absent.',
        );
      }
      if (ref.expect === 'stopped' && crossed) {
        return fail(
          `'${ref.placementId}' reached `
          + `${body.translation[ref.axis].toFixed(3)} on axis `
          + `${String(ref.axis)}, beyond ${String(ref.threshold)} — `
          + (ref.axis === 1
            ? 'it fell out of the world when something should have held it.'
            : 'it tunneled through the wall despite continuous collision '
              + 'detection.'),
        );
      }
      return pass(
        `'${ref.placementId}' ${crossed ? 'crossed' : 'was stopped before'} `
        + `the ${String(ref.threshold)} plane, as expected.`,
      );
    }
    case 'moved-at-most': {
      // Also the farthest reach, which makes this the stricter reading: a
      // brick that is flung out and rolls back has still moved.
      const start = firstAppearance(frames, ref.placementId, ref.check);
      // Still required to exist at the end: a body that left the world has not
      // "moved at most" anything, it has gone.
      requireBody(last, ref.placementId, ref.check);
      const moved = farthestReach(frames, ref.placementId, start);
      if (moved > ref.maxTravelMeters) {
        return fail(
          `'${ref.placementId}' travelled ${moved.toFixed(3)} m, over the `
          + `${String(ref.maxTravelMeters)} m limit — it absorbed more `
          + 'momentum than the mass ratio allows.',
        );
      }
      return pass(
        `'${ref.placementId}' travelled ${moved.toFixed(3)} m, within `
        + `${String(ref.maxTravelMeters)} m.`,
      );
    }
    case 'moved-at-least': {
      // The greatest distance this body ever reached from where it started,
      // not where it happened to stop. The scenario's own comment already
      // rejected `crossed-plane` for reading a final position — "the ball
      // rebounds off the wall and rolls back up the field, so where it comes
      // to rest says nothing about how far it was thrown" — and this check
      // shared the flaw silently. A harder hit rebounds further and scored
      // lower, which is backwards.
      const start = firstAppearance(frames, ref.placementId, ref.check);
      requireBody(last, ref.placementId, ref.check);
      const moved = farthestReach(frames, ref.placementId, start);
      if (moved < ref.minTravelMeters) {
        return fail(
          `'${ref.placementId}' travelled only ${moved.toFixed(3)} m; the `
          + `scenario expects at least ${String(ref.minTravelMeters)} m — `
          + 'the impact or removal did not propagate.',
        );
      }
      return pass(
        `'${ref.placementId}' travelled ${moved.toFixed(3)} m, at least the `
        + `expected ${String(ref.minTravelMeters)} m.`,
      );
    }
    case 'flight-follows-known-forces': {
      // Integrate the known forces forward from the first sampled frame
      // in the window and compare with what the solver actually did.
      // Rapier applies linear damping as v <- (v + a*dt) / (1 + dt*c),
      // so the prediction uses exactly that form rather than a
      // continuous approximation of it.
      const window = frames.filter(
        (frame) => frame.tick >= solverTicksForSecondsV1(ref.fromSeconds) && frame.tick <= solverTicksForSecondsV1(ref.toSeconds));
      const first = window[0];
      const lastFrame = window[window.length - 1];
      if (first === undefined || lastFrame === undefined || window.length < 2) {
        return fail(
          `flight-follows-known-forces needs at least two sampled frames `
          + `between ticks ${String(solverTicksForSecondsV1(ref.fromSeconds))} and ${String(solverTicksForSecondsV1(ref.toSeconds))}, `
          + `but found ${String(window.length)}. Widen the window or lower `
          + 'the sampling stride.',
        );
      }
      const startBody = first.bodies.find(
        (row) => row.placementId === ref.placementId);
      const endBody = lastFrame.bodies.find(
        (row) => row.placementId === ref.placementId);
      if (startBody === undefined || endBody === undefined) {
        return fail(
          `flight-follows-known-forces names '${ref.placementId}', which has `
          + 'no body across the whole window; a flight test needs the body '
          + 'present at both ends.',
        );
      }
      const dt = PLAYGROUND_TIMESTEP_S_V1;
      const decay = 1 / (1 + dt * ref.airDrag);
      let px = startBody.linearVelocity[0];
      let py = startBody.linearVelocity[1];
      let pz = startBody.linearVelocity[2];
      for (let tick = first.tick; tick < lastFrame.tick; tick += 1) {
        px *= decay;
        py = (py + PLAYGROUND_GRAVITY_V1 * dt) * decay;
        pz *= decay;
      }
      const predicted: readonly [number, number, number] = [px, py, pz];
      const error = Math.hypot(
        endBody.linearVelocity[0] - predicted[0],
        endBody.linearVelocity[1] - predicted[1],
        endBody.linearVelocity[2] - predicted[2]);
      if (error > ref.toleranceMetersPerSecond) {
        return fail(
          `'${ref.placementId}' ended the flight window at `
          + `(${endBody.linearVelocity.map((v) => v.toFixed(2)).join(', ')}) `
          + `m/s, but gravity and air resistance alone predict `
          + `(${predicted.map((v) => v.toFixed(2)).join(', ')}) — an error of `
          + `${error.toFixed(3)} m/s against a ${String(ref.toleranceMetersPerSecond)} `
          + 'allowance. Something accelerated it that nothing declared.',
        );
      }
      return pass(
        `'${ref.placementId}' followed gravity and air resistance alone `
        + `across ticks ${String(first.tick)}-${String(lastFrame.tick)}, to `
        + `within ${error.toFixed(3)} m/s.`,
      );
    }
    case 'impulse-response': {
      const before = frames.filter((frame) => frame.tick <= solverTicksForSecondsV1(ref.atSeconds)).pop();
      const after = frames.find((frame) => frame.tick > solverTicksForSecondsV1(ref.atSeconds));
      if (before === undefined || after === undefined) {
        return fail(
          `impulse-response needs a sampled frame on each side of tick `
          + `${String(solverTicksForSecondsV1(ref.atSeconds))}; the run does not have both.`,
        );
      }
      const a = before.bodies.find((row) => row.placementId === ref.placementId);
      const b = after.bodies.find((row) => row.placementId === ref.placementId);
      if (a === undefined || b === undefined) {
        return fail(
          `impulse-response names '${ref.placementId}', which has no body on `
          + 'both sides of the impulse.',
        );
      }
      // The frames straddle the impulse, so gravity acts over that gap
      // too; subtract its exact contribution before judging the impulse.
      const gap = (after.tick - before.tick) * PLAYGROUND_TIMESTEP_S_V1;
      const predicted: readonly [number, number, number] = [
        a.linearVelocity[0] + ref.impulse[0] / a.mass,
        a.linearVelocity[1] + ref.impulse[1] / a.mass + PLAYGROUND_GRAVITY_V1 * gap,
        a.linearVelocity[2] + ref.impulse[2] / a.mass,
      ];
      const magnitude = Math.hypot(
        ref.impulse[0] / a.mass, ref.impulse[1] / a.mass, ref.impulse[2] / a.mass);
      const error = Math.hypot(
        b.linearVelocity[0] - predicted[0],
        b.linearVelocity[1] - predicted[1],
        b.linearVelocity[2] - predicted[2]);
      const allowance = Math.max(1e-6, magnitude * ref.toleranceFraction);
      if (error > allowance) {
        return fail(
          `An impulse of ${JSON.stringify(ref.impulse)} on '${ref.placementId}' `
          + `(mass ${a.mass.toFixed(2)}) should change its velocity by `
          + `${magnitude.toFixed(3)} m/s, but the measured change misses the `
          + `prediction by ${error.toFixed(3)} m/s, past the `
          + `${allowance.toFixed(3)} allowance.`,
        );
      }
      return pass(
        `'${ref.placementId}' answered its impulse with the predicted `
        + `${magnitude.toFixed(3)} m/s change, to within ${error.toFixed(3)} m/s `
        + `— force divided by mass, exactly.`,
      );
    }
    case 'energy-never-increases': {
      // Total mechanical energy: translational plus rotational kinetic,
      // plus gravitational potential measured from y = 0. Rotational
      // energy is computed in the body's principal frame, because the
      // inertia tensor is only diagonal there.
      const only = ref.placementIds;
      const totalAt = (frame: PlaygroundFrameV1): number => {
        let total = 0;
        for (const body of frame.bodies) {
          const spec = specs.get(body.placementId);
          if (spec?.kind !== 'dynamic') continue;
          if (only !== undefined && !only.includes(body.placementId)) continue;
          const [vx, vy, vz] = body.linearVelocity;
          total += 0.5 * body.mass * (vx * vx + vy * vy + vz * vz);
          total += body.mass * Math.abs(PLAYGROUND_GRAVITY_V1) * body.translation[1];
          // World angular velocity into principal axes: rotate by the
          // inverse of (body rotation * principal frame).
          const q = multiplyQuaternion(body.quaternion, body.principalInertiaFrame);
          const w = rotateByInverse(q, body.angularVelocity);
          total += 0.5 * (
            body.principalInertia[0] * w[0] * w[0]
            + body.principalInertia[1] * w[1] * w[1]
            + body.principalInertia[2] * w[2] * w[2]);
        }
        return total;
      };
      // Frame to frame, not against the opening total. Comparing to the
      // opening looks stricter and is far weaker: a dissipating machine
      // sinks further below that fixed ceiling every second, so the
      // slack grows without bound and a mid-run injection hides inside
      // it. Measured on this trebuchet, the opening ceiling left 7,392 J
      // invisible by tick 600 — a 1,000 J kick passed. Requiring each
      // sampled total to be no greater than the previous one has no such
      // hole, because the ceiling follows the machine down.
      //
      // The set of bodies must be constant: a spawn adds real energy and
      // a removal takes it away, neither of which is the solver's doing.
      const counted = (frame: PlaygroundFrameV1): number => {
        let n = 0;
        for (const body of frame.bodies) {
          const spec = specs.get(body.placementId);
          if (spec?.kind !== 'dynamic') continue;
          if (only !== undefined && !only.includes(body.placementId)) continue;
          n += 1;
        }
        return n;
      };
      const openingCount = counted(frames[0]!);
      for (const frame of frames) {
        if (counted(frame) !== openingCount) {
          return fail(
            `The counted body set changes during this run (${String(openingCount)} `
            + `bodies at tick ${String(frames[0]!.tick)}, `
            + `${String(counted(frame))} at tick ${String(frame.tick)}). `
            + 'Conservation of energy is only meaningful over a fixed set, '
            + 'because a spawn brings its own energy and a removal takes '
            + 'energy away. Name the bodies explicitly with placementIds, '
            + 'or apply this check to a scenario that spawns and removes '
            + 'nothing.',
          );
        }
      }
      let worstGain = 0;
      let worstTick = frames[0]!.tick;
      let previous = totalAt(frames[0]!);
      const opening = previous;
      for (const frame of frames.slice(1)) {
        const total = totalAt(frame);
        const allowance = Math.abs(previous) * ref.toleranceFraction;
        const gain = total - previous;
        if (gain > allowance && gain / Math.max(1, Math.abs(previous)) > worstGain) {
          worstGain = gain / Math.max(1, Math.abs(previous));
          worstTick = frame.tick;
        }
        previous = total;
      }
      if (worstGain > 0) {
        return fail(
          `Mechanical energy rose ${(worstGain * 100).toFixed(2)}% from one `
          + `sampled frame to the next at tick ${String(worstTick)}; a `
          + 'passive machine has no source for that, so energy is entering '
          + `from somewhere. The per-frame allowance is `
          + `${(ref.toleranceFraction * 100).toFixed(0)}%.`,
        );
      }
      const closing = previous;
      return pass(
        `Mechanical energy never rose between sampled frames: `
        + `${opening.toFixed(0)} J at the start, ${closing.toFixed(0)} J at `
        + `the end, spent monotonically throughout.`,
      );
    }
    case 'momentum-conserved': {
      const at = (tick: number): PlaygroundFrameV1 => {
        let best = frames[0]!;
        for (const frame of frames) {
          if (Math.abs(frame.tick - tick) < Math.abs(best.tick - tick)) best = frame;
        }
        return best;
      };
      const before = at(solverTicksForSecondsV1(ref.fromSeconds));
      const after = at(solverTicksForSecondsV1(ref.toSeconds));
      const sum = (frame: PlaygroundFrameV1): readonly [number, number, number] => {
        let x = 0;
        let y = 0;
        let z = 0;
        for (const body of frame.bodies) {
          if (!ref.placementIds.includes(body.placementId)) continue;
          x += body.mass * body.linearVelocity[0];
          y += body.mass * body.linearVelocity[1];
          z += body.mass * body.linearVelocity[2];
        }
        return [x, y, z];
      };
      const missing = ref.placementIds.filter((id) =>
        !before.bodies.some((body) => body.placementId === id));
      if (missing.length > 0) {
        return fail(
          `momentum-conserved names ${missing.join(', ')}, which had no `
          + `body at tick ${String(before.tick)}; a momentum sum needs `
          + 'every named body present at both ends of the window.',
        );
      }
      const p0 = sum(before);
      const p1 = sum(after);
      // Gravity is the only outside force acting on the set, and its
      // impulse over the window is exactly (total mass) x g x dt.
      let totalMass = 0;
      for (const body of before.bodies) {
        if (ref.placementIds.includes(body.placementId)) totalMass += body.mass;
      }
      const seconds = (after.tick - before.tick) * PLAYGROUND_TIMESTEP_S_V1;
      const expectedY = p0[1] + totalMass * PLAYGROUND_GRAVITY_V1 * seconds;
      const drift = Math.hypot(p1[0] - p0[0], p1[1] - expectedY, p1[2] - p0[2]);
      const scale = Math.max(1e-6, Math.hypot(p0[0], p0[1], p0[2]));
      if (drift > scale * ref.toleranceFraction) {
        return fail(
          `Total momentum of ${ref.placementIds.join(', ')} drifted `
          + `${drift.toFixed(3)} between ticks ${String(before.tick)} and `
          + `${String(after.tick)}, past the `
          + `${(ref.toleranceFraction * 100).toFixed(0)}% allowance of `
          + `${(scale * ref.toleranceFraction).toFixed(3)} — after removing `
          + 'gravity, the collision gained or lost momentum from nowhere.',
        );
      }
      return pass(
        `Total momentum of ${ref.placementIds.join(', ')} held to `
        + `${drift.toFixed(3)} across the collision, once gravity's exact `
        + 'impulse is removed.',
      );
    }
    case 'all-finite': {
      const bad = countNonFinite(frames);
      if (bad > 0) {
        return fail(
          `${String(bad)} non-finite numbers appeared across the recorded `
          + 'frames — the solver produced NaN or infinity.',
        );
      }
      return pass('Every recorded value is finite.');
    }
    case 'all-asleep-or-slow': {
      const only = ref.placementIds;
      // Every trailing frame must be quiet, not merely the last one. A
      // swinging body passes through zero speed at each turning point,
      // so one frame cannot distinguish rest from the top of a swing.
      // A quarter second of quiet, stated in seconds so it stays a quarter
      // second at any rate. As a bare tick count it silently became a whole
      // second when the lane changed.
      const settledFor = solverTicksForSecondsV1(ref.settledForSeconds ?? 0.25);
      const cutoff = last.tick - settledFor;
      const trailing = frames.filter((frame) => frame.tick >= cutoff);
      // Angular speed counts too: a body spinning in place is not at
      // rest, and its centre may barely move while it does.
      const restless = (body: PlaygroundBodySnapshotV1): number => Math.max(
        speed(body), Math.hypot(...body.angularVelocity));
      for (const frame of trailing) {
        for (const body of frame.bodies) {
          const spec = specs.get(body.placementId);
          if (spec?.kind !== 'dynamic') continue;
          if (only !== undefined && !only.includes(body.placementId)) continue;
          const measure = restless(body);
          if (!body.sleeping && measure > ref.maxSpeed) {
            return fail(
              `'${body.placementId}' is awake at ${measure.toFixed(3)} `
              + `(m/s or rad/s, whichever is larger) at tick `
              + `${String(frame.tick)}; everything named must stay asleep `
              + `or under ${String(ref.maxSpeed)} for the whole final `
              + `${String(settledFor)} ticks, not merely on the last one.`,
            );
          }
        }
      }
      return pass(
        `${ref.placementIds === undefined
          ? 'Every dynamic body'
          : ref.placementIds.map((id) => `'${id}'`).join(', ')} stayed asleep `
        + `or under ${String(ref.maxSpeed)} across the final `
        + `${String(settledFor)} ticks.`,
      );
    }
    case 'peak-speed-at-least': {
      let peak = 0;
      const throughTick = ref.throughSeconds === undefined
        ? undefined
        : solverTicksForSecondsV1(ref.throughSeconds);
      for (const frame of frames) {
        if (throughTick !== undefined && frame.tick > throughTick) break;
        const body = frame.bodies.find(
          (row) => row.placementId === ref.placementId);
        if (body) peak = Math.max(peak, speed(body));
      }
      const window = throughTick === undefined
        ? 'across the sampled frames'
        : `across sampled frames through ${String(ref.throughSeconds)} s`;
      if (peak < ref.minSpeed) {
        return fail(
          `'${ref.placementId}' peaked at ${peak.toFixed(2)} m/s ${window}; `
          + `the scenario expects at least ${String(ref.minSpeed)} m/s.`,
        );
      }
      return pass(
        `'${ref.placementId}' peaked at ${peak.toFixed(2)} m/s ${window}, `
        + `at least the expected ${String(ref.minSpeed)} m/s.`,
      );
    }
    case 'rotated-at-least':
    case 'rotated-at-most': {
      firstAppearance(frames, ref.placementId, ref.check);
      // Total swept angle, accumulated frame to frame. Measuring the
      // attitude difference against the start instead — 2·acos(|dot|) —
      // silently folds at 180 degrees: a body parked at 350 degrees reads
      // as 0, and the no-sling arm's true 234-degree swing read as 179.
      // Summing per-frame deltas has no ceiling and cannot alias a
      // resting body into a passing 'barely moved' verdict.
      //
      // The per-frame delta is itself an under-read when a body turns
      // more than 180 degrees between two sampled frames; the sampling
      // stride is the honest bound, and the message says 'swept'.
      let degrees = 0;
      let previous: readonly [number, number, number, number] | null = null;
      for (const frame of frames) {
        const body = frame.bodies.find(
          (row) => row.placementId === ref.placementId);
        if (!body) continue;
        if (previous !== null) {
          const dot = Math.min(1, Math.abs(
            previous[0] * body.quaternion[0]
            + previous[1] * body.quaternion[1]
            + previous[2] * body.quaternion[2]
            + previous[3] * body.quaternion[3],
          ));
          degrees += (2 * Math.acos(dot) * 180) / Math.PI;
        }
        previous = body.quaternion;
      }
      if (ref.check === 'rotated-at-least' && degrees < ref.minDegrees) {
        return fail(
          `'${ref.placementId}' swept ${degrees.toFixed(1)}°, under the `
          + `expected ${String(ref.minDegrees)}° — the mechanism never `
          + 'swung.',
        );
      }
      if (ref.check === 'rotated-at-most' && degrees > ref.maxDegrees) {
        return fail(
          `'${ref.placementId}' swept ${degrees.toFixed(1)}°, over the `
          + `${String(ref.maxDegrees)}° limit — it moved without its `
          + 'declared power source.',
        );
      }
      return pass(
        `'${ref.placementId}' swept ${degrees.toFixed(1)}°, `
        + (ref.check === 'rotated-at-least'
          ? `at least the expected ${String(ref.minDegrees)}°.`
          : `within the ${String(ref.maxDegrees)}° limit.`),
      );
    }
    default: {
      const never: never = ref;
      throw new Error(`Unknown playground check: ${JSON.stringify(never)}`);
    }
  }
}

export interface PlaygroundTimingV1 {
  readonly maxStepMs: number;
  readonly meanStepMs: number;
}

/** Steps costlier than this get a timing note on the result. */
export const PLAYGROUND_STEP_BUDGET_MS_V1 = 50;

export function evaluatePlaygroundScenarioV1(
  station: PlaygroundStationV1,
  scenario: PlaygroundScenarioV1,
  specs: ReadonlyMap<string, PlaygroundBodySpecV1>,
  frames: readonly PlaygroundFrameV1[],
  timing: PlaygroundTimingV1,
): PlaygroundScenarioResultV1 {
  const checks = scenario.checks.map((ref) => evaluateCheck(ref, frames, specs));
  const nonFinite = countNonFinite(frames);
  // Reported apart for the same reason they are judged apart: the deepest
  // instant of a landing is not how far anything rests into the ground, and
  // one number that mixed them read as a contact defect when it was a body
  // arriving fast. `maxFloorPenetration` is now the resting figure — what the
  // name has always claimed — and the transient is reported beside it.
  let deepest = 0;
  let deepestImpact = 0;
  const slowSince = new Map<string, number>();
  for (const frame of frames) {
    for (const body of frame.bodies) {
      const spec = specs.get(body.placementId);
      if (spec?.kind !== 'dynamic') continue;
      const dip = PLAYGROUND_FLOOR_TOP_V1 - playgroundLowestPointV1(spec, body);
      if (Math.hypot(...body.linearVelocity) <= 0.1) {
        const since = slowSince.get(body.placementId) ?? frame.tick;
        slowSince.set(body.placementId, since);
        if ((frame.tick - since) * PLAYGROUND_TIMESTEP_S_V1 >= 0.2
          && dip > deepest) {
          deepest = dip;
        }
      } else {
        slowSince.delete(body.placementId);
        if (dip > deepestImpact) deepestImpact = dip;
      }
    }
  }
  const failed = checks.some((check) => check.status === 'fail');
  const slow = timing.maxStepMs > PLAYGROUND_STEP_BUDGET_MS_V1;
  const last = frames[frames.length - 1];
  return {
    scenarioId: scenario.id,
    sceneId: station.sceneId,
    ticks: solverTicksForSecondsV1(scenario.seconds),
    status: failed ? 'fail' : 'pass',
    checks,
    finalBodies: last ? last.bodies : [],
    nonFiniteSamples: nonFinite,
    maxFloorPenetration: deepest,
    maxImpactBurial: deepestImpact,
    maxStepMs: timing.maxStepMs,
    meanStepMs: timing.meanStepMs,
    ...(slow
      ? {
        timingNote: `The costliest solver step took `
          + `${timing.maxStepMs.toFixed(1)} ms, over the `
          + `${String(PLAYGROUND_STEP_BUDGET_MS_V1)} ms reporting budget — `
          + 'expected under the stress preset, worth investigating elsewhere.',
      }
      : {}),
  };
}
