import { describe, expect, it } from 'vitest';

import {
  WINDMILL_COMPACT_REPLAY_RECORD_PROFILE,
  WINDMILL_POSE_REPLAY,
  WINDMILL_PRODUCTION_PRESENTATION,
} from './generated-windmill-replay.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_GRAIN,
  WINDMILL_SCENE_LAYOUT_V1,
} from './windmill-layout.js';
import {
  synthesizeWindmillProductionTracksV1,
  windmillFlourPoseV1,
  windmillWheatSackPoseV1,
} from './windmill-production-kinematics.js';
import {
  windmillAxisDistanceXyV1,
  windmillProductionWorldBoxesV1,
  windmillRotorSweptBandsV1,
  WINDMILL_BUILDING_LAYOUT_V1,
  WINDMILL_FLOUR_BIN_LAYOUT_V1,
  WINDMILL_FLOUR_HEAP_LAYOUT_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
  WINDMILL_WHEAT_SACK_LAYOUT_V1,
  type WindmillWorldBoxV1,
} from './windmill-production-layout.js';

/**
 * The numeric clearance gate the scene-overlap test cannot provide: V4 replay
 * scenes exclude replayed placements from static overlap checking, so this
 * test measures the production line against the committed replay itself —
 * the rotor's analytic swept bands, the hammer's per-frame rotated boxes,
 * and the authored wheat/flour tracks — plus every static machine solid.
 *
 * Distances are exact set distances between boxes whose only rotation is
 * about world Z (the rotor spins and the hammer and rolling sacks rotate
 * about Z only), so each pair reduces to a 2D convex-quad distance combined
 * with a 1D Z-interval gap.
 */

/** Positive-volume separation required between unrelated solids. */
const CLEARANCE = 0.06;
/** The flour level's designed lateral gap inside the bin cavity. */
const FLOUR_WALL_GAP = 0.03;
/** Tolerance for authored rest contact (flour on the bin floor). */
const CONTACT_EPSILON = 1e-6;

type Vec2 = readonly [number, number];

interface PrismV1 {
  readonly label: string;
  /** Convex quad corners in XY order. */
  readonly corners: readonly Vec2[];
  readonly minZ: number;
  readonly maxZ: number;
}

function aabbPrism(label: string, box: WindmillWorldBoxV1): PrismV1 {
  return {
    label,
    corners: [
      [box.min[0], box.min[1]],
      [box.max[0], box.min[1]],
      [box.max[0], box.max[1]],
      [box.min[0], box.max[1]],
    ],
    minZ: box.min[2],
    maxZ: box.max[2],
  };
}

function rotatedPrism(
  label: string,
  centerX: number,
  centerY: number,
  halfX: number,
  halfY: number,
  cos: number,
  sin: number,
  minZ: number,
  maxZ: number,
): PrismV1 {
  const seeds: readonly Vec2[] = [
    [-halfX, -halfY],
    [halfX, -halfY],
    [halfX, halfY],
    [-halfX, halfY],
  ];
  const corners: Vec2[] = seeds.map(([x, y]) => [
    centerX + x * cos - y * sin,
    centerY + x * sin + y * cos,
  ]);
  return { label, corners, minZ, maxZ };
}

function pointSegmentDistance(
  point: Vec2,
  from: Vec2,
  to: Vec2,
): number {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const t = lengthSquared === 0
    ? 0
    : Math.min(1, Math.max(0,
      ((point[0] - from[0]) * deltaX + (point[1] - from[1]) * deltaY)
        / lengthSquared));
  const nearestX = from[0] + t * deltaX;
  const nearestY = from[1] + t * deltaY;
  return Math.hypot(point[0] - nearestX, point[1] - nearestY);
}

function polygonsOverlap(a: readonly Vec2[], b: readonly Vec2[]): boolean {
  for (const [first, second] of [[a, b], [b, a]] as const) {
    for (let index = 0; index < first.length; index += 1) {
      const from = first[index]!;
      const to = first[(index + 1) % first.length]!;
      const axisX = -(to[1] - from[1]);
      const axisY = to[0] - from[0];
      let minFirst = Infinity;
      let maxFirst = -Infinity;
      for (const corner of first) {
        const projected = corner[0] * axisX + corner[1] * axisY;
        minFirst = Math.min(minFirst, projected);
        maxFirst = Math.max(maxFirst, projected);
      }
      let minSecond = Infinity;
      let maxSecond = -Infinity;
      for (const corner of second) {
        const projected = corner[0] * axisX + corner[1] * axisY;
        minSecond = Math.min(minSecond, projected);
        maxSecond = Math.max(maxSecond, projected);
      }
      if (maxFirst < minSecond || maxSecond < minFirst) return false;
    }
  }
  return true;
}

