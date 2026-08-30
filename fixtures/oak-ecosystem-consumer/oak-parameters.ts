import {
  SOLVER_TIMESTEP_SECONDS_V1,
  SOLVER_TICKS_PER_SECOND_V1,
} from '../../tools/studio/solver-rate.js';

export type OakProvenanceClassV1 =
  | 'published-model'
  | 'species-observation'
  | 'fixture-assumption'
  | 'repository-law';

export interface OakParameterProvenanceV1 {
  readonly id: string;
  readonly class: OakProvenanceClassV1;
  readonly title: string;
  readonly sourceUrl: string;
  readonly scope: string;
}

/**
 * Sources constrain model shape and validation targets. Values explicitly
 * labelled fixture assumptions are hypotheses for this first vertical slice,
 * not measurements of a universal pedunculate oak.
 */
export const OAK_PARAMETER_PROVENANCE_V1 = Object.freeze([
  {
    id: 'repository-live-rate',
    class: 'repository-law',
    title: 'Voxel shared solver rate',
    sourceUrl: '../../tools/studio/solver-rate.ts',
    scope: 'The host scheduler advances only on the repository 60 Hz tick.',
  },
  {
    id: 'oak-extension-units',
    class: 'species-observation',
    title: 'Architectural model of Quercus petraea and Q. robur',
    sourceUrl: 'https://doi.org/10.1093/forestry/73.1.1',
    scope: 'Recurring extension units and branch-order-dependent shoot structure.',
  },
  {
    id: 'oak-young-roots',
    class: 'species-observation',
    title: 'Relation of shoot growth phases in seedling oak to development of the tap root, lateral roots and fine root tips',
    sourceUrl: 'https://doi.org/10.1111/j.1469-8137.1990.tb00917.x',
    scope: 'Taproot-first development followed by more complex lateral and fine-root growth.',
  },
  {
    id: 'oak-two-fifths-phyllotaxis',
    class: 'species-observation',
    title: 'Nodal Anatomy of Some Common Trees',
    sourceUrl: 'https://doi.org/10.1080/13594863709441519',
    scope: 'Quercus spiral 2/5 supports 144-degree mature-shoot divergence; the exact early-seedling sequence is a fixture application.',
  },
  {
    id: 'soil-retention-shape',
    class: 'published-model',
    title: 'A closed-form equation for hydraulic conductivity of unsaturated soils',
    sourceUrl: 'https://doi.org/10.2136/sssaj1980.03615995004400050002x',
    scope: 'Retention and hydraulic-conductivity curve shape only; fixture bounds are not paper-derived.',
  },
  {
    id: 'root-uptake-reduction',
    class: 'published-model',
    title: 'A simple three-dimensional macroscopic root water uptake model',
    sourceUrl: 'https://doi.org/10.5194/hess-16-2957-2012',
    scope: 'Root-length-weighted uptake from bounded heterogeneous soil cells.',
  },
  {
    id: 'c3-light-response-surrogate',
    class: 'published-model',
    title: 'A biochemical model of photosynthetic CO2 assimilation in leaves of C3 species',
    sourceUrl: 'https://doi.org/10.1007/BF00386231',
    scope: 'A bounded light, water and nutrient response surrogate; not full FvCB.',
  },
  {
    id: 'oak-ectomycorrhiza',
    class: 'species-observation',
    title: 'Oak displays common local but specific distant gene regulation responses to different mycorrhizal fungi',
    sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7291512/',
    scope: 'Qualitative mutualism and whole-plant response only; fixture exchange rates are not paper-derived.',
  },
  {
    id: 'green-oak-bending',
    class: 'published-model',
    title: 'Static bending properties of green beech and oak wood',
    sourceUrl: 'https://doi.org/10.3390/f15010150',
    scope: 'Green Quercus robur bending response; fixture E remains a bounded hypothesis.',
  },
  {
    id: 'broad-leaf-reconfiguration',
    class: 'published-model',
    title: 'Drag and reconfiguration of broad leaves in high winds',
    sourceUrl: 'https://doi.org/10.1093/jxb/40.8.941',
    scope: 'Flexible broad leaves reduce projected area as wind speed rises.',
  },
  {
    id: 'early-slice-calibration',
    class: 'fixture-assumption',
    title: 'Oak early-growth case-study calibration hypothesis',
    sourceUrl: './oak-parameters.ts',
    scope: 'Cadences, pool sizes, rates and trigger days awaiting held-out calibration.',
  },
] as const satisfies readonly OakParameterProvenanceV1[]);

export type OakParameterProvenanceIdV1 =
  (typeof OAK_PARAMETER_PROVENANCE_V1)[number]['id'];

function provenanceId<const Id extends OakParameterProvenanceIdV1>(id: Id): Id {
  return id;
}

