import { deterministicSinV1 } from '../deterministic-math.js';
import {
  oakTissueLeafCandidatesV1,
  oakTissueVisibleLeafCandidatesV1,
  type OakTissueFrontCandidateV1,
} from './oak-tissue-development-front.js';
import {
  OAK_LEAF_PETIOLE_FRACTION_V1,
  OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
  oakLeafVariantForOrganKeyV1,
  oakLeafWidthScaleMForDescriptorV1,
  type OakLeafVariantDescriptorV1,
} from './oak-leaf-shape.js';
import {
  oakLeafAnatomyColoredCandidatesV1,
  oakLeafTransverseCamberCandidatesV1,
} from './oak-leaf-voxel-anatomy.js';
import { oakLeafColorV1 } from './oak-render-projection.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';
import { OAK_MIN_RENDER_SHAFT_LENGTH_M_V1 } from './oak-wood-shape.js';

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function oakEasedLeafHalfWidthV1(
  variant: OakLeafVariantDescriptorV1,
  t: number,
): number {
  if (t <= OAK_LEAF_PETIOLE_FRACTION_V1) {
    return OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1;
  }
  const controls = [
    OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1,
    ...variant.stationWidths,
    0,
  ];
  const scaled = (t - OAK_LEAF_PETIOLE_FRACTION_V1)
    / (1 - OAK_LEAF_PETIOLE_FRACTION_V1) * (controls.length - 1);
  const index = Math.min(controls.length - 2, Math.floor(scaled));
  const u = Math.max(0, Math.min(1, scaled - index));
  const eased = u ** 3 * (u * (u * 6 - 15) + 10);
  return controls[index]! + (controls[index + 1]! - controls[index]!) * eased;
}

export function oakQuantizedLeafRadialsAtPitchV1(
  variant: OakLeafVariantDescriptorV1,
  layers: number,
  widthScaleM: number,
  pitchM: number,
): number[] {
  const radial = Array.from({ length: layers }, (_, layer) => {
    const t = (layer + .5) / layers;
    if (t < OAK_LEAF_PETIOLE_FRACTION_V1) return 0;
    return Math.max(0, Math.floor(
      oakEasedLeafHalfWidthV1(variant, t) * widthScaleM / pitchM + .45,
    ));
  });
  const controls = [OAK_LEAF_PETIOLE_NORMALIZED_HALF_WIDTH_V1, ...variant.stationWidths, 0];
  for (let index = 1; index < controls.length - 1; index += 1) {
    if (!(controls[index]! > controls[index - 1]! && controls[index]! > controls[index + 1]!)) {
      continue;
    }
    const bladeT = index / (controls.length - 1);
    const t = OAK_LEAF_PETIOLE_FRACTION_V1 + bladeT * (1 - OAK_LEAF_PETIOLE_FRACTION_V1);
    const layer = Math.max(1, Math.min(layers - 2, Math.round(t * layers - .5)));
    radial[layer] = Math.max(radial[layer]!, radial[layer - 1]! + 1, radial[layer + 1]! + 1);
  }
  return radial;
}

/** Derive the connected, development-paid local mask for one leaf organ. */
export function oakVisibleLeafTissueCandidatesV1(
  leaf: OakLeafOrganSnapshotV1,
  pitchM: number,
): readonly OakTissueFrontCandidateV1[] {
  const variant = oakLeafVariantForOrganKeyV1(leaf.key);
  const lengthM = Math.max(leaf.targetLengthM, OAK_MIN_RENDER_SHAFT_LENGTH_M_V1);
  const widthScaleM = oakLeafWidthScaleMForDescriptorV1(leaf.targetAreaM2, lengthM, variant);
  const layers = Math.max(1, Math.round(lengthM / pitchM));
  const radialProfile = oakQuantizedLeafRadialsAtPitchV1(
    variant,
    layers,
    widthScaleM,
    pitchM,
  );
  const base = oakLeafColorV1(leaf);
  const flatCandidates = oakTissueLeafCandidatesV1({
    layers,
    radialProfile,
    petioleFraction: OAK_LEAF_PETIOLE_FRACTION_V1,
    baseColor: base,
    midribColor: {
      r: clampByte(base.r + 13),
      g: clampByte(base.g + 20),
      b: clampByte(base.b + 5),
      a: 255,
    },
    camberCellAt: (layer) => {
      const t = (layer + .5) / layers;
      const bladeT = Math.max(0, (t - OAK_LEAF_PETIOLE_FRACTION_V1)
        / (1 - OAK_LEAF_PETIOLE_FRACTION_V1));
      return Math.round(variant.camber * deterministicSinV1(Math.PI * bladeT) * widthScaleM / pitchM);
    },
  });
  const candidates = oakLeafTransverseCamberCandidatesV1(
    oakLeafAnatomyColoredCandidatesV1(leaf, flatCandidates, radialProfile),
  );
  return oakTissueVisibleLeafCandidatesV1({
    candidates,
    layers,
    developmentFraction: leaf.developmentFraction,
    currentAreaM2: leaf.areaM2,
    targetAreaM2: leaf.targetAreaM2,
    currentLengthM: leaf.lengthM,
    targetLengthM: leaf.targetLengthM,
  });
}
