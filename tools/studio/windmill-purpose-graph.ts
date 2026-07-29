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
} as const);

const INTERFACE = Object.freeze({
  camFollower: 'windmill:interface:cam-follower-contact',
  headAnvil: 'windmill:interface:head-anvil-contact',
} as const);

const SOURCE_WIND = 'windmill:source:world-wind-flow';
const SINK_DISSIPATION = 'windmill:sink:configured-dissipation';

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
]);

export function createWindmillPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(
    WINDMILL_PURPOSE_SYSTEM_ID_V1,
    [
      ...NEEDS,
      ...MOTION_RULES,
      ...INTERFACES,
      ...authoredNodes(),
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
    }],
  );
}
