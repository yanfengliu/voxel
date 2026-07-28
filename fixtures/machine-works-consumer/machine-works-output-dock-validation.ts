import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksOutputDockPhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import { MACHINE_WORKS_CONVEYOR_V1 } from '../../tools/studio/machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';
import { machineWorksOutputDockSweepMeasurementV1 } from './machine-works-output-dock-sweep.js';
import {
  boundsHavePositiveOverlap,
  physicalAssetAxisAlignedSolidBounds,
  physicalAssetHasExactSolidBox,
  physicalAssetSolidOverlapsBounds,
  portLiesInsideSolidInterior,
  scaledPortPosition,
  translated,
  voxelBoxBounds,
  type AuthoredVoxelBoxV1,
  type AxisAlignedBoundsV1,
  type SupportPointV1,
} from './machine-works-support-geometry.js';

const CARRIAGE_ORIGIN = [7.5, 3, 11.5] as const;
const DOCK_ORIGIN = [4.5, 4.5, 15.5] as const;
const TRUNNION_BOX = {
  atVoxels: [14, 2, 0],
  sizeVoxels: [1, 2, 23],
} as const satisfies AuthoredVoxelBoxV1;
const BEARINGS = [
  {
    label: 'near',
    lower: { atVoxels: [1, 0, 3], sizeVoxels: [6, 1, 3] },
    back: { atVoxels: [6, 1, 4], sizeVoxels: [1, 5, 2] },
    upper: { atVoxels: [2, 5, 4], sizeVoxels: [4, 1, 2] },
  },
  {
    label: 'far',
    lower: { atVoxels: [1, 0, 25], sizeVoxels: [6, 1, 3] },
    back: { atVoxels: [6, 1, 25], sizeVoxels: [1, 5, 2] },
    upper: { atVoxels: [2, 5, 25], sizeVoxels: [4, 1, 2] },
  },
] as const;
const SERVO_COUPLER = {
  atVoxels: [4, 2, 27],
  sizeVoxels: [1, 2, 1],
} as const satisfies AuthoredVoxelBoxV1;
const SERVO_FOOT = {
  atVoxels: [2, 0, 28],
  sizeVoxels: [5, 1, 2],
} as const satisfies AuthoredVoxelBoxV1;
const SERVO_HOUSING = {
  atVoxels: [2, 1, 28],
  sizeVoxels: [5, 5, 2],
} as const satisfies AuthoredVoxelBoxV1;
const SERVO_SERVICE_ROUTE = [
  {
    label: 'servo-service foundation entry',
    box: { atVoxels: [0, 0, 28], sizeVoxels: [2, 1, 2] },
  },
  {
    label: 'servo-service riser',
    box: { atVoxels: [0, 1, 28], sizeVoxels: [1, 3, 2] },
  },
  {
    label: 'servo-service housing inlet',
    box: { atVoxels: [0, 4, 28], sizeVoxels: [2, 1, 2] },
  },
  {
    label: 'rotary-servo housing',
    box: SERVO_HOUSING,
  },
] as const;

function sceneCenter(
  entry: {
    readonly at: SupportPointV1;
    readonly grain: number;
    readonly sizeVoxels: SupportPointV1;
  },
): SupportPointV1 {
  return [
    entry.at[0],
    entry.at[1] + entry.sizeVoxels[1] * entry.grain / 2,
    entry.at[2],
  ];
}

function worldPort(
  asset: PhysicalAssetV1,
  key: string,
  grain: number,
  center: SupportPointV1,
): SupportPointV1 {
  return translated(scaledPortPosition(asset, key, grain), center);
}

function pointsCoincide(
  left: SupportPointV1,
  right: SupportPointV1,
  maximumError: number,
): boolean {
  return left.every((value, axis) => Math.abs(value - right[axis]!) <= maximumError);
}

function rangesHavePositiveOverlap(
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number,
  maximumError: number,
): boolean {
  return leftMin < rightMax - maximumError
    && leftMax > rightMin + maximumError;
}

function touchesPositiveYFace(
  lower: AxisAlignedBoundsV1,
  upper: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return Math.abs(lower.max[1] - upper.min[1]) <= maximumError
    && rangesHavePositiveOverlap(
      lower.min[0], lower.max[0], upper.min[0], upper.max[0], maximumError,
    )
    && rangesHavePositiveOverlap(
      lower.min[2], lower.max[2], upper.min[2], upper.max[2], maximumError,
    );
}

