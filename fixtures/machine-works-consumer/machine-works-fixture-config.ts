import { deterministicTanV1 } from '../deterministic-math.js';
import {
  MACHINE_WORKS_CONVEYOR_DRUM_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from '../../tools/studio/machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import {
  boundsHavePositiveOverlap,
  physicalAssetHasExactSolidBox,
  physicalAssetSolidOverlapsBounds,
  pointTouchesPositiveYSolidFace,
  portLiesInsideSolidInterior,
  portTouchesPositiveZSolidFace,
  scaledPortPosition,
  translated,
  unionBounds,
  voxelBoxBounds,
  type SupportPointV1,
} from './machine-works-support-geometry.js';
import { machineWorksOutputDockCanonicalIssuesV1 } from './machine-works-output-dock-validation.js';
import { machineWorksServiceRouteIssuesV1 } from './machine-works-service-route.js';

/**
 * The machine's own numbers now live Studio-side, where a browser scene can
 * solve against them; this file keeps the proof of the machine. Re-exported
 * so every consumer module and test reads exactly one copy.
 */
export type { MachineWorksTrackIdV1 } from '../../tools/studio/machine-works-machine.js';
export {
  MACHINE_WORKS_SOLVER_VERSION,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_DURATION_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_GRAVITY,
  MACHINE_WORKS_TRACK_IDS,
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_TICKS,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_PICKUP_RULE,
  MACHINE_WORKS_HEAD_ACTUATION_RULE,
} from '../../tools/studio/machine-works-machine.js';
import {
  MACHINE_WORKS_ASSETS,
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_DURATION_MS,
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_GRAINS,
  MACHINE_WORKS_GRAVITY,
  MACHINE_WORKS_HEAD_ACTUATION_RULE,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_PICKUP_RULE,
  MACHINE_WORKS_SOLVER_VERSION,
  MACHINE_WORKS_TICKS,
  MACHINE_WORKS_TRACK_IDS,
} from '../../tools/studio/machine-works-machine.js';

export const MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE = Object.freeze({
  maximumError: 1e-9,
  maximumStraightSlatGap: 0.05,
  maximumTurnSlatGap: 0.12,
  beltContactPorts: Object.freeze({
    slatTop: 'belt-contact-top',
    carriage: 'belt-contact-underside',
  }),
  drumPitchPorts: Object.freeze({
    slatUnderside: 'drum-pitch-underside',
    drum: 'belt-pitch-top',
  }),
  foundationFootPorts: Object.freeze([
    'west-front-foundation-foot',
    'west-rear-foundation-foot',
    'east-front-foundation-foot',
    'east-rear-foundation-foot',
  ] as const),
  headAlignmentPairs: Object.freeze([
    Object.freeze({
      label: 'core-west',
      station: 'core' as const,
      headPort: 'west-rear-alignment',
      pad: 'west',
      rail: 'coreWest',
      bridgePort: 'core-west-alignment',
    }),
    Object.freeze({
      label: 'core-east',
      station: 'core' as const,
      headPort: 'east-rear-alignment',
      pad: 'east',
      rail: 'coreEast',
      bridgePort: 'core-east-alignment',
    }),
    Object.freeze({
      label: 'cap-west',
      station: 'cap' as const,
      headPort: 'west-rear-alignment',
      pad: 'west',
      rail: 'capWest',
      bridgePort: 'cap-west-alignment',
    }),
    Object.freeze({
      label: 'cap-east',
      station: 'cap' as const,
      headPort: 'east-rear-alignment',
      pad: 'east',
      rail: 'capEast',
      bridgePort: 'cap-east-alignment',
    }),
  ] as const),
  actuatorPairs: Object.freeze([
    Object.freeze({
      label: 'core',
      station: 'core' as const,
      bridgePort: 'core-actuator-spine',
      spine: 'core' as const,
      headPort: 'actuator-yoke-cavity',
    }),
    Object.freeze({
      label: 'cap',
      station: 'cap' as const,
      bridgePort: 'cap-actuator-spine',
      spine: 'cap' as const,
      headPort: 'actuator-yoke-cavity',
    }),
  ] as const),
  pressBridgeRole: 'static-non-colliding-grounded-linear-stator-frame',
});

/**
 * Verifies the visual support chain against the same named sidecar ports used
 * to derive the fixture layout. The slat top meets the carrier underside, the
 * slat underside follows the drum's nominal pitch datum, and the top run
 * remains free to translate along X. Exact compound non-overlap is proved
 * separately against every authored collider, not inferred from these datums.
 */
