import {
  RIVERFALL_FLUID_DOMAIN_V1,
  riverfallFluidDomainLengthV1,
  type RiverfallFluidDomainV1,
} from './riverfall-fluid-domain.js';
import {
  MAX_POSE_REPLAY_FRAMES,
  MAX_POSE_REPLAY_SAMPLES,
} from './scene-pose-replay.js';
import {
  RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
  RIVERFALL_SURFACE_CELL_COUNT,
  RIVERFALL_SURFACE_MODEL_ID,
  RIVERFALL_SURFACE_SEAM_MODEL_ID,
} from './riverfall-surface-grid.js';

export const RIVERFALL_FLUID_SOLVER_NAME =
  'voxel-fixture/riverfall-pbf-2d';
export const RIVERFALL_FLUID_SOLVER_VERSION = '1.2.0';
export const RIVERFALL_FLUID_SCENE_ID = 'studio:scene:riverfall';
export const RIVERFALL_FLUID_REPLAY_ID =
  'studio:pose-replay:riverfall-flow';

export const RIVERFALL_FLUID_PARTICLE_COUNT = 288;
export const RIVERFALL_FLUID_WITNESS_COUNT =
  RIVERFALL_FLUID_PARTICLE_COUNT;
export const RIVERFALL_FLUID_FRAME_COUNT = 240;
export const RIVERFALL_FLUID_RECORD_STEP_MS = 25;
export const RIVERFALL_FLUID_SUBSTEPS_PER_FRAME = 5;
export const RIVERFALL_FLUID_SUBSTEP_MS =
  RIVERFALL_FLUID_RECORD_STEP_MS / RIVERFALL_FLUID_SUBSTEPS_PER_FRAME;
// Surface reconstruction appends one frame-zero closing pose so replay wrap
// never exposes a discontinuity.
export const RIVERFALL_FLUID_MAX_FRAME_COUNT =
  MAX_POSE_REPLAY_FRAMES - 1;
export const RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS =
  MAX_POSE_REPLAY_FRAMES;
export const RIVERFALL_FLUID_MAX_RECORDED_SAMPLES =
  MAX_POSE_REPLAY_SAMPLES;

export type RiverfallFluidAblationV1 =
  | 'baseline'
  | 'zero-density'
  | 'zero-gravity'
  | 'zero-pump'
  | 'zero-xsph';

const RIVERFALL_FLUID_ABLATIONS = Object.freeze([
  'baseline',
  'zero-density',
  'zero-gravity',
  'zero-pump',
  'zero-xsph',
] as const satisfies readonly RiverfallFluidAblationV1[]);

