import {
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
} from './oak-parameters.js';
import type {
  OakEnvironmentRegimeV1,
  OakOrganIdentityV1,
  OakOrganKindV1,
  OakOrganStageV1,
  OakPhenologyStageV1,
  OakResourcePoolsV1,
  OakVec3V1,
  OakWindRegimeV1,
} from './oak-types.js';

export type OakAblationV1 =
  | 'baseline'
  | 'no-rain'
  | 'no-root-uptake'
  | 'no-nitrogen'
  | 'no-phosphorus'
  | 'no-mycorrhiza'
  | 'no-litter';

export interface OakSimulationOptionsV1 {
  readonly seed?: number;
  readonly timeScale?: number;
  readonly paused?: boolean;
  readonly ablation?: OakAblationV1;
  readonly regime?: Partial<OakEnvironmentRegimeV1>;
}

export interface MutableOakOrganV1 {
  key: string;
  identity: OakOrganIdentityV1;
  kind: OakOrganKindV1;
  parentKey: string | null;
  branchOrder: number;
  birthDay: number;
  restPositionM: OakVec3V1;
  positionM: OakVec3V1;
  restDirection: OakVec3V1;
  direction: OakVec3V1;
  lengthM: number;
  radiusM: number;
  structuralCarbonKg: number;
  structuralNitrogenKg: number;
  structuralPhosphorusKg: number;
  waterLiters: number;
  waterPotentialMpa: number;
  stage: OakOrganStageV1;
  healthFraction: number;
  stressFraction: number;
  areaM2?: number;
  inclinationRadians?: number;
  rollRadians?: number;
  chlorophyllFraction?: number;
  relativeWaterContentFraction?: number;
  mechanicsClamped: boolean;
}

export interface MutableOakSoilCellV1 {
  key: string;
  centerM: OakVec3V1;
  sizeM: OakVec3V1;
  porosityFraction: number;
  waterLiters: number;
  ammoniumKg: number;
  nitrateKg: number;
  labilePhosphorusKg: number;
  sorbedPhosphorusKg: number;
  litterCarbonKg: number;
  litterNitrogenKg: number;
  litterPhosphorusKg: number;
  mycorrhizalCarbonKg: number;
  mycorrhizalNitrogenKg: number;
  mycorrhizalPhosphorusKg: number;
  colonizedFineRootFraction: number;
  lastRootUptakeWeightFraction: number;
}

export interface MutableOakCountersV1 {
  assimilationCarbonKg: number;
  respirationCarbonKg: number;
  transpirationLiters: number;
  rootWaterUptakeLiters: number;
  nitrogenUptakeKg: number;
  phosphorusUptakeKg: number;
  mycorrhizalCarbonCostKg: number;
  litterCarbonRespiredKg: number;
  waterStressIntegral: number;
  nitrogenStressIntegral: number;
  phosphorusStressIntegral: number;
  stressSamples: number;
  physiologySteps: number;
  soilSteps: number;
  allocationSteps: number;
  phenologySteps: number;
  flushCount: number;
}

export interface MutableOakStateV1 {
  epoch: string;
  revision: number;
  seed: number;
  rngState: number;
  ablation: OakAblationV1;
  hostTick: number;
  elapsedBiologicalSeconds: number;
  paused: boolean;
  timeScale: number;
  phenology: OakPhenologyStageV1;
  regime: OakEnvironmentRegimeV1;
  windRegime: OakWindRegimeV1;
  windPhaseTick: number;
  currentWindSpeedMPerS: number;
  nextOrganLocalId: number;
  organs: MutableOakOrganV1[];
  soil: MutableOakSoilCellV1[];
  mobile: OakResourcePoolsV1;
  initialStorage: OakResourcePoolsV1;
  sources: OakResourcePoolsV1;
  sinks: OakResourcePoolsV1;
  sourceCompensation: OakResourcePoolsV1;
  sinkCompensation: OakResourcePoolsV1;
  pendingRainLiters: number;
  pendingAmmoniumKg: number;
  pendingNitrateKg: number;
  pendingLabilePhosphorusKg: number;
  nextPhysiologySecond: number;
  nextSoilSecond: number;
  nextAllocationSecond: number;
  nextPhenologySecond: number;
  counters: MutableOakCountersV1;
}

export function zeroOakPoolsV1(): OakResourcePoolsV1 {
  return { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 };
}

