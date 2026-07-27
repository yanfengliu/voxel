import { createHash, type Hash } from 'node:crypto';

import {
  canonicalRiverfallSurfaceTopologyJsonV1,
  RIVERFALL_SURFACE_CELLS_V1,
  type RiverfallSurfaceCellV1,
} from '../../tools/studio/riverfall-surface-grid.js';
import {
  MAX_POSE_REPLAY_SAMPLES,
} from '../../tools/studio/scene-pose-replay.js';
import type {
  RiverfallFluidEvidenceTraceV1,
} from './riverfall-fluid-evidence.js';
import {
  canonicalRiverfallFluidJsonV1,
} from './riverfall-fluid-config.js';
import {
  closeRiverfallSurfaceSignalLoopV1,
  writeRiverfallSurfaceVelocitiesV1,
} from './riverfall-fluid-surface-loop.js';

export interface RiverfallFluidSurfaceSupportDiagnosticsV1 {
  readonly metric: 'world-euclidean/1';
  readonly kernel: 'wendland-c2/1';
  readonly radius: number;
  readonly requiredMinimumParticles: number;
  readonly maximumInfluenceParticles: number;
  readonly observedMinimumParticles: number;
  readonly maximumNearestParticleDistance: number;
}

export interface RiverfallFluidSurfaceTraceV1 {
  readonly config: RiverfallFluidEvidenceTraceV1['config'];
  readonly frameCount: number;
  readonly placementIds: readonly string[];
  readonly translations: Float32Array;
  readonly rotations: Float32Array;
  readonly linearVelocities: Float32Array;
  readonly angularVelocities: Float32Array;
  readonly supportDiagnostics: RiverfallFluidSurfaceSupportDiagnosticsV1;
  readonly inputHash: string;
  readonly finalHash: string;
  readonly causalEvidence: RiverfallFluidEvidenceTraceV1['causalEvidence'];
  readonly provenance: RiverfallFluidEvidenceTraceV1['provenance'];
}

function updateField(
  hash: Hash,
  name: string,
  values: Float32Array,
): void {
  const bytes = new Uint8Array(values.byteLength);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, values[index]!, true);
  }
  hash.update(name);
  hash.update(bytes);
}

function updateStringField(hash: Hash, name: string, value: string): void {
  hash.update(`${name}:${String(Buffer.byteLength(value, 'utf8'))}:`);
  hash.update(value);
}

export function riverfallFluidSurfaceInputHashV1(
  trace: RiverfallFluidEvidenceTraceV1,
  cells: readonly RiverfallSurfaceCellV1[] = RIVERFALL_SURFACE_CELLS_V1,
): string {
  const hash = createHash('sha256');
  updateStringField(
    hash,
    'domain',
    'studio.riverfall-fluid-surface-input/1',
  );
  updateStringField(hash, 'particleInputHash', trace.inputHash);
  updateStringField(
    hash,
    'presentation',
    canonicalRiverfallFluidJsonV1(trace.config.presentation),
  );
  updateStringField(
    hash,
    'surfaceTopology',
    canonicalRiverfallSurfaceTopologyJsonV1(cells),
  );
  return hash.digest('hex');
}

function worldDistanceSquared(
  cell: RiverfallSurfaceCellV1,
  particle: readonly [number, number, number],
): number {
  const dx = particle[0] - cell.baseTranslation[0];
  const dy = particle[1] - cell.baseTranslation[1];
  const dz = particle[2] - cell.baseTranslation[2];
  return dx * dx + dy * dy + dz * dz;
}

export function riverfallFluidSurfaceKernelWeightV1(
  distance: number,
  radius: number,
): number {
  if (!Number.isFinite(distance)
    || !Number.isFinite(radius)
    || distance < 0
    || radius <= 0) {
    throw new Error(
      `Cannot sample the Riverfall compact surface kernel at distance ${
        String(distance)
      } with radius ${String(radius)}; expected a finite nonnegative distance `
      + 'and a finite positive radius.',
    );
  }
  if (distance >= radius) return 0;
  const q = distance / radius;
  const remaining = 1 - q;
  return remaining ** 4 * (1 + 4 * q);
}

