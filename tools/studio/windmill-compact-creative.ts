import type { GenomeColorV1 } from './model.js';
import type { PartStepV1 } from './recipe.js';
import {
  createWindmillCompactCandidateV1,
  WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1,
  type WindmillCompactAssetKeyV1, type WindmillCompactAssetV1, type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactMaterialProfileV1, type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_ROLE_COLORS_V1,
  windmillCompactAppearancePurposeV1,
  windmillCompactBoxRuleV1,
  type WindmillCompactAppearancePurposeV1,
  type WindmillCompactRoleColorV1,
} from './windmill-compact-accountability.js';
import {
  WINDMILL_COMPACT_PURPOSE_NEEDS_V1,
} from './windmill-compact-purpose-needs.js';
export {
  WINDMILL_COMPACT_ROLE_COLORS_V1,
} from './windmill-compact-accountability.js';
export type {
  WindmillCompactAppearancePurposeV1,
  WindmillCompactRoleColorV1,
} from './windmill-compact-accountability.js';
export const WINDMILL_COMPACT_CREATIVE_SCHEMA_V1 = 'studio.windmill-compact-creative/1' as const;
export interface WindmillCompactBoxPurposeV1 {
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly minimumForm: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
  readonly selectedDynamicProof: null;
}
export interface WindmillCompactRecipeBoxInputV1 {
  readonly boxKey: string;
  readonly purposeId: WindmillCompactBoxV1['purposeId'];
  /** The candidate's mechanical role, preserved without palette reinterpretation. */
  readonly role: string;
  readonly materialProfile: WindmillCompactMaterialProfileV1;
  readonly recipeRole: string;
  readonly at: WindmillCompactTripleV1;
  readonly size: WindmillCompactTripleV1;
  readonly step: PartStepV1;
  readonly purpose: WindmillCompactBoxPurposeV1;
  readonly appearance: WindmillCompactAppearancePurposeV1;
}
export interface WindmillCompactScenePlacementDatumV1 {
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly grainWorldUnits: number;
  /** A ScenePlacementV1 `at`; Scene Build adds `groundLiftWorldUnits` to Y. */
  readonly at: WindmillCompactTripleV1;
  readonly turns: 0;
  readonly groundLiftWorldUnits: number;
  readonly authoredBodyWorld: WindmillCompactTripleV1;
  readonly presentedBodyWorld: WindmillCompactTripleV1;
}
export interface WindmillCompactCreativeAssetV1 {
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly sizeVoxels: WindmillCompactTripleV1;
  readonly voxelSize: number;
  readonly roles: readonly string[];
  readonly palette: readonly GenomeColorV1[];
  readonly boxes: readonly WindmillCompactRecipeBoxInputV1[];
  readonly scenePlacement: WindmillCompactScenePlacementDatumV1;
}
export interface WindmillCompactCreativeV1 {
  readonly schema: typeof WINDMILL_COMPACT_CREATIVE_SCHEMA_V1;
  readonly candidateGeometryFingerprint: WindmillCompactCandidateV1['geometryFingerprint'];
  readonly parameterKey: string;
  readonly roleColors: readonly WindmillCompactRoleColorV1[];
  readonly assets: Readonly<Record<WindmillCompactAssetKeyV1,
  WindmillCompactCreativeAssetV1>>;
  readonly boxCount: number;
}
const COLOR_BY_ROLE = new Map(WINDMILL_COMPACT_ROLE_COLORS_V1
  .map((entry) => [entry.role, entry]));
