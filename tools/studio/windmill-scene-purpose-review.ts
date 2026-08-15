import {
  WINDMILL_GRAIN,
  WINDMILL_PLACEMENT_IDS_V1,
  type WindmillPlacementIdV1,
} from './windmill-layout.js';
import {
  WINDMILL_BUILDING_GRAIN,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  type WindmillProductionPlacementIdV1,
} from './windmill-production-layout.js';
import { createWindmillScene } from './windmill-scene.js';
import {
  VOXEL_SCENE_SCHEMA_V3,
  type SceneSchemaV3,
} from './scene.js';

type Vec3 = readonly [number, number, number];

export interface WindmillScenePurposeReviewVariantV1 {
  readonly artifact: 'scene';
  readonly id: `windmill:review:${string}`;
  readonly label: string;
  readonly reviewKind: 'relocation';
  readonly purposeIds: readonly string[];
  readonly expectedFailure: string;
  /**
   * The one placement this variant moves, and how far.
   *
   * Carried so a proof can frame the relocation rather than photograph the
   * whole mill and hope. Judged from the two scene-wide quarter views alone,
   * four of these eight relocations changed under 1.2% of the frame from the
   * front and nothing at all from the rear.
   */
  readonly relocatedPlacementId: string;
  readonly relocationDelta: Vec3;
  /** The placement's authored anchor before the delta, for that framing. */
  readonly relocationFrom: Vec3;
  /**
   * Deliberately static: the review artifact must present its authored
   * relocation, not let the canonical replay restore the selected poses.
   */
  readonly scene: SceneSchemaV3;
}

interface SceneRelocationSpecV1 {
  readonly id: `windmill:review:${string}`;
  readonly label: string;
  readonly placementId:
    WindmillPlacementIdV1 | WindmillProductionPlacementIdV1;
  readonly delta: Vec3;
  readonly purposeIds: readonly string[];
  readonly expectedFailure: string;
}

