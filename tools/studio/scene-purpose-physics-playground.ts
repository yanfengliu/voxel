import { notYetShown, sceneNodeId } from './scene-purpose-board.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeEvidenceV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
} from './purpose-graph.js';

/**
 * Purpose graphs for the physics playground scenes.
 *
 * Every station element traces to the diagnostic it serves — the station
 * definitions carry the same sentences in their `tests` fields, and the
 * graphs here are the traversable projection the kernel can audit. Where a
 * claim is already proven by a deterministic scenario, the evidence names
 * the vitest scenario id — and names only what that scenario actually
 * asserts, because a binding that overreaches its test is folklore.
 * Browser-visible claims bind to the Playwright spec where it exercises
 * them and stay open otherwise.
 *
 * Size note: eight scenes' ledgers live here, past the 500-line norm; the
 * recorded extraction plan is one module per station family the first time
 * any single ledger grows.
 */

const provenBy = (what: string, scenarioId: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `vitest fixtures/physics-playground: ${scenarioId}`,
  establishes: Object.freeze([what]),
});

const provenInBrowser = (what: string, where: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `playwright tests/browser/model-studio-physics-playground.spec.ts: ${where}`,
  establishes: Object.freeze([what]),
});

function dissipationSink(
  system: string,
  need: PurposeNodeIdV1,
  evidence: PurposeEvidenceV1,
  job = 'Remove impact and sliding energy so bodies can come to rest '
    + 'instead of jittering forever.',
) {
  return purposeBoundaryV1({
    id: sceneNodeId(system, 'sink', 'contact-dissipation'),
    kind: 'energy-sink',
    label: 'Contact dissipation',
    job,
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'Heat and sound.',
    requiredBy: Object.freeze([need]),
    evidence,
    honestyBoundary:
      'Configured friction and restitution, never isolated or metered.',
  });
}

function playgroundGround(
  system: string,
  need: PurposeNodeIdV1,
  label: string,
  job: string,
  evidence: PurposeEvidenceV1,
) {
  return purposeNodeV1({
    id: sceneNodeId(system, 'solid', 'ground'),
    kind: 'solid',
    label,
    job,
    requiredBy: Object.freeze([need]),
    evidence,
    honestyBoundary: 'Fixed slabs with the multiply combine rule, so every '
      + 'contact reads the touching material undiluted. They imply no '
      + 'terrain.',
  });
}

function createFallingPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-falling';
  const need = sceneNodeId(SYSTEM, 'need', 'see-gravity-behave');
  const source = sceneNodeId(SYSTEM, 'source', 'spawn-magazine');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See gravity, landing, and rest behave',
      job: 'Show four known bodies falling at the same acceleration, '
        + 'landing without sinking, and resting without creep — the first '
        + 'facts an engineer checks in any physics lane.',
      rootRationale: 'Every downstream machine stands on fall, contact, and '
        + 'rest being right; a playground that cannot show these has '
        + 'nothing to say about anything harder.',
      evidence: provenBy(
        'All four bodies land, rest, and never dip past 0.02 m.',
        'falling-settle',
      ),
      honestyBoundary: 'A sandbox: live runs are unrecorded, and only the '
        + 'headless twin of this station produces evidence.',
    }),
    playgroundGround(SYSTEM, need, 'Station floor',
      'Give the falling bodies one honest surface to land on and rest '
      + 'against, and the penetration check its reference plane.',
      provenBy('Deepest floor dip stayed under 0.02 m.', 'falling-settle')),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'droppers'),
      kind: 'solid',
      label: 'The four falling specimens',
      job: 'Solid stone anchors the mass scale; its hollow twin differs '
        + 'only by the missing interior, so equal fall with unequal mass is '
        + 'testable; the wood cube contrasts material at equal size; the '
        + 'beam stresses resting stability with an elongated footprint.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Touch-down ticks agree within 4 % (one snapshot stride) across a '
        + '4x mass ratio, and the solid cube outweighs the hollow one.',
        'falling-settle',
      ),
      honestyBoundary: 'Four bodies under one authored rule: same drop '
        + 'height, distinct construction. No aerodynamics — equal fall is '
        + 'the vacuum answer, which is what a drag-free solver must give.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'magazine'),
      kind: 'solid',
      label: 'Spawn magazine',
      job: 'Queue the blocks the Spawn control releases, so added mass has '
        + 'a drawn source instead of appearing from nowhere.',
      requiredBy: Object.freeze([need, source]),
      evidence: provenInBrowser(
        'Spawning takes magazine-00 first: bodies go 5 to 6 and the queue '
        + '4 to 3.',
        'the falling station spawns from the magazine',
      ),
      honestyBoundary: 'A visible queue; a queued block has no body until '
        + 'spawned.',
    }),
    purposeBoundaryV1({
      id: source,
      kind: 'material-source',
      label: 'Magazine release',
      job: 'Bring one queued block at a time into the physical world.',
      quantity: 'block-mass',
      visibility: 'visible',
      truncates: 'Whatever stocked the magazine; nothing refills it.',
      requiredBy: Object.freeze([need]),
      evidence: provenInBrowser(
        'One spawn call gives exactly one queued block a body, and reset '
        + 'restores the full queue.',
        'the falling station spawns and resets',
      ),
      honestyBoundary: 'A control-driven release, not a mechanism.',
    }),
    dissipationSink(SYSTEM, need, provenBy(
      'All four droppers end asleep or under 0.05 m/s.',
      'falling-settle',
    )),
  ], [
    {
      quantity: 'block-mass',
      closed: false,
      sourceIds: Object.freeze([source]),
      sinkIds: Object.freeze([]),
      statement: 'Block mass enters at the magazine release and never '
        + 'leaves; the magazine bounds the total.',
    },
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy is open through dissipation alone: bodies arrive '
        + 'carrying potential energy with their mass, and contact removes '
        + 'it until they rest.',
    },
  ]);
}

function createRampPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-ramp';
  const need = sceneNodeId(SYSTEM, 'need', 'see-friction-thresholds');
  const source = sceneNodeId(SYSTEM, 'source', 'spawn-magazine');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See static friction hold and break by material',
      job: 'Show four materials on one adjustable slope, each holding '
        + 'below its friction angle and sliding above it, in order.',
      rootRationale: 'Friction is the difference between a stack and a '
        + 'landslide in every consumer game; the threshold behaviour must '
        + 'be visible and orderable, not folkloric.',
      evidence: provenBy(
        'At 20 degrees ice and steel slide while wood and stone hold; at '
        + '10 only ice slides; at 40 everything does.',
        'ramp-20-split',
      ),
      honestyBoundary: 'One Coulomb coefficient per material — the JS '
        + 'solver has no static/dynamic split, so the transition angle is '
        + 'the single-coefficient answer.',
    }),
    playgroundGround(SYSTEM, need, 'Station floor',
      'Carry the ramp, the berm, and every slide\'s ending.',
      provenBy('Blocks land and stop without sinking.', 'ramp-20-split')),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'ramp'),
      kind: 'solid',
      label: 'The smooth ramp',
      job: 'Present one flat slope at the selected angle. Its live body is '
        + 'pose-pitched from the flat authored slab, because a voxel '
        + 'staircase would add geometric friction and drown the material '
        + 'comparison.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'At 10 degrees only ice (threshold 2.3 degrees) slides while wood, '
        + 'stone, and steel (thresholds 16.7 degrees and up) hold.',
        'ramp-10-all-hold',
      ),
      honestyBoundary: 'The multiply-combine deck: pair friction equals '
        + 'the block\'s own coefficient. The pitched pose exists only in '
        + 'the live world; the authored scene shows the kit flat.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'lineup'),
      kind: 'solid',
      label: 'The four-material lineup',
      job: 'Wood, stone, steel, and ice as identical cubes differing only '
        + 'in material, spaced clear of each other so the only variable on '
        + 'the slope is the coefficient under test.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'At 20 degrees ice and steel slide while wood and stone hold — the '
        + 'lineup splits by material and nothing else.',
        'ramp-20-split',
      ),
      honestyBoundary: 'One authored rule, four samples. The 1.1 m pitch '
        + 'exists because a tighter first draft spawned the row overlapping '
        + 'and the solver shoved it apart.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'berm'),
      kind: 'solid',
      label: 'Catch berm',
      job: 'End every slide on screen: ice at friction 0.04 would coast '
        + 'some forty meters and vanish off the world edge, which reads as '
        + 'a vanishing-object bug.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every body stayed within 0.02 m of the floor plane for the whole '
        + 'run — with the berm gone, ice leaves the world and this check '
        + 'fails.',
        'ramp-20-split',
      ),
      honestyBoundary: 'A wall, not a measurement: it stops runaways and '
        + 'claims nothing about their arrival speed.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'magazine'),
      kind: 'solid',
      label: 'Spawn magazine',
      job: 'Queue the extra blocks the Spawn control releases onto the '
        + 'station.',
      requiredBy: Object.freeze([need, source]),
      evidence: notYetShown(
        'The browser spec exercises spawning on the falling station only.',
        'The same spawn-and-count assertions run on this station.',
      ),
      honestyBoundary: 'A visible queue; a queued block has no body until '
        + 'spawned.',
    }),
    purposeBoundaryV1({
      id: source,
      kind: 'material-source',
      label: 'Magazine release',
      job: 'Bring one queued block at a time into the physical world.',
      quantity: 'block-mass',
      visibility: 'visible',
      truncates: 'Whatever stocked the magazine.',
      requiredBy: Object.freeze([need]),
      evidence: notYetShown(
        'The browser spec exercises spawning on the falling station only.',
        'The same spawn-and-count assertions run on this station.',
      ),
      honestyBoundary: 'A control-driven release, not a mechanism.',
    }),
    dissipationSink(SYSTEM, need, provenBy(
      'Wood and stone hold within 0.08 m for three simulated seconds at 20 '
      + 'degrees — contact damping, not luck, keeps them there.',
      'ramp-20-split',
    )),
  ], [
    {
      quantity: 'block-mass',
      closed: false,
      sourceIds: Object.freeze([source]),
      sinkIds: Object.freeze([]),
      statement: 'Block mass enters at the magazine release and never '
        + 'leaves; the magazine bounds the total.',
    },
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy is open through dissipation alone; gravity is an '
        + 'internal field, not a boundary.',
    },
  ]);
}

function createLauncherPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-launcher';
  const need = sceneNodeId(SYSTEM, 'need', 'see-collisions-behave');
  const source = sceneNodeId(SYSTEM, 'source', 'muzzle');
  const kinetic = sceneNodeId(SYSTEM, 'source', 'muzzle-kinetic');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See momentum, restitution, and tunneling behave',
      job: 'Fire known projectiles down five lanes and watch momentum '
        + 'transfer with mass ratio, a pyramid scatter, and a fast body '
        + 'stop at a thin wall with CCD on — or pass through with it off.',
      rootRationale: 'Impacts are the moments a game is judged on; the '
        + 'range makes each collision regime one repeatable button.',
      evidence: provenBy(
        'Light barely moves heavy, heavy launches light, CCD stops the '
        + '300 m/s shot and its absence tunnels it.',
        'launcher-ccd-stops',
      ),
      honestyBoundary: 'Rigid response only: the engine has no voxel '
        + 'destruction system, so nothing here claims damage.',
    }),
    playgroundGround(SYSTEM, need, 'Range floor',
      'Carry the lanes and every scattered block\'s landing — struck '
      + 'blocks travel ten meters and more downrange.',
      provenBy('The pyramid scatter never left the ground.', 'launcher-stack')),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'projectile-queue'),
      kind: 'solid',
      label: 'Projectile queue',
      job: 'Show every round before it is fired — wood and steel cubes '
        + 'whose mass ratio against their targets is each lane\'s '
        + 'experiment.',
      requiredBy: Object.freeze([need, source]),
      evidence: provenBy(
        'The light-into-heavy case spawns its projectile, which crosses at '
        + 'least 3 m of range.',
        'launcher-light-heavy',
      ),
      honestyBoundary: 'Queued rounds are visuals until their case fires '
        + 'them.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'targets'),
      kind: 'solid',
      label: 'Target row',
      job: 'A hundred-to-one steel mass (1684.8 vs 16.2 units) for the '
        + 'light shot, a light wood block for the heavy shot, and an '
        + 'identical twin for the equal exchange — the three mass regimes '
        + 'momentum transfer must answer.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The struck light target travelled at least 2 m while the heavy '
        + 'shot ploughed on; the sibling scenarios pin the other two lanes.',
        'launcher-heavy-light',
      ),
      honestyBoundary: 'Free-standing bodies on the deck; their travel is '
        + 'the measurement.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'thin-wall'),
      kind: 'solid',
      label: 'One-voxel wall',
      job: 'Be crossable in a fifth of a solver step at 300 m/s: the '
        + 'tunneling oracle for continuous collision detection.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'With CCD off the 300 m/s shot ends beyond the wall plane; the '
        + 'sibling launcher-ccd-stops run pins the stopped case.',
        'launcher-noccd-tunnels',
      ),
      honestyBoundary: 'Fixed, so the wall never absorbs momentum; only '
        + 'the projectile\'s fate is under test.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'stack'),
      kind: 'solid',
      label: 'Knock-down pyramid',
      job: 'Stand until hit, then scatter through many simultaneous '
        + 'contacts — the multi-contact impact case single targets cannot '
        + 'give.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The top block flew at least 0.3 m and everything stayed above '
        + 'the floor.',
        'launcher-stack',
      ),
      honestyBoundary: 'Six blocks under one stacking rule.',
    }),
    purposeBoundaryV1({
      id: source,
      kind: 'material-source',
      label: 'Muzzle release',
      job: 'Bring one queued projectile into the world at the muzzle with '
        + 'its case\'s velocity.',
      quantity: 'block-mass',
      visibility: 'visible',
      truncates: 'The loader; nothing restocks the queue.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The equal-mass case begins from a spawned round that then moves '
        + 'its target.',
        'launcher-equal',
      ),
      honestyBoundary: 'The mass account only. Potential energy rides in '
        + 'with mass here as everywhere; the separate kinetic boundary '
        + 'exists for the launch velocity, work a mechanism did beyond '
        + 'carrying the round to the muzzle.',
    }),
    purposeBoundaryV1({
      id: kinetic,
      kind: 'energy-source',
      label: 'Muzzle kinetic input',
      job: 'Bring each fired round\'s launch velocity into the world — the '
        + 'work an unsimulated launcher mechanism did.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates: 'The launcher mechanism: springs, charges, or rails are '
        + 'deliberately unsimulated.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The equal-mass target ends at least 1.5 m from rest — momentum '
        + 'only a moving round could have delivered.',
        'launcher-equal',
      ),
      honestyBoundary: 'A declared initial velocity, not a solved '
        + 'mechanism.',
    }),
    dissipationSink(SYSTEM, need, notYetShown(
      'No launcher scenario asserts post-impact rest; the range checks '
      + 'momentum and containment, not settling.',
      'A scatter-then-settle scenario asserting all-asleep-or-slow after a '
      + 'pyramid knock-down.',
    )),
  ], [
    {
      quantity: 'block-mass',
      closed: false,
      sourceIds: Object.freeze([source]),
      sinkIds: Object.freeze([]),
      statement: 'Projectile mass enters at the muzzle and never leaves; '
        + 'the queue bounds the total.',
    },
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([kinetic]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy enters as each fired round\'s launch velocity and '
        + 'leaves through contact dissipation; nothing else crosses the '
        + 'boundary.',
    },
  ]);
}

function createStructuresPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-structures';
  const need = sceneNodeId(SYSTEM, 'need', 'see-support-hold-and-fail');
  const source = sceneNodeId(SYSTEM, 'source', 'weight-drop');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See stacked support hold, carry load, and fail honestly',
      job: 'Show a tower, a post-and-lintel, a supported beam, a clamped '
        + 'cantilever, and a bridge standing under gravity, carrying '
        + 'dropped weights, and collapsing when a support is removed.',
      rootRationale: 'Building games are stacking games; whether a column '
        + 'of rigid bodies stands or creeps decides whether construction '
        + 'is playable at all.',
      evidence: provenBy(
        'Everything stands for four simulated seconds within 0.12 m, and '
        + 'removing the middle pier drops both spans.',
        'structures-stand',
      ),
      honestyBoundary: 'Rigid bodies and contact only: no joints, no '
        + 'stress, no deformation. The cantilever is contact-clamped, and '
        + 'a load path is only as real as friction makes it.',
    }),
    playgroundGround(SYSTEM, need, 'Station floor',
      'Found every structure and catch every collapse.',
      provenBy('Nothing sank past 0.02 m while standing.', 'structures-stand')),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'structures'),
      kind: 'solid',
      label: 'The five test structures',
      job: 'The tower stresses plain stacking; the post-and-lintel routes '
        + 'a load down two paths; the supported beam spans; the clamped '
        + 'cantilever holds by contact alone; the three-pier bridge gives '
        + 'the removal case two spans that depend on one support.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Removing the middle pier drops both spans at least 0.2 m; the '
        + 'sibling structures-stand run pins everything holding still '
        + 'beforehand.',
        'structures-bridge-collapse',
      ),
      honestyBoundary: 'Each structure is one authored rule of repeated '
        + 'parts; the two clamp jaws are fixed because the wall they stand '
        + 'for is not under test — the plank\'s contact hold is.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'weights'),
      kind: 'solid',
      label: 'Droppable weights',
      job: 'Give the load cases a dense, unambiguous point mass to drop '
        + 'on the lintel, the beam, and the cantilever tip.',
      requiredBy: Object.freeze([need, source]),
      evidence: provenBy(
        'The lintel carried its dropped weight while the pillars held.',
        'structures-lintel-load',
      ),
      honestyBoundary: 'Queued visuals until their case fires them.',
    }),
    purposeBoundaryV1({
      id: source,
      kind: 'material-source',
      label: 'Weight drop',
      job: 'Bring one queued weight into the world above the chosen '
        + 'structure.',
      quantity: 'block-mass',
      visibility: 'visible',
      truncates: 'Whoever hoisted the weight; nothing restocks the rack.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The lintel-load check begins from a spawned weight.',
        'structures-lintel-load',
      ),
      honestyBoundary: 'A control-driven release, not a crane.',
    }),
    dissipationSink(SYSTEM, need, provenBy(
      'The standing set stays within 0.12 m for four simulated seconds — '
      + 'contact damping holds the stack.',
      'structures-stand',
    )),
  ], [
    {
      quantity: 'block-mass',
      closed: false,
      sourceIds: Object.freeze([source]),
      sinkIds: Object.freeze([]),
      statement: 'Weight mass enters at the drop release and never leaves; '
        + 'the rack bounds the total.',
    },
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy is open through dissipation alone; dropped '
        + 'weights arrive carrying potential energy with their mass.',
    },
  ]);
}

function createRollingPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-rolling';
  const need = sceneNodeId(SYSTEM, 'need', 'see-rolling-and-grid-artifacts');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See rolling behave and grid artifacts measured',
      job: 'Race six body shapes down identical slopes at two headings to '
        + 'the voxel grid, so rotational behaviour and grid-direction '
        + 'artifacts become positional differences anyone can read.',
      rootRationale: 'Everything in this engine is boxes; whether stepped '
        + 'surfaces can roll at all — and how badly heading matters — '
        + 'bounds every wheel, boulder, and barrel a game will ship.',
      evidence: provenBy(
        'The smooth-collider ball beats both faceted cylinders, which do '
        + 'roll at 28 degrees.',
        'rolling-inertia-race',
      ),
      honestyBoundary: 'Findings, not promises: faceted cylinders rest on '
        + 'their flats below roughly 24 degrees, and their solid-hollow '
        + 'ordering is corner-loss dominated and initial-condition '
        + 'sensitive — pinned as documentation, not as physics achieved.',
    }),
    playgroundGround(SYSTEM, need, 'Tiled apron',
      'Give both tracks and their long run-outs honest ground; two slabs '
      + 'tile it because a recipe dimension caps at 64 voxels.',
      provenBy(
        'Every racer stayed within 0.05 m of the apron plane for the whole '
        + 'run.',
        'rolling-grid-artifact',
      )),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'tracks'),
      kind: 'solid',
      label: 'The paired tracks',
      job: 'Two identical 28-degree slopes, one downhill along the voxel '
        + 'x axis and one yawed 45 degrees, so the only variable between '
        + 'runs is heading against the grid.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The ideal ball travels on both headings.',
        'rolling-grid-artifact',
      ),
      honestyBoundary: 'Smooth pose-pitched slabs: track stepping is '
        + 'deliberately excluded so the racers\' own surfaces are the '
        + 'variable under test.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'sphere-pair'),
      kind: 'solid',
      label: 'Voxel sphere and its ideal twin',
      job: 'The same voxel ball twice — exact stepped boxes versus a '
        + 'declared primitive ball collider. Their behaviour gap, per '
        + 'heading, is the grid-stepping artifact measured directly.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Both spheres travel on both headings; the ideal twin rolls '
        + 'decisively.',
        'rolling-grid-artifact',
      ),
      honestyBoundary: 'The ball collider is a stated simplification — '
        + 'the control, not the claim.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'cylinder-pair'),
      kind: 'solid',
      label: 'Solid and hollow cylinders',
      job: 'The classic rotational-inertia race — which on faceted voxel '
        + 'rims turns out to be corner-loss dominated, an honest finding '
        + 'about voxel rolling this pair exists to keep visible.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Both cylinders tip-roll at least 2 m at 28 degrees.',
        'rolling-inertia-race',
      ),
      honestyBoundary: 'Their finishing order is not pinned: it flips '
        + 'with centimeter-scale spawn changes, and pretending otherwise '
        + 'would be folklore.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'non-rollers'),
      kind: 'solid',
      label: 'Cube and irregular chunk',
      job: 'The controls that must not roll smoothly: the cube slides or '
        + 'tumbles, and the offset-mass chunk tumbles with a bias — if '
        + 'either keeps pace with the rollers, contact or friction is '
        + 'wrong.',
      requiredBy: Object.freeze([need]),
      evidence: notYetShown(
        'Their behaviour is visible in runs but no check pins it yet.',
        'A tumble-versus-roll check comparing their angular motion to the '
        + 'cylinders\'.',
      ),
      honestyBoundary: 'Two deliberate non-ideal shapes; nothing about '
        + 'them is tuned.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'berms'),
      kind: 'solid',
      label: 'The catch berms',
      job: 'End both run-outs on screen: an ideal ball rolls the flat '
        + 'without losing speed and would leave the world, and a wall '
        + 'below a ball\'s centre height just torques it over — so the '
        + 'berms stand 1.25 m.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'No racer left the apron plane by more than 0.05 m over the full '
        + 'race — with the berms gone, the ideal ball rolls off the world '
        + 'and this check fails.',
        'rolling-inertia-race',
      ),
      honestyBoundary: 'Walls, not measurements.',
    }),
    dissipationSink(
      SYSTEM,
      need,
      notYetShown(
        'No rolling scenario asserts rest: an ideal ball loses next to '
        + 'nothing to rolling contact, which is why the berms exist.',
        'A run asserting the faceted rollers are asleep against the berms.',
      ),
      'Bleed collision and sliding energy so the race ends against the '
      + 'berms instead of amplifying.',
    ),
  ], [
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy is open through dissipation alone; the racers '
        + 'start with the potential energy their spawn poses carry.',
    },
  ]);
}

