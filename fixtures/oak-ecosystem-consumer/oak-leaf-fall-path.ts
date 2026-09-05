import type { MutableOakOrganV1 } from './oak-state.js';
import type { OakVec3V1 } from './oak-types.js';
import { deterministicCosV1, deterministicSinV1 } from '../deterministic-math.js';

/**
 * Deterministic landing microsites for the bounded ten-leaf case study. Their
 * varied radii, gaps, and headings read as wind-and-relief sorting instead of
 * a specimen ring. Each site occupies its own horizontal descent lane: after
 * the high approach, a leaf can settle vertically without passing through an
 * older leaf merely because terrain relief will support them at different Y.
 *
 * A site names where a leaf's *length midpoint* comes to rest. What an observer
 * reads off the litter — and what the fallen-litter gate measures — is instead
 * the settled body's voxel centroid, and those are not the same point. Measured
 * at day 249, every leaf's litter centroid lies 1.1 to 5.6 mm from its site, and
 * that displacement is not a rigid function of the site: three bodies of equal
 * length, area and variant settled 2.2, 2.4 and 5.1 mm out along their own
 * headings. A site radius therefore only survives into the deposit to within a
 * few millimetres, and two sites nearer each other than that land as one ring —
 * which is how ten hand-placed sites spanning ten distinct millimetre radii
 * deposited at only seven, four of them crowded into a 4.4 mm band.
 *
 * So the radii below are a ladder rather than ten free coordinates: ten sites
 * 5.5 mm apart from 120.0 to 169.5 mm, spaced wider than the displacement they
 * have to survive, so a sorted set of sites still reads as sorted once settled.
 * Azimuths and headings are unchanged from the free coordinates this ladder
 * replaces, and every radius moved inward, so each body keeps the full terrain
 * footprint its support contact needs.
 */
const LANDING_MICROSITE_INNER_RADIUS_M = 0.120;
const LANDING_MICROSITE_RADIUS_STEP_M = 0.0055;
const LANDING_MICROSITES = Object.freeze([
  { radiusRung: 8, azimuthRadians: -0.530216, headingRadians: 0.12 },
  { radiusRung: 4, azimuthRadians: 1.349324, headingRadians: -0.72 },
  { radiusRung: 0, azimuthRadians: -2.471954, headingRadians: 2.52 },
  { radiusRung: 3, azimuthRadians: -0.117109, headingRadians: -1.18 },
  { radiusRung: 2, azimuthRadians: 2.688080, headingRadians: 0.43 },
  { radiusRung: 7, azimuthRadians: -1.087761, headingRadians: 2.08 },
  { radiusRung: 9, azimuthRadians: 2.008134, headingRadians: -1.52 },
  { radiusRung: 6, azimuthRadians: -1.878576, headingRadians: 0.87 },
  { radiusRung: 1, azimuthRadians: 0.555263, headingRadians: 2.88 },
  { radiusRung: 5, azimuthRadians: -3.052089, headingRadians: -0.31 },
] as const);
export const OAK_LEAF_FALL_ESCAPE_RADIUS_M_V1 = 0.155;
export const OAK_LEAF_FALL_HOVER_HEIGHT_M_V1 = 0.015;
export const OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1 = 0.25;
export const OAK_LEAF_FALL_DESCENT_END_FRACTION_V1 = 0.7;
export const OAK_LEAF_FALL_APPROACH_END_FRACTION_V1 = 0.9;

export interface OakLeafFallTargetV1 {
  readonly midpointM: OakVec3V1;
  readonly direction: OakVec3V1;
}

function normalizedHorizontal(vector: OakVec3V1): OakVec3V1 {
  const magnitude = Math.hypot(vector.x, vector.z);
  return magnitude > 0
    ? { x: vector.x / magnitude, y: 0, z: vector.z / magnitude }
    : { x: 1, y: 0, z: 0 };
}

