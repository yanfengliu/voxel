import type { GenomeColorV1 } from './model.js';
import type {
  WindmillCompactAssetV1,
  WindmillCompactBoxV1,
  WindmillCompactCandidateV1,
  WindmillCompactMaterialProfileV1,
  WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import type {
  WindmillIntendedViewProofBindingV1,
} from './windmill-intended-view-proof.js';

export interface WindmillCompactAppearanceNeedV1 {
  readonly beneficiary: string;
  readonly job: string;
  readonly minimumBoundary: string;
  readonly honestyBoundary: string;
}

export interface WindmillCompactRoleColorV1 {
  readonly role: string;
  readonly colorGroup: string;
  readonly color: GenomeColorV1;
  readonly beneficiary: string;
  readonly job: string;
  readonly minimumForm: string;
  readonly intendedViewRequirement: string;
  readonly honestyBoundary: string;
}

export interface WindmillCompactAppearancePurposeV1 {
  readonly regionKey: string;
  readonly memberBoxKeys: readonly string[];
  readonly regionVoxelCount: number;
  readonly exposedFaceCount: number;
  readonly beneficiary: string;
  readonly job: string;
  readonly placementDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly minimumForm: string;
  readonly intendedViewEvidence: string;
  readonly intendedViewProof: WindmillIntendedViewProofBindingV1 | null;
  readonly representationInvariant: string;
  readonly honestyBoundary: string;
}

const appearance = (
  beneficiary: string,
  job: string,
  minimumBoundary: string,
): WindmillCompactAppearanceNeedV1 => Object.freeze({
  beneficiary,
  job,
  minimumBoundary: `${minimumBoundary} Face-connected boxes with the same `
    + 'role, color group, and material share one appearance region; their '
    + 'source-box seams are not boundaries.',
  honestyBoundary: 'Role and material are sidecar semantics; color contrast '
    + 'is geometry evidence only until fixed-camera inspection proves visibility.',
});

export const WINDMILL_COMPACT_ROLE_NEEDS_V1:
Readonly<Record<string, WindmillCompactAppearanceNeedV1>> = Object.freeze({
  foundation: appearance('A reader tracing fixed support to ground.', 'Identify only ground-contacting fixed-frame routes.', 'Only occupied grounded route voxels.'),
  'bearing-frame': appearance('A reader tracing the visible fixed route from each ideal revolute datum to ground.', 'Identify vertical support posts separately from ground ties.', 'Only post runs, ending at block and clearance-marker roles.'),
  'bearing-block': appearance('A reader locating each solver-owned journal axis.', 'Identify the cap and saddle that communicate its cardinal aperture bounds.', 'Only ideal-aperture cross-members.'),
  'bearing-liner': appearance('A reader locating the one-voxel clearance cross around an ideal revolute axis.', 'Identify the four diagonal corner markers that make the aperture contour legible without claiming contact.', 'Only the four one-cube visual quadrant markers per ring.'),
  'bearing-collar': appearance('A reader distinguishing the moving journal from the fixed ideal-joint aperture.', 'Identify the two mirrored moving shoulder arms and their balanced bilateral span.', 'Only moving shoulder voxels outside the journal core.'),
  shaft: appearance('A reader tracing rotor torque.', 'Identify the continuous rotor-axis core.', 'Only the attachment-bounded rotor-axis run.'),
  'hammer-pivot': appearance('A reader tracing the hammer constraint.', 'Identify the continuous hammer journal.', 'Only the attachment-bounded hammer-axis run.'),
  'sail-spar': appearance('A reader tracing panel-to-shaft structure.', 'Identify radial panel load paths.', 'Only the two radial gap-closing runs.'),
  'hammer-beam': appearance('A reader tracing the rigid hammer path.', 'Identify follower links and the right lever.', 'Only face-connected lever paths; cuboid seams are excluded.'),
  'cam-arm': appearance('A reader tracing shaft-to-nose structure.', 'Identify radial cam arms, excluding contact cubes.', 'Only shaft-to-nose bars.'),
  'sail-panel': appearance('A reader locating the geometry-derived wind-load surrogate.', 'Identify only the two stepped plates.', 'One connected two-slab region per sail; the slab seam is excluded.'),
  'cam-contact': appearance('A reader locating declared cam-side participants.', 'Identify only the two terminal cam cubes.', 'Only the two separated one-cube nose regions.'),
  'hammer-follower': appearance('A reader locating the declared follower-side participant.', 'Identify only the follower shoe.', 'Only the one-cube shoe region.'),
  'impact-head-mass': appearance('A reader separating optional head mass from contact.', 'Identify only H-1 non-contact head cells.', 'Only the optional connected mass run.'),
  'impact-toe': appearance('A reader locating the moving head-anvil participant.', 'Identify only the one-cube toe.', 'Only the one-cube moving contact region.'),
  'anvil-waist': appearance('A reader tracing the fixed cap-to-ground path.', 'Identify only the anvil column.', 'Only the connected ground-column run.'),
  'impact-face': appearance('A reader locating the fixed head-anvil participant.', 'Identify only the one-cube cap.', 'Only the one-cube fixed contact region.'),
});

export const WINDMILL_COMPACT_MATERIAL_NEEDS_V1: Readonly<Record<
WindmillCompactMaterialProfileV1, WindmillCompactAppearanceNeedV1
>> = Object.freeze({
  fixedSupport: appearance('The fixed-frame sidecar mapping.', 'Preserve fixed-support identity for rings and ground ties.', 'Only fixed-frame voxels, partitioned at role changes.'),
  rotorShaft: appearance('The rotor-axis sidecar mapping.', 'Preserve shaft identity separately from radial attachments.', 'Only the rotor-axis core region.'),
  rotorCollar: appearance('The rotor-shoulder sidecar mapping.', 'Preserve rotor collar identity.', 'Only the two separated shoulder regions.'),
  rotorCore: appearance('The rotor-spar sidecar mapping.', 'Preserve radial core identity.', 'Only the two separated spar regions.'),
  sail: appearance('The plate-load sidecar mapping.', 'Preserve stepped-plate identity independent of slab partition.', 'Only the two connected sail regions.'),
  cam: appearance('The cam rigid-body sidecar mapping.', 'Preserve common material identity while retaining role transitions.', 'Only arm and nose voxels, partitioned at role changes.'),
  hammerPivot: appearance('The hammer-axis sidecar mapping.', 'Preserve journal identity separately from lever links.', 'Only the hammer-axis core region.'),
  hammerCollar: appearance('The hammer-shoulder sidecar mapping.', 'Preserve hammer collar identity.', 'Only the two separated shoulder regions.'),
  hammerFollower: appearance('The follower participant sidecar mapping.', 'Preserve follower identity separately from links.', 'Only the follower-shoe region.'),
  hammerBeam: appearance('The hammer-link sidecar mapping.', 'Preserve rigid link/beam identity.', 'Only connected beam regions; source seams are excluded.'),
  hammerHead: appearance('The terminal-head sidecar mapping.', 'Preserve toe and optional mass as one material while retaining role changes.', 'Only terminal-head voxels, partitioned at the contact role.'),
  anvil: appearance('The fixed anvil sidecar mapping.', 'Preserve cap/column material identity while retaining role changes.', 'Only anvil voxels, partitioned at the contact role.'),
});

const roleColor = (
  role: string,
  colorGroup: string,
  color: GenomeColorV1,
): WindmillCompactRoleColorV1 => {
  const need = WINDMILL_COMPACT_ROLE_NEEDS_V1[role];
  if (need === undefined) {
    throw new Error(
      `Cannot author compact windmill role color '${role}': no complete `
      + 'role appearance record exists.',
    );
  }
  return Object.freeze({
    role,
    colorGroup,
    color: Object.freeze({ ...color }),
    beneficiary: need.beneficiary,
    job: need.job,
    minimumForm: need.minimumBoundary,
    intendedViewRequirement:
      'Bind a fixed-camera, intended-scale capture before claiming this boundary is visible.',
    honestyBoundary: need.honestyBoundary,
  });
};

export const WINDMILL_COMPACT_ROLE_COLORS_V1 = Object.freeze([
  roleColor('foundation', 'grounded-foundation', { r: 94, g: 79, b: 65 }),
  roleColor('bearing-frame', 'fixed-bearing-frame', { r: 116, g: 101, b: 83 }),
  roleColor('bearing-block', 'fixed-bearing-block', { r: 145, g: 128, b: 103 }),
  roleColor('bearing-liner', 'bearing-corner-liner', { r: 205, g: 173, b: 88 }),
  roleColor('bearing-collar', 'moving-bearing-collar', { r: 116, g: 137, b: 151 }),
  roleColor('shaft', 'moving-axis-metal', { r: 66, g: 76, b: 84 }),
  roleColor('hammer-pivot', 'moving-axis-metal', { r: 66, g: 76, b: 84 }),
  roleColor('sail-spar', 'structural-load-path', { r: 157, g: 101, b: 50 }),
  roleColor('hammer-beam', 'structural-load-path', { r: 157, g: 101, b: 50 }),
  roleColor('cam-arm', 'structural-load-path', { r: 157, g: 101, b: 50 }),
  roleColor('sail-panel', 'wind-load-surface', { r: 224, g: 211, b: 164 }),
  roleColor('cam-contact', 'declared-cam-contact', { r: 226, g: 143, b: 43 }),
  roleColor('hammer-follower', 'declared-cam-contact', { r: 226, g: 143, b: 43 }),
  roleColor('impact-head-mass', 'terminal-mass-metal', { r: 51, g: 59, b: 66 }),
  roleColor('impact-toe', 'declared-head-anvil-contact', { r: 127, g: 151, b: 166 }),
  roleColor('anvil-waist', 'terminal-mass-metal', { r: 51, g: 59, b: 66 }),
  roleColor('impact-face', 'declared-head-anvil-contact', { r: 127, g: 151, b: 166 }),
] as const);

const COLOR_BY_ROLE = new Map(WINDMILL_COMPACT_ROLE_COLORS_V1
  .map((entry) => [entry.role, entry]));

function signature(box: WindmillCompactBoxV1): string {
  const color = COLOR_BY_ROLE.get(box.role);
  if (color === undefined) return '';
  return `${box.role}|${color.colorGroup}|${box.materialProfile}`;
}

function componentBoxes(
  candidate: WindmillCompactCandidateV1,
  asset: WindmillCompactAssetV1,
  target: WindmillCompactBoxV1,
): readonly WindmillCompactBoxV1[] {
  const expected = signature(target);
  const byKey = new Map(asset.boxes.map((box) => [box.key, box]));
  const visited = new Set([target.key]);
  const pending = [target.key];
  while (pending.length > 0) {
    const current = pending.pop()!;
    candidate.requiredInterfaces.forEach((edge) => {
      const neighbor = edge.fromBoxKey === current
        ? edge.toBoxKey
        : edge.toBoxKey === current ? edge.fromBoxKey : undefined;
      const next = neighbor === undefined ? undefined : byKey.get(neighbor);
      if (next === undefined || visited.has(next.key)
        || signature(next) !== expected) return;
      visited.add(next.key);
      pending.push(next.key);
    });
  }
  return [...visited].sort().map((key) => byKey.get(key)!);
}

function cellsOf(
  boxes: readonly WindmillCompactBoxV1[],
): readonly WindmillCompactTripleV1[] {
  const cells: WindmillCompactTripleV1[] = [];
  boxes.forEach((box) => {
    for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
      for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
        for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
          cells.push([x, y, z]);
        }
      }
    }
  });
  return cells;
}

