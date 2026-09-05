import {
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
  OAK_SECONDS_PER_DAY_V1,
} from './oak-parameters.js';
import { oakAllometricWoodRadiusMForOrganV1 } from './oak-allometry.js';
import {
  oakOrganKeyV1,
  oakScaleOrganCostV1,
  oakSumOrganCostsV1,
  payOakOrganCostV1,
  type MutableOakOrganDevelopmentV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import {
  extendOakOrganAtDistalEndV1,
  normalizeOakGrowthDirectionV1,
} from './oak-growth-geometry.js';
import type {
  OakOrganAuthoringInputV1,
  OakOrganCostV1,
  OakOrganDevelopmentPlanV1,
} from './oak-axillary-shoot.js';
import type {
  OakOrganDevelopmentPhaseV1,
  OakOrganKindV1,
  OakOrganStageV1,
} from './oak-types.js';
const GROWTH = OAK_PARAMETERS_V1.growth;
const DEVELOPMENT = GROWTH.development;
export const OAK_ALLOCATION_DAY_FRACTION_V1 =
  OAK_PROCESS_CADENCE_SECONDS_V1.allocation / OAK_SECONDS_PER_DAY_V1;
const daySeconds = (value: number): number => value * OAK_SECONDS_PER_DAY_V1;
function organPoolFraction(kind: OakOrganKindV1, fraction: number): number {
  return kind === 'stem' || kind === 'branch' || kind === 'coarse-root'
    || kind === 'fine-root-cohort' ? fraction ** 3 : fraction;
}

function organFractionForPools(kind: OakOrganKindV1, fraction: number): number {
  return kind === 'stem' || kind === 'branch' || kind === 'coarse-root'
    || kind === 'fine-root-cohort' ? Math.cbrt(fraction) : fraction;
}

export function oakInitialOrganCostV1(
  cost: OakOrganCostV1,
  kind: OakOrganKindV1,
): OakOrganCostV1 {
  return oakScaleOrganCostV1(
    cost,
    organPoolFraction(kind, DEVELOPMENT.primordiumFraction),
  );
}
function plan(
  role: OakOrganDevelopmentPlanV1['role'],
  activationSecond: number | null,
  gateOrganKey: string | null,
  offsetsDays: readonly [number, number, number, number],
  matureStage: OakOrganStageV1,
): OakOrganDevelopmentPlanV1 {
  return {
    role,
    initialFraction: DEVELOPMENT.primordiumFraction,
    activationSecond,
    gateOrganKey,
    divisionStartOffsetSeconds: daySeconds(offsetsDays[0]),
    expansionStartOffsetSeconds: daySeconds(offsetsDays[1]),
    maturationStartOffsetSeconds: daySeconds(offsetsDays[2]),
    completionOffsetSeconds: daySeconds(offsetsDays[3]),
    matureStage,
  };
}
export function oakEmergenceDevelopmentPlanV1(
  role: 'radicle' | 'shoot' | 'terminal-bud',
  state: MutableOakStateV1,
  matureStage: OakOrganStageV1,
  preformed = false,
): OakOrganDevelopmentPlanV1 {
  return plan(role, preformed ? null : state.elapsedBiologicalSeconds, null, [
    0,
    DEVELOPMENT.emergenceDivisionDays,
    DEVELOPMENT.emergenceExpansionDays,
    DEVELOPMENT.emergenceCompletionDays,
  ], matureStage);
}
export function oakFlushDevelopmentPlansV1(gateOrganKey: string): Readonly<{
  axis: OakOrganDevelopmentPlanV1;
  leaf: OakOrganDevelopmentPlanV1;
  bud: OakOrganDevelopmentPlanV1;
}> {
  return {
    axis: plan('flush-axis', null, gateOrganKey, [
      0,
      DEVELOPMENT.flushAxisDivisionDays,
      DEVELOPMENT.flushAxisExpansionDays,
      DEVELOPMENT.flushAxisMaturationDays,
    ], 'mature'),
    leaf: plan('flush-leaf', null, gateOrganKey, [
      DEVELOPMENT.flushLeafDivisionDelayDays,
      DEVELOPMENT.flushLeafDivisionDays,
      DEVELOPMENT.flushLeafExpansionDays,
      DEVELOPMENT.flushLeafMaturationDays,
    ], 'mature'),
    bud: plan('terminal-bud', null, gateOrganKey, [
      DEVELOPMENT.terminalBudDivisionDelayDays,
      DEVELOPMENT.terminalBudDivisionDays,
      DEVELOPMENT.terminalBudExpansionDays,
      DEVELOPMENT.terminalBudMaturationDays,
    ], 'dormant'),
  };
}
export function authorOakDevelopingOrganV1(
  state: MutableOakStateV1,
  input: Readonly<OakOrganAuthoringInputV1>,
): MutableOakOrganV1 {
  const identity = { localId: state.nextOrganLocalId, generation: 1 };
  state.nextOrganLocalId += 1;
  const fraction = input.development.initialFraction;
  const actualCost = oakScaleOrganCostV1(
    input.cost,
    organPoolFraction(input.kind, fraction),
  );
  const direction = normalizeOakGrowthDirectionV1(input.direction);
  const leafScale = Math.sqrt(fraction);
  const dimensionedWood = input.kind === 'stem'
    || input.kind === 'branch'
    || input.kind === 'coarse-root';
  const targetRadiusM = dimensionedWood
    ? oakAllometricWoodRadiusMForOrganV1({
      kind: input.kind,
      lengthM: input.lengthM,
      radiusM: input.radiusM,
      structuralCarbonKg: input.cost.carbonKg,
      waterLiters: input.cost.waterLiters,
    }) ?? input.radiusM
    : input.radiusM;
  const axial = dimensionedWood || input.kind === 'fine-root-cohort';
  const lengthScale = axial ? fraction
    : input.kind === 'bud' ? Math.cbrt(fraction) : leafScale;
  const radiusScale = input.kind === 'bud' ? Math.cbrt(fraction)
    : axial ? fraction : leafScale;
  const development: MutableOakOrganDevelopmentV1 = {
    ...input.development,
    phase: input.development.activationSecond === null ? 'preformed' : 'cell-division',
    fraction,
    scheduleStartSecond: input.development.activationSecond,
    targetLengthM: input.lengthM,
    targetRadiusM,
    ...(input.areaM2 === undefined ? {} : { targetAreaM2: input.areaM2 }),
    targetPools: { ...input.cost },
    cohorts: {
      preformedCarbonKg: actualCost.carbonKg,
      dividingCarbonKg: 0,
      expandingCarbonKg: 0,
      maturingCarbonKg: 0,
      matureCarbonKg: 0,
    },
  };
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
    lengthM: dimensionedWood
      ? Math.max(
        input.lengthM * fraction,
        DEVELOPMENT.minimumDimensionedWoodLengthM,
      )
      : input.lengthM * lengthScale,
    radiusM: targetRadiusM * radiusScale,
    structuralCarbonKg: actualCost.carbonKg,
    structuralNitrogenKg: actualCost.nitrogenKg,
    structuralPhosphorusKg: actualCost.phosphorusKg,
    waterLiters: actualCost.waterLiters,
    waterPotentialMpa: GROWTH.newOrgan.waterPotentialMpa,
    stage: input.stage,
    healthFraction: 1,
    stressFraction: 0,
    mechanicsClamped: false,
    development,
  };
  if (input.kind === 'leaf') {
    organ.areaM2 = (input.areaM2 ?? 0) * fraction;
    organ.inclinationRadians = Math.asin(direction.y);
    organ.rollRadians = input.rollRadians ?? 0;
    organ.chlorophyllFraction = GROWTH.newOrgan.leafChlorophyllFraction;
    organ.relativeWaterContentFraction = GROWTH.newOrgan.leafRelativeWaterContentFraction;
  }
  state.organs.push(organ);
  state.counters.cumulativeGrowthCarbonKg += actualCost.carbonKg;
  return organ;
}
export function activateOakBudBreakV1(
  organ: MutableOakOrganV1,
  state: MutableOakStateV1,
): void {
  const scale = DEVELOPMENT.budSwellingMassScale;
  organ.stage = 'expanding';
  organ.development = {
    role: 'bud-break',
    phase: 'bud-swelling',
    fraction: 1 / scale,
    initialFraction: 1 / scale,
    activationSecond: state.elapsedBiologicalSeconds,
    scheduleStartSecond: state.elapsedBiologicalSeconds,
    gateOrganKey: null,
    divisionStartOffsetSeconds: 0,
    expansionStartOffsetSeconds: 0,
    maturationStartOffsetSeconds: 0,
    completionOffsetSeconds: daySeconds(DEVELOPMENT.budSwellingDurationDays),
    targetLengthM: organ.lengthM * Math.cbrt(scale),
    targetRadiusM: organ.radiusM * Math.cbrt(scale),
    targetPools: {
      carbonKg: organ.structuralCarbonKg * scale,
      nitrogenKg: organ.structuralNitrogenKg * scale,
      phosphorusKg: organ.structuralPhosphorusKg * scale,
      waterLiters: organ.waterLiters * scale,
    },
    matureStage: 'abscised',
    cohorts: {
      preformedCarbonKg: organ.structuralCarbonKg,
      dividingCarbonKg: 0,
      expandingCarbonKg: 0,
      maturingCarbonKg: 0,
      matureCarbonKg: 0,
    },
  };
}
export function moveOakOrganToLitterV1(
  state: MutableOakStateV1,
  organ: MutableOakOrganV1,
): void {
  const surfaceTopM = Math.max(...state.soil.map((cell) =>
    cell.centerM.y + cell.sizeM.y / 2));
  const midpoint = {
    x: organ.positionM.x + organ.direction.x * organ.lengthM * 0.5,
    z: organ.positionM.z + organ.direction.z * organ.lengthM * 0.5,
  };
  const surfaceCells = state.soil.filter((cell) =>
    Math.abs(cell.centerM.y + cell.sizeM.y / 2 - surfaceTopM)
      < Number.EPSILON * 8_192);
  const litter = organ.kind === 'leaf'
    ? surfaceCells.find((cell) => {
      const halfX = cell.sizeM.x / 2;
      const halfZ = cell.sizeM.z / 2;
      return midpoint.x >= cell.centerM.x - halfX
        && midpoint.x < cell.centerM.x + halfX
        && midpoint.z >= cell.centerM.z - halfZ
        && midpoint.z < cell.centerM.z + halfZ;
    })
    : state.soil[0];
  if (litter === undefined) {
    throw new Error(
      `Oak organ '${organ.key}' litter contact must resolve to a bounded surface soil cell.`,
    );
  }
  organ.litterRecipientSoilCellKey = litter.key;
  litter.litterCarbonKg += organ.structuralCarbonKg;
  litter.litterNitrogenKg += organ.structuralNitrogenKg;
  litter.litterPhosphorusKg += organ.structuralPhosphorusKg;
  litter.waterLiters += organ.waterLiters;
  organ.structuralCarbonKg = 0;
  organ.structuralNitrogenKg = 0;
  organ.structuralPhosphorusKg = 0;
  organ.waterLiters = 0;
  organ.stage = 'abscised';
  if (organ.development) organ.development.phase = 'abscised';
  delete organ.fall;
}
function interpolate(
  elapsed: number,
  start: number,
  end: number,
  from: number,
  to: number,
): number {
  if (elapsed <= start) return from;
  if (elapsed >= end) return to;
  return from + (to - from) * (elapsed - start) / (end - start);
}
function scheduled(
  development: MutableOakOrganDevelopmentV1,
  now: number,
): Readonly<{ cap: number; phase: OakOrganDevelopmentPhaseV1 }> {
  if (development.activationSecond === null) {
    return { cap: development.initialFraction, phase: 'preformed' };
  }
  const elapsed = now - (development.scheduleStartSecond
    ?? development.activationSecond);
  if (development.role === 'bud-break') {
    return {
      cap: interpolate(elapsed, 0, development.completionOffsetSeconds,
        development.initialFraction, 1),
      phase: 'bud-swelling',
    };
  }
  const division = DEVELOPMENT.divisionCarbonFraction;
  const expansion = DEVELOPMENT.expansionCarbonFraction;
  let cap = development.initialFraction;
  if (elapsed >= development.divisionStartOffsetSeconds) {
    cap = interpolate(elapsed, development.divisionStartOffsetSeconds,
      development.expansionStartOffsetSeconds, development.initialFraction, division);
  }
  if (elapsed >= development.expansionStartOffsetSeconds) {
    cap = interpolate(elapsed, development.expansionStartOffsetSeconds,
      development.maturationStartOffsetSeconds, division, expansion);
  }
  if (elapsed >= development.maturationStartOffsetSeconds) {
    cap = interpolate(elapsed, development.maturationStartOffsetSeconds,
      development.completionOffsetSeconds, expansion, 1);
  }
  const phase = elapsed < development.divisionStartOffsetSeconds ? 'preformed'
    : development.fraction < division ? 'cell-division'
      : development.fraction < expansion ? 'cell-expansion'
        : development.fraction < 1 ? 'maturing' : 'mature';
  return { cap, phase };
}
function addCohort(
  development: MutableOakOrganDevelopmentV1,
  phase: OakOrganDevelopmentPhaseV1,
  carbonKg: number,
): void {
  if (phase === 'preformed') development.cohorts.preformedCarbonKg += carbonKg;
  else if (phase === 'cell-division' || phase === 'bud-swelling') {
    development.cohorts.dividingCarbonKg += carbonKg;
  } else if (phase === 'cell-expansion') development.cohorts.expandingCarbonKg += carbonKg;
  else if (phase === 'maturing') development.cohorts.maturingCarbonKg += carbonKg;
  else development.cohorts.matureCarbonKg += carbonKg;
}
function setGeometry(state: MutableOakStateV1, organ: MutableOakOrganV1): void {
  const development = organ.development!;
  const fraction = development.fraction;
  const axial = organ.kind === 'stem' || organ.kind === 'branch'
    || organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort';
  let length = organ.kind === 'leaf'
    ? development.targetLengthM * Math.sqrt(fraction)
    : organ.kind === 'bud'
      ? development.targetLengthM * Math.cbrt(fraction)
      : development.targetLengthM * fraction;
  if (organ.kind === 'stem' || organ.kind === 'branch'
      || organ.kind === 'coarse-root') {
    length = Math.max(length, DEVELOPMENT.minimumDimensionedWoodLengthM);
  }
  if (['stem', 'branch', 'coarse-root', 'fine-root-cohort'].includes(organ.kind)) {
    extendOakOrganAtDistalEndV1(state, organ, length - organ.lengthM);
  } else organ.lengthM = length;
  organ.radiusM = development.targetRadiusM * (axial ? fraction
    : organ.kind === 'bud' ? Math.cbrt(fraction) : Math.sqrt(fraction));
  if (organ.kind === 'leaf') organ.areaM2 = (development.targetAreaM2 ?? 0) * fraction;
}
function allocationScale(
  desired: OakOrganCostV1,
  permitted: OakOrganCostV1,
  carbonBudgetKg: number,
): number {
  if (!(desired.carbonKg > 0)) return 0;
  return Math.min(
    1,
    carbonBudgetKg / desired.carbonKg,
    permitted.carbonKg / desired.carbonKg,
    desired.nitrogenKg > 0 ? permitted.nitrogenKg / desired.nitrogenKg : 1,
    desired.phosphorusKg > 0 ? permitted.phosphorusKg / desired.phosphorusKg : 1,
    desired.waterLiters > 0 ? permitted.waterLiters / desired.waterLiters : 1,
  );
}
function allocatePrimary(state: MutableOakStateV1, carbonBudgetKg: number): number {
  const desired = state.organs.flatMap((organ) => {
    const development = organ.development;
    if (!development || organ.stage === 'abscised'
      || development.phase === 'falling' || development.phase === 'senescing'
      || development.fraction >= 1) return [];
    const planState = scheduled(development, state.elapsedBiologicalSeconds);
    development.phase = planState.phase;
    const fractionAdvance = Math.min(
      DEVELOPMENT.maximumDevelopmentFractionPerAllocation,
      Math.max(0, planState.cap - development.fraction),
    );
    const nextFraction = development.fraction + fractionAdvance;
    const currentPoolFraction = organPoolFraction(organ.kind, development.fraction);
    const poolFractionAdvance = organPoolFraction(organ.kind, nextFraction)
      - currentPoolFraction;
    return fractionAdvance > 0 ? [{
      organ,
      phase: planState.phase,
      currentPoolFraction,
      poolFractionAdvance,
      cost: oakScaleOrganCostV1(development.targetPools, poolFractionAdvance),
    }] : [];
  });
  const total = oakSumOrganCostsV1(desired.map(({ cost }) => cost));
  const scale = allocationScale(total, state.mobile, carbonBudgetKg);
  if (!(scale > 0)) return 0;
  let paidCarbonKg = 0;
  for (const item of desired) {
    const cost = oakScaleOrganCostV1(item.cost, scale);
    payOakOrganCostV1(state, cost);
    const development = item.organ.development!;
    item.organ.structuralCarbonKg += cost.carbonKg;
    item.organ.structuralNitrogenKg += cost.nitrogenKg;
    item.organ.structuralPhosphorusKg += cost.phosphorusKg;
    item.organ.waterLiters += cost.waterLiters;
    development.fraction = Math.min(1, organFractionForPools(
      item.organ.kind,
      item.currentPoolFraction + item.poolFractionAdvance * scale,
    ));
    addCohort(development, item.phase, cost.carbonKg);
    setGeometry(state, item.organ);
    paidCarbonKg += cost.carbonKg;
  }
  state.counters.cumulativeGrowthCarbonKg += paidCarbonKg;
  return paidCarbonKg;
}
function finalizePrimary(state: MutableOakStateV1): void {
  for (const organ of [...state.organs]) {
    const development = organ.development;
    if (!development || development.fraction < 1
      || development.activationSecond === null) continue;
    if (development.phase === 'mature' || development.phase === 'senescing'
      || development.phase === 'falling' || development.phase === 'abscised') continue;
    if (development.role === 'bud-break') {
      moveOakOrganToLitterV1(state, organ);
    } else {
      development.phase = 'mature';
      organ.stage = development.matureStage;
    }
  }
}
function mobilizeAcorn(state: MutableOakStateV1): void {
  const acorn = state.organs.find((organ) => organ.kind === 'acorn');
  if (!acorn || acorn.stage === 'abscised') return;
  const rates = GROWTH.acornMobilization;
  const carbon = Math.min(rates.maximumCarbonKgPerDay * OAK_ALLOCATION_DAY_FRACTION_V1,
    Math.max(0, acorn.structuralCarbonKg - rates.residualCarbonKg));
  const nitrogen = Math.min(rates.maximumNitrogenKgPerDay * OAK_ALLOCATION_DAY_FRACTION_V1,
    Math.max(0, acorn.structuralNitrogenKg - rates.residualNitrogenKg));
  const phosphorus = Math.min(
    rates.maximumPhosphorusKgPerDay * OAK_ALLOCATION_DAY_FRACTION_V1,
    Math.max(0, acorn.structuralPhosphorusKg - rates.residualPhosphorusKg),
  );
  const water = Math.min(rates.maximumWaterLitersPerDay
    * OAK_ALLOCATION_DAY_FRACTION_V1, acorn.waterLiters);
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

export function stepOakDevelopmentAllocationV1(state: MutableOakStateV1): void {
  mobilizeAcorn(state);
  const budget = GROWTH.dailyAllocationCarbonKg * OAK_ALLOCATION_DAY_FRACTION_V1;
  allocatePrimary(state, budget);
  finalizePrimary(state);
  state.counters.allocationSteps += 1;
}