export function addOakPoolsV1(
  left: OakResourcePoolsV1,
  right: OakResourcePoolsV1,
): OakResourcePoolsV1 {
  return {
    carbonKg: left.carbonKg + right.carbonKg,
    nitrogenKg: left.nitrogenKg + right.nitrogenKg,
    phosphorusKg: left.phosphorusKg + right.phosphorusKg,
    waterLiters: left.waterLiters + right.waterLiters,
  };
}

export function oakOrganKeyV1(identity: OakOrganIdentityV1): string {
  return `organ:${String(identity.localId)}:${String(identity.generation)}`;
}

export function nextOakRandomUnitV1(state: MutableOakStateV1): number {
  let value = state.rngState >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState / 4_294_967_296;
}

function soilCell(index: number, ablation: OakAblationV1): MutableOakSoilCellV1 {
  const parameters = OAK_PARAMETERS_V1.soil;
  const cellsPerLayer = parameters.gridColumns * parameters.gridRows;
  const depth = Math.floor(index / cellsPerLayer);
  const row = Math.floor((index % cellsPerLayer) / parameters.gridColumns);
  const column = index % parameters.gridColumns;
  const size = parameters.cellSizeM;
  const volumeLiters = size * size * size * 1_000;
  const nitrogenEnabled = ablation !== 'no-nitrogen';
  const phosphorusEnabled = ablation !== 'no-phosphorus';
  const litterEnabled = ablation !== 'no-litter';
  const mycorrhizaEnabled = ablation !== 'no-mycorrhiza';
  return {
    key: `soil:${String(column)}:${String(depth)}:${String(row)}`,
    centerM: {
      x: column === 0 ? -size / 2 : size / 2,
      y: -(depth * size + size / 2),
      z: row === 0 ? -size / 2 : size / 2,
    },
    sizeM: { x: size, y: size, z: size },
    porosityFraction: parameters.porosityFraction,
    waterLiters: parameters.initialWaterFractions[index]! * volumeLiters,
    ammoniumKg: nitrogenEnabled ? parameters.initialAmmoniumKg[index]! : 0,
    nitrateKg: nitrogenEnabled ? parameters.initialNitrateKg[index]! : 0,
    labilePhosphorusKg: phosphorusEnabled
      ? parameters.initialLabilePhosphorusKg[index]!
      : 0,
    sorbedPhosphorusKg: phosphorusEnabled
      ? parameters.initialSorbedPhosphorusKg[index]!
      : 0,
    litterCarbonKg: litterEnabled ? parameters.initialLitterCarbonKgPerCell : 0,
    litterNitrogenKg: litterEnabled && nitrogenEnabled
      ? parameters.initialLitterNitrogenKgPerCell
      : 0,
    litterPhosphorusKg: litterEnabled && phosphorusEnabled
      ? parameters.initialLitterPhosphorusKgPerCell
      : 0,
    mycorrhizalCarbonKg: mycorrhizaEnabled
      ? parameters.initialMycorrhizalCarbonKgPerCell
      : 0,
    mycorrhizalNitrogenKg: mycorrhizaEnabled && nitrogenEnabled
      ? parameters.initialMycorrhizalNitrogenKgPerCell
      : 0,
    mycorrhizalPhosphorusKg:
      mycorrhizaEnabled && phosphorusEnabled
        ? parameters.initialMycorrhizalPhosphorusKgPerCell
        : 0,
    colonizedFineRootFraction: 0,
    lastRootUptakeWeightFraction: 0,
  };
}

export function totalOakStorageV1(state: MutableOakStateV1): OakResourcePoolsV1 {
  let total = { ...state.mobile };
  for (const organ of state.organs) {
    total = addOakPoolsV1(total, {
      carbonKg: organ.structuralCarbonKg,
      nitrogenKg: organ.structuralNitrogenKg,
      phosphorusKg: organ.structuralPhosphorusKg,
      waterLiters: organ.waterLiters,
    });
  }
  for (const cell of state.soil) {
    total = addOakPoolsV1(total, {
      carbonKg: cell.litterCarbonKg + cell.mycorrhizalCarbonKg,
      nitrogenKg:
        cell.ammoniumKg + cell.nitrateKg + cell.litterNitrogenKg
        + cell.mycorrhizalNitrogenKg,
      phosphorusKg:
        cell.labilePhosphorusKg + cell.sorbedPhosphorusKg
        + cell.litterPhosphorusKg + cell.mycorrhizalPhosphorusKg,
      waterLiters: cell.waterLiters,
    });
  }
  return total;
}

