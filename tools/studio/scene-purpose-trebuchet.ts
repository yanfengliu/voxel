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
        + 'past 12 m/s while it is still on the sling, carries it 25 m, '
        + 'and knocks four named bricks out of a wall it could not have '
        + 'reached without the whip.',
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
      job: 'Carry the machine, the flight, the wall, and the rubble: '
        + 'four flush tiles reach z -42, past every measured landing.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every body ends the fire on a tile: the floor-penetration check '
        + 'reads the whole run and would report an unbounded dip for '
        + 'anything that left the field.',
        'treb-fire',
      ),
      honestyBoundary: 'Fixed deck slabs; the multiply combine rule reads '
        + 'each touching body\'s own friction. Coulomb friction cannot slow '
        + 'a rolling ball, which is what the ball\'s own contact-gated '
        + 'rolling resistance supplies.',
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
        + 'at 70.8 against the crate at 990.6 it is the light end, and '
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
      label: 'Steel counterweight crate',
      job: 'Power the machine: 990.6 of steel, twenty-eight times the '
        + 'ball, whose fall is the only energy input and whose material '
        + 'is the range governor. Stone in the same drawn volume threw '
        + 'at 4.9 m/s and the shot ended as a coordinate; steel is what '
        + 'makes the throw reach a wall 32 m away.',
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
      label: 'Shot ball payload',
      job: 'Carry the machine\'s output where checks can measure it, and '
        + 'carry enough of it to matter: 35.3 against the crate\'s 990.6, '
        + 'because the whip only multiplies speed while the payload stays '
        + 'much lighter than what throws it, but a lighter ball leaves '
        + 'faster and bounces off the wall without moving it.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The ball peaks at 16.07 m/s before tick 500 — while still on the '
        + 'sling, not after falling — and travels 27.8 m against a 25 m '
        + 'floor.',
        'treb-fire',
      ),
      honestyBoundary: 'A declared primitive-ball collider, so launch '
        + 'reads whip dynamics rather than voxel-corner snags; the '
        + 'rolling station measures that artifact separately. Its '
        + '\'shot\' material is stone in every physical respect and '
        + 'carries a separate colour only so the projectile is not drawn '
        + 'identically to its target.',
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
        'Every body stays finite through the fire\'s 1,470 post-trigger '
        + 'ticks, and mechanical energy falls monotonically from 49,967 J '
        + 'to 27,582 J across it — dissipation is where the machine\'s '
        + 'energy goes.',
        'treb-fire',
      ),
      honestyBoundary: 'Configured friction and restitution, never '
        + 'isolated or metered — and it does not reach the hinges. The '
        + 'arm hangs on frictionless revolute joints and is still '
        + 'swinging at 0.18 m/s when the window closes, so the rest '
        + 'claim is scoped to the ball alone.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'wall'),
      kind: 'solid',
      label: 'Target wall, courses 1 and up',
      job: 'Be the thing the machine is for: a stack that stands on its '
        + 'own and comes apart on contact, so a throw has a visible '
        + 'consequence instead of a landing coordinate.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The wall stands through the 3-second hold with every brick '
        + 'inside 0.02 m, and the same fire moves four named bricks above '
        + 'the base course between 1.0 and 3.2 m, which is what the '
        + 'checks assert. The wider population — 21 of 33 pieces past '
        + '0.25 m, farthest 4.57 m, mean 1.64 m — is measured, not '
        + 'asserted, because a collapsing stack is chaotic and pinning a '
        + 'count would pin noise.',
        'treb-hold and treb-fire',
      ),
      honestyBoundary: 'Not a fracture model and not masonry: no brick '
        + 'ever breaks, and nothing bonds them. It comes apart because '
        + 'the pieces were only ever stacked, which is exactly why it '
        + 'needs no destruction system. Course parity (5 full bricks, or '
        + '4 full between two closers) is one bounded rule; the closers '
        + 'exist because whole-brick offsets left both top corners '
        + 'overhanging and they toppled unaided.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'newton'),
      kind: 'motion-rule',
      label: "The machine obeys Newton's laws of motion",
      job: 'Hold the scene to the three laws rather than to the fact '
        + 'that it looks right. The ball in free flight keeps its '
        + 'velocity except as gravity and air resistance change it, so '
        + 'any other acceleration is a force nobody declared; a kick of '
        + '4,000 into a 35.3-mass ball changes its velocity by 113 m/s '
        + 'and by exactly that; and two bodies acting on each other '
        + 'leave the momentum of the pair alone.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The first law is measured across the free flight from tick 500 '
        + 'to 900, where gravity and drag predict the velocity of the ball to '
        + 'within 0.05 m/s; declaring the drag as zero while the world '
        + 'applies it makes the same check fail by 0.395 m/s. The second '
        + 'law is measured on its own passing run, deliberately not on '
        + 'the energy control, because a scenario expected to fail hides '
        + 'a broken check.',
        'treb-fire and treb-second-law',
      ),
      honestyBoundary: 'These read the solver rather than deriving it: '
        + 'they prove this world behaves as the laws require over the '
        + 'windows named, not that the solver is correct everywhere. The '
        + "third law's check lives on the launcher, where two bodies "
        + 'meet in mid-air with nothing else pushing; on the ground the '
        + 'floor takes momentum through friction and the law is '
        + 'deliberately not claimed.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'conservation'),
      kind: 'motion-rule',
      label: 'The machine obeys conservation of energy',
      job: 'Bound every motion in the scene by a law rather than by '
        + 'taste. The crate is the only energy source: whatever the '
        + 'arm, the sling, the ball, and 33 bricks end up carrying was '
        + 'already in the raised crate when the run began. A solver that '
        + 'invents energy is how physics bugs usually present — a stack '
        + 'that shivers apart, a joint that flings its own arm — and '
        + 'this is the node that forbids it.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Mechanical energy — translational and rotational kinetic plus '
        + 'gravitational potential — never rises above its opening value '
        + 'across the whole fire, and the same check fails outright when '
        + 'one impulse is added mid-flight, so the passing verdict is '
        + 'not a check that cannot fail.',
        'treb-fire and the treb-energy-control counter-run',
      ),
      honestyBoundary: 'A 2% allowance covers frame sampling and the '
        + 'principal-frame rotation, not a real gain; energy injection '
        + 'runs away by orders of magnitude, not percent. The ball\'s '
        + 'contact-gated rolling resistance only ever removes energy, so '
        + 'it cannot mask a gain. This node claims conservation, not '
        + 'that every dissipation path is physically modelled.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'dissipation'),
      kind: 'motion-rule',
      label: 'The machine runs down and stops',
      job: 'Give the swing somewhere to go. A revolute joint in this '
        + 'solver is frictionless, so the arm and the hanging crate are '
        + 'a pendulum with no losses at all: nothing in the world asks '
        + 'them to slow down, and they do not. The declared bearing '
        + 'damping is the axle friction and air drag a rigid-body solver '
        + 'cannot produce, and it is what turns a machine that swings '
        + 'forever into one that fires, settles, and is done.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The arm and the counterweight are both asleep or under 0.1 m/s '
        + 'by 22.5 s after firing, and the same scenario fails outright '
        + 'when the declared damping is stripped from the two bodies — '
        + 'measured frictionless, the arm sweeps 896 degrees over 60 s, '
        + 'the counterweight 1,398, and the counterweight never falls '
        + 'below the threshold at any point.',
        'treb-settles and its frictionless counter-run',
      ),
      honestyBoundary: 'One coefficient stands for two different losses, '
        + 'axle friction and air drag, and is not derived from either — '
        + 'it was measured. It is not free: it costs release speed '
        + '(16.08 down to 15.58 m/s) and shortens the throw, which is '
        + 'why the wall stands where this machine lands the ball rather '
        + 'than where the frictionless one did. This node claims the '
        + 'machine stops, not that its bearing is modelled.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'wall-base'),
      kind: 'solid',
      label: 'Target wall, base course',
      job: 'Carry every course above it, so its own displacement is what '
        + 'separates a wall that came down from a wall with a hole in it.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every named brick check sits above the base course, and each '
        + 'asserts a metre or more of travel; the base is deliberately '
        + 'left unasserted because what it does is stay. Measured, the '
        + 'upper courses run to 4.57 m while the base barely moves, so '
        + 'this shot removes the wall above its footing rather than '
        + 'sweeping the footing away.',
        'treb-fire',
      ),
      honestyBoundary: 'A separate record from the courses above because '
        + 'it does a different job and survives the hit; recording them '
        + 'together would hide that the base is what stays.',
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
        + 'no spawn magazine, no brick is ever created or destroyed, and '
        + 'the berm past the wall is what keeps the ball and the rubble '
        + 'on drawn ground.',
    },
  ]);
}