function passiveTracerValues(
  trace: RiverfallFluidEvidenceTraceV1,
): Float64Array {
  const wavelength = trace.config.presentation
    .passiveTracer.longitudinalWavelength;
  const lateralWaveNumber = trace.config.presentation
    .passiveTracer.lateralWaveNumber;
  return Float64Array.from(
    trace.witnessParticleIndices,
    (_, witness) => {
      const phase = trace.recordingInitialLongitudinal[witness]!
          * Math.PI * 2 / wavelength
        + trace.recordingInitialLateral[witness]! * lateralWaveNumber;
      return 0.5 + Math.sin(phase) * 0.5;
    },
  );
}

interface SurfaceSignalSample {
  readonly passiveTracer: number;
  readonly localSpeed: number;
  readonly localOccupancy: number;
  readonly supportCount: number;
  readonly nearestDistance: number;
}

interface SurfaceParticleCandidate {
  readonly particle: number;
  readonly distance: number;
  readonly weight: number;
  readonly tracer: number;
  readonly speed: number;
}

function surfaceSignal(
  trace: RiverfallFluidEvidenceTraceV1,
  frame: number,
  cell: RiverfallSurfaceCellV1,
  tracerValues: Float64Array,
): SurfaceSignalSample {
  const candidates: SurfaceParticleCandidate[] = [];
  let nearestDistance = Number.POSITIVE_INFINITY;
  const particleCount = trace.config.particles.witnessCount;
  const radius = trace.config.presentation.support.radius;
  for (let particle = 0; particle < particleCount; particle += 1) {
    if (trace.visibleWitnesses[frame * particleCount + particle] === 0) continue;
    const offset = (frame * particleCount + particle) * 3;
    const position = [
      trace.translations[offset]!,
      trace.translations[offset + 1]!,
      trace.translations[offset + 2]!,
    ] as const;
    const velocity = [
      trace.linearVelocities[offset]!,
      trace.linearVelocities[offset + 1]!,
      trace.linearVelocities[offset + 2]!,
    ] as const;
    const distance = Math.sqrt(worldDistanceSquared(cell, position));
    nearestDistance = Math.min(nearestDistance, distance);
    const weight = riverfallFluidSurfaceKernelWeightV1(distance, radius);
    if (weight === 0) continue;
    candidates.push({
      particle,
      distance,
      weight,
      tracer: tracerValues[particle]!,
      speed: Math.min(
        1,
        Math.hypot(...velocity) / trace.config.particles.maximumSpeed,
      ),
    });
  }
  const supportCount = candidates.length;
  const required = trace.config.presentation.support.minimumParticles;
  if (supportCount < required) {
    throw new Error(
      `Cannot reconstruct Riverfall surface cell '${cell.id}' at frame ${String(frame)}; `
      + `found ${String(supportCount)} visible solver particles inside the ${
        String(radius)
      }-unit compact support (nearest distance ${
        Number.isFinite(nearestDistance)
          ? nearestDistance.toFixed(6)
          : 'none'
      }), but the canonical presentation requires at least ${
        String(required)
      }. Extend the simulated domain or increase particle coverage without `
      + 'falling back to distant extrapolation.',
    );
  }
  candidates.sort(
    (left, right) => left.distance - right.distance
      || left.particle - right.particle,
  );
  const selected = candidates.slice(
    0,
    trace.config.presentation.support.maximumInfluenceParticles,
  );
  let weightedTracer = 0;
  let weightedSpeed = 0;
  let totalWeight = 0;
  for (const candidate of selected) {
    weightedTracer += candidate.weight * candidate.tracer;
    weightedSpeed += candidate.weight * candidate.speed;
    totalWeight += candidate.weight;
  }
  if (!(totalWeight > 0)) {
    throw new Error(
      `Cannot reconstruct Riverfall surface cell '${cell.id}' at frame ${
        String(frame)
      }; its selected compact-kernel particle weights total ${
        String(totalWeight)
      }, but a finite positive total is required.`,
    );
  }
  const localOccupancy = 1 - Math.exp(
    -totalWeight * trace.config.density.restAreaDensity,
  );
  return {
    passiveTracer: weightedTracer / totalWeight,
    localSpeed: weightedSpeed / totalWeight,
    localOccupancy,
    supportCount,
    nearestDistance,
  };
}