function touchesPositiveXFace(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return Math.abs(left.max[0] - right.min[0]) <= maximumError
    && rangesHavePositiveOverlap(
      left.min[1], left.max[1], right.min[1], right.max[1], maximumError,
    )
    && rangesHavePositiveOverlap(
      left.min[2], left.max[2], right.min[2], right.max[2], maximumError,
    );
}

function touchesPositiveZFace(
  inner: AxisAlignedBoundsV1,
  outer: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return Math.abs(inner.max[2] - outer.min[2]) <= maximumError
    && rangesHavePositiveOverlap(
      inner.min[0], inner.max[0], outer.min[0], outer.max[0], maximumError,
    )
    && rangesHavePositiveOverlap(
      inner.min[1], inner.max[1], outer.min[1], outer.max[1], maximumError,
    );
}

function sameBounds(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return left.min.every((value, axis) =>
    Math.abs(value - right.min[axis]!) <= maximumError
      && Math.abs(left.max[axis]! - right.max[axis]!) <= maximumError);
}

function sameSize(
  left: AxisAlignedBoundsV1,
  right: AxisAlignedBoundsV1,
  maximumError: number,
): boolean {
  return left.min.every((value, axis) =>
    Math.abs(
      (left.max[axis]! - value) - (right.max[axis]! - right.min[axis]!),
    ) <= maximumError);
}

function centerDistance(left: AxisAlignedBoundsV1, right: AxisAlignedBoundsV1): number {
  return Math.hypot(...left.min.map((value, axis) =>
    (value + left.max[axis]!) / 2
      - (right.min[axis]! + right.max[axis]!) / 2));
}

function outputServoServiceRouteIssues(
  dockSolids: readonly AxisAlignedBoundsV1[],
  dockGrain: number,
  dockCenter: SupportPointV1,
  maximumError: number,
): readonly string[] {
  const issues: string[] = [];
  const located = SERVO_SERVICE_ROUTE.map(({ label, box }) => {
    const expected = voxelBoxBounds(box, DOCK_ORIGIN, dockGrain, dockCenter);
    const exact = dockSolids.filter((solid) => sameBounds(solid, expected, maximumError));
    if (exact.length !== 1) {
      issues.push(
        `output dock requires exactly one canonical ${label} box at voxel `
        + `[${box.atVoxels.join(', ')}] with size [${box.sizeVoxels.join(', ')}]; `
        + `found ${String(exact.length)}`,
      );
    }
    const nearest = dockSolids
      .filter((solid) => sameSize(solid, expected, maximumError))
      .sort((left, right) => centerDistance(left, expected) - centerDistance(right, expected))[0];
    return exact[0] ?? nearest ?? null;
  });
  const entry = located[0] ?? null;
  const riser = located[1] ?? null;
  const inlet = located[2] ?? null;
  const housing = located[3] ?? null;
  if (entry === null || riser === null || inlet === null || housing === null) {
    issues.push(
      'output servo-service conduit cannot prove a continuous route because at least one '
      + 'required foundation-entry, riser, housing-inlet, or servo-housing box is absent',
    );
    return issues;
  }
  const disconnected: string[] = [];
  if (!touchesPositiveYFace(entry, riser, maximumError)) {
    disconnected.push('foundation entry -> riser');
  }
  if (!touchesPositiveYFace(riser, inlet, maximumError)) {
    disconnected.push('riser -> housing inlet');
  }
  if (!touchesPositiveXFace(inlet, housing, maximumError)) {
    disconnected.push('housing inlet -> servo housing');
  }
  if (disconnected.length > 0) {
    issues.push(
      `output servo-service conduit breaks its positive-area face route at `
      + `${disconnected.join(', ')}; an edge, corner, gap, or overlap does not transmit `
      + 'the declared external service path',
    );
  }
  return issues;
}

