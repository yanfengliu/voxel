import {
  type WindmillCompactCamNoseKeyV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import type {
  WindmillCompactCycleAttemptV1,
  WindmillCompactCycleRecordV1,
} from './windmill-compact-evaluator-evidence.js';

interface MutableAttemptV1 {
  camNoseKey: WindmillCompactCamNoseKeyV1;
  camContactTick: number;
  preContactHeadLiftMeters: number;
  liftTick: number | null;
  releaseTick: number | null;
  apexTick: number | null;
  downwardTick: number | null;
  maximumLiftMeters: number;
  downwardSpeedMetersPerSecond: number;
}

export interface WindmillCompactCycleObservationV1 {
  readonly tick: number;
  readonly activeCamNoseKey: WindmillCompactCamNoseKeyV1 | null;
  readonly headLiftMeters: number;
  readonly previousHeadSpeedMetersPerSecond: number;
  readonly headSpeedMetersPerSecond: number;
  readonly impactImpulseNewtonSeconds: number;
}

export interface WindmillCompactCycleTrackerV1 {
  readonly observe: (
    observation: WindmillCompactCycleObservationV1,
  ) => WindmillCompactCycleObservationResultV1;
  readonly records: () => readonly WindmillCompactCycleRecordV1[];
  readonly activeAttempt: () => WindmillCompactCycleAttemptV1 | null;
}

export interface WindmillCompactCycleObservationResultV1 {
  readonly qualifyingCamCausedLift: boolean;
}

function frozenAttempt(
  attempt: MutableAttemptV1,
): WindmillCompactCycleAttemptV1 {
  return Object.freeze({
    camNoseKey: attempt.camNoseKey,
    camContactTick: attempt.camContactTick,
    preContactHeadLiftMeters: attempt.preContactHeadLiftMeters,
    liftTick: attempt.liftTick,
    releaseTick: attempt.releaseTick,
    apexTick: attempt.apexTick,
    downwardTick: attempt.downwardTick,
    maximumLiftMeters: attempt.maximumLiftMeters,
  });
}

export function createWindmillCompactCycleTrackerV1():
WindmillCompactCycleTrackerV1 {
  const gates = WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.gates;
  const completed: WindmillCompactCycleRecordV1[] = [];
  let active: MutableAttemptV1 | null = null;
  let previousCamNoseKey: WindmillCompactCamNoseKeyV1 | null = null;
  let previousHeadLiftMeters = 0;
  return Object.freeze({
    observe(
      observation: WindmillCompactCycleObservationV1,
    ): WindmillCompactCycleObservationResultV1 {
      let qualifyingCamCausedLift = false;
      const risingEdge = observation.activeCamNoseKey !== null
        && previousCamNoseKey === null;
      const fallingEdge = observation.activeCamNoseKey === null
        && previousCamNoseKey !== null;
      if (active !== null && active.releaseTick !== null && risingEdge) {
        active = null;
      }
      if (active === null
        && risingEdge
        && previousHeadLiftMeters
          < gates.minimumHeadLiftMeters) {
        active = {
          camNoseKey: observation.activeCamNoseKey!,
          camContactTick: observation.tick,
          preContactHeadLiftMeters: previousHeadLiftMeters,
          liftTick: null,
          releaseTick: null,
          apexTick: null,
          downwardTick: null,
          maximumLiftMeters: observation.headLiftMeters,
          downwardSpeedMetersPerSecond: 0,
        };
      }
      if (active === null) {
        previousCamNoseKey = observation.activeCamNoseKey;
        previousHeadLiftMeters = observation.headLiftMeters;
        return { qualifyingCamCausedLift };
      }
      active.maximumLiftMeters = Math.max(
        active.maximumLiftMeters,
        observation.headLiftMeters,
      );
      if (active.liftTick === null
        && previousHeadLiftMeters < gates.minimumHeadLiftMeters
        && observation.headLiftMeters >= gates.minimumHeadLiftMeters
        && observation.headSpeedMetersPerSecond > 0) {
        active.liftTick = observation.tick;
        qualifyingCamCausedLift = true;
      }
      if (fallingEdge && active.liftTick === null) {
        active = null;
        previousCamNoseKey = observation.activeCamNoseKey;
        previousHeadLiftMeters = observation.headLiftMeters;
        return { qualifyingCamCausedLift };
      }
      if (active.liftTick !== null
        && active.releaseTick === null
        && fallingEdge) {
        active.releaseTick = observation.tick;
      }
      if (active.releaseTick !== null
        && active.apexTick === null
        && observation.previousHeadSpeedMetersPerSecond > 0
        && observation.headSpeedMetersPerSecond <= 0) {
        active.apexTick = observation.tick;
      }
      if (active.apexTick !== null
        && active.downwardTick === null
        && observation.headSpeedMetersPerSecond
          <= -gates.minimumDownwardImpactSpeedMetersPerSecond) {
        active.downwardTick = observation.tick;
        active.downwardSpeedMetersPerSecond =
          observation.headSpeedMetersPerSecond;
      }
      if (active.downwardTick !== null
        && observation.impactImpulseNewtonSeconds
          >= gates.minimumContactImpulseNewtonSeconds) {
        completed.push(Object.freeze({
          cycle: completed.length + 1,
          camNoseKey: active.camNoseKey,
          camContactTick: active.camContactTick,
          preContactHeadLiftMeters: active.preContactHeadLiftMeters,
          liftTick: active.liftTick!,
          releaseTick: active.releaseTick!,
          apexTick: active.apexTick!,
          downwardTick: active.downwardTick,
          impactTick: observation.tick,
          maximumLiftMeters: active.maximumLiftMeters,
          downwardSpeedMetersPerSecond:
            active.downwardSpeedMetersPerSecond,
          impactImpulseNewtonSeconds:
            observation.impactImpulseNewtonSeconds,
        }));
        active = null;
      }
      previousCamNoseKey = observation.activeCamNoseKey;
      previousHeadLiftMeters = observation.headLiftMeters;
      return { qualifyingCamCausedLift };
    },
    records(): readonly WindmillCompactCycleRecordV1[] {
      return Object.freeze([...completed]);
    },
    activeAttempt(): WindmillCompactCycleAttemptV1 | null {
      return active === null ? null : frozenAttempt(active);
    },
  });
}
