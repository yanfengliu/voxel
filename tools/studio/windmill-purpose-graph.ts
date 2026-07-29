import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeEvidenceV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
  type PurposeNodeV1,
} from './purpose-graph.js';
import {
  WINDMILL_COMPACT_PURPOSE_NEEDS_V1,
} from './windmill-compact-purpose-needs.js';
import {
  WINDMILL_PRODUCTION_HONESTY_V1,
  WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1,
  WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
  WINDMILL_PRODUCTION_VOID_PURPOSES_V1,
} from './windmill-production-purpose.js';
import {
  WINDMILL_MOTION_RULE_IDS_V1,
} from './windmill-system-purpose.js';

/**
 * The compact Windmill projected onto the typed graph.
 *
 * Translating the prose `beneficiary` sentences exposed something a reader
 * would not catch: several of them are mutually justifying. The cam nose says
 * it exists for the follower shoe, and the follower shoe says it exists for the
 * cam noses. Neither statement is wrong, but together they are a circle with no
 * ground, and the kernel rejects it.
 *
 * The fix is to name the thing both parts actually serve. A contact pair exists
 * for the contact, and the contact exists for the motion the scene must show.
 * That is what the `interface` nodes below are for, and it is a more honest
 * account than either prose sentence was on its own.
 */

export const WINDMILL_PURPOSE_SYSTEM_ID_V1 = 'windmill' as const;

const NEED = Object.freeze({
  driven: 'windmill:need:wind-drives-the-hammer',
  grounded: 'windmill:need:visible-support-to-ground',
  datums: 'windmill:need:legible-rotation-datums',
  production: 'windmill:need:grain-becomes-flour',
  housed: 'windmill:need:mill-reads-as-a-building',
} as const);

const INTERFACE = Object.freeze({
  camFollower: 'windmill:interface:cam-follower-contact',
  headAnvil: 'windmill:interface:head-anvil-contact',
  shaftPassage: 'windmill:interface:shaft-wall-passage',
  tiePassage: 'windmill:interface:tie-wall-passage',
} as const);

const SOURCE_WIND = 'windmill:source:world-wind-flow';
const SINK_DISSIPATION = 'windmill:sink:configured-dissipation';
const SOURCE_WHEAT = 'windmill:source:wheat-infeed';

const id = (key: string): PurposeNodeIdV1 => key as PurposeNodeIdV1;

/**
 * Who needs each authored solid. A load path serves its outboard element, not
 * the core it starts from: the shaft exists for other reasons already, so a
 * torque arm that read 'beneficiary: the rotor shaft and the nose' is recorded
 * here as serving the nose alone.
 */
