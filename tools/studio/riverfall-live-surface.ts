import {
  createRiverfallFluidConfigV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import {
  createInitialRiverfallFluidStateV1,
  createRiverfallFluidWorkspaceV1,
} from './riverfall-pbf-support.js';
import {
  mapRiverfallFluidParticleToWorldV1,
  stepRiverfallFluidV1,
  type RiverfallFluidStateV1,
  type RiverfallFluidWorkspaceV1,
} from './riverfall-pbf.js';
import {
  RIVERFALL_SURFACE_CELLS_V1,
  type RiverfallSurfaceCellV1,
} from './riverfall-surface-grid.js';
import {
  riverfallSurfaceSignalV1,
  riverfallSurfaceTiltFramesV1,
  riverfallSurfaceTracerValuesV1,
  riverfallTiltedCellQuaternionV1,
  smoothRiverfallSurfaceSignalsV1,
  type RiverfallSurfaceTiltFrameV1,
} from './riverfall-surface-mapping.js';
import type { ScenePlacementPoseV1 } from './scene-pose-delta.js';

/**
 * The river, solved in the browser.
 *
 * Riverfall was the last scene playing a recording. This runs its 288-particle
 * position-based fluid live and maps the particles onto the blue tiles every
 * frame, so what the viewer sees is the solver's answer to this step rather
 * than a decoded frame of one someone recorded.
 *
 * The arithmetic is not a second implementation. Signal, smoothing, tilt and
 * excursion all come from `riverfall-surface-mapping.ts`, which the consumer
 * fixture's trace reconstruction calls frame by frame for the recorded run —
 * and that run is still generated and still byte-pinned, which is what makes
 * it a determinism fixture rather than the thing the studio plays back.
 *
 * Two parts of the recorded pipeline are deliberately absent, because both are
 * properties of a recording rather than of water: loop closure, which blends a
 * finite trace's tail into its head so it can repeat seamlessly, and the
 * frame-to-frame velocity differences the replay format carries. A live river
 * never repeats, and a presentation pose needs no velocity.
 */

/** Substeps the fluid takes per second of scene time, from its own config. */
function substepSeconds(config: RiverfallFluidConfigV1): number {
  return config.recording.substepMs / 1_000;
}

export class RiverfallLiveSurfaceV1 {
  readonly #config: RiverfallFluidConfigV1;
  readonly #cells: readonly RiverfallSurfaceCellV1[];
  readonly #tiltFrames: readonly RiverfallSurfaceTiltFrameV1[];
  readonly #tracerValues: Float64Array;
  readonly #phaseTravel: Float64Array;
  readonly #state: RiverfallFluidStateV1;
  readonly #workspace: RiverfallFluidWorkspaceV1;
  readonly #witnessIndices: Uint16Array;
  /** Reused per step; the mapper reads a whole frame of witnesses at once. */
  readonly #translations: Float32Array;
  readonly #velocities: Float32Array;
  readonly #visible: Uint8Array;
  readonly #rawSignals: Float32Array;
  #poses: ReadonlyMap<string, ScenePlacementPoseV1> = new Map();
  #carriedSeconds = 0;

  constructor() {
    this.#config = createRiverfallFluidConfigV1();
    this.#cells = RIVERFALL_SURFACE_CELLS_V1;
    this.#tiltFrames = riverfallSurfaceTiltFramesV1(this.#cells);
    const witnessCount = this.#config.particles.witnessCount;
    this.#witnessIndices = Uint16Array.from(
      { length: witnessCount },
      (_, index) => index * this.#config.particles.witnessStride,
    );
    this.#phaseTravel = new Float64Array(this.#cells.length);
    this.#state = createInitialRiverfallFluidStateV1(this.#config);
    this.#workspace = createRiverfallFluidWorkspaceV1(
      this.#config.particles.count,
    );
    this.#translations = new Float32Array(witnessCount * 3);
    this.#velocities = new Float32Array(witnessCount * 3);
    this.#visible = new Uint8Array(witnessCount);
    this.#rawSignals = new Float32Array(this.#cells.length);
    // The recorded lane burns the fluid in before it starts capturing, so the
    // scene opens on running water rather than on a starting grid. A live
    // scene pays the same cost, once, at construction.
    for (let step = 0; step < this.#config.recording.burnInSubsteps; step += 1) {
      stepRiverfallFluidV1(this.#state, this.#config, this.#workspace);
    }
    // Seed the tracers from where each parcel sits at the end of burn-in,
    // which is the same moment in the fluid's life that the recorded lane
    // seeds from. Shared code, so the two lanes cannot drift apart.
    this.#tracerValues = riverfallSurfaceTracerValuesV1(
      this.#config,
      Float32Array.from(this.#witnessIndices,
        (particle) => this.#state.longitudinal[particle]!),
      Float32Array.from(this.#witnessIndices,
        (particle) => this.#state.lateral[particle]!),
    );
    this.#remap();
  }

  /**
   * Advances the fluid by elapsed scene time, in whole substeps.
   *
   * The remainder is carried rather than dropped, so the river runs at the
   * same rate whatever the frame rate happens to be, and a slow frame does
   * not quietly slow the water.
   */
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error(
        `Cannot advance the Riverfall fluid by ${String(seconds)} seconds; `
        + 'expected a finite, nonnegative elapsed time.',
      );
    }
    const dt = substepSeconds(this.#config);
    this.#carriedSeconds += seconds;
    // A long stall must not turn into a burst of catch-up steps that costs
    // more than the stall did. Past this many, the river simply misses the
    // time — visibly continuing rather than lurching.
    const maximumSteps = this.#config.recording.substepsPerFrame * 4;
    let stepped = 0;
    while (this.#carriedSeconds >= dt && stepped < maximumSteps) {
      stepRiverfallFluidV1(this.#state, this.#config, this.#workspace);
      this.#carriedSeconds -= dt;
      stepped += 1;
    }
    if (this.#carriedSeconds >= dt) this.#carriedSeconds = 0;
    if (stepped > 0) this.#remap();
  }

  /** This step's tile poses, keyed by placement id. */
  poses(): ReadonlyMap<string, ScenePlacementPoseV1> {
    return this.#poses;
  }

  /** Particles the surface can currently see, for the panel and tests. */
  visibleWitnessCount(): number {
    let visible = 0;
    for (const flag of this.#visible) if (flag !== 0) visible += 1;
    return visible;
  }

  #captureWitnesses(): void {
    for (let witness = 0; witness < this.#witnessIndices.length; witness += 1) {
      const mapped = mapRiverfallFluidParticleToWorldV1(
        this.#state,
        this.#witnessIndices[witness]!,
        this.#config,
      );
      this.#translations.set(mapped.position, witness * 3);
      this.#velocities.set(mapped.velocity, witness * 3);
      this.#visible[witness] = mapped.visibility === 'visible' ? 1 : 0;
    }
  }

  #remap(): void {
    this.#captureWitnesses();
    const particles = {
      translations: this.#translations,
      linearVelocities: this.#velocities,
      visible: this.#visible,
    };
    const presentation = this.#config.presentation;
    const wave = presentation.advectedWave;
    const waveNumber = Math.PI * 2 / wave.wavelength;
    const weights = presentation.signalWeights;
    const frameSeconds = substepSeconds(this.#config);
    for (let index = 0; index < this.#cells.length; index += 1) {
      const cell = this.#cells[index]!;
      const sample = riverfallSurfaceSignalV1(
        particles,
        cell,
        this.#config,
        this.#tracerValues,
        'on the live step',
      );
      const advectedWave = 0.5 + Math.sin(
        (cell.flowDistance - this.#phaseTravel[index]!) * waveNumber,
      ) * 0.5;
      const signal = weights.advectedWave * advectedWave
        + weights.passiveTracer * sample.passiveTracer
        + weights.localSpeed * sample.localSpeed
        + weights.localOccupancy * sample.localOccupancy;
      this.#rawSignals[index] = Math.fround(Math.max(0, Math.min(1, signal)));
      this.#phaseTravel[index] = this.#phaseTravel[index]!
        + (
          wave.minimumPhaseSpeed
          + sample.localSpeed
            * this.#config.particles.maximumSpeed
            * wave.localSpeedScale
        ) * frameSeconds;
    }
    // One frame of the same spatial smoothing the recorded lane applies.
    const smoothed = smoothRiverfallSurfaceSignalsV1(
      this.#rawSignals,
      1,
      this.#cells,
      presentation.spatialSmoothing,
    );
    const [minimumExcursion, maximumExcursion] = presentation.normalExcursion;
    const excursions = new Float64Array(this.#cells.length);
    for (let index = 0; index < this.#cells.length; index += 1) {
      excursions[index] = minimumExcursion
        + smoothed[index]! * (maximumExcursion - minimumExcursion);
    }
    const tilt = presentation.surfaceTilt;
    const maxTiltTangent = Math.tan(tilt.maxRadians);
    const poses = new Map<string, ScenePlacementPoseV1>();
    for (let index = 0; index < this.#cells.length; index += 1) {
      const cell = this.#cells[index]!;
      const excursion = excursions[index]!;
      poses.set(cell.id, {
        translation: [
          Math.fround(cell.baseTranslation[0] + cell.normal[0] * excursion),
          Math.fround(cell.baseTranslation[1] + cell.normal[1] * excursion),
          Math.fround(cell.baseTranslation[2] + cell.normal[2] * excursion),
        ],
        quaternion: riverfallTiltedCellQuaternionV1(
          cell,
          this.#tiltFrames[index]!,
          (other) => excursions[other]!,
          index,
          tilt.gain,
          maxTiltTangent,
        ),
      });
    }
    this.#poses = poses;
  }
}
