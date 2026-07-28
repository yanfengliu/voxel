import { describe, expect, it } from 'vitest';

import {
  createMachineWorksCollectionBucketPhysicalAsset,
  createMachineWorksOutputDockPhysicalAsset,
  createMachineWorksRailFoundationPhysicalAsset,
  createMachineWorksTransferCarriagePhysicalAsset,
} from '../../tools/studio/machine-works-physical-assets.js';
import { MACHINE_WORKS_CONVEYOR_V1 } from '../../tools/studio/machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type {
  PhysicalAssetV1,
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
import {
  machineWorksOutputDockCanonicalIssuesV1,
  machineWorksOutputDockEnvironmentIssuesV1,
} from './machine-works-output-dock-validation.js';
import { machineWorksOutputDockSweepMeasurementV1 } from './machine-works-output-dock-sweep.js';
import type { SupportPointV1 } from './machine-works-support-geometry.js';

const MAXIMUM_ERROR = 1e-9;
const DOCK_ORIGIN = [4.5, 4.5, 15.5] as const;

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

const CARRIAGE_CENTER: SupportPointV1 = [
  MACHINE_WORKS_CONVEYOR_V1.rightAxleX,
  sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.carriage)[1],
  0,
];
const DOCK_CENTER = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock);
const FOUNDATION_CENTER = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.foundation);
const BUCKET_CENTER = sceneCenter(MACHINE_WORKS_SCENE_LAYOUT_V1.bucket);

function worldBox(
  asset: PhysicalAssetV1,
  assetCenter: SupportPointV1,
  grain: number,
  at: SupportPointV1,
  size: SupportPointV1,
): PhysicalColliderV1 {
  const body = asset.bodies[0]?.key;
  if (body === undefined) throw new Error(`Test asset '${asset.recipeId}' has no body.`);
  return {
    body,
    shape: {
      kind: 'box' as const,
      halfExtents: [
        size[0] / (2 * grain),
        size[1] / (2 * grain),
        size[2] / (2 * grain),
      ],
    },
    pose: {
      position: [
        (at[0] + size[0] / 2 - assetCenter[0]) / grain,
        (at[1] + size[1] / 2 - assetCenter[1]) / grain,
        (at[2] + size[2] / 2 - assetCenter[2]) / grain,
      ],
    },
    role: 'solid' as const,
  };
}

function withWorldBox(
  asset: PhysicalAssetV1,
  assetCenter: SupportPointV1,
  grain: number,
  at: SupportPointV1,
  size: SupportPointV1,
): PhysicalAssetV1 {
  return {
    ...asset,
    colliders: [...asset.colliders, worldBox(asset, assetCenter, grain, at, size)],
  };
}

function withExtraDockBox(
  dock: PhysicalAssetV1,
  atVoxels: SupportPointV1,
  sizeVoxels: SupportPointV1,
): PhysicalAssetV1 {
  const grain = MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain;
  return withWorldBox(
    dock,
    DOCK_CENTER,
    grain,
    [
      DOCK_CENTER[0] + (atVoxels[0] - DOCK_ORIGIN[0]) * grain,
      DOCK_CENTER[1] + (atVoxels[1] - DOCK_ORIGIN[1]) * grain,
      DOCK_CENTER[2] + (atVoxels[2] - DOCK_ORIGIN[2]) * grain,
    ],
    [
      sizeVoxels[0] * grain,
      sizeVoxels[1] * grain,
      sizeVoxels[2] * grain,
    ],
  );
}

function moveDockBox(
  dock: PhysicalAssetV1,
  atVoxels: SupportPointV1,
  sizeVoxels: SupportPointV1,
  deltaVoxels: SupportPointV1,
): PhysicalAssetV1 {
  const expectedPosition: SupportPointV1 = [
    atVoxels[0] + sizeVoxels[0] / 2 - DOCK_ORIGIN[0],
    atVoxels[1] + sizeVoxels[1] / 2 - DOCK_ORIGIN[1],
    atVoxels[2] + sizeVoxels[2] / 2 - DOCK_ORIGIN[2],
  ];
  const expectedHalfExtents: SupportPointV1 = [
    sizeVoxels[0] / 2,
    sizeVoxels[1] / 2,
    sizeVoxels[2] / 2,
  ];
  let moved = false;
  const colliders = dock.colliders.map((collider): PhysicalColliderV1 => {
    if (moved
      || collider.shape.kind !== 'box'
      || !collider.shape.halfExtents.every(
        (value, axis) => value === expectedHalfExtents[axis],
      )
      || !collider.pose.position.every(
        (value, axis) => value === expectedPosition[axis],
      )) {
      return collider;
    }
    moved = true;
    return {
      ...collider,
      pose: {
        ...collider.pose,
        position: [
          collider.pose.position[0] + deltaVoxels[0],
          collider.pose.position[1] + deltaVoxels[1],
          collider.pose.position[2] + deltaVoxels[2],
        ],
      },
    };
  });
  if (!moved) {
    throw new Error(
      `Negative output-dock fixture could not find box at [${atVoxels.join(', ')}] `
      + `with size [${sizeVoxels.join(', ')}].`,
    );
  }
  return { ...dock, colliders };
}

