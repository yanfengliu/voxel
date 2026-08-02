import {
  deterministicCosV1,
  deterministicSinV1,
} from './deterministic-trig.js';
import {
  WINDMILL_DISCARD_ROW_XS_V1,
  WINDMILL_DISCARD_ROW_Z_V1,
  WINDMILL_FLOUR_HEAP_LAYOUT_V1,
  WINDMILL_FLOUR_RISE_PER_IMPACT_V1,
  WINDMILL_MILL_SPOT_V1,
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
  WINDMILL_STAGING_X_V1,
  WINDMILL_WHEAT_QUEUE_XS_V1,
  WINDMILL_WHEAT_QUEUE_Z_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
} from './windmill-production-layout.js';

/**
 * Authored kinematic tracks for the Windmill production line, synthesized
 * from the recorded anvil-impact times and nothing else.
 *
 * Honesty boundary: these poses are presentation choreography keyed to the
 * committed consumer trace's impact events — the same pattern as Riverfall's
 * presentation constructs. Before an answered blow, the next wheat sack
 * slides from the visible infeed queue to the anvil-side milling spot; after
 * it, the spent sack tips over its own base edge, is set back behind the
 * milling line, and the flour level in the outfeed bin rises one step.
 * Nothing here simulates milling, grain, contact, friction, or mass flow,
 * and no value feeds back into the solver trace.
 *
 * Not every blow is answered. The magazine holds five sacks, and a sack
 * cannot take the milling spot while the one before it is still being
 * dragged clear — see `windmillMilledImpactsV1` for both rules and what
 * they cost.
 *
 * Determinism boundary: every operation is IEEE-exact (+, -, *, /, sqrt) or
 * routed through the repository's fixed-polynomial trigonometry, so the
 * committed generated replay regenerates byte-identically on any engine.
 */

export const WINDMILL_PRODUCTION_KINEMATICS_LABEL_V1 =
  'authored-grain-flour-presentation';

/** World units per second for every straight sack slide. */
const SLIDE_SPEED = 1.5;
/** A sack reaches the milling spot this long before its recorded impact. */
const ARRIVE_LEAD_SECONDS = 0.15;
/** The spent sack stays at the spot this long after its recorded impact. */
const DEPART_LAG_SECONDS = 0.25;
const ROLL_SECONDS = 0.6;
/** Flour rises over this window, starting just after each recorded impact. */
const FLOUR_RISE_START_LAG = 0.15;
const FLOUR_RISE_SECONDS = 0.4;

const SACK_GRAIN = WINDMILL_WHEAT_SACK_LAYOUT_V1.grain;
const SACK_HALF_WIDTH =
  (WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels[0] * SACK_GRAIN) / 2;
const SACK_HALF_HEIGHT =
  (WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels[1] * SACK_GRAIN) / 2;
/** Standing and lying center heights over the ground plane. */
const STAND_CENTER_Y = SACK_HALF_HEIGHT;
const LIE_CENTER_Y = SACK_HALF_WIDTH;
/** Distance from the roll pivot edge to the sack center. */
const ROLL_RADIUS = Math.sqrt(
  SACK_HALF_WIDTH * SACK_HALF_WIDTH + SACK_HALF_HEIGHT * SACK_HALF_HEIGHT,
);
const ROLL_COS_START = SACK_HALF_WIDTH / ROLL_RADIUS;
const ROLL_SIN_START = SACK_HALF_HEIGHT / ROLL_RADIUS;
/** Where a rolled sack's center lands: one half-height west of the spot. */
const LIE_X = WINDMILL_MILL_SPOT_V1[0] - SACK_HALF_WIDTH - SACK_HALF_HEIGHT;

const FLOUR_START_CENTER_Y = WINDMILL_FLOUR_HEAP_LAYOUT_V1.sceneAt[1]
  + (WINDMILL_FLOUR_HEAP_LAYOUT_V1.sizeVoxels[1]
    * WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain) / 2;