export interface RiverfallFluidConfigV1 {
  readonly schemaVersion: 'studio.riverfall-fluid-input/1';
  readonly solver: {
    readonly name: string;
    readonly version: string;
    readonly numericMode: 'float32-state/fixed-order-jacobi';
  };
  readonly sceneId: string;
  readonly replayId: string;
  readonly presentation: {
    readonly schemaVersion: 'studio.riverfall-fluid-surface-presentation/1';
    readonly reconstruction:
      'visible-particle-compact-kernel-advected-wave-field/3';
    readonly surfaceModelId: typeof RIVERFALL_SURFACE_MODEL_ID;
    readonly seamModelId: typeof RIVERFALL_SURFACE_SEAM_MODEL_ID;
    readonly cellCount: number;
    readonly baseNormalOffset: number;
    readonly support: {
      readonly metric: 'world-euclidean/1';
      readonly kernel: 'wendland-c2/1';
      readonly radius: number;
      readonly minimumParticles: number;
      readonly maximumInfluenceParticles: number;
    };
    readonly passiveTracer: {
      readonly seedRule: 'recording-initial-strip-coordinate/1';
      readonly longitudinalWavelength: number;
      readonly lateralWaveNumber: number;
    };
    readonly advectedWave: {
      readonly phaseRule: 'authored-flow-distance/local-speed-integral/1';
      readonly wavelength: number;
      readonly minimumPhaseSpeed: number;
      readonly localSpeedScale: number;
    };
    readonly loopClosure: {
      readonly rule: 'cubic-hermite-to-first-sample/1';
      readonly transitionFrames: number;
    };
    readonly spatialSmoothing: number;
    readonly signalWeights: {
      readonly advectedWave: number;
      readonly passiveTracer: number;
      readonly localSpeed: number;
      readonly localOccupancy: number;
    };
    readonly normalExcursion: readonly [number, number];
    /**
     * Each cell leans so its normal follows the reconstructed height field's
     * local slope toward its same-plane neighbours. This is what lets a light
     * shade a passing wave: a film that only translates keeps one normal and
     * reads as still. The slope is exaggerated by the declared gain — the
     * reconstructed field is deliberately smooth, and the true 2-degree lean
     * would vanish under flat shading — and hard-capped so no footprint can
     * lean past legibility into overhang.
     */
    readonly surfaceTilt: {
      readonly rule: 'same-plane-neighbour-slope-least-squares/1';
      readonly gain: number;
      readonly maxRadians: number;
    };
  };
  readonly domain: RiverfallFluidDomainV1;
  readonly recording: {
    readonly frameCount: number;
    readonly recordStepMs: number;
    readonly substepsPerFrame: number;
    readonly substepMs: number;
    readonly burnInSubsteps: number;
  };
  readonly particles: {
    readonly count: number;
    readonly witnessCount: number;
    readonly witnessStride: number;
    readonly seed: number;
    readonly mass: number;
    readonly radius: number;
    readonly maximumSpeed: number;
  };
  readonly density: {
    readonly iterations: number;
    readonly smoothingRadius: number;
    readonly restAreaDensity: number;
    readonly lambdaEpsilon: number;
    readonly maximumCorrection: number;
  };
  readonly viscosity: {
    readonly xsphCoefficient: number;
  };
  readonly forcing: {
    readonly gravity: readonly [number, number, number];
    readonly gravityScale: number;
    readonly inletSpeed: number;
    readonly hiddenPumpSpeed: number;
    readonly hiddenPumpScale: number;
  };
  readonly boundaries: {
    readonly lipAttachmentDownwardSpeed: number;
    readonly fallToPondRestitution: number;
    readonly lateralRestitution: number;
  };
  readonly causalEvidence: {
    readonly frameCount: number;
    readonly burnInSubsteps: number;
    readonly rules: readonly RiverfallFluidCausalRuleV1[];
  };
  readonly ablation: RiverfallFluidAblationV1;
  readonly lawLabels: readonly string[];
  readonly capabilityLabels: readonly string[];
}

export interface RiverfallFluidCausalRuleV1 {
  readonly ablation: Exclude<RiverfallFluidAblationV1, 'baseline'>;
  readonly metric:
    | 'maximumFallSpeed'
    | 'recycleCount'
    | 'maximumDensityError'
    | 'meanNeighborRelativeSpeed';
  readonly comparison: 'baseline-greater-by' | 'ablation-greater-by';
  readonly minimumDifference: number;
}

export interface RiverfallFluidConfigOverridesV1 {
  readonly frameCount?: number;
  readonly burnInSubsteps?: number;
  readonly ablation?: RiverfallFluidAblationV1;
}

export const RIVERFALL_FLUID_LAW_LABELS = Object.freeze([
  'fluid.pbf-2d-density-constraint',
  'fluid.xsph-viscosity',
  'gravity.tangent-projection',
  'boundary.dissipative-impact',
] as const);

export const RIVERFALL_FLUID_CAPABILITY_LABELS = Object.freeze([
  'water.surface-flow',
  'water.particle-to-grid-surface-reconstruction',
  'water.full-footprint-surface-presentation',
  'waterfall.gravity-accelerated-sheet',
  'pond.bounded-surface-flow',
  'hidden-pump-recirculation',
] as const);

function ablatedValues(ablation: RiverfallFluidAblationV1): {
  readonly densityIterations: number;
  readonly gravityScale: number;
  readonly hiddenPumpScale: number;
  readonly xsphCoefficient: number;
} {
  return {
    densityIterations: ablation === 'zero-density' ? 0 : 4,
    gravityScale: ablation === 'zero-gravity' ? 0 : 1,
    hiddenPumpScale: ablation === 'zero-pump' ? 0 : 1,
    xsphCoefficient: ablation === 'zero-xsph' ? 0 : 0.08,
  };
}

