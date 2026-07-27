import { createHash, type Hash } from 'node:crypto';

import {
  canonicalRiverfallFluidJsonV1,
  createRiverfallFluidConfigV1,
  type RiverfallFluidAblationV1,
  type RiverfallFluidCausalRuleV1,
} from './riverfall-fluid-config.js';
import {
  simulateRiverfallFluidV1,
  type RiverfallFluidTraceSummaryV1,
  type RiverfallFluidTraceV1,
} from './riverfall-fluid-simulation.js';

export interface RiverfallFluidCausalObservationV1 {
  readonly rule: RiverfallFluidCausalRuleV1;
  readonly baselineInputHash: string;
  readonly baselineFinalHash: string;
  readonly ablationInputHash: string;
  readonly ablationFinalHash: string;
  readonly baselineValue: number;
  readonly ablationValue: number;
  readonly observedDifference: number;
  readonly passed: boolean;
}

export interface RiverfallFluidCausalEvidenceV1 {
  readonly schemaVersion: 'studio.riverfall-fluid-causal-evidence/1';
  readonly frameCount: number;
  readonly burnInSubsteps: number;
  readonly baselineSummary: RiverfallFluidTraceSummaryV1;
  readonly observations: readonly RiverfallFluidCausalObservationV1[];
}

export interface RiverfallFluidEvidenceTraceV1 extends RiverfallFluidTraceV1 {
  readonly causalEvidence: RiverfallFluidCausalEvidenceV1;
}

function summaryMetric(
  summary: RiverfallFluidTraceSummaryV1,
  metric: RiverfallFluidCausalRuleV1['metric'],
): number {
  return summary[metric];
}

function hashStringField(hash: Hash, name: string, value: string): void {
  const nameBytes = new TextEncoder().encode(name);
  const valueBytes = new TextEncoder().encode(value);
  const length = new Uint8Array(8);
  const view = new DataView(length.buffer);
  view.setUint32(0, nameBytes.length, true);
  view.setUint32(4, valueBytes.length, true);
  hash.update(length);
  hash.update(nameBytes);
  hash.update(valueBytes);
}

export function simulateRiverfallFluidCausalEvidenceV1():
RiverfallFluidCausalEvidenceV1 {
  const definition = createRiverfallFluidConfigV1().causalEvidence;
  const options = {
    frameCount: definition.frameCount,
    burnInSubsteps: definition.burnInSubsteps,
  } as const;
  const baseline = simulateRiverfallFluidV1(options);
  const byAblation = new Map<
  Exclude<RiverfallFluidAblationV1, 'baseline'>,
  RiverfallFluidTraceV1
  >();
  const observations = definition.rules.map(
    (rule): RiverfallFluidCausalObservationV1 => {
      let ablation = byAblation.get(rule.ablation);
      if (ablation === undefined) {
        ablation = simulateRiverfallFluidV1({
          ...options,
          ablation: rule.ablation,
        });
        byAblation.set(rule.ablation, ablation);
      }
      const baselineValue = summaryMetric(baseline.summary, rule.metric);
      const ablationValue = summaryMetric(ablation.summary, rule.metric);
      const observedDifference = rule.comparison === 'baseline-greater-by'
        ? baselineValue - ablationValue
        : ablationValue - baselineValue;
      return {
        rule,
        baselineInputHash: baseline.inputHash,
        baselineFinalHash: baseline.finalHash,
        ablationInputHash: ablation.inputHash,
        ablationFinalHash: ablation.finalHash,
        baselineValue,
        ablationValue,
        observedDifference,
        passed: observedDifference >= rule.minimumDifference,
      };
    },
  );
  return {
    schemaVersion: 'studio.riverfall-fluid-causal-evidence/1',
    frameCount: definition.frameCount,
    burnInSubsteps: definition.burnInSubsteps,
    baselineSummary: baseline.summary,
    observations,
  };
}

export function simulateRiverfallFluidEvidenceV1():
RiverfallFluidEvidenceTraceV1 {
  const trace = simulateRiverfallFluidV1();
  const causalEvidence = simulateRiverfallFluidCausalEvidenceV1();
  const failures = causalEvidence.observations.filter(({ passed }) => !passed);
  if (failures.length > 0) {
    throw new Error(
      'Cannot generate Riverfall fluid replay because causal evidence failed: '
      + failures.map(({ rule, baselineValue, ablationValue }) =>
        `${rule.ablation} ${rule.metric} expected ${rule.comparison} `
        + `${String(rule.minimumDifference)}, received baseline `
        + `${String(baselineValue)} and ablation ${String(ablationValue)}`,
      ).join('; '),
    );
  }
  const hash = createHash('sha256');
  hashStringField(hash, 'domain', 'studio.riverfall-fluid-evidence-trace/1');
  hashStringField(hash, 'baseFinalHash', trace.finalHash);
  hashStringField(
    hash,
    'causalEvidence',
    canonicalRiverfallFluidJsonV1(causalEvidence),
  );
  const finalHash = hash.digest('hex');
  return {
    ...trace,
    causalEvidence,
    finalHash,
    provenance: {
      ...trace.provenance,
      finalHash,
    },
  };
}
