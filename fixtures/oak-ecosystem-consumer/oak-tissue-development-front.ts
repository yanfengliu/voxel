import type { Srgb8ColorV1 } from '../../src/core/index.js';
import type { OakStructuralOrganSnapshotV1 } from './oak-types.js';

export interface OakTissueFrontLocalCellV1 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface OakTissueFrontCandidateV1 {
  readonly role: string;
  readonly local: OakTissueFrontLocalCellV1;
  readonly color: Srgb8ColorV1;
}

export function oakTissueBoundedRatioV1(current: number, target: number): number {
  return target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
}

/** Paid structural volume, not elapsed time, determines the visible prefix. */
export function oakTissueStructuralVolumeFractionV1(
  organ: OakStructuralOrganSnapshotV1,
): number {
  return Math.min(
    oakTissueBoundedRatioV1(organ.developmentFraction, 1) ** 3,
    oakTissueBoundedRatioV1(organ.lengthM, organ.targetLengthM)
      * oakTissueBoundedRatioV1(organ.radiusM, organ.targetRadiusM) ** 2,
  );
}

export function oakTissueCommittedPrefixV1(
  candidates: readonly OakTissueFrontCandidateV1[],
  fraction: number,
  minimum = 1,
): readonly OakTissueFrontCandidateV1[] {
  const count = Math.min(
    candidates.length,
    Math.max(minimum, Math.ceil(candidates.length * oakTissueBoundedRatioV1(fraction, 1))),
  );
  return candidates.slice(0, count);
}

export function oakTissueConnectedAdditionsV1(
  base: readonly OakTissueFrontCandidateV1[],
  additions: readonly OakTissueFrontCandidateV1[],
  fraction: number,
): readonly OakTissueFrontCandidateV1[] {
  const occupied = new Set(base.map(({ local }) => `${local.x}/${local.y}/${local.z}`));
  const committed: OakTissueFrontCandidateV1[] = [];
  for (const candidate of oakTissueCommittedPrefixV1(additions, fraction, 0)) {
    const { x, y, z } = candidate.local;
    const connected = [[x + 1,y,z],[x - 1,y,z],[x,y + 1,z],[x,y - 1,z],[x,y,z + 1],[x,y,z - 1]]
      .some((cell) => occupied.has(cell.join('/')));
    if (!connected) continue;
    occupied.add(`${x}/${y}/${z}`);
    committed.push(candidate);
  }
  return committed;
}

export function oakTissueOrderedRadialSectionV1(
  layer: number,
  radial: number,
  include: (x: number, z: number) => boolean,
): OakTissueFrontLocalCellV1[] {
  const section: OakTissueFrontLocalCellV1[] = [];
  for (let x = -radial; x <= radial; x += 1) {
    for (let z = -radial; z <= radial; z += 1) {
      if (include(x, z) || (x === 0 && z === 0)) section.push({ x, y: layer, z });
    }
  }
  return section.sort((left, right) => Math.abs(left.x) + Math.abs(left.z)
    - Math.abs(right.x) - Math.abs(right.z) || left.x - right.x || left.z - right.z);
}

function radiusRatioAt(
  profile: readonly Readonly<{ axialFraction: number; radiusRatio: number }>[],
  t: number,
): number {
  for (let index = 0; index < profile.length - 1; index += 1) {
    const start = profile[index]!;
    const end = profile[index + 1]!;
    if (t > end.axialFraction) continue;
    const u = (t - start.axialFraction) / (end.axialFraction - start.axialFraction);
    return start.radiusRatio + (end.radiusRatio - start.radiusRatio) * u;
  }
  return profile.at(-1)!.radiusRatio;
}

export function oakTissueSegmentCandidatesV1(input: Readonly<{
  layers: number;
  radiusM: number;
  pitchM: number;
  profile: readonly Readonly<{ axialFraction: number; radiusRatio: number }>[];
  color: Srgb8ColorV1;
}>): OakTissueFrontCandidateV1[] {
  const candidates: OakTissueFrontCandidateV1[] = [];
  for (let layer = 0; layer < input.layers; layer += 1) {
    const radiusM = input.radiusM * radiusRatioAt(
      input.profile,
      (layer + .5) / input.layers,
    );
    const radial = Math.max(0, Math.ceil(radiusM / input.pitchM));
    const threshold = radiusM * radiusM + input.pitchM * input.pitchM * .18;
    const section = oakTissueOrderedRadialSectionV1(layer, radial, (x, z) =>
      (x * input.pitchM) ** 2 + (z * input.pitchM) ** 2 <= threshold);
    candidates.push(...section.map((local) => ({
      role: 'wood-voxel',
      local,
      color: input.color,
    })));
  }
  // A single stable order interleaves axial and radial advance. For a cylinder,
  // the population at score <= f scales approximately as f^3, matching paid
  // structural volume without releasing an entire radial shell on one tick.
  const score = ({ local }: OakTissueFrontCandidateV1): number => {
    const axial = (local.y + 1) / input.layers;
    const targetRadiusCells = Math.max(1,
      input.radiusM * radiusRatioAt(
        input.profile,
        (local.y + .5) / input.layers,
      ) / input.pitchM);
    const radial = Math.hypot(local.x, local.z) / targetRadiusCells;
    return Math.max(axial, radial);
  };
  return candidates.sort((left, right) =>
    score(left) - score(right)
    || Math.abs(left.local.x) + Math.abs(left.local.z)
      - Math.abs(right.local.x) - Math.abs(right.local.z)
    || left.local.y - right.local.y
    || left.local.x - right.local.x
    || left.local.z - right.local.z);
}

