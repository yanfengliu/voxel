import { createHash, type Hash } from 'node:crypto';

import {
  validateRiverfallFluidDomainV1,
} from '../../tools/studio/riverfall-fluid-domain.js';
import {
  canonicalRiverfallFluidInputJsonV1,
  canonicalRiverfallFluidJsonV1,
  createRiverfallFluidConfigV1,
  RIVERFALL_FLUID_WITNESS_COUNT,
  type RiverfallFluidConfigOverridesV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import {
  createInitialRiverfallFluidStateV1,
  createRiverfallFluidWorkspaceV1,
  mapRiverfallFluidParticleToWorldV1,
  stepRiverfallFluidV1,
  type RiverfallFluidStateV1,
  type RiverfallFluidStepDiagnosticsV1,
} from './riverfall-pbf.js';

export interface RiverfallFluidTraceDiagnosticsV1 {
  readonly visibleParticles: Uint16Array;
  readonly hiddenParticles: Uint16Array;
  readonly neighborPairs: Uint16Array;
  readonly minimumNeighbors: Uint16Array;
  readonly maximumDensityError: Float32Array;
  readonly p95DensityError: Float32Array;
  readonly maximumSpeed: Float32Array;
  readonly maximumFallSpeed: Float32Array;
  readonly maximumBoundaryCorrection: Float32Array;
  readonly maximumResidualPenetration: Float32Array;
  readonly meanNeighborRelativeSpeed: Float32Array;
  readonly lipAttachmentCount: Uint16Array;
  readonly lipAttachmentImpulse: Float32Array;
  readonly impactCount: Uint16Array;
  readonly impactImpulse: Float32Array;
  readonly outflowCrossings: Uint16Array;
  readonly recycleCount: Uint16Array;
}

export interface RiverfallFluidTraceSummaryV1 {
  readonly maximumDensityError: number;
  readonly maximumP95DensityError: number;
  readonly maximumSpeed: number;
  readonly maximumFallSpeed: number;
  readonly maximumBoundaryCorrection: number;
  readonly maximumResidualPenetration: number;
  readonly meanNeighborRelativeSpeed: number;
  readonly minimumNeighbors: number;
  readonly lipAttachmentCount: number;
  readonly lipAttachmentImpulse: number;
  readonly impactCount: number;
  readonly impactImpulse: number;
  readonly outflowCrossings: number;
  readonly recycleCount: number;
}

export interface RiverfallFluidTraceV1 {
  readonly config: RiverfallFluidConfigV1;
  readonly fixedStepMs: number;
  readonly frameCount: number;
  readonly placementIds: readonly string[];
  readonly witnessParticleIndices: Uint16Array;
  /** Frame-major, then witness-major. */
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
  readonly diagnostics: RiverfallFluidTraceDiagnosticsV1;
  readonly summary: RiverfallFluidTraceSummaryV1;
  readonly finalState: RiverfallFluidStateV1;
  readonly inputHash: string;
  readonly finalHash: string;
  readonly provenance: {
    readonly solver: { readonly name: string; readonly version: string };
    readonly fixedTimestepMs: number;
    readonly gravity: readonly [number, number, number];
    readonly inputHash: string;
    readonly finalHash: string;
    readonly lawLabels: readonly string[];
    readonly capabilityLabels: readonly string[];
  };
}

function validateConfig(config: RiverfallFluidConfigV1): void {
  const issues = validateRiverfallFluidDomainV1(config.domain);
  if (issues.length > 0) {
    throw new Error(
      'Cannot simulate Riverfall fluid because its domain is invalid: '
      + issues.map((issue) => `${issue.path} ${issue.message}`).join('; '),
    );
  }
  if (!Number.isInteger(config.particles.witnessStride)
    || config.particles.witnessStride < 1
    || config.particles.witnessCount * config.particles.witnessStride
      !== config.particles.count) {
    throw new Error(
      `Cannot simulate ${String(config.particles.count)} Riverfall particles with `
      + `${String(config.particles.witnessCount)} witnesses at stride `
      + `${String(config.particles.witnessStride)}; expected witnessCount * stride `
      + 'to equal particle count exactly.',
    );
  }
  if (config.recording.substepsPerFrame * config.recording.substepMs
    !== config.recording.recordStepMs) {
    throw new Error(
      `Cannot simulate Riverfall recording step ${String(config.recording.recordStepMs)} ms `
      + `from ${String(config.recording.substepsPerFrame)} substeps of `
      + `${String(config.recording.substepMs)} ms; the product must match exactly.`,
    );
  }
  if (config.recording.burnInSubsteps < 1) {
    throw new Error(
      `Cannot simulate Riverfall fluid with ${String(config.recording.burnInSubsteps)} `
      + 'burn-in substeps; expected at least one so frame zero is an observed warmed state.',
    );
  }
}

function createDiagnostics(frameCount: number): RiverfallFluidTraceDiagnosticsV1 {
  return {
    visibleParticles: new Uint16Array(frameCount),
    hiddenParticles: new Uint16Array(frameCount),
    neighborPairs: new Uint16Array(frameCount),
    minimumNeighbors: new Uint16Array(frameCount),
    maximumDensityError: new Float32Array(frameCount),
    p95DensityError: new Float32Array(frameCount),
    maximumSpeed: new Float32Array(frameCount),
    maximumFallSpeed: new Float32Array(frameCount),
    maximumBoundaryCorrection: new Float32Array(frameCount),
    maximumResidualPenetration: new Float32Array(frameCount),
    meanNeighborRelativeSpeed: new Float32Array(frameCount),
    lipAttachmentCount: new Uint16Array(frameCount),
    lipAttachmentImpulse: new Float32Array(frameCount),
    impactCount: new Uint16Array(frameCount),
    impactImpulse: new Float32Array(frameCount),
    outflowCrossings: new Uint16Array(frameCount),
    recycleCount: new Uint16Array(frameCount),
  };
}

function combineStepDiagnostics(
  steps: readonly RiverfallFluidStepDiagnosticsV1[],
): RiverfallFluidStepDiagnosticsV1 {
  const last = steps.at(-1);
  if (last === undefined) {
    throw new Error(
      'Cannot combine Riverfall fluid diagnostics without at least one fixed substep.',
    );
  }
  return {
    visibleParticles: last.visibleParticles,
    hiddenParticles: last.hiddenParticles,
    neighborPairs: last.neighborPairs,
    minimumNeighbors: Math.min(...steps.map((step) => step.minimumNeighbors)),
    maximumDensityError: Math.max(...steps.map((step) => step.maximumDensityError)),
    p95DensityError: Math.max(...steps.map((step) => step.p95DensityError)),
    maximumSpeed: Math.max(...steps.map((step) => step.maximumSpeed)),
    maximumFallSpeed: Math.max(...steps.map((step) => step.maximumFallSpeed)),
    maximumBoundaryCorrection: Math.max(
      ...steps.map((step) => step.maximumBoundaryCorrection),
    ),
    maximumResidualPenetration: Math.max(
      ...steps.map((step) => step.maximumResidualPenetration),
    ),
    meanNeighborRelativeSpeed: steps.reduce(
      (sum, step) => sum + step.meanNeighborRelativeSpeed,
      0,
    ) / steps.length,
    lipAttachmentCount: steps.reduce(
      (sum, step) => sum + step.lipAttachmentCount,
      0,
    ),
    lipAttachmentImpulse: steps.reduce(
      (sum, step) => sum + step.lipAttachmentImpulse,
      0,
    ),
    impactCount: steps.reduce((sum, step) => sum + step.impactCount, 0),
    impactImpulse: steps.reduce((sum, step) => sum + step.impactImpulse, 0),
    outflowCrossings: steps.reduce(
      (sum, step) => sum + step.outflowCrossings,
      0,
    ),
    recycleCount: steps.reduce((sum, step) => sum + step.recycleCount, 0),
  };
}

function writeDiagnostics(
  target: RiverfallFluidTraceDiagnosticsV1,
  frame: number,
  source: RiverfallFluidStepDiagnosticsV1,
): void {
  for (const field of [
    'visibleParticles',
    'hiddenParticles',
    'neighborPairs',
    'minimumNeighbors',
    'maximumDensityError',
    'p95DensityError',
    'maximumSpeed',
    'maximumFallSpeed',
    'maximumBoundaryCorrection',
    'maximumResidualPenetration',
    'meanNeighborRelativeSpeed',
    'lipAttachmentCount',
    'lipAttachmentImpulse',
    'impactCount',
    'impactImpulse',
    'outflowCrossings',
    'recycleCount',
  ] as const) {
    target[field][frame] = source[field];
  }
}

function witnessIndices(config: RiverfallFluidConfigV1): Uint16Array {
  return Uint16Array.from(
    { length: config.particles.witnessCount },
    (_, index) => index * config.particles.witnessStride,
  );
}

export function riverfallFluidPlacementIdV1(index: number): string {
  if (!Number.isInteger(index)
    || index < 0
    || index >= RIVERFALL_FLUID_WITNESS_COUNT) {
    throw new Error(
      `Cannot name Riverfall fluid witness ${String(index)}; expected an integer `
      + `from 0 through ${String(RIVERFALL_FLUID_WITNESS_COUNT - 1)}.`,
    );
  }
  return `flow-${String(index).padStart(2, '0')}`;
}

function captureFrame(
  frame: number,
  state: RiverfallFluidStateV1,
  config: RiverfallFluidConfigV1,
  indices: Uint16Array,
  translations: Float32Array,
  rotations: Float32Array,
  linearVelocities: Float32Array,
): void {
  for (let witness = 0; witness < indices.length; witness += 1) {
    const particle = indices[witness]!;
    const mapped = mapRiverfallFluidParticleToWorldV1(state, particle, config);
    const vectorOffset = (frame * indices.length + witness) * 3;
    const rotationOffset = (frame * indices.length + witness) * 4;
    translations.set(mapped.position, vectorOffset);
    linearVelocities.set(mapped.velocity, vectorOffset);
    rotations[rotationOffset + 3] = 1;
  }
}

function numberMaximum(values: Float32Array): number {
  let maximum = 0;
  for (const value of values) maximum = Math.max(maximum, value);
  return maximum;
}

function numberMinimum(values: Uint16Array): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const value of values) minimum = Math.min(minimum, value);
  return Number.isFinite(minimum) ? minimum : 0;
}

