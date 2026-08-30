import { stepOakSoilV1 } from './oak-biogeochemistry.js';
import { reconcileOakWoodAllometryV1 } from './oak-allometry.js';
import { stepOakAllocationV1, stepOakPhenologyV1 } from './oak-growth.js';
import {
  setOakWindRegimeV1,
  updateOakWindMechanicsV1,
} from './oak-mechanics.js';
import {
  OAK_DEFAULT_TIME_SCALE_V1,
  OAK_HOST_TIMESTEP_SECONDS_V1,
  OAK_HOST_TICKS_PER_SECOND_V1,
  OAK_MAX_ADVANCE_TICKS_V1,
  OAK_MAX_BIOLOGICAL_DAYS_PER_ADVANCE_V1,
  OAK_MAX_TIME_SCALE_V1,
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
  OAK_SECONDS_PER_DAY_V1,
} from './oak-parameters.js';
import { stepOakPhysiologyV1 } from './oak-physiology.js';
import {
  createOakSimulationSnapshotV1,
  toOakRenderProjectionStateV1,
} from './oak-snapshot.js';
import {
  createInitialOakStateV1,
  type MutableOakStateV1,
  type OakAblationV1,
  type OakSimulationOptionsV1,
} from './oak-state.js';
import type {
  OakEnvironmentRegimeV1,
  OakRenderProjectionStateV1,
  OakSimulationSnapshotV1,
  OakWindRegimeV1,
} from './oak-types.js';

export { toOakRenderProjectionStateV1 } from './oak-snapshot.js';
export type { OakAblationV1, OakSimulationOptionsV1 } from './oak-state.js';
export type {
  OakEnvironmentRegimeV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakSimulationSnapshotV1,
} from './oak-types.js';

export type OakSimulationCommandV1 =
  | Readonly<{ kind: 'rainfall-pulse'; liters: number }>
  | Readonly<{
      kind: 'nutrient-pulse';
      ammoniumKg: number;
      nitrateKg: number;
      labilePhosphorusKg: number;
    }>
  | Readonly<{
      kind: 'set-environment-regime';
      water: OakEnvironmentRegimeV1['water'];
      nitrogen: OakEnvironmentRegimeV1['nitrogen'];
      phosphorus: OakEnvironmentRegimeV1['phosphorus'];
    }>
  | Readonly<{ kind: 'set-wind-regime'; regime: OakWindRegimeV1 }>;

export interface OakSimulationControllerV1 {
  snapshot(): OakSimulationSnapshotV1;
  projection(): OakRenderProjectionStateV1;
  advanceHostTicks(count: number): OakSimulationSnapshotV1;
  setPaused(paused: boolean): OakSimulationSnapshotV1;
  setTimeScale(timeScale: number): OakSimulationSnapshotV1;
  applyCommand(command: OakSimulationCommandV1): OakSimulationSnapshotV1;
  reset(options?: OakSimulationOptionsV1): OakSimulationSnapshotV1;
}

const ABLATIONS: readonly OakAblationV1[] = [
  'baseline',
  'no-rain',
  'no-root-uptake',
  'no-nitrogen',
  'no-phosphorus',
  'no-mycorrhiza',
  'no-litter',
];

function validateSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
    throw new Error(
      `Cannot create oak simulation with seed ${String(seed)}; expected an `
      + 'integer from 1 through 4294967295.',
    );
  }
}

function validateTimeScale(timeScale: number): void {
  if (!Number.isFinite(timeScale) || timeScale < 0
    || timeScale > OAK_MAX_TIME_SCALE_V1) {
    throw new Error(
      `Cannot set oak biological time scale to ${String(timeScale)}; expected `
      + `a finite value from 0 through ${String(OAK_MAX_TIME_SCALE_V1)} `
      + 'biological seconds per real second.',
    );
  }
}

function validateLevel(name: string, value: string): void {
  if (value !== 'ambient' && value !== 'low') {
    throw new Error(
      `Cannot set oak ${name} regime to ${JSON.stringify(value)}; expected `
      + 'exactly "ambient" or "low".',
    );
  }
}

