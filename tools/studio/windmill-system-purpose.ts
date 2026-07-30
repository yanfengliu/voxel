import {
  WINDMILL_COMPACT_ROLE_COLORS_V1,
} from './windmill-compact-creative.js';
import {
  WINDMILL_COMPACT_SELECTED_CANDIDATE_V1,
  WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
} from './windmill-compact-selection.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_RECIPE_IDS_V1,
  type WindmillPlacementIdV1,
  type WindmillRecipeIdV1,
} from './windmill-layout.js';
import {
  WINDMILL_PRODUCTION_RECIPE_IDS_V1,
  type WindmillProductionRecipeIdV1,
} from './windmill-production-layout.js';
import type { WindmillVisibleRoleV1 } from './windmill-purpose.js';

export const WINDMILL_MOTION_RULE_IDS_V1 = Object.freeze({
  sailLoads: Object.freeze({
    'north-sail': 'windmill:motion:sail-load-north',
    'south-sail': 'windmill:motion:sail-load-south',
  } as const),
  rotorRevolute: 'windmill:motion:rotor-revolute',
  camContactRelease: 'windmill:motion:cam-contact-release',
  hammerRevoluteGravity:
    'windmill:motion:hammer-revolute-gravity-return',
  anvilImpact: 'windmill:motion:anvil-impact',
});

export type WindmillMotionRuleIdV1 =
  | typeof WINDMILL_MOTION_RULE_IDS_V1.sailLoads[
    keyof typeof WINDMILL_MOTION_RULE_IDS_V1.sailLoads
  ]
  | typeof WINDMILL_MOTION_RULE_IDS_V1.rotorRevolute
  | typeof WINDMILL_MOTION_RULE_IDS_V1.camContactRelease
  | typeof WINDMILL_MOTION_RULE_IDS_V1.hammerRevoluteGravity
  | typeof WINDMILL_MOTION_RULE_IDS_V1.anvilImpact;

export interface WindmillSystemPurposeEntryV1 {
  readonly id: `windmill:system-purpose:${string}`;
  readonly kind: 'placement' | 'consumer-rule-boundary';
  readonly subjectId: WindmillPlacementIdV1 | WindmillMotionRuleIdV1;
  readonly beneficiary: string;
  readonly job: string;
  readonly locationDatum: string;
  readonly removalFailure: string;
  readonly relocationFailure: string;
  readonly smallestAdequateForm: string;
  readonly evidence: string;
  readonly honestyBoundary: string;
  readonly selectedDynamicProof: null;
}

export interface WindmillSystemDynamicProofBindingV1 {
  readonly schema: 'studio.windmill-system-dynamic-proof-binding/1';
  readonly scope: 'selected-complete-system';
  readonly candidateParameterKey: string;
  readonly nominalEvaluationSha256: string;
  readonly proofSha256: string;
  readonly selectionSha256: string;
  readonly establishes: readonly string[];
  readonly honestyBoundary: string;
}

/**
 * One immutable system-level bridge to the consumer fixture's nominal run,
 * causal ablations, and exhaustive-selection proof. Individual purpose
 * records remain unbound because those runs do not establish every box's
 * independent necessity.
 */
export const WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1:
WindmillSystemDynamicProofBindingV1 = Object.freeze({
  schema: 'studio.windmill-system-dynamic-proof-binding/1',
  scope: 'selected-complete-system',
  candidateParameterKey: WINDMILL_COMPACT_SELECTED_PARAMETER_KEY_V1,
  nominalEvaluationSha256:
    WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  proofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
  establishes: Object.freeze([
    'The exact selected system passes its frozen nominal dynamics gates with qualified cycles attributed to both cam noses.',
    'Bound ablations distinguish wind input, gravity return, all cam contact, each nose\'s follower-contact participation, anvil contact, and one complete sail assembly; separate static evidence binds the upper head cell only to its exact beam-to-toe interfaces and analytical mass and gravity-torque contribution.',
    'The selected parameter key is the first passing candidate in the frozen exhaustive compactness order.',
  ]),
  honestyBoundary:
    'These digests bind the complete selected consumer-physics proof, not the independent necessity of every visible box. No isolated upper-cell dynamics ablation was run; H1/H2/H3 search outcomes vary multiple geometry and mass conditions and do not prove that cell independently necessary or responsible for a cycle. They do not establish CFD, pressure fields, bearing pressure or friction, stress, elasticity, fatigue, wear, efficiency, forging, real-world safety, or Studio as a solver.',
});