function triple(
  x: number,
  y: number,
  z: number,
): WindmillCompactTripleV1 {
  return Object.freeze([x, y, z]);
}
function add(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return triple(left[0] + right[0], left[1] + right[1], left[2] + right[2]);
}
function scale(
  value: WindmillCompactTripleV1,
  factor: number,
): WindmillCompactTripleV1 {
  return triple(value[0] * factor, value[1] * factor, value[2] * factor);
}
function volume(box: WindmillCompactBoxV1): number {
  return box.size[0] * box.size[1] * box.size[2];
}
function worldBoxFor(
  candidate: WindmillCompactCandidateV1,
  boxKey: string,
): Pick<WindmillCompactBoxV1, 'at' | 'size'> {
  for (const asset of Object.values(candidate.assets)) {
    const box = asset.boxes.find((entry) => entry.key === boxKey);
    if (box !== undefined) {
      return Object.freeze({
        at: add(asset.worldOriginVoxels, box.at),
        size: box.size,
      });
    }
  }
  throw new Error(
    `Cannot derive compact windmill contact datum: contact box '${boxKey}' `
    + 'does not exist in the candidate assets.',
  );
}
function contactAlignmentFor(
  candidate: WindmillCompactCandidateV1,
  participantKeys: readonly string[],
): string {
  const boxes = participantKeys.map((key) => worldBoxFor(candidate, key));
  const first = boxes[0];
  if (first === undefined) {
    throw new Error(
      'Cannot derive compact windmill contact datum: the contact group has no participants.',
    );
  }
  const axisNames = ['x', 'y', 'z'] as const;
  const aligned = axisNames.flatMap((name, axis) =>
    boxes.every((box) => box.at[axis] === first.at[axis]
      && box.size[axis] === first.size[axis])
      ? [`${name}=[${String(first.at[axis])},`
        + `${String(first.at[axis]! + first.size[axis]!)})`]
      : []);
  return aligned.length === 0
    ? 'no exact common world-axis interval'
    : `aligned world-axis interval(s) ${aligned.join(', ')}`;
}
function cellKeys(box: Pick<WindmillCompactBoxV1, 'at' | 'size'>):
readonly string[] {
  const keys: string[] = [];
  for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
    for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
      for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
        keys.push(`${String(x)},${String(y)},${String(z)}`);
      }
    }
  }
  return keys;
}
function assertExactAssetUnion(asset: WindmillCompactAssetV1): void {
  const authored = asset.boxes.flatMap(cellKeys);
  const authoredSet = new Set(authored);
  const occupied = asset.occupiedCells.map((cell) => cell.join(','));
  const occupiedSet = new Set(occupied);
  if (authoredSet.size !== authored.length) {
    throw new Error(
      `Cannot adapt compact windmill '${asset.key}': candidate boxes overlap; `
      + 'each visible voxel must belong to exactly one purpose-led step.',
    );
  }
  const missing = occupied.filter((key) => !authoredSet.has(key));
  const extra = authored.filter((key) => !occupiedSet.has(key));
  if (authored.length !== occupied.length || missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Cannot adapt compact windmill '${asset.key}': box union has `
      + `${String(authored.length)} cells but occupiedCells has `
      + `${String(occupied.length)}; missing [${missing.join('; ')}], `
      + `extra [${extra.join('; ')}]. Regenerate the candidate from one geometry source.`,
    );
  }
}
function purposeFor(
  candidate: WindmillCompactCandidateV1,
  asset: WindmillCompactAssetV1,
  box: WindmillCompactBoxV1,
): WindmillCompactBoxPurposeV1 {
  const need = WINDMILL_COMPACT_PURPOSE_NEEDS_V1[box.purposeId];
  if (need === undefined) {
    throw new Error(
      `Cannot adapt compact windmill box '${box.key}': purpose `
      + `'${box.purposeId}' has no beneficiary, job, minimum-form, and `
      + 'honesty-boundary record. Add the purpose before rendering the box.',
    );
  }
  const boxRule = windmillCompactBoxRuleV1(box);
  const worldAt = add(asset.worldOriginVoxels, box.at);
  const worldMax = add(worldAt, box.size);
  const interfaces = candidate.requiredInterfaces.filter((entry) =>
    entry.fromBoxKey === box.key || entry.toBoxKey === box.key);
  const neighbors = interfaces.map((entry) =>
    entry.fromBoxKey === box.key ? entry.toBoxKey : entry.fromBoxKey);
  const contactGroups = candidate.intentionalContactGroups
    .filter((group) => group.firstBoxKeys.includes(box.key)
      || group.secondBoxKeys.includes(box.key));
  const contacts = contactGroups.map((group) => group.key);
  const contactAlignments = contactGroups.map((group) =>
    `${group.key} ${contactAlignmentFor(candidate, [
      ...group.firstBoxKeys,
      ...group.secondBoxKeys,
    ])}`);
  const interfaceEvidence = neighbors.length === 0
    ? 'no declared same-body face interface'
    : `face interface(s) with ${neighbors.join(', ')}`;
  const contactEvidence = contacts.length === 0
    ? 'no intentional contact role'
    : `intentional contact group(s) ${contacts.join(', ')}; `
      + contactAlignments.join('; ');
  const removedContact = contacts.length === 0 ? ''
    : ` Intentional contact group(s) ${contacts.join(', ')} lose their '${box.key}' participant.`;
  const movedContact = contacts.length === 0 ? ''
    : ` Moving off the current ${contactAlignments.join('; ')} breaks the authored static alignment; no alternate datum is evidenced here.`;
  return Object.freeze({
    beneficiary: boxRule.beneficiary,
    job: boxRule.job,
    locationDatum:
      `Box '${box.key}' in asset '${asset.key}' is local `
      + `[${box.at.join(',')}] size `
      + `[${box.size.join(',')}], authored world [${worldAt.join(',')}]..`
      + `[${worldMax.join(',')}); ${interfaceEvidence}; ${contactEvidence}.`,
    removalFailure:
      `Removing '${box.key}' deletes its ${String(volume(box))}-voxel `
      + `disjoint scope. ${boxRule.removalConsequence} `
      + `Original face-interface endpoint(s) [${neighbors.join(', ')}] disappear.`
      + removedContact,
    relocationFailure:
      `Moving '${box.key}' by the tested rule delta `
      + `[${boxRule.relocationDelta.join(',')}] changes its authored datum. `
      + `${boxRule.relocationConsequence} Original face interface(s) `
      + `[${neighbors.join(', ')}] must be recomputed.`
      + movedContact,
    minimumForm:
      `${boxRule.minimumForm} This exact box is ${box.size.join('x')} `
      + `(${String(volume(box))} voxels).`,
    evidence:
      `Candidate '${candidate.parameterKey}' geometry `
      + `${candidate.geometryFingerprint}; accountability rule `
      + `'${boxRule.ruleId}'; exact box '${box.key}'; `
      + `${interfaceEvidence}; ${contactEvidence}.`,
    honestyBoundary: need.honestyBoundary,
    selectedDynamicProof: null,
  });
}
function placementFor(
  candidate: WindmillCompactCandidateV1,
  asset: WindmillCompactAssetV1,
): WindmillCompactScenePlacementDatumV1 {
  const authoredBodyWorld = scale(asset.bodyWorldVoxels, candidate.grainMeters);
  const groundLiftWorldUnits =
    asset.sizeVoxels[1] * candidate.grainMeters / 2;
  const at = triple(
    authoredBodyWorld[0],
    authoredBodyWorld[1] - groundLiftWorldUnits,
    authoredBodyWorld[2],
  );
  return Object.freeze({
    assetKey: asset.key,
    grainWorldUnits: candidate.grainMeters,
    at,
    turns: 0,
    groundLiftWorldUnits,
    authoredBodyWorld,
    presentedBodyWorld: triple(
      at[0],
      at[1] + groundLiftWorldUnits,
      at[2],
    ),
  });
}
function adaptAsset(
  candidate: WindmillCompactCandidateV1,
  asset: WindmillCompactAssetV1,
  seenBoxKeys: Set<string>,
): WindmillCompactCreativeAssetV1 {
  assertExactAssetUnion(asset);
  const boxes = asset.boxes.map((box) => {
    if (box.bodyKey !== asset.key || seenBoxKeys.has(box.key)) {
      throw new Error(
        `Cannot adapt compact windmill box '${box.key}': bodyKey `
        + `'${box.bodyKey}' does not uniquely belong to asset '${asset.key}'.`,
      );
    }
    seenBoxKeys.add(box.key);
    const color = COLOR_BY_ROLE.get(box.role);
    if (color === undefined) {
      throw new Error(
        `Cannot adapt compact windmill box '${box.key}': semantic role `
        + `'${box.role}' has no mechanically legible color binding.`,
      );
    }
    const at = triple(...box.at);
    const size = triple(...box.size);
    const step: PartStepV1 = Object.freeze({
      kind: 'part',
      part: 'box',
      at,
      settings: Object.freeze({
        sizeX: size[0],
        sizeY: size[1],
        sizeZ: size[2],
        role: box.role,
      }),
      note: `Preserves ${box.key}: ${box.role}.`,
    });
    return Object.freeze({
      boxKey: box.key,
      purposeId: box.purposeId,
      role: box.role,
      materialProfile: box.materialProfile,
      recipeRole: box.role,
      at,
      size,
      step,
      purpose: purposeFor(candidate, asset, box),
      appearance: windmillCompactAppearancePurposeV1(candidate, asset, box),
    });
  });
  const usedRoles = new Set(boxes.map((box) => box.role));
  const colors = WINDMILL_COMPACT_ROLE_COLORS_V1.filter((entry) =>
    usedRoles.has(entry.role));
  return Object.freeze({
    assetKey: asset.key,
    sizeVoxels: triple(...asset.sizeVoxels),
    voxelSize: candidate.grainMeters,
    roles: Object.freeze(['empty', ...colors.map((entry) => entry.role)]),
    palette: Object.freeze([
      Object.freeze({ r: 0, g: 0, b: 0 }),
      ...colors.map((entry) => entry.color),
    ]),
    boxes: Object.freeze(boxes),
    scenePlacement: placementFor(candidate, asset),
  });
}
export function createWindmillCompactCreativeV1(candidate: WindmillCompactCandidateV1): WindmillCompactCreativeV1 {
  const receivedSchema: unknown = (candidate as { readonly schema?: unknown }).schema;
  if (receivedSchema !== WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1) {
    throw new Error(
      `Cannot adapt compact windmill schema '${String(receivedSchema)}'; `
      + `expected '${WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1}'.`,
    );
  }
  const canonical = createWindmillCompactCandidateV1(candidate.parameters);
  if (JSON.stringify(candidate) !== JSON.stringify(canonical)) {
    throw new Error(
      `Cannot adapt compact windmill '${candidate.parameterKey}': supplied `
      + 'candidate does not exactly match the canonical parameterized generator. '
      + 'Regenerate it before deriving visible purpose or placement evidence.',
    );
  }
  const seenBoxKeys = new Set<string>();
  const assets = Object.freeze({
    frame: adaptAsset(candidate, candidate.assets.frame, seenBoxKeys),
    rotor: adaptAsset(candidate, candidate.assets.rotor, seenBoxKeys),
    hammer: adaptAsset(candidate, candidate.assets.hammer, seenBoxKeys),
    anvil: adaptAsset(candidate, candidate.assets.anvil, seenBoxKeys),
  });
  const candidateBoxCount = Object.values(candidate.assets)
    .reduce((sum, asset) => sum + asset.boxes.length, 0);
  if (seenBoxKeys.size !== candidateBoxCount) {
    throw new Error(
      `Cannot adapt compact windmill: ${String(seenBoxKeys.size)} unique `
      + `purpose-led inputs cover ${String(candidateBoxCount)} candidate boxes.`,
    );
  }
  const usedRoles = new Set(
    Object.values(candidate.assets).flatMap((asset) =>
      asset.boxes.map((box) => box.role)),
  );
  const roleColors = WINDMILL_COMPACT_ROLE_COLORS_V1.filter((entry) =>
    usedRoles.has(entry.role));
  return Object.freeze({
    schema: WINDMILL_COMPACT_CREATIVE_SCHEMA_V1,
    candidateGeometryFingerprint: candidate.geometryFingerprint,
    parameterKey: candidate.parameterKey,
    roleColors: Object.freeze(roleColors),
    assets,
    boxCount: candidateBoxCount,
  });
}
