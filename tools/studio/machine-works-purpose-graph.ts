import {
  MACHINE_WORKS_PURPOSE_MAP_V1,
  type MachineWorksPurposeEntryV1,
} from './machine-works-purpose.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
  type PurposeNodeV1,
} from './purpose-graph.js';

/**
 * Machine Works projected onto the typed graph.
 *
 * The prose in machine-works-purpose.ts stays the single source of truth for
 * what each placement does; this file adds only the one thing prose could not
 * carry — the edges. `mechanicalRelationships[].object` is an English string,
 * and one of them reads 'belt-drive-west, belt-drive-east, and the closed slat
 * path': three targets in one field that nothing can traverse. The table below
 * states those targets as ids instead.
 */

export const MACHINE_WORKS_PURPOSE_SYSTEM_ID_V1 = 'machine-works' as const;

const NEED = Object.freeze({
  assembly: 'machine-works:need:legible-assembly-sequence',
  transport: 'machine-works:need:legible-transport',
  grounded: 'machine-works:need:visible-support-to-ground',
} as const);

const solidId = (category: string): PurposeNodeIdV1 =>
  `machine-works:solid:${category}`;

/**
 * Who needs each category, by id. Derived from the existing
 * `mechanicalRelationships` verbs: an active verb (supports, turns, carries,
 * holds, engages) points from the provider to the thing that needs it, and a
 * passive verb (anchored-by, aligned-by) is that same edge read backwards.
 */
const REQUIRED_BY: Readonly<Record<string, readonly PurposeNodeIdV1[]>> =
  Object.freeze({
    'conveyor-foundation': Object.freeze([
      solidId('assembly-press-bridge'),
      solidId('conveyor-drive-drums'),
      solidId('output-trunnion-dock'),
      NEED.grounded,
    ]),
    'conveyor-drive-drums': Object.freeze([solidId('conveyor-slats')]),
    'exposed-drive-phase-flags': Object.freeze([NEED.transport]),
    'conveyor-slats': Object.freeze([solidId('transfer-carriage')]),
    'assembly-press-bridge': Object.freeze([solidId('insertion-heads')]),
    'output-trunnion-dock': Object.freeze([solidId('transfer-carriage')]),
    'collection-bucket': Object.freeze([NEED.transport]),
    'transfer-carriage': Object.freeze([
      solidId('product-base'),
      NEED.transport,
    ]),
    'insertion-heads': Object.freeze([
      solidId('product-core'),
      solidId('product-cap'),
    ]),
    'product-base': Object.freeze([solidId('product-core'), NEED.assembly]),
    'product-core': Object.freeze([solidId('product-cap'), NEED.assembly]),
    'product-cap': Object.freeze([NEED.assembly]),
  });

const SIMULATION_PROOF = 'Machine Works consumer physics fixture';
const REPLAY_PROOF = 'Machine Works committed replay';

/**
 * Categories the documented fixture keeps outside the solver. These become
 * tracked open obligations rather than confident prose, because the design
 * record already says the bridge supplies no Rapier body and the dock is not
 * simulated as a revolute joint.
 */
const OUTSIDE_THE_SOLVER: Readonly<Record<string, string>> = Object.freeze({
  'assembly-press-bridge':
    'The bridge supplies no Rapier body, captive guide, solved load transfer, '
    + 'or stress evidence; its actuation route is exact geometry only.',
  'output-trunnion-dock':
    'The dock remains outside Rapier, so no revolute constraint, bearing '
    + 'contact response, motor torque, or feedback dynamics is solved.',
  'exposed-drive-phase-flags':
    'The flags are collision-excluded and derive from the hashed belt phase; '
    + 'no gear teeth, contact, or torque is claimed.',
});

function nodeFor(entry: MachineWorksPurposeEntryV1): PurposeNodeV1 {
  const requiredBy = REQUIRED_BY[entry.category];
  if (requiredBy === undefined) {
    throw new Error(
      `Cannot project Machine Works category '${entry.category}' onto the `
      + 'purpose graph: no requiredBy edge is declared for it. Add its '
      + 'beneficiary ids to REQUIRED_BY in machine-works-purpose-graph.ts, or '
      + 'remove the category from MACHINE_WORKS_PURPOSE_MAP_V1.',
    );
  }
  const unsolved = OUTSIDE_THE_SOLVER[entry.category];
  return purposeNodeV1({
    id: solidId(entry.category),
    kind: 'solid',
    label: entry.category,
    job: entry.purpose,
    requiredBy,
    evidence: unsolved === undefined
      ? {
        kind: 'bound',
        proofId: SIMULATION_PROOF,
        establishes: Object.freeze([
          `The nominal run advances '${entry.category}' as declared and its `
          + 'placements pass the fixture gates.',
        ]),
      }
      : {
        kind: 'open',
        reason: unsolved,
        wouldBeClosedBy:
          `A fixture run that installs '${entry.category}' as solver bodies `
          + 'and an ablation that removes them, showing the loss it claims.',
      },
    honestyBoundary: entry.removalConsequence,
  });
}