export function createRiverfallFluidConfigV1(
  overrides: RiverfallFluidConfigOverridesV1 = {},
): RiverfallFluidConfigV1 {
  const ablation = overrides.ablation ?? 'baseline';
  const frameCount = overrides.frameCount ?? RIVERFALL_FLUID_FRAME_COUNT;
  const burnInSubsteps = overrides.burnInSubsteps ?? 800;
  if (!RIVERFALL_FLUID_ABLATIONS.includes(ablation)) {
    throw new Error(
      `Cannot configure Riverfall fluid ablation ${JSON.stringify(ablation)}; `
      + `expected exactly one of ${RIVERFALL_FLUID_ABLATIONS.join(', ')}.`,
    );
  }
  if (!Number.isInteger(frameCount)
    || frameCount < 1
    || frameCount > RIVERFALL_FLUID_MAX_FRAME_COUNT) {
    throw new Error(
      `Cannot configure Riverfall fluid recording with frameCount ${String(frameCount)}; `
      + `expected an integer from 1 through ${
        String(RIVERFALL_FLUID_MAX_FRAME_COUNT)
      }.`,
    );
  }
  if (!Number.isInteger(burnInSubsteps)
    || burnInSubsteps < 1
    || burnInSubsteps > RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS) {
    throw new Error(
      `Cannot configure Riverfall fluid burn-in with ${String(burnInSubsteps)} substeps; `
      + `expected an integer from 1 through ${
        String(RIVERFALL_FLUID_MAX_BURN_IN_SUBSTEPS)
      } so frame zero is a warmed observed state.`,
    );
  }
  const particleSamples = frameCount * RIVERFALL_FLUID_WITNESS_COUNT;
  const surfaceSamples = (frameCount + 1) * RIVERFALL_SURFACE_CELL_COUNT;
  const recordedSamples = Math.max(particleSamples, surfaceSamples);
  if (!Number.isSafeInteger(recordedSamples)
    || recordedSamples > RIVERFALL_FLUID_MAX_RECORDED_SAMPLES) {
    throw new Error(
      `Cannot configure Riverfall fluid recording with ${
        String(recordedSamples)
      } output samples; ${String(frameCount)} frames require ${
        String(particleSamples)
      } particle witnesses and ${String(surfaceSamples)} surface cells, but `
      + `Studio accepts at most ${
        String(RIVERFALL_FLUID_MAX_RECORDED_SAMPLES)
      } so the generated pose replay stays within Studio's sample limit.`,
    );
  }
  const values = ablatedValues(ablation);
  return {
    schemaVersion: 'studio.riverfall-fluid-input/1',
    solver: {
      name: RIVERFALL_FLUID_SOLVER_NAME,
      version: RIVERFALL_FLUID_SOLVER_VERSION,
      numericMode: 'float32-state/fixed-order-jacobi',
    },
    sceneId: RIVERFALL_FLUID_SCENE_ID,
    replayId: RIVERFALL_FLUID_REPLAY_ID,
    presentation: {
      schemaVersion: 'studio.riverfall-fluid-surface-presentation/1',
      reconstruction:
        'visible-particle-compact-kernel-advected-wave-field/3',
      surfaceModelId: RIVERFALL_SURFACE_MODEL_ID,
      seamModelId: RIVERFALL_SURFACE_SEAM_MODEL_ID,
      cellCount: RIVERFALL_SURFACE_CELL_COUNT,
      baseNormalOffset: RIVERFALL_SURFACE_BASE_NORMAL_OFFSET,
      support: {
        metric: 'world-euclidean/1',
        kernel: 'wendland-c2/1',
        radius: 10,
        minimumParticles: 2,
        maximumInfluenceParticles: 8,
      },
      passiveTracer: {
        seedRule: 'recording-initial-strip-coordinate/1',
        longitudinalWavelength: 24,
        lateralWaveNumber: 0.12,
      },
      advectedWave: {
        phaseRule: 'authored-flow-distance/local-speed-integral/1',
        wavelength: 20,
        minimumPhaseSpeed: 5,
        localSpeedScale: 0.25,
      },
      loopClosure: {
        rule: 'cubic-hermite-to-first-sample/1',
        transitionFrames: 24,
      },
      spatialSmoothing: 0.7,
      signalWeights: {
        advectedWave: 0.55,
        passiveTracer: 0.25,
        localSpeed: 0.12,
        localOccupancy: 0.08,
      },
      normalExcursion: [0.03, 0.44],
      surfaceTilt: {
        rule: 'same-plane-neighbour-slope-least-squares/1',
        gain: 8,
        maxRadians: 0.35,
      },
    },
    domain: RIVERFALL_FLUID_DOMAIN_V1,
    recording: {
      frameCount,
      recordStepMs: RIVERFALL_FLUID_RECORD_STEP_MS,
      substepsPerFrame: RIVERFALL_FLUID_SUBSTEPS_PER_FRAME,
      substepMs: RIVERFALL_FLUID_SUBSTEP_MS,
      burnInSubsteps,
    },
    particles: {
      count: RIVERFALL_FLUID_PARTICLE_COUNT,
      witnessCount: RIVERFALL_FLUID_WITNESS_COUNT,
      witnessStride:
        RIVERFALL_FLUID_PARTICLE_COUNT / RIVERFALL_FLUID_WITNESS_COUNT,
      seed: 0x51f15e,
      mass: 1,
      radius: 0.35,
      maximumSpeed: 24,
    },
    density: {
      iterations: values.densityIterations,
      smoothingRadius: 3.5,
      restAreaDensity: 0.34,
      lambdaEpsilon: 1e-5,
      maximumCorrection: 0.015,
    },
    viscosity: {
      xsphCoefficient: values.xsphCoefficient,
    },
    forcing: {
      gravity: [0, -9.81, 0],
      gravityScale: values.gravityScale,
      inletSpeed: 4.5,
      hiddenPumpSpeed: 20,
      hiddenPumpScale: values.hiddenPumpScale,
    },
    boundaries: {
      lipAttachmentDownwardSpeed: 0.25,
      fallToPondRestitution: 0.08,
      lateralRestitution: 0.15,
    },
    causalEvidence: {
      frameCount: 360,
      burnInSubsteps: 240,
      rules: [
        {
          ablation: 'zero-gravity',
          metric: 'maximumFallSpeed',
          comparison: 'baseline-greater-by',
          minimumDifference: 1,
        },
        {
          ablation: 'zero-pump',
          metric: 'recycleCount',
          comparison: 'baseline-greater-by',
          minimumDifference: 1,
        },
        {
          ablation: 'zero-density',
          metric: 'maximumDensityError',
          comparison: 'ablation-greater-by',
          minimumDifference: 0.01,
        },
        {
          ablation: 'zero-xsph',
          metric: 'meanNeighborRelativeSpeed',
          comparison: 'ablation-greater-by',
          minimumDifference: 0.01,
        },
      ],
    },
    ablation,
    lawLabels: RIVERFALL_FLUID_LAW_LABELS,
    capabilityLabels: RIVERFALL_FLUID_CAPABILITY_LABELS,
  };
}

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

