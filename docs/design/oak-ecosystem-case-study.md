# Pedunculate oak ecosystem case study

## Purpose and boundary

This case study asks whether a consumer can drive one biologically structured, materially legible tree through Voxel's existing public render contracts without turning the renderer into a simulation engine.

The consumer fixture in `fixtures/oak-ecosystem-consumer/` owns the organ graph, environmental state, process clocks, resource ledgers, interventions and wind pose.

Voxel receives only a versioned, plain-data projection and derives disposable geometry, materials, instance batches and sparse render deltas from it.

## Implemented slice

The implemented organism is a deterministic `Quercus robur` seedling from imbibition through three early shoot flushes, with a terminal first-season senescence and leaf-transfer path used as a conservation check.

This is an early-growth calibration hypothesis, not a field-calibrated tree-growth forecast.

The soil microcosm contains eight heterogeneous 0.2 m cells in two depth layers, with explicit water, ammonium, nitrate, labile phosphorus, sorbed phosphorus, litter and an aggregated ectomycorrhizal guild.

The outer host advances on the repository's shared 60 Hz step while physiology, soil chemistry, allocation and phenology run at their own explicit biological cadences. The browser maps real RAF timestamps through an eight-tick bounded accumulator, so 60, 120 and 240 Hz displays advance the same biological time and paused elapsed time is discarded rather than caught up.

Every organ has a stable local identity and generation, a parent edge, a biological stage, authoritative pose, geometry, tissue pools and stress state.

The shoot uses successive internodes, one leaf per node, oak's 2/5 spiral phyllotaxis and an axillary branch relationship; roots retain a taproot and a bounded spatial fine-root cohort rather than claiming resolved root topology.

## Cause-and-effect model

Rain enters topsoil, excess water runs off or drains, top cells evaporate, and roots can withdraw water or mineral nutrients only from cells touched by their declared spatial kernel; low-water root conductance is the root-weighted relative-extractable-water fraction raised to the registered `3.5` fixture exponent, so a paired intervention proves that a 0.4 L pulse leaves at least 0.30 L more soil water, adds at least 0.01 L root uptake and improves leaf water potential by at least 0.25 MPa rather than passing on floating-point noise.

Nitrogen retains separate ammonium and nitrate pools with nitrification, while phosphorus retains separate labile and sorbed pools with desorption.

The ectomycorrhizal guild receives plant carbon only in root-supported cells and can return nitrogen and phosphorus; a litter ablation proves decomposition directly raises soil ammonium and labile phosphorus while exporting respired carbon, without claiming that this short run produces a separately identifiable whole-tree growth response.

A bounded light-water-nutrient response produces carbon during the daylight interval, maintenance respiration and transpiration remove carbon and water, and stress changes leaf water potential, relative water content and chlorophyll.

Growth can occur only when carbon, water, nitrogen and phosphorus costs can all be paid, and each of the four whole-system ledgers compares initial storage plus boundary sources minus boundary sinks against current storage with an absolute residual below `1e-12` in the accepted scenarios.

Wind is a quasi-static cantilever response driven at the host tick, with a fixture-assumed `3–6 m/s` inspection breeze, dimensioned drag, tapered-section bending, self-weight from the biology-owned fresh mass, turgor-sensitive leaf-petiole stiffness and broad-leaf load reconfiguration; it does not simulate distal crown load, dynamic damping, fracture or thigmomorphogenesis.

## Material and rendering design

Wood and roots use instanced tapered regular-octagon shafts whose complete enclosed volume at the shared taper matches biology-owned fresh mass at the declared green density; on an occupied parent, one four-ring profile replaces the terminal 16% of the ordinary taper with a continuous node flare, while finite parent-terminal load-path sections remain explicit for mechanics.

Leaves use three evenly assigned instanced lobed and cambered meshes: primary-axis leaves have a 70 mm blade plus a short petiole, while the resource-paid expanding axillary leaf is similarity-scaled smaller with proportional area and pools; every leaf retains a raised readability-only midrib and a finite tapered rectangular petiole whose rendered basal weak-axis second moment is the mechanics source, and its tangential port keeps that section outside the parent terminal plane under self-weight and breeze.

Soil cells use instanced voxel cubes. In cutaway mode the one coarse-root path is dark and the one aggregate fine-root cohort path is pale; the latter has a presentation-only `1.2 mm` radius floor for legibility at the case-study camera scale, not a measured diameter or resolved individual-root topology.

Living leaf colour comes from chlorophyll, phenological stage and resource stress, including a low-chlorophyll control in which yellow overtakes green, while authoritative leaf direction, turgor wilt and roll come from the simulation rather than a renderer animation.

The private browser host supplies the camera, sky fill, directional sun and shadow policy; none of those choices expand Voxel's public renderer API.

Hero, side, overhead and root-cutaway views fit the accepted public-geometry vertices rather than biological centerline proxies, and the interactive host exposes pause, accelerated growth, wind inspection, rainfall, independent low-water, low-nitrogen and low-phosphorus regimes, reset and live ledger diagnostics.

## Evidence hierarchy

