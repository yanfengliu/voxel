import {
  createWindmillCompactCreativeV1,
} from './windmill-compact-creative.js';
import type {
  WindmillCompactAssetKeyV1,
  WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  assertWindmillCompactSelectionV1,
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
} from './windmill-compact-selection.js';

/** Shared authored datums for the selected compact trip-mill scene. */

export const WINDMILL_SCENE_ID = 'studio:scene:windmill-trip-hammer';
export const WINDMILL_POSE_REPLAY_ID =
  'studio:pose-replay:windmill-trip-hammer';
export const WINDMILL_SIMULATION_DURATION_MS = 12_000;
export const WINDMILL_REPLAY_RECORD_HZ = 60;
export const WINDMILL_REPLAY_FRAME_COUNT = 721;
/**
 * A replay stores both t=0 and t=12 s. Presentation holds each of the 721
 * samples for one 60 Hz interval, so its transport duration is one interval
 * longer than the simulated time span.
 */
export const WINDMILL_REPLAY_DURATION_MS =
  WINDMILL_REPLAY_FRAME_COUNT * (1000 / WINDMILL_REPLAY_RECORD_HZ);
export const WINDMILL_GRAIN =
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1.grainMeters;

export const WINDMILL_RECIPE_IDS_V1 = Object.freeze({
  frame: 'studio:windmill:frame',
  rotor: 'studio:windmill:rotor',
  hammer: 'studio:windmill:trip-hammer',
  anvil: 'studio:windmill:anvil',
} as const);

export const WINDMILL_PLACEMENT_IDS_V1 = Object.freeze({
  frame: 'windmill-frame',
  rotor: 'windmill-rotor',
  hammer: 'trip-hammer',
  anvil: 'windmill-anvil',
} as const);

export type WindmillAssetKeyV1 = WindmillCompactAssetKeyV1;
export type WindmillRecipeIdV1 =
  typeof WINDMILL_RECIPE_IDS_V1[WindmillAssetKeyV1];
export type WindmillPlacementIdV1 =
  typeof WINDMILL_PLACEMENT_IDS_V1[WindmillAssetKeyV1];

export interface WindmillAssetLayoutV1 {
  readonly recipeId: WindmillRecipeIdV1;
  readonly placementId: WindmillPlacementIdV1;
  readonly sizeVoxels: WindmillCompactTripleV1;
  readonly worldOriginVoxels: WindmillCompactTripleV1;
  /** Model Build centers X/Z and grounds Y at this local datum. */
  readonly visualAnchorVoxels: WindmillCompactTripleV1;
  readonly bodyOriginVoxels: WindmillCompactTripleV1;
  readonly bodyWorld: WindmillCompactTripleV1;
  readonly sceneAt: WindmillCompactTripleV1;
  readonly presentedBodyWorld: WindmillCompactTripleV1;
  readonly grain: typeof WINDMILL_GRAIN;
}

assertWindmillCompactSelectionV1();
const SELECTED = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1;
const CREATIVE = createWindmillCompactCreativeV1(SELECTED);

function triple(
  value: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return Object.freeze([...value]);
}

function scale(
  value: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return triple([
    value[0] * WINDMILL_GRAIN,
    value[1] * WINDMILL_GRAIN,
    value[2] * WINDMILL_GRAIN,
  ]);
}

function asset(key: WindmillAssetKeyV1): WindmillAssetLayoutV1 {
  const geometry = SELECTED.assets[key];
  const placement = CREATIVE.assets[key].scenePlacement;
  return Object.freeze({
    recipeId: WINDMILL_RECIPE_IDS_V1[key],
    placementId: WINDMILL_PLACEMENT_IDS_V1[key],
    sizeVoxels: geometry.sizeVoxels,
    worldOriginVoxels: geometry.worldOriginVoxels,
    visualAnchorVoxels: triple([
      geometry.sizeVoxels[0] / 2,
      0,
      geometry.sizeVoxels[2] / 2,
    ]),
    bodyOriginVoxels: geometry.bodyOriginVoxels,
    bodyWorld: placement.authoredBodyWorld,
    sceneAt: placement.at,
    presentedBodyWorld: placement.presentedBodyWorld,
    grain: WINDMILL_GRAIN,
  });
}

function requirePort(key: string) {
  const port = SELECTED.ports.find((entry) => entry.key === key);
  if (port === undefined) {
    throw new Error(
      `Cannot derive selected windmill layout: required port '${key}' is absent.`,
    );
  }
  return port;
}

function localDatum(
  key: WindmillAssetKeyV1,
  portKey: string,
): WindmillCompactTripleV1 {
  const port = requirePort(portKey);
  const origin = SELECTED.assets[key].worldOriginVoxels;
  return triple([
    port.worldPositionVoxels[0] - origin[0],
    port.worldPositionVoxels[1] - origin[1],
    port.worldPositionVoxels[2] - origin[2],
  ]);
}

const anvilCap = SELECTED.assets.anvil.boxes.find(
  (box) => box.key === 'anvil-impact-cap',
);
if (anvilCap === undefined) {
  throw new Error(
    'Cannot derive selected windmill layout: anvil-impact-cap is absent.',
  );
}
const anvilCapWorldMinimum = triple([
  SELECTED.assets.anvil.worldOriginVoxels[0] + anvilCap.at[0],
  SELECTED.assets.anvil.worldOriginVoxels[1] + anvilCap.at[1],
  SELECTED.assets.anvil.worldOriginVoxels[2] + anvilCap.at[2],
]);

export const WINDMILL_SCENE_LAYOUT_V1 = Object.freeze({
  parameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  geometryFingerprint: SELECTED.geometryFingerprint,
  grain: WINDMILL_GRAIN,
  frame: asset('frame'),
  rotor: asset('rotor'),
  hammer: asset('hammer'),
  anvil: asset('anvil'),
  rotorAxisFrameVoxels: localDatum('frame', 'frame-rotor-axis'),
  rotorAxisWorld: scale(requirePort('frame-rotor-axis').worldPositionVoxels),
  hammerPivotFrameVoxels: localDatum('frame', 'frame-hammer-axis'),
  hammerPivotWorld:
    scale(requirePort('frame-hammer-axis').worldPositionVoxels),
  anvilImpactCapWorldMinimum: scale(anvilCapWorldMinimum),
  anvilGroundReactionWorld: triple([
    (anvilCapWorldMinimum[0] + anvilCap.size[0] / 2) * WINDMILL_GRAIN,
    0,
    (anvilCapWorldMinimum[2] + anvilCap.size[2] / 2) * WINDMILL_GRAIN,
  ]),
});