function normalizeOptions(
  options: OakSimulationOptionsV1,
): Required<OakSimulationOptionsV1> {
  const seed = options.seed ?? 0x51a7_0a4b;
  const timeScale = options.timeScale ?? OAK_DEFAULT_TIME_SCALE_V1;
  const ablation = options.ablation ?? 'baseline';
  validateSeed(seed);
  validateTimeScale(timeScale);
  if (!ABLATIONS.includes(ablation)) {
    throw new Error(
      `Cannot create oak simulation with ablation ${JSON.stringify(ablation)}; `
      + `expected exactly one of ${ABLATIONS.join(', ')}.`,
    );
  }
  const regime = {
    water: options.regime?.water ?? 'ambient',
    nitrogen: options.regime?.nitrogen ?? 'ambient',
    phosphorus: options.regime?.phosphorus ?? 'ambient',
  } as const;
  validateLevel('water', regime.water);
  validateLevel('nitrogen', regime.nitrogen);
  validateLevel('phosphorus', regime.phosphorus);
  return {
    seed,
    timeScale,
    paused: options.paused ?? false,
    ablation,
    regime,
  };
}

function runProcessesThrough(state: MutableOakStateV1, targetSecond: number): void {
  while (true) {
    const next = Math.min(
      state.nextPhysiologySecond,
      state.nextSoilSecond,
      state.nextAllocationSecond,
      state.nextPhenologySecond,
    );
    if (next > targetSecond) break;
    state.elapsedBiologicalSeconds = next;
    if (state.nextSoilSecond === next) {
      stepOakSoilV1(state);
      state.nextSoilSecond += OAK_PROCESS_CADENCE_SECONDS_V1.soil;
    }
    if (state.nextPhysiologySecond === next) {
      stepOakPhysiologyV1(state);
      state.nextPhysiologySecond += OAK_PROCESS_CADENCE_SECONDS_V1.physiology;
    }
    if (state.nextAllocationSecond === next) {
      stepOakAllocationV1(state);
      state.nextAllocationSecond += OAK_PROCESS_CADENCE_SECONDS_V1.allocation;
    }
    if (state.nextPhenologySecond === next) {
      stepOakPhenologyV1(state);
      state.nextPhenologySecond += OAK_PROCESS_CADENCE_SECONDS_V1.phenology;
    }
    reconcileOakWoodAllometryV1(state);
  }
  state.elapsedBiologicalSeconds = targetSecond;
}

function validateNonnegativeBounded(
  label: string,
  value: number,
  maximum: number,
): void {
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(
      `Cannot apply oak ${label} ${String(value)}; expected a finite value `
      + `from 0 through ${String(maximum)}.`,
    );
  }
}

export function oakHostTicksForBiologicalDaysV1(
  days: number,
  timeScale: number = OAK_DEFAULT_TIME_SCALE_V1,
): number {
  validateTimeScale(timeScale);
  if (!Number.isFinite(days) || days < 0) {
    throw new Error(
      `Cannot convert ${String(days)} biological days to oak host ticks; `
      + 'expected a finite, nonnegative day count.',
    );
  }
  if (timeScale === 0 && days > 0) {
    throw new Error(
      'Cannot convert positive biological days to oak host ticks at time scale 0.',
    );
  }
  return days === 0
    ? 0
    : Math.ceil(days * OAK_SECONDS_PER_DAY_V1
      / (timeScale * OAK_HOST_TIMESTEP_SECONDS_V1));
}

