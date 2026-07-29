/** X is the lever direction, Y is up, and Z is the rotor/wind axis. */
import {
  WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1,
  WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1,
  WINDMILL_COMPACT_GRAIN_METERS,
  WINDMILL_DEFAULT_COMPACT_PARAMETERS_V1,
  windmillCompactParameterKeyV1,
  type WindmillCompactAssetKeyV1,
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactCollisionRoleV1,
  type WindmillCompactMaterialProfileV1,
  type WindmillCompactParametersV1,
  type WindmillCompactPortV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry-contract.js';
import {
  assertNoWindmillOpeningVoxelOverlapV1,
  validateWindmillCompactParametersV1,
  windmillCompactRequiredInterfacesV1,
  windmillCompactSailFrameV1,
} from './windmill-compact-geometry-evidence.js';
import {
  subtractWindmillCompactTripleV1 as subtract,
  windmillCompactFnv1a64V1 as fnv1a64,
  windmillCompactTripleV1 as triple,
} from './windmill-compact-geometry-math.js';

export * from './windmill-compact-geometry-contract.js';

interface WorldBoxV1 extends Omit<WindmillCompactBoxV1, 'at'> {
  readonly at: WindmillCompactTripleV1; }

function addBox(
  target: WorldBoxV1[],
  assetKey: WindmillCompactAssetKeyV1,
  key: string,
  purpose: string,
  role: string,
  at: WindmillCompactTripleV1,
  size: WindmillCompactTripleV1,
  materialProfile: WindmillCompactMaterialProfileV1,
  collisionRole: WindmillCompactCollisionRoleV1 = 'inert-solid',
): void {
  if (size.some((value) => !Number.isSafeInteger(value) || value <= 0)
    || at.some((value) => !Number.isSafeInteger(value))) {
    throw new Error(
      `Cannot author compact windmill box '${key}': at/size must be finite `
      + 'integer voxel coordinates and every size must be positive.',
    );
  }
  target.push(Object.freeze({
    key,
    purposeId: `windmill:purpose:${purpose}`,
    role,
    at,
    size,
    bodyKey: assetKey,
    materialProfile,
    collisionRole,
  }));
}

function cellsOf(box: WorldBoxV1): WindmillCompactTripleV1[] {
  const cells: WindmillCompactTripleV1[] = [];
  for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
    for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
      for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
        cells.push(triple(x, y, z));
      }
    }
  }
  return cells;
}

function boundsOfCells(cells: readonly WindmillCompactTripleV1[]): {
  readonly min: WindmillCompactTripleV1;
  readonly maxExclusive: WindmillCompactTripleV1;
} {
  if (cells.length === 0) {
    throw new Error('Cannot normalize an empty compact windmill asset.');
  }
  return {
    min: triple(
      Math.min(...cells.map((cell) => cell[0])),
      Math.min(...cells.map((cell) => cell[1])),
      Math.min(...cells.map((cell) => cell[2])),
    ),
    maxExclusive: triple(
      Math.max(...cells.map((cell) => cell[0])) + 1,
      Math.max(...cells.map((cell) => cell[1])) + 1,
      Math.max(...cells.map((cell) => cell[2])) + 1,
    ),
  };
}

