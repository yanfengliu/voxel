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

/**
 * Riverfall projected onto the typed graph, with the solver left alone.
 *
 * The fluid fixture is proven and nothing here touches it. What this records is
 * the half that was never written down: the presentation constructs sitting
 * between the solved particles and the picture. The carrier phase, tracer,
 * occupancy proxy, normal displacement, neighbour smoothing, and loop bridge
 * all move pixels, and none of them is a solved water height, energy, or
 * density field. Each one now says so in its own record instead of relying on
 * one disclaimer at the end of a long paragraph.
 *
 * Projecting it also exposes two gaps. The dissipative boundary impact and the
 * inlet forcing both do work on the system and neither has an isolating
 * ablation, so both are recorded as open rather than implied by the four that
 * do: zero-density, zero-gravity, zero-pump, and zero-xsph.
 */

export const RIVERFALL_PURPOSE_SYSTEM_ID_V1 = 'riverfall' as const;

/** Ablation names the consumer fixture actually runs. Guarded by a live test. */
export const RIVERFALL_BOUND_ABLATIONS_V1 = Object.freeze([
  'zero-density',
  'zero-gravity',
  'zero-pump',
  'zero-xsph',
] as const);

/** Particle count the fixture holds fixed, which is why water mass is closed. */
export const RIVERFALL_CLOSED_PARTICLE_COUNT_V1 = 288;

const NEED = Object.freeze({
  flowing: 'riverfall:need:water-reads-as-flowing',
  continuous: 'riverfall:need:one-continuous-body',
  loop: 'riverfall:need:seamless-loop',
} as const);

const id = (value: string): PurposeNodeIdV1 => value as PurposeNodeIdV1;

const ablated = (
  ablation: typeof RIVERFALL_BOUND_ABLATIONS_V1[number],
  establishes: string,
): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `riverfall fluid ablation '${ablation}'`,
  establishes: Object.freeze([establishes]),
});

const PRESENTATION_BOUNDARY =
  'A presentation construct. It is not a solved water height, energy, or '
  + 'density field, and it never collides with rendered voxel geometry.';

const NEEDS: readonly PurposeNodeV1[] = Object.freeze([
  purposeNeedV1({
    id: NEED.flowing,
    label: 'Water reads as flowing',
    job: 'A viewer must see water travel downstream and fall, not sit still.',
    rootRationale:
      'The scene is named for moving water. If the surface does not read as '
      + 'travelling in one direction, nothing else in it matters.',
    evidence: ablated(
      'zero-gravity',
      'Removing gravity stops the sheet accelerating over the lip.',
    ),
    honestyBoundary:
      'A stylized deterministic two-dimensional thin-sheet proof. Not a '
      + 'volumetric or free-surface Navier-Stokes engine.',
  }),
  purposeNeedV1({
    id: NEED.continuous,
    label: 'One continuous body of water',
    job:
      'The river, fall, pond, and outflow must read as one body rather than '
      + 'four separate props that happen to touch.',
    rootRationale:
      'Water that changes identity at each reach boundary reads as scenery '
      + 'pieces, which is exactly what a flow scene must not look like.',
    evidence: {
      kind: 'bound',
      proofId: 'riverfall surface topology hash and reach grid checks',
      establishes: Object.freeze([
        'The tile grid is checked against the live river, lip, exposed fall, '
        + 'pond, and outflow recipes, and every tile shares one blue.',
      ]),
    },
    honestyBoundary:
      'Continuity of appearance only. No mass, momentum, or volume is carried '
      + 'across reach boundaries by the presentation.',
  }),
  purposeNeedV1({
    id: NEED.loop,
    label: 'Seamless loop',
    job: 'The recorded replay must return to its first frame without a jump.',
    rootRationale:
      'A visible seam each cycle would read as the scene resetting, which '
      + 'contradicts the continuous flow the whole scene claims.',
    evidence: {
      kind: 'bound',
      proofId: 'riverfall presentation bridge and frame-zero pose tests',
      establishes: Object.freeze([
        'A 24-frame cubic Hermite bridge and an appended frame-zero pose close '
        + 'the replay without a pose discontinuity.',
      ]),
    },
    honestyBoundary:
      'The bridge is interpolation between recorded poses, not simulated '
      + 'motion, so those frames are not solver output.',
  }),
]);

function law(
  key: string,
  label: string,
  job: string,
  evidence: PurposeEvidenceV1,
  honestyBoundary: string,
): PurposeNodeV1 {
  return purposeNodeV1({
    id: id(`riverfall:motion:${key}`),
    kind: 'motion-rule',
    label,
    job,
    requiredBy: Object.freeze([NEED.flowing]),
    evidence,
    honestyBoundary,
  });
}

