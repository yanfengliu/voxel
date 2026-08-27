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
 * The suspension cart's purpose ledger: the playground's first powered
 * machine, so beyond the trebuchet's joint records this graph carries an
 * energy source that is a motor rather than an authored pose, limits as
 * their own motion rule, and the contact policy as a declared interface.
 * Subtraction evidence is executable throughout: the locked-suspension
 * scenario, the stripped-limit slam, and the stripped-motor drive each
 * remove one capability and pin what the machine loses.
 */

const provenBy = (what: string, proofId: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `vitest fixtures/physics-playground: ${proofId}`,
  establishes: Object.freeze([what]),
});

const provenInBrowser = (what: string, where: string): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `playwright tests/browser/model-studio-physics-cart.spec.ts: ${where}`,
  establishes: Object.freeze([what]),
});

const notProven = (reason: string, wouldBeClosedBy: string): PurposeEvidenceV1 =>
  ({ kind: 'open', reason, wouldBeClosedBy });

export function createCartPurposeGraphV1(): PurposeGraphV1 {
  const SYSTEM = 'studio:scene:physics-cart';
  const need = sceneNodeId(SYSTEM, 'need', 'see-limits-and-motors');
  const motors = sceneNodeId(SYSTEM, 'source', 'axle-motors');
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: need,
      label: 'See joint limits and motors bear load',
      job: 'Show a powered drive holding and retargeting a speed, springs '
        + 'carrying a machine, and declared travel stops catching what the '
        + 'springs cannot — the two constraint capabilities the trebuchet\'s '
        + 'passive joints never touch, exercised by one legible vehicle.',
      rootRationale: 'The trebuchet proves passive constraints; nothing '
        + 'before this scene proves a driven or bounded one. A cart that '
        + 'parks on its brakes, crosses a potholed road, drops a ledge, and '
        + 'keeps its cargo is the smallest honest proof.',
      evidence: provenBy(
        'The drive crosses ten meters of potholes, drops the half-meter '
        + 'ledge, brakes, and ends with its cargo still on the deck; the '
        + 'same run with suspension and kingpins welded multiplies peak '
        + 'chassis vertical acceleration more than threefold, asserted '
        + 'over the whole drive and over the road span alone (measured '
        + '10.9 against 77.3 m/s2 full-drive and 9.0 against 41.6 on '
        + 'the road, at authoring).',
        'cart-drive and cart-locked-drive',
      ),
      honestyBoundary: 'A sandbox study: live runs are unrecorded, the '
        + 'wheels ride the stated smooth-tread simplification, and the '
        + 'steering is one shared target on two kingpins — no Ackermann '
        + 'linkage, no differential, and the road stays straight '
        + 'because the circle runs on the apron ring instead.',
    }),
    purposeBoundaryV1({
      id: motors,
      kind: 'energy-source',
      label: 'Axle velocity motors',
      job: 'Power the machine: two rear acceleration-based drives that '
        + 'hold target zero as a parking brake, retarget to cruise on '
        + 'command, and brake by retargeting to zero again; the front '
        + 'axles roll free so their treads keep their grip for steering.',
      quantity: 'energy',
      visibility: 'visible',
      truncates: 'Whatever fuels the drive; the motor is a solver '
        + 'constraint, not an engine model.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Stripping the motors from the same drive timeline parks the '
        + 'cart within a meter of its spawn; with them it crosses the '
        + 'road. The parked hold is its own scenario: on the brakes, '
        + 'every body drifts under 0.15 m for three seconds (measured '
        + '0.119 at authoring, nearly all of it the vertical spawn '
        + 'settle) and the machine goes to sleep.',
        'cart-drive, cart-hold, and the stripped-motor counter-run',
      ),
      honestyBoundary: 'An energy source, stated as one: while a motor '
        + 'runs, the passive-machine conservation check does not bind '
        + 'this scene, and no check meters the injection. The motor '
        + 'gains are calibrated by measurement, not derived from a '
        + 'torque curve.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'ground'),
      kind: 'solid',
      label: 'Stage floors',
      job: 'Carry the road, both ledge landings, and the steering '
        + 'field: eight flush tiles — the drive lane reaching x -18 '
        + 'to +30, and the apron ring the full-lock circle sweeps.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every scenario ends with every body on a tile; the '
        + 'floor-penetration check reads the whole run, the drive '
        + 'brakes to rest past the pinned x 9.5 plane (measured near '
        + 'x 16.8 at authoring), and the circle closes its loop on '
        + 'the apron ring.',
        'cart-drive and cart-reverse-run',
      ),
      honestyBoundary: 'Fixed deck slabs; the multiply combine rule reads '
        + 'each touching body\'s own friction undiluted.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'road'),
      kind: 'solid',
      label: 'The potholed road',
      job: 'Examine the suspension: two full-width potholes pitch the '
        + 'cart, three half-width ones roll it, and the east ledge drops '
        + 'it half a meter at speed.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The road\'s voxel count equals its two courses minus exactly '
        + 'the declared pothole cells, so a pothole cannot silently '
        + 'vanish from the drawn course.',
        'playground-cart.test.ts, the road cuts exactly the declared '
        + 'potholes',
      ),
      honestyBoundary: 'Potholes rather than ridges, and that is a '
        + 'measurement, not a style: a quarter-meter ridge is a step 0.4 '
        + 'wheel radii tall, and the cart stalled against it with ten '
        + 'times drive torque only wheelieing the chassis. The scenery '
        + 'follows the physics.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'chassis'),
      kind: 'solid',
      label: 'Sprung chassis deck',
      job: 'Be what the suspension protects: the deck whose ride the '
        + 'springs smooth and whose corners anchor all four prismatic '
        + 'joints.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Peak chassis vertical acceleration is pinned under 25 m/s2 '
        + 'sprung and over 45 m/s2 welded, more than threefold apart on '
        + 'the road span and the whole drive alike (measured 10.9 '
        + 'against 77.3 full-drive, 9.0 against 41.6 on the road, at '
        + 'authoring).',
        'playground-cart.test.ts, welding the springs multiplies peak '
        + 'chassis vertical acceleration',
      ),
      honestyBoundary: 'A rigid wood slab; no torsion, and its corners '
        + 'are joint anchors rather than drawn kingpins.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'carriers'),
      kind: 'solid',
      label: 'Wheel carriers',
      job: 'Be the unsprung mass: four blocks that ride the prismatic '
        + 'joints, so wheel motion becomes spring travel instead of deck '
        + 'motion. The rear pair holds the axles; the front pair hangs '
        + 'the steering kingpins.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The suspension coordinate is measured between chassis and '
        + 'carrier poses every sampled frame, and its anchor arithmetic '
        + 'pins each carrier\'s build centre to the chassis corner it '
        + 'hangs from.',
        'playground-cart.test.ts, suspension anchors sit at the chassis '
        + 'corners',
      ),
      honestyBoundary: 'Policy-inert colliders: a carrier touches '
        + 'nothing, because the joints are what hold it — the drawn cube '
        + 'is where the axle visibly lives, not a contact surface.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'wheels'),
      kind: 'solid',
      label: 'Driven wheels',
      job: 'Turn motor torque into travel: four voxel-drawn discs on the '
        + 'smooth-tread collider, whose road contact is where the cart\'s '
        + 'friction and rolling losses are charged.',
      requiredBy: Object.freeze([need, motors]),
      evidence: provenBy(
        'Each wheel spec carries the 0.625 m tread and the 26-cell drawn '
        + 'plus disc, whose farthest corner reaches 0.637 m so the drawn '
        + 'wheel never visibly enters the drawn road; the drive crosses '
        + 'the road on them and the reverse run recrosses it backward.',
        'playground-cart.test.ts, the wheel spec carries the smooth tread',
      ),
      honestyBoundary: 'Drawn faceted, simulated round, and the gap is '
        + 'measured rather than hidden: with exact voxel colliders the '
        + 'wheel\'s own flat is a chock, and ten times the drive torque '
        + 'wheelied the cart without tipping it. Driven bodies need round '
        + 'colliders, as racing bodies needed the ideal ball.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'knuckles'),
      kind: 'solid',
      label: 'Steering knuckles',
      job: 'Aim the front wheels: two plates riding the kingpins '
        + 'outboard of the front wheels, each carrying its wheel\'s '
        + 'axle, so where the plate points, the wheel rolls.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The kingpin anchor arithmetic pins both ends of each kingpin '
        + 'to the wheel\'s own centre line, and the circle run turns the '
        + 'cart through most of a revolution on them.',
        'cart-circle',
      ),
      honestyBoundary: 'Policy-inert beside the cargo pairs: a knuckle '
        + 'steers through its joints, and the kingpin pillar between '
        + 'carrier and plate is a joint, not drawn — the same honesty '
        + 'as the undrawn axle spokes.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'solid', 'cargo'),
      kind: 'solid',
      label: 'Unfastened cargo',
      job: 'Grade the ride: a stone block held to the deck by friction '
        + 'alone, whose staying aboard is what the suspension buys.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The drive ends with the cargo within 0.65 m of the chassis '
        + 'centre after ten meters of potholes and a half-meter drop.',
        'cart-drive',
      ),
      honestyBoundary: 'At cruise the locked control also keeps its '
        + 'cargo — the road is not violent enough to throw it, so the '
        + 'ride claim rests on the measured acceleration gap, and this '
        + 'node claims retention, not a spill contrast.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'suspension'),
      kind: 'interface',
      label: 'Sprung, limited prismatic corners',
      job: 'Hold each carrier on a vertical slide whose position motor is '
        + 'the coil and whose declared travel is the bump stops, opening '
        + 'at zero from the drawn pose.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'Every scenario bounds the measured coordinate inside the '
        + 'declared travel plus stated slop, and the parked machine '
        + 'sleeps on its brakes (static sag measured 0.040 to 0.042 m '
        + 'across the corners at authoring).',
        'cart-hold and cart-drive',
      ),
      honestyBoundary: 'A pure slide: no camber, caster, or arm '
        + 'geometry, and the spring is an acceleration-based motor whose '
        + 'gains are calibrated, not derived.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'axles'),
      kind: 'interface',
      label: 'Motored revolute axles',
      job: 'Spin each wheel about its carrier\'s z anchor, carrying the '
        + 'drive and brake targets the cases retarget live.',
      requiredBy: Object.freeze([need, motors]),
      evidence: provenBy(
        'The axle anchor arithmetic pins each wheel\'s build centre to '
        + 'its carrier anchor, and the profile carries all four revolute '
        + 'joints with their declared velocity motors.',
        'playground-cart.test.ts, the live profile carries the contact '
        + 'policy and both motor kinds',
      ),
      honestyBoundary: 'The spokes between carrier and rim are not '
        + 'drawn — the wheel visibly floats beside its knuckle, exactly '
        + 'as the trebuchet\'s trigger rope spans undrawn. Bearing '
        + 'friction comes from the universal law, not this declaration.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'kingpins'),
      kind: 'interface',
      label: 'Limited, servoed kingpins',
      job: 'Swing each knuckle about the vertical axis through its '
        + 'wheel\'s centre: the position motor is the steering servo the '
        + 'steer cases retarget, and the declared ±0.7 rad stops are '
        + 'the playground\'s first revolute limits.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The steer-lock scenario shoves the servo far past the stops '
        + 'and bounds the angle the hinge actually reaches; the fixture '
        + 'suite runs the same shove with the stops stripped and '
        + 'measures the servo win, so the revolute limit path is proven '
        + 'live, not assumed from the prismatic one.',
        'cart-steer-lock and its stripped-limit counter-run',
      ),
      honestyBoundary: 'A vertical hinge only: no caster, camber, or '
        + 'Ackermann — both kingpins take one target, so the inner and '
        + 'outer wheels fight slightly in a tight circle, and the servo '
        + 'gains are calibrated by measurement like the springs.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'interface', 'declared-contacts'),
      kind: 'interface',
      label: 'Declared contact pairs',
      job: 'Name the thirty pairs that may touch — wheels on ground, '
        + 'cargo on deck and ground — so the mechanism\'s internals pass '
        + 'through each other instead of grinding.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The generated live profile carries exactly fifty-two pairs, '
        + 'and both lanes apply the same policy at build.',
        'playground-cart.test.ts, the live profile carries the contact '
        + 'policy and both motor kinds',
      ),
      honestyBoundary: 'A declaration, not a discovery: a contact the '
        + 'policy omits cannot happen, which is the point and the risk — '
        + 'an omitted pair fails silent, so the pair list is pinned by '
        + 'count.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'limits-hold'),
      kind: 'motion-rule',
      label: 'Declared travel is a stop, not a suggestion',
      job: 'Bound every suspension coordinate to its declared range plus '
        + 'stated solver compliance, under the worst slam the scene '
        + 'scripts.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The slam\'s travel checks bound the coordinate at the declared '
        + 'stop plus the measured 0.045 impulse-limit compliance; the '
        + 'fixture suite runs the same slam with the limits stripped and '
        + 'measures the overrun past that bound (0.424 against 0.295 '
        + 'caught, at authoring), and a guard asserts the slam genuinely '
        + 'reaches the stops.',
        'cart-drop-slam and its stripped-limit counter-run',
      ),
      honestyBoundary: 'An impulse-based stop yields before it holds; '
        + 'the stated slop is that measured compliance, not zero.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'steering-answers'),
      kind: 'motion-rule',
      label: 'Steering turns the cart, inside its stops',
      job: 'Bind the steering chain end to end: a full-lock command '
        + 'must carry the whole cart around most of a turn inside the '
        + 'field, with every kingpin angle bounded by the declared '
        + 'stops plus stated compliance throughout.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The circle run sweeps the chassis past 270° accumulated while '
        + 'net displacement stays inside the field, with suspension and '
        + 'kingpin coordinates bounded every sampled frame.',
        'cart-circle',
      ),
      honestyBoundary: 'Rear-wheel drive is part of the claim: with '
        + 'driven front wheels the same command plowed a 9.5 m radius '
        + 'off the field — the friction circle, measured — so the '
        + 'steering proof owns the drivetrain layout it requires.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'powered-energy-honesty'),
      kind: 'motion-rule',
      label: 'A powered machine says so',
      job: 'Keep the energy story honest: the motors inject energy while '
        + 'driving, so no passive-conservation ceiling is claimed for '
        + 'this scene, and the machine still ends at rest because every '
        + 'loss law — bearing, rolling, air — keeps charging.',
      requiredBy: Object.freeze([need, motors]),
      evidence: notProven(
        'Nothing meters the motor\'s injection: the scene asserts where '
        + 'the cart goes and how it rides, but no check integrates motor '
        + 'work against the kinetic and dissipated totals, so a solver '
        + 'fault that injected energy through a driven joint would hide '
        + 'inside the motor\'s legitimate injection while one drives.',
        'A windowed energy check that binds the coastdown after the '
        + 'brake retarget — motor at target zero is a sink, so from the '
        + 'brake tick to rest the passive frame-to-frame ceiling applies.',
      ),
      honestyBoundary: 'The first station where energy rises by design; '
        + 'the conservation vocabulary the trebuchet uses does not bind '
        + 'a powered run and is not claimed to.',
    }),
    purposeBoundaryV1({
      id: sceneNodeId(SYSTEM, 'sink', 'loss-laws'),
      kind: 'energy-sink',
      label: 'Universal loss laws',
      job: 'Bring every run to rest once the motors hold zero: bearing '
        + 'friction on every jointed body, rolling resistance at every '
        + 'ground contact, air drag on everything.',
      quantity: 'energy',
      visibility: 'invisible',
      truncates: 'Heat and sound.',
      requiredBy: Object.freeze([need]),
      evidence: provenBy(
        'The twin charges wood\'s 0.82 held damping to a carrier and '
        + 'drops it to bare air-spin 0.02 the step after its last joint '
        + 'is detached — the law reads the present tense in this lane '
        + 'too, which its add-only registry used to get wrong.',
        'playground-cart.test.ts, bearing friction stops when the last '
        + 'joint lets go',
      ),
      honestyBoundary: 'Damping-rate stand-ins calibrated by stopping '
        + 'distance, as the law table itself states; no loss here is '
        + 'derived from a bearing or tyre model.',
    }),
    purposeNodeV1({
      id: sceneNodeId(SYSTEM, 'motion-rule', 'live-interact'),
      kind: 'motion-rule',
      label: 'The live lane drives the same cart',
      job: 'Open in Interact with the same profile the twin proves: '
        + 'same bodies, joints, limits, motors, and policy, with the '
        + 'panel\'s drive, stop, and reverse retargeting the same '
        + 'motors.',
      requiredBy: Object.freeze([need]),
      evidence: provenInBrowser(
        'The opened scene reports a live world with twenty-one bodies '
        + 'and ten joints, and firing the drive case carries the '
        + 'chassis measurably east on screen.',
        'the cart drives on command in the live scene',
      ),
      honestyBoundary: 'The live lane stays unrecorded and carries the '
        + 'known soft-CCD divergence every playground scene shares; the '
        + 'headless twin is the evidence lane.',
    }),
  ], [
    {
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([motors]),
      sinkIds: Object.freeze([sceneNodeId(SYSTEM, 'sink', 'loss-laws')]),
      statement: 'Energy enters through the axle motors while a drive '
        + 'target is nonzero and leaves through the universal loss laws; '
        + 'nothing meters the exchange, which the powered-energy-honesty '
        + 'rule records as the open half.',
    },
    {
      quantity: 'block-mass',
      closed: true,
      sourceIds: Object.freeze([]),
      sinkIds: Object.freeze([]),
      statement: 'No body enters or leaves the scene: the cart has no '
        + 'spawn magazine, and every scripted run ends with all fifteen '
        + 'bodies on drawn ground inside the floor tiles\' reach.',
    },
  ]);
}
