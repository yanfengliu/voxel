import { oakOrganFreshMassKgV1 } from './oak-allometry.js';
import {
  oakLeafPetioleSectionForOrganV1,
  oakLeafTangentialPortOffsetsForOrganV1,
} from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { MutableOakOrganV1, MutableOakStateV1 } from './oak-state.js';
import type { OakVec3V1, OakWindRegimeV1 } from './oak-types.js';
import {
  assertOakFiniteWoodLoadPathsV1,
  oakLateralAttachmentPortV1,
} from './oak-topology.js';

export interface OakCantileverInputV1 {
  readonly loadDistribution: 'tip' | 'uniform';
  readonly lengthM: number;
  readonly radiusM: number;
  readonly tipRadiusRatio: number;
  readonly youngsModulusPa: number;
  readonly windSpeedMPerS: number;
  readonly projectedAreaM2: number;
  readonly supportedMassKg: number;
  readonly reconfigures: boolean;
}

export interface OakCantileverResponseV1 {
  readonly effectiveLengthM: number;
  readonly effectiveRadiusM: number;
  readonly effectiveTipRadiusRatio: number;
  readonly effectiveYoungsModulusPa: number;
  readonly effectiveWindSpeedMPerS: number;
  readonly effectiveProjectedAreaM2: number;
  readonly secondMomentM4: number;
  readonly windForceN: number;
  readonly selfWeightForceN: number;
  readonly lateralDeflectionM: number;
  readonly downwardDeflectionM: number;
  readonly clamped: boolean;
}

type OakMechanicsOrganFieldsV1 = Pick<MutableOakOrganV1,
  | 'key'
  | 'kind'
  | 'areaM2'
  | 'lengthM'
  | 'radiusM'
  | 'rollRadians'
  | 'structuralCarbonKg'
  | 'waterLiters'> & Readonly<{
    relativeWaterContentFraction?: number;
  }>;

