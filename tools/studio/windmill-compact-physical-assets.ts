import {
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  validatePhysicalAssetV1,
  type PhysicalAssetBookV1,
  type PhysicalAssetV1,
  type PhysicalBodyV1,
  type PhysicalColliderV1,
  type PhysicalPortV1,
} from './physical-asset.js';
import {
  type WindmillCompactAssetKeyV1,
  type WindmillCompactAssetV1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactPortV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  assertWindmillCompactCanonicalCandidateV1,
  assertWindmillCompactPhysicalDeclarationV1,
  type WindmillCompactMaterialDeclarationV1,
  type WindmillCompactPhysicalDeclarationV1,
} from './windmill-compact-physical-declaration.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';

export {
  WINDMILL_COMPACT_BODY_DYNAMICS_V1,
  WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1,
  WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
} from './windmill-compact-physical-declaration.js';
export type {
  WindmillCompactDynamicBodyDeclarationV1,
  WindmillCompactMaterialDeclarationV1,
  WindmillCompactPhysicalDeclarationV1,
} from './windmill-compact-physical-declaration.js';

export const WINDMILL_COMPACT_PHYSICAL_ASSET_SET_SCHEMA_V1 = 'studio.windmill-compact-physical-asset-set/1' as const;

export interface WindmillCompactPhysicalAssetSetV1 {
  readonly schema: typeof WINDMILL_COMPACT_PHYSICAL_ASSET_SET_SCHEMA_V1;
  readonly candidateGeometryFingerprint: WindmillCompactCandidateV1['geometryFingerprint'];
  readonly parameterKey: string;
  readonly physicalAssets: readonly [PhysicalAssetV1, PhysicalAssetV1, PhysicalAssetV1, PhysicalAssetV1];
  /** Collider indices are local to the sidecar identified by recipe id. */
  readonly colliderIndexByBoxKey: Readonly<Record<
    WindmillRecipeIdV1,
    Readonly<Record<string, number>>
  >>;
  readonly physicalAssetBook: PhysicalAssetBookV1;
}
const ASSET_KEYS = Object.freeze(['frame', 'rotor', 'hammer', 'anvil'] as const);

function triple(x: number, y: number, z: number): WindmillCompactTripleV1 {
  return Object.freeze([x, y, z]);
}
/** Rotates a port frame's local +Z axis onto the candidate axis. */
function axisRotation(axis: WindmillCompactTripleV1 | undefined):
readonly [number, number, number, number] | undefined {
  if (axis === undefined) return undefined;
  if (1 + axis[2] <= Number.EPSILON) {
    return Object.freeze([1, 0, 0, 0] as const);
  }
  const quaternion = [
    axis[1] === 0 ? 0 : -axis[1],
    axis[0] === 0 ? 0 : axis[0],
    0,
    1 + axis[2],
  ] as const;
  const length = Math.hypot(...quaternion);
  return Object.freeze([
    quaternion[0] / length,
    quaternion[1] / length,
    0,
    quaternion[3] / length,
  ] as const);
}