function candidateBox(
  candidate: WindmillCompactCandidateV1,
  boxKey: string,
): WindmillCompactBoxV1 {
  const box = Object.values(candidate.assets)
    .flatMap((asset) => asset.boxes)
    .find((entry) => entry.key === boxKey);
  if (box === undefined) {
    throw new Error(
      `Cannot account for compact appearance neighbor '${boxKey}': `
      + 'the candidate has no such exact box.',
    );
  }
  return box;
}

export function windmillCompactAppearancePurposeV1(
  candidate: WindmillCompactCandidateV1,
  asset: WindmillCompactAssetV1,
  box: WindmillCompactBoxV1,
): WindmillCompactAppearancePurposeV1 {
  const color = COLOR_BY_ROLE.get(box.role);
  const roleNeed = WINDMILL_COMPACT_ROLE_NEEDS_V1[box.role];
  const materialNeed = WINDMILL_COMPACT_MATERIAL_NEEDS_V1[box.materialProfile];
  if (color === undefined || roleNeed === undefined) {
    throw new Error(
      `Cannot account for compact appearance '${box.key}': role `
      + `'${box.role}' or material '${box.materialProfile}' lacks a record.`,
    );
  }
  const members = componentBoxes(candidate, asset, box);
  const memberKeys = members.map((member) => member.key);
  const memberSet = new Set(memberKeys);
  const neighborKeys = candidate.requiredInterfaces.flatMap((edge) => {
    const fromInside = memberSet.has(edge.fromBoxKey);
    const toInside = memberSet.has(edge.toBoxKey);
    if (fromInside === toInside) return [];
    return [fromInside ? edge.toBoxKey : edge.fromBoxKey];
  }).sort();
  const neighborGroups = neighborKeys.map((key) =>
    COLOR_BY_ROLE.get(candidateBox(candidate, key).role)?.colorGroup)
    .filter((group): group is string =>
      group !== undefined && group !== color.colorGroup);
  const usedRoles = new Set(Object.values(candidate.assets)
    .flatMap((entry) => entry.boxes.map((entryBox) => entryBox.role)));
  const comparisons = WINDMILL_COMPACT_ROLE_COLORS_V1.filter((entry) =>
    usedRoles.has(entry.role) && entry.colorGroup !== color.colorGroup
    && (neighborGroups.length === 0 || neighborGroups.includes(entry.colorGroup)));
  const nearestDistance = Math.min(...comparisons.map((entry) => Math.hypot(
    color.color.r - entry.color.r,
    color.color.g - entry.color.g,
    color.color.b - entry.color.b,
  )));
  if (!Number.isFinite(nearestDistance) || nearestDistance <= 0) {
    throw new Error(
      `Cannot account for compact appearance '${box.key}': color group `
      + `'${color.colorGroup}' has no distinct comparison boundary.`,
    );
  }
  const cells = cellsOf(members);
  const occupied = new Set(asset.occupiedCells.map((cell) => cell.join(',')));
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0],
    [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  const exposedFaceCount = cells.reduce((count, cell) =>
    count + directions.filter((delta) => !occupied.has([
      cell[0] + delta[0],
      cell[1] + delta[1],
      cell[2] + delta[2],
    ].join(','))).length, 0);
  if (exposedFaceCount === 0) {
    throw new Error(
      `Cannot account for compact appearance '${box.key}': its semantic `
      + 'region has no exposed voxel face.',
    );
  }
  const localMin = [0, 1, 2].map((axis) =>
    Math.min(...members.map((member) => member.at[axis]!)));
  const localMax = [0, 1, 2].map((axis) => Math.max(...members.map((member) =>
    member.at[axis]! + member.size[axis]!)));
  const worldMin = localMin.map((value, axis) =>
    value + asset.worldOriginVoxels[axis]!);
  const worldMax = localMax.map((value, axis) =>
    value + asset.worldOriginVoxels[axis]!);
  const boxVoxelCount = box.size.reduce((total, extent) => total * extent, 1);
  const regionKey = [
    asset.key,
    box.role,
    color.colorGroup,
    box.materialProfile,
    memberKeys[0],
  ].join(':');
  const invariant = 'Merging or splitting source boxes is appearance-neutral '
    + 'if and only if the exact occupied-voxel role/color/material map is unchanged.';
  return Object.freeze({
    regionKey,
    memberBoxKeys: Object.freeze(memberKeys),
    regionVoxelCount: cells.length,
    exposedFaceCount,
    beneficiary: `${roleNeed.beneficiary} ${materialNeed.beneficiary}`,
    job: `${roleNeed.job} ${materialNeed.job} Region '${regionKey}' maps role `
      + `'${box.role}', color '${color.colorGroup}', and material `
      + `'${box.materialProfile}'.`,
    placementDatum: `Region '${regionKey}' occupies ${String(cells.length)} `
      + `voxels in world bounds [${worldMin.join(',')}]..[${worldMax.join(',')}); `
      + `source members are [${memberKeys.join(', ')}].`,
    removalFailure: `Deleting '${box.key}'s ${String(boxVoxelCount)} occupied `
      + `voxels removes that mapped subset; deleting all ${String(cells.length)} `
      + 'region voxels erases its role/color/material communication. '
      + 'Deleting only a source record after an exact merge is neutral.',
    relocationFailure: `Moving '${box.key}'s occupied voxels changes region `
      + `'${regionKey}'s world map and interfaces [${neighborKeys.join(', ')}].`,
    minimumForm: `${roleNeed.minimumBoundary} ${materialNeed.minimumBoundary} `
      + `This maximal same-signature region has ${String(cells.length)} voxels `
      + `across [${memberKeys.join(', ')}]; no internal source seam is claimed.`,
    intendedViewEvidence: `Geometry/palette evidence only: the region has `
      + `${String(exposedFaceCount)} exposed voxel faces and nearest relevant `
      + `distinct color-group RGB distance ${nearestDistance.toFixed(3)}; `
      + 'fixed-camera visibility remains unbound.',
    intendedViewProof: null,
    representationInvariant: invariant,
    honestyBoundary:
      `${roleNeed.honestyBoundary} ${materialNeed.honestyBoundary}`,
  });
}
