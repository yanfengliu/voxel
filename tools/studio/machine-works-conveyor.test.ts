import { describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_CONVEYOR_PATH_LENGTH,
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_SLAT_PITCH,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
  machineWorksConveyorPathMotionV1,
  machineWorksDrumMotionV1,
  machineWorksExposedCogMotionV1,
  machineWorksSlatMotionV1,
  machineWorksSlatPlacementIdV1,
} from './machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import {
  createMachineWorksConveyorSlatPhysicalAsset,
  createMachineWorksDriveDrumPhysicalAsset,
} from './machine-works-physical-assets.js';
import type { PhysicalColliderV1 } from './physical-asset.js';

interface ProjectedBoxV1 {
  readonly center: readonly [number, number];
  readonly axes: readonly [
    readonly [number, number],
    readonly [number, number],
  ];
  readonly half: readonly [number, number];
  readonly z: readonly [number, number];
}

const OVERLAP_TOLERANCE = 1e-10;

function projectBox(
  collider: PhysicalColliderV1,
  grain: number,
  motion: ReturnType<typeof machineWorksSlatMotionV1>,
): ProjectedBoxV1 {
  if (collider.shape.kind !== 'box') {
    throw new Error(
      `Cannot prove conveyor clearance for '${collider.shape.kind}': `
      + 'the exact Machine Works sidecars must remain box compounds.',
    );
  }
  const localRotation = collider.pose.rotation;
  if (localRotation !== undefined
    && (localRotation[0] !== 0 || localRotation[1] !== 0
      || localRotation[2] !== 0 || localRotation[3] !== 1)) {
    throw new Error(
      'Cannot prove conveyor clearance for a locally rotated collider: '
      + 'extend the exact oriented-box composition before changing the sidecar.',
    );
  }
  const cosine = 1 - 2 * motion.rotation.z ** 2;
  const sine = 2 * motion.rotation.z * motion.rotation.w;
  const localX = collider.pose.position[0] * grain;
  const localY = collider.pose.position[1] * grain;
  const centerZ = motion.position.z + collider.pose.position[2] * grain;
  const halfZ = collider.shape.halfExtents[2] * grain;
  return {
    center: [
      motion.position.x + cosine * localX - sine * localY,
      motion.position.y + sine * localX + cosine * localY,
    ],
    axes: [
      [cosine, sine],
      [-sine, cosine],
    ],
    half: [
      collider.shape.halfExtents[0] * grain,
      collider.shape.halfExtents[1] * grain,
    ],
    z: [centerZ - halfZ, centerZ + halfZ],
  };
}

function boxesOverlapInPlaneWithPositiveArea(
  left: ProjectedBoxV1,
  right: ProjectedBoxV1,
): boolean {
  return boxPlanarSeparatingGap(left, right) < -OVERLAP_TOLERANCE;
}

function boxPlanarSeparatingGap(
  left: ProjectedBoxV1,
  right: ProjectedBoxV1,
): number {
  const difference: readonly [number, number] = [
    right.center[0] - left.center[0],
    right.center[1] - left.center[1],
  ];
  let separatingGap = Number.NEGATIVE_INFINITY;
  for (const axis of [...left.axes, ...right.axes]) {
    const centerDistance = Math.abs(
      difference[0] * axis[0] + difference[1] * axis[1],
    );
    const leftRadius =
      left.half[0] * Math.abs(left.axes[0][0] * axis[0] + left.axes[0][1] * axis[1])
      + left.half[1]
        * Math.abs(left.axes[1][0] * axis[0] + left.axes[1][1] * axis[1]);
    const rightRadius =
      right.half[0]
        * Math.abs(right.axes[0][0] * axis[0] + right.axes[0][1] * axis[1])
      + right.half[1]
        * Math.abs(right.axes[1][0] * axis[0] + right.axes[1][1] * axis[1]);
    separatingGap = Math.max(
      separatingGap,
      centerDistance - leftRadius - rightRadius,
    );
  }
  return separatingGap;
}

