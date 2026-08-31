export interface OakPurposeCoverageV1 {
  readonly resourceKeys?: readonly string[];
  readonly batchKeys?: readonly string[];
  readonly chunkKeys?: readonly string[];
  readonly voxelRuleIds?: readonly string[];
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

function frozenCoverage(coverage: OakPurposeCoverageV1): OakPurposeCoverageV1 {
  return Object.freeze(Object.fromEntries(
    Object.entries(coverage).map(([field, values]) => [field, Object.freeze([...values])]),
  ));
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
    coverage: frozenCoverage(coverage),
  });
}

/** Creator-local pre-geometry ledger for the oak's visible hybrid voxel design. */
export const OAK_PURPOSE_ACCOUNTABILITY_V1 = Object.freeze([
  record(
    'uniform-tissue-voxel',
    'geometry:oak:tissue-voxel and the uniform-tissue-cubes rule used by every visible fine voxel.',
    'The owner-requested visibly voxel-built organism and bounded repeated-geometry runtime lane.',
    'Provide one equal-edged cube grammar that wood, roots, living leaves, fallen litter, seed, buds and conforming soil contact can instance without smooth substitute meshes.',
    'The unit cube is centred on its local origin; final material cells use one exact axis-aligned world lattice at 131 / 65,536 m after organ masks sample their authoritative poses.',
    'Removing the cube resource erases the organism; removing uniform scale lets stretched boxes counterfeit voxel construction.',
    'Relocating the cube pivot off its centre shifts every mask away from its biological port and breaks mask-to-pose parity.',
    'One shared cube resource and the exact bounded dyadic scale are sufficient for every fine scene role; canonical Float32 matrices make face adjacency exact without an epsilon.',
    ['oak-purpose-accountability.test.ts/pins the agreed hybrid voxel lattice and forbids stale smooth oak resources', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'Tissue voxels are presentation cells, not biological cells, biomass units, anatomy or a mechanics discretization.',
    { resourceKeys: ['geometry:oak:tissue-voxel'], voxelRuleIds: ['uniform-tissue-cubes'] },
  ),
  record(
    'soil-voxel-field',
    'material:oak:soil-voxel, chunk:oak:soil-field, batch:oak:soil-contact-voxels, and the soil-top-boundary, soil-cutaway-cross-section and soil-tissue-clearance rules.',
    'The bounded heterogeneous soil environment, its exposed boundary and belowground relationship to the root system.',
    'Render the normal-view top boundary and the cutaway kept-half top plus vertical state cross-section through Voxel chunk meshing, replacing every intersected macrocell with fine soil cubes around final tissue.',
    'Each coarse cell is exactly five 131 / 65,536 m fine cells per axis, the 40-cell field approximates the authoritative 0.4 m domain, the cut surface stays on its declared plane, and legal tissue contact is face-only.',
    'Removing the chunk makes water and nutrient exchange appear ungrounded and leaves the tree without an environmental datum.',
    'Relocating the lattice or cut face misregisters cell values, root support distances and the visible root-soil relationship.',
    'One bounded chunk, one shared rough material, one fine contact batch, one top boundary and one cut surface are sufficient without an empty trench or giant solid block.',
    ['oak-soil-contact-voxels.test.ts/tiles one exact macrovoxel around tissue with face contact and no overlap', 'oak-root-cutaway-presentation.test.ts/carves every positive-volume tissue intersection out of presented soil', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'The displayed surfaces and contact cells represent soil control volumes; they do not resolve pores, particles, adhesion or individual root hairs.',
    { resourceKeys: ['material:oak:soil-voxel'], batchKeys: ['batch:oak:soil-contact-voxels'], chunkKeys: ['chunk:oak:soil-field'], voxelRuleIds: ['soil-top-boundary', 'soil-cutaway-cross-section', 'soil-tissue-clearance'] },
  ),
  record(
    'soil-state-palette',
    'palette:oak:soil-voxel and the soil-state-ordered-dither and soil-litter-transfer rules over the visible soil surfaces.',
    'Water, nitrogen, phosphorus and seasonal litter states that must remain inspectable without render-owned ecosystem data.',
    'Quantize authoritative cell pools through a fixed ordered pattern so each visible soil role communicates a named state channel.',
    'Every palette index is chosen from its owning cell values; litter coverage remains on the top boundary of the cell that receives transfer.',
    'Removing state coding makes rain and mineral counter-runs visually identical and hides the aggregate soil pool beneath the day-240 fallen-leaf glyphs.',
    'Relocating a thresholded role to another cell misreports the environmental pool and its root-support context.',
    'One fixed palette and two deterministic bounded rules communicate the aggregate fields without decorative random texture.',
    ['oak-simulation.test.ts/distinguishes water, nitrogen and phosphorus limitation counter-runs', 'oak-simulation.test.ts/keeps the seasonal litter transfer inside every resource ledger', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'Dither cells encode aggregate values; their positions are not pores, mineral grains, molecules or individual fallen leaves.',
    { resourceKeys: ['palette:oak:soil-voxel'], voxelRuleIds: ['soil-state-ordered-dither', 'soil-litter-transfer'] },
  ),
  record(
    'connected-wood-voxels',
    'material:oak:wood-voxel, batch:oak:wood-voxels, and the wood-tapered-connected-mask rule for every active stem and branch.',
    'The active shoot graph, crown support path and readable recurrent extension units.',
    'Rasterize each authoritative tapered axis into a connected biological source mask before the shared material union assigns visible ownership.',
    'Each source mask begins at its declared proximal port, follows the organ pose frame and evaluates the existing taper along local +Y.',
    'Removing wood voxels erases the load-bearing path beneath leaves and makes successive flushes structurally unreadable.',
    'Relocating a mask away from its port disconnects the generational graph and contradicts the authoritative pose.',
    'One bounded source mask per active structural organ preserves its contribution and taper without smooth frusta; the fused lattice owns public connectivity and material ownership.',
    ['oak-simulation.test.ts/germinates through ordered, stable generational organ identities', 'oak-simulation.test.ts/keeps zero-wind poses held and produces connected breeze poses', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'The cube envelope is a quantized presentation of biology-owned dimensions, not bark anatomy, xylem or field-calibrated allometry.',
    { resourceKeys: ['material:oak:wood-voxel'], batchKeys: ['batch:oak:wood-voxels'], voxelRuleIds: ['wood-tapered-connected-mask'] },
  ),
  record(
    'fused-material-lattice',
    'The shared-dyadic-tissue-lattice, source-claim-preservation and declared-port-fused-paths rules applied to every final plant cell.',
    'One beautiful material union with exact cube faces, retained biological evidence and readable load paths through every attachment.',
    'Assign every source contribution once, reserve each parent port and child connector, and route deterministic bounded repair cells on one world lattice.',
    'The scope is the complete presented plant union and every active parent-child edge; a parent path may fuse only a direct child source from local axial layer 0 or 1 and must retain that child source key and claim.',
    'Removing it restores positive-volume intersections, floating tissue islands and sub-ULP cracks after Float32 serialization.',
    'Relocating it into renderer/core would make disposable presentation state authoritative instead of keeping the consumer biology in charge.',
    'One exact dyadic lattice and source-accounted bounded port routing are the retained mechanisms for material continuity and sparse live updates.',
    ['oak-tissue-material-law.test.ts/proves exact public cubes, one material union, retained sources and declared fused ports', 'oak-purpose-accountability.test.ts/pins the agreed hybrid voxel lattice and forbids stale smooth oak resources'],
    'The cells are a bounded presentation union, not xylem topology, finite elements, measured tissue anatomy or a general renderer-owned plant model.',
    { voxelRuleIds: ['shared-dyadic-tissue-lattice', 'source-claim-preservation', 'declared-port-fused-paths'] },
  ),
  record(
    'root-voxel-paths',
    'material:oak:root-voxel, batch:oak:root-voxels, and the root-aggregate-legibility-mask rule for coarse and aggregate fine roots.',
    'Spatial root uptake, mycorrhizal exchange and root-cutaway inspection.',
    'Show one dark structural path and one pale absorptive-cohort path while preserving their authoritative ports and directions.',
    'The radicle begins at the acorn basal port; the fine-root cohort begins at its coarse-root parent and remains visible against the cut face.',
    'Removing root voxels hides the only visible support for local water and nutrient exchange.',
    'Relocating either path breaks germination continuity and misstates which soil cells can contribute to uptake.',
    'Two connected biological paths and one bounded fine-root visibility floor are sufficient without inventing roots or hyphae.',
    ['oak-root-cutaway-presentation.test.ts/keeps roots inspection-only and retains every root source in the fused equal-cube lattice', 'oak-simulation.test.ts/keeps an outside wet and nutrient patch outside the uptake kernel', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'The pale path remains one cohort glyph, not a measured diameter, root count, branching topology, root hairs or fungal network.',
    { resourceKeys: ['material:oak:root-voxel'], batchKeys: ['batch:oak:root-voxels'], voxelRuleIds: ['root-aggregate-legibility-mask'] },
  ),
  record(
    'seed-and-bud-voxels',
    'material:oak:seed-bud-voxel, batch:oak:seed-bud-voxels, and the seed-bud-port-masks rule.',
    'The finite seed reserve, its germination ports and the dormant sites that own future extension units.',
    'Render one bounded acorn ellipsoid and compact tapered bud masks attached to their authoritative organ ports.',
    'The acorn straddles the soil boundary at its declared pose; each bud remains on its terminal or axillary growth site.',
    'Removing these masks hides the reserve and makes living meristems indistinguishable from severed shoot ends.',
    'Relocating a seed or bud disconnects root, shoot or future flush identity from the organ graph.',
    'One ellipsoid seed mask and one tapered bud grammar are sufficient without ornamental anatomical layers.',
    ['oak-simulation.test.ts/germinates through ordered, stable generational organ identities', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'The masks communicate reserve and growth-site roles, not cupule, embryo, cotyledon, bud-scale or diagnostic botanical anatomy.',
    { resourceKeys: ['material:oak:seed-bud-voxel'], batchKeys: ['batch:oak:seed-bud-voxels'], voxelRuleIds: ['seed-bud-port-masks'] },
  ),
  record(
    'lobed-leaf-voxels',
    'material:oak:leaf-voxel, batch:oak:leaf-voxels, and the leaf-lobed-area-mask rule for the three declared leaf variants.',
    'Pedunculate-oak recognition, authoritative leaf area and crown negative-space readability.',
    'Rasterize each declared station-width silhouette into a connected equal-cube mask while retaining its 7, 9 or 11 derived lobes.',
    'The mask begins after its petiole, follows local +Y along the blade axis and moves with authoritative direction, roll and wind pose.',
    'Removing lamina voxels erases measured leaf area and the primary visible water and nutrient response surface.',
    'Relocating or rerolling a mask breaks its node attachment, 2/5 phyllotaxis and mechanics pose relationship.',
    'Three area-tracking masks are the minimum retained species-shaped set; palette variation does not count as a fourth form.',
    ['oak-simulation.test.ts/advances a continuous precomputed 2/5 phyllotactic sequence', 'oak-mechanics.test.ts/keeps a similarity-scaled leaf inside the same geometry and mechanics law', 'oak-purpose-accountability.test.ts/owns every live hybrid render resource batch chunk and voxel rule exactly once'],
    'The discrete masks are bounded species cues, not scanned leaves, measured thickness, damage, individual asymmetry or venation.',
    { resourceKeys: ['material:oak:leaf-voxel'], batchKeys: ['batch:oak:leaf-voxels'], voxelRuleIds: ['leaf-lobed-area-mask'] },
  ),
  record(
    'leaf-port-and-axis',
    'The leaf-petiole-midrib-mask rule joining every lamina mask to its node and marking its local blade axis.',
    'Visible leaf attachment, render-to-mechanics port parity and close-view blade-axis readability.',
    'Provide one six-connected petiole path and one bounded centreline value role without inventing secondary venation.',
    'The petiole starts at the tangential parent port and reaches the blade base; the midrib remains on the blade centreline.',
    'Removing the petiole floats the lamina; removing the midrib loses the only close-view axis cue.',
    'Relocating either path breaks the visible load route or communicates a false blade axis.',
    'One cell-wide petiole and one cell-wide centreline are the smallest adequate voxel cues at the intended camera scale.',
    ['oak-mechanics.test.ts/uses the dimensioned petiole, not the full blade, as leaf cantilever', 'oak-purpose-accountability.test.ts/pins the agreed hybrid voxel lattice and forbids stale smooth oak resources'],
    'Voxel width is a visibility floor; mechanics continues to consume biology-owned petiole dimensions, and the midrib is not a vascular network.',
    { voxelRuleIds: ['leaf-petiole-midrib-mask'] },
  ),
  record(
    'fallen-leaf-litter-voxels',
    'material:oak:fallen-litter-voxel, batch:oak:fallen-litter-voxels, and the fallen-leaf-lobed-litter-mask and litter-soil-face-contact rules.',
    'A visibly conserved day-240 transfer from abscised crown organs into the soil-litter environment.',
    'Lay one flattened russet lobed equal-cube silhouette per abscised leaf on the bounded soil top without intersecting living tissue, soil or another litter cell.',
    'The masks occupy deterministic soil-top cells around the root collar; their bottom cube faces meet y=0 and the aggregate biological pools remain in the declared recipient soil cell.',
    'Removing the batch turns litter transfer into invisible bookkeeping and makes the retained day-240 frame read only as leaf disappearance.',
    'Relocating glyphs below the top face intersects soil; moving them into the living union reconnects dead leaves to the plant and corrupts material accountability.',
    'One flattened source-shaped mask per transferred leaf, one shared cube geometry and one rough russet material are the smallest visible conserved-litter cue.',
    ['oak-fallen-litter-voxel.test.ts/lays every abscised leaf as one exact, lobed, non-overlapping soil-contact silhouette', 'oak-ecosystem-stages.spec.ts/every biological milestone retains a deliberate voxel composition'],
    'The deterministic laydown preserves leaf identity and silhouette but is not a simulated fall trajectory, measured final orientation, decomposition geometry or second soil-pool location.',
    { resourceKeys: ['material:oak:fallen-litter-voxel'], batchKeys: ['batch:oak:fallen-litter-voxels'], voxelRuleIds: ['fallen-leaf-lobed-litter-mask', 'litter-soil-face-contact'] },
  ),
  record(
    'organ-state-quantization',
    'The organ-state-palette-quantization rule assigning bounded wood, root, seed, bud, chlorophyll, water-status and senescence colours.',
    'Material identity plus readable authoritative resource stress and phenology on equal-cube tissue masks.',
    'Map only organ kind, stage, chlorophyll, relative water content, stress and health into fixed qualitative colour roles.',
    'Each colour remains on the voxel instances belonging to the organ whose published state selected it.',
    'Removing the quantizer merges fine roots with bark and makes chlorophyll loss, drought dulling and senescence invisible.',
    'Relocating a state colour to another organ misreports its physiology and material identity.',
    'One bounded state quantizer over four tissue batches is sufficient without textures, random bark noise or duplicate materials.',
    ['oak-simulation.test.ts/distinguishes water, nitrogen and phosphorus limitation counter-runs', 'oak-purpose-accountability.test.ts/pins the agreed hybrid voxel lattice and forbids stale smooth oak resources'],
    'Colours are qualitative state cues, not spectral measurements, fluorescence, leaf temperature or soil laboratory calibration.',
    { voxelRuleIds: ['organ-state-palette-quantization'] },
  ),
  record(
    'lighting-and-background',
    'The blue-grey background, cool sky/ground fill, bounded ambient bounce and one softened warm directional key.',
    'Readable cube planes, tissue roles, cut-face depth and stable cross-stage screenshot inspection.',
    'Separate palette colour from equal-cube form without letting the former near-black ground shadow dominate the organism.',
    'Fill surrounds the plot; the key remains at the fixture-private direction and targets the root collar.',
    'Removing fill blackens reversed planes; removing the key loses cube-face separation and belowground depth.',
    'Moving the key behind the intended cameras flattens masks and changes the fixed-view comparison target.',
    'One fill pair and one softened key are the minimum stable rig for material and voxel-plane legibility.',
    ['oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent', 'oak-ecosystem-stages.spec.ts/every biological milestone retains a deliberate voxel composition'],
    'Fixture-private lighting is an inspection rig, not solar position, canopy radiation, photosynthetic forcing or energy balance.',
  ),
  record(
    'inspection-views',
    'Hero, side and overhead camera presets, the root-cutaway presentation mode, and Studio-parity free navigation.',
    'Whole-organism framing, adversarial silhouette inspection and belowground support inspection.',
    'Expose complementary fitted elevations, reveal root support on command and let the owner inspect between presets.',
    'Presets fit accepted public geometry; cutaway stays on its declared plane; free navigation changes presentation only.',
    'Removing side or overhead hides edge-on masks and crown overlap; removing cutaway hides roots; removing navigation blocks intermediate inspection.',
    'Moving focus away from the fitted envelope clips the subject; routing navigation into biology breaks simulation authority.',
    'Three complementary presets, one cutaway and shared pointer/key laws are the smallest retained inspection surface.',
    ['oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent', 'oak-ecosystem.spec.ts/oak inspection uses the Studio pointer, wheel, and held-WASD camera contract'],
    'The presets and free camera support inspection; they do not prove every camera, viewport or mature-tree envelope.',
    { cameraViews: ['hero', 'side', 'overhead'] },
  ),
  record(
    'live-growth-and-wind',
    'The real-time growth presentation and still/breeze wind inspection trajectory applied to recomputed shared-lattice material membership.',
    'Visible authoritative topology change and dimensioned quasi-static organ response.',
    'Communicate growth and material response from live simulation state rather than replayed or renderer-invented poses.',
    'Both modes advance from the shared 60 Hz host tick; public cells are reprojected from authoritative organ poses and the ordinary breeze gate retains more than 97% of world-lattice membership across one tick while requiring some change.',
    'Removing growth freezes the case study before its flushes; removing wind hides the tissue response.',
    'Moving voxel cells independently of their organ or applying wind to soil breaks the authoritative pose relationship.',
    'One still control and one bounded breeze state expose the response without a separate voxel deformation system.',
    ['oak-browser-frame-clock.test.ts/advances the same 60 host ticks across 60, 120, and 240 Hz display cadences', 'oak-mechanics.test.ts/increases deflection with wind and decreases it with E and radius', 'oak-ecosystem-stages.spec.ts/every biological milestone retains a deliberate voxel composition'],
    'Wind is quasi-static and reprojects rigid biology-owned source poses into shared-lattice material membership each tick; it has no damping, fracture, voxel deformation or thigmomorphogenesis.',
  ),
  record(
    'experiment-controls',
    'The nine visible commands: pause, growth, wind, root cutaway, rain, low water, low N, low P and reset.',
    'Direct intervention and controlled comparison of the bounded ecosystem pathways.',
    'Expose each independent case-study intervention through one typed visible action.',
    'Each button dispatches the same typed command as the test harness, reports pressed state when persistent, and queues its intent if a worker target becomes pending before dispatch.',
    'Removing a command prevents its named counterfactual from being performed in the visible case study.',
    'Relocating a command into renderer state breaks simulation authority and makes reset incomplete.',
    'One control per independent intervention plus one shared pending-command queue is sufficient; there are no decorative or duplicate commands and no ready/click intent is discarded.',
    ['oak-ecosystem.spec.ts/time, stress, and inspection controls command their owning domains'],
    'Controls expose bounded experiments, not a general ecosystem editor or calibrated scenario builder.',
    { browserCommands: ['toggle-pause', 'growth-mode', 'wind-mode', 'root-cutaway', 'rain', 'low-water', 'low-n', 'low-p', 'reset'] },
  ),
  record(
    'hud-and-diagnostics',
    'The single HUD panel, three view selectors, status line and 13 live diagnostic rows.',
    'Readable experimental state, resource residuals, presentation revision and GPU ownership evidence.',
    'Name the active experiment and keep biological, conservation and renderer evidence visible together.',
    'The panel reserves the left screen region; fitted cameras keep the subject clear and values come from published evidence.',
    'Removing it hides which intervention and state a frame represents and removes conservation/runtime observability.',
    'Moving it over the fitted subject obscures the organs and relationships under inspection.',
    'One compact panel and 13 non-duplicated values are the minimum retained interface for case-study evidence.',
    ['oak-ecosystem.spec.ts/mounts one live oak through the real Three runtime with domain controls', 'oak-ecosystem.spec.ts/fixed cameras, root cutaway, resize, capture, and teardown stay coherent'],
    'Diagnostics report this deterministic fixture; they are not uncertainty bounds or telemetry for every consumer.',
  ),
] as const satisfies readonly OakPurposeAccountabilityRecordV1[]);
