import {
  riverfallFluidDomainLengthV1,
} from '../../tools/studio/riverfall-fluid-domain.js';
import {
  RIVERFALL_FLUID_PARTICLE_COUNT,
} from './riverfall-fluid-config.js';
import {
  riverfallFluidStripPenetrationV1,
} from './riverfall-pbf.js';
import type {
  RiverfallFluidTraceDiagnosticsV1,
  RiverfallFluidTraceSummaryV1,
  RiverfallFluidTraceV1,
} from './riverfall-fluid-simulation.js';

export const RIVERFALL_FLUID_CANONICAL_ACCEPTANCE_V1 = Object.freeze({
  particleCount: RIVERFALL_FLUID_PARTICLE_COUNT,
  maximumP95DensityError: 0.01,
  maximumDensityError: 0.3,
  maximumSpeed: 24,
  maximumBoundaryCorrection: 0.5,
  maximumResidualPenetration: 1e-5,
} as const);

type NumericArray = Float32Array | Uint16Array;

function actual(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function requireExact(
  issues: string[],
  metric: string,
  value: unknown,
  required: unknown,
): void {
  if (!Object.is(value, required)) {
    issues.push(
      `${metric} actual ${actual(value)}; required exactly ${actual(required)}`,
    );
  }
}

function requireLength(
  issues: string[],
  metric: string,
  values: ArrayLike<unknown>,
  required: number,
): void {
  if (values.length !== required) {
    issues.push(
      `${metric}.length actual ${String(values.length)}; `
      + `required exactly ${String(required)}`,
    );
  }
}

function requireFinite(
  issues: string[],
  metric: string,
  values: Float32Array | readonly number[],
): void {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!Number.isFinite(value)) {
      issues.push(
        `${metric}[${String(index)}] actual ${String(value)}; `
        + 'required a finite number',
      );
    }
  }
}

function maximum(values: Float32Array): number {
  let result = Number.NEGATIVE_INFINITY;
  for (const value of values) result = Math.max(result, value);
  return result;
}

function requireAtMost(
  issues: string[],
  metric: string,
  value: number,
  required: number,
): void {
  if (!Number.isFinite(value) || value > required) {
    issues.push(
      `${metric} actual ${String(value)}; required at most ${String(required)}`,
    );
  }
}

function requireLessThan(
  issues: string[],
  metric: string,
  value: number,
  required: number,
): void {
  if (!Number.isFinite(value) || value >= required) {
    issues.push(
      `${metric} actual ${String(value)}; required less than ${String(required)}`,
    );
  }
}

function diagnosticEntries(
  diagnostics: RiverfallFluidTraceDiagnosticsV1,
): readonly (readonly [string, NumericArray])[] {
  return [
    ['visibleParticles', diagnostics.visibleParticles],
    ['hiddenParticles', diagnostics.hiddenParticles],
    ['neighborPairs', diagnostics.neighborPairs],
    ['minimumNeighbors', diagnostics.minimumNeighbors],
    ['maximumDensityError', diagnostics.maximumDensityError],
    ['p95DensityError', diagnostics.p95DensityError],
    ['maximumSpeed', diagnostics.maximumSpeed],
    ['maximumFallSpeed', diagnostics.maximumFallSpeed],
    ['maximumBoundaryCorrection', diagnostics.maximumBoundaryCorrection],
    ['maximumResidualPenetration', diagnostics.maximumResidualPenetration],
    ['meanNeighborRelativeSpeed', diagnostics.meanNeighborRelativeSpeed],
    ['lipAttachmentCount', diagnostics.lipAttachmentCount],
    ['lipAttachmentImpulse', diagnostics.lipAttachmentImpulse],
    ['impactCount', diagnostics.impactCount],
    ['impactImpulse', diagnostics.impactImpulse],
    ['outflowCrossings', diagnostics.outflowCrossings],
    ['recycleCount', diagnostics.recycleCount],
  ];
}

function summaryEntries(
  summary: RiverfallFluidTraceSummaryV1,
): readonly (readonly [string, number])[] {
  return Object.entries(summary);
}

