export const WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1 =
  'studio.windmill-compact-geometry/1' as const;
export const WINDMILL_COMPACT_GRAIN_METERS = 0.25 as const;
export const WINDMILL_COMPACT_CAM_NOSE_KEYS_V1 = Object.freeze([
  'rotor-cam-nose',
  'rotor-opposed-cam-nose',
] as const);
export type WindmillCompactCamNoseKeyV1 =
  typeof WINDMILL_COMPACT_CAM_NOSE_KEYS_V1[number];

export type WindmillCompactTripleV1 =
  readonly [number, number, number];
export type WindmillCompactAssetKeyV1 =
  | 'frame'
  | 'rotor'
  | 'hammer'
  | 'anvil';
export type WindmillCompactMaterialProfileV1 =
  | 'fixedSupport'
  | 'rotorCore'
  | 'rotorShaft'
  | 'sail'
  | 'cam'
  | 'rotorCollar'
  | 'hammerBeam'
  | 'hammerFollower'
  | 'hammerPivot'
  | 'hammerHead'
  | 'hammerCollar'
  | 'anvil';
export type WindmillCompactCollisionRoleV1 =
  | 'inert-solid'
  | 'cam'
  | 'follower'
  | 'hammer-head'
  | 'anvil-face';

export interface WindmillCompactParametersV1 {
  readonly rotorRadiusVoxels: 5 | 6;
  readonly groundClearanceVoxels: 1 | 2;
  readonly sailRadialSpanVoxels: 3 | 4;
  readonly camRadialLengthVoxels: 2 | 3;
  readonly camHeightVoxels: 1;
  readonly hammerRightArmLengthVoxels: 3 | 4 | 5;
  readonly hammerHeadHeightVoxels: 1 | 2 | 3;
  readonly initialHeadAnvilClearanceVoxels: 0;
}

export interface WindmillCompactBoxV1 {
  readonly key: string;
  readonly purposeId: `windmill:purpose:${string}`;
  readonly role: string;
  readonly at: WindmillCompactTripleV1;
  readonly size: WindmillCompactTripleV1;
  readonly bodyKey: WindmillCompactAssetKeyV1;
  readonly materialProfile: WindmillCompactMaterialProfileV1;
  readonly collisionRole: WindmillCompactCollisionRoleV1;
}

export interface WindmillCompactAssetV1 {
  readonly key: WindmillCompactAssetKeyV1;
  readonly bodyKey: WindmillCompactAssetKeyV1;
  readonly dynamic: boolean;
  readonly worldOriginVoxels: WindmillCompactTripleV1;
  readonly sizeVoxels: WindmillCompactTripleV1;
  readonly bodyOriginVoxels: WindmillCompactTripleV1;
  readonly bodyWorldVoxels: WindmillCompactTripleV1;
  readonly boxes: readonly WindmillCompactBoxV1[];
  readonly occupiedCells: readonly WindmillCompactTripleV1[];
  readonly occupiedVoxelCount: number;
}

export interface WindmillCompactPortV1 {
  readonly key: string;
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly bodyKey: WindmillCompactAssetKeyV1;
  readonly positionVoxels: WindmillCompactTripleV1;
  readonly worldPositionVoxels: WindmillCompactTripleV1;
  readonly axisUnit?: WindmillCompactTripleV1;
}

export interface WindmillCompactSailFrameV1 {
  readonly key: 'north-sail' | 'south-sail';
  readonly assetKey: 'rotor';
  readonly panelBoxKeys: readonly string[];
  readonly panelOccupiedCells: readonly WindmillCompactTripleV1[];
  readonly localShaftPointVoxels: WindmillCompactTripleV1;
  readonly worldShaftPointVoxels: WindmillCompactTripleV1;
  readonly localCentroidVoxels: WindmillCompactTripleV1;
  readonly worldCentroidVoxels: WindmillCompactTripleV1;
  readonly localRadialUnit: WindmillCompactTripleV1;
  readonly localChordUnit: WindmillCompactTripleV1;
  readonly localNormalUnit: WindmillCompactTripleV1;
  readonly localStepEndpointsVoxels:
    readonly [WindmillCompactTripleV1, WindmillCompactTripleV1];
  readonly worldStepEndpointsVoxels:
    readonly [WindmillCompactTripleV1, WindmillCompactTripleV1];
  readonly radialSpanVoxels: number;
  readonly chordSpanVoxels: number;
  /**
   * Area of the equivalent flat plate fitted through the visible staircase.
   * It is not the compound voxel solid's exposed surface area.
   */
  readonly equivalentPlateAreaSquareVoxels: number;
  readonly equivalentPlateAreaSquareMeters: number;
  readonly honestyBoundary:
    'low-resolution-equivalent-flat-plate-derived-from-visible-step-endpoints';
}