function surfaceNeighbors(
  cells: readonly RiverfallSurfaceCellV1[],
): readonly (readonly number[])[] {
  return cells.map((cell, cellIndex) => cells.flatMap(
    (candidate, candidateIndex) => {
      if (candidateIndex === cellIndex) return [];
      const distance = Math.hypot(
        candidate.baseTranslation[0] - cell.baseTranslation[0],
        candidate.baseTranslation[1] - cell.baseTranslation[1],
        candidate.baseTranslation[2] - cell.baseTranslation[2],
      );
      return distance <= 2.01 ? [candidateIndex] : [];
    },
  ));
}

function smoothSurfaceSignals(
  rawSignals: Float32Array,
  frameCount: number,
  cells: readonly RiverfallSurfaceCellV1[],
  smoothing: number,
): Float32Array {
  if (!(smoothing >= 0 && smoothing <= 1)) {
    throw new Error(
      `Cannot smooth the Riverfall surface with factor ${String(smoothing)}; `
      + 'expected a finite value from 0 through 1.',
    );
  }
  const neighbors = surfaceNeighbors(cells);
  const result = new Float32Array(rawSignals.length);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let cell = 0; cell < cells.length; cell += 1) {
      const offset = frame * cells.length + cell;
      const adjacent = neighbors[cell]!;
      let neighborTotal = rawSignals[offset]!;
      for (const neighbor of adjacent) {
        neighborTotal += rawSignals[frame * cells.length + neighbor]!;
      }
      const localMean = neighborTotal / (adjacent.length + 1);
      result[offset] = Math.fround(
        rawSignals[offset]! * (1 - smoothing) + localMean * smoothing,
      );
    }
  }
  return result;
}