const LAWS: readonly PurposeNodeV1[] = Object.freeze([
  law(
    'pbf-density-constraint',
    'PBF density constraint',
    'Hold the sheet together at roughly constant spacing each substep.',
    ablated(
      'zero-density',
      'Removing the density iterations breaks the coherent sheet.',
    ),
    'A two-dimensional position-based constraint with a declared residual, not '
    + 'a solved pressure field.',
  ),
  law(
    'gravity-tangent-projection',
    'Gravity, projected on the surface tangent',
    'Accelerate particles down the reach and over the lip.',
    ablated('zero-gravity', 'Removing gravity stops the fall entirely.'),
    'Gravity is projected into the two-dimensional sheet, so it is a surrogate '
    + 'for a three-dimensional fall rather than the fall itself.',
  ),
  law(
    'xsph-viscosity',
    'XSPH viscosity',
    'Smooth neighbouring particle velocities so the sheet moves together.',
    ablated(
      'zero-xsph',
      'Removing the XSPH term measurably changes neighbour relative speed.',
    ),
    'A velocity-smoothing coefficient, not a measured fluid viscosity.',
  ),
  law(
    'dissipative-boundary-impact',
    'Dissipative boundary impact',
    'Remove energy where particles strike the bed and the pond floor.',
    {
      kind: 'open',
      reason:
        'The fixture runs zero-density, zero-gravity, zero-pump, and zero-xsph '
        + 'ablations, but none that disables the dissipative boundary, so the '
        + 'amount this removes is never isolated.',
      wouldBeClosedBy:
        'A zero-impact ablation that makes the boundary elastic and shows the '
        + 'pond and outflow speeds rise.',
    },
    'A heuristic impact transition. No heat, sound, or spray is represented.',
  ),
]);

const SURFACES: readonly { readonly key: string; readonly label: string; readonly job: string }[] = [
  {
    key: 'river-surface',
    label: 'River surface',
    job: 'Carry the upper reach from the inlet to the lip.',
  },
  {
    key: 'waterfall-curtain',
    label: 'Waterfall curtain',
    job: 'Carry the exposed fall between the lip and the pond.',
  },
  {
    key: 'pond-surface',
    label: 'Pond surface',
    job: 'Receive the fall and slow it into a bounded body.',
  },
  {
    key: 'pond-outflow',
    label: 'Pond outflow',
    job: 'Take water out of the pond so the reach has an end.',
  },
];

const SOLIDS: readonly PurposeNodeV1[] = Object.freeze([
  purposeNodeV1({
    id: id('riverfall:solid:landscape'),
    kind: 'solid',
    label: 'Landscape',
    job: 'Provide the bed and banks every water surface sits in.',
    requiredBy: Object.freeze(
      SURFACES.map((surface) => id(`riverfall:solid:${surface.key}`)),
    ),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall surface grid bank-containment tests',
      establishes: Object.freeze([
        'Tile footprints stay bank-contained through the whole recorded run.',
      ]),
    },
    honestyBoundary:
      'The terrain bounds the presentation only. It is not a solver collider '
      + 'and the fluid does not collide with rendered voxels.',
  }),
  ...SURFACES.map((surface) => purposeNodeV1({
    id: id(`riverfall:solid:${surface.key}`),
    kind: 'solid' as const,
    label: surface.label,
    job: surface.job,
    requiredBy: Object.freeze([NEED.continuous]),
    evidence: {
      kind: 'bound' as const,
      proofId: 'riverfall surface topology hash',
      establishes: Object.freeze([
        `The tile grid is checked against the live ${surface.key} recipe.`,
      ]),
    },
    honestyBoundary:
      'Appearance of a reach, not a solved free surface with depth or volume.',
  })),
  purposeNodeV1({
    id: id('riverfall:solid:bank-trees'),
    kind: 'solid',
    label: 'Bank trees',
    job:
      'Frame the river and pond from both banks so the reach reads as a place '
      + 'with edges rather than a floating ribbon.',
    requiredBy: Object.freeze([
      id('riverfall:solid:river-surface'),
      id('riverfall:solid:pond-surface'),
    ]),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall framing relationship tests',
      establishes: Object.freeze([
        'Every tree stands nearer the surface it declares it frames than the '
        + 'other one, and both surfaces are framed from both banks.',
      ]),
    },
    honestyBoundary:
      'One bounded group under one rule. Individual trees are placed for '
      + 'framing and scale only, and none is claimed to shade or shelter.',
  }),
]);

