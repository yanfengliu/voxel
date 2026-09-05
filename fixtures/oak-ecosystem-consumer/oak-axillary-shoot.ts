import { oakRestTipV1 } from './oak-growth-geometry.js';
import {
  oakLeafPetioleSectionForOrganV1,
  oakLeafTangentialPortOffsetsForOrganV1,
} from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import {
  nextOakRandomUnitV1,
  oakOrganKeyV1,
  type OakDevelopmentRoleV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import { oakLateralAttachmentPortV1 } from './oak-topology.js';
import type { OakOrganKindV1, OakVec3V1 } from './oak-types.js';

export interface OakOrganCostV1 {
  readonly carbonKg: number;
  readonly nitrogenKg: number;
  readonly phosphorusKg: number;
  readonly waterLiters: number;
}

export interface OakOrganAuthoringInputV1 {
  readonly kind: OakOrganKindV1;
  readonly parentKey: string | null;
  readonly branchOrder: number;
  readonly positionM: OakVec3V1;
  readonly direction: OakVec3V1;
  readonly lengthM: number;
  readonly radiusM: number;
  readonly stage: MutableOakOrganV1['stage'];
  readonly cost: OakOrganCostV1;
  readonly development: OakOrganDevelopmentPlanV1;
  readonly areaM2?: number;
  readonly rollRadians?: number;
}

export interface OakOrganDevelopmentPlanV1 {
  readonly role: OakDevelopmentRoleV1;
  readonly initialFraction: number;
  readonly activationSecond: number | null;
  readonly gateOrganKey: string | null;
  readonly divisionStartOffsetSeconds: number;
  readonly expansionStartOffsetSeconds: number;
  readonly maturationStartOffsetSeconds: number;
  readonly completionOffsetSeconds: number;
  readonly matureStage: MutableOakOrganV1['stage'];
}

type OakOrganAuthorV1 = (
  state: MutableOakStateV1,
  input: Readonly<OakOrganAuthoringInputV1>,
) => MutableOakOrganV1;

export interface OakAxillaryShootPlanV1 {
  readonly leafKey: string;
  readonly leafAreaM2: number;
  readonly leafTotalLengthM: number;
  readonly leafCost: OakOrganCostV1;
}

function minimumMechanicsScaleForLeaf(
  key: string,
  fullLeafLengthM: number,
  axisSimilarityScale: number,
): number {
  const minimumRadiusM = OAK_PARAMETERS_V1.mechanics.minimumRadiusM;
  const radiusAt = (scale: number): number => oakLeafPetioleSectionForOrganV1(
    key,
    OAK_PARAMETERS_V1.growth.leafAreaM2 * scale * scale,
    fullLeafLengthM * scale,
  ).weakAxisEquivalentCircularRadiusM;
  if (radiusAt(axisSimilarityScale) >= minimumRadiusM) return axisSimilarityScale;
  if (radiusAt(1) < minimumRadiusM) {
    throw new Error(
      `Oak axillary leaf '${key}' cannot reach the mechanics minimum petiole radius `
      + `${String(minimumRadiusM)} m even at full scale.`,
    );
  }
  let failing = axisSimilarityScale;
  let passing = 1;
  for (let iteration = 0; iteration < 64; iteration += 1) {
    const candidate = (failing + passing) / 2;
    if (radiusAt(candidate) >= minimumRadiusM) passing = candidate;
    else failing = candidate;
  }
  return passing;
}

/**
 * Scale the first expanding lateral leaf with its shorter secondary axis.
 * Similarity keeps area and paid pools quadratic in its linear scale instead
 * of placing a full primary-axis lamina instantaneously on a young shoot.
 */
export function planOakAxillaryShootV1(
  flushIndex: number,
  fullLeafCost: OakOrganCostV1,
  leafKey: string,
): OakAxillaryShootPlanV1 {
  const architecture = OAK_PARAMETERS_V1.growth.flushArchitecture;
  const primaryExtensionLengthM = architecture.extensionBaseLengthM
    + flushIndex * architecture.extensionLengthIncrementM;
  const axisSimilarityScale = Math.min(
    1,
    architecture.axillaryBranchLengthM / primaryExtensionLengthM,
  );
  const fullLeafLengthM = OAK_PARAMETERS_V1.growth.leafBladeLengthM
    / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
  const linearScale = minimumMechanicsScaleForLeaf(
    leafKey,
    fullLeafLengthM,
    axisSimilarityScale,
  );
  const areaScale = linearScale * linearScale;
  return {
    leafKey,
    leafAreaM2: OAK_PARAMETERS_V1.growth.leafAreaM2 * areaScale,
    leafTotalLengthM: fullLeafLengthM * linearScale,
    leafCost: {
      carbonKg: fullLeafCost.carbonKg * areaScale,
      nitrogenKg: fullLeafCost.nitrogenKg * areaScale,
      phosphorusKg: fullLeafCost.phosphorusKg * areaScale,
      waterLiters: fullLeafCost.waterLiters * areaScale,
    },
  };
}

/** Author one bounded leafy axillary shoot, including its terminal meristem. */
export function createOakAxillaryShootV1(input: Readonly<{
  state: MutableOakStateV1;
  flushIndex: number;
  subapical: MutableOakOrganV1;
  branchCost: OakOrganCostV1;
  plan: OakAxillaryShootPlanV1;
  budCost: OakOrganCostV1;
  developmentPlans: Readonly<{
    axis: OakOrganDevelopmentPlanV1;
    leaf: OakOrganDevelopmentPlanV1;
    bud: OakOrganDevelopmentPlanV1;
  }>;
  authorOrgan: OakOrganAuthorV1;
}>): void {
  const architecture = OAK_PARAMETERS_V1.growth.flushArchitecture;
  const directionIndex = (
    input.flushIndex * architecture.leafCount + architecture.subapicalNodeIndex
  ) % architecture.phyllotaxisDirections.length;
  const axillaryAzimuth = architecture.phyllotaxisDirections[directionIndex]!;
  const branch = input.authorOrgan(input.state, {
    kind: 'branch',
    parentKey: input.subapical.key,
    branchOrder: 1,
    positionM: oakRestTipV1(input.subapical),
    direction: {
      x: axillaryAzimuth.x * architecture.axillaryHorizontalScale,
      y: architecture.axillaryVerticalScale,
      z: axillaryAzimuth.z * architecture.axillaryHorizontalScale,
    },
    lengthM: architecture.axillaryBranchLengthM,
    radiusM: architecture.axillaryBranchInitialRadiusM,
    stage: 'expanding',
    cost: input.branchCost,
    development: input.developmentPlans.axis,
  });
  const leafDirectionIndex = (
    input.flushIndex * architecture.leafCount + architecture.leafCount
  ) % architecture.phyllotaxisDirections.length;
  const leafDirection = architecture.phyllotaxisDirections[leafDirectionIndex]!;
  const leafLengthM = input.plan.leafTotalLengthM;
  const leafRollRadians = architecture.leafBankRadians[leafDirectionIndex]!
    + (nextOakRandomUnitV1(input.state) - 0.5) * architecture.leafBankJitterRadians;
  const leafKey = oakOrganKeyV1({
    localId: input.state.nextOrganLocalId,
    generation: 1,
  });
  if (leafKey !== input.plan.leafKey) {
    throw new Error(
      `Oak axillary shoot planned leaf '${input.plan.leafKey}' but authored '${leafKey}'; `
      + 'the paid leaf descriptor must match rendered geometry and mechanics.',
    );
  }
  const offsets = oakLeafTangentialPortOffsetsForOrganV1(
    leafKey,
    input.plan.leafAreaM2,
    leafLengthM,
    branch.direction,
    branch.radiusM,
    leafDirection,
    leafRollRadians,
  );
  input.authorOrgan(input.state, {
    kind: 'leaf',
    parentKey: branch.key,
    branchOrder: 2,
    positionM: oakLateralAttachmentPortV1(
      branch,
      leafDirection,
      offsets.radialCenterOffsetM,
      offsets.axialCenterOffsetM,
    ),
    direction: leafDirection,
    lengthM: leafLengthM,
    radiusM: architecture.leafInitialRadiusM,
    areaM2: input.plan.leafAreaM2,
    rollRadians: leafRollRadians,
    stage: 'expanding',
    cost: input.plan.leafCost,
    development: input.developmentPlans.leaf,
  });
  input.authorOrgan(input.state, {
    kind: 'bud',
    parentKey: branch.key,
    branchOrder: 1,
    positionM: oakRestTipV1(branch),
    direction: branch.direction,
    lengthM: architecture.terminalBudLengthM,
    radiusM: architecture.terminalBudInitialRadiusM,
    stage: 'dormant',
    cost: input.budCost,
    development: input.developmentPlans.bud,
  });
}