/**
 * Reveal a connected target-mask prefix only where current authoritative
 * length and radius can contain it. Current geometry and paid cell volume are
 * independent upper bounds, so neither can silently overstate the other.
 */
export function oakTissueVisibleStructuralCandidatesV1(input: Readonly<{
  organ: OakStructuralOrganSnapshotV1;
  candidates: readonly OakTissueFrontCandidateV1[];
  layers: number;
  pitchM: number;
  profile: readonly Readonly<{ axialFraction: number; radiusRatio: number }>[];
}>): readonly OakTissueFrontCandidateV1[] {
  const axialLayers = Math.max(1, Math.ceil(input.layers
    * oakTissueBoundedRatioV1(input.organ.lengthM, input.organ.targetLengthM)));
  const count = Math.max(1, Math.ceil(
    input.candidates.length * oakTissueStructuralVolumeFractionV1(input.organ),
  ));
  const paidPrefix = input.candidates.slice(0, count);
  return paidPrefix.filter(({ local }) => local.y < axialLayers);
}

export function oakTissueLeafCandidatesV1(input: Readonly<{
  layers: number;
  radialProfile: readonly number[];
  petioleFraction: number;
  camberCellAt: (layer: number) => number;
  baseColor: Srgb8ColorV1;
  midribColor: Srgb8ColorV1;
}>): OakTissueFrontCandidateV1[] {
  const skeleton: OakTissueFrontCandidateV1[] = [];
  const lamina: OakTissueFrontCandidateV1[] = [];
  let priorZ = 0;
  for (let layer = 0; layer < input.layers; layer += 1) {
    const z = Math.max(priorZ - 1, Math.min(priorZ + 1, input.camberCellAt(layer)));
    if (z !== priorZ) {
      skeleton.push({
        role: 'camber-connector-voxel',
        local: { x: 0, y: layer, z: priorZ },
        color: input.baseColor,
      });
    }
    skeleton.push({
      role: (layer + .5) / input.layers < input.petioleFraction
        ? 'petiole-voxel' : 'midrib-voxel',
      local: { x: 0, y: layer, z },
      color: input.midribColor,
    });
    const radial = input.radialProfile[layer]!;
    for (let x = -radial; x <= radial; x += 1) {
      if (x !== 0) {
        lamina.push({ role: 'lamina-voxel', local: { x, y: layer, z }, color: input.baseColor });
      }
    }
    priorZ = z;
  }
  lamina.sort((left, right) => left.local.y - right.local.y
    || Math.abs(left.local.x) - Math.abs(right.local.x) || left.local.x - right.local.x);
  return [...skeleton, ...lamina];
}

export function oakTissueAxialRadialCandidatesV1(input: Readonly<{
  layers: number;
  pitchM: number;
  paddingFraction: number;
  role: string;
  color: Srgb8ColorV1;
  radiusAt: (axialFraction: number) => number;
}>): OakTissueFrontCandidateV1[] {
  const candidates: OakTissueFrontCandidateV1[] = [];
  for (let layer = 0; layer < input.layers; layer += 1) {
    const radiusM = input.radiusAt((layer + .5) / input.layers);
    const radial = Math.max(0, Math.floor(radiusM / input.pitchM + .45));
    const threshold = radiusM * radiusM
      + input.pitchM * input.pitchM * input.paddingFraction;
    const section = oakTissueOrderedRadialSectionV1(layer, radial, (x, z) =>
      (x * input.pitchM) ** 2 + (z * input.pitchM) ** 2 <= threshold);
    candidates.push(...section.map((local) => ({
      role: input.role,
      local,
      color: input.color,
    })));
  }
  return candidates;
}

/** Area budget and paid axial extent are independent monotone predicates. */
export function oakTissueVisibleLeafCandidatesV1(input: Readonly<{
  candidates: readonly OakTissueFrontCandidateV1[];
  layers: number;
  developmentFraction: number;
  currentAreaM2: number;
  targetAreaM2: number;
  currentLengthM: number;
  targetLengthM: number;
}>): readonly OakTissueFrontCandidateV1[] {
  const areaFraction = Math.min(
    oakTissueBoundedRatioV1(input.developmentFraction, 1),
    oakTissueBoundedRatioV1(input.currentAreaM2, input.targetAreaM2),
  );
  // The petiole and midrib are living tissue too: exempting the complete
  // skeleton from this budget made a newly exposed primordium publish several
  // cells at once. One paid prefix now grows the connected skeleton first and
  // then admits lamina cells without any whole-part appearance boundary.
  const cellBudget = Math.max(1, Math.ceil(input.candidates.length * areaFraction));
  const axialLayers = Math.max(1, Math.ceil(input.layers
    * oakTissueBoundedRatioV1(input.currentLengthM, input.targetLengthM)));
  return input.candidates.slice(0, cellBudget)
    .filter(({ local }) => local.y < axialLayers);
}

export function oakTissueQuantizedLengthV1(
  candidates: readonly OakTissueFrontCandidateV1[],
  pitchM: number,
): number {
  return (Math.max(...candidates.map(({ local }) => local.y)) + 1) * pitchM;
}