function numberSum(values: Uint16Array | Float32Array): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum;
}

function summarize(
  diagnostics: RiverfallFluidTraceDiagnosticsV1,
): RiverfallFluidTraceSummaryV1 {
  return {
    maximumDensityError: numberMaximum(diagnostics.maximumDensityError),
    maximumP95DensityError: numberMaximum(diagnostics.p95DensityError),
    maximumSpeed: numberMaximum(diagnostics.maximumSpeed),
    maximumFallSpeed: numberMaximum(diagnostics.maximumFallSpeed),
    maximumBoundaryCorrection: numberMaximum(
      diagnostics.maximumBoundaryCorrection,
    ),
    maximumResidualPenetration: numberMaximum(
      diagnostics.maximumResidualPenetration,
    ),
    meanNeighborRelativeSpeed:
      numberSum(diagnostics.meanNeighborRelativeSpeed)
      / diagnostics.meanNeighborRelativeSpeed.length,
    minimumNeighbors: numberMinimum(diagnostics.minimumNeighbors),
    lipAttachmentCount: numberSum(diagnostics.lipAttachmentCount),
    lipAttachmentImpulse: numberSum(diagnostics.lipAttachmentImpulse),
    impactCount: numberSum(diagnostics.impactCount),
    impactImpulse: numberSum(diagnostics.impactImpulse),
    outflowCrossings: numberSum(diagnostics.outflowCrossings),
    recycleCount: numberSum(diagnostics.recycleCount),
  };
}

