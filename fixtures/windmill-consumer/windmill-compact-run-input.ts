import type {
  WindmillCompactCamNoseKeyV1,
  WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import type {
  WindmillCompactEffectiveRunV1,
  WindmillCompactInterventionV1,
  WindmillCompactRunEvidenceV1,
} from './windmill-compact-evaluator-evidence.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';
import type {
  WindmillCompactWorldOptionsV1,
} from './windmill-compact-world.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import {
  freezeWindmillNumericalProfileV1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  type WindmillNumericalProfileV1,
} from './windmill-operational-inputs.js';

export interface WindmillCompactRunOptionsV1
  extends Omit<WindmillCompactWorldOptionsV1, 'numericalProfile'> {
  readonly name: string;
  readonly windEnabled?: boolean;
  readonly durationSeconds?: number;
  readonly removedSailKey?: string;
}

function interventionOf(
  changes: readonly [WindmillCompactInterventionV1, boolean][],
): WindmillCompactInterventionV1 {
  const active = changes.filter(([, enabled]) => enabled);
  if (active.length > 1) {
    throw new Error(
      'Cannot evaluate compact windmill with combined interventions '
      + `[${active.map(([key]) => key).join(', ')}]; each causal ablation `
      + 'must change exactly one operational input.',
    );
  }
  return active[0]?.[0] ?? 'nominal';
}

export function effectiveWindmillCompactRunV1(
  candidate: WindmillCompactCandidateV1,
  options: WindmillCompactRunOptionsV1,
  numericalProfile: WindmillNumericalProfileV1 =
    WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
): WindmillCompactEffectiveRunV1 {
  if (options.name.trim().length === 0) {
    throw new Error(
      'Cannot evaluate compact windmill with an empty run name; provide a '
      + 'stable evidence label.',
    );
  }
  const durationSeconds = options.durationSeconds
    ?? WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1.fullDurationSeconds;
  const effectiveNumericalProfile =
    freezeWindmillNumericalProfileV1(numericalProfile);
  const exactTicks =
    durationSeconds / effectiveNumericalProfile.fixedStepSeconds;
  const ticks = Math.round(exactTicks);
  if (!Number.isFinite(durationSeconds)
    || durationSeconds <= 0
    || !Number.isSafeInteger(ticks)
    || Math.abs(exactTicks - ticks) > 1e-9) {
    throw new Error(
      `Cannot evaluate compact windmill duration `
      + `${String(durationSeconds)} seconds; expected a positive duration `
      + `that is an exact multiple of fixed step `
      + `${String(effectiveNumericalProfile.fixedStepSeconds)} seconds from `
      + `numerical profile '${effectiveNumericalProfile.id}'.`,
    );
  }
  const gravityMultiplier = options.gravityMultiplier ?? 1;
  if (gravityMultiplier !== 0 && gravityMultiplier !== 1) {
    throw new Error(
      `Cannot evaluate compact windmill with gravity multiplier `
      + `${String(gravityMultiplier)}; the frozen protocol permits only `
      + 'nominal 1 or the explicit zero-gravity ablation 0.',
    );
  }
  const removedSailKey = options.removedSailKey ?? null;
  if (removedSailKey !== null
    && !candidate.sails.some(({ key }) => key === removedSailKey)) {
    throw new Error(
      `Cannot evaluate compact windmill '${candidate.parameterKey}' after `
      + `removing sail '${removedSailKey}'; expected one of `
      + `[${candidate.sails.map(({ key }) => key).join(', ')}].`,
    );
  }
  const windEnabled = options.windEnabled !== false;
  const camContactEnabled = options.camContactEnabled !== false;
  const disabledCamNoseKey = options.disabledCamNoseKey ?? null;
  if (disabledCamNoseKey !== null
    && disabledCamNoseKey !== 'rotor-cam-nose'
    && disabledCamNoseKey !== 'rotor-opposed-cam-nose') {
    throw new Error(
      `Cannot evaluate compact windmill with disabled cam nose `
      + `'${String(disabledCamNoseKey)}'; expected 'rotor-cam-nose' or `
      + "'rotor-opposed-cam-nose'.",
    );
  }
  const anvilContactEnabled = options.anvilContactEnabled !== false;
  const intervention = interventionOf([
    ['zero-wind', !windEnabled],
    ['zero-gravity', gravityMultiplier === 0],
    ['cam-contact-disabled', !camContactEnabled],
    ['primary-cam-nose-disabled',
      disabledCamNoseKey === 'rotor-cam-nose'],
    ['opposed-cam-nose-disabled',
      disabledCamNoseKey === 'rotor-opposed-cam-nose'],
    ['anvil-contact-disabled', !anvilContactEnabled],
    ['one-sail-removed', removedSailKey !== null],
  ]);
  return Object.freeze({
    schema: 'fixture.windmill-compact-effective-run/1',
    intervention,
    durationSeconds,
    ticks,
    numericalProfile: effectiveNumericalProfile,
    windEnabled,
    gravityMultiplier,
    camContactEnabled,
    disabledCamNoseKey:
      disabledCamNoseKey as WindmillCompactCamNoseKeyV1 | null,
    anvilContactEnabled,
    anvilDisablePolicy: !anvilContactEnabled
      ? 'after-first-cam-contacted-qualifying-lift'
      : null,
    removedSailKey,
  });
}

export function windmillCompactEffectiveInputSha256V1(
  compiled: WindmillCompiledCompactCandidateV1,
  run: WindmillCompactEffectiveRunV1,
): string {
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      baseSolverInputSha256: compiled.solverInputSha256,
      evaluatorDeclarationSha256: compiled.evaluatorDeclarationSha256,
      effectiveRun: run,
    }),
  ]);
}

export function windmillCompactRunEvidenceSha256V1(
  evidence: WindmillCompactRunEvidenceV1,
): string {
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(evidence),
  ]);
}
