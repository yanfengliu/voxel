import { OAK_PARAMETERS_V1, OAK_SECONDS_PER_DAY_V1 } from './oak-parameters.js';
import {
  type MutableOakOrganV1,
  type MutableOakStateV1,
} from './oak-state.js';
import { normalizeOakGrowthDirectionV1 } from './oak-growth-geometry.js';
import { moveOakOrganToLitterV1 } from './oak-development.js';
import {
  oakLeafFallMidpointV1,
  oakLeafFallProgressV1,
  oakLeafFallTargetV1,
} from './oak-leaf-fall-path.js';
import { oakWindDirectionV1 } from './oak-mechanics.js';

const GROWTH = OAK_PARAMETERS_V1.growth;

export function beginOakLeafSenescenceV1(
  state: MutableOakStateV1,
  day: number,
): void {
  if (day < GROWTH.senescenceDay) return;
  state.phenology = 'senescence';
  for (const leaf of state.organs.filter((organ) => organ.kind === 'leaf')) {
    if (leaf.stage === 'abscised' || leaf.stage === 'detached') continue;
    leaf.senescenceStartChlorophyllFraction ??= leaf.chlorophyllFraction
      ?? GROWTH.newOrgan.leafChlorophyllFraction;
    leaf.senescenceStartNitrogenKg ??= leaf.structuralNitrogenKg;
    leaf.senescenceStartPhosphorusKg ??= leaf.structuralPhosphorusKg;
    leaf.stage = 'senescing';
    if (leaf.development) leaf.development.phase = 'senescing';
  }
}

function resorbSenescentNutrients(
  state: MutableOakStateV1,
  leaf: MutableOakOrganV1,
  senescenceAgeDays: number,
  senescenceDurationDays: number,
): void {
  const progress = Math.max(0, Math.min(1,
    senescenceAgeDays / senescenceDurationDays));
  const startNitrogenKg = leaf.senescenceStartNitrogenKg ?? leaf.structuralNitrogenKg;
  const startPhosphorusKg = leaf.senescenceStartPhosphorusKg
    ?? leaf.structuralPhosphorusKg;
  const targetNitrogenKg = startNitrogenKg
    * (1 - GROWTH.senescentNitrogenResorptionFraction * progress);
  const targetPhosphorusKg = startPhosphorusKg
    * (1 - GROWTH.senescentPhosphorusResorptionFraction * progress);
  const nitrogenKg = Math.max(0, leaf.structuralNitrogenKg - targetNitrogenKg);
  const phosphorusKg = Math.max(0, leaf.structuralPhosphorusKg - targetPhosphorusKg);
  leaf.structuralNitrogenKg -= nitrogenKg;
  leaf.structuralPhosphorusKg -= phosphorusKg;
  state.mobile = {
    ...state.mobile,
    nitrogenKg: state.mobile.nitrogenKg + nitrogenKg,
    phosphorusKg: state.mobile.phosphorusKg + phosphorusKg,
  };
}

/**
 * Fracture at the leaf-side petiole base without transferring material pools.
 * The full petiole remains part of the leaf through fall and litter; the scar
 * record is zero-mass metadata that lets presentation recolor parent tissue.
 */
export function detachOakLeafAtBaseV1(
  state: MutableOakStateV1,
  leaf: MutableOakOrganV1,
): void {
  if (leaf.parentKey === null) {
    throw new Error(`Oak leaf '${leaf.key}' cannot detach without an attached parent port.`);
  }
  const attachment = leaf.attachment;
  if (attachment === undefined || attachment.parentOrganKey !== leaf.parentKey) {
    throw new Error(
      `Oak leaf '${leaf.key}' cannot detach without its matching physical node attachment.`,
    );
  }
  const parent = state.organs.find((organ) => organ.key === attachment.parentOrganKey);
  if (parent === undefined) {
    throw new Error(
      `Oak leaf '${leaf.key}' cannot retain an abscission scar on missing parent '${leaf.parentKey}'.`,
    );
  }
  leaf.abscissionScar = {
    parentKey: attachment.parentOrganKey,
    positionM: { ...leaf.positionM },
    direction: { ...leaf.direction },
    rollRadians: leaf.rollRadians ?? 0,
    searchRadiusM: GROWTH.development.abscissionWoundSearchRadiusM,
    fallMaterial: {
      chlorophyllFraction: leaf.chlorophyllFraction ?? 0,
      relativeWaterContentFraction: leaf.relativeWaterContentFraction ?? 0,
      stressFraction: leaf.stressFraction,
    },
  };
  const surfaceY = Math.max(...state.soil.map((cell) =>
    cell.centerM.y + cell.sizeM.y / 2));
  const leafIndex = state.organs.filter((organ) => organ.kind === 'leaf')
    .sort((left, right) => left.key.localeCompare(right.key))
    .findIndex((organ) => organ.key === leaf.key);
  const target = oakLeafFallTargetV1(
    leaf,
    leafIndex,
    surfaceY + GROWTH.development.leafFallContactHeightM,
  );
  // A micron-scale fracture cleft keeps the two freshly separated Float32
  // voxel envelopes disjoint without producing a visible or cell-sized jump.
  leaf.positionM = {
    x: leaf.positionM.x + leaf.direction.x * GROWTH.development.abscissionSeparationM,
    y: leaf.positionM.y + leaf.direction.y * GROWTH.development.abscissionSeparationM,
    z: leaf.positionM.z + leaf.direction.z * GROWTH.development.abscissionSeparationM,
  };
  leaf.parentKey = null;
  leaf.stage = 'detached';
  if (leaf.development) leaf.development.phase = 'falling';
  leaf.restPositionM = { ...leaf.positionM };
  leaf.restDirection = { ...leaf.direction };
  leaf.fall = {
    startSecond: state.elapsedBiologicalSeconds,
    durationSeconds: GROWTH.development.leafFallDurationDays
      * OAK_SECONDS_PER_DAY_V1,
    startPositionM: { ...leaf.positionM },
    startDirection: { ...leaf.direction },
    startRollRadians: leaf.rollRadians ?? 0,
    targetMidpointM: target.midpointM,
    targetDirection: target.direction,
    lastProgressFraction: 0,
    windDisplacementM: { x: 0, y: 0, z: 0 },
  };
}

