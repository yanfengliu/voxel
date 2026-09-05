import {
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
  OAK_DAYS_PER_WEEK_V1,
  OAK_HOURS_PER_DAY_V1,
  OAK_SECONDS_PER_HOUR_V1,
  OAK_SECONDS_PER_DAY_V1,
} from './oak-parameters.js';
import {
  isOakAttachedLivingOrganV1,
  isOakExposedAttachedFineRootV1,
  isOakExposedAttachedLeafV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import type {
  MutableOakOrganV1,
  MutableOakSoilCellV1,
  MutableOakStateV1,
} from './oak-state.js';
import {
  addOakBoundarySinkV1,
  addOakBoundarySourceV1,
  oakConservativeScalarTransferV1,
} from './oak-boundary-accounting.js';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function cellVolumeLiters(cell: MutableOakSoilCellV1): number {
  return cell.sizeM.x * cell.sizeM.y * cell.sizeM.z * 1_000;
}

function topCells(state: MutableOakStateV1): MutableOakSoilCellV1[] {
  return state.soil.filter((cell) => cell.centerM.y > -cell.sizeM.y);
}

function rejectSoilWaterAbovePorosity(
  state: MutableOakStateV1,
  cell: MutableOakSoilCellV1,
): void {
  const capacity = cellVolumeLiters(cell) * cell.porosityFraction;
  const runoff = Math.max(0, cell.waterLiters - capacity);
  if (runoff <= 0) return;
  cell.waterLiters -= runoff;
  addOakBoundarySinkV1(state, 0, 0, 0, runoff);
}

function applyInputs(state: MutableOakStateV1): void {
  const absoluteHour = Math.floor(
    state.elapsedBiologicalSeconds / OAK_SECONDS_PER_HOUR_V1,
  );
  const weeklyPulse = absoluteHour % (OAK_HOURS_PER_DAY_V1 * OAK_DAYS_PER_WEEK_V1)
    === OAK_PARAMETERS_V1.forcing.weeklyInputHourOffset;
  const forcing = OAK_PARAMETERS_V1.forcing;
  let rain = state.pendingRainLiters;
  let nitrogen = state.pendingAmmoniumKg + state.pendingNitrateKg;
  let phosphorus = state.pendingLabilePhosphorusKg;
  if (weeklyPulse && state.ablation !== 'no-rain') {
    rain += state.regime.water === 'ambient'
      ? forcing.ambientWeeklyRainLiters
      : forcing.lowWeeklyRainLiters;
  }
  if (weeklyPulse && state.ablation !== 'no-nitrogen'
    && state.regime.nitrogen === 'ambient') {
    nitrogen += forcing.ambientNitrogenDepositionKgPerWeek;
  }
  if (weeklyPulse && state.ablation !== 'no-phosphorus'
    && state.regime.phosphorus === 'ambient') {
    phosphorus += forcing.ambientPhosphorusWeatheringKgPerWeek;
  }
  const surface = topCells(state);
  for (const cell of surface) {
    cell.waterLiters += rain / surface.length;
    cell.ammoniumKg += state.pendingAmmoniumKg / surface.length;
    cell.nitrateKg += (nitrogen - state.pendingAmmoniumKg) / surface.length;
    cell.labilePhosphorusKg += phosphorus / surface.length;
    rejectSoilWaterAbovePorosity(state, cell);
  }
  addOakBoundarySourceV1(state, 0, nitrogen, phosphorus, rain);
  state.pendingRainLiters = 0;
  state.pendingAmmoniumKg = 0;
  state.pendingNitrateKg = 0;
  state.pendingLabilePhosphorusKg = 0;
}

function drainAndEvaporate(state: MutableOakStateV1): void {
  const soil = OAK_PARAMETERS_V1.soil;
  for (const cell of state.soil) {
    rejectSoilWaterAbovePorosity(state, cell);
    const volume = cellVolumeLiters(cell);
    const fieldWater = volume * soil.fieldCapacityFraction;
    const excess = Math.max(0, cell.waterLiters - fieldWater);
    const drainage = excess * soil.drainageFractionPerHour;
    const below = state.soil.find((candidate) =>
      candidate.centerM.x === cell.centerM.x
      && candidate.centerM.z === cell.centerM.z
      && candidate.centerM.y < cell.centerM.y);
    if (below) {
      const transfer = oakConservativeScalarTransferV1(
        cell.waterLiters,
        below.waterLiters,
        drainage,
      );
      cell.waterLiters = transfer.source;
      below.waterLiters = transfer.destination;
    } else {
      const before = cell.waterLiters;
      cell.waterLiters -= drainage;
      addOakBoundarySinkV1(state, 0, 0, 0, before - cell.waterLiters);
    }
  }
  const evaporation = soil.evaporationLitersPerTopCellDay / OAK_HOURS_PER_DAY_V1;
  for (const cell of topCells(state)) {
    const available = Math.max(
      0,
      cell.waterLiters - cellVolumeLiters(cell) * soil.wiltingFraction,
    );
    const removed = Math.min(available, evaporation);
    const before = cell.waterLiters;
    cell.waterLiters -= removed;
    addOakBoundarySinkV1(state, 0, 0, 0, before - cell.waterLiters);
  }
}

function transformSoilPools(state: MutableOakStateV1): void {
  const rates = OAK_PARAMETERS_V1.biogeochemistry;
  for (const cell of state.soil) {
    const nitrified = cell.ammoniumKg * rates.ammoniumNitrificationFractionPerHour;
    cell.ammoniumKg -= nitrified;
    cell.nitrateKg += nitrified;

    const dailyFraction = OAK_PROCESS_CADENCE_SECONDS_V1.soil / OAK_SECONDS_PER_DAY_V1;
    const desorbed = cell.sorbedPhosphorusKg
      * rates.phosphorusDesorptionFractionPerDay * dailyFraction;
    cell.sorbedPhosphorusKg -= desorbed;
    cell.labilePhosphorusKg += desorbed;

    if (state.ablation !== 'no-litter') {
      const fraction = rates.litterDecompositionFractionPerDay * dailyFraction;
      const carbonRespired = cell.litterCarbonKg * fraction
        * rates.litterCarbonRespiredFraction;
      const nitrogenMineralized = cell.litterNitrogenKg * fraction;
      const phosphorusMineralized = cell.litterPhosphorusKg * fraction;
      cell.litterCarbonKg -= carbonRespired;
      cell.litterNitrogenKg -= nitrogenMineralized;
      cell.litterPhosphorusKg -= phosphorusMineralized;
      cell.ammoniumKg += nitrogenMineralized;
      cell.labilePhosphorusKg += phosphorusMineralized;
      state.counters.litterCarbonRespiredKg += carbonRespired;
      addOakBoundarySinkV1(state, carbonRespired, 0, 0, 0);
    }
  }
}

function exposedFineRoots(state: MutableOakStateV1): readonly MutableOakOrganV1[] {
  const byKey = new Map(state.organs.map((organ) => [organ.key, organ]));
  return state.organs.filter((organ) => {
    if (!isOakExposedAttachedFineRootV1(organ)) return false;
    const immediateParent = organ.parentKey === null ? undefined : byKey.get(organ.parentKey);
    if (immediateParent?.kind !== 'coarse-root') return false;
    const seen = new Set<string>([organ.key]);
    let current: MutableOakOrganV1 = organ;
    while (current.parentKey !== null) {
      if (seen.has(current.parentKey)) return false;
      seen.add(current.parentKey);
      const parent = byKey.get(current.parentKey);
      if (parent === undefined || !isOakPlacedOrganV1(parent)
        || !isOakAttachedLivingOrganV1(parent)) return false;
      current = parent;
    }
    return current.kind === 'acorn';
  });
}

function totalFineRootLength(state: MutableOakStateV1): number {
  return exposedFineRoots(state)
    .reduce((sum, organ) => sum + organ.lengthM, 0);
}

function pointToCellDistanceSquared(
  point: Readonly<{ x: number; y: number; z: number }>,
  cell: MutableOakSoilCellV1,
): number {
  const halfX = cell.sizeM.x / 2;
  const halfY = cell.sizeM.y / 2;
  const halfZ = cell.sizeM.z / 2;
  const dx = Math.max(0, Math.abs(point.x - cell.centerM.x) - halfX);
  const dy = Math.max(0, Math.abs(point.y - cell.centerM.y) - halfY);
  const dz = Math.max(0, Math.abs(point.z - cell.centerM.z) - halfZ);
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Bounded spatial support for the reduced fine-root cohort. Each cohort is
 * sampled at its proximal point, midpoint and distal point; cells farther than
 * the registered influence radius from all three receive exactly zero uptake. This is an explicit
 * low-resolution kernel, not a claim that the complete root topology is known.
 */
export function oakFineRootUptakeWeightsV1(
  state: MutableOakStateV1,
): readonly number[] {
  const influenceRadiusM = OAK_PARAMETERS_V1.roots.influenceRadiusM;
  const radiusSquared = influenceRadiusM * influenceRadiusM;
  const roots = exposedFineRoots(state);
  const raw = state.soil.map((cell) => {
    let support = 0;
    for (const root of roots) {
      for (const fraction of OAK_PARAMETERS_V1.roots.axialSupportSampleFractions) {
        const point = {
          x: root.positionM.x + root.restDirection.x * root.lengthM * fraction,
          y: root.positionM.y + root.restDirection.y * root.lengthM * fraction,
          z: root.positionM.z + root.restDirection.z * root.lengthM * fraction,
        };
        const distanceSquared = pointToCellDistanceSquared(point, cell);
        support += root.lengthM * Math.max(0, 1 - distanceSquared / radiusSquared);
      }
    }
    return support;
  });
  const total = raw.reduce((sum, value) => sum + value, 0);
  const normalized = raw.map((value) => total > 0 ? value / total : 0);
  for (const [index, cell] of state.soil.entries()) {
    cell.lastRootUptakeWeightFraction = normalized[index]!;
  }
  return normalized;
}

function withdrawProportionally(
  cells: readonly MutableOakSoilCellV1[],
  available: (cell: MutableOakSoilCellV1) => number,
  withdraw: (cell: MutableOakSoilCellV1, amount: number) => void,
  requested: number,
): number {
  const total = cells.reduce((sum, cell) => sum + available(cell), 0);
  const actual = Math.min(requested, total);
  if (actual <= 0 || total <= 0) return 0;
  for (const cell of cells) withdraw(cell, actual * available(cell) / total);
  return actual;
}

function withdrawWaterProportionally(
  state: MutableOakStateV1,
  requested: number,
): number {
  const weightedAvailable = state.soil.map((cell) =>
    cell.lastRootUptakeWeightFraction * Math.max(
      0,
      cell.waterLiters
        - cellVolumeLiters(cell) * OAK_PARAMETERS_V1.soil.wiltingFraction,
    ));
  const total = weightedAvailable.reduce((sum, value) => sum + value, 0);
  const actual = Math.min(requested, total);
  if (actual <= 0 || total <= 0) return 0;
  let mobileWater = state.mobile.waterLiters;
  const mobileBefore = mobileWater;
  for (const [index, cell] of state.soil.entries()) {
    const transfer = oakConservativeScalarTransferV1(
      cell.waterLiters,
      mobileWater,
      actual * weightedAvailable[index]! / total,
    );
    cell.waterLiters = transfer.source;
    mobileWater = transfer.destination;
  }
  state.mobile = { ...state.mobile, waterLiters: mobileWater };
  return mobileWater - mobileBefore;
}

/** Root-supported soil water, normalized between wilting and field capacity. */
export function oakRootZoneRelativeExtractableWaterV1(
  state: MutableOakStateV1,
  weights: readonly number[] = oakFineRootUptakeWeightsV1(state),
): number {
  const soil = OAK_PARAMETERS_V1.soil;
  const extractableSpan = soil.fieldCapacityFraction - soil.wiltingFraction;
  if (!(extractableSpan > 0)) {
    throw new Error(
      'Oak root-zone water conductance requires field capacity above wilting fraction.',
    );
  }
  if (weights.length !== state.soil.length) {
    throw new Error(
      `Oak root-zone water conductance received ${String(weights.length)} weights `
      + `for ${String(state.soil.length)} soil cells.`,
    );
  }
  return state.soil.reduce((sum, cell, index) => {
    const waterFraction = cell.waterLiters / cellVolumeLiters(cell);
    const relativeExtractableWater = clamp01(
      (waterFraction - soil.wiltingFraction) / extractableSpan,
    );
    return sum + weights[index]! * relativeExtractableWater;
  }, 0);
}

function rootUptake(state: MutableOakStateV1): void {
  const weights = oakFineRootUptakeWeightsV1(state);
  if (state.ablation === 'no-root-uptake') return;
  const rootLength = totalFineRootLength(state);
  if (rootLength <= 0 || weights.every((weight) => weight === 0)) return;
  const parameters = OAK_PARAMETERS_V1;
  const hourlyFraction = OAK_PROCESS_CADENCE_SECONDS_V1.soil / OAK_SECONDS_PER_DAY_V1;
  const waterAccess = state.regime.water === 'ambient'
    ? 1
    : oakRootZoneRelativeExtractableWaterV1(state, weights)
      ** parameters.roots.rootZoneWaterConductanceExponent;
  const nitrogenAccess = state.regime.nitrogen === 'ambient'
    ? 1
    : parameters.roots.lowMineralAccessibilityFraction;
  const phosphorusAccess = state.regime.phosphorus === 'ambient'
    ? 1
    : parameters.roots.lowMineralAccessibilityFraction;
  const roots = parameters.roots;
  const waterCapacity = roots.mobileWaterBaseCapacityLiters
    + rootLength * roots.mobileWaterCapacityPerRootMeter
    + state.organs.filter(isOakExposedAttachedLeafV1)
      .reduce((sum, organ) =>
        sum + (organ.areaM2 ?? 0) * roots.mobileWaterCapacityPerLeafAreaM2, 0);
  const waterRequested = Math.min(
    Math.max(0, waterCapacity - state.mobile.waterLiters),
    rootLength * parameters.roots.waterUptakeLitersPerRootMeterDay
      * hourlyFraction * waterAccess,
  );
  const water = withdrawWaterProportionally(state, waterRequested);
  const nitrogen = withdrawProportionally(
    state.soil,
    (cell) => cell.lastRootUptakeWeightFraction
      * (cell.ammoniumKg + cell.nitrateKg),
    (cell, amount) => {
      const mineral = cell.ammoniumKg + cell.nitrateKg;
      const ammonium = mineral > 0 ? amount * cell.ammoniumKg / mineral : 0;
      cell.ammoniumKg -= ammonium;
      cell.nitrateKg -= amount - ammonium;
    },
    rootLength * parameters.roots.nitrogenUptakeKgPerRootMeterDay
      * hourlyFraction * nitrogenAccess,
  );
  const phosphorus = withdrawProportionally(
    state.soil,
    (cell) => cell.lastRootUptakeWeightFraction * cell.labilePhosphorusKg,
    (cell, amount) => { cell.labilePhosphorusKg -= amount; },
    rootLength * parameters.roots.phosphorusUptakeKgPerRootMeterDay
      * hourlyFraction * phosphorusAccess,
  );
  state.mobile = {
    carbonKg: state.mobile.carbonKg,
    nitrogenKg: state.mobile.nitrogenKg + nitrogen,
    phosphorusKg: state.mobile.phosphorusKg + phosphorus,
    waterLiters: state.mobile.waterLiters,
  };
  state.counters.rootWaterUptakeLiters += water;
  state.counters.nitrogenUptakeKg += nitrogen;
  state.counters.phosphorusUptakeKg += phosphorus;
}

function mycorrhizalExchange(state: MutableOakStateV1): void {
  if (state.ablation === 'no-mycorrhiza' || totalFineRootLength(state) <= 0) return;
  const rates = OAK_PARAMETERS_V1.biogeochemistry;
  const fraction = OAK_PROCESS_CADENCE_SECONDS_V1.soil / OAK_SECONDS_PER_DAY_V1;
  const rootWeights = oakFineRootUptakeWeightsV1(state);
  for (const [index, cell] of state.soil.entries()) {
    const rootSupport = rootWeights[index]!;
    if (rootSupport <= 0) continue;
    cell.colonizedFineRootFraction = Math.min(
      rates.maximumFineRootColonizationFraction,
      cell.colonizedFineRootFraction
        + rootSupport * rates.colonizationFractionPerRootSupportDay * fraction,
    );
    const nitrogenMined = Math.min(
      cell.ammoniumKg + cell.nitrateKg,
      cell.mycorrhizalCarbonKg
        * rates.nitrogenMinedKgPerFungalCarbonKgDay * fraction * rootSupport,
    );
    const phosphorusMined = Math.min(
      cell.sorbedPhosphorusKg,
      cell.mycorrhizalCarbonKg
        * rates.phosphorusMinedKgPerFungalCarbonKgDay * fraction * rootSupport,
    );
    const mineral = cell.ammoniumKg + cell.nitrateKg;
    const ammonium = mineral > 0 ? nitrogenMined * cell.ammoniumKg / mineral : 0;
    cell.ammoniumKg -= ammonium;
    cell.nitrateKg -= nitrogenMined - ammonium;
    cell.sorbedPhosphorusKg -= phosphorusMined;
    cell.mycorrhizalNitrogenKg += nitrogenMined;
    cell.mycorrhizalPhosphorusKg += phosphorusMined;
    const nitrogenReturned = cell.mycorrhizalNitrogenKg
      * rates.mycorrhizalNitrogenReturnFractionPerDay * fraction;
    const phosphorusReturned = cell.mycorrhizalPhosphorusKg
      * rates.mycorrhizalPhosphorusReturnFractionPerDay * fraction;
    cell.mycorrhizalNitrogenKg -= nitrogenReturned;
    cell.mycorrhizalPhosphorusKg -= phosphorusReturned;
    state.mobile = {
      ...state.mobile,
      nitrogenKg: state.mobile.nitrogenKg + nitrogenReturned,
      phosphorusKg: state.mobile.phosphorusKg + phosphorusReturned,
    };
  }
}

export function stepOakSoilV1(state: MutableOakStateV1): void {
  applyInputs(state);
  drainAndEvaporate(state);
  transformSoilPools(state);
  mycorrhizalExchange(state);
  rootUptake(state);
  state.counters.soilSteps += 1;
}

export function oakWaterStressFractionV1(state: MutableOakStateV1): number {
  const rootLength = totalFineRootLength(state);
  const leafArea = state.organs
    .filter(isOakExposedAttachedLeafV1)
    .reduce((sum, organ) => sum + (organ.areaM2 ?? 0), 0);
  const roots = OAK_PARAMETERS_V1.roots;
  const target = roots.mobileWaterBaseCapacityLiters
    + rootLength * roots.mobileWaterCapacityPerRootMeter
    + leafArea * roots.mobileWaterCapacityPerLeafAreaM2;
  return target > 0 ? clamp01(1 - state.mobile.waterLiters / target) : 0;
}

export function oakNitrogenStressFractionV1(state: MutableOakStateV1): number {
  return clamp01(
    1 - state.mobile.nitrogenKg / OAK_PARAMETERS_V1.roots.nitrogenStressReferenceKg,
  );
}

export function oakPhosphorusStressFractionV1(state: MutableOakStateV1): number {
  return clamp01(
    1 - state.mobile.phosphorusKg / OAK_PARAMETERS_V1.roots.phosphorusStressReferenceKg,
  );
}

export function addOakCarbonSinkV1(state: MutableOakStateV1, amount: number): void {
  addOakBoundarySinkV1(state, amount, 0, 0, 0);
}

export function addOakWaterSinkV1(state: MutableOakStateV1, amount: number): void {
  addOakBoundarySinkV1(state, 0, 0, 0, amount);
}

export function addOakCarbonSourceV1(state: MutableOakStateV1, amount: number): void {
  addOakBoundarySourceV1(state, amount, 0, 0, 0);
}