const REQUIRED_BY: Readonly<Record<string, readonly PurposeNodeIdV1[]>> =
  Object.freeze({
    'windmill:purpose:rotor-front-bearing-support':
      Object.freeze([NEED.datums, NEED.grounded]),
    'windmill:purpose:rotor-rear-bearing-support':
      Object.freeze([NEED.datums, NEED.grounded]),
    'windmill:purpose:rotor-bearing-ground-tie': Object.freeze([
      id('windmill:purpose:rotor-front-bearing-support'),
      id('windmill:purpose:rotor-rear-bearing-support'),
    ]),
    'windmill:purpose:hammer-rear-bearing-support':
      Object.freeze([NEED.datums, NEED.grounded]),
    'windmill:purpose:rotor-hammer-ground-tie': Object.freeze([
      id('windmill:purpose:rotor-front-bearing-support'),
      id('windmill:purpose:rotor-rear-bearing-support'),
      id('windmill:purpose:hammer-rear-bearing-support'),
    ]),
    'windmill:purpose:continuous-rotor-shaft': Object.freeze([
      id(WINDMILL_MOTION_RULE_IDS_V1.rotorRevolute),
      id('windmill:purpose:north-sail-load-path'),
      id('windmill:purpose:south-sail-load-path'),
      id('windmill:purpose:primary-cam-torque-arm'),
      id('windmill:purpose:opposed-cam-torque-arm'),
      id('windmill:purpose:rear-thrust-shoulder'),
    ]),
    'windmill:purpose:rear-thrust-shoulder': Object.freeze([NEED.datums]),
    'windmill:purpose:north-sail-load-path':
      Object.freeze([id('windmill:purpose:north-visible-pitched-panel')]),
    'windmill:purpose:south-sail-load-path':
      Object.freeze([id('windmill:purpose:south-visible-pitched-panel')]),
    'windmill:purpose:north-visible-pitched-panel':
      Object.freeze([id(WINDMILL_MOTION_RULE_IDS_V1.sailLoads['north-sail'])]),
    'windmill:purpose:south-visible-pitched-panel':
      Object.freeze([id(WINDMILL_MOTION_RULE_IDS_V1.sailLoads['south-sail'])]),
    'windmill:purpose:primary-cam-torque-arm':
      Object.freeze([id('windmill:purpose:primary-cam-contact-nose')]),
    'windmill:purpose:primary-cam-contact-nose':
      Object.freeze([INTERFACE.camFollower]),
    'windmill:purpose:opposed-cam-torque-arm':
      Object.freeze([id('windmill:purpose:opposed-cam-contact-nose')]),
    'windmill:purpose:opposed-cam-contact-nose':
      Object.freeze([INTERFACE.camFollower]),
    'windmill:purpose:continuous-hammer-journal': Object.freeze([
      id(WINDMILL_MOTION_RULE_IDS_V1.hammerRevoluteGravity),
      id('windmill:purpose:follower-to-pivot-load-path'),
      id('windmill:purpose:pivot-to-head-load-path'),
      id('windmill:purpose:rear-hammer-shoulder'),
    ]),
    'windmill:purpose:rear-hammer-shoulder': Object.freeze([NEED.datums]),
    'windmill:purpose:cam-follower-contact-participant':
      Object.freeze([INTERFACE.camFollower]),
    'windmill:purpose:follower-to-pivot-load-path':
      Object.freeze([id('windmill:purpose:cam-follower-contact-participant')]),
    'windmill:purpose:pivot-to-head-load-path':
      Object.freeze([id('windmill:purpose:hammer-impact-toe')]),
    'windmill:purpose:hammer-impact-toe': Object.freeze([INTERFACE.headAnvil]),
    'windmill:purpose:hammer-head-return-mass':
      Object.freeze([id('windmill:purpose:hammer-impact-toe')]),
    'windmill:purpose:direct-ground-impact-reaction': Object.freeze([
      id('windmill:purpose:hammer-contact-witness-face'),
      NEED.grounded,
    ]),
    'windmill:purpose:hammer-contact-witness-face':
      Object.freeze([INTERFACE.headAnvil]),
  });

const CAUSAL_PROOF = 'compact windmill promoted causal proof';
const REVIEW_PROOF = 'windmill purpose review removal and relocation variants';

const geometryEvidence = (key: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: REVIEW_PROOF,
  establishes: Object.freeze([
    `Removing '${key}' produces its declared visual failure under the fixed `
    + 'review cameras, and its structural relocation is separately tested.',
  ]),
});

/** Nodes whose dynamic role a named counterfactual run actually isolates. */
const ABLATED: Readonly<Record<string, string>> = Object.freeze({
  'windmill:purpose:primary-cam-contact-nose':
    'Disabling this nose removes its attributed contacts and cycles while the '
    + 'other nose keeps every remaining contact.',
  'windmill:purpose:opposed-cam-contact-nose':
    'Disabling this nose removes its attributed contacts and cycles while the '
    + 'other nose keeps every remaining contact.',
  'windmill:purpose:north-visible-pitched-panel':
    'Removing this exact sail drops rotor mass and breaks the paired bending '
    + 'and radial-mass balance.',
});

/**
 * The one node the design record explicitly refuses to claim. Keeping it as a
 * tracked hole is the whole point: the search varied several conditions at
 * once, so no run shows this cell is independently necessary.
 */
