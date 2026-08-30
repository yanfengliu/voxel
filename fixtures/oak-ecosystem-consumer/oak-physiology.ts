import {
  addOakCarbonSinkV1,
  addOakCarbonSourceV1,
  addOakWaterSinkV1,
  oakFineRootUptakeWeightsV1,
  oakNitrogenStressFractionV1,
  oakPhosphorusStressFractionV1,
  oakWaterStressFractionV1,
} from './oak-biogeochemistry.js';
import {
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
  OAK_SECONDS_PER_HOUR_V1,
  OAK_SECONDS_PER_DAY_V1,
} from './oak-parameters.js';
import type { MutableOakOrganV1, MutableOakStateV1 } from './oak-state.js';

function livingLeafArea(state: MutableOakStateV1): number {
  return state.organs
    .filter((organ) => organ.kind === 'leaf' && organ.stage !== 'abscised')
    .reduce((sum, organ) => sum + (organ.areaM2 ?? 0), 0);
}

function isDaylight(state: MutableOakStateV1): boolean {
  const secondOfDay = state.elapsedBiologicalSeconds % OAK_SECONDS_PER_DAY_V1;
  const physiology = OAK_PARAMETERS_V1.physiology;
  return secondOfDay >= physiology.daylightStartHour * OAK_SECONDS_PER_HOUR_V1
    && secondOfDay < physiology.daylightEndHour * OAK_SECONDS_PER_HOUR_V1;
}

export function transferOakMycorrhizalCarbonV1(
  state: MutableOakStateV1,
  assimilation: number,
): void {
  if (state.ablation === 'no-mycorrhiza' || assimilation <= 0) return;
  const rootWeights = oakFineRootUptakeWeightsV1(state);
  const colonizedSupport = state.soil.map((cell, index) =>
    cell.colonizedFineRootFraction * rootWeights[index]!);
  const totalColonizedSupport = colonizedSupport.reduce(
    (sum, value) => sum + value,
    0,
  );
  const allocationWeights = totalColonizedSupport > 0
    ? colonizedSupport.map((value) => value / totalColonizedSupport)
    : rootWeights;
  if (allocationWeights.every((weight) => weight === 0)) return;
  const cost = Math.min(
    state.mobile.carbonKg,
    assimilation
      * OAK_PARAMETERS_V1.biogeochemistry.mycorrhizalCarbonFractionOfAssimilation,
  );
  if (cost <= 0) return;
  for (const [index, cell] of state.soil.entries()) {
    cell.mycorrhizalCarbonKg += cost * allocationWeights[index]!;
  }
  state.mobile = { ...state.mobile, carbonKg: state.mobile.carbonKg - cost };
  state.counters.mycorrhizalCarbonCostKg += cost;
}

function updateLeafState(
  leaf: MutableOakOrganV1,
  waterStress: number,
  nitrogenStress: number,
  phosphorusStress: number,
): void {
  const physiology = OAK_PARAMETERS_V1.physiology;
  const resourceStress = Math.max(waterStress, nitrogenStress, phosphorusStress);
  leaf.waterPotentialMpa = Math.max(
    physiology.minimumLeafWaterPotentialMpa,
    physiology.unstressedLeafWaterPotentialMpa
      - physiology.leafWaterPotentialStressSpanMpa * waterStress,
  );
  leaf.relativeWaterContentFraction = Math.max(
    physiology.minimumLeafRelativeWaterContentFraction,
    1 - physiology.leafRelativeWaterContentStressLoss * waterStress,
  );
  leaf.chlorophyllFraction = Math.max(
    physiology.minimumLeafChlorophyllFraction,
    1 - physiology.nitrogenChlorophyllStressLoss * nitrogenStress
      - physiology.phosphorusChlorophyllStressLoss * phosphorusStress,
  );
  leaf.stressFraction = resourceStress;
  leaf.healthFraction = Math.max(
    physiology.minimumLeafHealthFraction,
    1 - physiology.leafHealthStressLoss * resourceStress,
  );
}