export const OAK_HOST_TIMESTEP_SECONDS_V1 = SOLVER_TIMESTEP_SECONDS_V1;
export const OAK_HOST_TICKS_PER_SECOND_V1 = SOLVER_TICKS_PER_SECOND_V1;
export const OAK_SECONDS_PER_HOUR_V1 = 3_600;
export const OAK_HOURS_PER_DAY_V1 = 24;
export const OAK_DAYS_PER_WEEK_V1 = 7;
export const OAK_SECONDS_PER_DAY_V1 = 86_400;
export const OAK_DEFAULT_TIME_SCALE_V1 = OAK_SECONDS_PER_DAY_V1;
export const OAK_MAX_TIME_SCALE_V1 = OAK_SECONDS_PER_DAY_V1 * 10;
export const OAK_MAX_ADVANCE_TICKS_V1 = 100_000;
export const OAK_MAX_BIOLOGICAL_DAYS_PER_ADVANCE_V1 = 400;

export const OAK_PROCESS_CADENCE_SECONDS_V1 = Object.freeze({
  physiology: 900,
  soil: 3_600,
  allocation: OAK_SECONDS_PER_DAY_V1,
  phenology: OAK_SECONDS_PER_DAY_V1,
});

export const OAK_PARAMETERS_V1 = Object.freeze({
  identity: {
    species: 'Quercus robur',
    sourceProvenanceId: provenanceId('oak-extension-units'),
  },
  seed: {
    structuralCarbonKg: 0.005,
    structuralNitrogenKg: 0.00008,
    structuralPhosphorusKg: 0.00001,
    waterLiters: 0.004,
    mobileCarbonKg: 0.001,
    mobileNitrogenKg: 0.00004,
    mobilePhosphorusKg: 0.000005,
    mobileWaterLiters: 0.006,
    bodyLengthM: 0.024,
    bodyRadiusM: 0.012,
    initialWaterPotentialMpa: -0.2,
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  soil: {
    cellSizeM: 0.2,
    gridColumns: 2,
    gridRows: 2,
    gridLayers: 2,
    porosityFraction: 0.48,
    fieldCapacityFraction: 0.31,
    wiltingFraction: 0.11,
    drainageFractionPerHour: 0.35,
    evaporationLitersPerTopCellDay: 0.004,
    initialWaterFractions: [0.24, 0.21, 0.27, 0.23, 0.29, 0.26, 0.31, 0.28],
    initialAmmoniumKg: [8e-6, 6e-6, 11e-6, 7e-6, 4e-6, 5e-6, 6e-6, 5e-6],
    initialNitrateKg: [18e-6, 13e-6, 21e-6, 16e-6, 8e-6, 9e-6, 12e-6, 10e-6],
    initialLabilePhosphorusKg: [3e-6, 2e-6, 4e-6, 3e-6, 1e-6, 1.5e-6, 2e-6, 1.5e-6],
    initialSorbedPhosphorusKg: [35e-6, 30e-6, 42e-6, 33e-6, 38e-6, 36e-6, 40e-6, 37e-6],
    initialLitterCarbonKgPerCell: 0.0001,
    initialLitterNitrogenKgPerCell: 4e-6,
    initialLitterPhosphorusKgPerCell: 0.3e-6,
    initialMycorrhizalCarbonKgPerCell: 4e-6,
    initialMycorrhizalNitrogenKgPerCell: 0.4e-6,
    initialMycorrhizalPhosphorusKgPerCell: 0.08e-6,
    mechanismProvenanceId: provenanceId('soil-retention-shape'),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  forcing: {
    ambientWeeklyRainLiters: 0.4,
    lowWeeklyRainLiters: 0.035,
    ambientNitrogenDepositionKgPerWeek: 1.4e-6,
    ambientPhosphorusWeatheringKgPerWeek: 0.12e-6,
    weeklyInputHourOffset: 1,
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  physiology: {
    maximumAssimilationCarbonKgPerM2Day: 0.0045,
    transpirationLitersPerM2Day: 2,
    maintenanceRespirationFractionPerDay: 0.0015,
    daylightStartHour: 6,
    daylightEndHour: 18,
    illuminatedDayCompensation: 2,
    minimumLeafWaterPotentialMpa: -3.8,
    unstressedLeafWaterPotentialMpa: -0.2,
    leafWaterPotentialStressSpanMpa: 3.6,
    minimumLeafRelativeWaterContentFraction: 0.55,
    leafRelativeWaterContentStressLoss: 0.38,
    minimumLeafChlorophyllFraction: 0.35,
    nitrogenChlorophyllStressLoss: 0.45,
    phosphorusChlorophyllStressLoss: 0.2,
    minimumLeafHealthFraction: 0.25,
    leafHealthStressLoss: 0.35,
    unstressedAxisWaterPotentialMpa: -0.15,
    axisWaterPotentialStressSpanMpa: 1.8,
    minimumAxisHealthFraction: 0.4,
    axisHealthStressLoss: 0.25,
    mechanismProvenanceId: provenanceId('c3-light-response-surrogate'),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  roots: {
    waterUptakeLitersPerRootMeterDay: 1.2,
    nitrogenUptakeKgPerRootMeterDay: 1.2e-6,
    phosphorusUptakeKgPerRootMeterDay: 0.18e-6,
    lowMineralAccessibilityFraction: 0.08,
    rootZoneWaterConductanceExponent: 3.5,
    influenceRadiusM: 0.04,
    axialSupportSampleFractions: [0, 0.5, 1],
    mobileWaterBaseCapacityLiters: 0.006,
    mobileWaterCapacityPerRootMeter: 0.03,
    mobileWaterCapacityPerLeafAreaM2: 0.4,
    nitrogenStressReferenceKg: 0.00004,
    phosphorusStressReferenceKg: 0.000008,
    architectureProvenanceId: provenanceId('oak-young-roots'),
    mechanismProvenanceId: provenanceId('root-uptake-reduction'),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  biogeochemistry: {
    ammoniumNitrificationFractionPerHour: 0.001,
    litterDecompositionFractionPerDay: 0.002,
    litterCarbonRespiredFraction: 0.65,
    phosphorusDesorptionFractionPerDay: 0.0005,
    mycorrhizalCarbonFractionOfAssimilation: 0.04,
    mycorrhizalNitrogenReturnFractionPerDay: 0.08,
    mycorrhizalPhosphorusReturnFractionPerDay: 0.06,
    maximumFineRootColonizationFraction: 0.7,
    colonizationFractionPerRootSupportDay: 0.0002,
    nitrogenMinedKgPerFungalCarbonKgDay: 0.002,
    phosphorusMinedKgPerFungalCarbonKgDay: 0.00025,
    mechanismProvenanceId: provenanceId('oak-ectomycorrhiza'),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  growth: {
    structuralCarbonFractionOfDryMass: 0.48,
    nitrogenPerStructuralCarbon: 0.03,
    phosphorusPerStructuralCarbon: 0.002,
    waterLitersPerStructuralCarbonKg: 2,
    dailyAllocationCarbonKg: 0.00012,
    radicleDay: 3,
    shootDay: 6,
    flushDays: [12, 42, 82],
    senescenceDay: 210,
    segmentCarbonKg: 0.00028,
    leafCarbonKg: 0.00009,
    leafWaterLiters: 0.00027,
    leafBladeLengthM: 0.07,
    leafAreaM2: 0.0015,
    newOrgan: {
      waterPotentialMpa: -0.25,
      leafChlorophyllFraction: 0.82,
      leafRelativeWaterContentFraction: 0.95,
    },
    acornMobilization: {
      maximumCarbonKgPerDay: 0.000055,
      residualCarbonKg: 0.0005,
      maximumNitrogenKgPerDay: 1.2e-6,
      residualNitrogenKg: 8e-6,
      maximumPhosphorusKgPerDay: 0.12e-6,
      residualPhosphorusKg: 0.8e-6,
      maximumWaterLitersPerDay: 0.0002,
    },
    emergence: {
      coarseRootCarbonKg: 0.00018,
      coarseRootWaterLiters: 0.00045,
      coarseRootLengthM: 0.035,
      coarseRootInitialRadiusM: 0.0025,
      fineRootCarbonKg: 0.00008,
      fineRootWaterLiters: 0.00035,
      fineRootDirection: { x: 0.2, y: -1, z: 0.1 },
      fineRootLengthM: 0.05,
      fineRootInitialRadiusM: 0.00035,
      stemCarbonKg: 0.0002,
      stemWaterLiters: 0.0004,
      stemLengthM: 0.035,
      stemInitialRadiusM: 0.0024,
      budCarbonKg: 0.00003,
      budWaterLiters: 0.00005,
      budLengthM: 0.006,
      budInitialRadiusM: 0.0015,
    },
    flushArchitecture: {
      leafCount: 3,
      subapicalNodeIndex: 1,
      segmentCarbonFractions: [0.36, 0.34, 0.3],
      segmentWaterLiters: 0.00045,
      budCarbonKg: 0.00003,
      budWaterLiters: 0.00004,
      branchStartsAtFlushIndex: 2,
      branchCarbonKg: 0.00016,
      branchWaterLiters: 0.00025,
      extensionBaseLengthM: 0.055,
      extensionLengthIncrementM: 0.012,
      minimumInitialBaseRadiusM: 0.0018,
      previousStemRadiusRatio: 0.84,
      initialNodeRadiusStepFraction: 0.08,
      randomLeanAmplitude: 0.12,
      leanZCoupling: -0.5,
      leafInitialRadiusM: 0.001,
      leafBankJitterRadians: 0.08,
      axillaryHorizontalScale: 0.82,
      axillaryVerticalScale: 0.9,
      axillaryBranchLengthM: 0.045,
      axillaryBranchInitialRadiusM: 0.0015,
      terminalBudLengthM: 0.006,
      terminalBudInitialRadiusM: 0.0014,
      phyllotaxisDirections: [
        { x: 1, y: 0.28, z: 0 },
        { x: -0.8090169943749473, y: 0.28, z: 0.5877852522924732 },
        { x: 0.30901699437494723, y: 0.28, z: -0.9510565162951536 },
        { x: 0.30901699437494745, y: 0.28, z: 0.9510565162951535 },
        { x: -0.8090169943749476, y: 0.28, z: -0.587785252292473 },
      ],
      leafBankRadians: [0.4, -0.4, 0.32, -0.46, 0.36],
    },
    preThirdFlushMobileReserve: {
      carbonKg: 0.0011,
      nitrogenKg: 0.00003,
      phosphorusKg: 3e-6,
      waterLiters: 0.003,
    },
    postThirdFlushMobileReserve: {
      carbonKg: 0.00045,
      nitrogenKg: 0.000012,
      phosphorusKg: 1e-6,
      waterLiters: 0.002,
    },
    extensionCarbonKgPerMeter: {
      fineRoot: 0.012,
      coarseRoot: 0.025,
      abovegroundWood: 0.03,
    },
    matureLeafDay: 100,
    minimumSenescentChlorophyllFraction: 0.15,
    senescentChlorophyllLossPerDay: 0.02,
    abscissionDelayDays: 30,
    attachmentToleranceSquaredM2: 1e-16,
    mechanismProvenanceIds: Object.freeze([
      provenanceId('oak-extension-units'),
      provenanceId('oak-two-fifths-phyllotaxis'),
    ]),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  leafGeometry: {
    petioleLengthFractionOfTotalLeaf: 0.07,
    petioleNormalizedHalfWidth: 0.014,
    petioleNormalizedHalfThickness: 0.006,
    variants: [
      {
        id: 'seven-lobe' as const,
        stationWidths: [0.055, 0.15, 0.24, 0.18, 0.34, 0.26, 0.39, 0.32, 0.26, 0.18, 0.1],
        camber: 0.055,
        lobeCount: 7,
        aspectClass: 'broad' as const,
      },
      {
        id: 'compact-eleven-lobe' as const,
        stationWidths: [0.1, 0.22, 0.17, 0.34, 0.26, 0.42, 0.33, 0.36, 0.27, 0.3, 0.12],
        camber: 0.085,
        lobeCount: 11,
        aspectClass: 'compact' as const,
      },
      {
        id: 'narrow-nine-lobe' as const,
        stationWidths: [0.045, 0.12, 0.19, 0.14, 0.25, 0.19, 0.29, 0.22, 0.25, 0.19, 0.085],
        camber: 0.035,
        lobeCount: 9,
        aspectClass: 'narrow' as const,
      },
    ],
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
  mechanics: {
    airDensityKgPerM3: 1.225,
    dragCoefficient: 1.1,
    ambientWindSpeedMPerS: 6,
    greenWoodEffectiveYoungsModulusPa: 8e9,
    petioleEffectiveYoungsModulusPa: 0.35e9,
    minimumLeafPetioleStiffnessFraction: 0.18,
    fullyTurgidLeafRelativeWaterContentFraction: 0.95,
    greenWoodDensityKgPerM3: 650,
    waterDensityKgPerLiter: 1,
    gravityMPerS2: 9.81,
    leafReconfigurationPerSpeedSquared: 0.025,
    minimumRadiusM: 0.00025,
    maximumRadiusM: 0.05,
    minimumLengthM: 0.001,
    maximumLengthM: 2,
    minimumYoungsModulusPa: 0.03e9,
    maximumYoungsModulusPa: 16e9,
    maximumWindSpeedMPerS: 12,
    maximumDeflectionLengthFraction: 0.45,
    gustPeriodHostTicks: 120,
    gustRampHostTicks: 30,
    gustPositiveEndHostTick: 90,
    gustBaseFraction: 0.75,
    gustCarrierFraction: 0.25,
    complianceIntegrationSlices: 8,
    lateralDeflectionZCoupling: 0.2,
    woodTipRadiusRatio: 0.72,
    petioleTipRadiusRatio: 0.55,
    minimumTipRadiusRatio: 0.25,
    maximumTipRadiusRatio: 1,
    mechanismProvenanceIds: Object.freeze([
      provenanceId('green-oak-bending'),
      provenanceId('broad-leaf-reconfiguration'),
    ]),
    parameterProvenanceId: provenanceId('early-slice-calibration'),
  },
});