export interface WindmillCompactInterfaceV1 {
  readonly fromBoxKey: string;
  readonly toBoxKey: string;
  readonly minimumFaceAreaVoxels: number;
}

export interface WindmillCompactIntentionalContactGroupV1 {
  readonly key: 'cam-follower' | 'head-anvil';
  readonly firstBoxKeys: readonly string[];
  readonly secondBoxKeys: readonly string[];
}

export interface WindmillCompactCandidateV1 {
  readonly schema: typeof WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1;
  readonly grainMeters: typeof WINDMILL_COMPACT_GRAIN_METERS;
  readonly parameters: WindmillCompactParametersV1;
  readonly parameterKey: string;
  readonly assets: Readonly<Record<
    WindmillCompactAssetKeyV1,
    WindmillCompactAssetV1
  >>;
  readonly ports: readonly WindmillCompactPortV1[];
  readonly sails: readonly [
    WindmillCompactSailFrameV1,
    WindmillCompactSailFrameV1,
  ];
  readonly requiredInterfaces: readonly WindmillCompactInterfaceV1[];
  readonly intentionalContactGroups:
    readonly WindmillCompactIntentionalContactGroupV1[];
  readonly totalOccupiedVoxels: number;
  readonly dynamicOccupiedVoxels: number;
  readonly openingOverlapCellCount: 0;
  readonly sceneWorldMinVoxels: WindmillCompactTripleV1;
  readonly sceneWorldMaxExclusiveVoxels: WindmillCompactTripleV1;
  readonly sceneEnvelopeVoxels: WindmillCompactTripleV1;
  readonly geometryFingerprint: `fnv1a64:${string}`;
}

export const WINDMILL_DEFAULT_COMPACT_PARAMETERS_V1:
WindmillCompactParametersV1 = Object.freeze({
  rotorRadiusVoxels: 6,
  groundClearanceVoxels: 1,
  sailRadialSpanVoxels: 4,
  camRadialLengthVoxels: 3,
  camHeightVoxels: 1,
  hammerRightArmLengthVoxels: 5,
  hammerHeadHeightVoxels: 2,
  initialHeadAnvilClearanceVoxels: 0,
});

export function windmillDefaultCompactParametersV1():
WindmillCompactParametersV1 {
  return WINDMILL_DEFAULT_COMPACT_PARAMETERS_V1;
}

export const WINDMILL_COMPACT_PARAMETER_RANGES_V1 = Object.freeze({
  rotorRadiusVoxels: Object.freeze([5, 6] as const),
  groundClearanceVoxels: Object.freeze([1, 2] as const),
  sailRadialSpanVoxels: Object.freeze([3, 4] as const),
  camRadialLengthVoxels: Object.freeze([2, 3] as const),
  camHeightVoxels: Object.freeze([1] as const),
  hammerRightArmLengthVoxels: Object.freeze([3, 4, 5] as const),
  hammerHeadHeightVoxels: Object.freeze([1, 2, 3] as const),
  initialHeadAnvilClearanceVoxels: Object.freeze([0] as const),
});

/**
 * The first X column beyond every candidate cam nose. The follower changes
 * elevation here: an earlier elbow would enter the bounded cam envelope, while
 * a later one would add raised link cells after the contact envelope has ended.
 */
export const WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1 =
  Math.max(...WINDMILL_COMPACT_PARAMETER_RANGES_V1.camRadialLengthVoxels) + 1;

export function windmillCompactParameterKeyV1(
  parameters: WindmillCompactParametersV1,
): string {
  return [
    `r${String(parameters.rotorRadiusVoxels)}`,
    `g${String(parameters.groundClearanceVoxels)}`,
    `s${String(parameters.sailRadialSpanVoxels)}`,
    `c${String(parameters.camRadialLengthVoxels)}x${String(parameters.camHeightVoxels)}`,
    `a${String(parameters.hammerRightArmLengthVoxels)}`,
    `h${String(parameters.hammerHeadHeightVoxels)}`,
    `q${String(parameters.initialHeadAnvilClearanceVoxels)}`,
  ].join('-');
}