const FLOUR_X = WINDMILL_FLOUR_HEAP_LAYOUT_V1.sceneAt[0];
const FLOUR_Z = WINDMILL_FLOUR_HEAP_LAYOUT_V1.sceneAt[2];

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (value <= edge0) return 0;
  if (value >= edge1) return 1;
  const u = (value - edge0) / (edge1 - edge0);
  return u * u * (3 - 2 * u);
}

export interface WindmillProductionPoseV1 {
  readonly translation: readonly [number, number, number];
  /** XYZW unit rotation; sacks only ever turn about world +Z. */
  readonly quaternion: readonly [number, number, number, number];
  /** Roll angle about +Z in radians, kept for exact angular velocity. */
  readonly rollRadians: number;
}

interface SackScheduleV1 {
  readonly queueX: number;
  readonly discardX: number;
  readonly startMove: number;
  readonly stageAt: number;
  readonly arriveAt: number;
  readonly rollStart: number;
  readonly rollEnd: number;
  readonly hopEnd: number;
  readonly slideEnd: number;
}

/**
 * How long before its blow sack `index` must leave the queue.
 *
 * A live mill's blows are found, not scheduled, so a caller has to know
 * whether a sack can still make it before asking for its pose — the schedule
 * itself refuses an impossible one, and refusing is right, but a live scene
 * needs to ask first rather than be thrown at.
 */
export function windmillSackLeadSecondsV1(index: number): number {
  const queueX = WINDMILL_WHEAT_QUEUE_XS_V1[index];
  if (queueX === undefined) {
    throw new Error(
      `Cannot measure the lead for windmill wheat sack ${String(index + 1)}: the `
      + `layout declares only ${String(WINDMILL_WHEAT_QUEUE_XS_V1.length)} queue slots.`,
    );
  }
  const alongQueue = (WINDMILL_STAGING_X_V1 - queueX) / SLIDE_SPEED;
  const alongLane =
    (WINDMILL_MILL_SPOT_V1[1] - WINDMILL_WHEAT_QUEUE_Z_V1) / SLIDE_SPEED;
  return ARRIVE_LEAD_SECONDS + alongLane + alongQueue;
}

function sackSchedule(
  index: number,
  impactSeconds: number,
): SackScheduleV1 {
  const queueX = WINDMILL_WHEAT_QUEUE_XS_V1[index];
  const discardX = WINDMILL_DISCARD_ROW_XS_V1[index];
  if (queueX === undefined || discardX === undefined) {
    throw new Error(
      `Cannot schedule windmill wheat sack ${String(index + 1)}: the layout `
      + `declares only ${String(WINDMILL_WHEAT_QUEUE_XS_V1.length)} queue and `
      + `${String(WINDMILL_DISCARD_ROW_XS_V1.length)} discard slots.`,
    );
  }
  const alongQueue = (WINDMILL_STAGING_X_V1 - queueX) / SLIDE_SPEED;
  const alongLane =
    (WINDMILL_MILL_SPOT_V1[1] - WINDMILL_WHEAT_QUEUE_Z_V1) / SLIDE_SPEED;
  const arriveAt = impactSeconds - ARRIVE_LEAD_SECONDS;
  const stageAt = arriveAt - alongLane;
  const startMove = stageAt - alongQueue;
  const rollStart = impactSeconds + DEPART_LAG_SECONDS;
  const rollEnd = rollStart + ROLL_SECONDS;
  const hopEnd = rollEnd
    + (WINDMILL_DISCARD_ROW_Z_V1 - WINDMILL_MILL_SPOT_V1[1]) / SLIDE_SPEED;
  const slideEnd = hopEnd + (LIE_X - discardX) / SLIDE_SPEED;
  if (startMove < 0.05) {
    throw new Error(
      `Cannot schedule windmill wheat sack ${String(index + 1)}: it would `
      + `have to leave the queue at ${startMove.toFixed(3)} s to reach the `
      + `milling spot ${String(ARRIVE_LEAD_SECONDS)} s before its recorded `
      + `impact at ${impactSeconds.toFixed(3)} s. Increase the slide speed `
      + 'or accept a later arrival.',
    );
  }
  return {
    queueX,
    discardX,
    startMove,
    stageAt,
    arriveAt,
    rollStart,
    rollEnd,
    hopEnd,
    slideEnd,
  };
}

