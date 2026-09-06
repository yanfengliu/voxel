import { describe, expect, it } from 'vitest';

import {
  deriveOakLeafLobeCountV1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
  oakLeafWidthScaleMForDescriptorV1,
  type OakLeafVariantDescriptorV1,
} from './oak-leaf-shape.js';
import {
  oakLeafAnatomyColoredCandidatesV1,
  oakLeafSecondaryVeinCandidatesV1,
  oakLeafTransverseCamberCandidatesV1,
} from './oak-leaf-voxel-anatomy.js';
import {
  oakTissueLeafCandidatesV1,
  oakTissueVisibleLeafCandidatesV1,
  type OakTissueFrontCandidateV1,
} from './oak-tissue-development-front.js';
import { oakQuantizedLeafRadialsAtPitchV1 } from './oak-leaf-tissue-mask.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

const COLOR = { r: 70, g: 145, b: 76, a: 255 } as const;
const RADIAL = [0, 1, 2, 4, 3, 5, 3, 5, 3, 4, 2, 1] as const;

function candidates(): readonly OakTissueFrontCandidateV1[] {
  return oakTissueLeafCandidatesV1({
    layers: RADIAL.length,
    radialProfile: RADIAL,
    petioleFraction: 0.08,
    baseColor: COLOR,
    midribColor: COLOR,
    camberCellAt: (layer) => Math.round(Math.sin(Math.PI * layer / RADIAL.length) * 2),
  });
}

function actualVariantCandidates(
  variant: OakLeafVariantDescriptorV1,
): Readonly<{
  flat: readonly OakTissueFrontCandidateV1[];
  radial: readonly number[];
}> {
  const lengthM = 0.08;
  const layers = Math.round(lengthM / OAK_TISSUE_VOXEL_PITCH_M_V1);
  const radial = oakQuantizedLeafRadialsAtPitchV1(
    variant,
    layers,
    oakLeafWidthScaleMForDescriptorV1(0.0015, lengthM, variant),
    OAK_TISSUE_VOXEL_PITCH_M_V1,
  );
  return {
    radial,
    flat: oakTissueLeafCandidatesV1({
      layers,
      radialProfile: radial,
      petioleFraction: 0.07,
      baseColor: COLOR,
      midribColor: COLOR,
      camberCellAt: (layer) => Math.round(
        variant.camber * Math.sin(Math.PI * (layer + 0.5) / layers)
          * oakLeafWidthScaleMForDescriptorV1(0.0015, lengthM, variant)
          / OAK_TISSUE_VOXEL_PITCH_M_V1,
      ),
    }),
  };
}

function positionKey(candidate: OakTissueFrontCandidateV1): string {
  const { x, y, z } = candidate.local;
  return `${String(x)}/${String(y)}/${String(z)}`;
}

function identityKey(candidate: OakTissueFrontCandidateV1): string {
  return `${candidate.role}/${positionKey(candidate)}`;
}

function connected(values: readonly OakTissueFrontCandidateV1[]): boolean {
  const occupied = new Set(values.map(positionKey));
  const first = occupied.values().next().value as string | undefined;
  if (first === undefined) return false;
  const reached = new Set([first]);
  const queue = [first];
  for (const key of queue) {
    const [x, y, z] = key.split('/').map(Number) as [number, number, number];
    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const) {
      const neighbor = `${String(x + dx)}/${String(y + dy)}/${String(z + dz)}`;
      if (!occupied.has(neighbor) || reached.has(neighbor)) continue;
      reached.add(neighbor);
      queue.push(neighbor);
    }
  }
  return reached.size === occupied.size;
}

function leaf(chlorophyllFraction: number): OakLeafOrganSnapshotV1 {
  return {
    key: 'organ:900:1',
    identity: { localId: 900, generation: 1 },
    kind: 'leaf',
    parentKey: null,
    branchOrder: 1,
    ageDays: 220,
    positionM: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 1, z: 0 },
    lengthM: 0.08,
    radiusM: 0.001,
    targetLengthM: 0.08,
    targetRadiusM: 0.001,
    dryMassKg: 0.001,
    waterPotentialMpa: -0.3,
    pools: { carbonKg: 0, nitrogenKg: 0, phosphorusKg: 0, waterLiters: 0 },
    stage: 'senescing',
    developmentPhase: 'senescing',
    developmentFraction: 1,
    healthFraction: 1,
    stressFraction: 0.18,
    areaM2: 0.0015,
    targetAreaM2: 0.0015,
    inclinationRadians: Math.PI / 2,
    rollRadians: 0,
    chlorophyllFraction,
    relativeWaterContentFraction: 0.81,
  };
}