function progressLeafFall(state: MutableOakStateV1, leaf: MutableOakOrganV1): void {
  const fall = leaf.fall!;
  const fraction = Math.min(1,
    (state.elapsedBiologicalSeconds - fall.startSecond) / fall.durationSeconds);
  const windDirection = oakWindDirectionV1();
  const progressDelta = Math.max(0, fraction - fall.lastProgressFraction);
  const driftM = state.currentWindSpeedMPerS
    * GROWTH.development.leafFallWindDriftMPerMPerS * progressDelta;
  fall.windDisplacementM = {
    x: fall.windDisplacementM.x + windDirection.x * driftM,
    y: 0,
    z: fall.windDisplacementM.z + windDirection.z * driftM,
  };
  fall.lastProgressFraction = fraction;
  const progress = oakLeafFallProgressV1(fraction);
  leaf.restDirection = normalizeOakGrowthDirectionV1({
    x: fall.startDirection.x
      + (fall.targetDirection.x - fall.startDirection.x) * progress.orientation,
    y: fall.startDirection.y
      + (fall.targetDirection.y - fall.startDirection.y) * progress.orientation,
    z: fall.startDirection.z
      + (fall.targetDirection.z - fall.startDirection.z) * progress.orientation,
  });
  const startMidpointM = {
    x: fall.startPositionM.x + fall.startDirection.x * leaf.lengthM * 0.5,
    y: fall.startPositionM.y + fall.startDirection.y * leaf.lengthM * 0.5,
    z: fall.startPositionM.z + fall.startDirection.z * leaf.lengthM * 0.5,
  };
  const routeMidpointM = oakLeafFallMidpointV1(
    startMidpointM,
    fall.targetMidpointM,
    fraction,
  );
  const midpointM = {
    x: routeMidpointM.x + fall.windDisplacementM.x,
    y: routeMidpointM.y,
    z: routeMidpointM.z + fall.windDisplacementM.z,
  };
  leaf.restPositionM = {
    x: midpointM.x - leaf.restDirection.x * leaf.lengthM * 0.5,
    y: midpointM.y - leaf.restDirection.y * leaf.lengthM * 0.5,
    z: midpointM.z - leaf.restDirection.z * leaf.lengthM * 0.5,
  };
  leaf.positionM = { ...leaf.restPositionM };
  leaf.direction = { ...leaf.restDirection };
  leaf.rollRadians = fall.startRollRadians * (1 - progress.orientation);
  if (fraction >= 1) {
    if (fall.settledHostTick === undefined) fall.settledHostTick = state.hostTick;
    else if (state.hostTick > fall.settledHostTick) moveOakOrganToLitterV1(state, leaf);
  }
}

export function progressOakLeafLifecycleV1(state: MutableOakStateV1): void {
  const day = state.elapsedBiologicalSeconds / OAK_SECONDS_PER_DAY_V1;
  const detachDay = GROWTH.senescenceDay + GROWTH.abscissionDelayDays;
  const leaves = state.organs.filter((organ) => organ.kind === 'leaf')
    .sort((left, right) => left.key.localeCompare(right.key));
  for (const [leafIndex, leaf] of leaves.entries()) {
    if (leaf.stage === 'senescing') {
      const senescenceAgeDays = Math.max(0, day - GROWTH.senescenceDay);
      const staggerDays = leafIndex * GROWTH.development.leafFallStaggerDaysPerSlot;
      resorbSenescentNutrients(
        state,
        leaf,
        senescenceAgeDays,
        GROWTH.abscissionDelayDays + staggerDays,
      );
      if (day >= detachDay + staggerDays) {
        detachOakLeafAtBaseV1(state, leaf);
      } else {
        leaf.chlorophyllFraction = Math.max(
          GROWTH.minimumSenescentChlorophyllFraction,
          Math.min(
            leaf.chlorophyllFraction ?? GROWTH.newOrgan.leafChlorophyllFraction,
            (leaf.senescenceStartChlorophyllFraction
              ?? GROWTH.newOrgan.leafChlorophyllFraction)
              - GROWTH.senescentChlorophyllLossPerDay * senescenceAgeDays,
          ),
        );
      }
    }
    if (leaf.stage === 'detached' && leaf.fall) progressLeafFall(state, leaf);
  }
}