function lerpSmooth(
  from: number,
  to: number,
  edge0: number,
  edge1: number,
  time: number,
): number {
  return from + (to - from) * smoothstep(edge0, edge1, time);
}

/**
 * Where sack `index` stands while it waits its turn.
 *
 * A sack whose blow never came stays here for the whole window. That is a
 * pose the schedule cannot give, because a schedule needs a blow.
 */
export function windmillWheatSackQueuePoseV1(
  index: number,
): WindmillProductionPoseV1 {
  const queueX = WINDMILL_WHEAT_QUEUE_XS_V1[index];
  if (queueX === undefined) {
    throw new Error(
      `Cannot rest windmill wheat sack ${String(index + 1)} in the queue: the `
      + `layout declares only ${String(WINDMILL_WHEAT_QUEUE_XS_V1.length)} `
      + 'queue slots.',
    );
  }
  return {
    translation: [queueX, STAND_CENTER_Y, WINDMILL_WHEAT_QUEUE_Z_V1],
    quaternion: [0, 0, 0, 1],
    rollRadians: 0,
  };
}

/** The full authored pose of sack `index` at `time` seconds. */
export function windmillWheatSackPoseV1(
  index: number,
  impactSeconds: number,
  time: number,
): WindmillProductionPoseV1 {
  const schedule = sackSchedule(index, impactSeconds);
  const spotX = WINDMILL_MILL_SPOT_V1[0];
  const spotZ = WINDMILL_MILL_SPOT_V1[1];
  if (time <= schedule.rollStart) {
    // Queue rest, queue slide, lane slide, and the wait beside the anvil.
    const x = lerpSmooth(
      schedule.queueX,
      spotX,
      schedule.startMove,
      schedule.stageAt,
      time,
    );
    const z = lerpSmooth(
      WINDMILL_WHEAT_QUEUE_Z_V1,
      spotZ,
      schedule.stageAt,
      schedule.arriveAt,
      time,
    );
    return {
      translation: [x, STAND_CENTER_Y, z],
      quaternion: [0, 0, 0, 1],
      rollRadians: 0,
    };
  }
  if (time <= schedule.rollEnd) {
    // Tip the spent sack west over its own base edge; the center follows the
    // exact edge-pivot arc, so no corner ever passes below the ground plane.
    const progress = smoothstep(schedule.rollStart, schedule.rollEnd, time);
    const angle = (Math.PI / 2) * progress;
    const cos = deterministicCosV1(angle);
    const sin = deterministicSinV1(angle);
    const offsetX = ROLL_COS_START * cos - ROLL_SIN_START * sin;
    const offsetY = ROLL_SIN_START * cos + ROLL_COS_START * sin;
    const halfAngle = angle / 2;
    return {
      translation: [
        spotX - SACK_HALF_WIDTH + ROLL_RADIUS * offsetX,
        ROLL_RADIUS * offsetY,
        spotZ,
      ],
      quaternion: [
        0,
        0,
        deterministicSinV1(halfAngle),
        deterministicCosV1(halfAngle),
      ],
      rollRadians: angle,
    };
  }
  // Lying flat: the short set-back hop, then the slide into the spent row.
  const z = lerpSmooth(
    spotZ,
    WINDMILL_DISCARD_ROW_Z_V1,
    schedule.rollEnd,
    schedule.hopEnd,
    time,
  );
  const x = lerpSmooth(
    LIE_X,
    schedule.discardX,
    schedule.hopEnd,
    schedule.slideEnd,
    time,
  );
  const halfAngle = Math.PI / 4;
  return {
    translation: [x, LIE_CENTER_Y, z],
    quaternion: [
      0,
      0,
      deterministicSinV1(halfAngle),
      deterministicCosV1(halfAngle),
    ],
    rollRadians: Math.PI / 2,
  };
}