const OPEN_OBLIGATIONS: Readonly<Record<string, PurposeEvidenceV1>> =
  Object.freeze({
    'windmill:purpose:hammer-head-return-mass': {
      kind: 'open',
      reason:
        'No isolated upper-cell dynamics ablation was run. The H1/H2/H3 search '
        + 'outcomes vary geometry and mass together, so they do not prove this '
        + 'cell independently necessary or responsible for a cycle.',
      wouldBeClosedBy:
        'A counterfactual run that removes only this cell, holds every other '
        + 'condition fixed, and shows the qualified-cycle count fall.',
    },
  });

function evidenceFor(key: string): PurposeEvidenceV1 {
  const open = OPEN_OBLIGATIONS[key];
  if (open !== undefined) return open;
  const ablation = ABLATED[key];
  if (ablation !== undefined) {
    return {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([ablation]),
    };
  }
  return geometryEvidence(key);
}

function authoredNodes(): readonly PurposeNodeV1[] {
  const keys = Object.keys(WINDMILL_COMPACT_PURPOSE_NEEDS_V1);
  return keys.map((key) => {
    const need = WINDMILL_COMPACT_PURPOSE_NEEDS_V1[key];
    const requiredBy = REQUIRED_BY[key];
    if (need === undefined) {
      throw new Error(
        `Cannot project windmill purpose '${key}' onto the graph: its entry `
        + 'vanished from WINDMILL_COMPACT_PURPOSE_NEEDS_V1 between key '
        + 'enumeration and lookup.',
      );
    }
    if (requiredBy === undefined) {
      throw new Error(
        `Cannot project windmill purpose '${key}' onto the graph: no requiredBy `
        + 'edge is declared for it. Add the ids of the nodes that need it to '
        + 'REQUIRED_BY in windmill-purpose-graph.ts, or remove the need from '
        + 'WINDMILL_COMPACT_PURPOSE_NEEDS_V1.',
      );
    }
    return purposeNodeV1({
      id: id(key),
      kind: 'solid',
      label: key.replace('windmill:purpose:', ''),
      job: need.job,
      requiredBy,
      evidence: evidenceFor(key),
      honestyBoundary: need.honestyBoundary,
    });
  });
}

/**
 * Production solids grouped by shared need id, the same granularity the
 * compact projection uses: one node per authored decision, with the per-box
 * ledger records as its exact membership. The builder fails closed when a
 * ledger record's need id has no declared node or edge here.
 */
const PRODUCTION_SOLIDS: Readonly<Record<string, {
  readonly label: string;
  readonly job: string;
  readonly requiredBy: readonly PurposeNodeIdV1[];
  readonly honestyBoundary: string;
}>> = Object.freeze({
  'windmill:purpose:building-roof-bearing': {
    label: 'building corner posts',
    job: 'Carry the roof at the four footprint corners so both open sides '
      + 'read as chosen, not missing.',
    requiredBy: Object.freeze([id('windmill:purpose:mill-roof-shelter')]),
    honestyBoundary: 'Visible support only; no load or joinery is solved.',
  },
  'windmill:purpose:rotor-bay-separation': {
    label: 'rotor wall',
    job: 'Separate the outdoor rotor from the working bay with the one '
      + 'built plane the shaft must cross.',
    requiredBy: Object.freeze([NEED.housed]),
    honestyBoundary: 'A visual boundary; it blocks no wind and bears no '
      + 'solved load.',
  },
  'windmill:purpose:west-enclosure': {
    label: 'west side wall',
    job: 'Close one side so the rear-quarter view reads as a building while '
      + 'the default view stays open.',
    requiredBy: Object.freeze([NEED.housed]),
    honestyBoundary: 'A visual boundary only.',
  },
  'windmill:purpose:mill-roof-shelter': {
    label: 'mill roof',
    job: 'Cover the working bay so the mechanism reads as housed.',
    requiredBy: Object.freeze([NEED.housed]),
    honestyBoundary: 'No weather, shadow, or structural claim.',
  },
  'windmill:purpose:grain-infeed-mass': {
    label: 'wheat sack bodies',
    job: 'Be the visible units of grain the delivery rule feeds to the '
      + 'anvil, one per recorded impact.',
    requiredBy: Object.freeze([
      id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.wheatDelivery),
      id(SOURCE_WHEAT),
    ]),
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
  'windmill:purpose:sack-orientation-cue': {
    label: 'sack tie cue',
    job: 'Mark each sack top so the tipped spent sacks read as the same '
      + 'objects emptied.',
    requiredBy: Object.freeze([
      id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.wheatDelivery),
    ]),
    honestyBoundary: 'A color cue only; no rope behavior.',
  },
  'windmill:purpose:flour-rest-datum': {
    label: 'bin floor',
    job: 'Give the flour level its visible rest face at frame zero.',
    requiredBy: Object.freeze([id('windmill:purpose:flour-output-level')]),
    honestyBoundary: 'Authored rest contact, not solved support.',
  },
  'windmill:purpose:flour-level-rim': {
    label: 'bin rim walls',
    job: 'Give the rising level the rim it is read against and hide the '
      + 'prop underside as it rises.',
    requiredBy: Object.freeze([id('windmill:purpose:flour-output-level')]),
    honestyBoundary: 'Authored containment, not solved contact.',
  },
  'windmill:purpose:flour-output-level': {
    label: 'flour level',
    job: 'Be the one visible measure of accumulated output across the five '
      + 'recorded impacts.',
    requiredBy: Object.freeze([
      id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.flourAccumulation),
    ]),
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  },
});

