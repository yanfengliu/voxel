import {
  OAK_LEAF_MATERIAL_KEY_V1,
  OAK_LEAF_VARIANT_DESCRIPTORS_V1,
  OAK_SOIL_MATERIAL_KEY_V1,
  OAK_TAPER_RATIOS_V1,
  OAK_WOOD_MATERIAL_KEY_V1,
} from './oak-render-geometry.js';

export interface OakPurposeCoverageV1 {
  readonly resourceKeys?: readonly string[];
  readonly batchKeys?: readonly string[];
  readonly browserCommands?: readonly string[];
  readonly cameraViews?: readonly string[];
}

export interface OakPurposeAccountabilityRecordV1 {
  readonly id: `oak-purpose:${string}`;
  readonly artifactAndExactAuthoredScope: string;
  readonly requiredBy: string;
  readonly jobPerformed: string;
  readonly locationOrRelationshipDatum: string;
  readonly failureWhenRemoved: string;
  readonly failureWhenRelocated: string;
  readonly smallestAdequateForm: string;
  readonly evidence: readonly string[];
  readonly honestyBoundary: string;
  readonly coverage: OakPurposeCoverageV1;
}

function record(
  id: string,
  artifactAndExactAuthoredScope: string,
  requiredBy: string,
  jobPerformed: string,
  locationOrRelationshipDatum: string,
  failureWhenRemoved: string,
  failureWhenRelocated: string,
  smallestAdequateForm: string,
  evidence: readonly string[],
  honestyBoundary: string,
  coverage: OakPurposeCoverageV1 = {},
): OakPurposeAccountabilityRecordV1 {
  return Object.freeze({
    id: `oak-purpose:${id}`,
    artifactAndExactAuthoredScope,
    requiredBy,
    jobPerformed,
    locationOrRelationshipDatum,
    failureWhenRemoved,
    failureWhenRelocated,
    smallestAdequateForm,
    evidence: Object.freeze([...evidence]),
    honestyBoundary,
    coverage: Object.freeze({ ...coverage }),
  });
}

const TAPER_GEOMETRIES = OAK_TAPER_RATIOS_V1.map((_, index) =>
  `geometry:oak:frustum:taper-${String(index)}`);
const NODE_FLARED_GEOMETRIES = OAK_TAPER_RATIOS_V1.map((_, index) =>
  `geometry:oak:frustum:node-flared:taper-${String(index)}`);
const WOOD_BATCHES = OAK_TAPER_RATIOS_V1.flatMap((_, index) => [
  `batch:oak:wood:taper-${String(index)}`,
  `batch:oak:wood:node-flared:taper-${String(index)}`,
]);
const ROOT_BATCHES = OAK_TAPER_RATIOS_V1.flatMap((_, index) => [
  `batch:oak:root:taper-${String(index)}`,
  `batch:oak:root:node-flared:taper-${String(index)}`,
]);
const LEAF_GEOMETRIES = OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(({ geometryKey }) => geometryKey);
const LEAF_BATCHES = OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(({ id }) => `batch:oak:leaf:${id}`);

/**
 * Creator-local audit ledger for visible case-study decisions.
 *
 * Evidence identifiers name executable gates or retained fixed views. They do
 * not turn a structural assertion into visual evidence, or a screenshot into
 * proof of hidden causality.
 */
