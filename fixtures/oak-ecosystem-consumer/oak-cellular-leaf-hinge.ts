import {
  isOakAttachedLivingOrganV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import {
  oakLeafPetioleSupportAlongAxisM_V1,
} from './oak-leaf-shape.js';
import { OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1 } from './oak-physical-wood.js';
import type { MutableOakOrganV1 } from './oak-state.js';
import type { OakLeafAttachmentV1, OakVec3V1 } from './oak-types.js';

const UNIT_TOLERANCE = 1e-10;

function dot(left: OakVec3V1, right: OakVec3V1): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function scale(vector: OakVec3V1, factor: number): OakVec3V1 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function add(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: OakVec3V1, right: OakVec3V1): OakVec3V1 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function magnitude(vector: OakVec3V1): number {
  return Math.sqrt(dot(vector, vector));
}

function unit(vector: OakVec3V1, label: string): OakVec3V1 {
  const length = magnitude(vector);
  if (!(length > 0) || !Number.isFinite(length)) {
    throw new Error(`${label} must be a finite nonzero vector.`);
  }
  return scale(vector, 1 / length);
}

/**
 * Deterministic shortest-arc transport with an explicit antiparallel axis.
 * It has no reference-axis threshold, so a material radial cannot twist when
 * a parent direction crosses the rendering frame's basis-selection boundary.
 */
export function oakParallelTransportVectorV1(
  vector: OakVec3V1,
  fromDirection: OakVec3V1,
  toDirection: OakVec3V1,
): OakVec3V1 {
  const from = unit(fromDirection, 'Oak transport source direction');
  const to = unit(toDirection, 'Oak transport target direction');
  const cosine = Math.max(-1, Math.min(1, dot(from, to)));
  const rotationAxis = cross(from, to);
  const sineSquared = dot(rotationAxis, rotationAxis);
  if (sineSquared > 1e-24) {
    const crossed = cross(rotationAxis, vector);
    const projected = dot(rotationAxis, vector);
    return add(add(
      scale(vector, cosine),
      crossed,
    ), scale(rotationAxis, projected * (1 - cosine) / sineSquared));
  }
  if (cosine > 0) return { ...vector };
  const helper = Math.abs(from.x) <= Math.abs(from.y)
    && Math.abs(from.x) <= Math.abs(from.z)
    ? { x: 1, y: 0, z: 0 }
    : Math.abs(from.y) <= Math.abs(from.z)
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };
  const axis = unit(cross(from, helper), 'Oak antiparallel transport axis');
  return subtract(scale(axis, 2 * dot(axis, vector)), vector);
}

export function createOakLeafAttachmentV1(
  parent: MutableOakOrganV1,
  leaf: MutableOakOrganV1,
): OakLeafAttachmentV1 {
  const parentAxis = unit(parent.restDirection, `Oak parent '${parent.key}' rest direction`);
  const leafAxis = unit(leaf.restDirection, `Oak leaf '${leaf.key}' rest direction`);
  const radial = subtract(leafAxis, scale(parentAxis, dot(leafAxis, parentAxis)));
  const attachment: OakLeafAttachmentV1 = {
    parentOrganKey: parent.key,
    nodeSite: 'distal',
    restRadialUnitWorld: unit(radial, `Oak leaf '${leaf.key}' radial material direction`),
  };
  assertOakLeafAttachmentV1(attachment, leaf.key);
  return attachment;
}

export function assertOakLeafAttachmentV1(
  attachment: OakLeafAttachmentV1,
  leafKey: string,
): void {
  if (attachment.parentOrganKey.length === 0 || attachment.nodeSite !== 'distal') {
    throw new Error(`Oak leaf '${leafKey}' has an invalid distal-node attachment identity.`);
  }
  const radial = attachment.restRadialUnitWorld;
  const length = magnitude(radial);
  if (![radial.x, radial.y, radial.z].every(Number.isFinite)
    || Math.abs(length - 1) > UNIT_TOLERANCE) {
    throw new Error(`Oak leaf '${leafKey}' attachment radial must be finite and normalized.`);
  }
}

export function assertOakLeafAttachmentTopologyV1(
  organs: readonly MutableOakOrganV1[],
): void {
  for (const leaf of organs) {
    if (leaf.kind !== 'leaf') continue;
    if (leaf.attachment !== undefined) assertOakLeafAttachmentV1(leaf.attachment, leaf.key);
    if (leaf.parentKey === null || !isOakPlacedOrganV1(leaf)
      || !isOakAttachedLivingOrganV1(leaf)) continue;
    if (leaf.attachment === undefined) {
      throw new Error(`Placed attached oak leaf '${leaf.key}' has no physical node attachment.`);
    }
    if (leaf.attachment.parentOrganKey !== leaf.parentKey) {
      throw new Error(
        `Placed attached oak leaf '${leaf.key}' names parent '${leaf.parentKey}' but its `
        + `attachment names '${leaf.attachment.parentOrganKey}'.`,
      );
    }
  }
}