function normalizeAsset(
  key: WindmillCompactAssetKeyV1,
  dynamic: boolean,
  worldBoxes: readonly WorldBoxV1[],
): WindmillCompactAssetV1 {
  const seen = new Set<string>();
  const worldCells = worldBoxes.flatMap(cellsOf);
  worldCells.forEach((cell) => {
    const cellKey = cell.join(',');
    if (seen.has(cellKey)) {
      throw new Error(
        `Cannot author compact windmill '${key}': visible boxes overlap at `
        + `world voxel [${cellKey}]. Split the purposes into disjoint boxes.`,
      );
    }
    seen.add(cellKey);
  });
  const bounds = boundsOfCells(worldCells);
  const size = triple(
    bounds.maxExclusive[0] - bounds.min[0],
    bounds.maxExclusive[1] - bounds.min[1],
    bounds.maxExclusive[2] - bounds.min[2],
  );
  const origin = triple(size[0] / 2, size[1] / 2, size[2] / 2);
  const bodyWorld = triple(
    bounds.min[0] + origin[0],
    bounds.min[1] + origin[1],
    bounds.min[2] + origin[2],
  );
  const local = (value: WindmillCompactTripleV1) => triple(
    value[0] - bounds.min[0],
    value[1] - bounds.min[1],
    value[2] - bounds.min[2],
  );
  const occupiedCells = Object.freeze(worldCells.map(local).sort((left, right) =>
    left[2] - right[2] || left[1] - right[1] || left[0] - right[0]));
  return Object.freeze({
    key,
    bodyKey: key,
    dynamic,
    worldOriginVoxels: bounds.min,
    sizeVoxels: size,
    bodyOriginVoxels: origin,
    bodyWorldVoxels: bodyWorld,
    boxes: Object.freeze(worldBoxes.map((box) => Object.freeze({
      ...box,
      at: local(box.at),
    }))),
    occupiedCells,
    occupiedVoxelCount: occupiedCells.length,
  });
}