describe('oak leaf voxel anatomy', () => {
  it('uses only the species-grounded nine- and eleven-lobe family', () => {
    expect(new Set(OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(({ lobeCount }) => lobeCount)))
      .toEqual(new Set([9, 11]));
    for (const variant of OAK_LEAF_VARIANT_DESCRIPTORS_V1) {
      expect(deriveOakLeafLobeCountV1(variant.stationWidths), variant.id)
        .toBe(variant.lobeCount);
    }
    const broad = OAK_LEAF_VARIANT_DESCRIPTORS_V1.find(({ aspectClass }) =>
      aspectClass === 'broad')!;
    const narrow = OAK_LEAF_VARIANT_DESCRIPTORS_V1.find(({ aspectClass }) =>
      aspectClass === 'narrow')!;
    expect(broad.lobeCount).toBe(9);
    expect(narrow.lobeCount).toBe(9);
    expect(broad.stationWidths).not.toEqual(narrow.stationWidths);
  });

  it('adds two levels of side camber without adding cells or breaking the mask', () => {
    for (const variant of OAK_LEAF_VARIANT_DESCRIPTORS_V1) {
      const { flat, radial } = actualVariantCandidates(variant);
      const cambered = oakLeafTransverseCamberCandidatesV1(flat);
      expect(cambered, variant.id).toHaveLength(flat.length);
      expect(new Set(cambered.map(positionKey)).size, variant.id).toBe(cambered.length);
      expect(connected(cambered), variant.id).toBe(true);
      const maximumRadial = Math.max(...radial);
      const widestLayer = radial.findIndex((value) => value === maximumRadial);
      const sideLevels = new Set(cambered
        .filter(({ role, local }) => role === 'lamina-voxel' && local.y === widestLayer)
        .map(({ local }) => local.z));
      expect(sideLevels.size, variant.id).toBeGreaterThanOrEqual(3);
      const centerline = cambered.filter(({ role }) => role === 'midrib-voxel');
      for (let index = 1; index < centerline.length; index += 1) {
        expect(Math.abs(centerline[index]!.local.z - centerline[index - 1]!.local.z), variant.id)
          .toBeLessThanOrEqual(1);
      }
    }
  });

  it('spreads resolved blade folds while preserving paid area, volume, endpoints, and growth prefixes', () => {
    // Bound: all three oak shape families, held-out blade lengths and areas,
    // six paid prefixes, and half-blades with room for separated risers.
    // Restoring the old distance-2/3 risers makes the column-height check red.
    for (const variant of OAK_LEAF_VARIANT_DESCRIPTORS_V1) {
      for (const [lengthM, areaM2] of [[0.04, 0.0004], [0.08, 0.0015], [0.12, 0.0036]] as const) {
        const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
        const layers = Math.round(lengthM / pitch);
        const radial = oakQuantizedLeafRadialsAtPitchV1(variant, layers,
          oakLeafWidthScaleMForDescriptorV1(areaM2, lengthM, variant), pitch);
        const flat = oakTissueLeafCandidatesV1({ layers, radialProfile: radial,
          petioleFraction: 0.07, camberCellAt: () => 0,
          baseColor: COLOR, midribColor: COLOR });
        const folded = oakLeafTransverseCamberCandidatesV1(flat);
        const label = `${variant.id} ${String(lengthM)} m`;
        expect(folded, label).toHaveLength(flat.length);
        expect(new Set(folded.map(positionKey)).size, label).toBe(folded.length);
        expect(connected(folded), label).toBe(true);
        for (let row = 0; row < layers; row += 1) {
          const radius = radial[row]!;
          const section = folded.filter(({ local }) => local.y === row);
          const rise = Math.min(2, Math.max(0, radius - 1));
          expect(Math.max(...section.map(({ local }) => Math.abs(local.x))), label)
            .toBe(radius - rise);
          expect(Math.min(...section.map(({ local }) => local.z)), label).toBe(0 - rise);
          if (radius < 6) continue;
          const columns = new Map<number, number>();
          for (const { local } of section) columns.set(local.x, (columns.get(local.x) ?? 0) + 1);
          expect(Math.max(...columns.values()), `${label} row ${String(row)} rail height`)
            .toBeLessThanOrEqual(2);
        }
        for (const fraction of [0.02, 0.05, 0.15, 0.4, 0.8, 1]) {
          const budget = { layers, developmentFraction: fraction,
            currentAreaM2: areaM2 * fraction, targetAreaM2: areaM2,
            currentLengthM: lengthM * fraction, targetLengthM: lengthM };
          const before = oakTissueVisibleLeafCandidatesV1({ ...budget, candidates: flat });
          const after = oakTissueVisibleLeafCandidatesV1({ ...budget, candidates: folded });
          expect(after.map(({ role }) => role), label).toEqual(before.map(({ role }) => role));
          expect(after.map(({ local }) => local.y), label).toEqual(before.map(({ local }) => local.y));
          expect(new Set(after.map(positionKey)).size, label).toBe(after.length);
          expect(connected(after), label).toBe(true);
          // Only equal-size lamina cells move. Every mechanical petiole/midrib
          // section stays byte-identical, so section volume is also unchanged.
          expect(after.filter(({ role }) => role !== 'lamina-voxel'), label)
            .toEqual(before.filter(({ role }) => role !== 'lamina-voxel'));
          expect(after.filter(({ role }) => role === 'lamina-voxel').length * pitch ** 2, label)
            .toBe(before.filter(({ role }) => role === 'lamina-voxel').length * pitch ** 2);
          expect(after.filter(({ role }) => role === 'lamina-voxel').length * pitch ** 3, label)
            .toBe(before.filter(({ role }) => role === 'lamina-voxel').length * pitch ** 3);
        }
      }
    }
  });

  it('relabels a sparse secondary-vein rhythm without changing occupancy', () => {
    const flat = candidates();
    const veined = oakLeafSecondaryVeinCandidatesV1(flat, RADIAL);
    expect(veined.map(positionKey)).toEqual(flat.map(positionKey));
    const veins = veined.filter(({ role }) => role === 'secondary-vein-voxel');
    const lamina = veined.filter(({ role }) =>
      role === 'secondary-vein-voxel' || role === 'lamina-voxel');
    expect(veins.length).toBeGreaterThan(0);
    expect(veins.length / lamina.length).toBeLessThan(0.25);
  });

  it('advances nested anatomical senescence bands without checker islands', () => {
    const flat = candidates();
    const onset = oakLeafAnatomyColoredCandidatesV1(leaf(1), flat, RADIAL);
    const middle = oakLeafAnatomyColoredCandidatesV1(leaf(0.8), flat, RADIAL);
    const endpoint = oakLeafAnatomyColoredCandidatesV1(leaf(0.15), flat, RADIAL);
    const colorKey = (candidate: OakTissueFrontCandidateV1): string =>
      `${candidate.color.r}/${candidate.color.g}/${candidate.color.b}`;
    const onsetByKey = new Map(onset.map((candidate) => [identityKey(candidate), colorKey(candidate)]));
    const changed = (values: readonly OakTissueFrontCandidateV1[]): Set<string> => new Set(values
      .filter((candidate) => colorKey(candidate) !== onsetByKey.get(identityKey(candidate)))
      .map(identityKey));
    const middleChanged = changed(middle);
    const endpointChanged = changed(endpoint);
    expect(middleChanged.size).toBeGreaterThan(0);
    expect([...middleChanged].every((key) => endpointChanged.has(key))).toBe(true);
    expect(endpointChanged.size).toBe(flat.length);

    const changedPositions = new Set(middle
      .filter((candidate) => middleChanged.has(identityKey(candidate)))
      .map(positionKey));
    const isolated = [...changedPositions].filter((key) => {
      const [x, y, z] = key.split('/').map(Number) as [number, number, number];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            if ((dx !== 0 || dy !== 0 || dz !== 0) && changedPositions.has(
              `${String(x + dx)}/${String(y + dy)}/${String(z + dz)}`,
            )) return false;
          }
        }
      }
      return true;
    });
    expect(isolated).toEqual([]);
  });

  it('keeps living roles green and never restores green during decreasing senescent pigment', () => {
    const flat = candidates();
    for (const developmentFraction of [0.4, 0.7, 1]) {
      const living = oakLeafAnatomyColoredCandidatesV1({
        ...leaf(1), stage: 'mature', developmentPhase: 'maturing', developmentFraction,
      }, flat, RADIAL);
      expect(living.map(identityKey)).toEqual(
        oakLeafAnatomyColoredCandidatesV1(leaf(1), flat, RADIAL).map(identityKey),
      );
      for (const { color } of living) expect(color.g).toBeGreaterThan(color.r);
    }
    const lostGreen = new Set<string>();
    for (const chlorophyll of [1, 0.95, 0.9, 0.8, 0.65, 0.5, 0.4, 0.15]) {
      const values = oakLeafAnatomyColoredCandidatesV1(leaf(chlorophyll), flat, RADIAL);
      for (const candidate of values) {
        const key = identityKey(candidate);
        if (lostGreen.has(key)) expect(candidate.color.r, key).toBeGreaterThan(candidate.color.g);
        if (candidate.color.r > candidate.color.g) lostGreen.add(key);
      }
    }
    expect(lostGreen.size).toBe(flat.length);
  });
});