const PRODUCTION_EVIDENCE: PurposeEvidenceV1 = Object.freeze({
  kind: 'bound',
  proofId: 'windmill production generation, clearance, and browser gates',
  establishes: Object.freeze([
    'The committed replay regenerates these tracks byte-identically from '
    + 'the recorded impact ticks, every authored solid holds its declared '
    + 'clearance against the swept mechanism per frame, and the fixed '
    + 'review cameras bind each removal and relocation to a visible '
    + 'difference.',
  ]),
});

function productionNodes(): readonly PurposeNodeV1[] {
  const declared = new Set(Object.keys(PRODUCTION_SOLIDS));
  const referenced = new Set<string>(
    WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1.map(({ needId }) => needId),
  );
  for (const needId of referenced) {
    if (!declared.has(needId)) {
      throw new Error(
        `Cannot project windmill production purpose '${needId}' onto the `
        + 'graph: add its node and requiredBy edges to PRODUCTION_SOLIDS in '
        + 'windmill-purpose-graph.ts.',
      );
    }
  }
  for (const needId of declared) {
    if (!referenced.has(needId)) {
      throw new Error(
        `Windmill production graph node '${needId}' matches no ledger `
        + 'record; remove it or fix the ledger need id.',
      );
    }
  }
  return Object.keys(PRODUCTION_SOLIDS).map((key) => {
    const node = PRODUCTION_SOLIDS[key]!;
    return purposeNodeV1({
      id: id(key),
      kind: 'solid',
      label: node.label,
      job: node.job,
      requiredBy: node.requiredBy,
      evidence: PRODUCTION_EVIDENCE,
      honestyBoundary: node.honestyBoundary,
    });
  });
}