const SPECS: readonly SceneRelocationSpecV1[] = Object.freeze([
  Object.freeze({
    id: 'windmill:review:frame-off-ground-and-joints',
    label: 'Review failure: frame lifted off ground and both axes',
    placementId: WINDMILL_PLACEMENT_IDS_V1.frame,
    delta: Object.freeze([0, WINDMILL_GRAIN, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:frame',
      'windmill:system-purpose:rotor-revolute',
      'windmill:system-purpose:hammer-revolute-gravity',
    ]),
    expectedFailure:
      'The fixed frame rises one voxel while both moving bodies stay put, removing the authored ground datum and separating both paired axis ports.',
  }),
  Object.freeze({
    id: 'windmill:review:rotor-off-bearings-and-follower',
    label: 'Review failure: rotor shifted off bearings and follower',
    placementId: WINDMILL_PLACEMENT_IDS_V1.rotor,
    delta: Object.freeze([WINDMILL_GRAIN, 0, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:rotor',
      'windmill:system-purpose:rotor-revolute',
      'windmill:system-purpose:cam-contact-release',
    ]),
    expectedFailure:
      'The shaft leaves both fixed bearing spans and both cam noses move away from the unchanged follower datum.',
  }),
  Object.freeze({
    id: 'windmill:review:hammer-off-pivot-and-contact-plane',
    label: 'Review failure: hammer shifted off pivot and contacts',
    placementId: WINDMILL_PLACEMENT_IDS_V1.hammer,
    delta: Object.freeze([0, 0, WINDMILL_GRAIN] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:hammer',
      'windmill:system-purpose:cam-contact-release',
      'windmill:system-purpose:hammer-revolute-gravity',
      'windmill:system-purpose:anvil-impact',
    ]),
    expectedFailure:
      'The hammer journal leaves its rear bearing and its one-voxel follower and toe leave both authored contact planes.',
  }),
  Object.freeze({
    id: 'windmill:review:anvil-off-grounded-head-datum',
    label: 'Review failure: anvil shifted off grounded head datum',
    placementId: WINDMILL_PLACEMENT_IDS_V1.anvil,
    delta: Object.freeze([WINDMILL_GRAIN, 0, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:anvil',
      'windmill:system-purpose:anvil-impact',
      'windmill:purpose:direct-ground-impact-reaction',
      'windmill:purpose:hammer-contact-witness-face',
    ]),
    expectedFailure:
      'The fixed cap and its direct reaction column move one voxel away from the unchanged terminal hammer toe.',
  }),
  Object.freeze({
    id: 'windmill:review:building-off-swept-clearances',
    label: 'Review failure: building shifted off its swept clearances',
    placementId: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building,
    delta: Object.freeze([0, 0, -WINDMILL_BUILDING_GRAIN * 2] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:mill-building',
      'windmill:purpose:rotor-bay-separation',
      'windmill:purpose:shaft-wall-passage',
    ]),
    expectedFailure:
      'The rotor wall advances into the sail sweep band and the roof edge overhangs the sweep, erasing the authored half-voxel daylight gap.',
  }),
  Object.freeze({
    id: 'windmill:review:flour-bin-off-anvil-face',
    label: 'Review failure: flour bin pulled off the anvil face',
    placementId: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin,
    delta: Object.freeze([WINDMILL_GRAIN * 2, 0, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:flour-outfeed',
      'windmill:purpose:flour-level-rim',
    ]),
    expectedFailure:
      'The bin leaves the anvil east face and the unchanged flour level stands as a bare white slab outside its walls.',
  }),
  Object.freeze({
    id: 'windmill:review:wheat-sack-off-queue-rule',
    label: 'Review failure: first sack breaks the queue rule',
    placementId: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks[0],
    // +X, into the open working corner: the strayed sack must be visible
    // from the fixed review cameras, not hidden behind the hammer linkage.
    delta: Object.freeze([WINDMILL_GRAIN * 2, 0, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:wheat-infeed-magazine',
      'windmill:purpose:grain-infeed-mass',
    ]),
    expectedFailure:
      'The first-delivered sack strays off the one-rule queue line into the open working corner, so the magazine reads as scattered props rather than staged input.',
  }),
  Object.freeze({
    id: 'windmill:review:flour-level-outside-bin',
    label: 'Review failure: flour level escapes the bin cavity',
    placementId: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
    delta: Object.freeze([WINDMILL_GRAIN * 2, 0, 0] as const),
    purposeIds: Object.freeze([
      'windmill:system-purpose:flour-outfeed',
      'windmill:purpose:flour-output-level',
    ]),
    expectedFailure:
      'The level intersects the bin\'s east rim and pokes outside the container, so it stops reading as contents at a height.',
  }),
]);

function createVariant(
  spec: SceneRelocationSpecV1,
): WindmillScenePurposeReviewVariantV1 {
  const canonical = createWindmillScene();
  const moved = canonical.placements.find(({ id }) => id === spec.placementId);
  if (moved === undefined) {
    throw new Error(
      `Cannot build Windmill review '${spec.id}': the canonical scene has no `
      + `placement '${spec.placementId}' to relocate.`,
    );
  }
  const placements = Object.freeze(canonical.placements.map((placement) =>
    placement.id === spec.placementId
      ? Object.freeze({
        ...placement,
        at: Object.freeze(placement.at.map(
          (value, axis) => value + spec.delta[axis]!,
        ) as [number, number, number]),
      })
      : placement));
  return Object.freeze({
    artifact: 'scene',
    id: spec.id,
    label: spec.label,
    reviewKind: 'relocation',
    purposeIds: spec.purposeIds,
    expectedFailure: spec.expectedFailure,
    relocatedPlacementId: spec.placementId,
    relocationDelta: spec.delta,
    relocationFrom: Object.freeze([...moved.at] as [number, number, number]),
    scene: Object.freeze({
      schemaVersion: VOXEL_SCENE_SCHEMA_V3,
      id: canonical.id,
      label: spec.label,
      summary: `Purpose-review relocation: ${spec.expectedFailure}`,
      placements,
      ...(canonical.lights === undefined
        ? {}
        : { lights: canonical.lights }),
    }),
  });
}

export function createWindmillScenePurposeReviewVariantsV1():
readonly WindmillScenePurposeReviewVariantV1[] {
  return Object.freeze(SPECS.map(createVariant));
}