function canonicalAlignmentIssues(
  carriage: PhysicalAssetV1,
  dock: PhysicalAssetV1,
  carriageCenter: SupportPointV1,
  dockCenter: SupportPointV1,
  maximumError: number,
): readonly string[] {
  const issues: string[] = [];
  const carriageGrain = MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain;
  const dockGrain = MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain;
  for (const [carriagePort, dockPort] of [
    ['tip-pivot-axis', 'pivot-axis'],
    ['near-trunnion', 'near-bearing-bore'],
    ['far-trunnion', 'far-bearing-bore'],
    ['servo-drive-face', 'servo-output'],
  ] as const) {
    if (!pointsCoincide(
      worldPort(carriage, carriagePort, carriageGrain, carriageCenter),
      worldPort(dock, dockPort, dockGrain, dockCenter),
      maximumError,
    )) {
      issues.push(`output ${carriagePort} does not coincide with dock ${dockPort}`);
    }
  }
  for (const port of ['near-bearing-bore', 'far-bearing-bore'] as const) {
    if (portLiesInsideSolidInterior(dock, port, dockGrain, maximumError)) {
      issues.push(`output dock ${port} lies inside solid material instead of its open C-bore`);
    }
  }
  for (const port of ['near-trunnion', 'far-trunnion'] as const) {
    if (!portLiesInsideSolidInterior(carriage, port, carriageGrain, maximumError)) {
      issues.push(`carrier ${port} is not inside the painted trunnion axle`);
    }
  }
  const trunnion = voxelBoxBounds(
    TRUNNION_BOX, CARRIAGE_ORIGIN, carriageGrain, carriageCenter,
  );
  if (!physicalAssetHasExactSolidBox(
    carriage, carriageGrain, carriageCenter, trunnion, maximumError,
  )) {
    issues.push('carrier sidecar has no exact full-depth trunnion axle box');
  }
  if (physicalAssetSolidOverlapsBounds(
    dock, dockGrain, dockCenter, trunnion, maximumError,
  )) {
    issues.push('carrier trunnion positively overlaps output-dock solids at handoff');
  }
  for (const bearing of BEARINGS) {
    const bars = [bearing.lower, bearing.back, bearing.upper].map((box) =>
      voxelBoxBounds(box, DOCK_ORIGIN, dockGrain, dockCenter));
    if (bars.some((bar) =>
      !physicalAssetHasExactSolidBox(dock, dockGrain, dockCenter, bar, maximumError))) {
      issues.push(`${bearing.label} output bearing does not contain its exact three C-housing bars`);
    }
  }
  const coupler = voxelBoxBounds(SERVO_COUPLER, DOCK_ORIGIN, dockGrain, dockCenter);
  const servo = voxelBoxBounds(SERVO_HOUSING, DOCK_ORIGIN, dockGrain, dockCenter);
  if (!physicalAssetHasExactSolidBox(
    dock, dockGrain, dockCenter, coupler, maximumError,
  ) || !physicalAssetHasExactSolidBox(
    dock, dockGrain, dockCenter, servo, maximumError,
  )) {
    issues.push('output dock lacks its exact trunnion coupler or servo housing');
  } else if (!touchesPositiveZFace(trunnion, coupler, maximumError)
    || !touchesPositiveZFace(coupler, servo, maximumError)) {
    issues.push(
      'output trunnion, coupler, and servo housing do not form one face-contacting axial chain',
    );
  }
  return issues;
}

