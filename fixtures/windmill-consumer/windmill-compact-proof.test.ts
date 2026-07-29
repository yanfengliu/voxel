import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  createWindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1,
  createSelectedWindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-selection.js';
import {
  proveWindmillCompactCandidateV1,
} from './windmill-compact-proof.js';
import {
  createWindmillCompactActuationBoundaryV1,
  createWindmillCompactUpperHeadMassEvidenceV1,
} from './windmill-compact-proof-static.js';

describe('compact windmill promoted causal proof', () => {
  it('fails closed for a canonical candidate that was not selected', async () => {
    await expect(proveWindmillCompactCandidateV1(
      createWindmillCompactCandidateV1(),
    )).rejects.toThrow(
      new RegExp(
        `promoted selection is '${WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1}'`,
      ),
    );
  });

  it('binds the upper cell face path and analytical static contribution', () => {
    const candidate = createSelectedWindmillCompactCandidateV1();
    const evidence =
      createWindmillCompactUpperHeadMassEvidenceV1(candidate);
    expect(evidence).toMatchObject({
      boxKey: 'hammer-head-mass',
      purposeId: 'windmill:purpose:hammer-head-return-mass',
      occupiedVoxelCount: 1,
      isImpactContactParticipant: false,
      faceConnectedPath: [
        {
          fromBoxKey: 'hammer-right-beam',
          toBoxKey: 'hammer-head-mass',
          minimumFaceAreaVoxels: 1,
        },
        {
          fromBoxKey: 'hammer-head-mass',
          toBoxKey: 'hammer-impact-toe',
          minimumFaceAreaVoxels: 1,
        },
      ],
    });
    expect(evidence.addedStaticMassKilograms).toBeGreaterThan(0);
    expect(evidence.hammerMassExcludingUpperCellKilograms)
      .toBeLessThan(evidence.nominalHammerMassKilograms);
    expect(
      evidence.hammerMassExcludingUpperCellKilograms
      + evidence.addedStaticMassKilograms,
    ).toBeCloseTo(evidence.nominalHammerMassKilograms, 12);
    expect(evidence.horizontalLeverArmMeters).toBeGreaterThan(0);
    expect(evidence.analyticalHeadDownGravityForceNewtons)
      .toBeCloseTo(evidence.addedStaticMassKilograms * 9.81, 12);
    expect(evidence.analyticalHeadDownGravityTorqueNewtonMeters)
      .toBeCloseTo(
        evidence.analyticalHeadDownGravityForceNewtons
        * evidence.horizontalLeverArmMeters,
        12,
      );
    expect(evidence.honestyBoundary)
      .toMatch(/no isolated upper-cell dynamics ablation/i);
    expect(evidence.honestyBoundary)
      .toMatch(/H1\/H2\/H3 search outcomes do not prove/i);
  });

  it('binds passive actuation and forbids post-creation drive overrides', () => {
    const candidate = createSelectedWindmillCompactCandidateV1();
    const boundary = createWindmillCompactActuationBoundaryV1(candidate);
    expect(boundary).toMatchObject({
      movingBodyTypes: ['dynamic', 'dynamic'],
      initialRotorLinearVelocity: [0, 0, 0],
      initialRotorAngularVelocity: [0, 0, 0],
      initialHammerLinearVelocity: [0, 0, 0],
      initialHammerAngularVelocity: [0, 0, 0],
      jointKind: 'rapier-impulse-revolute',
      prohibitedControls: [
        'wind-ramp',
        'motor',
        'controller',
        'post-creation-pose-or-velocity-override',
      ],
    });
    const evaluatorSource = readFileSync(
      new URL('./windmill-compact-evaluator.ts', import.meta.url),
      'utf8',
    );
    expect(evaluatorSource).not.toMatch(
      /\.(?:setTranslation|setRotation|setLinvel|setAngvel|setNextKinematicTranslation|setNextKinematicRotation|configureMotor|setMotor)\s*\(/,
    );
    const worldSource = readFileSync(
      new URL('./windmill-compact-world.ts', import.meta.url),
      'utf8',
    );
    expect(worldSource).not.toMatch(
      /\.(?:setTranslation|setRotation|setLinvel|setAngvel|setNextKinematicTranslation|setNextKinematicRotation|configureMotor|setMotor)\s*\(/,
    );
    expect(worldSource).not.toMatch(/WINDMILL_INITIAL_VELOCITIES/);
  });

  it('binds every exact causal ablation to the exhaustive-search winner', async () => {
    const proof = await proveWindmillCompactCandidateV1();
    expect(proof.candidateParameterKey)
      .toBe(WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1);
    expect(proof.nominal.result.provenance.combinedEvaluationSha256)
      .toBe(WINDMILL_COMPACT_SELECTED_SEARCH_EVALUATION_SHA256_V1);
    expect(proof.nominal.result.provenance.combinedEvaluationSha256)
      .toBe(
        WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
      );
    expect(Object.keys(proof.ablations)).toEqual([
      'zero-wind',
      'zero-gravity',
      'cam-contact-disabled',
      'primary-cam-nose-disabled',
      'opposed-cam-nose-disabled',
      'anvil-contact-disabled',
      'one-sail-removed',
    ]);
    expect(proof.checks.map(({ id }) => id)).toEqual([
      'selection-binding',
      'nominal',
      'zero-wind',
      'zero-gravity',
      'cam-contact-disabled',
      'primary-cam-nose-disabled',
      'opposed-cam-nose-disabled',
      'anvil-contact-disabled',
      'one-sail-removed',
      'upper-head-return-mass',
      'actuation-boundary',
    ]);
    expect(proof.checks.filter(({ passed }) => !passed)).toEqual([]);
    expect(proof.passed).toBe(true);
    expect(proof.proofSha256)
      .toBe(WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1);
  }, 180_000);
});