function createFieldPurposeGraphV1(
  suffix: 'small' | 'medium' | 'stress',
  count: number,
  job: string,
): PurposeGraphV1 {
  const SYSTEM = `studio:scene:physics-field-${suffix}`;
  const need = sceneNodeId(SYSTEM, 'need', 'measure-load');
  const scenario = `field-${suffix}-settles`;
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: `Measure the solver under ${String(count)} bodies`,
      job,
      rootRationale: 'Scaling problems hide until body count rises; a '
        + 'preset that reports honest timing finds them before a game '
        + 'does.',
      evidence: provenBy(
        'The pile settles finite and in bounds, and the run reports max '
        + 'and mean step cost.',
        scenario,
      ),
      honestyBoundary: 'A load test: it promises timing numbers, never '
        + 'the target frame rate.',
    }),
    playgroundGround(SYSTEM, need, 'Station floor',
      'Catch the whole pile and give the penetration check its plane.',
      provenBy('Deepest dip stayed within 0.05 m.', scenario)),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'field'),
      kind: 'solid',
      label: `The ${String(count)}-block field`,
      job: 'Identical known cubes in a deterministic grid, so the only '
        + 'variable against the other presets is how many there are.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy('The settle scenario passes at this scale.', scenario),
      honestyBoundary: 'One authored rule: position and material derive '
        + 'from index arithmetic, with no randomness anywhere.',
    }),
    dissipationSink(SYSTEM, need, suffix === 'stress'
      ? notYetShown(
        'The stress preset deliberately stops before rest to report timing.',
        'A longer stress run asserting all-asleep-or-slow.',
      )
      : provenBy(
        'The pile ends asleep or under 0.15 m/s.',
        scenario,
      )),
  ], [
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'contact-dissipation')]),
      statement: 'Energy is open through dissipation alone; the pile '
        + 'arrives carrying the potential energy of its spawn grid.',
    },
  ]);
}

export function createPhysicsPlaygroundPurposeGraphsV1(): readonly PurposeGraphV1[] {
  return [
    createFallingPurposeGraphV1(),
    createRampPurposeGraphV1(),
    createLauncherPurposeGraphV1(),
    createStructuresPurposeGraphV1(),
    createRollingPurposeGraphV1(),
    createFieldPurposeGraphV1('small', 10,
      'Ten blocks: few enough to read individual contacts while checking '
      + 'the timing readout stays honest at trivial load.'),
    createFieldPurposeGraphV1('medium', 100,
      'One hundred blocks: the ordinary-gameplay profiling load.'),
    createFieldPurposeGraphV1('stress', 500,
      'Five hundred blocks: the scaling-problem finder, expected to be '
      + 'slow and required to say so.'),
  ];
}