/** The flour level's center at `time`, one smooth step after each impact. */
export function windmillFlourPoseV1(
  impactsSeconds: readonly number[],
  time: number,
): WindmillProductionPoseV1 {
  let y = FLOUR_START_CENTER_Y;
  for (const impact of impactsSeconds) {
    y += WINDMILL_FLOUR_RISE_PER_IMPACT_V1 * smoothstep(
      impact + FLOUR_RISE_START_LAG,
      impact + FLOUR_RISE_START_LAG + FLOUR_RISE_SECONDS,
      time,
    );
  }
  return {
    translation: [FLOUR_X, y, FLOUR_Z],
    quaternion: [0, 0, 0, 1],
    rollRadians: 0,
  };
}

export interface WindmillProductionTrackV1 {
  readonly placementId: string;
  readonly translations: Float32Array;
  readonly quaternions: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
}

/**
 * How long the milling spot is occupied by one sack: from its arrival just
 * before the blow to the moment the spent sack has hopped back to the
 * discard row. Derived from the authored choreography above, so it moves
 * with it.
 */
export const WINDMILL_SACK_SPOT_SECONDS_V1 =
  ARRIVE_LEAD_SECONDS
  + DEPART_LAG_SECONDS
  + ROLL_SECONDS
  + (WINDMILL_DISCARD_ROW_Z_V1 - WINDMILL_MILL_SPOT_V1[1]) / SLIDE_SPEED;

/**
 * The blows this magazine can answer: one sack each, in order, and no more.
 *
 * Two rules, and both were latent until the mill got faster. A magazine
 * holds what it holds, so blows past the last sack go unanswered — the live
 * lane already worked that way, because a flour level keyed to blows rather
 * than to sacks climbs out through the roof. And a sack cannot answer a blow
 * that lands while the sack before it is still being tipped and dragged
 * clear; that one used to be free, because the 960 Hz recording struck five
 * times in twelve seconds. At the shared rate the same mill strikes nine
 * times in the same twelve seconds — about 0.9 s apart against the
 * choreography's own occupancy of roughly 1.12 s — so without this the
 * sacks pass through each other.
 *
 * Neither rule is a cap on the mill. The hammer keeps striking; the mill
 * simply has nothing under it, which is what an emptied magazine looks like.
 */
export function windmillMilledImpactsV1(
  impactsSeconds: readonly number[],
): readonly number[] {
  const milled: number[] = [];
  let spotFreeAt = Number.NEGATIVE_INFINITY;
  for (const impact of impactsSeconds) {
    if (milled.length >= WINDMILL_WHEAT_QUEUE_XS_V1.length) break;
    if (impact - ARRIVE_LEAD_SECONDS < spotFreeAt) continue;
    milled.push(impact);
    spotFreeAt = impact + WINDMILL_SACK_SPOT_SECONDS_V1 - ARRIVE_LEAD_SECONDS;
  }
  return Object.freeze(milled);
}

/**
 * The blows a finite recording can show all the way through: a sack that
 * would still be sliding into the spent row when the window closes is left
 * in the queue instead of freezing mid-drag.
 *
 * Only the recorded lane needs this. A live mill has no window to run out
 * of, so it uses `windmillMilledImpactsV1` unaltered.
 */
export function windmillSettledMilledImpactsV1(
  impactsSeconds: readonly number[],
  durationSeconds: number,
): readonly number[] {
  const milled = [...windmillMilledImpactsV1(impactsSeconds)];
  while (milled.length > 0
    && sackSchedule(milled.length - 1, milled[milled.length - 1]!).slideEnd
      > durationSeconds) {
    milled.pop();
  }
  return milled;
}