interface SweepOverridesV1 {
  readonly foundation?: PhysicalAssetV1;
  readonly bucket?: PhysicalAssetV1;
  readonly carriageGrain?: number;
  readonly dockGrain?: number;
  readonly foundationGrain?: number;
  readonly bucketGrain?: number;
  readonly carriageCenter?: SupportPointV1;
  readonly carriageRotation?: readonly [number, number, number, number];
  readonly tipRadians?: number;
}

function sweep(
  dock: PhysicalAssetV1,
  overrides: SweepOverridesV1 = {},
) {
  return machineWorksOutputDockSweepMeasurementV1({
    carriage: createMachineWorksTransferCarriagePhysicalAsset(),
    dock,
    foundation: overrides.foundation ?? createMachineWorksRailFoundationPhysicalAsset(),
    bucket: overrides.bucket ?? createMachineWorksCollectionBucketPhysicalAsset(),
    carriageGrain: overrides.carriageGrain
      ?? MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain,
    dockGrain: overrides.dockGrain
      ?? MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
    foundationGrain: overrides.foundationGrain
      ?? MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
    bucketGrain: overrides.bucketGrain
      ?? MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
    carriageCenter: overrides.carriageCenter ?? CARRIAGE_CENTER,
    dockCenter: DOCK_CENTER,
    foundationCenter: FOUNDATION_CENTER,
    bucketCenter: BUCKET_CENTER,
    carriageRotation: overrides.carriageRotation ?? [0, 0, 0, 1],
    tipRadians: overrides.tipRadians ?? -Math.PI / 2,
    maximumError: MAXIMUM_ERROR,
  });
}

function environment(dock: PhysicalAssetV1): readonly string[] {
  return machineWorksOutputDockEnvironmentIssuesV1(
    dock,
    createMachineWorksRailFoundationPhysicalAsset(),
    createMachineWorksCollectionBucketPhysicalAsset(),
    DOCK_CENTER,
    FOUNDATION_CENTER,
    BUCKET_CENTER,
    MAXIMUM_ERROR,
  );
}