function polygonDistance(a: readonly Vec2[], b: readonly Vec2[]): number {
  if (polygonsOverlap(a, b)) return 0;
  let nearest = Infinity;
  for (let index = 0; index < a.length; index += 1) {
    for (let other = 0; other < b.length; other += 1) {
      nearest = Math.min(
        nearest,
        pointSegmentDistance(
          a[index]!,
          b[other]!,
          b[(other + 1) % b.length]!,
        ),
        pointSegmentDistance(
          b[other]!,
          a[index]!,
          a[(index + 1) % a.length]!,
        ),
      );
    }
  }
  return nearest;
}

function prismDistance(a: PrismV1, b: PrismV1): number {
  const zGap = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  const xyDistance = polygonDistance(a.corners, b.corners);
  return Math.sqrt(zGap * zGap + xyDistance * xyDistance);
}

const CANDIDATE = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1;

function machineStaticPrisms(): readonly PrismV1[] {
  return (['frame', 'anvil'] as const).flatMap((assetKey) => {
    const asset = CANDIDATE.assets[assetKey];
    return asset.boxes.map((box) => aabbPrism(
      `${assetKey}:${box.key}`,
      {
        placementId: assetKey,
        boxKey: box.key,
        min: [
          (asset.worldOriginVoxels[0] + box.at[0]) * WINDMILL_GRAIN,
          (asset.worldOriginVoxels[1] + box.at[1]) * WINDMILL_GRAIN,
          (asset.worldOriginVoxels[2] + box.at[2]) * WINDMILL_GRAIN,
        ],
        max: [
          (asset.worldOriginVoxels[0] + box.at[0] + box.size[0])
            * WINDMILL_GRAIN,
          (asset.worldOriginVoxels[1] + box.at[1] + box.size[1])
            * WINDMILL_GRAIN,
          (asset.worldOriginVoxels[2] + box.at[2] + box.size[2])
            * WINDMILL_GRAIN,
        ],
      },
    ));
  });
}

const BUILDING_BOXES = windmillProductionWorldBoxesV1(
  WINDMILL_BUILDING_LAYOUT_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building,
);
const BIN_BOXES = windmillProductionWorldBoxesV1(
  WINDMILL_FLOUR_BIN_LAYOUT_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin,
);
const PRODUCTION_STATIC_PRISMS: readonly PrismV1[] = [
  ...BUILDING_BOXES,
  ...BIN_BOXES,
].map((box) => aabbPrism(`${box.placementId}:${box.boxKey}`, box));

const MACHINE_STATIC_PRISMS = machineStaticPrisms();

function trackByPlacement(placementId: string) {
  const track = WINDMILL_POSE_REPLAY.tracks.find(
    (candidate) => candidate.placementId === placementId,
  );
  if (track === undefined) {
    throw new Error(
      `Committed windmill replay has no '${placementId}' track; regenerate `
      + 'it with UPDATE_WINDMILL_REPLAY=1.',
    );
  }
  return track;
}

interface FramePoseV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly cos: number;
  readonly sin: number;
}

function framePoses(placementId: string): readonly FramePoseV1[] {
  const track = trackByPlacement(placementId);
  const poses: FramePoseV1[] = [];
  for (let frame = 0; frame < WINDMILL_POSE_REPLAY.frameCount; frame += 1) {
    const qx = track.quaternions[frame * 4]!;
    const qy = track.quaternions[frame * 4 + 1]!;
    const qz = track.quaternions[frame * 4 + 2]!;
    const qw = track.quaternions[frame * 4 + 3]!;
    expect(
      Math.abs(qx) + Math.abs(qy),
      `${placementId} frame ${String(frame)} rotates about world Z only`,
    ).toBeLessThan(2e-3);
    poses.push({
      x: track.translations[frame * 3]!,
      y: track.translations[frame * 3 + 1]!,
      z: track.translations[frame * 3 + 2]!,
      cos: 1 - 2 * qz * qz,
      sin: 2 * qz * qw,
    });
  }
  return poses;
}

