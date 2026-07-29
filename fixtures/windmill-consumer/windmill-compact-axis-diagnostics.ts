import type {
  RigidBody,
  Vector,
} from '@dimforge/rapier3d-compat';

import {
  rotateWindmillVectorV1,
  windmillAxisTiltRadiansV1,
  windmillMaximumMetricV1,
  windmillOffAxisAngularSpeedV1,
} from './windmill-compact-evaluator-runtime.js';

export interface WindmillCompactAxisDiagnosticsEvidenceV1 {
  readonly maximumRotorAxisTiltRadians: number;
  readonly maximumHammerAxisTiltRadians: number;
  readonly maximumRotorAxisDirectionRateRadiansPerSecond: number;
  readonly maximumHammerAxisDirectionRateRadiansPerSecond: number;
  /**
   * Raw post-solver body velocity is retained to diagnose impulse spikes.
   * It is deliberately not an acceptance gate because it did not converge
   * while the actual constrained shaft direction, anchor, tilt, and drift did.
   */
  readonly maximumRotorOffAxisAngularSpeedRadiansPerSecond: number;
  readonly maximumHammerOffAxisAngularSpeedRadiansPerSecond: number;
}

export interface WindmillCompactAxisDiagnosticsTrackerV1 {
  readonly sample: () => void;
  readonly evidence: () => WindmillCompactAxisDiagnosticsEvidenceV1;
}

export function windmillShaftAxisWorldV1(body: RigidBody): Vector {
  return rotateWindmillVectorV1(
    body.rotation(),
    { x: 0, y: 0, z: 1 },
  );
}

export function windmillShaftAxisDirectionRateV1(
  previous: Vector,
  current: Vector,
  fixedStepSeconds: number,
): number {
  if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0) {
    throw new Error(
      `Cannot measure windmill shaft-axis direction rate with fixed step `
      + `${String(fixedStepSeconds)} seconds; expected a finite positive `
      + 'duration.',
    );
  }
  const previousLength = Math.hypot(previous.x, previous.y, previous.z);
  const currentLength = Math.hypot(current.x, current.y, current.z);
  if (!(previousLength > 0) || !(currentLength > 0)) {
    throw new Error(
      'Cannot measure windmill shaft-axis direction rate from a zero-length '
      + 'world direction.',
    );
  }
  const dot = (
    previous.x * current.x
    + previous.y * current.y
    + previous.z * current.z
  ) / (previousLength * currentLength);
  const cross = {
    x: previous.y * current.z - previous.z * current.y,
    y: previous.z * current.x - previous.x * current.z,
    z: previous.x * current.y - previous.y * current.x,
  };
  const crossLength =
    Math.hypot(cross.x, cross.y, cross.z)
    / (previousLength * currentLength);
  return Math.atan2(
    Math.max(0, crossLength),
    Math.max(-1, Math.min(1, dot)),
  ) / fixedStepSeconds;
}

export function createWindmillCompactAxisDiagnosticsV1(
  fixedStepSeconds: number,
  rotor: RigidBody,
  hammer: RigidBody,
): WindmillCompactAxisDiagnosticsTrackerV1 {
  let previousRotorAxis = windmillShaftAxisWorldV1(rotor);
  let previousHammerAxis = windmillShaftAxisWorldV1(hammer);
  let maximumRotorTilt = 0;
  let maximumHammerTilt = 0;
  let maximumRotorDirectionRate = 0;
  let maximumHammerDirectionRate = 0;
  let maximumRotorRawOffAxisSpeed = 0;
  let maximumHammerRawOffAxisSpeed = 0;
  return Object.freeze({
    sample(): void {
      const rotorAxis = windmillShaftAxisWorldV1(rotor);
      const hammerAxis = windmillShaftAxisWorldV1(hammer);
      maximumRotorTilt = windmillMaximumMetricV1(
        maximumRotorTilt,
        windmillAxisTiltRadiansV1(rotor),
      );
      maximumHammerTilt = windmillMaximumMetricV1(
        maximumHammerTilt,
        windmillAxisTiltRadiansV1(hammer),
      );
      maximumRotorDirectionRate = windmillMaximumMetricV1(
        maximumRotorDirectionRate,
        windmillShaftAxisDirectionRateV1(
          previousRotorAxis,
          rotorAxis,
          fixedStepSeconds,
        ),
      );
      maximumHammerDirectionRate = windmillMaximumMetricV1(
        maximumHammerDirectionRate,
        windmillShaftAxisDirectionRateV1(
          previousHammerAxis,
          hammerAxis,
          fixedStepSeconds,
        ),
      );
      maximumRotorRawOffAxisSpeed = windmillMaximumMetricV1(
        maximumRotorRawOffAxisSpeed,
        windmillOffAxisAngularSpeedV1(rotor),
      );
      maximumHammerRawOffAxisSpeed = windmillMaximumMetricV1(
        maximumHammerRawOffAxisSpeed,
        windmillOffAxisAngularSpeedV1(hammer),
      );
      previousRotorAxis = rotorAxis;
      previousHammerAxis = hammerAxis;
    },
    evidence(): WindmillCompactAxisDiagnosticsEvidenceV1 {
      return Object.freeze({
        maximumRotorAxisTiltRadians: maximumRotorTilt,
        maximumHammerAxisTiltRadians: maximumHammerTilt,
        maximumRotorAxisDirectionRateRadiansPerSecond:
          maximumRotorDirectionRate,
        maximumHammerAxisDirectionRateRadiansPerSecond:
          maximumHammerDirectionRate,
        maximumRotorOffAxisAngularSpeedRadiansPerSecond:
          maximumRotorRawOffAxisSpeed,
        maximumHammerOffAxisAngularSpeedRadiansPerSecond:
          maximumHammerRawOffAxisSpeed,
      });
    },
  });
}