export function machineWorksOutputDockEnvironmentIssuesV1(
  dock: PhysicalAssetV1,
  foundation: PhysicalAssetV1,
  bucket: PhysicalAssetV1,
  dockCenter: SupportPointV1,
  foundationCenter: SupportPointV1,
  bucketCenter: SupportPointV1,
  maximumError: number,
): readonly string[] {
  const issues: string[] = [];
  const dockGrain = MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain;
  const foundationGrain = MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain;
  const bucketGrain = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain;
  const dockSolids = physicalAssetAxisAlignedSolidBounds(dock, dockGrain, dockCenter);
  const foundationSolids = physicalAssetAxisAlignedSolidBounds(
    foundation, foundationGrain, foundationCenter,
  );
  const bucketSolids = physicalAssetAxisAlignedSolidBounds(
    bucket, bucketGrain, bucketCenter,
  );
  if (dockSolids === null || foundationSolids === null || bucketSolids === null) {
    return ['output dock environment proof requires axis-aligned box solids'];
  }
  issues.push(...outputServoServiceRouteIssues(
    dockSolids, dockGrain, dockCenter, maximumError,
  ));
  const contactBoxes = [
    BEARINGS[0].lower,
    BEARINGS[1].lower,
    SERVO_FOOT,
  ] as const;
  for (const [index, box] of contactBoxes.entries()) {
    const contact = voxelBoxBounds(box, DOCK_ORIGIN, dockGrain, dockCenter);
    if (!physicalAssetHasExactSolidBox(
      dock, dockGrain, dockCenter, contact, maximumError,
    ) || !foundationSolids.some((solid) =>
      touchesPositiveYFace(solid, contact, maximumError))) {
      issues.push(
        `output dock foundation contact ${String(index)} does not terminate on an `
        + 'occupied foundation top face',
      );
    }
  }
  for (let left = 0; left < dockSolids.length; left += 1) {
    for (let right = left + 1; right < dockSolids.length; right += 1) {
      if (boundsHavePositiveOverlap(
        dockSolids[left]!, dockSolids[right]!, maximumError,
      )) {
        issues.push(
          `output dock solids ${String(left)} and ${String(right)} positively overlap`,
        );
      }
    }
  }
  if (dockSolids.some((dockSolid) => foundationSolids.some((foundationSolid) =>
    boundsHavePositiveOverlap(dockSolid, foundationSolid, maximumError)))) {
    issues.push('output dock positively overlaps the conveyor foundation instead of face-contacting it');
  }
  if (dockSolids.some((dockSolid) => bucketSolids.some((bucketSolid) =>
    boundsHavePositiveOverlap(dockSolid, bucketSolid, maximumError)))) {
    issues.push('output dock positively overlaps the collection bucket');
  }
  const beltHalfDepth =
    MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels[2]
      * MACHINE_WORKS_CONVEYOR_V1.slatGrain / 2;
  let minimumBeltClearance = Number.POSITIVE_INFINITY;
  for (const dockSolid of dockSolids) {
    const clearance = dockSolid.max[2] <= -beltHalfDepth
      ? -beltHalfDepth - dockSolid.max[2]
      : dockSolid.min[2] >= beltHalfDepth
        ? dockSolid.min[2] - beltHalfDepth
        : -Math.min(dockSolid.max[2] + beltHalfDepth, beltHalfDepth - dockSolid.min[2]);
    minimumBeltClearance = Math.min(minimumBeltClearance, clearance);
  }
  const requiredBeltClearance =
    MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.minimumBeltAxialClearance;
  if (minimumBeltClearance < requiredBeltClearance - maximumError) {
    issues.push(
      `output dock leaves ${minimumBeltClearance.toFixed(3)} world units outside the `
      + `moving belt's |z|<=${beltHalfDepth.toFixed(3)} sweep; `
      + `at least ${requiredBeltClearance.toFixed(3)} is required`,
    );
  }
  return issues;
}

export function machineWorksOutputDockCanonicalIssuesV1(
  maximumError: number,
  tipRadians: number,
): readonly string[] {
  const carriage = createMachineWorksTransferCarriagePhysicalAsset();
  const dock = createMachineWorksOutputDockPhysicalAsset();
  const foundation = createMachineWorksRailFoundationPhysicalAsset();
  const bucket = createMachineWorksCollectionBucketPhysicalAsset();
  const carriageCenter: SupportPointV1 = [
    MACHINE_WORKS_CONVEYOR_V1.rightAxleX,
    sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.carriage)[1],
    0,
  ];
  const dockCenter = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock);
  const foundationCenter = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.foundation);
  const bucketCenter = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.bucket);
  return [
    ...canonicalAlignmentIssues(
      carriage, dock, carriageCenter, dockCenter, maximumError,
    ),
    ...machineWorksOutputDockSweepMeasurementV1({
      carriage,
      dock,
      foundation,
      bucket,
      carriageGrain: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain,
      dockGrain: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
      foundationGrain: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
      bucketGrain: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
      carriageCenter,
      dockCenter,
      foundationCenter,
      bucketCenter,
      carriageRotation: [0, 0, 0, 1],
      tipRadians,
      maximumError,
    }).issues,
    ...machineWorksOutputDockEnvironmentIssuesV1(
      dock,
      foundation,
      bucket,
      dockCenter,
      foundationCenter,
      bucketCenter,
      maximumError,
    ),
  ];
}
