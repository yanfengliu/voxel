import {
  RIVERFALL_FLUID_DOMAIN_V1,
  riverfallFluidDomainLengthV1,
  type RiverfallFluidDomainV1,
} from '../../tools/studio/riverfall-fluid-domain.js';

export const RIVERFALL_FLUID_SOLVER_NAME =
  'voxel-fixture/riverfall-pbf-2d';
export const RIVERFALL_FLUID_SOLVER_VERSION = '1.0.0';
export const RIVERFALL_FLUID_SCENE_ID = 'studio:scene:riverfall';
export const RIVERFALL_FLUID_REPLAY_ID =
  'studio:pose-replay:riverfall-flow';

export const RIVERFALL_FLUID_PARTICLE_COUNT = 288;
export const RIVERFALL_FLUID_WITNESS_COUNT = 96;
export const RIVERFALL_FLUID_FRAME_COUNT = 600;
export const RIVERFALL_FLUID_RECORD_STEP_MS = 10;
export const RIVERFALL_FLUID_SUBSTEPS_PER_FRAME = 2;
export const RIVERFALL_FLUID_SUBSTEP_MS =
  RIVERFALL_FLUID_RECORD_STEP_MS / RIVERFALL_FLUID_SUBSTEPS_PER_FRAME;

export type RiverfallFluidAblationV1 =
  | 'baseline'
  | 'zero-density'
  | 'zero-gravity'
  | 'zero-pump'
  | 'zero-xsph';

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
    readonly witnessModelId: 'studio:riverfall:flow-glint';
    readonly placementOriginOffset: readonly [number, number, number];
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
  const values = ablatedValues(ablation);
  const frameCount = overrides.frameCount ?? RIVERFALL_FLUID_FRAME_COUNT;
  const burnInSubsteps = overrides.burnInSubsteps ?? 800;
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error(
      `Cannot configure Riverfall fluid recording with frameCount ${String(frameCount)}; `
      + 'expected a positive integer.',
    );
  }
  if (!Number.isInteger(burnInSubsteps) || burnInSubsteps < 1) {
    throw new Error(
      `Cannot configure Riverfall fluid burn-in with ${String(burnInSubsteps)} substeps; `
      + 'expected a positive integer so frame zero is a warmed observed state.',
    );
  }
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
      witnessModelId: 'studio:riverfall:flow-glint',
      placementOriginOffset: [0, -0.5, 0],
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
  if (typeof value === 'object' && value !== null) {
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