export function machineWorksSupportAlignmentIssuesV1(): readonly string[] {
  const issues: string[] = [];
  const maximum = MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumError;
  issues.push(...machineWorksOutputDockCanonicalIssuesV1(maximum, MACHINE_WORKS_LAYOUT.carriageTipRadians));
  issues.push(...machineWorksServiceRouteIssuesV1(
    MACHINE_WORKS_ASSETS.pressBridge,
    MACHINE_WORKS_ASSETS.head,
    maximum,
  ));
  const foundationCenter: SupportPointV1 = [
    MACHINE_WORKS_LAYOUT.foundationCenterX,
    MACHINE_WORKS_LAYOUT.foundationCenterY,
    MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at[2],
  ];
  const carriageCenter: SupportPointV1 = [
    MACHINE_WORKS_LAYOUT.entryX,
    MACHINE_WORKS_LAYOUT.carriageCenterY,
    MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at[2],
  ];
  const slatTop = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.slat,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.beltContactPorts.slatTop,
      MACHINE_WORKS_GRAINS.slat,
    ),
    [
      MACHINE_WORKS_LAYOUT.entryX,
      MACHINE_WORKS_CONVEYOR_V1.axleY + MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
      0,
    ],
  );
  const slatUnderside = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.slat,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.drumPitchPorts.slatUnderside,
      MACHINE_WORKS_GRAINS.slat,
    ),
    [
      MACHINE_WORKS_CONVEYOR_V1.leftAxleX,
      MACHINE_WORKS_CONVEYOR_V1.axleY + MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
      0,
    ],
  );
  const carriageContact = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.carriage,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.beltContactPorts.carriage,
      MACHINE_WORKS_GRAINS.carriage,
    ),
    carriageCenter,
  );
  const drumTop = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.drum,
      MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.drumPitchPorts.drum,
      MACHINE_WORKS_GRAINS.drum,
    ),
    [
      MACHINE_WORKS_CONVEYOR_V1.leftAxleX,
      MACHINE_WORKS_CONVEYOR_V1.axleY,
      0,
    ],
  );
  const carrierContactError = Math.max(
    Math.abs(slatTop[1] - carriageContact[1]),
    Math.abs(slatTop[2] - carriageContact[2]),
  );
  if (carrierContactError > maximum) {
    issues.push(
      `belt contact datums diverge: slat top=(${slatTop[1].toFixed(6)}, `
      + `${slatTop[2].toFixed(6)}), carriage underside=(${carriageContact[1].toFixed(6)}, `
      + `${carriageContact[2].toFixed(6)}), allowed=${String(maximum)}`,
    );
  }
  const drumPitchError = Math.max(
    Math.abs(slatUnderside[1] - drumTop[1]),
    Math.abs(slatUnderside[2] - drumTop[2]),
  );
  if (drumPitchError > maximum) {
    issues.push(
      `drum pitch datums diverge: slat underside=(${slatUnderside[1].toFixed(6)}, `
      + `${slatUnderside[2].toFixed(6)}), nominal drum pitch=(${drumTop[1].toFixed(6)}, `
      + `${drumTop[2].toFixed(6)}), allowed=${String(maximum)}. Update the path and `
      + 'named sidecar ports together; compound collision clearance has its own exact proof.',
    );
  }
  const beltEntry = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'belt-entry', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const beltExit = translated(
    scaledPortPosition(
      MACHINE_WORKS_ASSETS.foundation, 'belt-exit', MACHINE_WORKS_GRAINS.foundation,
    ),
    foundationCenter,
  );
  const bucketLeft = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[0]
    - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2;
  const beltTurnMinimumX =
    MACHINE_WORKS_CONVEYOR_V1.leftAxleX - MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  const beltTurnMaximumX =
    MACHINE_WORKS_CONVEYOR_V1.rightAxleX + MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
  if (beltTurnMinimumX < beltEntry[0] - maximum
    || beltTurnMaximumX > beltExit[0] + maximum) {
    issues.push(
      `closed belt turn extent x=[${beltTurnMinimumX.toFixed(3)}, `
      + `${beltTurnMaximumX.toFixed(3)}] leaves foundation extent `
      + `x=[${beltEntry[0].toFixed(3)}, ${beltExit[0].toFixed(3)}]`,
    );
  }
  const topRunTargets = [
    MACHINE_WORKS_LAYOUT.entryX,
    MACHINE_WORKS_LAYOUT.coreStationX,
    MACHINE_WORKS_LAYOUT.capStationX,
    MACHINE_WORKS_LAYOUT.tipStationX,
  ];
  if (topRunTargets.some((x) =>
    x < MACHINE_WORKS_CONVEYOR_V1.leftAxleX - maximum
      || x > MACHINE_WORKS_CONVEYOR_V1.rightAxleX + maximum)) {
    issues.push(
      `carrier targets [${topRunTargets.join(', ')}] do not all lie on top belt run `
      + `x=[${String(MACHINE_WORKS_CONVEYOR_V1.leftAxleX)}, `
      + `${String(MACHINE_WORKS_CONVEYOR_V1.rightAxleX)}]`,
    );
  }
  const tipPivotPort = scaledPortPosition(
    MACHINE_WORKS_ASSETS.carriage, 'tip-pivot-axis', MACHINE_WORKS_GRAINS.carriage,
  );
  if (Math.abs(tipPivotPort[0] - MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX) > maximum
    || Math.abs(tipPivotPort[1] - MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY) > maximum) {
    issues.push(
      `authored tip pivot offsets (${String(MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX)}, `
      + `${String(MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY)}) do not match the carrier `
      + `tip-pivot-axis port at (${tipPivotPort[0].toFixed(3)}, ${tipPivotPort[1].toFixed(3)}); `
      + 'the prescribed rotation would orbit the trunnion inside its bearings',
    );
  }
  const pivotX = MACHINE_WORKS_LAYOUT.tipStationX
    + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX;
  if (Math.abs(pivotX - MACHINE_WORKS_LAYOUT.outputDockPivotX) > maximum) {
    issues.push(
      `authored carrier tip pivot x=${pivotX.toFixed(3)} does not meet `
      + `output dock bearing axis x=${MACHINE_WORKS_LAYOUT.outputDockPivotX.toFixed(3)}`,
    );
  }
  const carrierEast = MACHINE_WORKS_LAYOUT.tipStationX
    + MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.sizeVoxels[0]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain / 2;
  const approachGap = bucketLeft - carrierEast;
  if (Math.abs(approachGap - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.carrierApproachGap)
    > maximum) {
    issues.push(
      `docked carrier east face x=${carrierEast.toFixed(3)} leaves `
      + `${approachGap.toFixed(3)} world units to the bucket's painted west face `
      + `x=${bucketLeft.toFixed(3)}, but the authored pour approach gap is `
      + `${String(MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.carrierApproachGap)}`,
    );
  }
  const slatWorldLength =
    MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[0] * MACHINE_WORKS_CONVEYOR_V1.slatGrain;
  const straightSlatGap = MACHINE_WORKS_CONVEYOR_SLAT_PITCH - slatWorldLength;
  const turnTangentSpan = 2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius * deterministicTanV1(
    MACHINE_WORKS_CONVEYOR_SLAT_PITCH
      / (2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius),
  );
  const turnSlatGap = turnTangentSpan - slatWorldLength;
  if (straightSlatGap < -maximum
    || straightSlatGap > MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumStraightSlatGap
    || turnSlatGap > MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumTurnSlatGap) {
    issues.push(
      `articulated belt clearances are outside bounds: straight gap=`
      + `${straightSlatGap.toFixed(6)} (allowed 0..`
      + `${String(MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumStraightSlatGap)}), `
      + `turn tangent gap=${turnSlatGap.toFixed(6)} (allowed at most `
      + `${String(MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.maximumTurnSlatGap)}), `
      + `pitch=${MACHINE_WORKS_CONVEYOR_SLAT_PITCH.toFixed(6)}, `
      + `painted length=${slatWorldLength.toFixed(6)}`,
    );
  }

  const foundationTop = MACHINE_WORKS_LAYOUT.foundationCenterY
    + MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.sizeVoxels[1]
      * MACHINE_WORKS_GRAINS.foundation / 2;
  const bridgeBase = MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.at[1];
  if (Math.abs(foundationTop - bridgeBase) > maximum) {
    issues.push(
      `static press-bridge base y=${String(bridgeBase)} does not meet foundation top `
      + `y=${String(foundationTop)}`,
    );
  }

  const pressBridge = MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge;
  const pressBridgeCenter: SupportPointV1 = [
    pressBridge.at[0],
    pressBridge.at[1] + pressBridge.sizeVoxels[1] * pressBridge.grain / 2,
    pressBridge.at[2],
  ];
  for (const footPort of MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.foundationFootPorts) {
    const foot = translated(
      scaledPortPosition(
        MACHINE_WORKS_ASSETS.pressBridge,
        footPort,
        MACHINE_WORKS_GRAINS.pressBridge,
      ),
      pressBridgeCenter,
    );
    if (!pointTouchesPositiveYSolidFace(
      MACHINE_WORKS_ASSETS.foundation,
      foundationCenter,
      MACHINE_WORKS_GRAINS.foundation,
      foot,
      maximum,
    )) {
      issues.push(
        `press-bridge foot '${footPort}' at (${foot.map((value) => value.toFixed(3)).join(', ')}) `
        + 'does not terminate on the top face of an occupied foundation mounting pad',
      );
    }
  }
  const headPickup = scaledPortPosition(
    MACHINE_WORKS_ASSETS.head,
    MACHINE_WORKS_PICKUP_RULE.headPort,
    MACHINE_WORKS_GRAINS.head,
  );
  const carriageLoad = scaledPortPosition(
    MACHINE_WORKS_ASSETS.carriage, 'load', MACHINE_WORKS_GRAINS.carriage,
  );
  const baseMount = scaledPortPosition(
    MACHINE_WORKS_ASSETS.base, 'carriage-mount', MACHINE_WORKS_GRAINS.base,
  );
  const baseCore = scaledPortPosition(
    MACHINE_WORKS_ASSETS.base, 'core-socket', MACHINE_WORKS_GRAINS.base,
  );
  const coreBase = scaledPortPosition(
    MACHINE_WORKS_ASSETS.core, 'base-key', MACHINE_WORKS_GRAINS.core,
  );
  const coreCap = scaledPortPosition(
    MACHINE_WORKS_ASSETS.core, 'cap-socket', MACHINE_WORKS_GRAINS.core,
  );
  const corePickup = scaledPortPosition(
    MACHINE_WORKS_ASSETS.core,
    MACHINE_WORKS_PICKUP_RULE.componentPorts.core,
    MACHINE_WORKS_GRAINS.core,
  );
  const capCore = scaledPortPosition(
    MACHINE_WORKS_ASSETS.cap, 'core-key', MACHINE_WORKS_GRAINS.cap,
  );
  const capPickup = scaledPortPosition(
    MACHINE_WORKS_ASSETS.cap,
    MACHINE_WORKS_PICKUP_RULE.componentPorts.cap,
    MACHINE_WORKS_GRAINS.cap,
  );
  const expectedRailX = {
    coreWest: pressBridge.guideTowers.west.atVoxels[0]
      + pressBridge.guideTowers.west.sizeVoxels[0] - 1,
    coreEast: 7,
    capWest: 17,
    capEast: pressBridge.guideTowers.east.atVoxels[0],
  } as const;
  for (const railKey of Object.keys(expectedRailX) as (keyof typeof expectedRailX)[]) {
    const rail = pressBridge.guideRails[railKey];
    if (rail.atVoxels[0] !== expectedRailX[railKey]
      || rail.atVoxels[1] !== 0
      || rail.atVoxels[2] !== 2
      || rail.sizeVoxels[0] !== 1
      || rail.sizeVoxels[1] !== 15
      || rail.sizeVoxels[2] !== 1) {
      issues.push(
        `press-bridge ${railKey} guide rail [${rail.atVoxels.join(', ')}] size `
        + `[${rail.sizeVoxels.join(', ')}] does not occupy the required straight rail on the `
        + `tower front face at x=${String(expectedRailX[railKey])} through the full 15-voxel stroke`,
      );
    }
  }
  const baseCenterY = MACHINE_WORKS_LAYOUT.carriageCenterY
    + carriageLoad[1] - baseMount[1];
  const coreAttachedCenterY = baseCenterY + baseCore[1] - coreBase[1];
  const capAttachedCenterY = coreAttachedCenterY + coreCap[1] - capCore[1];
  const alignedHeads = MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.headAlignmentPairs.map((rule) =>
    rule.station === 'core'
      ? {
          rule,
          stationX: MACHINE_WORKS_LAYOUT.coreStationX,
          scene: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead,
          restCenterY: MACHINE_WORKS_LAYOUT.coreLoosePartCenterY
            + corePickup[1] - headPickup[1],
          attachedCenterY: coreAttachedCenterY + corePickup[1] - headPickup[1],
        }
      : {
          rule,
          stationX: MACHINE_WORKS_LAYOUT.capStationX,
          scene: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead,
          restCenterY: MACHINE_WORKS_LAYOUT.capLoosePartCenterY
            + capPickup[1] - headPickup[1],
          attachedCenterY: capAttachedCenterY + capPickup[1] - headPickup[1],
        });
  for (const aligned of alignedHeads) {
    const rail = pressBridge.guideRails[aligned.rule.rail];
    const pad = MACHINE_WORKS_SCENE_LAYOUT_V1.headAlignmentPads[aligned.rule.pad];
    const railMinX = pressBridge.at[0]
      + (rail.atVoxels[0] - pressBridge.sizeVoxels[0] / 2) * pressBridge.grain;
    const railMaxX = railMinX + rail.sizeVoxels[0] * pressBridge.grain;
    const railMinY = pressBridge.at[1] + rail.atVoxels[1] * pressBridge.grain;
    const railMaxY = railMinY + rail.sizeVoxels[1] * pressBridge.grain;
    const railFrontZ = pressBridge.at[2]
      + (rail.atVoxels[2] - pressBridge.sizeVoxels[2] / 2) * pressBridge.grain;
    const headAlignment = scaledPortPosition(
      MACHINE_WORKS_ASSETS.head, aligned.rule.headPort, MACHINE_WORKS_GRAINS.head,
    );
    const headBody = MACHINE_WORKS_ASSETS.head.bodies[0]!;
    const padPort = [
      (pad.atVoxels[0] + pad.sizeVoxels[0] / 2 - headBody.pose.position[0])
        * MACHINE_WORKS_GRAINS.head,
      (pad.atVoxels[1] + pad.sizeVoxels[1] / 2 - headBody.pose.position[1])
        * MACHINE_WORKS_GRAINS.head,
      (pad.atVoxels[2] + pad.sizeVoxels[2] - headBody.pose.position[2])
        * MACHINE_WORKS_GRAINS.head,
    ] as const;
    const padPortError = Math.max(
      Math.abs(headAlignment[0] - padPort[0]),
      Math.abs(headAlignment[1] - padPort[1]),
      Math.abs(headAlignment[2] - padPort[2]),
    );
    const alignmentX = aligned.stationX + headAlignment[0];
    const alignmentZ = aligned.scene.at[2] + headAlignment[2];
    const padHalfHeight = pad.sizeVoxels[1] * MACHINE_WORKS_GRAINS.head / 2;
    const sceneRestCenterY = aligned.scene.at[1]
      + aligned.scene.sizeVoxels[1] * MACHINE_WORKS_GRAINS.head / 2;
    const sweptMinY = Math.min(aligned.restCenterY, aligned.attachedCenterY)
      + headAlignment[1] - padHalfHeight;
    const sweptMaxY = Math.max(aligned.restCenterY, aligned.attachedCenterY)
      + headAlignment[1] + padHalfHeight;
    const bridgeAlignment = translated(
      scaledPortPosition(
        MACHINE_WORKS_ASSETS.pressBridge,
        aligned.rule.bridgePort,
        MACHINE_WORKS_GRAINS.pressBridge,
      ),
      pressBridgeCenter,
    );
    const railCenterX = (railMinX + railMaxX) / 2;
    const railCenterY = (railMinY + railMaxY) / 2;
    if (Math.abs(sceneRestCenterY - aligned.restCenterY) > maximum
      || padPortError > maximum
      || !portTouchesPositiveZSolidFace(
        MACHINE_WORKS_ASSETS.head,
        aligned.rule.headPort,
        MACHINE_WORKS_GRAINS.head,
        maximum,
      )
      || alignmentX < railMinX - maximum || alignmentX > railMaxX + maximum
      || Math.abs(alignmentZ - railFrontZ) > maximum
      || Math.max(
        Math.abs(bridgeAlignment[0] - railCenterX),
        Math.abs(bridgeAlignment[1] - railCenterY),
        Math.abs(bridgeAlignment[2] - railFrontZ),
      ) > maximum
      || sweptMinY < railMinY - maximum || sweptMaxY > railMaxY + maximum) {
      issues.push(
        `${aligned.rule.label} head '${aligned.rule.headPort}' physical alignment pad `
        + `(${alignmentX.toFixed(3)}, ${alignmentZ.toFixed(3)}) does not remain on occupied press-bridge `
        + `${aligned.rule.rail} rail front `
        + `through swept y=[${sweptMinY.toFixed(3)}, ${sweptMaxY.toFixed(3)}] inside `
        + `rail x=[${railMinX.toFixed(3)}, ${railMaxX.toFixed(3)}], `
        + `y=[${railMinY.toFixed(3)}, ${railMaxY.toFixed(3)}], `
        + `frontZ=${railFrontZ.toFixed(3)}; padPortError=${padPortError.toFixed(6)}`,
      );
    }
  }
  for (const actuator of MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE.actuatorPairs) {
    const scene = actuator.station === 'core'
      ? MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead
      : MACHINE_WORKS_SCENE_LAYOUT_V1.capHead;
    const stationX = actuator.station === 'core'
      ? MACHINE_WORKS_LAYOUT.coreStationX
      : MACHINE_WORKS_LAYOUT.capStationX;
    const restCenterY = actuator.station === 'core'
      ? MACHINE_WORKS_LAYOUT.coreLoosePartCenterY + corePickup[1] - headPickup[1]
      : MACHINE_WORKS_LAYOUT.capLoosePartCenterY + capPickup[1] - headPickup[1];
    const attachedCenterY = actuator.station === 'core'
      ? coreAttachedCenterY + corePickup[1] - headPickup[1]
      : capAttachedCenterY + capPickup[1] - headPickup[1];
    const spine = pressBridge.actuatorSpines[actuator.spine];
    const spineMin: SupportPointV1 = [
      pressBridge.at[0]
        + (spine.atVoxels[0] - pressBridge.sizeVoxels[0] / 2) * pressBridge.grain,
      pressBridge.at[1] + spine.atVoxels[1] * pressBridge.grain,
      pressBridge.at[2]
        + (spine.atVoxels[2] - pressBridge.sizeVoxels[2] / 2) * pressBridge.grain,
    ];
    const spineMax: SupportPointV1 = [
      spineMin[0] + spine.sizeVoxels[0] * pressBridge.grain,
      spineMin[1] + spine.sizeVoxels[1] * pressBridge.grain,
      spineMin[2] + spine.sizeVoxels[2] * pressBridge.grain,
    ];
    const yoke = MACHINE_WORKS_SCENE_LAYOUT_V1.headActuatorYoke;
    const headBody = MACHINE_WORKS_ASSETS.head.bodies[0]!;
    const headOrigin = headBody.pose.position;
    const restCenter: SupportPointV1 = [stationX, restCenterY, scene.at[2]];
    const attachedCenter: SupportPointV1 = [stationX, attachedCenterY, scene.at[2]];
    const cavityAtRest = voxelBoxBounds(
      yoke.cavity,
      headOrigin,
      MACHINE_WORKS_GRAINS.head,
      restCenter,
    );
    const cavityAtAttached = voxelBoxBounds(
      yoke.cavity,
      headOrigin,
      MACHINE_WORKS_GRAINS.head,
      attachedCenter,
    );
    const sweptCavity = unionBounds(cavityAtRest, cavityAtAttached);
    const yokePort = scaledPortPosition(
      MACHINE_WORKS_ASSETS.head,
      actuator.headPort,
      MACHINE_WORKS_GRAINS.head,
    );
    const cavityCenterLocal: SupportPointV1 = [
      (yoke.cavity.atVoxels[0] + yoke.cavity.sizeVoxels[0] / 2 - headOrigin[0])
        * MACHINE_WORKS_GRAINS.head,
      (yoke.cavity.atVoxels[1] + yoke.cavity.sizeVoxels[1] / 2 - headOrigin[1])
        * MACHINE_WORKS_GRAINS.head,
      (yoke.cavity.atVoxels[2] + yoke.cavity.sizeVoxels[2] / 2 - headOrigin[2])
        * MACHINE_WORKS_GRAINS.head,
    ];
    const cavityPortError = Math.max(...yokePort.map((value, axis) =>
      Math.abs(value - cavityCenterLocal[axis]!)));
    const bridgeSpine = translated(
      scaledPortPosition(
        MACHINE_WORKS_ASSETS.pressBridge,
        actuator.bridgePort,
        MACHINE_WORKS_GRAINS.pressBridge,
      ),
      pressBridgeCenter,
    );
    const expectedSpineCenter: SupportPointV1 = [
      (spineMin[0] + spineMax[0]) / 2,
      (spineMin[1] + spineMax[1]) / 2,
      (spineMin[2] + spineMax[2]) / 2,
    ];
    const barBoundsAtRest = Object.values(yoke.bars).map((bar) =>
      voxelBoxBounds(bar, headOrigin, MACHINE_WORKS_GRAINS.head, restCenter));
    const barBoundsAtAttached = Object.values(yoke.bars).map((bar) =>
      voxelBoxBounds(bar, headOrigin, MACHINE_WORKS_GRAINS.head, attachedCenter));
    const sweptBarBounds = barBoundsAtRest.map((bounds, index) =>
      unionBounds(bounds, barBoundsAtAttached[index]!));
    const [westBar, eastBar, rearBar] = barBoundsAtRest;
    const cavityClosedOnThreeSides = westBar !== undefined
      && eastBar !== undefined
      && rearBar !== undefined
      && Math.abs(westBar.max[0] - cavityAtRest.min[0]) <= maximum
      && westBar.min[2] <= cavityAtRest.min[2] + maximum
      && westBar.max[2] >= cavityAtRest.max[2] - maximum
      && Math.abs(eastBar.min[0] - cavityAtRest.max[0]) <= maximum
      && eastBar.min[2] <= cavityAtRest.min[2] + maximum
      && eastBar.max[2] >= cavityAtRest.max[2] - maximum
      && Math.abs(rearBar.min[2] - cavityAtRest.max[2]) <= maximum
      && Math.abs(rearBar.min[0] - cavityAtRest.min[0]) <= maximum
      && Math.abs(rearBar.max[0] - cavityAtRest.max[0]) <= maximum;
    const exactBarsPresent = barBoundsAtRest.every((bounds) =>
      physicalAssetHasExactSolidBox(
        MACHINE_WORKS_ASSETS.head,
        MACHINE_WORKS_GRAINS.head,
        restCenter,
        bounds,
        maximum,
      ));
    const cavityContainsSpine = cavityAtRest.min[0] <= spineMin[0] + maximum
      && cavityAtRest.max[0] >= spineMax[0] - maximum
      && cavityAtRest.min[2] <= spineMin[2] + maximum
      && cavityAtRest.max[2] >= spineMax[2] - maximum
      && sweptCavity.min[1] >= spineMin[1] - maximum
      && sweptCavity.max[1] <= spineMax[1] + maximum;
    const runningClearance = Math.min(
      spineMin[0] - cavityAtRest.min[0], cavityAtRest.max[0] - spineMax[0],
      spineMin[2] - cavityAtRest.min[2], cavityAtRest.max[2] - spineMax[2],
    );
    const occupiedVolumesAreDisjoint = sweptBarBounds.every((bounds) =>
      !boundsHavePositiveOverlap(bounds, { min: spineMin, max: spineMax }, maximum));
    const cavityIsEmpty = !physicalAssetSolidOverlapsBounds(
      MACHINE_WORKS_ASSETS.head,
      MACHINE_WORKS_GRAINS.head,
      restCenter,
      cavityAtRest,
      maximum,
    );
    if (portLiesInsideSolidInterior(
      MACHINE_WORKS_ASSETS.head,
      actuator.headPort,
      MACHINE_WORKS_GRAINS.head,
      maximum,
    )
      || cavityPortError > maximum
      || !cavityIsEmpty
      || !cavityClosedOnThreeSides
      || !exactBarsPresent
      || !cavityContainsSpine
      || runningClearance < yoke.minimumRunningClearance - maximum
      || !occupiedVolumesAreDisjoint
      || Math.max(
        Math.abs(bridgeSpine[0] - expectedSpineCenter[0]),
        Math.abs(bridgeSpine[1] - expectedSpineCenter[1]),
        Math.abs(bridgeSpine[2] - expectedSpineCenter[2]),
      ) > maximum) {
      issues.push(
        `${actuator.label} head C-yoke does not keep its empty cavity around the fixed stator `
        + `through swept y=[${sweptCavity.min[1].toFixed(3)}, `
        + `${sweptCavity.max[1].toFixed(3)}] while all three occupied yoke bars remain disjoint. `
        + `cavity x=[${cavityAtRest.min[0].toFixed(3)}, `
        + `${cavityAtRest.max[0].toFixed(3)}], `
        + `z=[${cavityAtRest.min[2].toFixed(3)}, `
        + `${cavityAtRest.max[2].toFixed(3)}]; spine `
        + `x=[${spineMin[0].toFixed(3)}, ${spineMax[0].toFixed(3)}], `
        + `y=[${spineMin[1].toFixed(3)}, ${spineMax[1].toFixed(3)}], `
        + `z=[${spineMin[2].toFixed(3)}, ${spineMax[2].toFixed(3)}]; `
        + `cavityPortError=${cavityPortError.toFixed(6)}, `
        + `empty=${String(cavityIsEmpty)}, threeSided=${String(cavityClosedOnThreeSides)}, `
        + `exactBars=${String(exactBarsPresent)}, `
        + `clearance=${runningClearance.toFixed(3)} `
        + `(required ${yoke.minimumRunningClearance.toFixed(3)}), `
        + `disjoint=${String(occupiedVolumesAreDisjoint)}`,
      );
    }
  }
  return issues;
}

