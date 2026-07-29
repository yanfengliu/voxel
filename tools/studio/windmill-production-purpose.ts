import {
  WINDMILL_PRODUCTION_ASSETS_V1,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
  type WindmillProductionPlacementIdV1,
  type WindmillProductionRecipeIdV1,
} from './windmill-production-layout.js';

/**
 * Creator-local accountability for every authored production-line decision:
 * one record per exact visible box, one per deliberate void, one per
 * placement group, and one per authored presentation rule. The compact
 * mechanism's frozen ledger is untouched; these records extend the same
 * discipline to the additive content and are enforced by
 * windmill-production.test.ts plus the assets browser spec.
 */

export const WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1 = Object.freeze({
  wheatDelivery: 'windmill:motion:wheat-delivery-presentation',
  flourAccumulation: 'windmill:motion:flour-accumulation-presentation',
} as const);

export type WindmillProductionMotionRuleIdV1 =
  typeof WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1[
    keyof typeof WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1
  ];

/** The one honesty sentence every production surface repeats. */
export const WINDMILL_PRODUCTION_HONESTY_V1 =
  'Wheat and flour motion is authored presentation kinematics keyed to the '
  + 'five recorded hammer-anvil impacts; nothing simulates milling, grain, '
  + 'contact, or mass flow, and the consumer fixture still proves only '
  + 'wind, rotor, cam, hammer, and anvil dynamics.';

export interface WindmillProductionPurposeEntryV1 {
  readonly id: `windmill:purpose-record:${string}`;
  readonly needId: `windmill:purpose:${string}`;
  readonly boxKey: string;
  readonly recipeId: WindmillProductionRecipeIdV1;
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly smallestAdequateForm: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
  readonly boxes: readonly {
    readonly boxKey: string;
    readonly at: readonly [number, number, number];
    readonly size: readonly [number, number, number];
    readonly role: string;
  }[];
}

interface RecordSpecV1 {
  readonly boxKey: string;
  readonly needId: `windmill:purpose:${string}`;
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly smallestAdequateForm: string;
  readonly evidence: string;
  readonly honestyBoundary?: string;
}

const REVIEW_EVIDENCE =
  'Bound to this box\'s removal review variant and the bounded '
  + 'representative relocations under the declared fixed quarter cameras in '
  + 'tests/browser/model-studio-windmill-assets.spec.ts, and to the '
  + 'per-frame clearance gates in windmill-production-clearance.test.ts; '
  + 'relocation claims outside that representative set are structural '
  + 'statements checked by those clearance gates, not separate captures.';

const STRUCTURE_HONESTY =
  'Visible architecture only: no load, stress, weather, or shading is '
  + 'solved, and the building never touches the solver trace.';