function canonicalize(value: unknown, path: string): CanonicalJson {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(
        `Cannot canonicalize Riverfall fluid input at ${path}: `
        + `expected a finite number, received ${String(value)}.`,
      );
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => canonicalize(
      entry,
      `${path}[${String(index)}]`,
    ));
  }
  // Null was returned by the first branch, so anything object-typed here is a
  // real object. (The redundant null guard only surfaced once this file moved
  // out of fixtures/ and met type-checked lint.)
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    const result: Record<string, CanonicalJson> = {};
    for (const key of Object.keys(record).sort()) {
      const entry = record[key];
      if (entry === undefined) {
        throw new Error(
          `Cannot canonicalize Riverfall fluid input at ${path}.${key}: `
          + 'undefined is not JSON-safe.',
        );
      }
      result[key] = canonicalize(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(
    `Cannot canonicalize Riverfall fluid input at ${path}: expected JSON-safe data, `
    + `received ${typeof value}.`,
  );
}

export function canonicalRiverfallFluidJsonV1(
  value: unknown,
): string {
  return JSON.stringify(canonicalize(value, '$'));
}

export function canonicalRiverfallFluidInputJsonV1(
  config: RiverfallFluidConfigV1,
): string {
  return canonicalRiverfallFluidJsonV1(config);
}

export function riverfallFluidReachStartDistancesV1(
  domain: RiverfallFluidDomainV1 = RIVERFALL_FLUID_DOMAIN_V1,
): Readonly<Record<string, number>> {
  const starts: Record<string, number> = {};
  let distance = 0;
  for (const reach of domain.reaches) {
    starts[reach.id] = distance;
    distance += Math.hypot(
      reach.end[0] - reach.start[0],
      reach.end[1] - reach.start[1],
      reach.end[2] - reach.start[2],
    );
  }
  if (Math.abs(distance - riverfallFluidDomainLengthV1(domain)) > 1e-9) {
    throw new Error(
      `Cannot index Riverfall fluid reaches: accumulated length ${String(distance)} `
      + `does not match domain length ${String(riverfallFluidDomainLengthV1(domain))}.`,
    );
  }
  return starts;
}