export function assertMachineWorksSupportAlignmentV1(): void {
  const issues = machineWorksSupportAlignmentIssuesV1();
  if (issues.length === 0) return;
  throw new Error(
    'Cannot simulate Machine Works because its visual and physical support datums diverged: '
    + `${issues.join('; ')}. Update the shared scene layout or named physical ports together.`,
  );
}

export const MACHINE_WORKS_COLLECTION_RULE = Object.freeze({
  maximumLinearSpeed: 0.2,
  maximumAngularSpeed: 0.2,
  stableTicks: 30,
  containmentMargin: 0.05,
  sensorPort: 'capture-mouth',
});

export const MACHINE_WORKS_LAW_LABELS = Object.freeze([
  'rigid-body.gravity',
  'rigid-body.contact',
  'rigid-body.friction',
  'rigid-body.restitution',
  'rigid-body.ccd',
] as const);

export const MACHINE_WORKS_CAPABILITY_LABELS = Object.freeze([
  'kinematic-actuation',
  'drive-phase-indicators',
  'belt-contact-transport',
  'axis-constrained-dynamic-carrier',
  'preloaded-magnetic-pickup',
  'validated-keyed-seat',
  'compound-product',
  'colliding-tip-release',
  'bucket-collection',
] as const);

/**
 * Canonical, JSON-safe solver input. If an actuator, sidecar, joint, contact
 * flag, assembly rule, or collection threshold changes, this value and its
 * hash change before any output samples are considered.
 */