const BUILDING_SPECS: readonly RecordSpecV1[] = [
  {
    boxKey: 'building-post-front-left',
    needId: 'windmill:purpose:building-roof-bearing',
    beneficiary: 'The roof slab over the northwest corner.',
    job: 'Carries the roof corner the two built walls cannot reach alone and '
      + 'marks the northwest limit of the sheltered bay.',
    locationDatum: 'Northwest footprint corner at world x -1.125..-0.875, '
      + 'z 0.5625..0.8125, one half-voxel behind the sail sweep plane.',
    removalFailure: 'The roof corner hangs unsupported over the rotor wall '
      + 'end and the building contradicts the nothing-floats need.',
    relocationFailure: 'Moved inward or outward it leaves the roof corner '
      + 'and the wall line it terminates.',
    smallestAdequateForm: 'One two-by-two post is the narrowest member that '
      + 'reads as structure beside the quarter-grain machine frame.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-post-front-right',
    needId: 'windmill:purpose:building-roof-bearing',
    beneficiary: 'The roof slab over the northeast corner.',
    job: 'Carries the roof corner beside the open east side so the opening '
      + 'reads as a doorway between post and wall, not a missing wall.',
    locationDatum: 'Northeast footprint corner at world x 3.875..4.125, '
      + 'z 0.5625..0.8125.',
    removalFailure: 'The roof corner floats beside the open side and the '
      + 'open front loses its framing edge.',
    relocationFailure: 'Moved along either axis it abandons the roof corner '
      + 'and the rotor-wall end it braces.',
    smallestAdequateForm: 'One two-by-two post, the same section as its '
      + 'three siblings.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-post-back-right',
    needId: 'windmill:purpose:building-roof-bearing',
    beneficiary: 'The roof slab over the southeast corner.',
    job: 'Carries the roof corner at the open working-bay corner the default '
      + 'camera looks into.',
    locationDatum: 'Southeast footprint corner at world x 3.875..4.125, '
      + 'z 2.8125..3.0625, behind the hammer bay.',
    removalFailure: 'The roof corner over the working bay floats and the '
      + 'open corner loses the frame that says a wall was left out on '
      + 'purpose.',
    relocationFailure: 'Moved it leaves the roof corner and crowds either '
      + 'the flour bin or the spent-sack row.',
    smallestAdequateForm: 'One two-by-two post, matching its three siblings.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-post-back-left',
    needId: 'windmill:purpose:building-roof-bearing',
    beneficiary: 'The roof slab over the southwest corner.',
    job: 'Carries the roof corner where the west wall ends.',
    locationDatum: 'Southwest footprint corner at world x -1.125..-0.875, '
      + 'z 2.8125..3.0625.',
    removalFailure: 'The roof corner behind the west wall floats.',
    relocationFailure: 'Moved it leaves the roof corner and the west wall '
      + 'line it terminates.',
    smallestAdequateForm: 'One two-by-two post, the shared corner section.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-left-pier',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The rotor-outside, mill-inside boundary.',
    job: 'Closes the rotor wall between the northwest post and the ground '
      + 'tie notch.',
    locationDatum: 'Rotor wall plane z 0.5625..0.6875, west of the tie '
      + 'notch at world x -0.875..-0.625.',
    removalFailure: 'A hole opens beside the northwest post and the wall '
      + 'stops separating the outdoor rotor from the bay.',
    relocationFailure: 'Moved off the wall plane it leaves the one built '
      + 'surface between the sail sweep and the rear bearing.',
    smallestAdequateForm: 'One voxel thick, the thinnest buildable plane at '
      + 'the building grain.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-notch-header',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The rotor-outside, mill-inside boundary and the tie notch.',
    job: 'Spans the wall over the ground-tie notch so the notch reads as a '
      + 'deliberate pass-through, not damage.',
    locationDatum: 'Directly above the tie notch, world x -0.625..-0.125, '
      + 'y 0.375..1.25 in the rotor wall plane.',
    removalFailure: 'The notch merges with the shaft-opening jamb region '
      + 'into one ragged breach and the tie passage loses its lintel.',
    relocationFailure: 'Moved it abandons the notch it spans and punches an '
      + 'unexplained hole elsewhere in the wall.',
    smallestAdequateForm: 'Exactly the notch width by the band up to the '
      + 'opening sill height.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-opening-jamb',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The shaft opening and its readable frame.',
    job: 'Forms the west jamb of the shaft opening so the opening has a '
      + 'readable frame on both sides.',
    locationDatum: 'West of the shaft opening, world x -0.625..-0.25, '
      + 'y 1.25..2.0 in the rotor wall plane.',
    removalFailure: 'The shaft opening merges leftward into the notch '
      + 'header band and stops reading as a sized passage for the shaft.',
    relocationFailure: 'Moved it either narrows the opening onto the shaft '
      + 'sweep or abandons the jamb line.',
    smallestAdequateForm: 'The exact band between notch header and lintel '
      + 'beside the opening.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-lintel',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The shaft opening and the wall above it.',
    job: 'Closes the wall above the shaft opening so the wall continues to '
      + 'the roof line over the passage.',
    locationDatum: 'Above the shaft opening, world x -0.625..0.5, '
      + 'y 2.0..2.625 in the rotor wall plane.',
    removalFailure: 'The shaft opening becomes a full-height breach to the '
      + 'roof and the wall reads as collapsed over the shaft.',
    relocationFailure: 'Moved down it enters the shaft clearance envelope; '
      + 'moved aside it leaves the opening unclosed above.',
    smallestAdequateForm: 'The exact strip from opening top to roof line.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-sill',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The shaft opening and the wall below it.',
    job: 'Closes the wall below the shaft opening down to the ground.',
    locationDatum: 'Below the shaft opening, world x -0.125..0.5, '
      + 'y 0..1.25 in the rotor wall plane.',
    removalFailure: 'The opening extends to the ground and reads as a '
      + 'doorway under the shaft instead of a shaft passage.',
    relocationFailure: 'Moved it either blocks the tie notch or leaves the '
      + 'under-shaft wall open.',
    smallestAdequateForm: 'The exact panel from ground to opening sill.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-rotor-wall-right-pier',
    needId: 'windmill:purpose:rotor-bay-separation',
    beneficiary: 'The rotor-outside, mill-inside boundary.',
    job: 'Closes the rotor wall from the shaft opening to the northeast '
      + 'post, the longest built surface the sails sweep past.',
    locationDatum: 'Rotor wall plane z 0.5625..0.6875, world x 0.5..3.875.',
    removalFailure: 'Most of the rotor wall vanishes; the sails sweep past '
      + 'open air and the bay loses its outdoor boundary.',
    relocationFailure: 'Moved toward the rotor it enters the sail sweep '
      + 'plane; moved inward it collides with the rear bearing span.',
    smallestAdequateForm: 'One voxel thick over the remaining wall extent.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-side-wall',
    needId: 'windmill:purpose:west-enclosure',
    beneficiary: 'The building silhouette and the rear-quarter review view.',
    job: 'Closes the west side so the building reads as a sheltered '
      + 'structure from the rear-quarter camera while both view-side faces '
      + 'stay open.',
    locationDatum: 'West face, world x -1.125..-1.0, z 0.8125..2.8125, '
      + 'clear of the cam sweep disc by 0.24 world units.',
    removalFailure: 'Every side is open; the roof floats on posts and the '
      + 'artifact reads as a canopy, not a mill building.',
    relocationFailure: 'Moved east it enters the cam sweep envelope; moved '
      + 'west it leaves its posts and the roof edge.',
    smallestAdequateForm: 'One voxel thick between the two west posts.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'building-roof',
    needId: 'windmill:purpose:mill-roof-shelter',
    beneficiary: 'The housed-mill reading of the whole scene.',
    job: 'Covers the working bay so the machine reads as indoors, while the '
      + '30-degree default camera still sees the whole interior under its '
      + 'open edges.',
    locationDatum: 'One slab at world y 2.625..2.75 over the full '
      + 'footprint, clearing the cam-nose sweep radius by 0.116 world units.',
    removalFailure: 'The walls and posts enclose nothing; the scene reads '
      + 'as machinery beside two freestanding walls.',
    relocationFailure: 'Raised it floats off its posts; lowered it enters '
      + 'the cam-nose sweep; shifted it overhangs the sail sweep.',
    smallestAdequateForm: 'One voxel thick, exactly the footprint.',
    evidence: REVIEW_EVIDENCE,
  },
];

