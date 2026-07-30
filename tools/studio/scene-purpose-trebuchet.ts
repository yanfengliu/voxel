import { sceneNodeId } from './scene-purpose-board.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeEvidenceV1,
  type PurposeGraphV1,
} from './purpose-graph.js';

/**
 * The trebuchet scene's purpose ledger: the playground's first jointed
 * machine, so beyond the usual body-per-diagnostic records this graph
 * carries one interface node per joint — each states which drawn geometry
 * the constraint anchors on, and its evidence names the alignment test or
 * scenario that would catch the drawn part and the solver constraint
 * drifting apart. Subtraction evidence is executable here: the two
 * ablation scenarios remove the counterweight and the sling and pin what
 * the machine loses.
 */

const provenBy = (what: string, proofId: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `vitest fixtures/physics-playground: ${proofId}`,
  establishes: Object.freeze([what]),
});

const provenInBrowser = (what: string, where: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `playwright tests/browser/model-studio-physics-playground.spec.ts: ${where}`,
  establishes: Object.freeze([what]),
});

const notProven = (reason: string, wouldBeClosedBy: string): PurposeEvidenceV1 =>
  ({ kind: 'open', reason, wouldBeClosedBy });

export function createTrebuchetPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-trebuchet';
  const need = sceneNodeId(SYSTEM, 'need', 'see-joints-behave');
  const cocked = sceneNodeId(SYSTEM, 'source', 'cocked-potential');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See jointed machines behave',
      job: 'Show hinges bearing load, a rope holding and releasing, a '
        + 'two-pendulum whip, and a contact-governed handoff — the solver '
        + 'capabilities every future machine (cart, bridge, gear train) '
        + 'stands on, exercised end to end by one legible machine.',
      rootRationale: 'The five earlier stations prove free bodies; nothing '
        + 'before this scene proves constraints. A machine that swings, '
        + 'throws, and lands inside the stage is the smallest honest '
        + 'proof.',
      evidence: provenBy(
        'The fire scenario sweeps the arm past 100 degrees, puts the ball '
        + 'past 5 m/s while it is still on the sling, carries it beyond '
        + 'z -8, and ends with it asleep against the berm.',
        'treb-fire',
      ),
      honestyBoundary: 'A sandbox study: live runs are unrecorded, the '
        + 'sling is the stated rigid-link simplification, and the frame '
        + 'is staked rather than free-standing.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'ground'),
      kind: 'solid',
      label: 'Stage and landing floors',
      job: 'Carry the machine, the flight, and the long roll after it: '
        + 'three flush tiles reach z -30, and a catch berm ends the roll '
        + 'on screen.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The ball lands near z -11 and rolls to rest against the berm; '
        + 'removing the berm makes the same fire fail, because the ball '
        + 'rolls off the last tile and keeps falling.',
        'treb-fire and the treb-fire-no-berm control',
      ),
      honestyBoundary: 'Fixed deck slabs; the multiply combine rule reads '
        + 'each touching body\'s own friction. Rapier models no rolling '
        + 'resistance, so the berm stops the ball, not the ground.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'frame'),
      kind: 'solid',
      label: 'Staked trestle frame',
      job: 'Show where the axle is borne and where the machine is footed, '
        + 'with the counterweight swinging between its outboard trestles.',
      requiredBy: Object.freeze([need]),
      evidence: notProven(
        'The frame is a fixed body and nothing in the scene ever touches '
        + 'it: a reviewer measured that deleting every frame collider '
        + 'reproduces the throw within solver noise, because a revolute '
        + 'joint on a fixed body needs no geometry to hold an axle. Its '
        + 'voxels are legibility, and no run isolates legibility. The '
        + 'earlier binding here — that the frame drifts under a '
        + 'centimetre — was a tautology: a fixed body cannot drift.',
        'A collider-ablation harness that renders the machine with the '
        + 'frame hidden and asks a fresh viewer where the axle is carried.',
      ),
      honestyBoundary: 'Staked (a fixed body), like the real machine, and '
        + 'load-bearing only in appearance. Free-standing it somersaulted: '
        + 'at 70.8 against the crate at 317.5 it is the light end, and '
        + 'reaction torque flips the light end. A free-standing frame with '
        + 'drawn ballast is the recorded deferred improvement.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'arm'),
      kind: 'solid',
      label: 'The 3:1 arm',
      job: 'Trade counterweight drop for tip speed; its three drawn rods '
        + 'are the anchor geometry of every joint in the machine.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The fired arm sweeps past 100 degrees, accumulated frame to '
        + 'frame rather than measured against its start.',
        'treb-fire',
      ),
      honestyBoundary: 'A rigid lever; no flex, and the 3:1 ratio is '
        + 'authored, not optimized.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'cw'),
      kind: 'solid',
      label: 'Stone counterweight crate',
      job: 'Power the machine: 317.5 of stone, thirty-seven times the '
        + 'ball, whose fall is the only energy input and whose material '
        + 'is the range governor that keeps the throw on the stage.',
      requiredBy: Object.freeze([need, cocked]),
      evidence: provenBy(
        'Without it the fired arm swings under 15 degrees and the ball '
        + 'moves under 0.4 m.',
        'treb-fire-no-cw',
      ),
      honestyBoundary: 'Drawn as a hung crate of stone; density is the '
        + 'material table\'s, not measured rubble.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'sling'),
      kind: 'solid',
      label: 'Rigid-link sling and pouch',
      job: 'Double the whip: the second pendulum that turns arm speed '
        + 'into release speed, with a tall tail rim holding the ball '
        + 'through the drag and an open front as the release gate.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Without it the arm still swings past 100 degrees but the ball '
        + 'moves under 1.2 m.',
        'treb-fire-no-sling',
      ),
      honestyBoundary: 'The stated rigid-sling study: a hinged link, not '
        + 'cords. A flexible two-cord sling is deferred.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'ball'),
      kind: 'solid',
      label: 'Wood ball payload',
      job: 'Carry the machine\'s output where checks can measure it — '
        + 'deliberately light at 8.5 against the sling\'s 30.6, because '
        + 'the whip only multiplies speed while the payload stays much '
        + 'lighter than what throws it.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The ball passes 5 m/s before tick 900 — while still on the '
        + 'sling, not after falling — travels at least 15 m, crosses '
        + 'z -8, and ends asleep.',
        'treb-fire',
      ),
      honestyBoundary: 'A declared primitive-ball collider, so launch '
        + 'reads whip dynamics rather than voxel-corner snags; the '
        + 'rolling station measures that artifact separately.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'anchor'),
      kind: 'solid',
      label: 'Trigger post',
      job: 'Give the trigger lashing a grounded far end beside the tip '
        + 'crossbar, standing clear of the sling\'s hang path.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Cocked, every body holds still within 0.12 m for three seconds, '
        + 'and the crossbar hangs clear above the post so the lashing — '
        + 'not the post — takes the load.',
        'treb-hold and the cocked-clearance geometry test',
      ),
      honestyBoundary: 'The post stays drawn and solid after firing; only '
        + 'the lashing is released.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'catch-berm'),
      kind: 'solid',
      label: 'Catch berm',
      job: 'End the roll on screen. Rapier models no rolling resistance, '
        + 'so a landed ball keeps its speed indefinitely; without a wall '
        + 'it leaves the last tile and falls out of the world.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The same fire with this berm omitted fails: the ball rolls off '
        + 'the field and the floor check reads the fall.',
        'treb-fire-no-berm',
      ),
      honestyBoundary: 'The same answer the rolling station reached for '
        + 'the same reason; 1.25 m tall because a wall below the centre '
        + 'of a rolling ball just torques it over.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'axle-bearing'),
      kind: 'interface',
      label: 'Axle in its bearing rings',
      job: 'The arm\'s one rotational degree of freedom: a revolute '
        + 'constraint on the drawn axle rod centered in the frame\'s '
        + 'drawn 3-cell bearing holes, quarter clear all round.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The bearing holes are open exactly where the joint anchors, and '
        + 'the axle rod reaches both rings.',
        'playground-trebuchet.test.ts, the frame bearing holes are open '
        + 'where the axle joint anchors',
      ),
      honestyBoundary: 'The joint carries the load; the rings never touch '
        + 'the rod and exist to make the load path legible.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'cw-hinge'),
      kind: 'interface',
      label: 'Counterweight hinge',
      job: 'Let the crate fall plumb: a revolute constraint on the drawn '
        + 'hanger rod inside the crate\'s drawn eye rings.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The crate eye holes are open where the hinge anchors, with the '
        + 'ring bars closed above and below.',
        'playground-trebuchet.test.ts, the counterweight eye and sling '
        + 'hook are open where their joints anchor',
      ),
      honestyBoundary: 'Frictionless hinge; a real trunnion\'s grease and '
        + 'slop are not modeled.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'sling-pivot'),
      kind: 'interface',
      label: 'Sling eye on the tip crossbar',
      job: 'The whip\'s second hinge: a revolute constraint on the drawn '
        + 'crossbar inside the sling\'s drawn C-hook, keeping the whip in '
        + 'the firing plane the way a real sling\'s two cords do.',
      requiredBy: Object.freeze([need]),
      evidence: provenInBrowser(
        'The fired ball leaves and stays within 1.5 m of the firing '
        + 'plane; the drawn hook is pinned open at the anchor by the '
        + 'vitest geometry test.',
        'the trebuchet holds cocked, fires downrange, and reset re-cocks it',
      ),
      honestyBoundary: 'A hinge, not a ball joint: the spherical first '
        + 'cut let the sling roll and dump the ball sideways at 36 m/s. '
        + 'The hook opens toward the shaft because the shaft passes '
        + 'through where a closed ring\'s near cheek would sit.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'trigger-lashing'),
      kind: 'interface',
      label: 'Trigger lashing',
      job: 'Hold the machine cocked: a rope constraint from the tip '
        + 'crossbar\'s east end to the post top beside it, released '
        + 'whole by the fire case — bodies stay, only the tie vanishes.',
      requiredBy: Object.freeze([need, cocked]),
      evidence: provenBy(
        'Cocked, the machine holds still for three seconds; firing the '
        + 'same world sweeps the arm past 100 degrees. The only '
        + 'difference between the two runs is this detached tie.',
        'treb-hold and treb-fire',
      ),
      honestyBoundary: 'A 24 cm modeled tie drawn only by proximity of '
        + 'crossbar end and post; the release is scripted detachment at '
        + 'a tick, standing in for a pulled pin.',
    }),
    purposeBoundaryV1({
      id: cocked,
      kind: 'energy-source',
      label: 'Cocked potential',
      job: 'Store the throw: the raised crate and tipped arm carry the '
        + 'machine\'s entire energy budget into the scene.',
      quantity: 'energy',
      visibility: 'visible',
      truncates: 'Whoever winched the arm down; cocking is not simulated.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The same built world holds still until the tie detaches, then '
        + 'puts the ball past 5 m/s while it is still on the sling — the '
        + 'energy was in the pose.',
        'treb-hold and treb-fire',
      ),
      honestyBoundary: 'Authored pose, not a winch mechanism.',
    }),
    purposeBoundaryV1({
      id: sceneNodeId(SYSTEM, 'sink', 'contact-dissipation'),
      kind: 'energy-sink',
      label: 'Contact dissipation',
      job: 'Absorb the landing and the long roll, so the thrown ball '
        + 'comes to rest instead of travelling forever.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates: 'Heat and sound.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every body stays finite through 3,570 post-fire ticks and the '
        + 'ball ends asleep against the berm.',
        'treb-fire',
      ),
      honestyBoundary: 'Configured friction and restitution, never '
        + 'isolated or metered — and it does not reach the hinges. The '
        + 'arm hangs on frictionless revolute joints and is still '
        + 'swinging at 0.18 m/s when the window closes, so the rest '
        + 'claim is scoped to the ball alone.',
    }),
  ], [
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([cocked]),
      sinkIds: Object.freeze(
        [sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy enters as the authored cocked pose and leaves '
        + 'through contact dissipation; nothing meters the exchange.',
    },
    {
      quantity: 'block-mass',
      closed: true,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([]),
      statement: 'No body enters or leaves the scene: the trebuchet has '
        + 'no spawn magazine, and the thrown ball is measured coming to '
        + 'rest on the field rather than rolling out of the world.',
    },
  ]);
}
