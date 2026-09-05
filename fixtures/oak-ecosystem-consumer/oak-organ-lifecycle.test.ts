import { describe, expect, it } from 'vitest';

import {
  isOakAttachedLivingOrganV1,
  isOakExposedAttachedFineRootV1,
  isOakExposedAttachedLeafV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import { oakFineRootUptakeWeightsV1 } from './oak-biogeochemistry.js';
import { exposeOakPrimordiaV1, stepOakPhenologyV1 } from './oak-growth.js';
import { OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import { createInitialOakStateV1, type MutableOakStateV1 } from './oak-state.js';

function organ(
  stage: 'dormant' | 'expanding' | 'detached' | 'abscised',
  developmentPhase: 'preformed' | 'cell-expansion' | 'falling' | 'abscised',
) {
  return {
    kind: 'leaf' as const,
    stage,
    healthFraction: 1,
    developmentPhase,
  };
}

describe('oak organ lifecycle boundaries', () => {
  it('keeps primordia authoritative but neither placed nor atmosphere-facing', () => {
    const primordium = organ('dormant', 'preformed');
    expect(isOakAttachedLivingOrganV1(primordium)).toBe(true);
    expect(isOakPlacedOrganV1(primordium)).toBe(false);
    expect(isOakExposedAttachedLeafV1(primordium)).toBe(false);
  });

  it('keeps falling leaves placed but outside attached plant physiology', () => {
    const falling = organ('detached', 'falling');
    expect(isOakPlacedOrganV1(falling)).toBe(true);
    expect(isOakAttachedLivingOrganV1(falling)).toBe(false);
    expect(isOakExposedAttachedLeafV1(falling)).toBe(false);
  });

  it('admits only emerged attached leaves to canopy exchange', () => {
    const exposed = organ('expanding', 'cell-expansion');
    expect(isOakPlacedOrganV1(exposed)).toBe(true);
    expect(isOakAttachedLivingOrganV1(exposed)).toBe(true);
    expect(isOakExposedAttachedLeafV1(exposed)).toBe(true);
    expect(isOakPlacedOrganV1(organ('abscised', 'abscised'))).toBe(false);
  });

  function rootedState(): MutableOakStateV1 {
    const state = createInitialOakStateV1({
      seed: 19,
      timeScale: OAK_SECONDS_PER_DAY_V1,
      paused: false,
      ablation: 'baseline',
      regime: {},
    }, 1);
    state.elapsedBiologicalSeconds = 3 * OAK_SECONDS_PER_DAY_V1;
    stepOakPhenologyV1(state);
    const coarse = state.organs.find((candidate) => candidate.kind === 'coarse-root');
    if (coarse?.development === undefined) throw new Error('Expected a coarse-root parent.');
    coarse.lengthM = coarse.development.targetLengthM;
    exposeOakPrimordiaV1(state);
    return state;
  }

  it('requires an exposed fine root and an unbroken living chain to the acorn', () => {
    const positive = rootedState();
    const fine = positive.organs.find((candidate) => candidate.kind === 'fine-root-cohort')!;
    expect(isOakExposedAttachedFineRootV1(fine)).toBe(true);
    expect(oakFineRootUptakeWeightsV1(positive).reduce((sum, value) => sum + value, 0))
      .toBeCloseTo(1, 14);

    for (const [label, mutate] of [
      ['preformed fine root', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'fine-root-cohort')!
          .development!.phase = 'preformed';
      }],
      ['detached fine root', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'fine-root-cohort')!.stage = 'detached';
      }],
      ['dead fine root', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'fine-root-cohort')!.healthFraction = 0;
      }],
      ['missing parent', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'fine-root-cohort')!
          .parentKey = 'organ:missing:1';
      }],
      ['preformed parent', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'coarse-root')!
          .development!.phase = 'preformed';
      }],
      ['dead parent', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'coarse-root')!.healthFraction = 0;
      }],
      ['cyclic chain', (state: MutableOakStateV1) => {
        const fineRoot = state.organs.find((candidate) =>
          candidate.kind === 'fine-root-cohort')!;
        state.organs.find((candidate) => candidate.kind === 'coarse-root')!
          .parentKey = fineRoot.key;
      }],
      ['non-acorn terminus', (state: MutableOakStateV1) => {
        state.organs.find((candidate) => candidate.kind === 'coarse-root')!.parentKey = null;
      }],
    ] as const) {
      const state = rootedState();
      mutate(state);
      expect(oakFineRootUptakeWeightsV1(state).every((value) => value === 0), label)
        .toBe(true);
    }
  });
});