| Mechanism or form | Literature constrains | Fixture still assumes |
| --- | --- | --- |
| Recurrent oak extension units and branch order | Shoot architecture and bud-count model shape | Flush days, lengths, allocation and this seedling's exact topology |
| Oak 2/5 phyllotaxis | Spiral leaf order and 144 degree divergence | Applying one exact sequence from the first rendered flush |
| Leaf form | Short petiole, obovate blade, rounded lobes and reported size range | Three deterministic low-poly silhouettes and their sampled dimensions |
| Soil water | Nonlinear unsaturated conductivity and spatial root-uptake model shape | Cell parameters, forcing, the 3.5 conductance exponent and reduced drainage scheme |
| Photosynthesis | C3 causal axes | The bounded response curve and every numeric rate |
| Ectomycorrhiza | Carbon-for-nutrient mutualism and oak-wide effects | One aggregated guild and all exchange rates |
| Bending and wind | Green oak bending scale and broad-leaf reconfiguration | Effective moduli, drag parameters and quasi-static reduction |

The machine-readable biological and process-parameter registry is `oak-parameters.ts`; numeric model assumptions are identified separately from papers that support only model shape. Typed render-resource, colour and fixed-camera presentation constants remain beside the code that consumes them and are inventoried by the purpose-accountability ledger rather than being presented as biological parameters.

The typed purpose graph is `oak-purpose-graph.ts`, and `oak-purpose-accountability.ts` records the exact authored scope, beneficiary, job, placement, removal and relocation failure, smallest adequate form, evidence and honesty boundary for every visible resource, batch, command and fixed view.

## Acceptance evidence

Deterministic tests require distinct water, nitrogen and phosphorus counter-runs, a same-seed paired rain-to-leaf response under a continued low-water boundary with material thresholds, a no-root-uptake control that retains pulse water in soil without that measured leaf response, spatially local root and fungal exchange, direct litter mineralization, and an ambient no-rain ablation that changes boundary input and soil storage while honestly producing no separately identifiable day-100 tree response from the initially buffered soil. They also require stable organ identities, connected poses, oak phyllotaxis, four-pool residuals below `1e-12` and bounded command inputs.

Render tests require public-contract validation, finite normalized geometry, one continuous positive-area shaft surface per structural organ, integrated node-flare collision coverage, balanced real lobe-count variation, render-to-mechanics petiole-section parity, camber and midrib relief, stable generation-bearing instance keys, exact accepted-state sparse-delta parity and bounded primary-content-pass draw-call and triangle metrics that explicitly exclude shadow and auxiliary passes.

The whole-organ geometry oracle transforms the actual public meshes and instance matrices, samples tapered volumes and checks lamina and petiole triangles across day 13, day 90, day 100 and breeze states; it is a bounded sampled conflict detector rather than a formal constructive-solid-geometry proof.

Browser tests exercise the real `ThreeRenderRuntime`, domain controls, drought and rain causality, fixed multi-view captures, semantic living-leaf colour, root cutaway, resize, capture, bounded GPU resources and idempotent teardown.

Visual acceptance requires first-hand inspection of the first- and third-flush hero, side and overhead frames, the two-path root cutaway and the drought-softened canopy at the bounded `6 m/s` breeze peak with zero mechanics clamps. Continued-low-water rain response is claimed from paired ledger and physiology measurements because its visible change is intentionally subtle.

## Deliberate non-claims and next checkpoints

This slice is not a full Farquhar-von Caemmerer-Berry solver, Richards equation solver, individual-root or fungal-network model, canopy radiative-transfer model, field-calibrated wood allometry, watertight vascular-junction model, dynamic fracture model, species interaction network, mature-tree model or validated predictor for a particular site.

The next checkpoint is a calibrated recurrent annual cycle with temperature and photoperiod forcing, bud set and bud break, cohort turnover, cambial growth and held-out seedling measurements.

The later five- and twenty-year checkpoints require validated allometry, crown competition, root turnover, mortality and disturbance evidence before their outputs can be called biological predictions.

## Primary references

- Buck-Sorlin and Bell, [Models of crown architecture in *Quercus petraea* and *Q. robur*](https://doi.org/10.1093/forestry/73.1.1).
- Smith, [Nodal Anatomy of Some Common Trees](https://doi.org/10.1080/13594863709441519).
- World Flora Online, [*Quercus robur* taxon description](https://www.worldfloraonline.org/taxon/wfo-0000292858).
- van Genuchten, [A closed-form equation for predicting hydraulic conductivity of unsaturated soils](https://doi.org/10.2136/sssaj1980.03615995004400050002x).
- Couvreur et al., [A simple three-dimensional macroscopic root water uptake model](https://doi.org/10.5194/hess-16-2957-2012).
- Farquhar et al., [A biochemical model of photosynthetic CO2 assimilation in leaves of C3 species](https://doi.org/10.1007/BF00386231).
- Kurth et al., [Oak displays common local but specific distant gene regulation responses to different mycorrhizal fungi](https://pmc.ncbi.nlm.nih.gov/articles/PMC7291512/).
- Tippner et al., [Determination of the static bending properties of green beech and oak wood](https://doi.org/10.3390/f15010150).
- Vogel, [Drag and reconfiguration of broad leaves in high winds](https://doi.org/10.1093/jxb/40.8.941).
