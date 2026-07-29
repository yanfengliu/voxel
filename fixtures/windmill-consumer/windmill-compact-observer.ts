import type { RigidBody } from '@dimforge/rapier3d-compat';

import type {
  WindmillCompactCamNoseKeyV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  WindmillCompactEffectiveRunV1,
} from './windmill-compact-evaluator-evidence.js';
import type {
  WindmillCompactContactEvidenceV1,
} from './windmill-compact-evaluator-runtime.js';

export interface WindmillCompactBodyObservationV1 {
  readonly bodyOriginTranslation: readonly [number, number, number];
  readonly bodyRotation: readonly [number, number, number, number];
  readonly bodyOriginLinearVelocity: readonly [number, number, number];
  readonly angularVelocity: readonly [number, number, number];
}

export interface WindmillCompactEvaluationBodiesV1 {
  readonly frame: WindmillCompactBodyObservationV1;
  readonly rotor: WindmillCompactBodyObservationV1;
  readonly hammer: WindmillCompactBodyObservationV1;
  readonly anvil: WindmillCompactBodyObservationV1;
}

export interface WindmillCompactEvaluationStepV1 {
  readonly tick: number;
  readonly bodies: WindmillCompactEvaluationBodiesV1;
  readonly activeCamNoseKey: WindmillCompactCamNoseKeyV1 | null;
  readonly cam: WindmillCompactContactEvidenceV1;
  readonly impact: WindmillCompactContactEvidenceV1;
}

export interface WindmillCompactEvaluationObserverV1 {
  readonly start: (
    effectiveRun: WindmillCompactEffectiveRunV1,
    bodies: WindmillCompactEvaluationBodiesV1,
  ) => void;
  readonly step: (observation: WindmillCompactEvaluationStepV1) => void;
}

function frozenTriple(
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  return Object.freeze([x, y, z] as const);
}

/**
 * Copies every recorder-visible channel out of Rapier. In particular, body
 * origin velocity is sampled at `translation()`, not copied from COM velocity.
 */
export function createWindmillCompactBodyObservationV1(
  body: RigidBody,
): WindmillCompactBodyObservationV1 {
  const translation = body.translation();
  const rotation = body.rotation();
  const originVelocity = body.velocityAtPoint(translation);
  const angularVelocity = body.angvel();
  return Object.freeze({
    bodyOriginTranslation: frozenTriple(
      translation.x,
      translation.y,
      translation.z,
    ),
    bodyRotation: Object.freeze([
      rotation.x,
      rotation.y,
      rotation.z,
      rotation.w,
    ] as const),
    bodyOriginLinearVelocity: frozenTriple(
      originVelocity.x,
      originVelocity.y,
      originVelocity.z,
    ),
    angularVelocity: frozenTriple(
      angularVelocity.x,
      angularVelocity.y,
      angularVelocity.z,
    ),
  });
}

export function observeWindmillCompactBodiesV1(
  frame: RigidBody,
  rotor: RigidBody,
  hammer: RigidBody,
  anvil: RigidBody,
): WindmillCompactEvaluationBodiesV1 {
  return Object.freeze({
    frame: createWindmillCompactBodyObservationV1(frame),
    rotor: createWindmillCompactBodyObservationV1(rotor),
    hammer: createWindmillCompactBodyObservationV1(hammer),
    anvil: createWindmillCompactBodyObservationV1(anvil),
  });
}
