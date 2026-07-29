import { CHAIN_LINK_COUNT_V1 } from './chain-layout.js';
import { capturedAt, sceneNodeId } from './scene-purpose-board.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
} from './purpose-graph.js';

/**
 * The chain's purpose graph.
 *
 * Its energy boundary is worth reading carefully. Gravity is not a source here:
 * the chain begins held above its resting curve, so the potential energy it
 * spends falling was already inside the system at frame zero. What actually
 * crosses the boundary is the push, which arrives from outside, and the heat
 * that contact and friction carry away. Calling gravity a source would count
 * the same energy twice.
 */

const SYSTEM = 'studio:scene:chain-links';
const FRONT = 'studio:scene:chain-links front camera at 0 ms and 3000 ms';
const OVERHEAD = 'studio:scene:chain-links overhead camera at 4900 ms and 5700 ms';

const NEED = Object.freeze({
  interlock: sceneNodeId(SYSTEM, 'need', 'held-by-interlock-alone'),
  hangs: sceneNodeId(SYSTEM, 'need', 'hangs-under-its-own-weight'),
  swings: sceneNodeId(SYSTEM, 'need', 'has-room-to-swing'),
});

const CONTACT = sceneNodeId(SYSTEM, 'interface', 'link-to-link-contact');
const PUSH = sceneNodeId(SYSTEM, 'source', 'applied-push');
const DISSIPATION = sceneNodeId(SYSTEM, 'sink', 'contact-dissipation');