function boxCollider(
  body: string,
  bodyOrigin: WindmillCompactTripleV1,
  box: WindmillCompactBoxV1,
  material: WindmillCompactMaterialDeclarationV1,
): PhysicalColliderV1 {
  const density = material.densityKilogramsPerVoxelCube;
  return Object.freeze({
    body,
    shape: Object.freeze({
      kind: 'box' as const,
      halfExtents: triple(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2),
    }),
    pose: Object.freeze({
      position: triple(
        box.at[0] + box.size[0] / 2 - bodyOrigin[0],
        box.at[1] + box.size[1] / 2 - bodyOrigin[1],
        box.at[2] + box.size[2] / 2 - bodyOrigin[2],
      ),
    }),
    ...(density === null ? {} : { density }),
    friction: material.friction,
    restitution: material.restitution,
    role: 'solid' as const,
  });
}
function physicalPort(source: WindmillCompactPortV1, body: string): PhysicalPortV1 {
  const rotation = axisRotation(source.axisUnit);
  return Object.freeze({
    key: source.key,
    body,
    frame: Object.freeze({
      position: triple(...source.positionVoxels),
      ...(rotation === undefined ? {} : { rotation }),
    }),
  });
}
function bodyFor(asset: WindmillCompactAssetV1, declaration: WindmillCompactPhysicalDeclarationV1):
PhysicalBodyV1 {
  // PhysicalAssetV1 bodies are catalog/recipe-local. A consumer applies the
  // fixture placement once; this pose must not contain candidate bodyWorld.
  const pose = Object.freeze({ position: triple(...asset.bodyOriginVoxels) });
  if (!asset.dynamic) {
    return Object.freeze({ key: asset.bodyKey, type: 'fixed' as const, pose });
  }
  const dynamics = asset.key === 'rotor'
    ? declaration.dynamics.rotor
    : declaration.dynamics.hammer;
  return Object.freeze({
    key: asset.bodyKey,
    type: 'dynamic' as const,
    pose,
    linearDamping: dynamics.linearDamping,
    angularDamping: dynamics.angularDamping,
    gravityScale: dynamics.gravityScale,
    continuous: dynamics.continuous,
  });
}
function compileAsset(
  candidate: WindmillCompactCandidateV1,
  assetKey: WindmillCompactAssetKeyV1,
  declaration: WindmillCompactPhysicalDeclarationV1,
  seenBoxKeys: Set<string>,
  seenPortKeys: Set<string>,
): {
  readonly physicalAsset: PhysicalAssetV1;
  readonly colliderIndices: Readonly<Record<string, number>>;
} {
  const source = candidate.assets[assetKey];
  const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
  const indexEntries = source.boxes.map((box, colliderIndex) => {
    if (seenBoxKeys.has(box.key)) {
      throw new Error(
        `Cannot compile compact windmill physics: box key '${box.key}' `
        + `appears more than once; '${assetKey}' cannot own it uniquely.`,
      );
    }
    seenBoxKeys.add(box.key);
    return [box.key, colliderIndex] as const;
  });
  const colliderIndices = Object.freeze(Object.fromEntries(indexEntries));
  const colliders = Object.freeze(source.boxes.map((box) => {
    const material = declaration.materialProfiles[box.materialProfile];
    if (source.dynamic && material.densityKilogramsPerVoxelCube === null) {
      throw new Error(
        `Cannot compile compact windmill physics box '${box.key}': dynamic `
        + `asset '${assetKey}' requires `
        + `'${box.materialProfile}.densityKilogramsPerVoxelCube' above 0; `
        + 'null is only honest for fixed-body mass.',
      );
    }
    return boxCollider(
      source.bodyKey, source.bodyOriginVoxels, box, material,
    );
  }));
  const sourcePorts = candidate.ports.filter((port) =>
    port.assetKey === assetKey);
  const ports = Object.freeze(sourcePorts.map((port) => {
    if (port.bodyKey !== source.bodyKey || seenPortKeys.has(port.key)) {
      throw new Error(
        `Cannot compile compact windmill physics port '${port.key}': `
        + `body '${port.bodyKey}' does not uniquely belong to '${assetKey}'.`,
      );
    }
    seenPortKeys.add(port.key);
    return physicalPort(port, source.bodyKey);
  }));
  if (colliders.length !== source.boxes.length
    || Object.keys(colliderIndices).length !== source.boxes.length) {
    throw new Error(
      `Cannot compile compact windmill physics '${assetKey}': `
      + `${String(source.boxes.length)} visible boxes produced `
      + `${String(colliders.length)} colliders and `
      + `${String(Object.keys(colliderIndices).length)} unique mappings.`,
    );
  }
  if (ports.length !== sourcePorts.length) {
    throw new Error(
      `Cannot compile compact windmill physics '${assetKey}': `
      + `${String(sourcePorts.length)} candidate ports produced `
      + `${String(ports.length)} physical ports.`,
    );
  }
  const physicalAsset = Object.freeze({
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId,
    bodies: Object.freeze([bodyFor(source, declaration)]),
    colliders,
    // Cross-asset bearings and contacts belong to the consuming fixture.
    constraints: Object.freeze([]),
    ports,
  });
  const issues = validatePhysicalAssetV1(physicalAsset);
  if (issues.length > 0) {
    throw new Error(
      `Cannot compile compact windmill physics '${assetKey}': generated `
      + `sidecar is invalid: ${issues.map((issue) =>
        `${issue.path} ${issue.message}`).join('; ')}`,
    );
  }
  return Object.freeze({ physicalAsset, colliderIndices });
}
export function createWindmillCompactPhysicalAssetsV1(
  candidate: WindmillCompactCandidateV1,
  declaration: WindmillCompactPhysicalDeclarationV1,
): WindmillCompactPhysicalAssetSetV1 {
  assertWindmillCompactCanonicalCandidateV1(candidate);
  assertWindmillCompactPhysicalDeclarationV1(declaration);
  const seenBoxKeys = new Set<string>();
  const seenPortKeys = new Set<string>();
  const compiled = ASSET_KEYS.map((assetKey) => compileAsset(
    candidate, assetKey, declaration, seenBoxKeys, seenPortKeys,
  ));
  const expectedBoxCount = ASSET_KEYS.reduce(
    (sum, assetKey) => sum + candidate.assets[assetKey].boxes.length,
    0,
  );
  if (seenBoxKeys.size !== expectedBoxCount) {
    throw new Error(
      `Cannot compile compact windmill physics: ${String(seenBoxKeys.size)} `
      + `unique box mappings cover ${String(expectedBoxCount)} boxes.`,
    );
  }
  if (seenPortKeys.size !== candidate.ports.length) {
    throw new Error(
      `Cannot compile compact windmill physics: ${String(seenPortKeys.size)} `
      + `unique physical ports cover ${String(candidate.ports.length)} `
      + 'candidate ports.',
    );
  }
  const physicalAssets = Object.freeze(compiled.map((entry) =>
    entry.physicalAsset)) as WindmillCompactPhysicalAssetSetV1['physicalAssets'];
  const physicalAssetBook = Object.freeze(Object.fromEntries(
    physicalAssets.map((asset) => [asset.recipeId, asset]),
  ));
  if (Object.keys(physicalAssetBook).length !== ASSET_KEYS.length) {
    throw new Error(
      'Cannot compile compact windmill physics: stable recipe ids are not unique.',
    );
  }
  const colliderIndexByBoxKey = Object.freeze(Object.fromEntries(
    compiled.map((entry, index) => [
      WINDMILL_RECIPE_IDS_V1[ASSET_KEYS[index]!],
      entry.colliderIndices,
    ]),
  )) as WindmillCompactPhysicalAssetSetV1['colliderIndexByBoxKey'];
  return Object.freeze({
    schema: WINDMILL_COMPACT_PHYSICAL_ASSET_SET_SCHEMA_V1,
    candidateGeometryFingerprint: candidate.geometryFingerprint,
    parameterKey: candidate.parameterKey,
    physicalAssets,
    colliderIndexByBoxKey,
    physicalAssetBook,
  });
}
export function createWindmillCompactPhysicalAssetBookV1(candidate: WindmillCompactCandidateV1,
  declaration: WindmillCompactPhysicalDeclarationV1): PhysicalAssetBookV1 {
  return createWindmillCompactPhysicalAssetsV1(candidate, declaration).physicalAssetBook;
}