const NEEDS: readonly PurposeNodeV1[] = Object.freeze([
  purposeNeedV1({
    id: NEED.driven,
    label: 'Wind drives the hammer',
    job: 'A viewer must see wind turn a rotor that lifts and drops a hammer.',
    rootRationale:
      'The whole scene is one causal claim: an outside flow does work that '
      + 'ends in a repeated impact. Nothing else in it has a reason to exist.',
    evidence: {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([
        'Five qualified cycles occur over the nominal run with contacts '
        + 'attributed to both cam noses, and disabling wind removes them.',
      ]),
    },
    honestyBoundary:
      'A bounded proof of quasi-steady relative-flow load, rigid-body inertia, '
      + 'ideal revolutes, gravity, and contact. Not CFD, stress, wear, heat, '
      + 'efficiency, or forging.',
  }),
  purposeNeedV1({
    id: NEED.grounded,
    label: 'Nothing floats',
    job: 'Every mass must show a visible fixed path to the ground plane.',
    rootRationale:
      'Objects fall unless something holds them up, so an unsupported mass '
      + 'contradicts the first physical law a viewer checks.',
    evidence: geometryEvidence('the grounded frame'),
    honestyBoundary:
      'Visible fixed routes only; no bearing load sharing, friction, stress, '
      + 'or deformation is solved.',
  }),
  purposeNeedV1({
    id: NEED.datums,
    label: 'Legible rotation datums',
    job: 'A viewer must be able to locate the axes the moving parts turn about.',
    rootRationale:
      'Rotation is invisible without a visible reference; the rings and '
      + 'shoulders are how the scene says where an axis is.',
    evidence: geometryEvidence('the bearing rings and collars'),
    honestyBoundary:
      'The rings communicate an ideal revolute datum. They supply no solved '
      + 'bearing contact, load sharing, friction, or axial stop.',
  }),
  purposeNeedV1({
    id: NEED.production,
    label: 'Grain becomes flour',
    job: 'A viewer must see wheat enter, the recorded impacts pound it, and '
      + 'flour accumulate — the whole reason a mill exists.',
    rootRationale:
      'A trip hammer that strikes an empty anvil is a mechanism study; the '
      + 'scene claims a mill, so its input and output must be visible.',
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
  purposeNeedV1({
    id: NEED.housed,
    label: 'The mill reads as a building',
    job: 'The mechanism must sit inside a mill building whose interior '
      + 'stays visible from the default camera.',
    rootRationale:
      'A working mill is architecture around a machine; bare machinery in '
      + 'a field contradicts the scene\'s stated setting.',
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary:
      'Two walls, posts, and a roof communicate enclosure only; nothing '
      + 'structural, thermal, or meteorological is claimed.',
  }),
]);

function motionRule(
  ruleId: string,
  label: string,
  job: string,
  establishes: string,
  honestyBoundary: string,
): PurposeNodeV1 {
  return purposeNodeV1({
    id: id(ruleId),
    kind: 'motion-rule',
    label,
    job,
    requiredBy: Object.freeze([NEED.driven]),
    evidence: {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([establishes]),
    },
    honestyBoundary,
  });
}

const MOTION_RULES: readonly PurposeNodeV1[] = Object.freeze([
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.sailLoads['north-sail'],
    'North sail load',
    'Apply the two-sided quasi-steady pitched-plate law to the north panel.',
    'Disabling wind removes all rotor drive and every qualified cycle.',
    'A low-resolution load surrogate. Not CFD, pressure fields, wake, stall, '
    + 'or blade efficiency.',
  ),
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.sailLoads['south-sail'],
    'South sail load',
    'Apply the same law to the diametric south panel.',
    'Removing one exact sail reduces rotor mass and breaks the paired balance.',
    'A low-resolution load surrogate. Not CFD, pressure fields, wake, stall, '
    + 'or blade efficiency.',
  ),
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.rotorRevolute,
    'Rotor revolute',
    'Constrain the rotor to one passive axis through both bearing datums.',
    'Axis tilt, pose drift, and pose-derived axis rate stay inside their '
    + 'declared gates for the whole run.',
    'An ideal impulse revolute. No bearing contact, load sharing, or friction.',
  ),
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.camContactRelease,
    'Cam contact and release',
    'Lift the follower on cam contact and release it at the nose end.',
    'Disabling all cam contact removes every lift and qualified cycle.',
    'Solved rigid contact with configured friction. No wear or deformation.',
  ),
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.hammerRevoluteGravity,
    'Hammer revolute and gravity return',
    'Return the lever under gravity about the hammer axis after release.',
    'Disabling gravity removes the return and every later impact.',
    'Uniform gravity on an ideal revolute; no bearing friction or axial stop.',
  ),
  motionRule(
    WINDMILL_MOTION_RULE_IDS_V1.anvilImpact,
    'Anvil impact',
    'Resolve the head-anvil contact that completes each ordered cycle.',
    'Delayed anvil disable preserves cam-driven lift but eliminates every '
    + 'later impact and qualified cycle.',
    'A positive contact impulse only. No forging, deformation, heat, or sound.',
  ),
]);

