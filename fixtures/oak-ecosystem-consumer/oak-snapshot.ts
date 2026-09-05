import { oakOrganDryMassKgV1 } from './oak-growth.js';
import { oakWoodMassVolumeDiagnosticsForStateV1 } from './oak-allometry.js';
import {
  isOakAttachedLivingOrganV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import { OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import {
  totalOakStorageV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import type {
  OakLeafOrganSnapshotV1,
  OakOrganDevelopmentPhaseV1,
  OakOrganSnapshotV1,
  OakRenderProjectionStateV1,
  OakResourceLedgerV1,
  OakResourcePoolsV1,
  OakSimulationDiagnosticsV1,
  OakSimulationSnapshotV1,
  OakSoilCellSnapshotV1,
} from './oak-types.js';
import { assertOakLeafAttachmentTopologyV1 } from './oak-cellular-leaf-hinge.js';

function developmentPhase(organ: MutableOakOrganV1): OakOrganDevelopmentPhaseV1 {
  if (organ.development) return organ.development.phase;
  if (organ.stage === 'abscised') return 'abscised';
  if (organ.stage === 'detached') return 'falling';
  if (organ.stage === 'senescing') return 'senescing';
  if (organ.stage === 'mature') return 'mature';
  if (organ.stage === 'dormant') return 'preformed';
  return 'cell-expansion';
}

function poolsDifference(
  left: OakResourcePoolsV1,
  right: OakResourcePoolsV1,
): OakResourcePoolsV1 {
  return {
    carbonKg: left.carbonKg - right.carbonKg,
    nitrogenKg: left.nitrogenKg - right.nitrogenKg,
    phosphorusKg: left.phosphorusKg - right.phosphorusKg,
    waterLiters: left.waterLiters - right.waterLiters,
  };
}

function ledger(state: MutableOakStateV1): OakResourceLedgerV1 {
  const current = totalOakStorageV1(state);
  const expected = {
    carbonKg:
      state.initialStorage.carbonKg + state.sources.carbonKg - state.sinks.carbonKg,
    nitrogenKg:
      state.initialStorage.nitrogenKg + state.sources.nitrogenKg
      - state.sinks.nitrogenKg,
    phosphorusKg:
      state.initialStorage.phosphorusKg + state.sources.phosphorusKg
      - state.sinks.phosphorusKg,
    waterLiters:
      state.initialStorage.waterLiters + state.sources.waterLiters
      - state.sinks.waterLiters,
  };
  return {
    initialStorage: { ...state.initialStorage },
    cumulativeSources: { ...state.sources },
    cumulativeSinks: { ...state.sinks },
    currentStorage: current,
    storageChange: poolsDifference(current, state.initialStorage),
    residual: poolsDifference(expected, current),
  };
}

function organSnapshot(
  state: MutableOakStateV1,
  organ: MutableOakOrganV1,
): OakOrganSnapshotV1 {
  const common = {
    key: organ.key,
    identity: { ...organ.identity },
    parentKey: organ.parentKey,
    branchOrder: organ.branchOrder,
    ageDays: Math.max(
      0,
      state.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1 - organ.birthDay,
    ),
    positionM: { ...organ.positionM },
    direction: { ...organ.direction },
    lengthM: organ.lengthM,
    radiusM: organ.radiusM,
    targetLengthM: organ.development?.targetLengthM ?? organ.lengthM,
    targetRadiusM: organ.development?.targetRadiusM ?? organ.radiusM,
    dryMassKg: oakOrganDryMassKgV1(organ),
    waterPotentialMpa: organ.waterPotentialMpa,
    pools: {
      carbonKg: organ.structuralCarbonKg,
      nitrogenKg: organ.structuralNitrogenKg,
      phosphorusKg: organ.structuralPhosphorusKg,
      waterLiters: organ.waterLiters,
    },
    stage: organ.stage,
    developmentPhase: developmentPhase(organ),
    developmentFraction: Math.max(
      0,
      Math.min(1, organ.development?.fraction ?? 1),
    ),
    healthFraction: organ.healthFraction,
    stressFraction: organ.stressFraction,
    ...(organ.litterRecipientSoilCellKey === undefined ? {} : {
      litterRecipientSoilCellKey: organ.litterRecipientSoilCellKey,
    }),
  };
  if (organ.kind === 'leaf') {
    const leaf: OakLeafOrganSnapshotV1 = {
      ...common,
      kind: 'leaf',
      areaM2: organ.areaM2 ?? 0,
      targetAreaM2: organ.development?.targetAreaM2 ?? organ.areaM2 ?? 0,
      inclinationRadians: Math.asin(organ.direction.y),
      rollRadians: organ.rollRadians ?? 0,
      chlorophyllFraction: organ.chlorophyllFraction ?? 0,
      relativeWaterContentFraction: organ.relativeWaterContentFraction ?? 0,
      ...(organ.attachment === undefined ? {} : {
        attachment: {
          parentOrganKey: organ.attachment.parentOrganKey,
          nodeSite: organ.attachment.nodeSite,
          restRadialUnitWorld: { ...organ.attachment.restRadialUnitWorld },
        },
      }),
      ...(organ.fall === undefined ? {} : {
        fallProgressFraction: organ.fall.lastProgressFraction,
      }),
      ...(organ.abscissionScar === undefined ? {} : {
        abscissionScar: {
          parentKey: organ.abscissionScar.parentKey,
          positionM: { ...organ.abscissionScar.positionM },
          direction: { ...organ.abscissionScar.direction },
          rollRadians: organ.abscissionScar.rollRadians,
          searchRadiusM: organ.abscissionScar.searchRadiusM,
          fallMaterial: { ...organ.abscissionScar.fallMaterial },
        },
      }),
    };
    return leaf;
  }
  return { ...common, kind: organ.kind };
}

function soilSnapshot(cell: MutableOakStateV1['soil'][number]): OakSoilCellSnapshotV1 {
  const volumeLiters = cell.sizeM.x * cell.sizeM.y * cell.sizeM.z * 1_000;
  return {
    key: cell.key,
    centerM: { ...cell.centerM },
    sizeM: { ...cell.sizeM },
    porosityFraction: cell.porosityFraction,
    volumetricWaterFraction: cell.waterLiters / volumeLiters,
    waterLiters: cell.waterLiters,
    rootUptakeWeightFraction: cell.lastRootUptakeWeightFraction,
    ammoniumKg: cell.ammoniumKg,
    nitrateKg: cell.nitrateKg,
    labilePhosphorusKg: cell.labilePhosphorusKg,
    sorbedPhosphorusKg: cell.sorbedPhosphorusKg,
    litter: {
      carbonKg: cell.litterCarbonKg,
      nitrogenKg: cell.litterNitrogenKg,
      phosphorusKg: cell.litterPhosphorusKg,
    },
    ectomycorrhiza: {
      carbonKg: cell.mycorrhizalCarbonKg,
      nitrogenKg: cell.mycorrhizalNitrogenKg,
      phosphorusKg: cell.mycorrhizalPhosphorusKg,
      colonizedFineRootFraction: cell.colonizedFineRootFraction,
    },
  };
}

function diagnostics(state: MutableOakStateV1): OakSimulationDiagnosticsV1 {
  const living = state.organs.filter(isOakAttachedLivingOrganV1);
  const exposedLiving = living.filter(isOakPlacedOrganV1);
  const leaves = exposedLiving.filter((organ) => organ.kind === 'leaf');
  const stems = exposedLiving.filter((organ) => organ.kind === 'stem');
  const heightM = exposedLiving.reduce((height, organ) => Math.max(
    height,
    organ.positionM.y + Math.max(0, organ.direction.y * organ.lengthM),
  ), 0);
  const breastHeightStem = stems.find((stem) =>
    stem.positionM.y <= 1.3
    && stem.positionM.y + stem.direction.y * stem.lengthM >= 1.3);
  const basalStem = stems[0];
  const crownRadiusM = leaves.reduce((radius, leaf) => {
    const distalX = leaf.positionM.x + leaf.direction.x * leaf.lengthM;
    const distalZ = leaf.positionM.z + leaf.direction.z * leaf.lengthM;
    return Math.max(radius, Math.sqrt(distalX * distalX + distalZ * distalZ));
  }, 0);
  const waterPotentials = leaves.map((leaf) => leaf.waterPotentialMpa);
  const woodMassDiagnostics = oakWoodMassVolumeDiagnosticsForStateV1(state);
  const woodMassRatios = woodMassDiagnostics
    .map((value) => value.ownedToGeometryMassRatio);
  const samples = Math.max(1, state.counters.stressSamples);
  return {
    heightM,
    dbhM: breastHeightStem ? breastHeightStem.radiusM * 2 : 0,
    basalStemDiameterM: basalStem ? basalStem.radiusM * 2 : 0,
    crownRadiusM,
    leafAreaM2: leaves.reduce((sum, leaf) => sum + (leaf.areaM2 ?? 0), 0),
    fineRootLengthM: exposedLiving
      .filter((organ) => organ.kind === 'fine-root-cohort')
      .reduce((sum, root) => sum + root.lengthM, 0),
    organCount: living.length,
    leafCount: leaves.length,
    flushCount: state.counters.flushCount,
    activeGrowthFrontCount: living.filter((organ) => {
      const phase = developmentPhase(organ);
      return phase === 'bud-swelling'
        || phase === 'cell-division'
        || phase === 'cell-expansion'
        || phase === 'maturing';
    }).length,
    cumulativeGrowthCarbonKg: state.counters.cumulativeGrowthCarbonKg,
    cumulativeAssimilationCarbonKg: state.counters.assimilationCarbonKg,
    cumulativeRespirationCarbonKg: state.counters.respirationCarbonKg,
    cumulativePostPrimaryCarbonOverflowKg:
      state.counters.postPrimaryCarbonOverflowKg,
    cumulativeTranspirationLiters: state.counters.transpirationLiters,
    cumulativeRootWaterUptakeLiters: state.counters.rootWaterUptakeLiters,
    cumulativeNitrogenUptakeKg: state.counters.nitrogenUptakeKg,
    cumulativePhosphorusUptakeKg: state.counters.phosphorusUptakeKg,
    cumulativeMycorrhizalCarbonCostKg: state.counters.mycorrhizalCarbonCostKg,
    cumulativeLitterCarbonRespiredKg: state.counters.litterCarbonRespiredKg,
    meanLeafWaterPotentialMpa: waterPotentials.length > 0
      ? waterPotentials.reduce((sum, value) => sum + value, 0)
        / waterPotentials.length
      : 0,
    minimumLeafWaterPotentialMpa: waterPotentials.length > 0
      ? Math.min(...waterPotentials)
      : 0,
    meanWaterStressFraction: state.counters.waterStressIntegral / samples,
    meanNitrogenStressFraction: state.counters.nitrogenStressIntegral / samples,
    meanPhosphorusStressFraction: state.counters.phosphorusStressIntegral / samples,
    processSteps: {
      physiology: state.counters.physiologySteps,
      soil: state.counters.soilSteps,
      allocation: state.counters.allocationSteps,
      phenology: state.counters.phenologySteps,
    },
    mechanicsClampedOrganCount: state.organs.filter(
      (organ) => organ.mechanicsClamped,
    ).length,
    minimumWoodOwnedToGeometryMassRatio: woodMassRatios.length > 0
      ? Math.min(...woodMassRatios)
      : 0,
    maximumWoodOwnedToGeometryMassRatio: woodMassRatios.length > 0
      ? Math.max(...woodMassRatios)
      : 0,
  };
}

export function createOakSimulationSnapshotV1(
  state: MutableOakStateV1,
): OakSimulationSnapshotV1 {
  assertOakLeafAttachmentTopologyV1(state.organs);
  const organs = state.organs
    .map((organ) => organSnapshot(state, organ))
    .sort((left, right) => left.identity.localId - right.identity.localId);
  const soil = state.soil.map(soilSnapshot).sort((left, right) => {
    if (left.key < right.key) return -1;
    if (left.key > right.key) return 1;
    return 0;
  });
  return {
    schemaVersion: 'oak.simulation-state/1',
    epoch: state.epoch,
    revision: state.revision,
    seed: state.seed,
    hostTick: state.hostTick,
    elapsedBiologicalSeconds: state.elapsedBiologicalSeconds,
    paused: state.paused,
    timeScale: state.timeScale,
    phenology: state.phenology,
    environmentRegime: { ...state.regime },
    wind: {
      regime: state.windRegime,
      phaseTick: state.windPhaseTick,
      speedMPerS: state.currentWindSpeedMPerS,
    },
    plantMobilePools: { ...state.mobile },
    organs,
    soil,
    ledger: ledger(state),
    diagnostics: diagnostics(state),
  };
}

export function toOakRenderProjectionStateV1(
  source: OakSimulationSnapshotV1,
): OakRenderProjectionStateV1 {
  return {
    schemaVersion: 'oak.render-projection/1',
    epoch: source.epoch,
    revision: source.revision,
    phenology: source.phenology,
    environmentRegime: source.environmentRegime,
    wind: source.wind,
    organs: source.organs,
    soil: source.soil,
    diagnostics: {
      heightM: source.diagnostics.heightM,
      basalStemDiameterM: source.diagnostics.basalStemDiameterM,
      crownRadiusM: source.diagnostics.crownRadiusM,
      leafAreaM2: source.diagnostics.leafAreaM2,
      activeGrowthFrontCount: source.diagnostics.activeGrowthFrontCount,
      cumulativeGrowthCarbonKg: source.diagnostics.cumulativeGrowthCarbonKg,
      meanWaterStressFraction: source.diagnostics.meanWaterStressFraction,
      meanNitrogenStressFraction: source.diagnostics.meanNitrogenStressFraction,
      meanPhosphorusStressFraction: source.diagnostics.meanPhosphorusStressFraction,
    },
  };
}
