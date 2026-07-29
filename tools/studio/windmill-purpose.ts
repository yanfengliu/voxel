import type {
  WindmillCompactAppearancePurposeV1,
  WindmillCompactBoxPurposeV1,
} from './windmill-compact-creative.js';
import {
  createWindmillCompactCreativeV1,
} from './windmill-compact-creative.js';
import type {
  WindmillCompactMaterialProfileV1,
  WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_RECIPE_IDS_V1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';
import {
  WINDMILL_INTENDED_VIEW_PROOF_V1,
} from './windmill-intended-view-proof.js';

/** Roles are data-driven by the selected compact appearance ledger. */
export type WindmillVisibleRoleV1 = string;

export interface WindmillPurposeBoxV1 {
  readonly boxKey: string;
  readonly at: WindmillCompactTripleV1;
  readonly size: WindmillCompactTripleV1;
  readonly role: WindmillVisibleRoleV1;
  readonly materialProfile: WindmillCompactMaterialProfileV1;
}

export interface WindmillPurposeEntryV1 {
  /** Unique evidence record for this exact visible box. */
  readonly id: `windmill:purpose-record:${string}`;
  /** Shared need identity when several solids implement one load-path job. */
  readonly needId: `windmill:purpose:${string}`;
  readonly boxKey: string;
  readonly recipeId: WindmillRecipeIdV1;
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly smallestAdequateForm: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
  readonly selectedDynamicProof: null;
  readonly appearance: WindmillCompactAppearancePurposeV1;
  /** One exact box per record prevents a broad story from hiding an orphan. */
  readonly boxes: readonly WindmillPurposeBoxV1[];
}

const CREATIVE = createWindmillCompactCreativeV1(
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
);

function entry(
  recipeId: WindmillRecipeIdV1,
  box: {
    readonly boxKey: string;
    readonly purposeId: `windmill:purpose:${string}`;
    readonly role: string;
    readonly materialProfile: WindmillCompactMaterialProfileV1;
    readonly at: WindmillCompactTripleV1;
    readonly size: WindmillCompactTripleV1;
    readonly purpose: WindmillCompactBoxPurposeV1;
    readonly appearance: WindmillCompactAppearancePurposeV1;
  },
): WindmillPurposeEntryV1 {
  const exactBox = Object.freeze({
    boxKey: box.boxKey,
    at: box.at,
    size: box.size,
    role: box.role,
    materialProfile: box.materialProfile,
  });
  const appearance = Object.freeze({
    ...box.appearance,
    intendedViewEvidence:
      `${box.appearance.intendedViewEvidence.replace(
        '; fixed-camera visibility remains unbound.',
        '.',
      )} Selected catalog evidence binds this exact box to canonical front/side `
      + 'model captures, and every exact box removal to the first passing view '
      + 'among the declared front- and rear-quarter cameras, using declared '
      + 'footprint and raster-difference thresholds. Relocation is structurally '
      + 'tested for every exact box; bounded representative relocations have '
      + 'visual artifacts under the same declared cameras and thresholds.',
    intendedViewProof: WINDMILL_INTENDED_VIEW_PROOF_V1,
  });
  return Object.freeze({
    id: `windmill:purpose-record:${box.boxKey}`,
    needId: box.purposeId,
    boxKey: box.boxKey,
    recipeId,
    beneficiary: box.purpose.beneficiary,
    job: box.purpose.job,
    locationDatum: box.purpose.locationDatum,
    removalFailure: box.purpose.removalFailure,
    relocationFailure: box.purpose.relocationFailure,
    smallestAdequateForm: box.purpose.minimumForm,
    evidence:
      `${box.purpose.evidence} ${appearance.intendedViewEvidence}`,
    honestyBoundary:
      `${box.purpose.honestyBoundary} ${appearance.honestyBoundary} `
      + WINDMILL_INTENDED_VIEW_PROOF_V1.honestyBoundary,
    selectedDynamicProof: null,
    appearance,
    boxes: Object.freeze([exactBox]),
  });
}

const BY_ASSET = Object.freeze({
  frame: Object.freeze(CREATIVE.assets.frame.boxes.map((box) =>
    entry(WINDMILL_RECIPE_IDS_V1.frame, box))),
  rotor: Object.freeze(CREATIVE.assets.rotor.boxes.map((box) =>
    entry(WINDMILL_RECIPE_IDS_V1.rotor, box))),
  hammer: Object.freeze(CREATIVE.assets.hammer.boxes.map((box) =>
    entry(WINDMILL_RECIPE_IDS_V1.hammer, box))),
  anvil: Object.freeze(CREATIVE.assets.anvil.boxes.map((box) =>
    entry(WINDMILL_RECIPE_IDS_V1.anvil, box))),
});

export const WINDMILL_PURPOSE_LEDGER_V1: readonly WindmillPurposeEntryV1[] =
  Object.freeze([
    ...BY_ASSET.frame,
    ...BY_ASSET.rotor,
    ...BY_ASSET.hammer,
    ...BY_ASSET.anvil,
  ]);

export const WINDMILL_PURPOSE_BY_BOX_KEY_V1 =
  Object.freeze(Object.fromEntries(WINDMILL_PURPOSE_LEDGER_V1.map(
    (purpose) => [purpose.boxKey, purpose],
  ))) as Readonly<Record<string, WindmillPurposeEntryV1>>;

export function windmillPurposeEntriesForRecipe(
  recipeId: WindmillRecipeIdV1,
): readonly WindmillPurposeEntryV1[] {
  return WINDMILL_PURPOSE_LEDGER_V1.filter(
    (entryValue) => entryValue.recipeId === recipeId,
  );
}