function systemPurpose(
  value: WindmillSystemPurposeEntryV1,
): WindmillSystemPurposeEntryV1 {
  return Object.freeze(value);
}

const STRUCTURAL_BOUNDARY =
  'The selected geometry proves the named structure and datum only. The consumer fixture, not Studio purpose prose, must prove motion, forces, contacts, and causal laws.';
const candidate = WINDMILL_COMPACT_SELECTED_CANDIDATE_V1;
const port = (key: string) => {
  const value = candidate.ports.find((entry) => entry.key === key);
  if (value === undefined) {
    throw new Error(
      `Cannot build selected windmill system purpose: port '${key}' is absent.`,
    );
  }
  return value;
};
const contact = (key: 'cam-follower' | 'head-anvil') => {
  const value = candidate.intentionalContactGroups.find(
    (entry) => entry.key === key,
  );
  if (value === undefined) {
    throw new Error(
      `Cannot build selected windmill system purpose: contact group '${key}' is absent.`,
    );
  }
  return value;
};

/** Creator-local accountability for all placements and consumer rule inputs. */
export const WINDMILL_SYSTEM_PURPOSE_LEDGER_V1:
readonly WindmillSystemPurposeEntryV1[] = Object.freeze([
  systemPurpose({
    id: 'windmill:system-purpose:frame',
    kind: 'placement',
    subjectId: WINDMILL_PLACEMENT_IDS_V1.frame,
    beneficiary: 'The rotor journal, hammer journal, and ground reaction paths.',
    job: 'Hold two separated rotor bearing spans, one hammer bearing span, and the minimum grounded ties that align them.',
    locationDatum:
      `Selected frame body '${candidate.assets.frame.bodyKey}' at world-origin voxels [${candidate.assets.frame.worldOriginVoxels.join(',')}].`,
    removalFailure:
      'Both moving shafts lose visible fixed support and their shared ground reference.',
    relocationFailure:
      'The frame ports leave the rotor and hammer axis ports even though the moving bodies remain in place.',
    smallestAdequateForm:
      'Three bounded eight-piece bearing rings plus the authored one-course ground ties; every constituent has its own box record.',
    evidence:
      `Exact candidate ports '${port('frame-rotor-axis').key}' and '${port('frame-hammer-axis').key}', required face interfaces, and per-box ground-path accountability.`,
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:rotor',
    kind: 'placement',
    subjectId: WINDMILL_PLACEMENT_IDS_V1.rotor,
    beneficiary: 'The two wind-load surfaces and both cam-side participants.',
    job: 'Connect two opposite pitched stepped plates and two opposed cam noses to one continuous shaft.',
    locationDatum:
      `Selected rotor body on world shaft port [${port('rotor-axis').worldPositionVoxels.join(',')}].`,
    removalFailure:
      'The scene loses its only wind-input geometry, shared shaft, and cam-side contact participants.',
    relocationFailure:
      'The shaft leaves both frame bearing spans and both cam noses leave the follower plane.',
    smallestAdequateForm:
      'Two stepped plate regions, two radial spars, one continuous shaft, two shoulder arms, and two opposed arm-and-nose cam paths.',
    evidence:
      `Two geometry-derived sail frames and exact fingerprint '${candidate.geometryFingerprint}'; every occupied rotor box appears in the per-box purpose ledger.`,
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:hammer',
    kind: 'placement',
    subjectId: WINDMILL_PLACEMENT_IDS_V1.hammer,
    beneficiary: 'The cam-follower boundary and anvil output boundary.',
    job: 'Connect one localized follower shoe through a journaled lever to one terminal impact toe.',
    locationDatum:
      `Selected hammer body on world pivot port [${port('hammer-axis').worldPositionVoxels.join(',')}].`,
    removalFailure:
      'No rigid path remains between the declared cam-side and anvil-side participants.',
    relocationFailure:
      'The journal leaves its fixed bearing, the follower leaves the cam plane, and the toe leaves the anvil cap.',
    smallestAdequateForm:
      'One follower cube, two short links, one continuous journal with two shoulders, one right beam, one toe, and one impact-side head-mass cell.',
    evidence:
      'Exact box-key load path from hammer-follower-shoe through the two links, pivot core, right beam, upper head cell, and impact toe.',
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:anvil',
    kind: 'placement',
    subjectId: WINDMILL_PLACEMENT_IDS_V1.anvil,
    beneficiary: 'The hammer impact toe and ground.',
    job: 'Provide the sole fixed head-contact cell and its direct vertical reaction path.',
    locationDatum:
      `Selected fixed anvil world-origin voxels [${candidate.assets.anvil.worldOriginVoxels.join(',')}].`,
    removalFailure:
      'The terminal toe has no fixed output participant or ground reaction path.',
    relocationFailure:
      'The one-cell cap leaves the toe datum or its column leaves the ground plane.',
    smallestAdequateForm:
      'One fixed cap cube over one direct one-cell-wide ground column.',
    evidence:
      `Exact contact group '${contact('head-anvil').key}' binds box keys [${contact('head-anvil').secondBoxKeys.join(',')}].`,
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  ...candidate.sails.map((sail) => systemPurpose({
    id: `windmill:system-purpose:sail-load-${sail.key === 'north-sail' ? 'north' : 'south'}`,
    kind: 'consumer-rule-boundary',
    subjectId: WINDMILL_MOTION_RULE_IDS_V1.sailLoads[sail.key],
    beneficiary: `The ${sail.key} stepped plate and common rotor shaft.`,
    job: 'Expose the geometry-derived equivalent plate frame consumed by the fixture wind rule.',
    locationDatum:
      `Centroid [${sail.worldCentroidVoxels.join(',')}], normal [${sail.localNormalUnit.join(',')}], and area ${String(sail.equivalentPlateAreaSquareMeters)} m^2.`,
    removalFailure:
      `Removing [${sail.panelBoxKeys.join(', ')}] removes this rule's only visible load surface.`,
    relocationFailure:
      'Moving either slab changes the derived centroid, normal, step endpoints, and shaft moment arm.',
    smallestAdequateForm:
      'Two maximal cuboids exactly cover the connected stepped plate without filling its absent corner.',
    evidence:
      `Candidate sail frame '${sail.key}' is derived from occupied cells [${sail.panelBoxKeys.join(', ')}].`,
    honestyBoundary:
      'This is an equivalent flat-plate load input, not CFD, solved pressure, turbulence, or a claim that Studio itself applies wind.',
    selectedDynamicProof: null,
  })),
  systemPurpose({
    id: 'windmill:system-purpose:rotor-revolute',
    kind: 'consumer-rule-boundary',
    subjectId: WINDMILL_MOTION_RULE_IDS_V1.rotorRevolute,
    beneficiary: 'The continuous rotor shaft and two visible fixed bearing spans.',
    job: 'Expose coincident coaxial ports for a consumer-owned ideal revolute.',
    locationDatum:
      `Ports '${port('frame-rotor-axis').key}' and '${port('rotor-axis').key}' coincide at [${port('rotor-axis').worldPositionVoxels.join(',')}].`,
    removalFailure:
      'The consumer has no declared axis connecting the fixed frame to the rotor.',
    relocationFailure:
      'Separated ports would encode orbit or constraint error instead of supported axial rotation.',
    smallestAdequateForm:
      'One ideal joint datum backed by two separated visible bearing spans.',
    evidence: 'Exact candidate port equality and two distinct bearing ring datums.',
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:cam-contact-release',
    kind: 'consumer-rule-boundary',
    subjectId: WINDMILL_MOTION_RULE_IDS_V1.camContactRelease,
    beneficiary: 'Two opposed cam noses and one localized follower shoe.',
    job: 'Declare the exact collider participants that a consumer may solve as rigid contact.',
    locationDatum:
      `Contact group '${contact('cam-follower').key}' pairs [${contact('cam-follower').firstBoxKeys.join(', ')}] with [${contact('cam-follower').secondBoxKeys.join(', ')}].`,
    removalFailure:
      'Deleting a nose or follower removes an attributed participant from the declared handoff.',
    relocationFailure:
      'Moving a participant changes or destroys the authored static contact alignment.',
    smallestAdequateForm:
      'Two one-cube opposed noses and one one-cube follower, each reached by an accountable load path.',
    evidence: 'Exact box-key contact group and shared physical sidecar mapping.',
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:hammer-revolute-gravity',
    kind: 'consumer-rule-boundary',
    subjectId: WINDMILL_MOTION_RULE_IDS_V1.hammerRevoluteGravity,
    beneficiary: 'The continuous hammer journal and rear fixed bearing span.',
    job: 'Expose coincident ports for the consumer-owned hammer revolute and gravity rule.',
    locationDatum:
      `Ports '${port('frame-hammer-axis').key}' and '${port('hammer-axis').key}' coincide at [${port('hammer-axis').worldPositionVoxels.join(',')}].`,
    removalFailure:
      'The consumer has no declared pivot connecting the fixed frame to the hammer.',
    relocationFailure:
      'Separated ports change the lever path and invalidate both contact datums.',
    smallestAdequateForm:
      'One ideal joint datum backed by one visible bearing ring and continuous moving journal.',
    evidence: 'Exact candidate port equality; dynamic gravity behavior is intentionally unbound here.',
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
  systemPurpose({
    id: 'windmill:system-purpose:anvil-impact',
    kind: 'consumer-rule-boundary',
    subjectId: WINDMILL_MOTION_RULE_IDS_V1.anvilImpact,
    beneficiary: 'The terminal hammer toe and fixed anvil cap.',
    job: 'Declare the sole moving and fixed output-contact participants.',
    locationDatum:
      `Contact group '${contact('head-anvil').key}' pairs [${contact('head-anvil').firstBoxKeys.join(', ')}] with [${contact('head-anvil').secondBoxKeys.join(', ')}].`,
    removalFailure:
      'The visible system loses its terminal handoff or fixed reaction surface.',
    relocationFailure:
      'The toe and cap no longer share the authored impact datum.',
    smallestAdequateForm:
      'One moving toe cube, one fixed cap cube, and one direct grounded reaction column.',
    evidence: 'Exact box-key contact group and shared physical sidecar mapping.',
    honestyBoundary: STRUCTURAL_BOUNDARY,
    selectedDynamicProof: null,
  }),
]);

interface ColorV1 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}
export interface WindmillMaterialPurposeV1 {
  readonly id: `windmill:material:${string}`;
  readonly color: ColorV1;
  readonly roles: readonly WindmillVisibleRoleV1[];
  readonly job: string;
  readonly honestyBoundary: string;
}

export const WINDMILL_MATERIAL_PURPOSES_V1:
readonly WindmillMaterialPurposeV1[] = Object.freeze(
  WINDMILL_COMPACT_ROLE_COLORS_V1.map((role) => Object.freeze({
    id: `windmill:material:${role.colorGroup}:${role.role}`,
    color: role.color,
    roles: Object.freeze([role.role]),
    job: role.job,
    honestyBoundary: role.honestyBoundary,
  })),
);

export const WINDMILL_MATERIAL_PURPOSE_MAP_V1 =
  Object.freeze(Object.fromEntries(WINDMILL_MATERIAL_PURPOSES_V1.flatMap(
    (purpose) => purpose.roles.map((role) => [role, purpose]),
  ))) as Readonly<Record<WindmillVisibleRoleV1, WindmillMaterialPurposeV1>>;

export interface WindmillRecipeContrastV1 {
  readonly recipeId: WindmillRecipeIdV1 | WindmillProductionRecipeIdV1;
  readonly analyzerNearestRecipeId: string;
  readonly supplementalNeighborRecipeIds: readonly string[];
  readonly axes: readonly Readonly<{
    axis: string;
    difference: string;
  }>[];
}

export const WINDMILL_RECIPE_CONTRASTS_V1:
readonly WindmillRecipeContrastV1[] = Object.freeze([
  Object.freeze({
    recipeId: WINDMILL_RECIPE_IDS_V1.frame,
    analyzerNearestRecipeId: WINDMILL_RECIPE_IDS_V1.rotor,
    supplementalNeighborRecipeIds: Object.freeze([]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-negative-space',
        difference:
          'Three grounded journal apertures replace the rotor recipe two stepped plates and axial shaft.',
      }),
      Object.freeze({
        axis: 'construction-grammar',
        difference:
          'Fixed bearing rings and ground ties replace moving shaft, sails, shoulders, and cams.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_RECIPE_IDS_V1.rotor,
    analyzerNearestRecipeId: WINDMILL_RECIPE_IDS_V1.frame,
    supplementalNeighborRecipeIds: Object.freeze([]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-silhouette',
        difference:
          'Two opposite pitched stepped plates cross one shaft instead of forming fixed support rings.',
      }),
      Object.freeze({
        axis: 'construction-grammar',
        difference:
          'One continuous shaft carries two plate paths and two opposed arm-and-nose cam paths.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_RECIPE_IDS_V1.hammer,
    analyzerNearestRecipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.building,
    supplementalNeighborRecipeIds: Object.freeze([
      WINDMILL_RECIPE_IDS_V1.rotor,
      WINDMILL_RECIPE_IDS_V1.anvil,
    ]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-negative-space',
        difference:
          'A solid asymmetric follower-toe lever chain replaces a hollow post-and-plane shell whose only voids are two authored wall passages.',
      }),
      Object.freeze({
        axis: 'supported-motion',
        difference:
          'A journaled lever swings about a rear bearing; the building shell never moves.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_RECIPE_IDS_V1.anvil,
    analyzerNearestRecipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack,
    supplementalNeighborRecipeIds: Object.freeze([
      WINDMILL_RECIPE_IDS_V1.hammer,
    ]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'construction-grammar',
        difference:
          'Two purpose-separated fixed reaction boxes on the machine grain replace a fine-grain burlap body under a one-voxel tie cue.',
      }),
      Object.freeze({
        axis: 'supported-motion',
        difference:
          'The anvil is the fixed output participant of a solved contact; the sack is a kinematic prop delivered and tipped by authored tracks.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.building,
    analyzerNearestRecipeId: 'studio:contrast:mangrove-portal',
    supplementalNeighborRecipeIds: Object.freeze([
      WINDMILL_RECIPE_IDS_V1.frame,
    ]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-negative-space',
        difference:
          'Two rectilinear wall planes with a shaft opening and a tie notch on corner posts replace an organic branching portal massing.',
      }),
      Object.freeze({
        axis: 'construction-grammar',
        difference:
          'Axis-aligned one-voxel wall planes, header beams, and a stepped gabled roof replace sculpted arch limbs; every opening exists for a named crossing.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.wheatSack,
    analyzerNearestRecipeId: WINDMILL_RECIPE_IDS_V1.anvil,
    supplementalNeighborRecipeIds: Object.freeze([
      WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap,
    ]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'scale-proportion',
        difference:
          'A fine-grain plump body under a centered one-voxel tie reads as soft goods beside the anvil\'s two stacked machine-grain cubes.',
      }),
      Object.freeze({
        axis: 'supported-motion',
        difference:
          'The sack slides, tips over its base edge, and lies spent on authored tracks; the anvil never moves.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin,
    analyzerNearestRecipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap,
    supplementalNeighborRecipeIds: Object.freeze([]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-negative-space',
        difference:
          'An open-topped four-wall container with a working cavity replaces the solid level slab that rides inside it.',
      }),
      Object.freeze({
        axis: 'material-role-rhythm',
        difference:
          'Uniform plank wood frames a rim datum; the level is one unbroken flour white.',
      }),
    ]),
  }),
  Object.freeze({
    recipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourHeap,
    analyzerNearestRecipeId: WINDMILL_PRODUCTION_RECIPE_IDS_V1.flourBin,
    supplementalNeighborRecipeIds: Object.freeze([]),
    axes: Object.freeze([
      Object.freeze({
        axis: 'topology-negative-space',
        difference:
          'One solid fill slab with no cavity replaces the hollow container it is read against.',
      }),
      Object.freeze({
        axis: 'supported-motion',
        difference:
          'The level rises one authored step after each recorded impact; the bin is fixed architecture.',
      }),
    ]),
  }),
]);