export function oakLeafNodeEnvelopeRadiusM_V1(
  organs: readonly MutableOakOrganV1[],
  parent: MutableOakOrganV1,
  radialDirection: OakVec3V1,
  current: boolean,
): number {
  const structuralChildren = organs.filter((organ) => organ.parentKey === parent.key
    && organ.kind !== 'leaf' && organ.kind !== 'bud'
    && isOakPlacedOrganV1(organ) && isOakAttachedLivingOrganV1(organ));
  const parentAxis = current ? parent.direction : parent.restDirection;
  return Math.max(
    parent.radiusM * OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1,
    ...structuralChildren.map((organ) => {
      const childAxis = unit(oakParallelTransportVectorV1(
        organ.restDirection,
        parent.restDirection,
        parentAxis,
      ), `Oak node child '${organ.key}' basal axis`);
      // One basal diameter of each direct structural child is part of the
      // finite node collar. Its directional projection plus circular radius
      // bounds that shared-node material without sweeping in the branch.
      return organ.radiusM * (1 + 2 * Math.max(0, dot(childAxis, radialDirection)));
    }),
  );
}

/** Resolve a fixed kinematic node datum on a conservative material envelope. */
export function oakResolveLeafAttachmentNodeV1(input: Readonly<{
  organs: readonly MutableOakOrganV1[];
  leaf: MutableOakOrganV1;
  parent: MutableOakOrganV1;
  current: boolean;
}>): OakVec3V1 {
  const attachment = input.leaf.attachment;
  if (attachment === undefined || attachment.parentOrganKey !== input.parent.key) {
    throw new Error(`Oak leaf '${input.leaf.key}' cannot resolve a mismatched node attachment.`);
  }
  assertOakLeafAttachmentV1(attachment, input.leaf.key);
  const parentAxis = unit(
    input.current ? input.parent.direction : input.parent.restDirection,
    `Oak parent '${input.parent.key}' attachment axis`,
  );
  const parentOrigin = input.current ? input.parent.positionM : input.parent.restPositionM;
  const radial = unit(oakParallelTransportVectorV1(
    attachment.restRadialUnitWorld,
    input.parent.restDirection,
    parentAxis,
  ), `Oak leaf '${input.leaf.key}' transported radial`);
  const nodeRadius = oakLeafNodeEnvelopeRadiusM_V1(
    input.organs, input.parent, radial, input.current,
  );
  const distalNode = add(parentOrigin, scale(parentAxis, input.parent.lengthM));
  return add(distalNode, scale(radial, nodeRadius));
}

/**
 * Clear the axial and radial supporting planes independently. Their separate
 * extrema need not be one petiole point, so the node datum is not a proved
 * material contact or vascular junction (see the rolled-section counterexample).
 */
export function oakResolveLeafAttachmentPoseV1(input: Readonly<{
  organs: readonly MutableOakOrganV1[];
  leaf: MutableOakOrganV1;
  parent: MutableOakOrganV1;
  leafDirection: OakVec3V1;
  current: boolean;
}>): OakVec3V1 {
  const node = oakResolveLeafAttachmentNodeV1(input);
  const parentAxis = unit(
    input.current ? input.parent.direction : input.parent.restDirection,
    `Oak parent '${input.parent.key}' attachment axis`,
  );
  const radial = unit(oakParallelTransportVectorV1(
    input.leaf.attachment!.restRadialUnitWorld,
    input.parent.restDirection,
    parentAxis,
  ), `Oak leaf '${input.leaf.key}' transported radial`);
  const areaM2 = input.leaf.areaM2 ?? 0;
  const roll = input.leaf.rollRadians ?? 0;
  const axialSupport = oakLeafPetioleSupportAlongAxisM_V1(
    input.leaf.key, areaM2, input.leaf.lengthM, input.leafDirection, roll, parentAxis,
  );
  const radialSupport = oakLeafPetioleSupportAlongAxisM_V1(
    input.leaf.key, areaM2, input.leaf.lengthM, input.leafDirection, roll, radial,
  );
  return add(
    add(node, scale(parentAxis, axialSupport)),
    scale(radial, radialSupport),
  );
}