const SACK_SPECS: readonly RecordSpecV1[] = [
  {
    boxKey: 'sack-body',
    needId: 'windmill:purpose:grain-infeed-mass',
    beneficiary: 'The visible grain-mass source and the milling story.',
    job: 'Is the unit of wheat the mill consumes: five placements form the '
      + 'finite infeed magazine, one is delivered per recorded impact.',
    locationDatum: 'Queue slots along world z 0.875 east of the rear '
      + 'bearing, then the milling spot against the anvil west face.',
    removalFailure: 'Nothing visible enters the mill; the flour level rises '
      + 'from nowhere and the material source becomes an event without a '
      + 'thing.',
    relocationFailure: 'Off the queue line or milling spot the delivery no '
      + 'longer reads as feeding the anvil the hammer strikes.',
    smallestAdequateForm: 'A three-by-four-by-three body is the smallest '
      + 'sack that still reads as burlap beside the quarter-grain machine.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
  {
    boxKey: 'sack-tie',
    needId: 'windmill:purpose:sack-orientation-cue',
    beneficiary: 'The spent-versus-full reading of the sack rows.',
    job: 'Marks the sack top so a tipped-over spent sack in the discard row '
      + 'is visibly the same object lying down, not a different prop.',
    locationDatum: 'Centered on the body top, one prop voxel.',
    removalFailure: 'Standing and lying sacks lose their only orientation '
      + 'cue and the spent row stops reading as emptied sacks.',
    relocationFailure: 'Off-center or lower it no longer marks the tied '
      + 'neck the roll rotates through ninety degrees.',
    smallestAdequateForm: 'One voxel, the smallest visible cue.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
];

const BIN_SPECS: readonly RecordSpecV1[] = [
  {
    boxKey: 'bin-floor',
    needId: 'windmill:purpose:flour-rest-datum',
    beneficiary: 'The flour level prop resting on it.',
    job: 'Gives the flour level its rest datum: the authored frame-zero '
      + 'flour pose stands exactly on this face.',
    locationDatum: 'World y 0..0.125 across the bin footprint beside the '
      + 'anvil east face.',
    removalFailure: 'The flour level floats inside a bottomless frame and '
      + 'its rest height loses its visible support.',
    relocationFailure: 'Moved it separates from its own walls and from the '
      + 'flour pose that starts on it.',
    smallestAdequateForm: 'One voxel thick under the cavity.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'bin-wall-north',
    needId: 'windmill:purpose:flour-level-rim',
    beneficiary: 'The readable flour level inside.',
    job: 'Forms the anvil-side rim the rising level is read against and '
      + 'hides the gap under the raised flour prop.',
    locationDatum: 'North bin edge, world z 1.3125..1.4375.',
    removalFailure: 'The flour prop\'s underside shows from the north and '
      + 'the level reads as a floating slab, not contents.',
    relocationFailure: 'Moved it opens the cavity on the side facing the '
      + 'milling spot.',
    smallestAdequateForm: 'One voxel thick, two high: the lowest rim that '
      + 'still hides the raised prop underside.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'bin-wall-south',
    needId: 'windmill:purpose:flour-level-rim',
    beneficiary: 'The readable flour level inside.',
    job: 'Forms the south rim segment, closing the cavity toward the back '
      + 'posts.',
    locationDatum: 'South bin edge, world z 1.8125..1.9375.',
    removalFailure: 'The cavity opens south and the underside of the raised '
      + 'level shows from the rear-quarter camera.',
    relocationFailure: 'Moved it leaves the floor edge and its two '
      + 'neighboring rim segments.',
    smallestAdequateForm: 'One voxel thick, two high.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'bin-wall-west',
    needId: 'windmill:purpose:flour-level-rim',
    beneficiary: 'The readable flour level inside.',
    job: 'Forms the rim segment against the anvil so the bin visibly '
      + 'receives from the milling side.',
    locationDatum: 'West bin edge, world x 3.3125..3.4375, one quarter '
      + 'voxel east of the anvil.',
    removalFailure: 'The cavity opens toward the anvil and the level reads '
      + 'as spilling out of the receiving side.',
    relocationFailure: 'Moved east it crowds the cavity; moved west it '
      + 'intersects the anvil column.',
    smallestAdequateForm: 'One voxel thick between the corner segments.',
    evidence: REVIEW_EVIDENCE,
  },
  {
    boxKey: 'bin-wall-east',
    needId: 'windmill:purpose:flour-level-rim',
    beneficiary: 'The readable flour level inside.',
    job: 'Forms the rim segment on the open-side face the default camera '
      + 'reads the level against.',
    locationDatum: 'East bin edge, world x 3.8125..3.9375.',
    removalFailure: 'The default camera sees under the raised level and the '
      + 'fill reads as a hovering slab.',
    relocationFailure: 'Moved it leaves the floor edge and the rim line.',
    smallestAdequateForm: 'One voxel thick, two high.',
    evidence: REVIEW_EVIDENCE,
  },
];

const FLOUR_SPECS: readonly RecordSpecV1[] = [
  {
    boxKey: 'flour-level-body',
    needId: 'windmill:purpose:flour-output-level',
    beneficiary: 'The read surface above it and the fill reading.',
    job: 'Is the flour mass under the read surface, so the level fills the '
      + 'cavity as contents rather than hovering as a sheet.',
    locationDatum: 'The lower two prop voxels of the level, starting on the '
      + 'bin floor inside the cavity.',
    removalFailure: 'The read surface becomes a paper-thin floating sheet '
      + 'with visible air underneath from the open east side.',
    relocationFailure: 'Detached from the surface it no longer carries the '
      + 'one level the rim is read against.',
    smallestAdequateForm: 'Two prop voxels of depth: the least mass that '
      + 'still fills the visible cavity height at frame zero.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
  {
    boxKey: 'flour-level-surface',
    needId: 'windmill:purpose:flour-output-level',
    beneficiary: 'The milled-output half of the production story.',
    job: 'Is the read face of the flour level: its height against the bin '
      + 'rim is the one datum that says how much the mill has produced.',
    locationDatum: 'The top prop voxel of the level: its face starts one '
      + 'prop voxel (0.0625) below the rim at 0.375 and ends 0.125 — two '
      + 'prop voxels — proud of it across the five impacts.',
    removalFailure: 'The level loses its read face and the rise stops '
      + 'registering against the rim at the fixed cameras.',
    relocationFailure: 'Off the body the surface reads as a lid floating '
      + 'over the mass instead of the top of it.',
    smallestAdequateForm: 'One prop voxel of thickness: the thinnest face '
      + 'that still reads as a surface, not a color seam.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
];

const SPECS_BY_RECIPE: Readonly<
Record<WindmillProductionRecipeIdV1, readonly RecordSpecV1[]>
> = Object.freeze({
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.building]: BUILDING_SPECS,
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack]: SACK_SPECS,
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin]: BIN_SPECS,
  [WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap]: FLOUR_SPECS,
});

function entriesFor(
  recipeId: WindmillProductionRecipeIdV1,
): readonly WindmillProductionPurposeEntryV1[] {
  const asset = WINDMILL_PRODUCTION_ASSETS_V1.find(
    (candidate) => candidate.recipeId === recipeId,
  );
  const specs = SPECS_BY_RECIPE[recipeId];
  if (asset === undefined) {
    throw new Error(
      `Cannot build windmill production purposes: recipe '${recipeId}' has `
      + 'no layout asset.',
    );
  }
  if (specs.length !== asset.boxes.length) {
    throw new Error(
      `Cannot build windmill production purposes for '${recipeId}': `
      + `${String(specs.length)} records cover ${String(asset.boxes.length)} `
      + 'authored boxes. Every exact box needs exactly one record.',
    );
  }
  return Object.freeze(asset.boxes.map((box, index) => {
    const spec = specs[index]!;
    if (spec.boxKey !== box.boxKey) {
      throw new Error(
        `Cannot build windmill production purposes for '${recipeId}': record `
        + `${String(index)} names '${spec.boxKey}' but the authored box is `
        + `'${box.boxKey}'. Keep the ledger in exact authored order.`,
      );
    }
    return Object.freeze({
      id: `windmill:purpose-record:${box.boxKey}` as const,
      needId: spec.needId,
      boxKey: box.boxKey,
      recipeId,
      beneficiary: spec.beneficiary,
      job: spec.job,
      locationDatum: spec.locationDatum,
      removalFailure: spec.removalFailure,
      relocationFailure: spec.relocationFailure,
      smallestAdequateForm: spec.smallestAdequateForm,
      evidence: spec.evidence,
      honestyBoundary: spec.honestyBoundary ?? STRUCTURE_HONESTY,
      boxes: Object.freeze([Object.freeze({
        boxKey: box.boxKey,
        at: box.at,
        size: box.size,
        role: box.role,
      })]),
    });
  }));
}

export const WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1:
readonly WindmillProductionPurposeEntryV1[] = Object.freeze([
  ...entriesFor(WINDMILL_PRODUCTION_RECIPE_IDS_V1.building),
  ...entriesFor(WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack),
  ...entriesFor(WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin),
  ...entriesFor(WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap),
]);

export const WINDMILL_PRODUCTION_PURPOSE_BY_BOX_KEY_V1 = Object.freeze(
  Object.fromEntries(WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(
    (entry) => [entry.boxKey, entry],
  )),
) as Readonly<Record<string, WindmillProductionPurposeEntryV1>>;

/** A deliberate authored void with its own falsifiable record. */
export interface WindmillProductionVoidPurposeV1 {
  readonly id: `windmill:purpose-record:${string}`;
  readonly needId: `windmill:purpose:${string}`;
  readonly voidKey: string;
  readonly recipeId: WindmillProductionRecipeIdV1;
  readonly job: string;
  readonly locationDatum: string;
  readonly fillFailure: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
}

export const WINDMILL_PRODUCTION_VOID_PURPOSES_V1:
readonly WindmillProductionVoidPurposeV1[] = Object.freeze([
  Object.freeze({
    id: 'windmill:purpose-record:building-shaft-opening' as const,
    needId: 'windmill:purpose:shaft-wall-passage' as const,
    voidKey: 'building-shaft-opening',
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.building,
    job: 'Lets the rotor shaft cross the rotor wall: a six-by-six-voxel '
      + 'passage centered on the frozen axis datum with 0.198 world units '
      + 'of clearance around the shaft\'s swept cylinder.',
    locationDatum: 'World x -0.25..0.5, y 1.25..2.0 in the rotor wall '
      + 'plane, centered on the rotor axis at (0.125, 1.625).',
    fillFailure: 'A filled wall intersects the shaft\'s swept cylinder: the '
      + 'rotor would visibly turn through solid masonry every frame.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: 'A visual passage only; no bearing, seal, or wall '
      + 'loading at the crossing is claimed.',
  }),
  Object.freeze({
    id: 'windmill:purpose-record:building-tie-notch' as const,
    needId: 'windmill:purpose:tie-wall-passage' as const,
    voidKey: 'building-tie-notch',
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.building,
    job: 'Lets the frame\'s rotor-bearing ground tie run under the rotor '
      + 'wall with an eighth-unit gap on every face.',
    locationDatum: 'World x -0.625..-0.125, y 0..0.375 at the rotor wall '
      + 'base, around the tie at x -0.5..-0.25, y 0..0.25.',
    fillFailure: 'A filled base course intersects the frozen frame\'s '
      + 'ground tie, which the scene may never overlap or move.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: 'A visual pass-through only; the wall bears on nothing '
      + 'and the tie carries no solved load.',
  }),
]);

/** Placement- and rule-level accountability for the production line. */
export interface WindmillProductionSystemPurposeV1 {
  readonly id: `windmill:system-purpose:${string}`;
  readonly kind: 'placement' | 'placement-group' | 'presentation-rule';
  readonly subjectIds: readonly (
    WindmillProductionPlacementIdV1 | WindmillProductionMotionRuleIdV1
  )[];
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly smallestAdequateForm: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
}

export const WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1:
readonly WindmillProductionSystemPurposeV1[] = Object.freeze([
  Object.freeze({
    id: 'windmill:system-purpose:mill-building' as const,
    kind: 'placement' as const,
    subjectIds: Object.freeze(
      [WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building],
    ),
    beneficiary: 'The housed-mill reading and both fixed review cameras.',
    job: 'Houses the mechanism: rotor and sails outside the rotor wall, '
      + 'working bay inside, with the east and south faces open so the '
      + 'default camera sees the whole production line.',
    locationDatum: 'Placement center (1.5, 0, 1.8125); the rotor wall plane '
      + 'sits one half building voxel behind the sail sweep plane at z 0.5.',
    removalFailure: 'The scene loses its stated setting: the mill becomes '
      + 'bare machinery with a wheat queue standing in a field.',
    relocationFailure: 'Any shift drives a wall or post into the sail, '
      + 'collar, or cam sweep envelopes or tears the shaft opening off the '
      + 'frozen axis datum.',
    smallestAdequateForm: 'Two walls, four posts, one roof: the fewest '
      + 'built surfaces that still read as a building from the rear '
      + 'quarter while hiding nothing from the front quarter.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: STRUCTURE_HONESTY,
  }),
  Object.freeze({
    id: 'windmill:system-purpose:wheat-infeed-magazine' as const,
    kind: 'placement-group' as const,
    subjectIds: WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks,
    beneficiary: 'The visible grain-mass source.',
    job: 'Five sacks queue as the finite infeed magazine — one deterministic '
      + 'rule, one sack per recorded impact, nearest slot delivered first.',
    locationDatum: 'Queue slots at world x 2.5 down to 1.25 in steps of '
      + '0.3125, z 0.875, between the rotor wall and the hammer bay.',
    removalFailure: 'The mill consumes nothing visible and the flour level '
      + 'rises from nowhere, contradicting the declared material source.',
    relocationFailure: 'Off the queue line the magazine no longer reads as '
      + 'staged input to the milling spot the sacks slide to.',
    smallestAdequateForm: 'Five sacks: exactly one per qualified recorded '
      + 'impact, none spare.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
  Object.freeze({
    id: 'windmill:system-purpose:flour-outfeed' as const,
    kind: 'placement-group' as const,
    subjectIds: Object.freeze([
      WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin,
      WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
    ]),
    beneficiary: 'The milled-output half of the production story.',
    job: 'The bin receives beside the anvil and the level inside it is the '
      + 'one visible measure of accumulated output.',
    locationDatum: 'Bin centered at (3.625, 0, 1.625) against the anvil '
      + 'east face; the level starts on the bin floor.',
    removalFailure: 'Impacts have no visible product; the wheat sacks '
      + 'vanish into a mill that makes nothing.',
    relocationFailure: 'Away from the anvil the accumulation no longer '
      + 'reads as receiving what the hammer pounds.',
    smallestAdequateForm: 'One bin and one level prop; a second container '
      + 'or loose flour piles would add mass with no new information.',
    evidence: REVIEW_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
  Object.freeze({
    id: 'windmill:system-purpose:wheat-delivery-rule' as const,
    kind: 'presentation-rule' as const,
    subjectIds: Object.freeze(
      [WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.wheatDelivery],
    ),
    beneficiary: 'The wheat-to-anvil half of the production story.',
    job: 'Slides sack k from its queue slot to the milling spot before '
      + 'recorded impact k, then tips it spent into the discard row — all '
      + 'derived from the committed trace\'s impact ticks.',
    locationDatum: 'Keyed to the five anvil-impact events of the committed '
      + 'trace; paths run along z 0.875, x 2.8125, z 1.625, and z 2.03125.',
    removalFailure: 'Sacks stand still forever; the infeed magazine and the '
      + 'flour level lose their causal reading against the impacts.',
    relocationFailure: 'Re-keyed to any other times the deliveries detach '
      + 'from the only recorded events that justify them.',
    smallestAdequateForm: 'Straight slides, one edge-pivot tip, and rests; '
      + 'no curve, bounce, or flourish beyond what the story needs.',
    evidence: 'Bound to the replay generation test\'s frame-zero and '
      + 'schedule gates plus the clearance test\'s per-frame envelope '
      + 'checks against the committed channels.',
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
  Object.freeze({
    id: 'windmill:system-purpose:flour-accumulation-rule' as const,
    kind: 'presentation-rule' as const,
    subjectIds: Object.freeze(
      [WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.flourAccumulation],
    ),
    beneficiary: 'The milled-output half of the production story.',
    job: 'Raises the flour level one fixed step shortly after each recorded '
      + 'impact, holding between impacts.',
    locationDatum: 'Keyed to the same five anvil-impact events; each step '
      + 'is 0.0375 world units over 0.4 seconds.',
    removalFailure: 'The bin stays at its opening level and the mill '
      + 'visibly produces nothing across all five impacts.',
    relocationFailure: 'Steps keyed to other times or other amounts would '
      + 'claim output the recorded impacts do not attribute.',
    smallestAdequateForm: 'One rigid level with five equal 0.0375 steps, '
      + 'ending 0.125 world units proud of the rim.',
    evidence: 'Bound to the replay generation test\'s frame-zero and '
      + 'schedule gates, the clearance test\'s rim datums, and the browser '
      + 'flour-phase captures.',
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
]);