describe('Machine Works output-dock geometry', () => {
  it('proves the canonical support, belt separation, coupling, and full carrier sweep', () => {
    const dock = createMachineWorksOutputDockPhysicalAsset();
    const measurement = sweep(dock);

    expect(machineWorksOutputDockCanonicalIssuesV1(
      MAXIMUM_ERROR, -Math.PI / 2,
    )).toEqual([]);
    expect(measurement.issues).toEqual([]);
    expect(measurement.sweptRadius).toBeCloseTo(Math.hypot(0.2, 0.4), 12);
    expect(measurement.minimumClearance).toBeCloseTo(
      0.6 - Math.hypot(0.2, 0.4),
      12,
    );
    expect(measurement.minimumClearance)
      .toBeGreaterThan(measurement.requiredClearance);
    expect(measurement.minimumFoundationClearance)
      .toBeGreaterThanOrEqual(-MAXIMUM_ERROR);
    expect(measurement.minimumBucketClearance)
      .toBeGreaterThanOrEqual(-MAXIMUM_ERROR);
    expect(measurement.limitingFoundationCarrierSolid).not.toBeNull();
    expect(measurement.limitingFoundationSolid).not.toBeNull();
    expect(measurement.limitingBucketCarrierSolid).not.toBeNull();
    expect(measurement.limitingBucketSolid).not.toBeNull();
  });

  it('measures the accepted live-pose offset instead of assuming canonical alignment', () => {
    const dock = createMachineWorksOutputDockPhysicalAsset();
    const live = sweep(dock, {
      carriageCenter: [22.007_358_551, 10.199_804_306, 0],
    });
    const outsideBudget = sweep(dock, {
      carriageCenter: [22.02, 10.2, 0],
    });

    expect(live.issues).toEqual([]);
    expect(live.minimumClearance).toBeCloseTo(0.145_427_853, 8);
    expect(outsideBudget.minimumClearance).toBeLessThan(
      outsideBudget.requiredClearance,
    );
    expect(outsideBudget.issues.join(' ')).toMatch(/full prescribed rotation/i);
  });

  it('fails closed when any collider grain is degenerate or inverted', () => {
    const dock = createMachineWorksOutputDockPhysicalAsset();

    expect(sweep(dock, { carriageGrain: 0 }).issues.join(' '))
      .toMatch(/carrier grain.*strictly positive.*0/i);
    expect(sweep(dock, { dockGrain: Number.NaN }).issues.join(' '))
      .toMatch(/dock grain.*strictly positive.*NaN/i);
    expect(sweep(dock, { foundationGrain: -1 }).issues.join(' '))
      .toMatch(/foundation grain.*strictly positive.*-1/i);
    expect(sweep(dock, { bucketGrain: 0 }).issues.join(' '))
      .toMatch(/bucket grain.*strictly positive.*0/i);
  });

  it('rejects the old zero-angle-tangent back bar by its continuous swept envelope', () => {
    const legacyTangentBack = withExtraDockBox(
      createMachineWorksOutputDockPhysicalAsset(),
      [5, 1, 4],
      [2, 4, 2],
    );
    const measurement = sweep(legacyTangentBack);

    expect(measurement.minimumClearance).toBeCloseTo(
      0.2 - Math.hypot(0.2, 0.4),
      12,
    );
    expect(measurement.issues.join(' ')).toMatch(/full prescribed rotation/i);
  });

  it('rejects a decorative cross-tie that enters the non-axle carrier sweep', () => {
    const crossingTie = withExtraDockBox(
      createMachineWorksOutputDockPhysicalAsset(),
      [0, 0, 15],
      [1, 1, 1],
    );

    expect(sweep(crossingTie).issues.join(' '))
      .toMatch(/non-trunnion carrier solid/i);
  });

  it('rejects bucket and foundation obstacles reached only between the quarter-turn endpoints', () => {
    const dock = createMachineWorksOutputDockPhysicalAsset();
    const obstacleAt: SupportPointV1 = [20.8, 13.8, -0.2];
    const obstacleSize: SupportPointV1 = [0.4, 0.4, 0.4];
    const blockedFoundation = withWorldBox(
      createMachineWorksRailFoundationPhysicalAsset(),
      FOUNDATION_CENTER,
      MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
      obstacleAt,
      obstacleSize,
    );
    const blockedBucket = withWorldBox(
      createMachineWorksCollectionBucketPhysicalAsset(),
      BUCKET_CENTER,
      MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
      obstacleAt,
      obstacleSize,
    );
    const foundationSweep = sweep(dock, { foundation: blockedFoundation });
    const bucketSweep = sweep(dock, { bucket: blockedBucket });

    expect(foundationSweep.minimumFoundationClearance).toBeLessThan(0);
    expect(foundationSweep.issues.join(' '))
      .toMatch(/carrier-versus-foundation.*full prescribed rotation/i);
    expect(bucketSweep.minimumBucketClearance).toBeLessThan(0);
    expect(bucketSweep.issues.join(' '))
      .toMatch(/carrier-versus-bucket.*full prescribed rotation/i);

    const endPose = {
      carriageCenter: [
        CARRIAGE_CENTER[0] + 2.8,
        CARRIAGE_CENTER[1] + 2.8,
        CARRIAGE_CENTER[2],
      ] as SupportPointV1,
      carriageRotation: [0, 0, -Math.SQRT1_2, Math.SQRT1_2] as const,
      tipRadians: 0,
    };
    expect(sweep(dock, {
      foundation: blockedFoundation,
      tipRadians: 0,
    }).issues.join(' ')).not.toMatch(/carrier-versus-foundation/i);
    expect(sweep(dock, {
      foundation: blockedFoundation,
      ...endPose,
    }).issues.join(' ')).not.toMatch(/carrier-versus-foundation/i);
    expect(sweep(dock, {
      bucket: blockedBucket,
      tipRadians: 0,
    }).issues.join(' ')).not.toMatch(/carrier-versus-bucket/i);
    expect(sweep(dock, {
      bucket: blockedBucket,
      ...endPose,
    }).issues.join(' ')).not.toMatch(/carrier-versus-bucket/i);
  });

  it('rejects a missing foundation shoe and any dock voxel entering the bucket', () => {
    const dock = createMachineWorksOutputDockPhysicalAsset();
    const missingNearShoe: PhysicalAssetV1 = {
      ...dock,
      colliders: dock.colliders.slice(1),
    };
    const bucketOverlap = withExtraDockBox(
      dock,
      [7, 0, 15],
      [1, 1, 1],
    );

    expect(environment(missingNearShoe).join(' '))
      .toMatch(/foundation contact 0/i);
    expect(environment(bucketOverlap).join(' '))
      .toMatch(/overlaps the collection bucket/i);
  });

  it('rejects a disconnected output-servo service conduit', () => {
    const disconnectedInlet = moveDockBox(
      createMachineWorksOutputDockPhysicalAsset(),
      [0, 4, 28],
      [2, 1, 2],
      [0, 0, 2],
    );
    const issues = environment(disconnectedInlet).join(' ');

    expect(issues).toMatch(/canonical servo-service housing inlet/i);
    expect(issues).toMatch(/servo-service conduit breaks its positive-area face route/i);
    expect(issues).toMatch(/riser -> housing inlet/i);
  });
});