/** Hammer box half-extents and body-local center offsets, world units. */
function hammerLocalBoxes() {
  const asset = CANDIDATE.assets.hammer;
  const bodyWorld = [
    (asset.worldOriginVoxels[0] + asset.bodyOriginVoxels[0]) * WINDMILL_GRAIN,
    (asset.worldOriginVoxels[1] + asset.bodyOriginVoxels[1]) * WINDMILL_GRAIN,
    (asset.worldOriginVoxels[2] + asset.bodyOriginVoxels[2]) * WINDMILL_GRAIN,
  ] as const;
  return asset.boxes.map((box) => ({
    boxKey: box.key,
    offsetX: (asset.worldOriginVoxels[0] + box.at[0] + box.size[0] / 2)
      * WINDMILL_GRAIN - bodyWorld[0],
    offsetY: (asset.worldOriginVoxels[1] + box.at[1] + box.size[1] / 2)
      * WINDMILL_GRAIN - bodyWorld[1],
    offsetZ: (asset.worldOriginVoxels[2] + box.at[2] + box.size[2] / 2)
      * WINDMILL_GRAIN - bodyWorld[2],
    halfX: (box.size[0] * WINDMILL_GRAIN) / 2,
    halfY: (box.size[1] * WINDMILL_GRAIN) / 2,
    halfZ: (box.size[2] * WINDMILL_GRAIN) / 2,
  }));
}

function hammerPrismsAt(pose: FramePoseV1): readonly PrismV1[] {
  return hammerLocalBoxes().map((box) => {
    const centerX = pose.x + box.offsetX * pose.cos - box.offsetY * pose.sin;
    const centerY = pose.y + box.offsetX * pose.sin + box.offsetY * pose.cos;
    return rotatedPrism(
      `trip-hammer:${box.boxKey}`,
      centerX,
      centerY,
      box.halfX,
      box.halfY,
      pose.cos,
      pose.sin,
      pose.z + box.offsetZ - box.halfZ,
      pose.z + box.offsetZ + box.halfZ,
    );
  });
}

const SACK_HALF_X =
  (WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels[0]
    * WINDMILL_WHEAT_SACK_LAYOUT_V1.grain) / 2;
const SACK_HALF_Y =
  (WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels[1]
    * WINDMILL_WHEAT_SACK_LAYOUT_V1.grain) / 2;
const SACK_HALF_Z =
  (WINDMILL_WHEAT_SACK_LAYOUT_V1.sizeVoxels[2]
    * WINDMILL_WHEAT_SACK_LAYOUT_V1.grain) / 2;
const FLOUR_HALF_X =
  (WINDMILL_FLOUR_HEAP_LAYOUT_V1.sizeVoxels[0]
    * WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain) / 2;
const FLOUR_HALF_Y =
  (WINDMILL_FLOUR_HEAP_LAYOUT_V1.sizeVoxels[1]
    * WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain) / 2;
const FLOUR_HALF_Z =
  (WINDMILL_FLOUR_HEAP_LAYOUT_V1.sizeVoxels[2]
    * WINDMILL_FLOUR_HEAP_LAYOUT_V1.grain) / 2;

function productionPrismAt(
  placementId: string,
  pose: FramePoseV1,
): PrismV1 {
  const flour = placementId === WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap;
  return rotatedPrism(
    placementId,
    pose.x,
    pose.y,
    flour ? FLOUR_HALF_X : SACK_HALF_X,
    flour ? FLOUR_HALF_Y : SACK_HALF_Y,
    pose.cos,
    pose.sin,
    pose.z - (flour ? FLOUR_HALF_Z : SACK_HALF_Z),
    pose.z + (flour ? FLOUR_HALF_Z : SACK_HALF_Z),
  );
}

/** Shortest 2D distance from a point to a convex quad; zero when inside. */
function pointQuadDistance(point: Vec2, quad: readonly Vec2[]): number {
  let inside = true;
  let nearest = Infinity;
  for (let index = 0; index < quad.length; index += 1) {
    const from = quad[index]!;
    const to = quad[(index + 1) % quad.length]!;
    const cross = (to[0] - from[0]) * (point[1] - from[1])
      - (to[1] - from[1]) * (point[0] - from[0]);
    if (cross < 0) inside = false;
    nearest = Math.min(nearest, pointSegmentDistance(point, from, to));
  }
  return inside ? 0 : nearest;
}

