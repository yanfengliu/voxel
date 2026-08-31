import { OAK_PARAMETERS_V1, OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import {
  nextOakRandomUnitV1,
  oakOrganKeyV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import {
  extendOakOrganAtDistalEndV1,
  normalizeOakGrowthDirectionV1,
  oakRestTipV1,
} from './oak-growth-geometry.js';
import {
  oakAcornGerminationPortsV1,
  oakLateralAttachmentPortV1,
} from './oak-topology.js';
import { oakLeafTangentialPortOffsetsForOrganV1 } from './oak-leaf-shape.js';
import {
  createOakAxillaryShootV1,
  planOakAxillaryShootV1,
  type OakOrganAuthoringInputV1,
  type OakOrganCostV1,
} from './oak-axillary-shoot.js';

const CARBON_FRACTION = OAK_PARAMETERS_V1.growth.structuralCarbonFractionOfDryMass;

function costForCarbon(carbonKg: number, waterLiters: number): OakOrganCostV1 {
  return {
    carbonKg,
    nitrogenKg: carbonKg * OAK_PARAMETERS_V1.growth.nitrogenPerStructuralCarbon,
    phosphorusKg: carbonKg * OAK_PARAMETERS_V1.growth.phosphorusPerStructuralCarbon,
    waterLiters,
  };
}

function sumCosts(costs: readonly OakOrganCostV1[]): OakOrganCostV1 {
  return costs.reduce((sum, cost) => ({
    carbonKg: sum.carbonKg + cost.carbonKg,
    nitrogenKg: sum.nitrogenKg + cost.nitrogenKg,
    phosphorusKg: sum.phosphorusKg + cost.phosphorusKg,
    waterLiters: sum.waterLiters + cost.waterLiters,
  }), { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 });
}

function canPay(state: MutableOakStateV1, cost: OakOrganCostV1): boolean {
  return state.mobile.carbonKg >= cost.carbonKg
    && state.mobile.nitrogenKg >= cost.nitrogenKg
    && state.mobile.phosphorusKg >= cost.phosphorusKg
    && state.mobile.waterLiters >= cost.waterLiters;
}

function pay(state: MutableOakStateV1, cost: OakOrganCostV1): void {
  state.mobile = {
    carbonKg: state.mobile.carbonKg - cost.carbonKg,
    nitrogenKg: state.mobile.nitrogenKg - cost.nitrogenKg,
    phosphorusKg: state.mobile.phosphorusKg - cost.phosphorusKg,
    waterLiters: state.mobile.waterLiters - cost.waterLiters,
  };
}

function addOrgan(
  state: MutableOakStateV1,
  input: Readonly<OakOrganAuthoringInputV1>,
): MutableOakOrganV1 {
  const identity = { localId: state.nextOrganLocalId, generation: 1 };
  state.nextOrganLocalId += 1;
  const direction = normalizeOakGrowthDirectionV1(input.direction);
  const organ: MutableOakOrganV1 = {
    key: oakOrganKeyV1(identity),
    identity,
    kind: input.kind,
    parentKey: input.parentKey,
    branchOrder: input.branchOrder,
    birthDay: state.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1,
    restPositionM: input.positionM,
    positionM: input.positionM,
    restDirection: direction,
    direction,
    lengthM: input.lengthM,
    radiusM: input.radiusM,
    structuralCarbonKg: input.cost.carbonKg,
    structuralNitrogenKg: input.cost.nitrogenKg,
    structuralPhosphorusKg: input.cost.phosphorusKg,
    waterLiters: input.cost.waterLiters,
    waterPotentialMpa: OAK_PARAMETERS_V1.growth.newOrgan.waterPotentialMpa,
    stage: input.stage,
    healthFraction: 1,
    stressFraction: 0,
    mechanicsClamped: false,
  };
  if (input.kind === 'leaf') {
    organ.areaM2 = input.areaM2 ?? 0;
    organ.inclinationRadians = Math.asin(direction.y);
    organ.rollRadians = input.rollRadians ?? 0;
    organ.chlorophyllFraction = OAK_PARAMETERS_V1.growth.newOrgan.leafChlorophyllFraction;
    organ.relativeWaterContentFraction =
      OAK_PARAMETERS_V1.growth.newOrgan.leafRelativeWaterContentFraction;
  }
  state.organs.push(organ);
  return organ;
}

function mobilizeAcornReserve(state: MutableOakStateV1): void {
  const acorn = state.organs.find((organ) => organ.kind === 'acorn');
  if (!acorn || acorn.stage === 'abscised') return;
  const mobilization = OAK_PARAMETERS_V1.growth.acornMobilization;
  const carbon = Math.min(
    mobilization.maximumCarbonKgPerDay,
    Math.max(0, acorn.structuralCarbonKg - mobilization.residualCarbonKg),
  );
  const nitrogen = Math.min(
    mobilization.maximumNitrogenKgPerDay,
    Math.max(0, acorn.structuralNitrogenKg - mobilization.residualNitrogenKg),
  );
  const phosphorus = Math.min(
    mobilization.maximumPhosphorusKgPerDay,
    Math.max(0, acorn.structuralPhosphorusKg - mobilization.residualPhosphorusKg),
  );
  const water = Math.min(mobilization.maximumWaterLitersPerDay, acorn.waterLiters);
  acorn.structuralCarbonKg -= carbon;
  acorn.structuralNitrogenKg -= nitrogen;
  acorn.structuralPhosphorusKg -= phosphorus;
  acorn.waterLiters -= water;
  state.mobile = {
    carbonKg: state.mobile.carbonKg + carbon,
    nitrogenKg: state.mobile.nitrogenKg + nitrogen,
    phosphorusKg: state.mobile.phosphorusKg + phosphorus,
    waterLiters: state.mobile.waterLiters + water,
  };
}

function emergeRadicle(state: MutableOakStateV1): void {
  if (state.organs.some((organ) => organ.kind === 'coarse-root')) return;
  const acorn = state.organs[0]!;
  const emergence = OAK_PARAMETERS_V1.growth.emergence;
  const coarseCost = costForCarbon(
    emergence.coarseRootCarbonKg,
    emergence.coarseRootWaterLiters,
  );
  const fineCost = costForCarbon(
    emergence.fineRootCarbonKg,
    emergence.fineRootWaterLiters,
  );
  if (!canPay(state, sumCosts([coarseCost, fineCost]))) return;
  pay(state, sumCosts([coarseCost, fineCost]));
  const coarse = addOrgan(state, {
    kind: 'coarse-root',
    parentKey: acorn.key,
    branchOrder: 0,
    positionM: oakAcornGerminationPortsV1(acorn).bottom,
    direction: { x: 0, y: -1, z: 0 },
    lengthM: emergence.coarseRootLengthM,
    radiusM: emergence.coarseRootInitialRadiusM,
    stage: 'expanding',
    cost: coarseCost,
  });
  addOrgan(state, {
    kind: 'fine-root-cohort',
    parentKey: coarse.key,
    branchOrder: 1,
    positionM: oakRestTipV1(coarse),
    direction: emergence.fineRootDirection,
    lengthM: emergence.fineRootLengthM,
    radiusM: emergence.fineRootInitialRadiusM,
    stage: 'expanding',
    cost: fineCost,
  });
  state.phenology = 'radicle-emergence';
}

function emergeShoot(state: MutableOakStateV1): void {
  if (state.organs.some((organ) => organ.kind === 'stem')) return;
  const acorn = state.organs[0]!;
  const emergence = OAK_PARAMETERS_V1.growth.emergence;
  const stemCost = costForCarbon(emergence.stemCarbonKg, emergence.stemWaterLiters);
  const budCost = costForCarbon(emergence.budCarbonKg, emergence.budWaterLiters);
  if (!canPay(state, sumCosts([stemCost, budCost]))) return;
  pay(state, sumCosts([stemCost, budCost]));
  const stem = addOrgan(state, {
    kind: 'stem',
    parentKey: acorn.key,
    branchOrder: 0,
    positionM: oakAcornGerminationPortsV1(acorn).top,
    direction: { x: 0, y: 1, z: 0 },
    lengthM: emergence.stemLengthM,
    radiusM: emergence.stemInitialRadiusM,
    stage: 'expanding',
    cost: stemCost,
  });
  addOrgan(state, {
    kind: 'bud',
    parentKey: stem.key,
    branchOrder: 0,
    positionM: oakRestTipV1(stem),
    direction: stem.direction,
    lengthM: emergence.budLengthM,
    radiusM: emergence.budInitialRadiusM,
    stage: 'dormant',
    cost: budCost,
  });
  state.phenology = 'shoot-emergence';
}

/** Five precomputed positions, advancing by 144 degrees around the main axis. */
export const OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1 = Object.freeze([
  ...OAK_PARAMETERS_V1.growth.flushArchitecture.phyllotaxisDirections,
]);

/** Deterministic petiole torsion surrogate; values are bank about the midrib. */
export const OAK_LEAF_BANK_RADIANS_V1 = Object.freeze([
  ...OAK_PARAMETERS_V1.growth.flushArchitecture.leafBankRadians,
]);

function moveOrganToLitter(
  state: MutableOakStateV1,
  organ: MutableOakOrganV1,
): void {
  const litterCell = state.soil[0]!;
  litterCell.litterCarbonKg += organ.structuralCarbonKg;
  litterCell.litterNitrogenKg += organ.structuralNitrogenKg;
  litterCell.litterPhosphorusKg += organ.structuralPhosphorusKg;
  litterCell.waterLiters += organ.waterLiters;
  organ.structuralCarbonKg = 0;
  organ.structuralNitrogenKg = 0;
  organ.structuralPhosphorusKg = 0;
  organ.waterLiters = 0;
  if (organ.kind === 'leaf') organ.areaM2 = 0;
  organ.stage = 'abscised';
}

function createFlush(state: MutableOakStateV1, flushIndex: number): void {
  if (state.counters.flushCount !== flushIndex) return;
  const architecture = OAK_PARAMETERS_V1.growth.flushArchitecture;
  const segmentCosts = architecture.segmentCarbonFractions.map((fraction) => costForCarbon(
    OAK_PARAMETERS_V1.growth.segmentCarbonKg * fraction,
    architecture.segmentWaterLiters * fraction,
  ));
  const budCost = costForCarbon(architecture.budCarbonKg, architecture.budWaterLiters);
  const leafCosts = Array.from({ length: architecture.leafCount }, () => costForCarbon(
    OAK_PARAMETERS_V1.growth.leafCarbonKg,
    OAK_PARAMETERS_V1.growth.leafWaterLiters,
  ));
  const branchCost = flushIndex >= architecture.branchStartsAtFlushIndex
    ? costForCarbon(architecture.branchCarbonKg, architecture.branchWaterLiters)
    : null;
  const axillaryLeafKey = oakOrganKeyV1({
    localId: state.nextOrganLocalId + architecture.leafCount * 2 + 1,
    generation: 1,
  });
  const axillaryPlan = branchCost
    ? planOakAxillaryShootV1(flushIndex, leafCosts[0]!, axillaryLeafKey)
    : null;
  const costs = branchCost && axillaryPlan
    ? [...segmentCosts, budCost, ...leafCosts, branchCost, axillaryPlan.leafCost, budCost]
    : [...segmentCosts, budCost, ...leafCosts];
  const total = sumCosts(costs);
  const previousStem = state.organs
    .filter((organ) => organ.kind === 'stem')
    .at(-1);
  const terminalBud = state.organs.find((organ) =>
    organ.kind === 'bud'
    && organ.stage === 'dormant'
    && organ.parentKey === previousStem?.key);
  if (!previousStem || !terminalBud || !canPay(state, total)) return;
  pay(state, total);
  moveOrganToLitter(state, terminalBud);
  const extensionLengthM = architecture.extensionBaseLengthM
    + flushIndex * architecture.extensionLengthIncrementM;
  const internodeLengthFractions = architecture.segmentCarbonFractions;
  const baseRadiusM = Math.max(
    architecture.minimumInitialBaseRadiusM,
    previousStem.radiusM * architecture.previousStemRadiusRatio,
  );
  let proximal = previousStem;
  let subapical: MutableOakOrganV1 | undefined;
  // One flush is one extension unit and therefore owns one shoot axis. Node-
  // by-node random axes created visible kinks that implied separate branches.
  const extensionLean = (nextOakRandomUnitV1(state) - 0.5)
    * architecture.randomLeanAmplitude;
  for (const [nodeIndex, segmentCost] of segmentCosts.entries()) {
    const segment = addOrgan(state, {
      kind: 'stem',
      parentKey: proximal.key,
      branchOrder: 0,
      positionM: oakRestTipV1(proximal),
      direction: {
        x: extensionLean,
        y: 1,
        z: extensionLean * architecture.leanZCoupling,
      },
      lengthM: extensionLengthM * internodeLengthFractions[nodeIndex]!,
      radiusM: baseRadiusM * (1 - nodeIndex * architecture.initialNodeRadiusStepFraction),
      stage: 'expanding',
      cost: segmentCost,
    });
    const directionIndex = (flushIndex * 3 + nodeIndex)
      % OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1.length;
    const direction = OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1[directionIndex]!;
    const leafLengthM = OAK_PARAMETERS_V1.growth.leafBladeLengthM
      / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
    const leafRollRadians = OAK_LEAF_BANK_RADIANS_V1[directionIndex]!
      + (nextOakRandomUnitV1(state) - 0.5) * architecture.leafBankJitterRadians;
    const leafKey = oakOrganKeyV1({
      localId: state.nextOrganLocalId,
      generation: 1,
    });
    const leafPortOffsets = oakLeafTangentialPortOffsetsForOrganV1(
      leafKey,
      OAK_PARAMETERS_V1.growth.leafAreaM2,
      leafLengthM,
      segment.direction,
      segment.radiusM,
      direction,
      leafRollRadians,
    );
    addOrgan(state, {
      kind: 'leaf',
      parentKey: segment.key,
      branchOrder: 1,
      positionM: oakLateralAttachmentPortV1(
        segment,
        direction,
        leafPortOffsets.radialCenterOffsetM,
        leafPortOffsets.axialCenterOffsetM,
      ),
      direction,
      lengthM: leafLengthM,
      radiusM: architecture.leafInitialRadiusM,
      areaM2: OAK_PARAMETERS_V1.growth.leafAreaM2,
      rollRadians: leafRollRadians,
      stage: 'expanding',
      cost: leafCosts[nodeIndex]!,
    });
    if (nodeIndex === architecture.subapicalNodeIndex) subapical = segment;
    proximal = segment;
  }
  if (branchCost && subapical) {
    createOakAxillaryShootV1({
      state,
      flushIndex,
      subapical,
      branchCost,
      plan: axillaryPlan!,
      budCost,
      authorOrgan: addOrgan,
    });
  }
  addOrgan(state, {
    kind: 'bud',
    parentKey: proximal.key,
    branchOrder: 0,
    positionM: oakRestTipV1(proximal),
    direction: proximal.direction,
    lengthM: architecture.terminalBudLengthM,
    radiusM: architecture.terminalBudInitialRadiusM,
    stage: 'dormant',
    cost: budCost,
  });
  state.counters.flushCount += 1;
  state.phenology = (['first-flush', 'second-flush', 'third-flush'] as const)[
    flushIndex
  ]!;
}

function allocateGrowth(state: MutableOakStateV1): void {
  const reserve = state.counters.flushCount
      < OAK_PARAMETERS_V1.growth.flushArchitecture.branchStartsAtFlushIndex + 1
    ? OAK_PARAMETERS_V1.growth.preThirdFlushMobileReserve
    : OAK_PARAMETERS_V1.growth.postThirdFlushMobileReserve;
  const carbon = Math.min(
    OAK_PARAMETERS_V1.growth.dailyAllocationCarbonKg,
    Math.max(0, state.mobile.carbonKg - reserve.carbonKg),
    Math.max(
      0,
      (state.mobile.nitrogenKg - reserve.nitrogenKg)
        / OAK_PARAMETERS_V1.growth.nitrogenPerStructuralCarbon,
    ),
    Math.max(
      0,
      (state.mobile.phosphorusKg - reserve.phosphorusKg)
        / OAK_PARAMETERS_V1.growth.phosphorusPerStructuralCarbon,
    ),
    Math.max(
      0,
      (state.mobile.waterLiters - reserve.waterLiters)
        / OAK_PARAMETERS_V1.growth.waterLitersPerStructuralCarbonKg,
    ),
  );
  if (carbon <= 0) return;
  const targets = state.organs.filter((organ) =>
    organ.stage !== 'abscised'
    && ['stem', 'branch', 'coarse-root', 'fine-root-cohort'].includes(organ.kind));
  if (targets.length === 0) return;
  const nitrogen = carbon * OAK_PARAMETERS_V1.growth.nitrogenPerStructuralCarbon;
  const phosphorus = carbon * OAK_PARAMETERS_V1.growth.phosphorusPerStructuralCarbon;
  const water = carbon * OAK_PARAMETERS_V1.growth.waterLitersPerStructuralCarbonKg;
  state.mobile = {
    ...state.mobile,
    carbonKg: state.mobile.carbonKg - carbon,
    nitrogenKg: state.mobile.nitrogenKg - nitrogen,
    phosphorusKg: state.mobile.phosphorusKg - phosphorus,
    waterLiters: state.mobile.waterLiters - water,
  };
  const shareCarbon = carbon / targets.length;
  for (const target of targets) {
    target.structuralCarbonKg += shareCarbon;
    target.structuralNitrogenKg += nitrogen / targets.length;
    target.structuralPhosphorusKg += phosphorus / targets.length;
    target.waterLiters += water / targets.length;
    if (target.kind === 'fine-root-cohort') {
      extendOakOrganAtDistalEndV1(
        state,
        target,
        shareCarbon / OAK_PARAMETERS_V1.growth.extensionCarbonKgPerMeter.fineRoot,
      );
    } else if (target.kind === 'coarse-root') {
      extendOakOrganAtDistalEndV1(
        state,
        target,
        shareCarbon / OAK_PARAMETERS_V1.growth.extensionCarbonKgPerMeter.coarseRoot,
      );
    }
    else {
      extendOakOrganAtDistalEndV1(
        state,
        target,
        shareCarbon / OAK_PARAMETERS_V1.growth.extensionCarbonKgPerMeter.abovegroundWood,
      );
    }
  }
}

function senesceLeaves(state: MutableOakStateV1, day: number): void {
  if (day >= OAK_PARAMETERS_V1.growth.senescenceDay) {
    state.phenology = 'senescence';
    const senescenceAgeDays = day - OAK_PARAMETERS_V1.growth.senescenceDay + 1;
    const seasonalChlorophyllCeiling = Math.max(
      OAK_PARAMETERS_V1.growth.minimumSenescentChlorophyllFraction,
      OAK_PARAMETERS_V1.growth.newOrgan.leafChlorophyllFraction
        - OAK_PARAMETERS_V1.growth.senescentChlorophyllLossPerDay * senescenceAgeDays,
    );
    for (const leaf of state.organs.filter((organ) => organ.kind === 'leaf')) {
      if (leaf.stage !== 'abscised') {
        leaf.stage = 'senescing';
        leaf.chlorophyllFraction = Math.min(
          leaf.chlorophyllFraction ?? seasonalChlorophyllCeiling,
          seasonalChlorophyllCeiling,
        );
      }
    }
  }
  if (day < OAK_PARAMETERS_V1.growth.senescenceDay
      + OAK_PARAMETERS_V1.growth.abscissionDelayDays) return;
  for (const leaf of state.organs.filter((organ) =>
    organ.kind === 'leaf' && organ.stage === 'senescing')) {
    moveOrganToLitter(state, leaf);
  }
}

export function stepOakAllocationV1(state: MutableOakStateV1): void {
  mobilizeAcornReserve(state);
  allocateGrowth(state);
  state.counters.allocationSteps += 1;
}

export function stepOakPhenologyV1(state: MutableOakStateV1): void {
  const day = Math.floor(state.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1);
  if (day >= OAK_PARAMETERS_V1.growth.radicleDay) emergeRadicle(state);
  if (day >= OAK_PARAMETERS_V1.growth.shootDay) emergeShoot(state);
  for (const [flushIndex, flushDay] of OAK_PARAMETERS_V1.growth.flushDays.entries()) {
    if (day >= flushDay) createFlush(state, flushIndex);
  }
  if (day >= OAK_PARAMETERS_V1.growth.matureLeafDay
      && state.counters.flushCount === OAK_PARAMETERS_V1.growth.flushDays.length) {
    state.phenology = 'leaf-mature';
    for (const organ of state.organs) {
      if (organ.stage === 'expanding') organ.stage = 'mature';
    }
  }
  senesceLeaves(state, day);
  state.counters.phenologySteps += 1;
}

export function oakOrganDryMassKgV1(organ: MutableOakOrganV1): number {
  return organ.structuralCarbonKg / CARBON_FRACTION;
}