const PRODUCTION_RULES: readonly PurposeNodeV1[] = Object.freeze([
  purposeNodeV1({
    id: id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.wheatDelivery),
    kind: 'motion-rule',
    label: 'Wheat delivery keyed to recorded impacts',
    job: 'Slide sack k to the anvil-side milling spot before recorded '
      + 'impact k and set it aside spent afterwards.',
    requiredBy: Object.freeze([NEED.production]),
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
  purposeNodeV1({
    id: id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.flourAccumulation),
    kind: 'motion-rule',
    label: 'Flour accumulation keyed to recorded impacts',
    job: 'Raise the bin\'s flour level one fixed step shortly after each '
      + 'recorded impact.',
    requiredBy: Object.freeze([NEED.production]),
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary: WINDMILL_PRODUCTION_HONESTY_V1,
  }),
]);

const INTERFACES: readonly PurposeNodeV1[] = Object.freeze([
  purposeNodeV1({
    id: INTERFACE.camFollower,
    kind: 'interface',
    label: 'Cam-follower contact',
    job:
      'Hold the one place where the rotating side meets the lever, so neither '
      + 'participant has to be justified by the other.',
    requiredBy: Object.freeze([id(WINDMILL_MOTION_RULE_IDS_V1.camContactRelease)]),
    evidence: {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([
        'Collision groups admit only this pair, and both noses contribute '
        + 'separately attributed contacts over the nominal run.',
      ]),
    },
    honestyBoundary:
      'A declared contact group. Contact response is solved; gear teeth, '
      + 'torque transmission, and bearing pressure are not claimed.',
  }),
  purposeNodeV1({
    id: INTERFACE.headAnvil,
    kind: 'interface',
    label: 'Head-anvil contact',
    job:
      'Hold the one place where the moving head meets fixed ground, so the toe '
      + 'and the witness face each serve the impact rather than each other.',
    requiredBy: Object.freeze([id(WINDMILL_MOTION_RULE_IDS_V1.anvilImpact)]),
    evidence: {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([
        'A positive contact impulse at the anvil completes each accepted '
        + 'ordered cycle.',
      ]),
    },
    honestyBoundary:
      'A declared contact group only. No forging, deformation, or wear.',
  }),
  purposeNodeV1({
    id: INTERFACE.shaftPassage,
    kind: 'interface',
    label: 'Shaft-wall passage',
    job: 'Hold the one authored void where the turning shaft crosses the '
      + 'rotor wall, so the shaft and the wall each serve the crossing '
      + 'rather than each other.',
    requiredBy: Object.freeze([
      id('windmill:purpose:continuous-rotor-shaft'),
      id('windmill:purpose:rotor-bay-separation'),
    ]),
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary:
      'A clearance void with 0.198 world units around the shaft\'s swept '
      + 'cylinder; no bearing, seal, or wall loading is claimed.',
  }),
  purposeNodeV1({
    id: INTERFACE.tiePassage,
    kind: 'interface',
    label: 'Ground-tie wall passage',
    job: 'Hold the base notch where the frame\'s rotor-bearing ground tie '
      + 'runs under the rotor wall.',
    requiredBy: Object.freeze([
      id('windmill:purpose:rotor-bearing-ground-tie'),
      id('windmill:purpose:rotor-bay-separation'),
    ]),
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary:
      'A clearance void with an eighth world unit on every tie face; the '
      + 'wall bears on nothing at the crossing.',
  }),
]);