export const OAK_PURPOSE_ACCOUNTABILITY_V1 = Object.freeze([
  record(
    'frustum-family',
    `The ${String(TAPER_GEOMETRIES.length)} reusable octagonal tapered-shaft resources: ${TAPER_GEOMETRIES.join(', ')}.`,
    'Living stem, branch, coarse-root and aggregate fine-root organ records.',
    'Expose radius, taper, length and exact rendered wood volume with one bounded voxel-real grammar.',
    'Local +Y spans the authoritative proximal-to-distal organ axis; unit radius is the solved proximal radius.',
    'Removing the family leaves every structural organ without geometry and makes height, support and root extent unreadable.',
    'Moving the pivot off the proximal port breaks parent attachment and makes the rendered volume disagree with mechanics.',
    'Eight sides are the lowest retained regular cross-section that reads round from hero, side and overhead views while keeping exact analytic area.',
    ['oak-allometry.test.ts/matches owned fresh mass to every actual projected day-100 shaft', 'oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent'],
    'These are material-consistent low-poly shafts, not scanned bark, vascular tissue or field-fitted allometry.',
    { resourceKeys: TAPER_GEOMETRIES },
  ),
  record(
    'aboveground-shaft-instances',
    `All stem and branch instances in ${WOOD_BATCHES.join(', ')}.`,
    'The active generational shoot graph and crown silhouette.',
    'Place every living aboveground structural axis at its authoritative pose with stable identity.',
    'Each proximal matrix translation is its declared parent port; +Y follows the normalized organ direction.',
    'Removing the instances erases extension units and the load-bearing path beneath leaves.',
    'Relocating any instance away from its parent port fails the connected-pose and geometry-conflict gates.',
    'One instanced shaft per non-consumed structural organ is the smallest form that preserves identity and taper.',
    ['oak-simulation.test.ts/keeps zero-wind poses held and produces connected breeze poses', 'oak-render-adapter.test.ts/preserves generation-bearing keys and sparsely patches one wind/stress pose'],
    'The fixture resolves three early flushes, not a mature crown or secondary-growth anatomy.',
    { batchKeys: WOOD_BATCHES },
  ),
  record(
    'root-shaft-instances',
    `All coarse-root and aggregate fine-root instances in ${ROOT_BATCHES.join(', ')}.`,
    'Spatial root uptake, mycorrhizal exchange and root-cutaway inspection.',
    'Show the belowground support that owns uptake weights and distinguishes absorptive from coarse tissue.',
    'The radicle begins at the acorn basal germination port; descendants meet their structural parent ports inside the soil field.',
    'Removing roots hides the spatial support for water and nutrient exchange.',
    'Relocating the fine-root axis outside its kernel changes local uptake and fails the remote-patch control.',
    'One dark coarse axis plus one pale aggregate fine-root cohort path is the declared minimum; individual tips and hyphae are intentionally unresolved.',
    ['oak-root-cutaway-presentation.test.ts/keeps one path per root organ and gives only the aggregate cohort a visibility floor', 'oak-three-flush-framed-root-cutaway-hero.png'],
    'The pale path has a presentation-only width floor; it is not a measured diameter, count or topology of real fine roots.',
    { batchKeys: ROOT_BATCHES },
  ),
  record(
    'seed-and-buds',
    'The shared batch:oak:buds-and-acorns instances, including the initial acorn and every active terminal or axillary bud.',
    'Germination ports, flush identity and visible dormant growth sites.',
    'Mark the bounded carbon reserve and the meristems that create the next declared extension unit.',
    'Shoot and radicle meet the acorn apical and basal ports; buds sit at authoritative organ tips or nodes.',
    'Removing them conceals the seed reserve and makes future extension sites indistinguishable from cut shafts.',
    'Relocating them away from their ports contradicts the organ graph and fails port continuity.',
    'One tapered low-poly body per active seed or bud is sufficient; cupules, scales and embryo anatomy are outside this slice.',
    ['oak-simulation.test.ts/germinates through ordered, stable generational organ identities', 'oak-axillary-shoot.test.ts/authors one paid, dimensioned young leaf and a terminal meristem'],
    'Bud and acorn forms communicate role and attachment, not diagnostic botanical surface detail.',
    { batchKeys: ['batch:oak:buds-and-acorns'] },
  ),
  record(
    'branch-junctions',
    `The ${String(NODE_FLARED_GEOMETRIES.length)} integrated occupied-parent shaft resources: ${NODE_FLARED_GEOMETRIES.join(', ')}.`,
    'Readable fork topology where a child branch separates from a parent axis.',
    'Replace the terminal 16% of an occupied shaft with one bounded flare whose full volume is owned wood.',
    'The continuous profile begins on the ordinary taper, peaks before the node and returns to the true distal radius.',
    'Removing the flare leaves the low-poly fork materially connected but makes its attachment node visually ambiguous.',
    'Relocating the flare away from the occupied parent tip would thicken an internode rather than its attachment.',
    'One four-ring shaft surface per occupied parent avoids both the former point apex and a concentric marker shell.',
    ['oak-wood-surface.test.ts/submits one continuous shaft per active organ and opens occupied-parent ports', 'oak-render-adapter.test.ts/replaces an occupied parent terminal surface with one finite node flare', 'oak-organ-conflicts.test.ts/retains an integrated node-flare peak in the public-geometry conflict oracle', 'oak-allometry.test.ts/matches owned fresh mass to every actual projected day-100 shaft', 'oak-organ-conflicts.test.ts/partitions each exact octagonal terminal section into finite load paths'],
    'The flare is bounded low-poly node thickening, not a scanned bark ridge or a claim of watertight vascular anatomy.',
    { resourceKeys: NODE_FLARED_GEOMETRIES },
  ),
  record(
    'leaf-lamina-variants',
    `The three bounded lamina resources and batches (${OAK_LEAF_VARIANT_DESCRIPTORS_V1.map(({ id, lobeCount }) => `${id}:${String(lobeCount)} lobes`).join(', ')}).`,
    'Pedunculate-oak leaf recognition, canopy area and multi-view silhouette contrast.',
    'Render each authoritative leaf area as a rounded lobed, cambered blade while distributing all three shapes across a flush.',
    'The petiole base meets its node; local +Y is the blade axis and roll follows the 2/5 phyllotactic sequence.',
    'Removing laminae erases measured leaf area and the primary visible water/nutrient stress surface.',
    'Relocating or rerolling them breaks node attachment, phyllotaxis and the authoritative mechanics pose.',
    'Three variants are the smallest set that demonstrates topology, aspect and camber contrast without per-leaf assets.',
    ['oak-render-adapter.test.ts/derives three contrasting lobed, cambered leaves with petiole and midrib relief', 'oak-three-flush-framed-overhead.png'],
    'These are low-poly species-shaped variants without individual venation, damage or scanned asymmetry.',
    { resourceKeys: LEAF_GEOMETRIES, batchKeys: LEAF_BATCHES },
  ),
  record(
    'leaf-petiole-and-midrib',
    'The finite tapered rectangular petiole and raised central midrib authored inside every leaf resource.',
    'Leaf attachment readability, a render-matched flexural section and blade-axis legibility.',
    'Separate the blade from its node, supply the weak-axis section consumed by quasi-static mechanics and retain a visible centreline cue.',
    'The petiole is tangent to the parent terminal face and spans to the blade base; the midrib follows the blade centreline toward the tip.',
    'Removing the petiole floats the blade and removes the mechanics section; removing the midrib only removes the close-view centreline cue.',
    'Relocating the petiole makes the visible and mechanical load paths disagree; relocating the midrib makes the blade relief false.',
    'One tapered rectangular petiole and one tapered ridge are sufficient; secondary veins are below intended scale.',
    ['oak-mechanics.test.ts/uses the dimensioned petiole, not the full blade, as leaf cantilever', 'oak-render-adapter.test.ts/derives three contrasting lobed, cambered leaves with petiole and midrib relief'],
    'Only the petiole basal weak-axis section is shared with mechanics; the midrib is not a hydraulic or structural network.',
  ),
  record(
    'soil-field',
    'geometry:oak:soil-cube and the visible cells in batch:oak:soil, with the root-cutaway inclusion rule.',
    'The bounded heterogeneous water, nitrogen and phosphorus environment.',
    'Make cell extent, surface boundary, moisture and nutrient heterogeneity inspectable around the root support.',
    'Cell centres and 0.2 m extents are authoritative soil-grid datums; the cut plane passes through that grid.',
    'Removing cells makes resource exchange appear to come from nowhere.',
    'Relocating them breaks the root-distance kernel and the visible surface/root relationship.',
    'Eight cells in two layers are the smallest retained field that supports local versus remote and surface versus depth controls.',
    ['oak-simulation.test.ts/keeps an outside wet and nutrient patch outside the uptake kernel', 'oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent'],
    'Cells visualize porous control volumes, not solid soil blocks or individual pores.',
    { resourceKeys: ['geometry:oak:soil-cube'], batchKeys: ['batch:oak:soil'] },
  ),
  record(
    'organ-material-state',
    'material:oak:wood plus per-instance bark, pale fine-root, bud and acorn tints and stress dulling.',
    'Material identity and root/soil separation at the intended camera scale.',
    'Keep structural tissue nonmetallic and rough while distinguishing absorptive roots and seed organs.',
    'Tint comes only from authoritative organ kind and stress; the reusable material stays neutral white.',
    'Removing the distinctions makes fine-root uptake support disappear into wet soil and seed organs merge with bark.',
    'Moving a tint to another organ kind communicates a false material identity.',
    'One shared rough standard material plus four bounded tint rules avoids duplicate GPU materials.',
    ['oak-root-cutaway-presentation.test.ts/keeps one path per root organ and gives only the aggregate cohort a visibility floor', 'oak-three-flush-framed-root-cutaway-hero.png'],
    'Colours communicate category and stress; they are not spectrophotometric bark or root measurements.',
    { resourceKeys: [OAK_WOOD_MATERIAL_KEY_V1] },
  ),
  record(
    'leaf-material-state',
    'material:oak:leaf plus expanding, mature, chlorotic, drought-dulled, senescing and abscised tint rules.',
    'Two-sided lamina visibility and visible phenology/resource stress.',
    'Keep thin leaves readable from all three views while mapping authoritative chlorophyll and water state.',
    'Tint is bound to each leaf instance; DoubleSide is bound only to the lamina material.',
    'Removing DoubleSide loses reversed leaves; removing state tint hides declared stress and phenology.',
    'Relocating a state tint to a different leaf contradicts its physiological record.',
    'One rough nonmetallic two-sided material with per-instance colour is the minimum bounded state lane.',
    ['oak-render-adapter.test.ts/lets chlorophyll loss overtake green without faking senescence', 'oak-ecosystem.spec.ts/living-leaf pixel classifier accepts olive leaf shadow and rejects scene materials'],
    'Tint is a qualitative state display, not calibrated chlorophyll fluorescence or leaf temperature.',
    { resourceKeys: [OAK_LEAF_MATERIAL_KEY_V1] },
  ),
  record(
    'soil-material-state',
    'material:oak:soil plus the per-cell water-darkening and available-nutrient colour response.',
    'Readable environmental heterogeneity and root-cutaway contrast.',
    'Communicate that cells differ in state without adding render-owned soil data.',
    'Each tint is derived from that cell water, porosity and available N/P pools.',
    'Removing the response makes rain and heterogeneous resource cells visually indistinguishable.',
    'Relocating a tint to another cell misreports the uptake environment.',
    'One shared rough material and a bounded two-signal tint are sufficient at the eight-cell resolution.',
    ['oak-render-adapter.test.ts/produces a valid bounded public-contract snapshot with finite geometry', 'oak-ecosystem.spec.ts/drought lowers oak water status and paired rain causes a measured low-water response'],
    'Colour is a state cue, not a soil taxonomy, texture or laboratory colour calibration.',
    { resourceKeys: [OAK_SOIL_MATERIAL_KEY_V1] },
  ),
  record(
    'lighting-and-background',
    'The blue-grey scene background, hemisphere sky/ground fill, low ambient bounce, and one warm shadow-casting sun.',
    'Legible rough materials, lobe relief, contact depth and stable screenshot inspection.',
    'Separate albedo from form with bounded fill while one directional shadow exposes contact and relief.',
    'Fill surrounds the plot; the sun stays at the declared fixture-private world direction and targets the root collar.',
    'Removing fill blackens reversed normals; removing the sun erases contact depth and midrib/camber relief.',
    'Moving the sun behind the intended cameras hides relief and changes the fixed-view evidence target.',
    'One fill pair and one bounded shadow light are the minimum that preserve both material colour and form relief.',
    ['oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent'],
    'Fixture-private daylight is an inspection rig, not a solar-position, canopy-radiation or energy-balance model.',
  ),
  record(
    'inspection-views',
    'Hero, side and overhead camera presets, the root-cutaway presentation mode, and Studio-parity free navigation.',
    'Whole-organism framing, adversarial silhouette inspection and belowground support inspection.',
    'Expose the organism from complementary fitted elevations, reveal hidden root support on command and let the owner inspect between presets.',
    'All presets fit accepted public-geometry vertices; cutaway keeps the declared side of its soil plane; free navigation changes presentation only.',
    'Removing side/overhead hides edge-on leaves and crown overlap; removing cutaway hides fine roots; removing navigation prevents inspection between chosen frames.',
    'Moving preset focus away from the fitted envelope clips the subject or lets the HUD obscure it; routing navigation into biology breaks authority.',
    'Three orthogonal-biased presets, one cutaway and Studio’s shared one-pointer/held-key laws are the smallest retained inspection surface.',
    ['oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent', 'oak-ecosystem.spec.ts/oak inspection uses the Studio pointer, wheel, and held-WASD camera contract'],
    'The presets and free camera support inspection; they do not prove every possible camera or mature-tree envelope.',
    { cameraViews: ['hero', 'side', 'overhead'] },
  ),
  record(
    'live-growth-and-wind',
    'The real-time growth presentation and the still/breeze wind inspection trajectory.',
    'Visible authoritative topology change and dimensioned quasi-static organ response.',
    'Communicate causal change through live authoritative state rather than replayed render poses.',
    'Both modes advance from the shared 60 Hz host tick; wind pose stays attached to the same organ graph.',
    'Removing growth freezes the case study before its flushes; removing wind hides material response.',
    'Applying wind motion to soil or moving it off organ directions breaks the authoritative pose relation.',
    'One still control and one bounded breeze state are enough to expose the response without claiming dynamics.',
    ['oak-browser-frame-clock.test.ts/advances the same 60 host ticks across 60, 120, and 240 Hz display cadences', 'oak-three-flush-drought-peak-wind-overhead.png', 'oak-mechanics.test.ts/increases deflection with wind and decreases it with E and radius'],
    'Wind is a quasi-static inspection state without damping, gust statistics, fracture or thigmomorphogenesis.',
  ),
  record(
    'experiment-controls',
    'The nine visible commands: pause, growth, wind, root cutaway, rain, low water, low N, low P and reset.',
    'Direct intervention and controlled comparison of the bounded ecosystem pathways.',
    'Expose each independent case-study intervention through one typed visible action.',
    'Each button dispatches the same typed command as the test harness and reports pressed state when persistent.',
    'Removing a command prevents its named counterfactual from being performed in the visible case study.',
    'Relocating a command into renderer state would violate simulation authority and make reset incomplete.',
    'One control per independent intervention is the minimum; there are no decorative or duplicate buttons.',
    ['oak-ecosystem.spec.ts/time, stress, and inspection controls command their owning domains'],
    'Controls expose bounded experiments, not a general ecosystem editor or calibrated scenario builder.',
    { browserCommands: ['toggle-pause', 'growth-mode', 'wind-mode', 'root-cutaway', 'rain', 'low-water', 'low-n', 'low-p', 'reset'] },
  ),
  record(
    'hud-and-diagnostics',
    'The single HUD panel, three view selectors, status line and 13 live diagnostic rows.',
    'Readable experimental state, resource residuals, presentation revision and GPU ownership evidence.',
    'Name the active experiment and keep biological, conservation and renderer evidence visible together.',
    'The panel reserves the left screen region; fitted cameras keep the tree clear and values come from published evidence.',
    'Removing it hides which intervention/state a frame represents and removes conservation/runtime observability.',
    'Moving it over the fitted subject obscures the very organs and relationships under inspection.',
    'One compact panel and 13 non-duplicated values are the minimum retained interface for this case-study evidence.',
    ['oak-ecosystem.spec.ts/mounts one live oak through the real Three runtime with domain controls', 'oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent'],
    'Diagnostics report this deterministic fixture; they are not scientific uncertainty bounds or profiling telemetry for all consumers.',
  ),
] as const satisfies readonly OakPurposeAccountabilityRecordV1[]);