function littleEndianBytes(values: ArrayBufferView): Uint8Array {
  const count = values.byteLength / (
    values instanceof Float32Array ? Float32Array.BYTES_PER_ELEMENT
      : Uint16Array.BYTES_PER_ELEMENT
  );
  const bytes = new Uint8Array(values.byteLength);
  const output = new DataView(bytes.buffer);
  if (values instanceof Float32Array) {
    for (let index = 0; index < count; index += 1) {
      output.setFloat32(index * 4, values[index]!, true);
    }
  } else if (values instanceof Uint16Array) {
    for (let index = 0; index < count; index += 1) {
      output.setUint16(index * 2, values[index]!, true);
    }
  } else {
    throw new Error(
      `Cannot hash Riverfall fluid ${values.constructor.name}; `
      + 'expected Float32Array or Uint16Array.',
    );
  }
  return bytes;
}

function hashField(
  hash: Hash,
  name: string,
  value: string | ArrayBufferView,
): void {
  const nameBytes = new TextEncoder().encode(name);
  const valueBytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : littleEndianBytes(value);
  const length = new Uint8Array(8);
  const view = new DataView(length.buffer);
  view.setUint32(0, nameBytes.length, true);
  view.setUint32(4, valueBytes.length, true);
  hash.update(length);
  hash.update(nameBytes);
  hash.update(valueBytes);
}