function validateShape(
  trace: RiverfallFluidTraceV1,
  issues: string[],
): void {
  const particleCount =
    RIVERFALL_FLUID_CANONICAL_ACCEPTANCE_V1.particleCount;
  const witnessCount = trace.config.particles.witnessCount;
  const vectorValues = trace.frameCount * witnessCount * 3;
  requireExact(
    issues,
    'config.ablation',
    trace.config.ablation,
    'baseline',
  );
  requireExact(
    issues,
    'config.particles.count',
    trace.config.particles.count,
    particleCount,
  );
  requireExact(
    issues,
    'config.particles.witnessCount',
    witnessCount,
    particleCount,
  );
  requireExact(
    issues,
    'frameCount',
    trace.frameCount,
    trace.config.recording.frameCount,
  );
  requireLength(issues, 'placementIds', trace.placementIds, witnessCount);
  requireLength(
    issues,
    'witnessParticleIndices',
    trace.witnessParticleIndices,
    witnessCount,
  );
  requireLength(
    issues,
    'recordingInitialLongitudinal',
    trace.recordingInitialLongitudinal,
    witnessCount,
  );
  requireLength(
    issues,
    'recordingInitialLateral',
    trace.recordingInitialLateral,
    witnessCount,
  );
  requireLength(
    issues,
    'visibleWitnesses',
    trace.visibleWitnesses,
    trace.frameCount * witnessCount,
  );
  requireLength(issues, 'translations', trace.translations, vectorValues);
  requireLength(
    issues,
    'rotations',
    trace.rotations,
    trace.frameCount * witnessCount * 4,
  );
  requireLength(
    issues,
    'linearVelocities',
    trace.linearVelocities,
    vectorValues,
  );
  requireLength(
    issues,
    'angularVelocities',
    trace.angularVelocities,
    vectorValues,
  );
  for (const [name, values] of diagnosticEntries(trace.diagnostics)) {
    requireLength(issues, `diagnostics.${name}`, values, trace.frameCount);
  }
  for (const [name, values] of Object.entries(trace.finalState)) {
    requireLength(issues, `finalState.${name}`, values, particleCount);
  }
  const uniqueIndices = new Set<number>();
  for (let witness = 0;
    witness < trace.witnessParticleIndices.length;
    witness += 1) {
    const particle = trace.witnessParticleIndices[witness]!;
    uniqueIndices.add(particle);
    if (particle >= particleCount) {
      issues.push(
        `witnessParticleIndices[${String(witness)}] actual ${
          String(particle)
        }; required an integer from 0 through ${String(particleCount - 1)}`,
      );
    }
  }
  requireExact(
    issues,
    'unique witness particle indices',
    uniqueIndices.size,
    witnessCount,
  );
  for (let sample = 0; sample < trace.visibleWitnesses.length; sample += 1) {
    const visibility = trace.visibleWitnesses[sample]!;
    if (visibility !== 0 && visibility !== 1) {
      issues.push(
        `visibleWitnesses[${String(sample)}] actual ${String(visibility)}; `
        + 'required exactly 0 or 1',
      );
    }
  }
}

function validateFiniteness(
  trace: RiverfallFluidTraceV1,
  issues: string[],
): void {
  for (const [name, values] of [
    ['translations', trace.translations],
    ['rotations', trace.rotations],
    ['linearVelocities', trace.linearVelocities],
    ['angularVelocities', trace.angularVelocities],
    ['recordingInitialLongitudinal', trace.recordingInitialLongitudinal],
    ['recordingInitialLateral', trace.recordingInitialLateral],
    ...Object.entries(trace.finalState),
  ] as const) {
    requireFinite(issues, name, values);
  }
  for (const [name, values] of diagnosticEntries(trace.diagnostics)) {
    if (values instanceof Float32Array) {
      requireFinite(issues, `diagnostics.${name}`, values);
    }
  }
  for (const [name, value] of summaryEntries(trace.summary)) {
    if (!Number.isFinite(value)) {
      issues.push(
        `summary.${name} actual ${String(value)}; required a finite number`,
      );
    }
  }
}

function validateParticleAccounting(
  trace: RiverfallFluidTraceV1,
  issues: string[],
): void {
  const required = RIVERFALL_FLUID_CANONICAL_ACCEPTANCE_V1.particleCount;
  const frames = Math.min(
    trace.frameCount,
    trace.diagnostics.visibleParticles.length,
    trace.diagnostics.hiddenParticles.length,
  );
  for (let frame = 0; frame < frames; frame += 1) {
    const actualCount = trace.diagnostics.visibleParticles[frame]!
      + trace.diagnostics.hiddenParticles[frame]!;
    requireExact(
      issues,
      `diagnostics particle accounting at frame ${String(frame)}`,
      actualCount,
      required,
    );
  }
}

