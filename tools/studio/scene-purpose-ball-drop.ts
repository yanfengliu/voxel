import {
  BALL_DROP_BALL_COUNT_V1,
  BALL_DROP_RAIL_SPAN_X_V1,
} from './ball-drop-recipes.js';
import { capturedAt, notYetShown, sceneNodeId } from './scene-purpose-board.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
} from './purpose-graph.js';

/**
 * The ball-drop rig's purpose graph.
 *
 * This scene is the first whose whole reason is Interact mode: it exists so a
 * person can test gravity and contact by hand, live, with nothing recorded.
 * Its material boundary is deliberately visible — the dispenser rail is the
 * source drawn as a thing — and it has no sink, so the material claim is
 * one-directional: balls enter under the rail and never leave.
 */

const SYSTEM = 'studio:scene:ball-drop';

const NEED = Object.freeze({
  handTest: sceneNodeId(SYSTEM, 'need', 'test-gravity-by-hand'),
  legibleSource: sceneNodeId(SYSTEM, 'need', 'source-is-visible'),
});

const SOURCE_RAIL = sceneNodeId(SYSTEM, 'source', 'dispenser-rail-release');
const SINK_DISSIPATION = sceneNodeId(SYSTEM, 'sink', 'contact-dissipation');

export function createBallDropPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: NEED.handTest,
      label: 'Test gravity and contact by hand',
      job:
        'Let a person click, watch a ball fall under gravity, bounce, and '
        + 'settle in the bucket — solved live, not replayed.',
      rootRationale:
        'Recorded proofs show what the solver did once. Belief comes from '
        + 'poking the world yourself and seeing it answer, which needs a scene '
        + 'built for exactly that.',
      evidence: notYetShown(
        'The live lane is new; no browser evidence is bound yet.',
        'The Interact-mode browser test: spawn three balls, watch each fall '
        + 'monotonically, and find all three resting inside the bucket bounds.',
      ),
      honestyBoundary:
        'A sandbox. Mouse input is not deterministic, nothing is recorded or '
        + 'hashed, and no committed evidence may ever come from this lane.',
    }),
    purposeNeedV1({
      id: NEED.legibleSource,
      label: 'The source is visible',
      job:
        'Make where balls come from a thing on screen rather than an event '
        + 'with no cause.',
      rootRationale:
        'Mass has to come from somewhere. A scene that materialises objects '
        + 'from empty air contradicts the boundary discipline every other '
        + 'system here declares.',
      evidence: capturedAt(
        'The rack of unspawned balls rests on the rail deck, and each click '
        + 'visibly takes the next one.',
        'studio:scene:ball-drop default camera',
      ),
      honestyBoundary:
        'Visibility only. The rail does not mechanically feed, sort, or meter '
        + 'the balls; the release is the click.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'rail'),
      kind: 'solid',
      label: 'Dispenser rail',
      job:
        'Span the release zone overhead and carry the visible magazine, so '
        + 'the spawn clamp is exactly the rail\'s own extent.',
      requiredBy: Object.freeze([NEED.legibleSource, SOURCE_RAIL]),
      evidence: capturedAt(
        `The clamp span of ±${String(BALL_DROP_RAIL_SPAN_X_V1)} sits inside `
        + 'the drawn rail deck.',
        'studio:scene:ball-drop default camera',
      ),
      honestyBoundary:
        'A visual source marker and shelf. It has no body in the live world '
        + 'because nothing can reach it.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'magazine-balls'),
      kind: 'solid',
      label: 'Magazine balls',
      job:
        `Show the ${String(BALL_DROP_BALL_COUNT_V1)}-ball budget on the rail `
        + 'before release, so a click visibly consumes something finite.',
      requiredBy: Object.freeze([NEED.legibleSource]),
      evidence: capturedAt(
        'The rack row shortens as balls spawn.',
        'studio:scene:ball-drop after three clicks',
      ),
      honestyBoundary:
        'One bounded group under one rule. An unspawned ball is a visual with '
        + 'no body; it becomes physical only at release.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'bucket'),
      kind: 'solid',
      label: 'Catch bucket',
      job:
        'Receive and keep every dropped ball, with voxel-derived wall '
        + 'colliders leaving no gap a ball could slip through.',
      requiredBy: Object.freeze([NEED.handTest]),
      evidence: notYetShown(
        'The bucket is authored but no live run has filled it yet.',
        'The browser test asserting spawned balls end inside the bucket AABB.',
      ),
      honestyBoundary:
        'A fixed body. It does not weigh, count, or empty; accumulation is '
        + 'the whole behaviour.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'ground'),
      kind: 'solid',
      label: 'Ground tray',
      job:
        'Catch a ball that misses the bucket, so nothing falls forever and '
        + 'every ball\'s story ends on screen.',
      requiredBy: Object.freeze([NEED.handTest]),
      evidence: notYetShown(
        'No miss has been demonstrated yet.',
        'A spawn at the clamp edge that lands in the tray, not the void.',
      ),
      honestyBoundary:
        'A wide fixed tray. It implies no floor material or terrain.',
    }),
    purposeBoundaryV1({
      id: SOURCE_RAIL,
      kind: 'material-source',
      label: 'Rail release',
      job:
        'Bring one ball at a time into the physical world at the clicked '
        + 'point under the rail.',
      quantity: 'ball-mass',
      visibility: 'visible',
      truncates:
        'Whatever filled the rack. The magazine is finite and nothing refills '
        + 'it.',
      requiredBy: Object.freeze([NEED.handTest]),
      evidence: notYetShown(
        'The live lane is new; no spawn evidence is bound yet.',
        'The browser test counting spawned bodies against clicks.',
      ),
      honestyBoundary:
        'A click-driven release, not a mechanism. No feeder, gate, or timing '
        + 'is simulated.',
    }),
    purposeBoundaryV1({
      id: SINK_DISSIPATION,
      kind: 'energy-sink',
      label: 'Contact dissipation',
      job: 'Remove the bounce energy so balls settle instead of jittering.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates: 'Heat and sound.',
      requiredBy: Object.freeze([NEED.handTest]),
      evidence: notYetShown(
        'Settling has not been measured in the live lane.',
        'The browser test asserting spawned balls come to rest.',
      ),
      honestyBoundary:
        'Configured restitution and friction, never isolated or metered.',
    }),
  ], [
    {
      quantity: 'ball-mass',
      closed: false,
      sourceIds: Object.freeze([SOURCE_RAIL]),
      sinkIds: Object.freeze([]),
      statement:
        'Ball mass enters at the rail release and never leaves: the scene has '
        + 'a source and deliberately no sink, so the bucket accumulates '
        + 'everything ever spawned. The magazine bounds the total.',
    },
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([SINK_DISSIPATION]),
      statement:
        'Energy is open through dissipation alone. Each spawned ball arrives '
        + 'carrying potential energy the source brought in with its mass, and '
        + 'contact removes it until the ball rests; no boundary adds energy '
        + 'to a ball already in the world.',
    },
  ]);
}