export function reconstructRiverfallFluidSurfaceV1(
  trace: RiverfallFluidEvidenceTraceV1,
): RiverfallFluidSurfaceTraceV1 {
  const cells = RIVERFALL_SURFACE_CELLS_V1;
  if (cells.length !== trace.config.presentation.cellCount) {
    throw new Error(
      `Cannot reconstruct Riverfall surface with ${String(cells.length)} authored cells; `
      + `the canonical fluid input requires exactly ${
        String(trace.config.presentation.cellCount)
      }. Regenerate the topology and input together.`,
    );
  }
  const surfaceFrameCount = trace.frameCount + 1;
  const replaySamples = surfaceFrameCount * cells.length;
  if (replaySamples > MAX_POSE_REPLAY_SAMPLES) {
    throw new Error(
      `Cannot reconstruct Riverfall surface with ${String(replaySamples)} frame-cell samples; `
      + `Studio accepts at most ${String(MAX_POSE_REPLAY_SAMPLES)} pose replay samples.`,
    );
  }
  const signalWeightTotal = Object.values(
    trace.config.presentation.signalWeights,
  ).reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(signalWeightTotal - 1) > 1e-9) {
    throw new Error(
      `Cannot reconstruct Riverfall surface with signal weights totaling ${
        String(signalWeightTotal)
      }; advected wave, passive tracer, local speed, and local occupancy `
      + 'weights must total exactly 1.',
    );
  }
  const tracerValues = passiveTracerValues(trace);
  const rawSignals = new Float32Array(replaySamples);
  let observedMinimumParticles = Number.POSITIVE_INFINITY;
  let maximumNearestParticleDistance = 0;
  const phaseTravel = new Float64Array(cells.length);
  const wave = trace.config.presentation.advectedWave;
  const waveNumber = Math.PI * 2 / wave.wavelength;
  const frameSeconds = trace.fixedStepMs / 1_000;
  for (let frame = 0; frame < trace.frameCount; frame += 1) {
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const sample = surfaceSignal(
        trace,
        frame,
        cells[cellIndex]!,
        tracerValues,
      );
      const advectedWave = 0.5 + Math.sin(
        (cells[cellIndex]!.flowDistance - phaseTravel[cellIndex]!)
          * waveNumber,
      ) * 0.5;
      const weights = trace.config.presentation.signalWeights;
      const signal = weights.advectedWave * advectedWave
        + weights.passiveTracer * sample.passiveTracer
        + weights.localSpeed * sample.localSpeed
        + weights.localOccupancy * sample.localOccupancy;
      rawSignals[frame * cells.length + cellIndex] = Math.fround(
        Math.max(0, Math.min(1, signal)),
      );
      phaseTravel[cellIndex] = phaseTravel[cellIndex]!
        + (
          wave.minimumPhaseSpeed
          + sample.localSpeed
            * trace.config.particles.maximumSpeed
            * wave.localSpeedScale
        ) * frameSeconds;
      observedMinimumParticles = Math.min(
        observedMinimumParticles,
        sample.supportCount,
      );
      maximumNearestParticleDistance = Math.max(
        maximumNearestParticleDistance,
        sample.nearestDistance,
      );
    }
  }
  const smoothedSignals = smoothSurfaceSignals(
    rawSignals,
    trace.frameCount,
    cells,
    trace.config.presentation.spatialSmoothing,
  );
  const signals = closeRiverfallSurfaceSignalLoopV1(
    smoothedSignals,
    trace.frameCount,
    cells.length,
    trace.config.presentation.loopClosure.transitionFrames,
  );
  const vectorCount = surfaceFrameCount * cells.length * 3;
  const translations = new Float32Array(vectorCount);
  const rotations = new Float32Array(surfaceFrameCount * cells.length * 4);
  const linearVelocities = new Float32Array(vectorCount);
  const angularVelocities = new Float32Array(vectorCount);
  for (let frame = 0; frame < surfaceFrameCount; frame += 1) {
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex]!;
      const signal = signals[frame * cells.length + cellIndex]!;
      const [minimumExcursion, maximumExcursion] =
        trace.config.presentation.normalExcursion;
      const excursion = minimumExcursion
        + signal * (maximumExcursion - minimumExcursion);
      const vectorOffset = (frame * cells.length + cellIndex) * 3;
      translations[vectorOffset] = Math.fround(
        cell.baseTranslation[0] + cell.normal[0] * excursion,
      );
      translations[vectorOffset + 1] = Math.fround(
        cell.baseTranslation[1] + cell.normal[1] * excursion,
      );
      translations[vectorOffset + 2] = Math.fround(
        cell.baseTranslation[2] + cell.normal[2] * excursion,
      );
      rotations.set(
        cell.quaternion,
        (frame * cells.length + cellIndex) * 4,
      );
    }
  }
  writeRiverfallSurfaceVelocitiesV1(
    translations,
    linearVelocities,
    surfaceFrameCount,
    cells.length,
    trace.fixedStepMs,
  );
  const hash = createHash('sha256');
  const inputHash = riverfallFluidSurfaceInputHashV1(trace, cells);
  updateStringField(
    hash,
    'domain',
    'studio.riverfall-fluid-surface-trace/1',
  );
  updateStringField(hash, 'surfaceInputHash', inputHash);
  updateStringField(hash, 'particleTraceHash', trace.finalHash);
  updateStringField(
    hash,
    'reconstruction',
    trace.config.presentation.reconstruction,
  );
  updateStringField(
    hash,
    'surfaceTopology',
    canonicalRiverfallSurfaceTopologyJsonV1(cells),
  );
  const supportDiagnostics: RiverfallFluidSurfaceSupportDiagnosticsV1 = {
    metric: trace.config.presentation.support.metric,
    kernel: trace.config.presentation.support.kernel,
    radius: trace.config.presentation.support.radius,
    requiredMinimumParticles:
      trace.config.presentation.support.minimumParticles,
    maximumInfluenceParticles:
      trace.config.presentation.support.maximumInfluenceParticles,
    observedMinimumParticles,
    maximumNearestParticleDistance,
  };
  updateStringField(
    hash,
    'supportDiagnostics',
    JSON.stringify(supportDiagnostics),
  );
  updateField(hash, 'translations', translations);
  updateField(hash, 'rotations', rotations);
  updateField(hash, 'linearVelocities', linearVelocities);
  updateField(hash, 'angularVelocities', angularVelocities);
  const finalHash = hash.digest('hex');
  return {
    config: trace.config,
    frameCount: surfaceFrameCount,
    placementIds: cells.map(({ id }) => id),
    translations,
    rotations,
    linearVelocities,
    angularVelocities,
    supportDiagnostics,
    inputHash,
    finalHash,
    causalEvidence: trace.causalEvidence,
    provenance: {
      ...trace.provenance,
      inputHash,
      finalHash,
    },
  };
}