export { oakWoodMassVolumeDiagnosticV1 } from './oak-allometry.js';
export type { OakWoodMassVolumeDiagnosticV1 } from './oak-allometry.js';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalize(vector: OakVec3V1): OakVec3V1 {
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

/** A deterministic, continuous gust carrier in [-1, 1] over the registered period. */
function gustCarrierAtTick(tick: number): number {
  const mechanics = OAK_PARAMETERS_V1.mechanics;
  const phase = tick % mechanics.gustPeriodHostTicks;
  if (phase < mechanics.gustRampHostTicks) {
    return phase / mechanics.gustRampHostTicks;
  }
  if (phase < mechanics.gustPositiveEndHostTick) {
    return 1 - (phase - mechanics.gustRampHostTicks)
      / mechanics.gustRampHostTicks;
  }
  return -1 + (phase - mechanics.gustPositiveEndHostTick)
    / mechanics.gustRampHostTicks;
}

/**
 * Euler-Bernoulli small-deflection cantilever response with bounded inputs.
 * Wind and self-weight loads remain separate so counter-runs can verify their
 * causes. The output is clamped before the small-deflection assumption fails.
 */
export function oakCantileverResponseV1(
  input: OakCantileverInputV1,
): OakCantileverResponseV1 {
  const mechanics = OAK_PARAMETERS_V1.mechanics;
  const lengthM = clamp(
    input.lengthM,
    mechanics.minimumLengthM,
    mechanics.maximumLengthM,
  );
  const radiusM = clamp(
    input.radiusM,
    mechanics.minimumRadiusM,
    mechanics.maximumRadiusM,
  );
  const tipRadiusRatio = clamp(
    input.tipRadiusRatio,
    mechanics.minimumTipRadiusRatio,
    mechanics.maximumTipRadiusRatio,
  );
  const youngsModulusPa = clamp(
    input.youngsModulusPa,
    mechanics.minimumYoungsModulusPa,
    mechanics.maximumYoungsModulusPa,
  );
  const windSpeedMPerS = clamp(
    input.windSpeedMPerS,
    0,
    mechanics.maximumWindSpeedMPerS,
  );
  const projectedAreaM2 = Math.max(0, input.projectedAreaM2);
  const supportedMassKg = Math.max(0, input.supportedMassKg);
  const reconfiguration = input.reconfigures
    ? 1 / (
      1 + mechanics.leafReconfigurationPerSpeedSquared
        * windSpeedMPerS * windSpeedMPerS
    )
    : 1;
  const effectiveProjectedAreaM2 = projectedAreaM2 * reconfiguration;
  const secondMomentM4 = Math.PI * radiusM ** 4 / 4;
  const windForceN = 0.5 * mechanics.airDensityKgPerM3
    * mechanics.dragCoefficient * effectiveProjectedAreaM2
    * windSpeedMPerS * windSpeedMPerS;
  const selfWeightForceN = supportedMassKg * mechanics.gravityMPerS2;
  let complianceMPerN = 0;
  const integrationSlices = mechanics.complianceIntegrationSlices;
  const dx = lengthM / integrationSlices;
  for (let slice = 0; slice < integrationSlices; slice += 1) {
    const x = (slice + 0.5) * dx;
    const fraction = x / lengthM;
    const localRadius = radiusM * (1 - fraction * (1 - tipRadiusRatio));
    const localSecondMoment = Math.PI * localRadius ** 4 / 4;
    const remaining = lengthM - x;
    const kernel = input.loadDistribution === 'tip'
      ? remaining * remaining
      : remaining ** 3 / (2 * lengthM);
    complianceMPerN += kernel * dx / (youngsModulusPa * localSecondMoment);
  }
  const rawLateral = windForceN * complianceMPerN;
  const rawDownward = selfWeightForceN * complianceMPerN;
  const maximumDeflection = mechanics.maximumDeflectionLengthFraction * lengthM;
  const lateralDeflectionM = Math.min(rawLateral, maximumDeflection);
  const downwardDeflectionM = Math.min(rawDownward, maximumDeflection);
  const clamped = lengthM !== input.lengthM
    || radiusM !== input.radiusM
    || tipRadiusRatio !== input.tipRadiusRatio
    || youngsModulusPa !== input.youngsModulusPa
    || windSpeedMPerS !== input.windSpeedMPerS
    || projectedAreaM2 !== input.projectedAreaM2
    || supportedMassKg !== input.supportedMassKg
    || rawLateral > maximumDeflection
    || rawDownward > maximumDeflection;
  return {
    effectiveLengthM: lengthM,
    effectiveRadiusM: radiusM,
    effectiveTipRadiusRatio: tipRadiusRatio,
    effectiveYoungsModulusPa: youngsModulusPa,
    effectiveWindSpeedMPerS: windSpeedMPerS,
    effectiveProjectedAreaM2,
    secondMomentM4,
    windForceN,
    selfWeightForceN,
    lateralDeflectionM,
    downwardDeflectionM,
    clamped,
  };
}

export function oakCantileverResponseForOrganV1(
  organ: OakMechanicsOrganFieldsV1,
  windSpeedMPerS: number,
): OakCantileverResponseV1 | null {
  if (organ.kind === 'acorn' || organ.kind === 'coarse-root'
    || organ.kind === 'fine-root-cohort') return null;
  const leaf = organ.kind === 'leaf';
  if (leaf && !((organ.areaM2 ?? 0) > 0)) return null;
  const leafSection = leaf
    ? oakLeafPetioleSectionForOrganV1(
      organ.key,
      organ.areaM2 ?? 0,
      organ.lengthM,
    )
    : null;
  const projectedAreaM2 = leaf
    ? organ.areaM2 ?? 0
    : 2 * organ.radiusM * organ.lengthM;
  const tipRadiusRatio = leaf
    ? OAK_PARAMETERS_V1.mechanics.petioleTipRadiusRatio
    : OAK_PARAMETERS_V1.mechanics.woodTipRadiusRatio;
  const supportedMassKg = oakOrganFreshMassKgV1(organ);
  // Leaf length is the total petiole-plus-blade extent. Its normalized short
  // petiole fraction carries the lamina as a tip resultant; reconfiguration
  // changes aerodynamic area, not the dimensioned petiole flexural length.
  const cantileverLengthM = leaf
    ? leafSection!.petioleLengthM
    : organ.lengthM;
  const physiology = OAK_PARAMETERS_V1.physiology;
  const relativeWaterContent = leaf
    ? organ.relativeWaterContentFraction
      ?? OAK_PARAMETERS_V1.mechanics.fullyTurgidLeafRelativeWaterContentFraction
    : OAK_PARAMETERS_V1.mechanics.fullyTurgidLeafRelativeWaterContentFraction;
  const turgorFraction = clamp(
    (relativeWaterContent - physiology.minimumLeafRelativeWaterContentFraction)
      / (OAK_PARAMETERS_V1.mechanics.fullyTurgidLeafRelativeWaterContentFraction
        - physiology.minimumLeafRelativeWaterContentFraction),
    0,
    1,
  );
  const petioleStiffnessFraction =
    OAK_PARAMETERS_V1.mechanics.minimumLeafPetioleStiffnessFraction
    + (1 - OAK_PARAMETERS_V1.mechanics.minimumLeafPetioleStiffnessFraction)
      * turgorFraction;
  return oakCantileverResponseV1({
    loadDistribution: leaf || organ.kind === 'bud' ? 'tip' : 'uniform',
    lengthM: cantileverLengthM,
    radiusM: leaf
      ? leafSection!.weakAxisEquivalentCircularRadiusM
      : organ.radiusM,
    tipRadiusRatio,
    youngsModulusPa: leaf
      ? OAK_PARAMETERS_V1.mechanics.petioleEffectiveYoungsModulusPa
        * petioleStiffnessFraction
      : OAK_PARAMETERS_V1.mechanics.greenWoodEffectiveYoungsModulusPa,
    windSpeedMPerS,
    projectedAreaM2,
    supportedMassKg,
    reconfigures: leaf,
  });
}

function deflectedDirection(
  organ: MutableOakOrganV1,
  response: OakCantileverResponseV1 | null,
): OakVec3V1 {
  if (!response) return organ.restDirection;
  const lateralSlope = response.lateralDeflectionM / response.effectiveLengthM;
  const downwardSlope = response.downwardDeflectionM / response.effectiveLengthM;
  return normalize({
    x: organ.restDirection.x + lateralSlope,
    y: organ.restDirection.y - downwardSlope,
    z: organ.restDirection.z
      + lateralSlope * OAK_PARAMETERS_V1.mechanics.lateralDeflectionZCoupling,
  });
}

function reanchorFromParent(
  organ: MutableOakOrganV1,
  parent: MutableOakOrganV1 | undefined,
  restParent: MutableOakOrganV1 | undefined,
): void {
  if (!parent || !restParent) {
    organ.positionM = organ.restPositionM;
    return;
  }
  const currentParentTip = {
    x: parent.positionM.x + parent.direction.x * parent.lengthM,
    y: parent.positionM.y + parent.direction.y * parent.lengthM,
    z: parent.positionM.z + parent.direction.z * parent.lengthM,
  };
  const restParentTip = {
    x: restParent.restPositionM.x + restParent.restDirection.x * restParent.lengthM,
    y: restParent.restPositionM.y + restParent.restDirection.y * restParent.lengthM,
    z: restParent.restPositionM.z + restParent.restDirection.z * restParent.lengthM,
  };
  organ.positionM = {
    x: currentParentTip.x + organ.restPositionM.x - restParentTip.x,
    y: currentParentTip.y + organ.restPositionM.y - restParentTip.y,
    z: currentParentTip.z + organ.restPositionM.z - restParentTip.z,
  };
}

/**
 * Authoritative quasi-static pose response at the repository 60 Hz host tick.
 * It includes drag, reconfiguration and allometry-shared organ self-weight,
 * but no distal crown load, dynamics or fracture.
 */
export function updateOakWindMechanicsV1(state: MutableOakStateV1): void {
  assertOakFiniteWoodLoadPathsV1(state.organs);
  state.windPhaseTick = state.hostTick;
  const carrier = gustCarrierAtTick(state.windPhaseTick);
  const gustMagnitude = OAK_PARAMETERS_V1.mechanics.gustBaseFraction
    + OAK_PARAMETERS_V1.mechanics.gustCarrierFraction * carrier;
  const windSpeedMPerS = state.windRegime === 'breeze'
    ? OAK_PARAMETERS_V1.mechanics.ambientWindSpeedMPerS * gustMagnitude
    : 0;
  state.currentWindSpeedMPerS = windSpeedMPerS;
  const updatedByKey = new Map<string, MutableOakOrganV1>();
  const restByKey = new Map(state.organs.map((organ) => [organ.key, organ]));
  for (const organ of state.organs) {
    const parent = organ.parentKey === null ? undefined : updatedByKey.get(organ.parentKey);
    const restParent = organ.parentKey === null ? undefined : restByKey.get(organ.parentKey);
    reanchorFromParent(organ, parent, restParent);
    const response = oakCantileverResponseForOrganV1(organ, windSpeedMPerS);
    organ.mechanicsClamped = response?.clamped ?? false;
    organ.direction = deflectedDirection(organ, response);
    if (organ.kind === 'leaf' && parent && response) {
      const rollRadians = organ.rollRadians ?? 0;
      const nodeEnvelopeRadiusM = state.organs.reduce((radius, candidate) => {
        const sharesNode = candidate.parentKey === parent.key
          && (candidate.kind === 'stem'
            || candidate.kind === 'branch'
            || candidate.kind === 'coarse-root'
            || candidate.kind === 'fine-root-cohort');
        return sharesNode ? Math.max(radius, candidate.radiusM) : radius;
      }, parent.radiusM);
      const leafPortOffsets = oakLeafTangentialPortOffsetsForOrganV1(
        organ.key,
        organ.areaM2 ?? 0,
        organ.lengthM,
        parent.direction,
        nodeEnvelopeRadiusM,
        organ.direction,
        rollRadians,
      );
      organ.positionM = oakLateralAttachmentPortV1(
        parent,
        organ.direction,
        leafPortOffsets.radialCenterOffsetM,
        leafPortOffsets.axialCenterOffsetM,
      );
    }
    updatedByKey.set(organ.key, organ);
  }
}

export function setOakWindRegimeV1(
  state: MutableOakStateV1,
  regime: OakWindRegimeV1,
): void {
  state.windRegime = regime;
  updateOakWindMechanicsV1(state);
}