function boxZOverlap(left: ProjectedBoxV1, right: ProjectedBoxV1): number {
  return Math.min(left.z[1], right.z[1]) - Math.max(left.z[0], right.z[0]);
}

function boxesOverlapWithPositiveVolume(
  left: ProjectedBoxV1,
  right: ProjectedBoxV1,
): boolean {
  return boxZOverlap(left, right) > OVERLAP_TOLERANCE
    && boxesOverlapInPlaneWithPositiveArea(left, right);
}

describe('Machine Works conveyor path', () => {
  it('forms one closely pitched articulated loop from repeated instanced slats', () => {
    expect(MACHINE_WORKS_CONVEYOR_SLAT_IDS).toHaveLength(
      MACHINE_WORKS_CONVEYOR_V1.slatCount,
    );
    expect(new Set(MACHINE_WORKS_CONVEYOR_SLAT_IDS).size).toBe(
      MACHINE_WORKS_CONVEYOR_V1.slatCount,
    );
    expect(MACHINE_WORKS_CONVEYOR_SLAT_PITCH).toBeCloseTo(
      MACHINE_WORKS_CONVEYOR_PATH_LENGTH / MACHINE_WORKS_CONVEYOR_V1.slatCount,
      12,
    );
    const paintedLength =
      MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[0] * MACHINE_WORKS_CONVEYOR_V1.slatGrain;
    const straightGap = MACHINE_WORKS_CONVEYOR_SLAT_PITCH - paintedLength;
    const turnTangentGap = 2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius * Math.tan(
      MACHINE_WORKS_CONVEYOR_SLAT_PITCH
        / (2 * MACHINE_WORKS_CONVEYOR_V1.pitchRadius),
    ) - paintedLength;
    expect(straightGap).toBeGreaterThanOrEqual(0);
    expect(straightGap).toBeLessThanOrEqual(0.05);
    expect(turnTangentGap).toBeGreaterThanOrEqual(straightGap);
    expect(turnTangentGap).toBeLessThanOrEqual(0.12);
  });

  it('keeps each slat underside on the nominal drum pitch datum', () => {
    const slatHalfThickness =
      MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[1]
        * MACHINE_WORKS_CONVEYOR_V1.slatGrain / 2;
    const nominalCrownRadius =
      MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels[1]
        * MACHINE_WORKS_CONVEYOR_V1.drumGrain / 2;
    expect(
      MACHINE_WORKS_CONVEYOR_V1.pitchRadius - slatHalfThickness,
    ).toBeCloseTo(nominalCrownRadius, 12);
  });

  it('keeps the complete slat and stepped-drum compounds free of positive-volume overlap', () => {
    const drum = createMachineWorksDriveDrumPhysicalAsset();
    const slat = createMachineWorksConveyorSlatPhysicalAsset();
    const barrelCollider = drum.colliders.find((collider) =>
      collider.shape.kind === 'box' && collider.shape.halfExtents[2] === 6.5);
    if (barrelCollider?.shape.kind !== 'box') {
      throw new Error(
        'The conveyor clearance proof could not identify the one 13-voxel-deep '
        + 'central drum barrel in the exact physical sidecar.',
      );
    }
    const barrelIndex = drum.colliders.indexOf(barrelCollider);
    const slatHalfThickness =
      MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[1]
        * MACHINE_WORKS_CONVEYOR_V1.slatGrain / 2;
    const barrelCircumradius = Math.hypot(
      barrelCollider.shape.halfExtents[0] * MACHINE_WORKS_CONVEYOR_V1.drumGrain,
      barrelCollider.shape.halfExtents[1] * MACHINE_WORKS_CONVEYOR_V1.drumGrain,
    );
    const analyticalBarrelClearance =
      MACHINE_WORKS_CONVEYOR_V1.pitchRadius
      - slatHalfThickness
      - barrelCircumradius;
    const intersections: Readonly<{
      phase: number;
      side: 'west' | 'east';
      slatId: string;
      slatCollider: number;
      drumCollider: number;
      zPenetration: number;
    }>[] = [];
    let boundaryWitness:
      | Readonly<{ slat: ProjectedBoxV1; drum: ProjectedBoxV1 }>
      | undefined;
    let minimumMeasuredBarrelGap = Number.POSITIVE_INFINITY;
    const straightLength =
      MACHINE_WORKS_CONVEYOR_V1.rightAxleX - MACHINE_WORKS_CONVEYOR_V1.leftAxleX;
    const halfTurnLength = Math.PI * MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
    for (const side of ['west', 'east'] as const) {
      const turnStart = side === 'east'
        ? straightLength
        : straightLength * 2 + halfTurnLength;
      for (let index = 0; index < MACHINE_WORKS_CONVEYOR_V1.slatCount; index += 1) {
        for (let phase = 0; phase < 32; phase += 1) {
          const targetPathDistance =
            turnStart + halfTurnLength * (phase + 0.5) / 32;
          const travel =
            targetPathDistance - index * MACHINE_WORKS_CONVEYOR_SLAT_PITCH;
          const drumMotion = machineWorksDrumMotionV1(side, travel, 0);
          const drumBoxes = drum.colliders.map((collider) =>
            projectBox(collider, MACHINE_WORKS_CONVEYOR_V1.drumGrain, drumMotion));
          const slatMotion = machineWorksSlatMotionV1(index, travel, 0);
          const slatBoxes = slat.colliders.map((collider) =>
            projectBox(collider, MACHINE_WORKS_CONVEYOR_V1.slatGrain, slatMotion));
          const projectedBarrel = drumBoxes[barrelIndex]!;
          for (const [slatCollider, slatBox] of slatBoxes.entries()) {
            minimumMeasuredBarrelGap = Math.min(
              minimumMeasuredBarrelGap,
              boxPlanarSeparatingGap(slatBox, projectedBarrel),
            );
            for (const [drumCollider, drumBox] of drumBoxes.entries()) {
              if (!boxesOverlapInPlaneWithPositiveArea(slatBox, drumBox)) continue;
              const zPenetration = boxZOverlap(slatBox, drumBox);
              if (zPenetration > OVERLAP_TOLERANCE) {
                intersections.push({
                  phase,
                  side,
                  slatId: MACHINE_WORKS_CONVEYOR_SLAT_IDS[index]!,
                  slatCollider,
                  drumCollider,
                  zPenetration,
                });
              } else if (Math.abs(zPenetration) <= OVERLAP_TOLERANCE) {
                boundaryWitness ??= { slat: slatBox, drum: drumBox };
              }
            }
          }
        }
      }
    }
    expect(intersections).toEqual([]);
    expect(analyticalBarrelClearance).toBeCloseTo(
      2.75 - 1.75 * Math.SQRT2,
      12,
    );
    expect(minimumMeasuredBarrelGap).toBeGreaterThanOrEqual(
      analyticalBarrelClearance - OVERLAP_TOLERANCE,
    );
    expect(boundaryWitness).toBeDefined();
    if (boundaryWitness === undefined) {
      throw new Error(
        'The conveyor clearance proof found no exact slat/cheek boundary witness; '
        + 'update the negative control for the revised compound geometry.',
      );
    }
    const slatCenterZ = (boundaryWitness.slat.z[0] + boundaryWitness.slat.z[1]) / 2;
    const drumCenterZ = (boundaryWitness.drum.z[0] + boundaryWitness.drum.z[1]) / 2;
    const shiftTowardCheek = drumCenterZ < slatCenterZ ? -0.25 : 0.25;
    const shiftedSlat: ProjectedBoxV1 = {
      ...boundaryWitness.slat,
      z: [
        boundaryWitness.slat.z[0] + shiftTowardCheek,
        boundaryWitness.slat.z[1] + shiftTowardCheek,
      ],
    };
    expect(
      boxesOverlapWithPositiveVolume(shiftedSlat, boundaryWitness.drum),
    ).toBe(true);
  });

  it('keeps position and tangent continuous through both turns and the loop seam', () => {
    const epsilon = 1e-6;
    const speed = 3.25;
    const straight =
      MACHINE_WORKS_CONVEYOR_V1.rightAxleX - MACHINE_WORKS_CONVEYOR_V1.leftAxleX;
    const halfTurn = Math.PI * MACHINE_WORKS_CONVEYOR_V1.pitchRadius;
    for (const boundary of [
      straight,
      straight + halfTurn,
      straight * 2 + halfTurn,
      MACHINE_WORKS_CONVEYOR_PATH_LENGTH,
    ]) {
      const before = machineWorksConveyorPathMotionV1(boundary - epsilon, speed);
      const after = machineWorksConveyorPathMotionV1(boundary + epsilon, speed);
      expect(Math.hypot(
        before.position.x - after.position.x,
        before.position.y - after.position.y,
        before.position.z - after.position.z,
      )).toBeLessThan(epsilon * 3);
      expect(Math.hypot(
        before.linearVelocity.x - after.linearVelocity.x,
        before.linearVelocity.y - after.linearVelocity.y,
        before.linearVelocity.z - after.linearVelocity.z,
      )).toBeLessThan(epsilon * speed * 3);
    }
  });

  it('couples drum angular speed to belt linear speed at the authored pitch radius', () => {
    for (const speed of [-4, 0, 7.5]) {
      const drum = machineWorksDrumMotionV1('west', 19.75, speed);
      expect(
        drum.angularVelocity.z * MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
      ).toBeCloseTo(-speed, 12);
      const slat = machineWorksSlatMotionV1(9, 19.75, speed);
      expect(Math.hypot(
        slat.linearVelocity.x,
        slat.linearVelocity.y,
        slat.linearVelocity.z,
      )).toBeCloseTo(Math.abs(speed), 12);
      for (const [index, descriptor] of MACHINE_WORKS_EXPOSED_COGS_V1.entries()) {
        const cog = machineWorksExposedCogMotionV1(index, 19.75, speed);
        expect(cog.position.z).toBe(descriptor.z);
        expect(cog.angularVelocity.z * MACHINE_WORKS_CONVEYOR_V1.pitchRadius)
          .toBeCloseTo(-speed, 12);
        expect(cog.rotation).toEqual(drum.rotation);
      }
    }
  });

  it('places all four phase-witness cogs wholly outside the underframe faces', () => {
    expect(new Set(MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id)).size)
      .toBe(MACHINE_WORKS_EXPOSED_COGS_V1.length);
    const underframeHalfDepth =
      MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.sizeVoxels[2]
        * MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain / 2;
    const cogHalfDepth = 3 * MACHINE_WORKS_CONVEYOR_V1.drumGrain / 2;
    for (const { z } of MACHINE_WORKS_EXPOSED_COGS_V1) {
      expect(Math.abs(z) - cogHalfDepth).toBeGreaterThan(underframeHalfDepth);
      expect(Math.abs(z) - cogHalfDepth - underframeHalfDepth).toBeCloseTo(0.35, 12);
    }
  });

  it('rejects out-of-range slat identities with actionable bounds', () => {
    expect(() => machineWorksSlatPlacementIdV1(-1)).toThrow(
      `expected an integer from 0 through ${String(MACHINE_WORKS_CONVEYOR_V1.slatCount - 1)}`,
    );
    expect(() => machineWorksSlatMotionV1(MACHINE_WORKS_CONVEYOR_V1.slatCount, 0, 0))
      .toThrow(
        `expected an integer from 0 through ${String(MACHINE_WORKS_CONVEYOR_V1.slatCount - 1)}`,
      );
    expect(() => machineWorksExposedCogMotionV1(-1, 0, 0)).toThrow(
      `expected an integer from 0 through ${String(MACHINE_WORKS_EXPOSED_COGS_V1.length - 1)}`,
    );
  });
});
