import { OAK_PARAMETERS_V1, OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import {
  nextOakRandomUnitV1,
  oakCanPayOrganCostV1,
  oakCostForCarbonV1,
  oakOrganKeyV1,
  oakSumOrganCostsV1,
  payOakOrganCostV1,
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import { oakRestTipV1 } from './oak-growth-geometry.js';
import {
  oakAcornGerminationPortsV1,
  oakLateralAttachmentPortV1,
} from './oak-topology.js';
import { oakLeafTangentialPortOffsetsForOrganV1 } from './oak-leaf-shape.js';
import {
  createOakAxillaryShootV1,
  planOakAxillaryShootV1,
} from './oak-axillary-shoot.js';
import {
  activateOakBudBreakV1,
  authorOakDevelopingOrganV1,
  oakEmergenceDevelopmentPlanV1,
  oakFlushDevelopmentPlansV1,
  oakInitialOrganCostV1,
  stepOakDevelopmentAllocationV1,
} from './oak-development.js';
import {
  beginOakLeafSenescenceV1,
  progressOakLeafLifecycleV1,
} from './oak-leaf-lifecycle.js';
import {
  createOakLeafAttachmentV1,
  oakResolveLeafAttachmentPoseV1,
} from './oak-cellular-leaf-hinge.js';

const GROWTH = OAK_PARAMETERS_V1.growth;
const CARBON_FRACTION = GROWTH.structuralCarbonFractionOfDryMass;

function emergeRadicle(state: MutableOakStateV1): void {
  if (state.organs.some((organ) => organ.kind === 'coarse-root')) return;
  const acorn = state.organs[0]!;
  const emergence = GROWTH.emergence;
  const coarseCost = oakCostForCarbonV1(
    emergence.coarseRootCarbonKg,
    emergence.coarseRootWaterLiters,
  );
  const fineCost = oakCostForCarbonV1(
    emergence.fineRootCarbonKg,
    emergence.fineRootWaterLiters,
  );
  const paid = oakSumOrganCostsV1([
    oakInitialOrganCostV1(coarseCost, 'coarse-root'),
    oakInitialOrganCostV1(fineCost, 'fine-root-cohort'),
  ]);
  if (!oakCanPayOrganCostV1(state, paid)) return;
  payOakOrganCostV1(state, paid);
  const coarse = authorOakDevelopingOrganV1(state, {
    kind: 'coarse-root',
    parentKey: acorn.key,
    branchOrder: 0,
    positionM: oakAcornGerminationPortsV1(acorn).bottom,
    direction: { x: 0, y: -1, z: 0 },
    lengthM: emergence.coarseRootLengthM,
    radiusM: emergence.coarseRootInitialRadiusM,
    stage: 'expanding',
    cost: coarseCost,
    development: oakEmergenceDevelopmentPlanV1('radicle', state, 'mature'),
  });
  authorOakDevelopingOrganV1(state, {
    kind: 'fine-root-cohort',
    parentKey: coarse.key,
    branchOrder: 1,
    positionM: oakRestTipV1(coarse),
    direction: emergence.fineRootDirection,
    lengthM: emergence.fineRootLengthM,
    radiusM: emergence.fineRootInitialRadiusM,
    stage: 'expanding',
    cost: fineCost,
    development: oakEmergenceDevelopmentPlanV1('radicle', state, 'mature', true),
  });
  state.phenology = 'radicle-emergence';
}

function emergeShoot(state: MutableOakStateV1): void {
  if (state.organs.some((organ) => organ.kind === 'stem')) return;
  const acorn = state.organs[0]!;
  const emergence = GROWTH.emergence;
  const stemCost = oakCostForCarbonV1(
    emergence.stemCarbonKg,
    emergence.stemWaterLiters,
  );
  const budCost = oakCostForCarbonV1(
    emergence.budCarbonKg,
    emergence.budWaterLiters,
  );
  const paid = oakSumOrganCostsV1([
    oakInitialOrganCostV1(stemCost, 'stem'),
    oakInitialOrganCostV1(budCost, 'bud'),
  ]);
  if (!oakCanPayOrganCostV1(state, paid)) return;
  payOakOrganCostV1(state, paid);
  const stem = authorOakDevelopingOrganV1(state, {
    kind: 'stem',
    parentKey: acorn.key,
    branchOrder: 0,
    positionM: oakAcornGerminationPortsV1(acorn).top,
    direction: { x: 0, y: 1, z: 0 },
    lengthM: emergence.stemLengthM,
    radiusM: emergence.stemInitialRadiusM,
    stage: 'expanding',
    cost: stemCost,
    development: oakEmergenceDevelopmentPlanV1('shoot', state, 'mature'),
  });
  authorOakDevelopingOrganV1(state, {
    kind: 'bud',
    parentKey: stem.key,
    branchOrder: 0,
    positionM: oakRestTipV1(stem),
    direction: stem.direction,
    lengthM: emergence.budLengthM,
    radiusM: emergence.budInitialRadiusM,
    stage: 'expanding',
    cost: budCost,
    development: oakEmergenceDevelopmentPlanV1('terminal-bud', state, 'dormant', true),
  });
  state.phenology = 'shoot-emergence';
}

/** Five precomputed positions, advancing by 144 degrees around the main axis. */
export const OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1 = Object.freeze([
  ...GROWTH.flushArchitecture.phyllotaxisDirections,
]);

/** Deterministic petiole torsion surrogate; values are bank about the midrib. */
export const OAK_LEAF_BANK_RADIANS_V1 = Object.freeze([
  ...GROWTH.flushArchitecture.leafBankRadians,
]);

function createFlush(state: MutableOakStateV1, flushIndex: number): void {
  if (state.counters.flushCount !== flushIndex) return;
  const architecture = GROWTH.flushArchitecture;
  const segmentCosts = architecture.segmentCarbonFractions.map((fraction) =>
    oakCostForCarbonV1(
      GROWTH.segmentCarbonKg * fraction,
      architecture.segmentWaterLiters * fraction,
    ));
  const budCost = oakCostForCarbonV1(
    architecture.budCarbonKg,
    architecture.budWaterLiters,
  );
  const leafCosts = Array.from({ length: architecture.leafCount }, () =>
    oakCostForCarbonV1(GROWTH.leafCarbonKg, GROWTH.leafWaterLiters));
  const branchCost = flushIndex >= architecture.branchStartsAtFlushIndex
    ? oakCostForCarbonV1(architecture.branchCarbonKg, architecture.branchWaterLiters)
    : null;
  const axillaryLeafKey = oakOrganKeyV1({
    localId: state.nextOrganLocalId + architecture.leafCount * 2 + 1,
    generation: 1,
  });
  const axillaryPlan = branchCost
    ? planOakAxillaryShootV1(flushIndex, leafCosts[0]!, axillaryLeafKey)
    : null;
  const paid = oakSumOrganCostsV1([
    ...segmentCosts.map((cost) => oakInitialOrganCostV1(cost, 'stem')),
    oakInitialOrganCostV1(budCost, 'bud'),
    ...leafCosts.map((cost) => oakInitialOrganCostV1(cost, 'leaf')),
    ...(branchCost && axillaryPlan ? [
      oakInitialOrganCostV1(branchCost, 'branch'),
      oakInitialOrganCostV1(axillaryPlan.leafCost, 'leaf'),
      oakInitialOrganCostV1(budCost, 'bud'),
    ] : []),
  ]);
  const previousStem = state.organs.filter((organ) => organ.kind === 'stem').at(-1);
  const terminalBud = state.organs.find((organ) =>
    organ.kind === 'bud'
    && organ.stage === 'dormant'
    && organ.parentKey === previousStem?.key);
  if (!previousStem || !terminalBud || !oakCanPayOrganCostV1(state, paid)) return;
  payOakOrganCostV1(state, paid);
  const plans = oakFlushDevelopmentPlansV1(terminalBud.key);
  const extensionLengthM = architecture.extensionBaseLengthM
    + flushIndex * architecture.extensionLengthIncrementM;
  const baseRadiusM = Math.max(
    architecture.minimumInitialBaseRadiusM,
    previousStem.radiusM * architecture.previousStemRadiusRatio,
  );
  let proximal = previousStem;
  let subapical: MutableOakOrganV1 | undefined;
  const extensionLean = (nextOakRandomUnitV1(state) - 0.5)
    * architecture.randomLeanAmplitude;
  for (const [nodeIndex, segmentCost] of segmentCosts.entries()) {
    const segment = authorOakDevelopingOrganV1(state, {
      kind: 'stem',
      parentKey: proximal.key,
      branchOrder: 0,
      positionM: oakRestTipV1(proximal),
      direction: {
        x: extensionLean,
        y: 1,
        z: extensionLean * architecture.leanZCoupling,
      },
      lengthM: extensionLengthM * architecture.segmentCarbonFractions[nodeIndex]!,
      radiusM: baseRadiusM * (1 - nodeIndex * architecture.initialNodeRadiusStepFraction),
      stage: 'expanding',
      cost: segmentCost,
      development: plans.axis,
    });
    const directionIndex = (flushIndex * 3 + nodeIndex)
      % OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1.length;
    const direction = OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1[directionIndex]!;
    const leafLengthM = GROWTH.leafBladeLengthM
      / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
    const leafRollRadians = OAK_LEAF_BANK_RADIANS_V1[directionIndex]!
      + (nextOakRandomUnitV1(state) - 0.5) * architecture.leafBankJitterRadians;
    const leafKey = oakOrganKeyV1({ localId: state.nextOrganLocalId, generation: 1 });
    const offsets = oakLeafTangentialPortOffsetsForOrganV1(
      leafKey,
      GROWTH.leafAreaM2,
      leafLengthM,
      segment.direction,
      segment.radiusM,
      direction,
      leafRollRadians,
    );
    authorOakDevelopingOrganV1(state, {
      kind: 'leaf',
      parentKey: segment.key,
      branchOrder: 1,
      positionM: oakLateralAttachmentPortV1(
        segment,
        direction,
        offsets.radialCenterOffsetM,
        offsets.axialCenterOffsetM,
      ),
      direction,
      lengthM: leafLengthM,
      radiusM: architecture.leafInitialRadiusM,
      areaM2: GROWTH.leafAreaM2,
      rollRadians: leafRollRadians,
      stage: 'expanding',
      cost: leafCosts[nodeIndex]!,
      development: plans.leaf,
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
      developmentPlans: plans,
      authorOrgan: authorOakDevelopingOrganV1,
    });
  }
  authorOakDevelopingOrganV1(state, {
    kind: 'bud',
    parentKey: proximal.key,
    branchOrder: 0,
    positionM: oakRestTipV1(proximal),
    direction: proximal.direction,
    lengthM: architecture.terminalBudLengthM,
    radiusM: architecture.terminalBudInitialRadiusM,
    stage: 'expanding',
    cost: budCost,
    development: plans.bud,
  });
  activateOakBudBreakV1(terminalBud, state);
  state.counters.flushCount += 1;
  state.phenology = (['first-flush', 'second-flush', 'third-flush'] as const)[
    flushIndex
  ]!;
}

function refreshLeafPort(
  state: MutableOakStateV1,
  leaf: MutableOakOrganV1,
): void {
  const parent = state.organs.find((organ) => organ.key === leaf.parentKey);
  if (!parent) return;
  leaf.attachment ??= createOakLeafAttachmentV1(parent, leaf);
  const position = oakResolveLeafAttachmentPoseV1({
    organs: state.organs,
    leaf,
    parent,
    leafDirection: leaf.restDirection,
    current: false,
  });
  leaf.restPositionM = position;
  leaf.positionM = { ...leaf.restPositionM };
}

export function exposeOakPrimordiaV1(state: MutableOakStateV1): void {
  for (const organ of state.organs) {
    const development = organ.development;
    if (!development || development.activationSecond !== null) continue;
    const parent = state.organs.find((candidate) => candidate.key === organ.parentKey);
    const gate = development.gateOrganKey === null ? null : state.organs.find((candidate) =>
      candidate.key === development.gateOrganKey);
    if (gate !== null && gate?.stage !== 'abscised') continue;
    const dependentEmergence = development.gateOrganKey === null
      && (organ.kind === 'fine-root-cohort' || organ.kind === 'bud');
    if (gate === null && !dependentEmergence) continue;
    if (gate !== null) development.scheduleStartSecond ??= state.elapsedBiologicalSeconds;
    const parentSharesGate = gate !== null && parent?.development?.gateOrganKey
      === development.gateOrganKey;
    if (dependentEmergence || parentSharesGate) {
      if (!parent || parent.development?.activationSecond === null) continue;
      const clearanceM = Math.max(
        organ.kind === 'leaf'
          ? GROWTH.development.lateralNodeExposureLengthM
          : GROWTH.development.distalNodeExposureLengthM,
        parent.radiusM * (organ.kind === 'leaf'
          ? GROWTH.development.lateralNodeClearanceRadiusMultiple
          : GROWTH.development.distalNodeClearanceRadiusMultiple),
      );
      if (parent.lengthM < clearanceM) continue;
    }
    development.scheduleStartSecond ??= state.elapsedBiologicalSeconds;
    development.activationSecond = state.elapsedBiologicalSeconds;
    const elapsed = state.elapsedBiologicalSeconds - development.scheduleStartSecond;
    development.phase = elapsed < development.divisionStartOffsetSeconds
      ? 'preformed'
      : 'cell-division';
    if (parent) {
      if (organ.kind === 'leaf') refreshLeafPort(state, organ);
      else {
        const position = oakRestTipV1(parent);
        organ.restPositionM = position;
        organ.positionM = { ...position };
      }
    }
  }
}

export function refreshOakExposedOrganPortsV1(state: MutableOakStateV1): void {
  for (const organ of state.organs) {
    if (organ.kind === 'leaf' && organ.parentKey !== null
      && organ.development?.phase !== 'preformed') refreshLeafPort(state, organ);
  }
}

export function stepOakAllocationV1(state: MutableOakStateV1): void {
  stepOakDevelopmentAllocationV1(state);
  progressOakLeafLifecycleV1(state);
}

export function stepOakPhenologyV1(state: MutableOakStateV1): void {
  const day = Math.floor(state.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1);
  if (day >= GROWTH.radicleDay) emergeRadicle(state);
  if (day >= GROWTH.shootDay) emergeShoot(state);
  for (const [flushIndex, flushDay] of GROWTH.flushDays.entries()) {
    if (day >= flushDay) createFlush(state, flushIndex);
  }
  if (day >= GROWTH.matureLeafDay
      && state.counters.flushCount === GROWTH.flushDays.length
      && state.organs.every((organ) => organ.development === undefined
        || organ.development.role === 'seed'
        || organ.development.fraction >= 1
        || organ.stage === 'abscised')) state.phenology = 'leaf-mature';
  beginOakLeafSenescenceV1(state, day);
  state.counters.phenologySteps += 1;
}

export function oakOrganDryMassKgV1(organ: MutableOakOrganV1): number {
  return organ.structuralCarbonKg / CARBON_FRACTION;
}