export function createOakSimulationV1(
  initialOptions: OakSimulationOptionsV1 = {},
): OakSimulationControllerV1 {
  let epochGeneration = 1;
  let options = normalizeOptions(initialOptions);
  let state = createInitialOakStateV1(options, epochGeneration);
  const currentSnapshot = (): OakSimulationSnapshotV1 =>
    createOakSimulationSnapshotV1(state);
  return {
    snapshot: currentSnapshot,
    projection: () => toOakRenderProjectionStateV1(currentSnapshot()),
    advanceHostTicks: (count) => {
      if (!Number.isInteger(count) || count < 0 || count > OAK_MAX_ADVANCE_TICKS_V1) {
        throw new Error(
          `Cannot advance oak simulation by ${String(count)} host ticks; `
          + `expected an integer from 0 through ${String(OAK_MAX_ADVANCE_TICKS_V1)}.`,
        );
      }
      if (count === 0) return currentSnapshot();
      if (state.hostTick > Number.MAX_SAFE_INTEGER - count) {
        throw new Error('Cannot advance oak simulation because its host tick is exhausted.');
      }
      let biologicalSpanSeconds = 0;
      if (!state.paused && state.timeScale > 0) {
        biologicalSpanSeconds = count
          * OAK_HOST_TIMESTEP_SECONDS_V1 * state.timeScale;
        if (biologicalSpanSeconds
          > OAK_MAX_BIOLOGICAL_DAYS_PER_ADVANCE_V1 * OAK_SECONDS_PER_DAY_V1) {
          throw new Error(
            `Cannot advance oak simulation by ${String(
              biologicalSpanSeconds / OAK_SECONDS_PER_DAY_V1,
            )} `
            + `biological days in one call; the bounded early-growth fixture accepts at `
            + `most ${String(OAK_MAX_BIOLOGICAL_DAYS_PER_ADVANCE_V1)} days per call.`,
          );
        }
      }
      state.hostTick += count;
      if (biologicalSpanSeconds > 0) {
        runProcessesThrough(
          state,
          state.elapsedBiologicalSeconds + biologicalSpanSeconds,
        );
      }
      updateOakWindMechanicsV1(state);
      state.revision += 1;
      return currentSnapshot();
    },
    setPaused: (paused) => {
      if (typeof paused !== 'boolean') {
        throw new Error(
          `Cannot set oak pause state to ${String(paused)}; expected a boolean.`,
        );
      }
      if (state.paused !== paused) {
        state.paused = paused;
        state.revision += 1;
      }
      return currentSnapshot();
    },
    setTimeScale: (timeScale) => {
      validateTimeScale(timeScale);
      if (state.timeScale !== timeScale) {
        state.timeScale = timeScale;
        state.revision += 1;
      }
      return currentSnapshot();
    },
    applyCommand: (command) => {
      if (command.kind === 'rainfall-pulse') {
        validateNonnegativeBounded('rainfall pulse in liters', command.liters, 100);
        state.pendingRainLiters += command.liters;
      } else if (command.kind === 'nutrient-pulse') {
        validateNonnegativeBounded('ammonium pulse in kg', command.ammoniumKg, 0.1);
        validateNonnegativeBounded('nitrate pulse in kg', command.nitrateKg, 0.1);
        validateNonnegativeBounded(
          'labile phosphorus pulse in kg',
          command.labilePhosphorusKg,
          0.1,
        );
        state.pendingAmmoniumKg += command.ammoniumKg;
        state.pendingNitrateKg += command.nitrateKg;
        state.pendingLabilePhosphorusKg += command.labilePhosphorusKg;
      } else if (command.kind === 'set-environment-regime') {
        validateLevel('water', command.water);
        validateLevel('nitrogen', command.nitrogen);
        validateLevel('phosphorus', command.phosphorus);
        state.regime = {
          water: command.water,
          nitrogen: command.nitrogen,
          phosphorus: command.phosphorus,
        };
      } else if (command.kind === 'set-wind-regime') {
        if (command.regime !== 'still' && command.regime !== 'breeze') {
          throw new Error(
            `Cannot set oak wind regime to ${JSON.stringify(command.regime)}; `
            + 'expected exactly "still" or "breeze".',
          );
        }
        setOakWindRegimeV1(state, command.regime);
      } else {
        const unreachable: never = command;
        throw new Error(`Cannot apply unknown oak command ${JSON.stringify(unreachable)}.`);
      }
      state.revision += 1;
      return currentSnapshot();
    },
    reset: (overrides = {}) => {
      options = normalizeOptions({
        ...options,
        ...overrides,
        regime: { ...options.regime, ...overrides.regime },
      });
      epochGeneration += 1;
      state = createInitialOakStateV1(options, epochGeneration);
      return currentSnapshot();
    },
  };
}

export const OAK_CASE_STUDY_IDENTITY_V1 = Object.freeze({
  schemaVersion: 'oak.case-study/1' as const,
  species: OAK_PARAMETERS_V1.identity.species,
  hostRateHz: OAK_HOST_TICKS_PER_SECOND_V1,
  biologicalScope: 'acorn-to-early-flushes/reduced-order-v1' as const,
});