function validateBoundaries(
  trace: RiverfallFluidTraceV1,
  issues: string[],
): void {
  const length = riverfallFluidDomainLengthV1(trace.config.domain);
  let maximumFinalPenetration = 0;
  const particles = Math.min(
    trace.finalState.longitudinal.length,
    trace.finalState.lateral.length,
  );
  for (let particle = 0; particle < particles; particle += 1) {
    const longitudinal = trace.finalState.longitudinal[particle]!;
    const lateral = trace.finalState.lateral[particle]!;
    if (!Number.isFinite(longitudinal) || !Number.isFinite(lateral)) continue;
    if (longitudinal < 0 || longitudinal >= length) {
      issues.push(
        `finalState.longitudinal[${String(particle)}] actual ${
          String(longitudinal)
        }; required at least 0 and less than ${String(length)}`,
      );
      continue;
    }
    maximumFinalPenetration = Math.max(
      maximumFinalPenetration,
      riverfallFluidStripPenetrationV1(
        trace.config,
        longitudinal,
        lateral,
      ),
    );
  }
  requireAtMost(
    issues,
    'finalState maximum boundary penetration',
    maximumFinalPenetration,
    RIVERFALL_FLUID_CANONICAL_ACCEPTANCE_V1.maximumResidualPenetration,
  );
}

function validateAbsoluteMetrics(
  trace: RiverfallFluidTraceV1,
  issues: string[],
): void {
  const requirements = RIVERFALL_FLUID_CANONICAL_ACCEPTANCE_V1;
  const maximumP95DensityError = maximum(
    trace.diagnostics.p95DensityError,
  );
  const maximumDensityError = maximum(
    trace.diagnostics.maximumDensityError,
  );
  const maximumSpeed = maximum(trace.diagnostics.maximumSpeed);
  const maximumBoundaryCorrection = maximum(
    trace.diagnostics.maximumBoundaryCorrection,
  );
  const maximumResidualPenetration = maximum(
    trace.diagnostics.maximumResidualPenetration,
  );
  requireAtMost(
    issues,
    'maximumP95DensityError',
    maximumP95DensityError,
    requirements.maximumP95DensityError,
  );
  requireAtMost(
    issues,
    'maximumDensityError',
    maximumDensityError,
    requirements.maximumDensityError,
  );
  requireAtMost(
    issues,
    'maximumSpeed',
    maximumSpeed,
    requirements.maximumSpeed,
  );
  requireLessThan(
    issues,
    'maximumBoundaryCorrection',
    maximumBoundaryCorrection,
    requirements.maximumBoundaryCorrection,
  );
  requireAtMost(
    issues,
    'maximumResidualPenetration',
    maximumResidualPenetration,
    requirements.maximumResidualPenetration,
  );
  for (const [metric, diagnosticValue, summaryValue] of [
    [
      'maximumP95DensityError',
      maximumP95DensityError,
      trace.summary.maximumP95DensityError,
    ],
    [
      'maximumDensityError',
      maximumDensityError,
      trace.summary.maximumDensityError,
    ],
    ['maximumSpeed', maximumSpeed, trace.summary.maximumSpeed],
    [
      'maximumBoundaryCorrection',
      maximumBoundaryCorrection,
      trace.summary.maximumBoundaryCorrection,
    ],
    [
      'maximumResidualPenetration',
      maximumResidualPenetration,
      trace.summary.maximumResidualPenetration,
    ],
  ] as const) {
    requireExact(
      issues,
      `summary.${metric}`,
      summaryValue,
      diagnosticValue,
    );
  }
}

export function assertRiverfallFluidCanonicalTraceAcceptedV1(
  trace: RiverfallFluidTraceV1,
): void {
  const issues: string[] = [];
  validateShape(trace, issues);
  validateFiniteness(trace, issues);
  validateParticleAccounting(trace, issues);
  validateBoundaries(trace, issues);
  validateAbsoluteMetrics(trace, issues);
  if (issues.length > 0) {
    throw new Error(
      'Cannot accept canonical Riverfall fluid trace: '
      + `${issues.join('; ')}.`,
    );
  }
}
