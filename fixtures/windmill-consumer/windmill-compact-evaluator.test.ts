import { describe, expect, it } from 'vitest';

import {
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  assertWindmillCompactCandidateResultV1,
  windmillCandidatePassesV1,
} from './windmill-candidate-ranking.js';
import {
  evaluateWindmillCompactDefaultV1,
} from './windmill-compact-evaluator.js';
import {
  assertWindmillRapierMassParityV1,
} from './windmill-compact-sail-removal.js';
import {
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
} from './windmill-operational-inputs.js';

const OPERATIONAL_TICKS_PER_SECOND =
  1 / WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1.fixedStepSeconds;

describe('compact windmill default evaluator', () => {
  it('runs the exact compiled default through fixed-step Rapier', async () => {
    const evaluation = await evaluateWindmillCompactDefaultV1({
      name: 'default-focused',
      durationSeconds: 1,
    });
    expect(evaluation.evidence.ticks).toBe(OPERATIONAL_TICKS_PER_SECOND);
    expect(Number.isFinite(evaluation.evidence.finalRotorAngleRadians))
      .toBe(true);
    expect(evaluation.evidence.forbiddenOverlapChecks).toBeGreaterThan(0);
    expect(evaluation.evidence.exactParity).toMatchObject({
      mismatchCount: 0,
    });
    expect(evaluation.evidence.exactParity.checks).toBeGreaterThan(0);
    expect(evaluation.evidence.initialDrive)
      .toMatchObject({
        primaryCamNoseKey: 'rotor-cam-nose',
        opposedCamNoseKey: 'rotor-opposed-cam-nose',
        camRadialXMeters: 0.75,
        opposedCamRadialXMeters: -0.75,
        camNoseAngularSeparationRadians: Math.PI,
        geometricCamPassesPerRotorRevolution: 2,
        requiredTorqueAxis: '-Z',
      });
    expect(Object.isFrozen(
      evaluation.evidence.initialLoadBalance.netForceWorldNewtons,
    )).toBe(true);
    expect(() => {
      (evaluation.evidence.initialLoadBalance
        .netForceWorldNewtons as number[])[0] = 99;
    }).toThrow();
    expect(() => assertWindmillCompactCandidateResultV1(evaluation.result))
      .not.toThrow();
  });

  it('holds the unpowered head and rotor at rest for the full horizon', async () => {
    const evaluation = await evaluateWindmillCompactDefaultV1({
      name: 'default-zero-wind-rest',
      windEnabled: false,
    });
    expect(evaluation.evidence.ticks).toBe(12 * OPERATIONAL_TICKS_PER_SECOND);
    expect(evaluation.evidence.completedCausalCycles).toBe(0);
    expect(evaluation.evidence.anvilContactTicks).toBeGreaterThan(0);
    expect(Math.max(
      evaluation.evidence.maximumHeadLiftMeters,
      -evaluation.evidence.minimumHeadDisplacementMeters,
    )).toBeLessThan(0.05);
    expect(evaluation.evidence.maximumAbsoluteRotorAngleExcursionRadians)
      .toBeLessThan(0.05);
    expect(evaluation.evidence
      .maximumAbsoluteRotorAngularSpeedLastSecondRadiansPerSecond)
      .toBeLessThan(0.05);
  }, 15_000);

  it('runs the frozen full nominal horizon', async () => {
    const evaluation = await evaluateWindmillCompactDefaultV1({
      name: 'default-full-nominal',
    });
    expect(evaluation.evidence.ticks).toBe(12 * OPERATIONAL_TICKS_PER_SECOND);
    expect(evaluation.evidence.cycleRecords).toHaveLength(
      evaluation.evidence.completedCausalCycles,
    );
    expect(evaluation.result.provenance.runEvidenceSha256)
      .toMatch(/^[0-9a-f]{64}$/);
    expect(windmillCandidatePassesV1(evaluation.result)).toBe(true);
    expect(evaluation.evidence.failedGateIds).toEqual([]);
  }, 15_000);

  it('removes one exact sail geometry, collider mass, and load together', async () => {
    const evaluation = await evaluateWindmillCompactDefaultV1({
      name: 'one-sail-removal-focused',
      durationSeconds: 1,
      removedSailKey: 'north-sail',
    });
    const removal = evaluation.evidence.sailRemoval;
    expect(removal).not.toBeNull();
    expect(removal!.removedBoxKeys).toEqual([
      'north-spar',
      'north-panel-step-z0',
      'north-panel-step-z1',
    ]);
    expect(removal!.removedColliderCount)
      .toBe(removal!.removedBoxKeys.length);
    expect(removal!.removedLoadFrameCount).toBe(1);
    expect(Object.isFrozen(removal!.removedOccupiedCells[0])).toBe(true);
    expect(Object.isFrozen(
      removal!.ablatedRadialFirstMomentKilogramMeters,
    )).toBe(true);
    expect(() => assertWindmillRapierMassParityV1(
      evaluation.evidence.initialRotorMassKilograms,
      removal!.ablatedRotorMassKilograms,
      'test sail removal',
    )).not.toThrow();
    expect(removal!.ablatedRotorMassKilograms)
      .toBeLessThan(removal!.nominalRotorMassKilograms);
    expect(Math.hypot(...removal!
      .ablatedRadialFirstMomentKilogramMeters)).toBeGreaterThan(0);
  });

  it('delays the anvil ablation until upstream pickup and lift are proven', async () => {
    const evaluation = await evaluateWindmillCompactDefaultV1({
      name: 'delayed-anvil-focused',
      durationSeconds: 1,
      anvilContactEnabled: false,
    });
    expect(evaluation.evidence.camContactTicks).toBeGreaterThan(0);
    expect(evaluation.evidence.maximumHeadLiftMeters).toBeGreaterThanOrEqual(
      0.25,
    );
    expect(evaluation.evidence.anvilContactDisabledAtTick).not.toBeNull();
    expect(evaluation.evidence.anvilSupportContactTicksBeforeIntervention)
      .toBeGreaterThan(0);
    expect(evaluation.evidence.postInterventionAnvilContactTicks).toBe(0);
    expect(evaluation.evidence.anvilContactTicks).toBe(
      evaluation.evidence.anvilSupportContactTicksBeforeIntervention,
    );
  });

  it('removes only the disabled nose work and changes the physical output', async () => {
    const nominal = await evaluateWindmillCompactDefaultV1({
      name: 'dual-lobe-ablation-nominal',
    });
    for (const disabledCamNoseKey of
      WINDMILL_COMPACT_CAM_NOSE_KEYS_V1) {
      expect(nominal.evidence.camContactTicksByNose[disabledCamNoseKey])
        .toBeGreaterThan(0);
      expect(nominal.evidence
        .qualifiedCausalCyclesByNose[disabledCamNoseKey])
        .toBeGreaterThan(0);
      const ablated = await evaluateWindmillCompactDefaultV1({
        name: `dual-lobe-ablation-${disabledCamNoseKey}`,
        disabledCamNoseKey,
      });
      expect(ablated.evidence.camContactTicksByNose[disabledCamNoseKey])
        .toBe(0);
      expect(ablated.evidence
        .qualifiedCausalCyclesByNose[disabledCamNoseKey])
        .toBe(0);
      expect(ablated.evidence.cycleRecords.some((record) =>
        record.camNoseKey === disabledCamNoseKey)).toBe(false);
      expect(ablated.evidence.finalRotorAngleRadians)
        .not.toBe(nominal.evidence.finalRotorAngleRadians);
      expect(ablated.evidence.camContactTicks)
        .not.toBe(nominal.evidence.camContactTicks);
    }
  }, 30_000);
});