function buildWorldBoxes(parameters: WindmillCompactParametersV1): Readonly<
Record<WindmillCompactAssetKeyV1, readonly WorldBoxV1[]>> {
  const frame: WorldBoxV1[] = [];
  const rotor: WorldBoxV1[] = [];
  const hammer: WorldBoxV1[] = [];
  const anvil: WorldBoxV1[] = [];
  const axisY = parameters.rotorRadiusVoxels
    + parameters.groundClearanceVoxels;
  const pivotX = 7;
  const pivotY = axisY - 3;
  const ring = (
    z: number,
    prefix: string,
    centerX: number,
    centerY: number,
  ) => {
    addBox(frame, 'frame', `${prefix}-left-post`, `${prefix}-support`,
      'bearing-frame', triple(centerX - 2, 0, z),
      triple(1, centerY + 3, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-right-post`, `${prefix}-support`,
      'bearing-frame', triple(centerX + 2, 0, z),
      triple(1, centerY + 3, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-cap`, `${prefix}-support`,
      'bearing-block', triple(centerX - 1, centerY + 2, z),
      triple(3, 1, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-saddle`, `${prefix}-support`,
      'bearing-block', triple(centerX - 1, centerY - 2, z),
      triple(3, 1, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-lower-left-liner`, `${prefix}-support`,
      'bearing-liner', triple(centerX - 1, centerY - 1, z),
      triple(1, 1, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-lower-right-liner`, `${prefix}-support`,
      'bearing-liner', triple(centerX + 1, centerY - 1, z),
      triple(1, 1, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-upper-left-liner`, `${prefix}-support`,
      'bearing-liner', triple(centerX - 1, centerY + 1, z),
      triple(1, 1, 1), 'fixedSupport');
    addBox(frame, 'frame', `${prefix}-upper-right-liner`, `${prefix}-support`,
      'bearing-liner', triple(centerX + 1, centerY + 1, z),
      triple(1, 1, 1), 'fixedSupport');
  };
  ring(-2, 'rotor-front-bearing', 0, axisY);
  ring(3, 'rotor-rear-bearing', 0, axisY);
  addBox(frame, 'frame', 'rotor-bearing-ground-tie',
    'rotor-bearing-ground-tie', 'foundation', triple(-2, 0, -1),
    triple(1, 1, 4), 'fixedSupport');
  ring(9, 'hammer-rear-bearing', pivotX, pivotY);
  addBox(frame, 'frame', 'rotor-to-hammer-ground-x',
    'rotor-hammer-ground-tie', 'foundation', triple(-2, 0, 9),
    triple(7, 1, 1), 'fixedSupport');
  addBox(frame, 'frame', 'rotor-to-hammer-ground-z',
    'rotor-hammer-ground-tie', 'foundation', triple(-2, 0, 4),
    triple(1, 1, 5), 'fixedSupport');

  addBox(rotor, 'rotor', 'rotor-shaft', 'continuous-rotor-shaft',
    'shaft', triple(0, axisY, -2), triple(1, 1, 9),
    'rotorShaft');
  addBox(rotor, 'rotor', 'rotor-thrust-collar-west',
    'rear-thrust-shoulder', 'bearing-collar', triple(-2, axisY, 4),
    triple(2, 1, 1), 'rotorCollar');
  addBox(rotor, 'rotor', 'rotor-thrust-collar-east',
    'rear-thrust-shoulder', 'bearing-collar', triple(1, axisY, 4),
    triple(2, 1, 1), 'rotorCollar');
  const innerRadius = parameters.rotorRadiusVoxels
    - parameters.sailRadialSpanVoxels + 1;
  if (innerRadius > 1) {
    addBox(rotor, 'rotor', 'north-spar', 'north-sail-load-path',
      'sail-spar', triple(0, axisY + 1, 0),
      triple(1, innerRadius - 1, 1), 'rotorCore');
    addBox(rotor, 'rotor', 'south-spar', 'south-sail-load-path',
      'sail-spar', triple(0, axisY - innerRadius + 1, 0),
      triple(1, innerRadius - 1, 1), 'rotorCore');
  }
  const northY = axisY + innerRadius;
  const southY = axisY - parameters.rotorRadiusVoxels;
  const span = parameters.sailRadialSpanVoxels;
  [
    ['north-panel-step-z0', 0, northY, 0],
    ['north-panel-step-z1', -1, northY, 1],
  ].forEach(([key, x, y, z]) => addBox(
    rotor, 'rotor', String(key), 'north-visible-pitched-panel',
    'sail-panel', triple(Number(x), Number(y), Number(z)),
    triple(2, span, 1), 'sail',
  ));
  [
    ['south-panel-step-z0', -1, southY, 0],
    ['south-panel-step-z1', 0, southY, 1],
  ].forEach(([key, x, y, z]) => addBox(
    rotor, 'rotor', String(key), 'south-visible-pitched-panel',
    'sail-panel', triple(Number(x), Number(y), Number(z)),
    triple(2, span, 1), 'sail',
  ));
  const camLength = parameters.camRadialLengthVoxels;
  addBox(rotor, 'rotor', 'rotor-cam-arm', 'primary-cam-torque-arm',
    'cam-arm', triple(1, axisY, 6),
    triple(camLength - 1, 1, 1), 'cam');
  addBox(rotor, 'rotor', 'rotor-cam-nose', 'primary-cam-contact-nose',
    'cam-contact', triple(camLength, axisY, 6),
    triple(1, 1, 1), 'cam', 'cam');
  addBox(rotor, 'rotor', 'rotor-opposed-cam-arm',
    'opposed-cam-torque-arm', 'cam-arm',
    triple(1 - camLength, axisY, 6),
    triple(camLength - 1, 1, 1), 'cam');
  addBox(rotor, 'rotor', 'rotor-opposed-cam-nose',
    'opposed-cam-contact-nose', 'cam-contact',
    triple(-camLength, axisY, 6),
    triple(1, 1, 1), 'cam', 'cam');

  addBox(hammer, 'hammer', 'hammer-pivot-core',
    'continuous-hammer-journal', 'hammer-pivot',
    triple(pivotX, pivotY, 6), triple(1, 1, 5), 'hammerPivot');
  addBox(hammer, 'hammer', 'hammer-collar-west',
    'rear-hammer-shoulder', 'bearing-collar',
    triple(pivotX - 2, pivotY, 10), triple(2, 1, 1),
    'hammerCollar');
  addBox(hammer, 'hammer', 'hammer-collar-east',
    'rear-hammer-shoulder', 'bearing-collar',
    triple(pivotX + 1, pivotY, 10), triple(2, 1, 1),
    'hammerCollar');
  addBox(hammer, 'hammer', 'hammer-follower-shoe',
    'cam-follower-contact-participant', 'hammer-follower',
    triple(camLength, pivotY + 1, 6), triple(1, 1, 1),
    'hammerFollower', 'follower');
  addBox(hammer, 'hammer', 'hammer-follower-upper-link',
    'follower-to-pivot-load-path', 'hammer-beam',
    triple(camLength + 1, pivotY + 1, 6),
    triple(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1 - camLength, 1, 1),
    'hammerBeam');
  addBox(hammer, 'hammer', 'hammer-follower-lower-link',
    'follower-to-pivot-load-path', 'hammer-beam',
    triple(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1, pivotY, 6),
    triple(pivotX - WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1, 1, 1),
    'hammerBeam');
  addBox(hammer, 'hammer', 'hammer-right-beam',
    'pivot-to-head-load-path', 'hammer-beam',
    triple(8, pivotY, 6),
    triple(parameters.hammerRightArmLengthVoxels, 1, 1),
    'hammerBeam');
  const headX = 8 + parameters.hammerRightArmLengthVoxels;
  const headBottomY = pivotY
    - parameters.hammerHeadHeightVoxels + 1;
  addBox(hammer, 'hammer', 'hammer-impact-toe', 'hammer-impact-toe',
    'impact-toe', triple(headX, headBottomY, 6),
    triple(1, 1, 1), 'hammerHead', 'hammer-head');
  if (parameters.hammerHeadHeightVoxels > 1) {
    addBox(hammer, 'hammer', 'hammer-head-mass',
      'hammer-head-return-mass',
      'impact-head-mass', triple(headX, headBottomY + 1, 6),
      triple(1, parameters.hammerHeadHeightVoxels - 1, 1),
      'hammerHead');
  }
  const faceY = headBottomY
    - parameters.initialHeadAnvilClearanceVoxels - 1;
  if (faceY < 0) {
    throw new Error(
      `Cannot author compact windmill '${windmillCompactParameterKeyV1(parameters)}': `
      + `head bottom y=${String(headBottomY)} with `
      + `${String(parameters.initialHeadAnvilClearanceVoxels)}-voxel `
      + 'clearance puts the direct-ground anvil face below y=0.',
    );
  }
  if (faceY > 0) {
    addBox(anvil, 'anvil', 'anvil-column',
      'direct-ground-impact-reaction', 'anvil-waist',
      triple(headX, 0, 6), triple(1, faceY, 1), 'anvil');
  }
  addBox(anvil, 'anvil', 'anvil-impact-cap',
    'hammer-contact-witness-face', 'impact-face',
    triple(headX, faceY, 6), triple(1, 1, 1),
    'anvil', 'anvil-face');
  return Object.freeze({ frame, rotor, hammer, anvil });
}

export function createWindmillCompactCandidateV1(
  parameters: WindmillCompactParametersV1 =
    WINDMILL_DEFAULT_COMPACT_PARAMETERS_V1,
): WindmillCompactCandidateV1 {
  validateWindmillCompactParametersV1(parameters);
  const worldBoxes = buildWorldBoxes(parameters);
  const assets = Object.freeze({
    frame: normalizeAsset('frame', false, worldBoxes.frame),
    rotor: normalizeAsset('rotor', true, worldBoxes.rotor),
    hammer: normalizeAsset('hammer', true, worldBoxes.hammer),
    anvil: normalizeAsset('anvil', false, worldBoxes.anvil),
  });
  const axisY = parameters.rotorRadiusVoxels
    + parameters.groundClearanceVoxels;
  const pivotWorld = triple(7.5, axisY - 2.5, 9.5);
  const rotorAxisWorld = triple(0.5, axisY + 0.5, 0.5);
  const port = (
    key: string,
    assetKey: WindmillCompactAssetKeyV1,
    world: WindmillCompactTripleV1,
    axisUnit?: WindmillCompactTripleV1,
  ): WindmillCompactPortV1 => Object.freeze({
    key,
    assetKey,
    bodyKey: assetKey,
    positionVoxels: subtract(world, assets[assetKey].bodyWorldVoxels),
    worldPositionVoxels: world,
    ...(axisUnit === undefined ? {} : { axisUnit }),
  });
  const sails = Object.freeze([
    windmillCompactSailFrameV1('north-sail', assets.rotor, rotorAxisWorld),
    windmillCompactSailFrameV1('south-sail', assets.rotor, rotorAxisWorld),
  ] as const);
  const ports = Object.freeze([
    port('frame-rotor-axis', 'frame', rotorAxisWorld, triple(0, 0, 1)),
    port('rotor-axis', 'rotor', rotorAxisWorld, triple(0, 0, 1)),
    port('rotor-front-bearing', 'frame',
      triple(0.5, axisY + 0.5, -1.5), triple(0, 0, 1)),
    port('rotor-rear-bearing', 'frame',
      triple(0.5, axisY + 0.5, 3.5), triple(0, 0, 1)),
    port('frame-hammer-axis', 'frame', pivotWorld, triple(0, 0, 1)),
    port('hammer-axis', 'hammer', pivotWorld, triple(0, 0, 1)),
    ...sails.map((sail) => port(
      `${sail.key}-load`,
      'rotor',
      triple(
        sail.localCentroidVoxels[0] + assets.rotor.bodyWorldVoxels[0],
        sail.localCentroidVoxels[1] + assets.rotor.bodyWorldVoxels[1],
        sail.localCentroidVoxels[2] + assets.rotor.bodyWorldVoxels[2],
      ),
      sail.localNormalUnit,
    )),
  ]);
  const requiredInterfaces = windmillCompactRequiredInterfacesV1(
    parameters,
    assets,
  );
  const openingOverlapCellCount = assertNoWindmillOpeningVoxelOverlapV1(assets);
  const boxesByCollision = (
    asset: WindmillCompactAssetV1,
    role: WindmillCompactCollisionRoleV1,
  ) => Object.freeze(asset.boxes.filter((box) =>
    box.collisionRole === role).map((box) => box.key));
  const intentionalContactGroups = Object.freeze([
    Object.freeze({
      key: 'cam-follower' as const,
      firstBoxKeys: boxesByCollision(assets.rotor, 'cam'),
      secondBoxKeys: boxesByCollision(assets.hammer, 'follower'),
    }),
    Object.freeze({
      key: 'head-anvil' as const,
      firstBoxKeys: boxesByCollision(assets.hammer, 'hammer-head'),
      secondBoxKeys: boxesByCollision(assets.anvil, 'anvil-face'),
    }),
  ]);
  const allWorldCells = Object.values(assets)
    .flatMap((asset) => asset.occupiedCells.map((cell) => triple(
      cell[0] + asset.worldOriginVoxels[0],
      cell[1] + asset.worldOriginVoxels[1],
      cell[2] + asset.worldOriginVoxels[2],
    )));
  const sceneBounds = boundsOfCells(allWorldCells);
  const envelope = triple(
    sceneBounds.maxExclusive[0] - sceneBounds.min[0],
    sceneBounds.maxExclusive[1] - sceneBounds.min[1],
    sceneBounds.maxExclusive[2] - sceneBounds.min[2],
  );
  const total = Object.values(assets).reduce(
    (sum, asset) => sum + asset.occupiedVoxelCount, 0);
  const dynamic = assets.rotor.occupiedVoxelCount
    + assets.hammer.occupiedVoxelCount;
  const withoutFingerprint = {
    schema: WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1,
    grainMeters: WINDMILL_COMPACT_GRAIN_METERS,
    parameters: Object.freeze({ ...parameters }),
    parameterKey: windmillCompactParameterKeyV1(parameters),
    assets,
    ports,
    sails,
    requiredInterfaces,
    intentionalContactGroups,
    totalOccupiedVoxels: total,
    dynamicOccupiedVoxels: dynamic,
    openingOverlapCellCount,
    sceneWorldMinVoxels: sceneBounds.min,
    sceneWorldMaxExclusiveVoxels: sceneBounds.maxExclusive,
    sceneEnvelopeVoxels: envelope,
  };
  return Object.freeze({
    ...withoutFingerprint,
    geometryFingerprint: fnv1a64(JSON.stringify(withoutFingerprint)),
  });
}
