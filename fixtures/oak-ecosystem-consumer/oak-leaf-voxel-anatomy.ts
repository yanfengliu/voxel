import type { Srgb8ColorV1 } from '../../src/core/index.js';
import {
  oakTissueVoxelCohortColorV1,
} from './oak-tissue-color.js';
import type { OakTissueFrontCandidateV1 } from './oak-tissue-development-front.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

export const OAK_LEAF_TRANSVERSE_CAMBER_MAX_RISE_CELLS_V1 = 2;
export const OAK_LEAF_SENESCENCE_START_CHLOROPHYLL_FRACTION_V1 = 1;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function tint(
  base: Srgb8ColorV1,
  offset: Readonly<{ r: number; g: number; b: number }>,
): Srgb8ColorV1 {
  return {
    r: clampByte(base.r + offset.r),
    g: clampByte(base.g + offset.g),
    b: clampByte(base.b + offset.b),
    a: 255,
  };
}

function pairedLobePeaks(radialProfile: readonly number[]): readonly number[] {
  const peaks: number[] = [];
  for (let layer = 1; layer < radialProfile.length - 1; layer += 1) {
    if (radialProfile[layer]! > radialProfile[layer - 1]!
      && radialProfile[layer]! > radialProfile[layer + 1]!) peaks.push(layer);
  }
  return peaks;
}

/**
 * Re-label a sparse subset of already-paid lamina samples along deterministic
 * diagonals from the midrib toward the quantized lobe peaks. This is a visible
 * anatomy cue only: it neither adds occupancy nor claims a transport network.
 */
export function oakLeafSecondaryVeinCandidatesV1(
  candidates: readonly OakTissueFrontCandidateV1[],
  radialProfile: readonly number[],
): readonly OakTissueFrontCandidateV1[] {
  const peaks = pairedLobePeaks(radialProfile);
  return candidates.map((candidate) => {
    if (candidate.role !== 'lamina-voxel') return candidate;
    const distance = Math.abs(candidate.local.x);
    const followsLobe = distance > 1 && distance % 2 === 0 && peaks.some((peakLayer) => {
      const peakRadius = radialProfile[peakLayer]!;
      if (distance > peakRadius) return false;
      const inwardRun = Math.min(3, Math.floor((peakRadius - distance) / 2));
      return candidate.local.y === peakLayer - inwardRun;
    });
    return followsLobe ? { ...candidate, role: 'secondary-vein-voxel' } : candidate;
  });
}

/**
 * Fold each half-blade over a two-cell Manhattan staircase. Every logical
 * lateral step becomes exactly one physical face-neighbour step in x or z, so
 * the mask remains connected and its cell count and growth order are unchanged.
 */
export function oakLeafTransverseCamberCandidatesV1(
  candidates: readonly OakTissueFrontCandidateV1[],
): readonly OakTissueFrontCandidateV1[] {
  return candidates.map((candidate) => {
    if (candidate.role !== 'lamina-voxel'
      && candidate.role !== 'secondary-vein-voxel') return candidate;
    const distance = Math.abs(candidate.local.x);
    const rise = Math.min(
      OAK_LEAF_TRANSVERSE_CAMBER_MAX_RISE_CELLS_V1,
      Math.max(0, distance - 1),
    );
    return {
      ...candidate,
      local: {
        x: Math.sign(candidate.local.x) * (distance - rise),
        y: candidate.local.y,
        z: candidate.local.z - rise,
      },
    };
  });
}

/** Lower ranks lose chlorophyll first; the rule is anatomical, never hashed. */
export function oakLeafSenescenceRankV1(
  candidate: OakTissueFrontCandidateV1,
  radialProfile: readonly number[],
): number {
  const layers = Math.max(1, radialProfile.length);
  const axial = clamp01((candidate.local.y + 0.5) / layers);
  if (candidate.role === 'petiole-voxel') return 1;
  if (candidate.role === 'midrib-voxel' || candidate.role === 'camber-connector-voxel') {
    return 0.82 + (1 - axial) * 0.18;
  }
  const radial = Math.max(1, radialProfile[candidate.local.y] ?? 1);
  if (radial === 1) return 0.82 + (1 - axial) * 0.18;
  const edgeDistance = radial - Math.abs(candidate.local.x);
  const pairedEdgeDepth = clamp01(Math.floor(edgeDistance / 2) * 2 / radial);
  return clamp01(0.72 * pairedEdgeDepth + 0.25 * (1 - axial));
}

export function oakLeafSenescenceProgressV1(leaf: OakLeafOrganSnapshotV1): number {
  if (leaf.stage !== 'senescing' && leaf.stage !== 'detached'
    && leaf.stage !== 'abscised') return 0;
  const start = OAK_LEAF_SENESCENCE_START_CHLOROPHYLL_FRACTION_V1;
  const end = OAK_PARAMETERS_V1.growth.minimumSenescentChlorophyllFraction;
  return clamp01((start - leaf.chlorophyllFraction) / (start - end));
}

function anatomicalDither(value: number, rank: number): number {
  const levels = 4;
  const scaled = clamp01(value) * levels;
  const lower = Math.floor(scaled);
  if (lower >= levels) return 1;
  return (lower + Number(rank < scaled - lower)) / levels;
}

function leafCandidateColor(
  leaf: OakLeafOrganSnapshotV1,
  candidate: OakTissueFrontCandidateV1,
  radialProfile: readonly number[],
): Srgb8ColorV1 {
  const progress = oakLeafSenescenceProgressV1(leaf);
  const rank = oakLeafSenescenceRankV1(candidate, radialProfile);
  const materialLeaf = {
    ...leaf,
    stressFraction: anatomicalDither(leaf.stressFraction, rank),
    relativeWaterContentFraction: anatomicalDither(
      leaf.relativeWaterContentFraction,
      rank,
    ),
  };
  let base: Srgb8ColorV1;
  if (progress > 0 || leaf.stage === 'senescing' || leaf.stage === 'detached') {
    const localProgress = progress >= 1 ? 1 : Number(rank < progress);
    const start = OAK_LEAF_SENESCENCE_START_CHLOROPHYLL_FRACTION_V1;
    const end = OAK_PARAMETERS_V1.growth.minimumSenescentChlorophyllFraction;
    base = oakLeafColorV1({
      ...materialLeaf,
      chlorophyllFraction: start + (end - start) * localProgress,
    });
  } else {
    base = oakTissueVoxelCohortColorV1(
      {
        ...materialLeaf,
        chlorophyllFraction: anatomicalDither(leaf.chlorophyllFraction, rank),
      },
      candidate.local.x,
      candidate.local.y,
      candidate.local.z,
    );
  }
  if (candidate.role === 'petiole-voxel' || candidate.role === 'midrib-voxel') {
    return tint(base, { r: 13, g: 20, b: 5 });
  }
  if (candidate.role === 'secondary-vein-voxel') {
    return tint(base, { r: 7, g: 11, b: 3 });
  }
  return base;
}

/** Apply anatomy-only colour roles before the presentation camber moves cells. */
export function oakLeafAnatomyColoredCandidatesV1(
  leaf: OakLeafOrganSnapshotV1,
  candidates: readonly OakTissueFrontCandidateV1[],
  radialProfile: readonly number[],
): readonly OakTissueFrontCandidateV1[] {
  const veinCandidates = oakLeafSecondaryVeinCandidatesV1(candidates, radialProfile);
  return veinCandidates.map((candidate) => ({
    ...candidate,
    color: leafCandidateColor(leaf, candidate, radialProfile),
  }));
}