function rotateY(vector: OakVec3V1, radians: number): OakVec3V1 {
  const cosine = deterministicCosV1(radians);
  const sine = deterministicSinV1(radians);
  return {
    x: vector.x * cosine - vector.z * sine,
    y: 0,
    z: vector.x * sine + vector.z * cosine,
  };
}

export function oakLeafFallTargetV1(
  _leaf: MutableOakOrganV1,
  leafIndex: number,
  contactY: number,
): OakLeafFallTargetV1 {
  const microsite = LANDING_MICROSITES[leafIndex % LANDING_MICROSITES.length]!;
  const heading = rotateY({ x: 1, y: 0, z: 0 }, microsite.headingRadians);
  const radiusM = LANDING_MICROSITE_INNER_RADIUS_M
    + LANDING_MICROSITE_RADIUS_STEP_M * microsite.radiusRung;
  return {
    midpointM: {
      x: radiusM * deterministicCosV1(microsite.azimuthRadians),
      y: contactY,
      z: radiusM * deterministicSinV1(microsite.azimuthRadians),
    },
    direction: heading,
  };
}

export function oakLeafFallEaseV1(fraction: number): number {
  const bounded = Math.max(0, Math.min(1, fraction));
  return bounded * bounded * (3 - 2 * bounded);
}

/** Orientation changes only after the rigid body has escaped the crown. */
export function oakLeafFallProgressV1(fraction: number): Readonly<{
  orientation: number;
}> {
  return {
    orientation: oakLeafFallEaseV1(
      (fraction - OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1)
      / (OAK_LEAF_FALL_DESCENT_END_FRACTION_V1
        - OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1),
    ),
  };
}

function mix(left: number, right: number, fraction: number): number {
  return left + (right - left) * fraction;
}

function mixPoint(left: OakVec3V1, right: OakVec3V1, fraction: number): OakVec3V1 {
  return {
    x: mix(left.x, right.x, fraction),
    y: mix(left.y, right.y, fraction),
    z: mix(left.z, right.z, fraction),
  };
}

function segmentFraction(fraction: number, start: number, end: number): number {
  return oakLeafFallEaseV1((fraction - start) / (end - start));
}

/**
 * Escape the crown first, descend in an outside lane, approach above all
 * litter, then settle vertically. Each segment is C1-eased at its endpoints.
 */
export function oakLeafFallMidpointV1(
  startMidpointM: OakVec3V1,
  targetMidpointM: OakVec3V1,
  fraction: number,
): OakVec3V1 {
  const outward = normalizedHorizontal(startMidpointM);
  const escape = {
    x: outward.x * OAK_LEAF_FALL_ESCAPE_RADIUS_M_V1,
    y: Math.max(startMidpointM.y, 0.04),
    z: outward.z * OAK_LEAF_FALL_ESCAPE_RADIUS_M_V1,
  };
  const hoverY = targetMidpointM.y + OAK_LEAF_FALL_HOVER_HEIGHT_M_V1;
  const descent = { x: escape.x, y: hoverY, z: escape.z };
  const approach = { x: targetMidpointM.x, y: hoverY, z: targetMidpointM.z };
  if (fraction <= OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1) {
    return mixPoint(startMidpointM, escape, segmentFraction(
      fraction, 0, OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1,
    ));
  }
  if (fraction <= OAK_LEAF_FALL_DESCENT_END_FRACTION_V1) {
    return mixPoint(escape, descent, segmentFraction(
      fraction, OAK_LEAF_FALL_ESCAPE_END_FRACTION_V1,
      OAK_LEAF_FALL_DESCENT_END_FRACTION_V1,
    ));
  }
  if (fraction <= OAK_LEAF_FALL_APPROACH_END_FRACTION_V1) {
    return mixPoint(descent, approach, segmentFraction(
      fraction, OAK_LEAF_FALL_DESCENT_END_FRACTION_V1,
      OAK_LEAF_FALL_APPROACH_END_FRACTION_V1,
    ));
  }
  return mixPoint(approach, targetMidpointM, segmentFraction(
    fraction, OAK_LEAF_FALL_APPROACH_END_FRACTION_V1, 1,
  ));
}
