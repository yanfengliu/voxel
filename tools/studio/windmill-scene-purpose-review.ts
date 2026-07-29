import {
  WINDMILL_GRAIN,
  WINDMILL_PLACEMENT_IDS_V1,
  type WindmillPlacementIdV1,
} from './windmill-layout.js';
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
   * Deliberately static: the review artifact must present its authored
   * relocation, not let the canonical replay restore the selected poses.
   */
  readonly scene: SceneSchemaV3;
}

interface SceneRelocationSpecV1 {
  readonly id: `windmill:review:${string}`;
  readonly label: string;
  readonly placementId: WindmillPlacementIdV1;
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
]);

function createVariant(
  spec: SceneRelocationSpecV1,
): WindmillScenePurposeReviewVariantV1 {
  const canonical = createWindmillScene();
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