interface PresentationSpecV1 {
  readonly key: string;
  readonly label: string;
  readonly job: string;
  readonly requiredBy: readonly PurposeNodeIdV1[];
  readonly evidence: PurposeEvidenceV1;
}

const openPresentation = (what: string, closer: string): PurposeEvidenceV1 => ({
  kind: 'open',
  reason:
    `${what} is covered by the derived surface input hash, which proves the `
    + 'output is reproducible, not that the reading it produces is right.',
  wouldBeClosedBy: closer,
});

const PRESENTATION_SPECS: readonly PresentationSpecV1[] = [
  {
    key: 'surface-tile-grid',
    label: 'Surface tile grid',
    job:
      'Turn scattered particles into a continuous readable sheet by mapping '
      + 'them onto fixed Eulerian tiles.',
    requiredBy: Object.freeze([NEED.flowing, NEED.continuous]),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall surface grid support tests',
      establishes: Object.freeze([
        'Every cell-frame fails closed unless at least two visible particles '
        + 'lie inside the kernel radius, so no tile is drawn without support.',
      ]),
    },
  },
  {
    key: 'carrier-phase',
    label: 'Carrier phase',
    job: 'Give the surface a coherent downstream travelling wave to read.',
    requiredBy: Object.freeze([id('riverfall:presentation:surface-tile-grid')]),
    evidence: openPresentation(
      'The carrier phase',
      'A viewer study, or a measurement that the read travel direction matches '
      + 'the solved mean particle velocity along each reach.',
    ),
  },
  {
    key: 'carried-tracer',
    label: 'Carried tracer',
    job:
      'Let a viewer follow one patch of surface downstream instead of seeing '
      + 'undifferentiated motion.',
    requiredBy: Object.freeze([id('riverfall:presentation:surface-tile-grid')]),
    evidence: openPresentation(
      'The recording-start carried tracer',
      'Evidence that the tracer a viewer follows corresponds to the same '
      + 'particles the solver carries, rather than only to tile index.',
    ),
  },
  {
    key: 'support-occupancy-proxy',
    label: 'Support occupancy proxy',
    job: 'Fade a tile out where too few particles support it.',
    requiredBy: Object.freeze([id('riverfall:presentation:surface-tile-grid')]),
    evidence: openPresentation(
      'The support-occupancy proxy',
      'A comparison against solved local density showing the proxy tracks it.',
    ),
  },
  {
    key: 'normal-displacement',
    label: 'Normal displacement',
    job:
      'Move tile centres along the local surface normal so the sheet has '
      + 'visible relief without leaving its banks.',
    requiredBy: Object.freeze([id('riverfall:presentation:surface-tile-grid')]),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall bank-containment and displacement bound tests',
      establishes: Object.freeze([
        'Fixed-orientation tile centres move only along the local normal and '
        + 'their footprints stay bank-contained.',
      ]),
    },
  },
  {
    key: 'neighbour-smoothing',
    label: 'Neighbour smoothing',
    job: 'Remove tile-to-tile noise so the carrier reads as one surface.',
    requiredBy: Object.freeze([id('riverfall:presentation:carrier-phase')]),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall near-versus-distant perturbation tests',
      establishes: Object.freeze([
        'Paired perturbation tests prove local influence without distant '
        + 'extrapolation, so smoothing stays a local operation.',
      ]),
    },
  },
  {
    key: 'loop-bridge',
    label: 'Loop bridge',
    job: 'Close the recorded replay onto its first frame without a jump.',
    requiredBy: Object.freeze([NEED.loop]),
    evidence: {
      kind: 'bound',
      proofId: 'riverfall presentation bridge tests',
      establishes: Object.freeze([
        'A 24-frame cubic Hermite bridge and appended frame-zero pose close '
        + 'the loop with no pose discontinuity.',
      ]),
    },
  },
  {
    key: 'concealed-underfill',
    label: 'Concealed underfill',
    job:
      'Hide the gap under a displaced sheet so no hole opens between the '
      + 'surface and its bed.',
    requiredBy: Object.freeze([id('riverfall:presentation:surface-tile-grid')]),
    evidence: openPresentation(
      'The concealed underfill',
      'An adversarial low-camera capture showing no gap appears at any '
      + 'recorded frame.',
    ),
  },
];

const PRESENTATION: readonly PurposeNodeV1[] = Object.freeze(
  PRESENTATION_SPECS.map((spec) => purposeNodeV1({
    id: id(`riverfall:presentation:${spec.key}`),
    kind: 'motion-rule',
    label: spec.label,
    job: spec.job,
    requiredBy: spec.requiredBy,
    evidence: spec.evidence,
    honestyBoundary: PRESENTATION_BOUNDARY,
  })),
);