export function createChainPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: NEED.interlock,
      label: 'Held together by interlock alone',
      job:
        'Show that solid rings threaded through each other stay together with '
        + 'nothing joining them.',
      rootRationale:
        'Every other assembly in this repository holds together because a '
        + 'constraint says so. This one has to hold together because of its '
        + 'shape, or the claim means nothing.',
      evidence: capturedAt(
        'The solver world reports zero joints, and removing one ring leaves the '
        + 'run below it hanging free from its own anchor instead.',
        'chain jointless and broken-chain ablation',
      ),
      honestyBoundary:
        'Rigid bodies with configured friction and restitution. No steel, no '
        + 'stress, no wear, and no deformation.',
    }),
    purposeNeedV1({
      id: NEED.hangs,
      label: 'Hangs under its own weight',
      job:
        'Show the free links falling into the curve a chain of this length '
        + 'takes between these anchors.',
      rootRationale:
        'A chain drawn straight proves nothing about gravity. The drape is the '
        + 'only visible evidence that weight is acting on it.',
      evidence: capturedAt(
        'The links start at half their equilibrium dip and fall onto the '
        + 'analytic catenary, which the solver then sustains.',
        FRONT,
      ),
      honestyBoundary:
        'Uniform gravity on rigid bodies. The curve is compared against the '
        + 'analytic catenary for a chain of uniform mass, not against steel.',
    }),
    purposeNeedV1({
      id: NEED.swings,
      label: 'Has room to swing',
      job:
        'Show that a push moves the middle of the chain sideways and that it '
        + 'comes back.',
      rootRationale:
        'Interlocked links could hold together and still be rigid. The swing '
        + 'is what shows the joints are loose rather than welded.',
      evidence: capturedAt(
        'A sideways impulse bows the middle away from the hanging plane and it '
        + 'returns; with gravity removed nothing brings it back.',
        OVERHEAD,
      ),
      honestyBoundary:
        'One impulse at one link. No wind, no repeated forcing, and no claim '
        + 'about how a real chain rings or damps.',
    }),
    purposeNodeV1({
      id: CONTACT,
      kind: 'interface',
      label: 'Link-to-link contact',
      job:
        'Hold the one place neighbouring rings meet, so neither ring has to be '
        + 'justified by the other.',
      requiredBy: Object.freeze([NEED.interlock, NEED.hangs]),
      evidence: capturedAt(
        'Every neighbouring pair is threaded and no two links share a cell, '
        + 'while non-neighbours are never threaded.',
        'chain interlock check',
      ),
      honestyBoundary:
        'Solved rigid contact with configured friction. Contact area, pressure, '
        + 'and wear are not modelled.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'links'),
      kind: 'solid',
      label: 'Steel rings',
      job:
        'Provide the closed rings whose holes the neighbours pass through, each '
        + 'turned ninety degrees from the last.',
      requiredBy: Object.freeze([CONTACT]),
      evidence: capturedAt(
        `All ${String(CHAIN_LINK_COUNT_V1)} rings are single connected loops `
        + 'whose colliders come from the same voxels the model draws.',
        'chain ring and decomposition checks',
      ),
      honestyBoundary:
        'One bounded group under one rule, in two planes. A ring section under '
        + 'two cells thick is refused because it would break into arcs.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'anchor-piers'),
      kind: 'solid',
      label: 'Anchor piers',
      job:
        'Show what holds the two end links, so the chain reads as hung between '
        + 'two fixed points rather than floating.',
      requiredBy: Object.freeze([NEED.hangs]),
      evidence: capturedAt(
        'Two courses per pier reach past the top of the upright links, and the '
        + 'end links stay exactly where the piers put them for the whole run.',
        FRONT,
      ),
      honestyBoundary:
        'Visual anchoring only. The end links are fixed bodies in the solver; '
        + 'no fastening, bolt, or load path into the masonry is modelled.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion', 'gravity'),
      kind: 'motion-rule',
      label: 'Uniform gravity',
      job: 'Pull every free link down until contact holds it.',
      requiredBy: Object.freeze([NEED.hangs, NEED.swings]),
      evidence: capturedAt(
        'Removing gravity leaves the chain where it started, and leaves a '
        + 'pushed link where it was pushed.',
        'chain zero-gravity ablation',
      ),
      honestyBoundary:
        'A constant field. No buoyancy, drag, or variation with height.',
    }),
    purposeBoundaryV1({
      id: PUSH,
      kind: 'energy-source',
      label: 'Applied push',
      job: 'Deliver one sideways impulse to the middle link after it settles.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates:
        'Whatever delivered it. There is no hand, gust, or mechanism in the '
        + 'scene, and nothing shows where the push came from.',
      requiredBy: Object.freeze([NEED.swings]),
      evidence: capturedAt(
        'The middle link bows away from the hanging plane only after the '
        + 'impulse is applied.',
        OVERHEAD,
      ),
      honestyBoundary:
        'A single instantaneous impulse, chosen for visibility. It is not a '
        + 'measured force and represents nothing in particular.',
    }),
    purposeBoundaryV1({
      id: DISSIPATION,
      kind: 'energy-sink',
      label: 'Contact dissipation',
      job:
        'Remove the energy that friction and restitution take out at every '
        + 'link-to-link contact.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates: 'Heat, sound, and wear.',
      requiredBy: Object.freeze([CONTACT]),
      evidence: capturedAt(
        'The swing decays to a small fraction of its peak, and the chain comes '
        + 'to rest rather than oscillating forever.',
        'chain swing return measurement',
      ),
      honestyBoundary:
        'Friction and restitution are configured together and never isolated, '
        + 'so how much leaves here is unmeasured.',
    }),
  ], [
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([PUSH]),
      sinkIds: Object.freeze([DISSIPATION]),
      statement:
        'The chain is open in energy. Only the push adds any, and only contact '
        + 'dissipation removes any. Gravity is deliberately not a source: the '
        + 'chain starts held above its resting curve, so the potential energy '
        + 'it spends falling was already inside the system at frame zero, and '
        + 'counting the field as a source would count that energy twice.',
    },
    {
      quantity: 'link-mass',
      closed: true,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([]),
      statement:
        `All ${String(CHAIN_LINK_COUNT_V1)} links exist for the whole run. None `
        + 'is created, destroyed, merged, or broken, so mass never crosses the '
        + 'boundary. The broken-chain ablation removes a link before the run '
        + 'begins rather than during it.',
    },
  ]);
}