function assertImpacts(
  impactsSeconds: readonly number[],
  durationSeconds: number,
): void {
  let previous = 0;
  for (const [cycle, impact] of impactsSeconds.entries()) {
    if (!Number.isFinite(impact) || impact <= previous) {
      throw new Error(
        `Cannot synthesize windmill production tracks: impact `
        + `${String(cycle + 1)} at ${String(impact)} s must be finite and `
        + `later than ${String(previous)} s.`,
      );
    }
    previous = impact;
  }
  if (windmillSettledMilledImpactsV1(
    impactsSeconds,
    durationSeconds,
  ).length === 0) {
    throw new Error(
      `Cannot synthesize windmill production tracks: the mill struck `
      + `${String(impactsSeconds.length)} times in `
      + `${String(durationSeconds)} s and not one blow could be answered by a `
      + 'sack that reaches the milling spot in time and settles in the spent '
      + `row before the window closes. One sack needs `
      + `${WINDMILL_SACK_SPOT_SECONDS_V1.toFixed(3)} s at the spot. Raising `
      + 'the sack count is not the lever — the queue and discard rows are '
      + 'authored to fit the bay.',
    );
  }
}

/**
 * Samples all six authored tracks on the recorded frame grid. Velocities are
 * central differences of the sampled poses — exact arithmetic, no hidden
 * solver — and the final frame repeats the settled state the V2 replay holds.
 */
export function synthesizeWindmillProductionTracksV1(
  impactsSeconds: readonly number[],
  frameCount: number,
  frameSeconds: number,
): readonly WindmillProductionTrackV1[] {
  if (!Number.isInteger(frameCount) || frameCount < 2) {
    throw new Error(
      `Cannot synthesize windmill production tracks over `
      + `${String(frameCount)} frames; the finite observation records at `
      + 'least its initial and terminal states.',
    );
  }
  if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) {
    throw new Error(
      `Cannot synthesize windmill production tracks with a frame step of `
      + `${String(frameSeconds)} seconds; expected a positive finite step.`,
    );
  }
  const durationSeconds = (frameCount - 1) * frameSeconds;
  assertImpacts(impactsSeconds, durationSeconds);
  const milled = windmillSettledMilledImpactsV1(
    impactsSeconds,
    durationSeconds,
  );
  const poseAt = (track: number, time: number): WindmillProductionPoseV1 => {
    if (track >= WINDMILL_WHEAT_QUEUE_XS_V1.length) {
      return windmillFlourPoseV1(milled, time);
    }
    const impact = milled[track];
    return impact === undefined
      ? windmillWheatSackQueuePoseV1(track)
      : windmillWheatSackPoseV1(track, impact, time);
  };
  return WINDMILL_PRODUCTION_TRACK_IDS_V1.map((placementId, track) => {
    const translations = new Float32Array(frameCount * 3);
    const quaternions = new Float32Array(frameCount * 4);
    const linearVelocities = new Float32Array(frameCount * 3);
    const angularVelocities = new Float32Array(frameCount * 3);
    const centers: number[] = [];
    const rolls: number[] = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      const pose = poseAt(track, frame * frameSeconds);
      translations.set(pose.translation, frame * 3);
      quaternions.set(pose.quaternion, frame * 4);
      centers.push(...pose.translation);
      rolls.push(pose.rollRadians);
    }
    for (let frame = 0; frame < frameCount; frame += 1) {
      const before = Math.max(0, frame - 1);
      const after = Math.min(frameCount - 1, frame + 1);
      const window = (after - before) * frameSeconds;
      for (let axis = 0; axis < 3; axis += 1) {
        linearVelocities[frame * 3 + axis] =
          (centers[after * 3 + axis]! - centers[before * 3 + axis]!) / window;
      }
      angularVelocities[frame * 3 + 2] =
        (rolls[after]! - rolls[before]!) / window;
    }
    return Object.freeze({
      placementId,
      translations,
      quaternions,
      linearVelocities,
      angularVelocities,
    });
  });
}

/** The recorded impact times in seconds, in cycle order. */
export function windmillImpactSecondsV1(
  events: readonly {
    readonly kind: string;
    readonly cycle: number;
    readonly tick: number;
  }[],
  solverStepSeconds: number,
): readonly number[] {
  const impacts = events
    .filter((event) => event.kind === 'anvil-impact')
    .sort((left, right) => left.cycle - right.cycle);
  return impacts.map((event) => event.tick * solverStepSeconds);
}