/**
 * A deliberately reduced canopy step. It preserves the causal axes of the
 * cited C3 model (light, water and nutrients) but does not claim a calibrated
 * Farquhar parameter set or leaf energy balance.
 */
export function stepOakPhysiologyV1(state: MutableOakStateV1): void {
  const leafArea = livingLeafArea(state);
  const waterStress = oakWaterStressFractionV1(state);
  const nitrogenStress = oakNitrogenStressFractionV1(state);
  const phosphorusStress = oakPhosphorusStressFractionV1(state);
  const daylight = isDaylight(state);
  const stepDayFraction = OAK_PROCESS_CADENCE_SECONDS_V1.physiology
    / OAK_SECONDS_PER_DAY_V1;
  const illuminatedDayCompensation = daylight
    ? OAK_PARAMETERS_V1.physiology.illuminatedDayCompensation
    : 0;
  const assimilation = leafArea
    * OAK_PARAMETERS_V1.physiology.maximumAssimilationCarbonKgPerM2Day
    * stepDayFraction * illuminatedDayCompensation
    * (1 - waterStress) * (1 - nitrogenStress) * (1 - phosphorusStress);
  if (assimilation > 0) {
    const carbonBefore = state.mobile.carbonKg;
    state.mobile = {
      ...state.mobile,
      carbonKg: state.mobile.carbonKg + assimilation,
    };
    const realizedAssimilation = state.mobile.carbonKg - carbonBefore;
    addOakCarbonSourceV1(state, realizedAssimilation);
    state.counters.assimilationCarbonKg += realizedAssimilation;
    transferOakMycorrhizalCarbonV1(state, realizedAssimilation);
  }

  const livingStructuralCarbon = state.organs
    .filter((organ) => organ.stage !== 'abscised')
    .reduce((sum, organ) => sum + organ.structuralCarbonKg, 0);
  const respiration = Math.min(
    state.mobile.carbonKg,
    livingStructuralCarbon
      * OAK_PARAMETERS_V1.physiology.maintenanceRespirationFractionPerDay
      * stepDayFraction,
  );
  const carbonBeforeRespiration = state.mobile.carbonKg;
  state.mobile = {
    ...state.mobile,
    carbonKg: state.mobile.carbonKg - respiration,
  };
  const realizedRespiration = carbonBeforeRespiration - state.mobile.carbonKg;
  addOakCarbonSinkV1(state, realizedRespiration);
  state.counters.respirationCarbonKg += realizedRespiration;

  const potentialTranspiration = leafArea
    * OAK_PARAMETERS_V1.physiology.transpirationLitersPerM2Day
    * stepDayFraction * illuminatedDayCompensation * (1 - waterStress);
  const transpiration = Math.min(state.mobile.waterLiters, potentialTranspiration);
  const waterBefore = state.mobile.waterLiters;
  state.mobile = {
    ...state.mobile,
    waterLiters: state.mobile.waterLiters - transpiration,
  };
  const realizedTranspiration = waterBefore - state.mobile.waterLiters;
  addOakWaterSinkV1(state, realizedTranspiration);
  state.counters.transpirationLiters += realizedTranspiration;

  for (const organ of state.organs) {
    if (organ.kind === 'leaf' && organ.stage !== 'abscised') {
      updateLeafState(organ, waterStress, nitrogenStress, phosphorusStress);
    } else if (organ.kind !== 'acorn') {
      const physiology = OAK_PARAMETERS_V1.physiology;
      organ.waterPotentialMpa = physiology.unstressedAxisWaterPotentialMpa
        - physiology.axisWaterPotentialStressSpanMpa * waterStress;
      organ.stressFraction = Math.max(
        waterStress,
        nitrogenStress,
        phosphorusStress,
      );
      organ.healthFraction = Math.max(
        physiology.minimumAxisHealthFraction,
        1 - organ.stressFraction * physiology.axisHealthStressLoss,
      );
    }
  }
  state.counters.waterStressIntegral += waterStress;
  state.counters.nitrogenStressIntegral += nitrogenStress;
  state.counters.phosphorusStressIntegral += phosphorusStress;
  state.counters.stressSamples += 1;
  state.counters.physiologySteps += 1;
}