function finalTraceHash(
  inputHash: string,
  translations: Float32Array,
  rotations: Float32Array,
  linearVelocities: Float32Array,
  angularVelocities: Float32Array,
  diagnostics: RiverfallFluidTraceDiagnosticsV1,
  summary: RiverfallFluidTraceSummaryV1,
  finalState: RiverfallFluidStateV1,
  witnessParticleIndices: Uint16Array,
  placementIds: readonly string[],
): string {
  const hash = createHash('sha256');
  hashField(hash, 'domain', 'studio.riverfall-fluid-trace/1');
  hashField(hash, 'inputHash', inputHash);
  hashField(hash, 'witnessParticleIndices', witnessParticleIndices);
  hashField(hash, 'placementIds', canonicalRiverfallFluidJsonV1(placementIds));
  for (const [name, values] of Object.entries({
    translations,
    rotations,
    linearVelocities,
    angularVelocities,
    ...diagnostics,
    finalLongitudinal: finalState.longitudinal,
    finalLateral: finalState.lateral,
    finalLongitudinalVelocity: finalState.longitudinalVelocity,
    finalLateralVelocity: finalState.lateralVelocity,
  })) {
    hashField(hash, name, values);
  }
  hashField(hash, 'summary', JSON.stringify(summary));
  return hash.digest('hex');
}

export function simulateRiverfallFluidV1(
  overrides: RiverfallFluidConfigOverridesV1 = {},
): RiverfallFluidTraceV1 {
  const config = createRiverfallFluidConfigV1(overrides);
  validateConfig(config);
  const state = createInitialRiverfallFluidStateV1(config);
  const workspace = createRiverfallFluidWorkspaceV1(config.particles.count);
  let lastStep: RiverfallFluidStepDiagnosticsV1 | null = null;
  for (let step = 0; step < config.recording.burnInSubsteps; step += 1) {
    lastStep = stepRiverfallFluidV1(state, config, workspace);
  }
  if (lastStep === null) {
    throw new Error(
      'Cannot capture Riverfall fluid frame zero because burn-in produced no observed substep.',
    );
  }
  const indices = witnessIndices(config);
  const vectorValues = config.recording.frameCount * indices.length * 3;
  const translations = new Float32Array(vectorValues);
  const rotations = new Float32Array(
    config.recording.frameCount * indices.length * 4,
  );
  const linearVelocities = new Float32Array(vectorValues);
  const angularVelocities = new Float32Array(vectorValues);
  const diagnostics = createDiagnostics(config.recording.frameCount);
  captureFrame(
    0,
    state,
    config,
    indices,
    translations,
    rotations,
    linearVelocities,
  );
  writeDiagnostics(diagnostics, 0, {
    ...lastStep,
    lipAttachmentCount: 0,
    lipAttachmentImpulse: 0,
    impactCount: 0,
    impactImpulse: 0,
    outflowCrossings: 0,
    recycleCount: 0,
  });
  for (let frame = 1; frame < config.recording.frameCount; frame += 1) {
    const substeps: RiverfallFluidStepDiagnosticsV1[] = [];
    for (let substep = 0;
      substep < config.recording.substepsPerFrame;
      substep += 1) {
      substeps.push(stepRiverfallFluidV1(state, config, workspace));
    }
    writeDiagnostics(diagnostics, frame, combineStepDiagnostics(substeps));
    captureFrame(
      frame,
      state,
      config,
      indices,
      translations,
      rotations,
      linearVelocities,
    );
  }
  const summary = summarize(diagnostics);
  const placementIds = Object.freeze(
    Array.from(
      { length: config.particles.witnessCount },
      (_, index) => riverfallFluidPlacementIdV1(index),
    ),
  );
  const inputHash = createHash('sha256')
    .update(canonicalRiverfallFluidInputJsonV1(config))
    .digest('hex');
  const finalHash = finalTraceHash(
    inputHash,
    translations,
    rotations,
    linearVelocities,
    angularVelocities,
    diagnostics,
    summary,
    state,
    indices,
    placementIds,
  );
  return {
    config,
    fixedStepMs: config.recording.recordStepMs,
    frameCount: config.recording.frameCount,
    placementIds,
    witnessParticleIndices: indices,
    translations,
    rotations,
    linearVelocities,
    angularVelocities,
    diagnostics,
    summary,
    finalState: state,
    inputHash,
    finalHash,
    provenance: {
      solver: {
        name: config.solver.name,
        version: config.solver.version,
      },
      fixedTimestepMs: config.recording.recordStepMs,
      gravity: config.forcing.gravity,
      inputHash,
      finalHash,
      lawLabels: config.lawLabels,
      capabilityLabels: config.capabilityLabels,
    },
  };
}