export function createInitialOakStateV1(
  options: Required<OakSimulationOptionsV1>,
  epochGeneration: number,
): MutableOakStateV1 {
  const seed = OAK_PARAMETERS_V1.seed;
  const acornIdentity = { localId: 1, generation: 1 };
  const state: MutableOakStateV1 = {
    epoch: `oak:${String(options.seed)}:${String(epochGeneration)}`,
    revision: 0,
    seed: options.seed,
    rngState: options.seed,
    ablation: options.ablation,
    hostTick: 0,
    elapsedBiologicalSeconds: 0,
    paused: options.paused,
    timeScale: options.timeScale,
    phenology: 'imbibition',
    regime: {
      water: options.regime.water ?? 'ambient',
      nitrogen: options.regime.nitrogen ?? 'ambient',
      phosphorus: options.regime.phosphorus ?? 'ambient',
    },
    windRegime: 'still',
    windPhaseTick: 0,
    currentWindSpeedMPerS: 0,
    nextOrganLocalId: 2,
    organs: [{
      key: oakOrganKeyV1(acornIdentity),
      identity: acornIdentity,
      kind: 'acorn',
      parentKey: null,
      branchOrder: 0,
      birthDay: 0,
      restPositionM: { x: 0, y: -seed.bodyLengthM / 2, z: 0 },
      positionM: { x: 0, y: -seed.bodyLengthM / 2, z: 0 },
      restDirection: { x: 0, y: 1, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
      lengthM: seed.bodyLengthM,
      radiusM: seed.bodyRadiusM,
      structuralCarbonKg: seed.structuralCarbonKg,
      structuralNitrogenKg: seed.structuralNitrogenKg,
      structuralPhosphorusKg: seed.structuralPhosphorusKg,
      waterLiters: seed.waterLiters,
      waterPotentialMpa: seed.initialWaterPotentialMpa,
      stage: 'germinating',
      healthFraction: 1,
      stressFraction: 0,
      mechanicsClamped: false,
    }],
    soil: Array.from({
      length: OAK_PARAMETERS_V1.soil.gridColumns
        * OAK_PARAMETERS_V1.soil.gridRows
        * OAK_PARAMETERS_V1.soil.gridLayers,
    }, (_, index) => soilCell(index, options.ablation)),
    mobile: {
      carbonKg: seed.mobileCarbonKg,
      nitrogenKg: seed.mobileNitrogenKg,
      phosphorusKg: seed.mobilePhosphorusKg,
      waterLiters: seed.mobileWaterLiters,
    },
    initialStorage: zeroOakPoolsV1(),
    sources: zeroOakPoolsV1(),
    sinks: zeroOakPoolsV1(),
    sourceCompensation: zeroOakPoolsV1(),
    sinkCompensation: zeroOakPoolsV1(),
    pendingRainLiters: 0,
    pendingAmmoniumKg: 0,
    pendingNitrateKg: 0,
    pendingLabilePhosphorusKg: 0,
    nextPhysiologySecond: OAK_PROCESS_CADENCE_SECONDS_V1.physiology,
    nextSoilSecond: OAK_PROCESS_CADENCE_SECONDS_V1.soil,
    nextAllocationSecond: OAK_PROCESS_CADENCE_SECONDS_V1.allocation,
    nextPhenologySecond: OAK_PROCESS_CADENCE_SECONDS_V1.phenology,
    counters: {
      assimilationCarbonKg: 0,
      respirationCarbonKg: 0,
      transpirationLiters: 0,
      rootWaterUptakeLiters: 0,
      nitrogenUptakeKg: 0,
      phosphorusUptakeKg: 0,
      mycorrhizalCarbonCostKg: 0,
      litterCarbonRespiredKg: 0,
      waterStressIntegral: 0,
      nitrogenStressIntegral: 0,
      phosphorusStressIntegral: 0,
      stressSamples: 0,
      physiologySteps: 0,
      soilSteps: 0,
      allocationSteps: 0,
      phenologySteps: 0,
      flushCount: 0,
    },
  };
  state.initialStorage = totalOakStorageV1(state);
  return state;
}