/** Clearance between a track prism and one analytic rotor swept band. */
function prismBandClearance(
  prism: PrismV1,
  band: { readonly minZ: number; readonly maxZ: number; readonly radius: number },
  axis: readonly [number, number, number],
): number {
  const zGap = Math.max(
    prism.minZ - band.maxZ,
    band.minZ - prism.maxZ,
    0,
  );
  const radialGap = Math.max(
    0,
    pointQuadDistance([axis[0], axis[1]], prism.corners) - band.radius,
  );
  return zGap > 0
    ? Math.sqrt(zGap * zGap + radialGap * radialGap)
    : radialGap;
}

describe('windmill production clearances against the committed replay', () => {
  const bands = windmillRotorSweptBandsV1();
  const impactsSeconds = WINDMILL_PRODUCTION_PRESENTATION.impactTicks.map(
    (tick) => tick
      * WINDMILL_COMPACT_REPLAY_RECORD_PROFILE.solverStepSeconds,
  );

  it('re-derives the committed production tracks from the live kinematics', () => {
    const synthesized = synthesizeWindmillProductionTracksV1(
      impactsSeconds,
      WINDMILL_POSE_REPLAY.frameCount,
      1 / 60,
    );
    for (const expected of synthesized) {
      const committed = trackByPlacement(expected.placementId);
      expect(committed.translations).toEqual(expected.translations);
      expect(committed.quaternions).toEqual(expected.quaternions);
    }
  });

  it('keeps the rotor drift far below the analytic band tolerance', () => {
    const track = trackByPlacement('windmill-rotor');
    const first = [
      track.translations[0]!,
      track.translations[1]!,
      track.translations[2]!,
    ];
    for (let frame = 0; frame < WINDMILL_POSE_REPLAY.frameCount; frame += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Math.abs(track.translations[frame * 3 + axis]! - first[axis]!))
          .toBeLessThan(1e-5);
      }
    }
  });

  it('separates every static production solid from every static machine solid', () => {
    for (const production of PRODUCTION_STATIC_PRISMS) {
      for (const machine of MACHINE_STATIC_PRISMS) {
        const distance = prismDistance(production, machine);
        expect(
          distance,
          `${production.label} vs ${machine.label}`,
        ).toBeGreaterThanOrEqual(CLEARANCE);
      }
    }
  });

  it('keeps every static production solid outside the rotor swept bands', () => {
    for (const production of [...BUILDING_BOXES, ...BIN_BOXES]) {
      for (const band of bands) {
        const zGap = Math.max(
          production.min[2] - band.maxZ,
          band.minZ - production.max[2],
          0,
        );
        const radialGap =
          windmillAxisDistanceXyV1(production.min, production.max)
            - band.radius;
        const clearance = zGap > 0
          ? Math.sqrt(zGap * zGap + Math.max(0, radialGap) ** 2)
          : radialGap;
        expect(
          clearance,
          `${production.placementId}:${production.boxKey} vs rotor `
          + `${band.boxKey} sweep`,
        ).toBeGreaterThanOrEqual(CLEARANCE);
      }
    }
  });

  it('keeps the hammer sweep clear of all production solids every frame', () => {
    const hammerPoses = framePoses('trip-hammer');
    const trackFramePoses = WINDMILL_PRODUCTION_TRACK_IDS_V1.map(
      (placementId) => ({ placementId, poses: framePoses(placementId) }),
    );
    for (let frame = 0; frame < WINDMILL_POSE_REPLAY.frameCount; frame += 1) {
      const hammer = hammerPrismsAt(hammerPoses[frame]!);
      for (const hammerPrism of hammer) {
        for (const staticPrism of PRODUCTION_STATIC_PRISMS) {
          expect(
            prismDistance(hammerPrism, staticPrism),
            `frame ${String(frame)}: ${hammerPrism.label} vs `
            + staticPrism.label,
          ).toBeGreaterThanOrEqual(CLEARANCE);
        }
        // Every authored track, the flour level included: the sacks travel
        // under the beam and the level rises beside the toe's swing.
        for (const { placementId, poses } of trackFramePoses) {
          const trackPrism = productionPrismAt(placementId, poses[frame]!);
          expect(
            prismDistance(hammerPrism, trackPrism),
            `frame ${String(frame)}: ${hammerPrism.label} vs `
            + trackPrism.label,
          ).toBeGreaterThanOrEqual(CLEARANCE);
        }
      }
    }
  });

  // The gabled shell grew the static set to 31 prisms, so this 721-frame
  // sweep runs near vitest's 5-second default when the whole suite loads
  // every core; the explicit budget keeps a loaded machine from reporting a
  // scheduling stall as a clearance failure.
  it('keeps every authored track clear of statics, the rotor, and each other', { timeout: 30_000 }, () => {
    const trackPoses = WINDMILL_PRODUCTION_TRACK_IDS_V1.map(
      (placementId) => ({ placementId, poses: framePoses(placementId) }),
    );
    const statics = [...PRODUCTION_STATIC_PRISMS, ...MACHINE_STATIC_PRISMS];
    for (let frame = 0; frame < WINDMILL_POSE_REPLAY.frameCount; frame += 1) {
      const prisms = trackPoses.map(({ placementId, poses }) =>
        productionPrismAt(placementId, poses[frame]!));
      prisms.forEach((prism, index) => {
        const flour =
          trackPoses[index]!.placementId
            === WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap;
        for (const corner of prism.corners) {
          expect(
            corner[1],
            `frame ${String(frame)}: ${prism.label} stays above ground`,
          ).toBeGreaterThanOrEqual(-CONTACT_EPSILON);
        }
        for (const staticPrism of statics) {
          if (flour && staticPrism.label.startsWith('flour-bin:')) {
            // Authored containment: the level rests on the bin floor and
            // rides inside its walls, so a set-distance gate is vacuous
            // here. The cavity test below bounds all six faces exactly.
            continue;
          }
          expect(
            prismDistance(prism, staticPrism),
            `frame ${String(frame)}: ${prism.label} vs `
            + staticPrism.label,
          ).toBeGreaterThanOrEqual(CLEARANCE);
        }
        // The rotor's swept bands: rotation about the fixed axis preserves
        // Z, so a band whose Z range the track shares must stay radially
        // outside the band's largest corner radius.
        for (const band of bands) {
          expect(
            prismBandClearance(
              prism,
              band,
              WINDMILL_SCENE_LAYOUT_V1.rotorAxisWorld,
            ),
            `frame ${String(frame)}: ${prism.label} vs rotor `
            + `${band.boxKey} sweep`,
          ).toBeGreaterThanOrEqual(CLEARANCE);
        }
        for (let other = index + 1; other < prisms.length; other += 1) {
          expect(
            prismDistance(prism, prisms[other]!),
            `frame ${String(frame)}: ${prism.label} vs `
            + prisms[other]!.label,
          ).toBeGreaterThanOrEqual(0.05);
        }
      });
    }
  });

  it('keeps the flour level laterally inside the bin cavity with its designed gap', () => {
    const cavityMinX = 3.4375;
    const cavityMaxX = 3.8125;
    const cavityMinZ = 1.4375;
    const cavityMaxZ = 1.8125;
    const poses = framePoses(
      WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
    );
    for (const pose of poses) {
      expect(pose.x - FLOUR_HALF_X - cavityMinX)
        .toBeGreaterThanOrEqual(FLOUR_WALL_GAP);
      expect(cavityMaxX - (pose.x + FLOUR_HALF_X))
        .toBeGreaterThanOrEqual(FLOUR_WALL_GAP);
      expect(pose.z - FLOUR_HALF_Z - cavityMinZ)
        .toBeGreaterThanOrEqual(FLOUR_WALL_GAP);
      expect(cavityMaxZ - (pose.z + FLOUR_HALF_Z))
        .toBeGreaterThanOrEqual(FLOUR_WALL_GAP);
      expect(pose.y - FLOUR_HALF_Y).toBeGreaterThanOrEqual(
        0.125 - CONTACT_EPSILON,
      );
    }
    // The declared rim datums: the level's top face starts one prop voxel
    // (0.0625) below the rim at 0.375 and ends 0.125 — two prop voxels —
    // proud of it after the five recorded impacts.
    const first = poses[0]!;
    const last = poses[poses.length - 1]!;
    expect(first.y + FLOUR_HALF_Y).toBeCloseTo(0.3125, 6);
    expect(last.y + FLOUR_HALF_Y).toBeCloseTo(0.5, 6);
  });

  it('matches the live pose functions at the recorded event times', () => {
    for (const [index, impact] of impactsSeconds.entries()) {
      const arrival = windmillWheatSackPoseV1(index, impact, impact);
      expect(arrival.translation[0]).toBeCloseTo(2.8125, 12);
      expect(arrival.translation[2]).toBeCloseTo(1.625, 12);
      expect(arrival.rollRadians).toBe(0);
    }
    const before = windmillFlourPoseV1(impactsSeconds, 0);
    const after = windmillFlourPoseV1(impactsSeconds, 12);
    expect(after.translation[1] - before.translation[1])
      .toBeCloseTo(5 * 0.0375, 12);
  });
});
