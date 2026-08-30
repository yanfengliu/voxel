import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeEvidenceV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
} from '../../tools/studio/purpose-graph.js';

const SYSTEM = 'fixture:oak-ecosystem';

function nodeId(kind: string, name: string): PurposeNodeIdV1 {
  return `${SYSTEM}:${kind}:${name}`;
}

function bound(proofId: string, ...establishes: string[]): PurposeEvidenceV1 {
  return { kind: 'bound', proofId, establishes: Object.freeze(establishes) };
}

const NEED = Object.freeze({
  causality: nodeId('need', 'environmental-causality'),
  legibility: nodeId('need', 'biological-material-legibility'),
  boundary: nodeId('need', 'renderer-remains-derived'),
});

const BOUNDARY = Object.freeze({
  carbonSource: nodeId('source', 'photosynthetic-carbon'),
  carbonSink: nodeId('sink', 'respiration'),
  waterSource: nodeId('source', 'rainfall'),
  waterSink: nodeId('sink', 'water-loss'),
  nitrogenSource: nodeId('source', 'nitrogen-deposition'),
  phosphorusSource: nodeId('source', 'phosphorus-weathering'),
});

/** Typed reasons for the fixture's authored reductions and visible parts. */
export function createOakEcosystemPurposeGraphV1(): PurposeGraphV1 {
  return purposeGraphV1(SYSTEM, [
    purposeNeedV1({
      id: NEED.causality,
      label: 'Environmental changes cause accountable biological changes',
      job: 'Let a reader intervene in water, nitrogen and phosphorus and inspect the response.',
      rootRationale: 'A growing tree that only changes by elapsed time is not an ecosystem case study.',
      evidence: bound(
        'oak-simulation.test.ts/resource-counter-runs',
        'Water, nitrogen and phosphorus counter-runs change their matching uptake or stress signal.',
      ),
      honestyBoundary: 'A bounded early-seedling hypothesis, not a calibrated field predictor.',
    }),
    purposeNeedV1({
      id: NEED.legibility,
      label: 'The rendered organism reads as a young pedunculate oak',
      job: 'Expose its extension units, spiral leaves, branch junctions, roots and material response.',
      rootRationale: 'The case study is useful only if biology remains legible in the rendered result.',
      evidence: bound(
        'oak-ecosystem.spec.ts/fixed-multi-view-captures',
        'First- and third-flush hero, side and overhead views plus root-cutaway and peak-breeze evidence are captured.',
      ),
      honestyBoundary: 'Voxel realism and three flushes, not a mature photoreal tree.',
    }),
    purposeNeedV1({
      id: NEED.boundary,
      label: 'The renderer observes rather than owns the simulation',
      job: 'Exercise Voxel through bounded versioned plain data and disposable derived resources.',
      rootRationale: 'The repository renderer boundary excludes authoritative game or ecosystem rules.',
      evidence: bound(
        'oak-render-adapter.test.ts/public-contract-snapshot',
        'The consumer projection validates through the public RenderSnapshot and RenderDelta contracts.',
      ),
      honestyBoundary: 'Fixture-private simulation and host code are not promoted renderer APIs.',
    }),
    purposeNodeV1({
      id: nodeId('rule', 'multirate-resource-loop'),
      kind: 'motion-rule',
      label: 'Multirate resource loop',
      job: 'Advance physiology, soil, allocation and phenology from the shared 60 Hz host step.',
      requiredBy: [NEED.causality],
      evidence: bound(
        'oak-simulation.test.ts/shared-host-tick',
        'One biological day produces the declared process-step counts from the shared host tick.',
      ),
      honestyBoundary: 'Reduced deterministic process clocks, not continuous plant physiology.',
    }),
    purposeNodeV1({
      id: nodeId('interface', 'root-soil-support'),
      kind: 'interface',
      label: 'Bounded root-soil support',
      job: 'Restrict root and fungal exchange to cells reached by the declared fine-root kernel.',
      requiredBy: [NEED.causality, NEED.legibility],
      evidence: bound(
        'oak-simulation.test.ts/remote-patch',
        'A wet nutrient patch outside the kernel contributes no uptake or fungal carbon.',
      ),
      honestyBoundary: 'One aggregate fine-root cohort, not resolved root or hyphal topology.',
    }),
    purposeNodeV1({
      id: nodeId('rule', 'quasi-static-wind'),
      kind: 'motion-rule',
      label: 'Quasi-static organ response',
      job: 'Make wind, tissue dimensions and owned fresh mass affect authoritative organ pose.',
      requiredBy: [NEED.legibility],
      evidence: bound(
        'oak-mechanics.test.ts/dimensioned-controls',
        'Wind, radius, modulus, mass and leaf reconfiguration counter-runs change the response.',
      ),
      honestyBoundary: 'No dynamic damping, fracture, distal crown load or thigmomorphogenesis.',
    }),
    purposeNodeV1({
      id: nodeId('solid', 'organ-graph'),
      kind: 'solid',
      label: 'Connected generational organ graph',
      job: 'Keep shoot, bud, leaf, branch and root identity and attachment explicit through growth.',
      requiredBy: [NEED.causality, NEED.legibility],
      evidence: bound(
        'oak-simulation.test.ts/organ-identities-and-connected-poses',
        'Organ generations remain stable and every child pose meets its authoritative parent port.',
      ),
      honestyBoundary: 'A deliberately bounded topology through three flushes.',
    }),
    purposeNodeV1({
      id: nodeId('solid', 'tapered-wood-and-root'),
      kind: 'solid',
      label: 'Tapered woody axes',
      job: 'Render stem, branch and root axes with bounded frusta and integrated fork flares.',
      requiredBy: [NEED.legibility],
      evidence: bound(
        'oak-wood-surface.test.ts/submits one continuous shaft per active organ and opens occupied-parent ports',
        'Each occupied parent has one continuous positive-area shaft surface with no overlaid collar instance.',
      ),
      honestyBoundary: 'Eight-sided voxel-real frusta, not scanned bark or vascular anatomy.',
    }),
    purposeNodeV1({
      id: nodeId('solid', 'lobed-leaves'),
      kind: 'solid',
      label: 'Lobed leaves with petiole and midrib',
      job: 'Carry oak-specific silhouette, camber and material state in three instanced meshes.',
      requiredBy: [NEED.legibility],
      evidence: bound(
        'oak-render-adapter.test.ts/leaf-contrast-signatures',
        'The three leaves differ in lobe count, aspect and camber and retain petiole and midrib relief.',
      ),
      honestyBoundary: 'Deterministic low-poly variants, not individual venation or scanned leaves.',
    }),
    purposeNodeV1({
      id: nodeId('solid', 'soil-cells'),
      kind: 'solid',
      label: 'Heterogeneous soil field',
      job: 'Make the bounded water and nutrient environment spatially inspectable.',
      requiredBy: [NEED.causality, NEED.legibility],
      evidence: bound(
        'oak-simulation.test.ts/soil-ledger-and-local-uptake',
        'Eight cells retain independent water and nutrient pools and local uptake weights.',
      ),
      honestyBoundary: 'Porous substrate cells are fields; they do not claim resolved solid grains.',
    }),
    purposeNodeV1({
      id: nodeId('interface', 'plain-data-projection'),
      kind: 'interface',
      label: 'Plain-data render projection',
      job: 'Translate consumer state into stable instanced batches and sparse deltas.',
      requiredBy: [NEED.boundary, NEED.legibility],
      evidence: bound(
        'oak-render-adapter.test.ts/stable-keys-and-sparse-delta',
        'Generation-bearing instance keys survive and changed poses patch only changed instances.',
      ),
      honestyBoundary: 'Rendering is derived; no renderer object enters authoritative state.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.carbonSource,
      kind: 'material-source',
      label: 'Photosynthetic carbon',
      job: 'Add assimilated carbon under bounded light and stress response.',
      quantity: 'carbon',
      visibility: 'invisible',
      truncates: 'Atmospheric CO2, radiation transfer and biochemical intermediates.',
      requiredBy: [NEED.causality],
      evidence: bound('oak-simulation.test.ts/carbon-ledger', 'Assimilation enters the carbon source ledger.'),
      honestyBoundary: 'A reduced C3-shaped response, not an FvCB solver.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.carbonSink,
      kind: 'material-sink',
      label: 'Respired carbon',
      job: 'Remove maintenance and litter respiration from the bounded system.',
      quantity: 'carbon',
      visibility: 'invisible',
      truncates: 'Atmospheric transport beyond the plot.',
      requiredBy: [NEED.causality],
      evidence: bound('oak-simulation.test.ts/carbon-ledger', 'Respiration enters the carbon sink ledger.'),
      honestyBoundary: 'Carbon amount only; no gas concentration or heat model.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.waterSource,
      kind: 'material-source',
      label: 'Rainfall',
      job: 'Add ambient or commanded water to topsoil.',
      quantity: 'water',
      visibility: 'visible',
      truncates: 'Weather generation outside the microcosm.',
      requiredBy: [NEED.causality],
      evidence: bound(
        'oak-water-pathway.test.ts/paired-rain-to-leaf-response',
        'A paired 0.4 L pulse raises soil water, root uptake, plant water, leaf potential and assimilation by material thresholds.',
      ),
      honestyBoundary: 'A spatially even top-cell pulse, not resolved drops or canopy interception.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.waterSink,
      kind: 'material-sink',
      label: 'Water loss',
      job: 'Account runoff, deep drainage, soil evaporation and transpiration leaving the plot.',
      quantity: 'water',
      visibility: 'invisible',
      truncates: 'Downstream water transport and atmospheric humidity.',
      requiredBy: [NEED.causality],
      evidence: bound('oak-simulation.test.ts/water-ledger', 'All water-loss paths enter the water sink ledger.'),
      honestyBoundary: 'Accounted lumped sinks, not a Richards-equation or energy-balance solver.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.nitrogenSource,
      kind: 'material-source',
      label: 'Nitrogen deposition',
      job: 'Add bounded atmospheric nitrogen deposition to topsoil.',
      quantity: 'nitrogen',
      visibility: 'invisible',
      truncates: 'Atmospheric chemistry and deposition transport.',
      requiredBy: [NEED.causality],
      evidence: bound('oak-simulation.test.ts/nutrient-pulse', 'Nitrogen input enters only the nitrogen source ledger.'),
      honestyBoundary: 'One fixture-assumed input rate; no denitrification or gaseous-loss claim.',
    }),
    purposeBoundaryV1({
      id: BOUNDARY.phosphorusSource,
      kind: 'material-source',
      label: 'Phosphorus weathering',
      job: 'Add bounded mineral weathering phosphorus to topsoil.',
      quantity: 'phosphorus',
      visibility: 'invisible',
      truncates: 'Parent material and mineral-surface kinetics outside the cells.',
      requiredBy: [NEED.causality],
      evidence: bound('oak-simulation.test.ts/nutrient-pulse', 'Phosphorus input enters only the phosphorus source ledger.'),
      honestyBoundary: 'One source plus labile/sorbed exchange, not a full soil mineral model.',
    }),
  ], [
    {
      quantity: 'carbon',
      closed: false,
      sourceIds: [BOUNDARY.carbonSource],
      sinkIds: [BOUNDARY.carbonSink],
      statement: 'Initial carbon plus photosynthesis minus respiration equals current storage.',
    },
    {
      quantity: 'water',
      closed: false,
      sourceIds: [BOUNDARY.waterSource],
      sinkIds: [BOUNDARY.waterSink],
      statement: 'Initial water plus rainfall minus all declared loss paths equals current storage.',
    },
    {
      quantity: 'nitrogen',
      closed: false,
      sourceIds: [BOUNDARY.nitrogenSource],
      sinkIds: [],
      statement: 'Initial nitrogen plus deposition equals current storage in this no-loss slice.',
    },
    {
      quantity: 'phosphorus',
      closed: false,
      sourceIds: [BOUNDARY.phosphorusSource],
      sinkIds: [],
      statement: 'Initial phosphorus plus weathering equals current storage in this no-loss slice.',
    },
  ]);
}