const BOUNDARIES: readonly PurposeNodeV1[] = Object.freeze([
  purposeBoundaryV1({
    id: SOURCE_WIND,
    kind: 'energy-source',
    label: 'World wind flow',
    job: 'Supply the fixed 10 m/s flow the pitched-plate law acts through.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates:
      'The atmosphere that carries it, the weather that produces it, and every '
      + 'wake the rotor leaves behind.',
    requiredBy: Object.freeze([
      id(WINDMILL_MOTION_RULE_IDS_V1.sailLoads['north-sail']),
      id(WINDMILL_MOTION_RULE_IDS_V1.sailLoads['south-sail']),
    ]),
    evidence: {
      kind: 'bound',
      proofId: CAUSAL_PROOF,
      establishes: Object.freeze([
        'The wind-disabled counterfactual removes all drive, which bounds this '
        + 'source as the system\'s only work input.',
      ]),
    },
    honestyBoundary:
      'A fixed uniform flow. Not a solved pressure field, turbulence, stall '
      + 'history, or arbitrary-wind performance.',
  }),
  purposeBoundaryV1({
    id: SINK_DISSIPATION,
    kind: 'energy-sink',
    label: 'Configured dissipation',
    job:
      'Remove the energy that configured friction, restitution, and damping '
      + 'consume at contacts and joints.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'Heat, sound, wear, and permanent deformation.',
    requiredBy: Object.freeze([
      id(WINDMILL_MOTION_RULE_IDS_V1.camContactRelease),
      id(WINDMILL_MOTION_RULE_IDS_V1.anvilImpact),
    ]),
    evidence: {
      kind: 'open',
      reason:
        'Friction, restitution, and damping are configured together and never '
        + 'independently isolated, so the amount leaving here is unmeasured. '
        + 'Only a one-sided unaccounted-positive-energy diagnostic runs.',
      wouldBeClosedBy:
        'A two-sided energy audit that meters input work against kinetic, '
        + 'potential, and dissipated energy each step within a declared bound.',
    },
    honestyBoundary:
      'The fixture claims no energy balance and no global conservation.',
  }),
  purposeBoundaryV1({
    id: SOURCE_WHEAT,
    kind: 'material-source',
    label: 'Wheat infeed',
    job: 'Supply the finite magazine of five queued sacks the delivery '
      + 'rule feeds to the anvil, one per recorded impact.',
    quantity: 'grain-mass',
    visibility: 'visible',
    truncates:
      'The farm, harvest, and cartage that filled the sacks and brought '
      + 'them to the queue.',
    requiredBy: Object.freeze([
      id(WINDMILL_PRODUCTION_MOTION_RULE_IDS_V1.wheatDelivery),
    ]),
    evidence: PRODUCTION_EVIDENCE,
    honestyBoundary:
      'A visible magazine like the ball-drop rack: sacks pre-exist in the '
      + 'scene and nothing meters, weighs, or simulates their contents.',
  }),
]);

/**
 * The void records are projected through the two passage interfaces above;
 * this guard keeps the ledger and the graph naming the same authored voids.
 */
function assertVoidCoverage(): void {
  const projected = new Set<string>([
    'windmill:purpose:shaft-wall-passage',
    'windmill:purpose:tie-wall-passage',
  ]);
  for (const record of WINDMILL_PRODUCTION_VOID_PURPOSES_V1) {
    if (!projected.has(record.needId)) {
      throw new Error(
        `Windmill void record '${record.voidKey}' names need `
        + `'${record.needId}', which has no interface node in the purpose `
        + 'graph.',
      );
    }
  }
}

export function createWindmillPurposeGraphV1(): PurposeGraphV1 {
  assertVoidCoverage();
  return purposeGraphV1(
    WINDMILL_PURPOSE_SYSTEM_ID_V1,
    [
      ...NEEDS,
      ...MOTION_RULES,
      ...PRODUCTION_RULES,
      ...INTERFACES,
      ...authoredNodes(),
      ...productionNodes(),
      ...BOUNDARIES,
    ],
    [{
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([SOURCE_WIND]),
      sinkIds: Object.freeze([SINK_DISSIPATION]),
      statement:
        'Windmill is open in energy. Work enters only through the fixed world '
        + 'flow and leaves through configured dissipation. Gravity is an '
        + 'internal conservative field, not a boundary, because the lever '
        + 'returns to its starting height each cycle. The fixture therefore '
        + 'claims bounded open-system work input, not energy conservation.',
    }, {
      quantity: 'grain-mass',
      closed: false,
      sourceIds: Object.freeze([SOURCE_WHEAT]),
      sinkIds: Object.freeze([]),
      statement:
        'Windmill is open in grain-mass with no sink. A finite magazine of '
        + 'five pre-staged sacks is the visible wheat infeed; spent sacks '
        + 'and the rising flour level accumulate inside the scene and '
        + 'nothing leaves. The wheat-to-flour transformation at the anvil '
        + 'is internal authored presentation keyed to the recorded '
        + 'impacts, not simulated milling, so the claim is a visible '
        + 'material account, not a mass balance.',
    }],
  );
}