export function machineWorksInputDescriptionV1(): Readonly<Record<string, unknown>> {
  return {
    schema: 'fixture.machine-works-input/9',
    adapterSchema: 'fixture.machine-works-rapier-adapter/1',
    solver: {
      name: '@dimforge/rapier3d-compat',
      version: MACHINE_WORKS_SOLVER_VERSION,
    },
    fixedStepMs: MACHINE_WORKS_FIXED_STEP_MS,
    durationMs: MACHINE_WORKS_DURATION_MS,
    frameCount: MACHINE_WORKS_FRAME_COUNT,
    gravity: MACHINE_WORKS_GRAVITY,
    trackOrder: MACHINE_WORKS_TRACK_IDS,
    bodyCreationOrder: [
      'foundation',
      ...MACHINE_WORKS_CONVEYOR_SLAT_IDS,
      ...MACHINE_WORKS_CONVEYOR_DRUM_IDS,
      'carriage', 'base', 'core-head', 'core', 'cap-head', 'cap', 'bucket',
    ],
    physicalAssets: MACHINE_WORKS_ASSETS,
    grains: MACHINE_WORKS_GRAINS,
    layout: MACHINE_WORKS_LAYOUT,
    presentationSupports: {
      sceneLayout: MACHINE_WORKS_SCENE_LAYOUT_V1,
      alignmentRule: MACHINE_WORKS_SUPPORT_ALIGNMENT_RULE,
      pressBridge: {
        placementId: MACHINE_WORKS_HEAD_ACTUATION_RULE.supportPlacementId,
        recipeId: 'studio:machine-works:press-bridge',
        asset: MACHINE_WORKS_ASSETS.pressBridge,
        grain: MACHINE_WORKS_GRAINS.pressBridge,
        interaction: 'fixed visual support, disjoint stator-in-C-yoke engagement, alignment datums, and routed external-service explanation; not ingested into Rapier',
      },
      outputDock: {
        placementId: 'assembly-output-dock',
        asset: MACHINE_WORKS_ASSETS.outputDock,
        grain: MACHINE_WORKS_GRAINS.outputDock,
        interaction: 'foundation-contacting outboard C-bearings, live trunnion swept-clearance proof, and face-coupled servo route; not ingested into Rapier',
      },
      exposedDrivePhaseFlags: {
        placements: MACHINE_WORKS_EXPOSED_COGS_V1,
        asset: 'studio:machine-works:drive-cog',
        grain: MACHINE_WORKS_GRAINS.exposedCog,
        interaction: 'minimal phase-derived non-interacting radial flags; not ingested into Rapier',
      },
      outputPivot: {
        carrierCenterX: MACHINE_WORKS_LAYOUT.tipStationX,
        localX: MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
        bucketBoundaryX: MACHINE_WORKS_LAYOUT.bucketCenterX
          - MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
            * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2,
        actuation: 'prescribed-position-servo-aligned-to-visible-trunnion-dock-with-no-revolute-constraint-or-torque-model',
      },
    },
    timeline: {
      ticks: MACHINE_WORKS_TICKS,
      beltDrive: MACHINE_WORKS_BELT_DRIVE,
      headActuation: MACHINE_WORKS_HEAD_ACTUATION_RULE,
      tip: {
        pivotLocalX: MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
        pivotLocalY: MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY,
        range: [MACHINE_WORKS_TICKS.released, MACHINE_WORKS_TICKS.tipComplete],
        easing: 'smoothstep',
        fromRadians: 0,
        toRadians: MACHINE_WORKS_LAYOUT.carriageTipRadians,
      },
      headReturnTicks: 60,
    },
    jointFrames: {
      carriageToBase: ['carriage.load', 'base.carriage-mount'],
      headToCore: ['head.pickup-face', 'core.pickup-face'],
      headToCap: ['head.pickup-face', 'cap.pickup-face'],
      contactsEnabledAcrossFixedJoints: false,
    },
    pickupRule: MACHINE_WORKS_PICKUP_RULE,
    assemblyRule: MACHINE_WORKS_ATTACHMENT_RULE,
    collectionRule: MACHINE_WORKS_COLLECTION_RULE,
    collisionEvents: {
      enabledFor: ['carriage', 'base', 'core', 'cap', 'bucket'],
      contactEvidence: 'strongest-active-manifold-impulse',
    },
    rigidBodyOptions: {
      canSleep: true,
      continuousFromSidecar: true,
      carrierGuide: MACHINE_WORKS_BELT_DRIVE.carrierGuide,
    },
    boundedClaims: {
      asserted: [
        'kinematic slat contact and friction transport the axis-constrained dynamic carrier',
        'visible drums, belt slats, and collision-excluded radial phase flags share one hashed drive phase',
        'preloaded magnetic pickup joints retain both components until validated keyed insertion',
        'the cap key enters two empty core layers before its crown reaches the core top seating plane',
        'software-weld handoffs record correction and remain within the declared merge-penetration budget',
        'four bridge feet meet occupied foundation pads and each fixed stator keeps at least 0.4 world units of swept C-yoke running clearance without occupied-volume overlap',
        'the live carrier trunnion clears two foundation-contacting outboard bearings through the full prescribed rotation and meets the visible servo coupler',
      ],
      excluded: [
        'cog torque transmission',
        'belt tension or compliance',
        'tooth engagement',
        'arbitrary-load no-slip behavior',
        'in-trace component pickup',
        'captive guide-rail constraint',
        'press-bridge solver contact, load transfer, or stress',
        'electrical state, electromagnetic force, motor torque, servo feedback dynamics, or energy consumption',
        'output-bearing contact response or a revolute constraint',
      ],
    },
    lawLabels: MACHINE_WORKS_LAW_LABELS,
    capabilityLabels: MACHINE_WORKS_CAPABILITY_LABELS,
  };
}