const BOUNDARIES: readonly PurposeNodeV1[] = Object.freeze([
  purposeBoundaryV1({
    id: id('riverfall:source:hidden-recirculation-pump'),
    kind: 'energy-source',
    label: 'Hidden recirculation pump',
    job:
      'Return outflow particles to the head of the reach so the scene runs '
      + 'indefinitely from a fixed particle set.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates:
      'The pump itself, its motor, its power supply, and every catchment '
      + 'upstream of the modelled reach.',
    requiredBy: Object.freeze([NEED.flowing, NEED.loop]),
    evidence: ablated(
      'zero-pump',
      'Disabling the pump stops recirculation, which bounds it as the work '
      + 'input that keeps the reach running.',
    ),
    honestyBoundary:
      'Bounded pump work only. This is why the fixture may claim particle '
      + 'accounting but never global energy conservation.',
  }),
  purposeBoundaryV1({
    id: id('riverfall:source:inlet-forcing'),
    kind: 'energy-source',
    label: 'Inlet forcing',
    job: 'Set the speed particles carry as they enter the upper reach.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'The whole river above the modelled reach.',
    requiredBy: Object.freeze([NEED.flowing]),
    evidence: {
      kind: 'open',
      reason:
        'No ablation disables the inlet, so the work it adds is never '
        + 'separated from the pump\'s.',
      wouldBeClosedBy:
        'A zero-inlet ablation showing the upper reach stalls while '
        + 'recirculation continues.',
    },
    honestyBoundary:
      'A prescribed boundary velocity, not a solved upstream condition.',
  }),
  purposeBoundaryV1({
    id: id('riverfall:sink:xsph-dissipation'),
    kind: 'energy-sink',
    label: 'XSPH dissipation',
    job: 'Remove the energy velocity smoothing takes out of the sheet.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'Heat, and any transfer to the air above the surface.',
    requiredBy: Object.freeze([id('riverfall:motion:xsph-viscosity')]),
    evidence: ablated(
      'zero-xsph',
      'Removing the term measurably changes mean neighbour relative speed, '
      + 'which bounds how much it takes out.',
    ),
    honestyBoundary:
      'The amount removed is not metered against a total energy budget.',
  }),
  purposeBoundaryV1({
    id: id('riverfall:sink:impact-dissipation'),
    kind: 'energy-sink',
    label: 'Impact dissipation',
    job: 'Remove the energy lost where the sheet strikes bed and pond floor.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'Heat, sound, spray, and erosion.',
    requiredBy: Object.freeze([
      id('riverfall:motion:dissipative-boundary-impact'),
    ]),
    evidence: {
      kind: 'open',
      reason:
        'No ablation disables the dissipative boundary, so the energy leaving '
        + 'here is unmeasured.',
      wouldBeClosedBy:
        'A zero-impact ablation, plus a two-sided audit metering input work '
        + 'against kinetic, potential, and dissipated energy.',
    },
    honestyBoundary:
      'The fixture claims no energy balance and no global conservation.',
  }),
]);

export function createRiverfallPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(
    RIVERFALL_PURPOSE_SYSTEM_ID_V1,
    [...NEEDS, ...LAWS, ...SOLIDS, ...PRESENTATION, ...BOUNDARIES],
    [
      {
        quantity: 'energy',
        closed: false,
        sourceIds: Object.freeze([
          id('riverfall:source:hidden-recirculation-pump'),
          id('riverfall:source:inlet-forcing'),
        ]),
        sinkIds: Object.freeze([
          id('riverfall:sink:xsph-dissipation'),
          id('riverfall:sink:impact-dissipation'),
        ]),
        statement:
          'Riverfall is open in energy. Work enters through the hidden '
          + 'recirculation pump and the inlet forcing, and leaves through XSPH '
          + 'smoothing and dissipative boundary impacts. Gravity is an internal '
          + 'conservative field, not a boundary, because the pump returns each '
          + 'particle to the height it fell from. The fixture therefore proves '
          + 'particle accounting and bounded residuals, never global energy '
          + 'conservation.',
      },
      {
        quantity: 'water-mass',
        closed: true,
        sourceIds: Object.freeze([]),
        sinkIds: Object.freeze([]),
        statement:
          `Riverfall is closed in water mass. All ${String(RIVERFALL_CLOSED_PARTICLE_COUNT_V1)} `
          + 'particles carry fixed mass and recirculate; none is created at the '
          + 'inlet or destroyed at the outflow. The pump is a transport inside '
          + 'the system, not a crossing of its boundary, which is why it '
          + 'appears as an energy source and not a material one.',
      },
    ],
  );
}