const NEEDS: readonly PurposeNodeV1[] = Object.freeze([
  purposeNeedV1({
    id: NEED.assembly,
    label: 'Legible assembly sequence',
    job: 'A viewer must be able to see a product built from separate parts.',
    rootRationale:
      'The scene exists to show assembly, so the component-by-component order '
      + 'is the thing being communicated.',
    evidence: {
      kind: 'bound',
      proofId: REPLAY_PROOF,
      establishes: Object.freeze([
        'The committed trace records assembly evidence at about 11.67 seconds.',
      ]),
    },
    honestyBoundary:
      'Legibility at the declared cameras only; not a claim about real '
      + 'manufacturing practice.',
  }),
  purposeNeedV1({
    id: NEED.transport,
    label: 'Legible transport to collection',
    job: 'A viewer must be able to follow the product from belt to bucket.',
    rootRationale:
      'A machine that assembles but never delivers reads as unfinished, so '
      + 'the handoff is part of what the scene must communicate.',
    evidence: {
      kind: 'bound',
      proofId: REPLAY_PROOF,
      establishes: Object.freeze([
        'The committed trace records release, contact, and collection evidence '
        + 'at about 18.33, 20.80, and 26.33 seconds.',
      ]),
    },
    honestyBoundary:
      'Presented pose evidence only; the renderer performs no integration.',
  }),
  purposeNeedV1({
    id: NEED.grounded,
    label: 'Nothing floats',
    job:
      'Every mass in the scene must show a visible path to the ground plane.',
    rootRationale:
      'Objects fall unless something holds them up. A scene that leaves a '
      + 'mass unsupported contradicts the first physical law a viewer checks.',
    evidence: {
      kind: 'bound',
      proofId: SIMULATION_PROOF,
      establishes: Object.freeze([
        'Four named bridge feet terminate on distinct occupied foundation-pad '
        + 'top faces, and the dock plinths face-contact occupied guard tops.',
      ]),
    },
    honestyBoundary:
      'Visible load path and face contact only; no stress, deflection, or '
      + 'bearing pressure is solved.',
  }),
]);

/**
 * Where work enters and leaves. Each one is a place the fixture deliberately
 * stops simulating: the belt has no motor, the heads have no charger, the dock
 * has no servo dynamics, and friction heat is never accounted.
 */
const BOUNDARIES: readonly PurposeNodeV1[] = Object.freeze([
  purposeBoundaryV1({
    id: 'machine-works:source:prescribed-belt-motion',
    kind: 'energy-source',
    label: 'Prescribed belt motion',
    job: 'Advance the kinematic slat loop at the hashed phase.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'The drive motor, its supply, and every upstream generator.',
    requiredBy: Object.freeze([solidId('conveyor-slats')]),
    evidence: {
      kind: 'bound',
      proofId: SIMULATION_PROOF,
      establishes: Object.freeze([
        'Zero-drive and zero-friction ablations bound the belt\'s causal role '
        + 'in transporting the carrier.',
      ]),
    },
    honestyBoundary:
      'Kinematic prescription, not solved motor torque or feedback dynamics.',
  }),
  purposeBoundaryV1({
    id: 'machine-works:source:precharged-head-buffer',
    kind: 'energy-source',
    label: 'Precharged head buffer',
    job: 'Supply each insertion head its local actuation stroke.',
    quantity: 'energy',
    visibility: 'visible',
    truncates:
      'Charging, the flexible moving feed, electricity, and electromagnetic '
      + 'force are all outside the fixture.',
    requiredBy: Object.freeze([solidId('insertion-heads')]),
    evidence: {
      kind: 'open',
      reason:
        'The buffer is authored geometry with no solved store, flow, or '
        + 'discharge behind it.',
      wouldBeClosedBy:
        'A run that meters stored work against the actuation performed and '
        + 'fails when the buffer is drained.',
    },
    honestyBoundary: 'No charging, electricity, or energy use is simulated.',
  }),
  purposeBoundaryV1({
    id: 'machine-works:source:prescribed-dock-rotation',
    kind: 'energy-source',
    label: 'Prescribed dock rotation',
    job: 'Turn the carrier about the visible trunnion to release the product.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'The outboard servo, its control loop, and its power draw.',
    requiredBy: Object.freeze([solidId('output-trunnion-dock')]),
    evidence: {
      kind: 'open',
      reason:
        'The dock rotation is prescribed outside Rapier, so no torque does '
        + 'the work the animation shows.',
      wouldBeClosedBy:
        'A revolute joint with a motor whose torque produces the same sweep '
        + 'inside the solver.',
    },
    honestyBoundary:
      'Swept-clearance geometry is proven; the actuation is not.',
  }),
  purposeBoundaryV1({
    id: 'machine-works:sink:contact-friction-dissipation',
    kind: 'energy-sink',
    label: 'Contact friction dissipation',
    job: 'Remove the energy that solved contact and friction consume.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'Heat, sound, and wear are never represented.',
    requiredBy: Object.freeze([solidId('transfer-carriage')]),
    evidence: {
      kind: 'bound',
      proofId: SIMULATION_PROOF,
      establishes: Object.freeze([
        'Rapier contact and friction transport the axis-constrained carrier, '
        + 'and the zero-friction ablation removes that transport.',
      ]),
    },
    honestyBoundary:
      'Friction is configured, not independently isolated; no heat, sound, or '
      + 'wear model exists.',
  }),
]);

export function createMachineWorksPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(
    MACHINE_WORKS_PURPOSE_SYSTEM_ID_V1,
    [
      ...NEEDS,
      ...MACHINE_WORKS_PURPOSE_MAP_V1.map(nodeFor),
      ...BOUNDARIES,
    ],
    [{
      quantity: 'energy',
      closed: false,
      sourceIds: Object.freeze([
        'machine-works:source:prescribed-belt-motion',
        'machine-works:source:precharged-head-buffer',
        'machine-works:source:prescribed-dock-rotation',
      ]),
      sinkIds: Object.freeze([
        'machine-works:sink:contact-friction-dissipation',
      ]),
      statement:
        'Machine Works is open in energy. Work enters through prescribed belt '
        + 'motion, the precharged head buffers, and prescribed dock rotation, '
        + 'and leaves through contact friction. The fixture therefore claims '
        + 'no energy balance and no global conservation.',
    }],
  );
}
