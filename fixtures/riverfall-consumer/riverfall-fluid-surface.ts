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
} from '../../tools/studio/riverfall-fluid-config.js';
import {
  closeRiverfallSurfaceSignalLoopV1,
  writeRiverfallSurfaceAngularVelocitiesV1,
  writeRiverfallSurfaceVelocitiesV1,
} from './riverfall-fluid-surface-loop.js';
import {
  riverfallSurfaceSignalV1,
  riverfallSurfaceTracerValuesV1,
  riverfallSurfaceTiltFramesV1,
  riverfallTiltedCellQuaternionV1,
  smoothRiverfallSurfaceSignalsV1,
  type RiverfallSurfaceParticleFrameV1,
} from '../../tools/studio/riverfall-surface-mapping.js';


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



/**
 * The per-frame surface arithmetic moved to
 * `tools/studio/riverfall-surface-mapping.ts` so the live scene can run the
 * same code on the step it is on. What stays here is what only a whole
 * recorded run has: the input hash, loop closure, and the frame-to-frame
 * differences that become replay velocities.
 *
 * The byte-for-byte replay pin is the proof that the move changed no
 * arithmetic — if a single float had shifted, the generated replay's hash
 * would not match.
 */

/** One recorded frame, viewed the way the shared mapper expects. */
function frameParticles(
  trace: RiverfallFluidEvidenceTraceV1,
  frame: number,
): RiverfallSurfaceParticleFrameV1 {
  const count = trace.config.particles.witnessCount;
  return {
    translations: trace.translations.subarray(frame * count * 3, (frame + 1) * count * 3),
    linearVelocities: trace.linearVelocities.subarray(
      frame * count * 3, (frame + 1) * count * 3),
    visible: trace.visibleWitnesses.subarray(frame * count, (frame + 1) * count),
  };
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
  const tracerValues = riverfallSurfaceTracerValuesV1(
    trace.config,
    trace.recordingInitialLongitudinal,
    trace.recordingInitialLateral,
  );
  const rawSignals = new Float32Array(replaySamples);
  let observedMinimumParticles = Number.POSITIVE_INFINITY;
  let maximumNearestParticleDistance = 0;
  const phaseTravel = new Float64Array(cells.length);
  const wave = trace.config.presentation.advectedWave;
  const waveNumber = Math.PI * 2 / wave.wavelength;
  const frameSeconds = trace.fixedStepMs / 1_000;
  for (let frame = 0; frame < trace.frameCount; frame += 1) {
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const sample = riverfallSurfaceSignalV1(
        frameParticles(trace, frame),
        cells[cellIndex]!,
        trace.config,
        tracerValues,
        `at frame ${String(frame)}`,
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
  const smoothedSignals = smoothRiverfallSurfaceSignalsV1(
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
  const [minimumExcursion, maximumExcursion] =
    trace.config.presentation.normalExcursion;
  const excursions = new Float64Array(surfaceFrameCount * cells.length);
  for (let sample = 0; sample < excursions.length; sample += 1) {
    excursions[sample] = minimumExcursion
      + signals[sample]! * (maximumExcursion - minimumExcursion);
  }
  const tiltFrames = riverfallSurfaceTiltFramesV1(cells);
  const tilt = trace.config.presentation.surfaceTilt;
  const maxTiltTangent = Math.tan(tilt.maxRadians);
  for (let frame = 0; frame < surfaceFrameCount; frame += 1) {
    for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
      const cell = cells[cellIndex]!;
      const excursion = excursions[frame * cells.length + cellIndex]!;
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
        riverfallTiltedCellQuaternionV1(
          cell,
          tiltFrames[cellIndex]!,
          (other) => excursions[frame * cells.length + other]!,
          cellIndex,
          tilt.gain,
          maxTiltTangent,
        ),
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
  writeRiverfallSurfaceAngularVelocitiesV1(
    rotations,
    angularVelocities,
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
