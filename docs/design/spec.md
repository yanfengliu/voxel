# Voxel graphics engine design

Status: the V1 vertical slice was implemented on 2026-07-11 and the stable 1.0.0 release followed on 2026-07-18. This document records the original architecture and option analysis; it is not a claim that every proposed section exists. The README and [the completed implementation ledger](../plans/v1-implementation.md) describe what ships today (deltas, the production greedy worker pipeline, committed voxel/instance picking for profiled worker worlds, revision-aware capture, embedded hosts, and both consumer proofs). Facilities proposed here but absent from that shipped surface — including GLTF asset loading, public extension and pick-proxy APIs, and generic render passes — remain future design rather than current public API. The [1.0 roadmap](../plans/v1-roadmap.md), [target architecture](v1-architecture.md), and implementation ledger record the released scope, architecture, and evidence.

## Decision summary

Build a browser-first, voxel-first rendering toolkit in strict TypeScript, using Three.js `WebGLRenderer` for the first production backend.

The toolkit should be voxel-first rather than voxel-only. A dense or sparse block world needs chunk storage and meshing, but the target games also need instanced units, procedural building shells, imported GLB assets, water, overlays, particles, and UI-compatible picking. Forcing all of those through a cube grid would make the shared engine less useful.

Use one package with subpath exports during the first implementation:

- `voxel/core` for game-neutral data contracts, coordinate conventions, IDs, revisions, and bounded validation;
- `voxel/physics` for the stated laws of motion, their per-material values, the bounds content may not declare past, and one function applying the damping laws to a rigid body;
- `voxel/meshing` for Three-free voxel storage, dirty-region tracking, deterministic mesh generation, and voxel raycasts;
- `voxel/three` for the scene runtime, resource caches, chunk meshes, instanced batches, cameras, picking bridges, assets, render passes, and capture;
- `voxel/testing` for reference scenes, structural assertions, browser capture helpers, and render metrics.

`voxel/physics` is deliberately not a simulation engine, which the non-goals forbid: it steps nothing, integrates nothing, and resolves no contact, and the renderer never reads it. It exists because a physics flaw found here is fixed as a law of this universe rather than as a patch to the scene that exposed it, and a law nobody can borrow drifts the moment a second solver exists. It therefore depends on no solver, no Three.js, and no DOM — a consuming game keeps its own solver and opts in at its own body-creation site. This repository's own solver lanes apply it where rigid bodies are created, so no scene here can escape a law by declaring nothing.

Split these into independently versioned workspace packages only if real release or dependency pressure appears. In the one-package form, `three` is an optional peer declared through `peerDependenciesMeta`, externalized from the library bundle, and required only by `voxel/three`; core, physics, and meshing entry points and declarations must not reference it. Phase 0 chooses one tested `three` plus matching `@types/three` release, aligns consumers before integration, configures linked Vite consumers with `resolve.dedupe: ['three']`, and verifies the bundle contains exactly one Three.js runtime. Do not advertise a broad 0.x peer range without a real compatibility matrix.

Keep WebGPU as a later experimental backend. The portable data plane and Three-free mesher should not prevent it, but MVP APIs should not pretend that WebGL and WebGPU shaders, post-processing, readback, and lifecycle behavior are interchangeable.

The delivered 0.1 slice is governed by the durable [architecture decisions](../architecture/decisions.md), [ecosystem review](../research/ecosystem.md), and [cross-game implementation ledger](../plans/implementation.md). Those documents record the selective build-versus-adopt boundary and the user-requested AoE2-first proving slice. The separate 1.0 documents record the stable release's scope, ordering, and delivery evidence.

### Dependency and ownership strategy

Do not build every graphics facility in-house. Own the game-neutral contracts, deterministic validation and meshing oracle, accepted/presented state machine, resource lifecycle, diagnostics, and consumer integration. Reuse Three.js for rendering; use its `InstancedMesh`/`BatchedMesh` primitives before adding a batching dependency; adopt `three-mesh-bvh`, glTF Transform, and meshoptimizer only when a measured slice exercises them.

The first tested Three line is runtime `0.185.1` plus `@types/three` `0.185.0`, matching City's locked install. The package declares a narrow optional peer and linked Vite consumers deduplicate it. Townscaper must upgrade from its older Three line before consuming `voxel/three`.

The first TypeScript visible-face mesher is a deterministic correctness oracle behind an injectable interface, not a commitment to recreate a mature voxel stack. Before greedy meshing or advanced block features, compare a pinned extraction of Voxelize's MIT Rust/WASM mesher with `block-mesh-rs`. Do not import Voxelize's multiplayer/server/world ownership into the public runtime. Taichi.js is excluded from the production dependency graph; native Taichi and OpenVDB may be used by offline authoring tools when a real workflow requires them.

## Goals

- Share rendering infrastructure across `city`, `townscaper`, AoE2's live 3D renderer, and similar browser games.
- Render chunked voxel terrain without internal faces or one-object-per-voxel overhead.
- Render large repeated populations through explicit instance batches and capacity policies.
- Accept procedural meshes and imported assets without making the engine an asset authoring tool.
- Keep rendering downstream of typed snapshots or deltas so simulations stay deterministic and headless.
- Make resource ownership, async revision ordering, context loss, and teardown correct by construction.
- Make correctness, visual output, memory stability, and performance inspectable through reusable test tooling.
- Permit each game to retain its own art direction, topology, UI, gameplay concepts, and renderer-specific extensions.

## Non-goals

- Owning simulation ticks, ECS entities, pathfinding, AI, save data, game commands, or gameplay rules.
- Replacing DOM UI or requiring HUDs to render inside the 3D canvas.
- Turning Townscaper massing rules, City road rules, or AoE unit rules into engine concepts.
- Providing a Blender replacement, asset evolution workflow, or general mesh editor.
- Building a raw WebGPU renderer in the first version.
- Guaranteeing that every Three.js feature or custom game shader works on every future backend.
- Migrating all three games before the library proves value in small vertical slices.

## Evidence from current consumers

### City

`city` is the second live proving consumer. Its opt-in `?voxelWalls=1` path draws the building-wall lane through Voxel's embedded, borrowed-renderer mode. City's simulation still runs in a worker and emits structured-clone-safe render views; its host renderer continues to own terrain, vehicles, structures, trees, texture overlays, interpolation, camera, capture, and the rest of the frame.

The reusable ideas are the simulation/render boundary, revision-aware updates, growable or capped instance pools, sparse overlays, renderer-owned interpolation, explicit draw-call budgets, and ground/preview picking.

City-specific roads, zones, utilities, RCI colors, building rules, and protocol messages remain in `city`. The embedded proof gives Voxel's owned root an idempotent teardown path without transferring responsibility for the host's render loop, listeners, controls, meshes, materials, textures, or workers.

### Townscaper

`townscaper` is already a sizable Three.js renderer with centralized geometry/material ownership, revision caches, animation registries, staged rebuild timing, static batching, deterministic details, semantic surface culling, water, and a narrow `TownScene` facade.

The most reusable pieces are lifecycle patterns, shared-resource registries, material keys, revision caches, static batch construction, render instrumentation, camera/capture utilities, and policy-neutral voxel or geometry helpers.

Townscaper's connected massing, facade placement, harbor, courtyard, wildlife, cloth, density budgets, and water art direction remain product code. Its bounded sparse column world can initially use a correctness-first full rebuild adapter; larger worlds require chunk invalidation and spatial indexing rather than copying Townscaper's full rebuild and linear picking behavior.

### AoE2

`aoe2` is the first live proving consumer. Its `AoeVoxelGameView` is the sole renderer host and drives one interactive Three/`voxel` world canvas; the former Phaser source, dependency, selector, fallback, and second world canvas are gone. The simulation boundary remains authoritative: typed render projections feed an AoE-owned adapter, display interpolation does not mutate gameplay, and stable render identity includes an entity generation because ECS IDs can recycle.

The completed migration preserved the simulation, DOM HUD and minimap, saves, replay data, bridge replacement, camera/input behavior, browser-test hooks, and direct capture. AoE keeps elevation and visual semantics in its own projection, currently renders terrain flat at elevation zero, owns displayed silhouette-proxy picking, and emits fog, selection, placement, health, hit, and death feedback through normal snapshot lanes. Those current consumer choices are proof of the package boundary, not engine-wide picking, heightfield, overlay, or art contracts.

### Adjacent repositories

`3d-maker` is an adjacent asset-authoring design, not part of the runtime. It may eventually provide GLB assets or deterministic procedural recipes. The engine should load those outputs without absorbing evolution, gallery, or editor responsibilities.

The `lego` repository demonstrates a useful ownership principle: canonical domain data is authoritative, a Three.js scene is derived and disposable, canonical camera/capture packets are versioned, and resource disposal is explicit. Its brick semantics and trust model do not belong here.

### Current Studio-only contrast curation proof

The private Model Studio now includes 30 manually curated recipes across six contrast families and four neutral domains, supported by seven reusable shape-changing parts and four domain contact sheets. Every promoted recipe appears once across those sheets, and four semantically animated models in the mechanical-industrial, civic-architectural, and natural-organic sheets exercise the persisted scene-animation control independently of the lighting proof.

The separate fifth **Machine Works** system scene contains twelve independent rebuildable assembly-line recipes: a conveyor foundation, a dedicated foundation-mounted insertion press bridge, two insertion stations, a motorized output trunnion dock, a three-piece keyed product, and a collection bucket; the eight unrelated promoted industrial specimens remain in the explicitly named **Mechanical studies** contact sheet. The bridge replaces the reused decorative gantry. Four named feet meet four occupied foundation pads; two rectilinear towers stand behind the moving belt band while the load beam hangs narrowed cream stator blades inside empty orange three-sided moving C-yoke cavities throughout both prescribed strokes. Exact swept bounds require at least 0.4 world units of running clearance on every transverse stator face and zero positive-volume overlap between each stator and the three occupied yoke bars. Rear head pads remain tangent to straight bridge faces as visual alignment datums only. The cabinet, overhead bus, fixed servo housings, beam, and stators form an exact face-connected external actuation route terminating at fixed-stator/moving-yoke engagement. Each moving head has a separate precharged local buffer connected through an internal conduit and ram backing to its magnetic pickup plate. The exact bridge and head sidecars validate painted-solid parity, distinct foot contacts, alignment faces, cavity topology, exact bars, stator containment, minimum running clearance, zero positive-volume stator/bar overlap, and both service-route continuities, but the bridge remains presentation-only: Rapier receives no bridge body, guide constraint, load transfer, or stress evidence. Each insertion slide begins preloaded by a fixed joint with its component outer face touching the energized pickup plate; the fixture simulates no in-trace grab, articulated jaw, charging, flexible moving feed, current, magnetic force, motor torque, feedback dynamics, or energy use. The consumer prescribes vertical motion, validates position, orientation, relative speed, dwell, and real two-voxel insertion into empty clearance, and requires the cap crown underside to meet the core top plane after the key occupies core layers seven and eight with deliberate lateral assembly clearance. Immediately before replacing a component body with exact colliders on the retained base, it measures the live and canonical merged poses, records the actual world-space translation and shortest quaternion-angle correction, rejects correction above 0.025 world units or 0.03 radians, and rejects deepest solver penetration above the hashed 0.001-world-unit merge budget. That software compound weld is not a solved lock or latch. Fifty-eight exact 26-voxel-deep kinematic slats form a closed articulated loop around two internal drums; OBB/SAT regression samples every slat and both drums over 32 phases, requires boundary-only end-cheek contact, at least about 0.275 world units of central-barrel clearance, and detection of an overlapping negative control. Four minimal exterior hub-and-radial flags remain collision-excluded phase witnesses, so all 64 presented drive elements share one hash-bearing phase without claiming gear teeth, contact, or torque. Nine causal sidecars enter Rapier `0.19.3`; the bridge, output dock, and phase flags do not. Belt contact and friction transport the axis-constrained carrier without a prescribed X trajectory, while same-geometry zero-drive and zero-friction ablations bound the causal claim. Full carrier pose and speed validation precede a prescribed no-snap output rotation about the carrier's visible chassis-backed trunnion axle. That axle extends beyond both belt edges into two open C-bearing cradles whose plinths terminate on separate occupied foundation guard-top faces; the bearings remain at least 0.5 world units beyond the belt, and a third grounded foot supports an outboard servo whose safety coupler face-contacts the axle. Canonical validation separates every non-axle carrier solid axially, excludes positive-volume dock overlap with the foundation and bucket, proves about 0.1528 world units around the axle's complete quarter-turn swept cylinder, and analytically checks the full configured-angle carrier sweep against every foundation and bucket solid, retaining about 0.7528 and 0.6000 world units respectively. The accepted live release pose repeats the continuous quaternion-aware sweep with at least 0.14 world units from the dock, about 0.7518 from the foundation, and about 0.5990 from the bucket; its tick, pivot, rotation, configured tip angle, radius, all three minimum clearances, and every limiting solid enter the final hash. The dock remains presentation-only and proves no revolute constraint, bearing response, motor torque, feedback, or energy use. The resulting 30-second trace records 71 tracks over 1,800 fixed steps and presents 74 instances, with assembled, released, contact, and collected evidence at about 11.67, 18.33, 20.87, and 23.87 seconds; collection requires the product inside the bucket sensor within the hashed 0.05-unit tolerance, and the final frame holds until the discrete reset at exactly 30 seconds. Studio solves this machine in the browser as it is watched, and presents no recording of it: the scene carries no pose replay, its status reads `live physics · solved in browser`, and it is read-only because the solver decides where its bodies sit rather than because anything is being decoded. The committed 30-second trace survives as a determinism fixture the consumer generation suite pins, and as the source of held poses for the close-up geometry rigs in the browser evidence, which stage their own private scenes rather than borrowing the shelf's. Neither the authoring schema nor Voxel integrates physics, decides attachment, or feeds rendered state back into the trace.

The sixth curated Studio proof scene, **Riverfall canyon**, solves its water in the browser without making simulation renderer state. Seven rebuildable opaque-voxel recipes and ten seeded tree placements remain ordinary scene geometry; the optional same-blue ripple specimen stays on the asset shelf instead of becoming a separate drop or foam-particle layer. The fixture-local `studio.riverfall-fluid-domain/1` sidecar partitions one continuous 142-unit path into exactly twelve reaches: river, lip, fall, pond expansion, pond basin, pond contraction, outflow, visible submergence, hidden sink, hidden under-foundation return, hidden source rise, and visible emergence. A deterministic 2D PBF thin-sheet/surface solver advances 576 half-mass particles through five fixed 5 ms substeps, stepped live at the shared lane rate, and a particle-to-grid pass reconstructs 321 surface tiles from it every frame onto a `studio.scene/3` document that carries no replay. The river is simulated ten units — exactly the reconstruction's support radius — upstream of where it is drawn, and nothing is rendered over that lead-in: a tile is reconstructed from the particles inside a ten-unit ball, so a first tile at the water's edge had half its ball empty and went blank whenever the head thinned, which no particle count fixed at 288, 576 or 1,152. Sixteen seconds of burn-in precede the first presented frame so the longer closed loop opens filled. The same solver still generates a 241-frame, 6,025 ms cyclic trace, which survives as a byte-pinned determinism fixture the consumer suite regenerates and compares — it is never what Studio plays. Projected gravity acts along the domain tangent, a fixed-order Jacobi density constraint and XSPH couple neighboring particles, explicit lip attachment turns the sheet downward, dissipative fall-to-pond impact feeds the widening basin, sloped-bank contact projects and reflects along the physical strip normal, and an occluded external pump recirculates particles through the sink, return, and source rise between the two visible transitions. Reconstruction is fail-closed and local rather than global extrapolation: each observed cell-frame requires at least two visible particles inside a world-Euclidean radius-10 Wendland-C2 kernel, orders support by distance then particle id, and lets only the nearest eight contribute a recording-start carried tracer, local-speed sample, and support-occupancy proxy. A hashed authored downstream coordinate supplies a coherent 20-unit presentation carrier whose phase integrates a five-unit surface-wave floor plus a local PBF-speed term; one bounded neighbor pass crosses the visible reach seams and bounded normal translation produces the height signal. The derived input hash covers the particle input hash, complete presentation configuration, and every canonical topology field, and a paired near-versus-distant perturbation proves that a locally supported particle affects its tile while an out-of-support change does not. Eighty fixed-orientation tiles exactly cover the live river recipe, five close the one-unit lip, 20 turn down the live exposed fall, 208 cover the live pond recipe, and eight cover the live outflow recipe; their centers never move tangentially, their posed footprints remain bank-contained, two ordinary instanced batches share one blue with the concealed static underfill, no pale particle layer remains, and the scene session marks every translucent water material single-layer so a Studio-internal depth prepass blends each water pixel exactly once instead of stacking film over underfill. Studio's live lane owns the scene through a physics profile that declares no bodies at all — a tile is a presentation of the fluid, never a body that could collide — and a presentation driver that advances the fluid once per fixed tick and returns the tile poses, which the stage presents through ordinary sparse instance deltas. Canonical generation fails closed if particle accounting, compact-support coverage, finiteness, density, speed, boundary correction, or penetration exceeds its declared budget; fixture tests also hold the remaining world fixed while separately ablating projected gravity, hidden-pump forcing, the density solve, and XSPH, match the spatial hash to a brute-force neighbor oracle, prove live recipe-to-grid coverage, require every reach to change materially at the fixed evolved phase, require substantial full-cycle amplitude in every cell, bound all-frame spatial adjacency and cyclic temporal displacement, and require frame 240 to equal frame zero exactly. Fixed browser evidence covers opening and evolved default phases, an unlit palette check, overhead, longitudinal, reverse closure, and reset views while a twelve-phase union requires at least half of the stable water pixels to change by four or more RGB levels in the lit phases — the single-layer film blends once per pixel, so per-pixel deltas run at about half the removed double blend's size — and pins bounded instance, draw, triangle, resource, and texture counts plus a 25 ms mean pose-presentation ceiling across repeated exact draws. The carried tracer, occupancy proxy, authored carrier, neighbor smoothing, and cubic loop bridge are locally solver-driven or solver-modulated presentation devices rather than a solved height, energy, or density field, and this bounded proof claims neither volumetric or free-surface Navier-Stokes, a continuously deforming mesh, transparent or refractive water, erosion or hydrology, nor gameplay water state; no Riverfall branch exists in the renderer or frozen public package API.

Promotion is contrast-based rather than count-based: palette or seed-only variants do not qualify, and each accepted recipe must differ from its nearest catalog neighbors on at least two independent axes among topology or negative space, multi-view silhouette or massing, scale or proportion, construction or part grammar, spatial material rhythm, and supported motion. A deterministic development pass generates 64 bounded candidates per family through setting, subtraction, reordering, relayout, duplication, mirror, and additive operations; it rejects empty output, catalog and earlier-candidate topology duplicates, invalid builds, and proposals without quantitative morphology support, carries rebuildable recipes for survivors, and sends them only to human review. It never auto-promotes a candidate, and a reusable part is extracted only after a second real use.

`fingerprintStudioModelV1` and `analyzeStudioCatalogDiversityV1` expose deterministic raw structural and catalog evidence, while `npm run studio:diversity` captures fixed four-yaw contact sheets and a four-phase semantic-motion sheet under ignored `output/playwright/studio-diversity/`. The fingerprints are orientation-sensitive, do not canonicalize rotations or reflections, and do not automatically score construction grammar, motion semantics, or spatial material rhythm, so a human must review the visual thesis and manually update `tools/studio/fixtures/diversity-accepted-v1.json`; ordinary generation never rewrites that fixture.

This is bounded dev-time catalog curation, not an asset-evolution system. It adds no public `voxel/core` or `voxel/three` runtime API, declaration, schema, or auto-promotion path, and consumer-specific art direction remains in each game repository.

The seventh curated Studio proof scene, **Wind-powered trip mill**, composes four independently rebuildable, purpose-audited recipes into one causal mechanism: a grounded frame carries two separated rotor bearing rings, one hammer bearing ring, and their foundation ties; a rigid rotor carries one continuous shaft, two opposed stepped pitched plates, two paired moving collars, and two opposed cam arms and contact noses; a pivoted follower-beam-head hammer converts cam lift into a gravity-returning strike; and a direct-ground fixed anvil receives the output impulse. The voxel rings communicate ideal revolute datums, journal-clearance crosses, and visual routes to ground, while each collar pair forms a bilaterally balanced visible shoulder with cancelling radial first moments; solver joints at named ports provide the actual constraints, linked-body contact is disabled, and neither visual assembly claims bearing pressure, friction, load sharing, or an axial stop. The hammer's follower elbow is the first grid column beyond the maximum cam-nose extent allowed by the bounded parameter space, excluding both earlier interference and later purposeless raised cells. An independently authored need-led interface grammar rejects missing and unexpected same-body adjacency before any purpose evidence is accepted. Every visible box then receives one unique evidence record, one exact-box scope, and explicit removal, relocation, minimum-form, and honesty fields; only the selected catalog ledger binds every removal and the bounded representative relocations to canonical front/side and purpose front-/rear-quarter browser proofs. Purpose-review removal and whole-placement relocation artifacts are explicit static `studio.scene/3` or recipe variants, not replay snapshots silently converted by the browser. A consumer-owned Rapier `0.19.3` fixture advances the two dynamic bodies at the repository's one 60 Hz solver rate behind the extracted exact-sidecar adapter, constrains each with a passive impulse revolute, and records the same solver loop at 60 Hz. The 12-second physical run contributes its initial state plus every solver tick, yielding 721 frames; private `studio.scene-pose-replay/2` presents the terminal sample for one additional display interval and then holds it instead of inventing a loop seam, while explicit Play or Space from the end restarts at zero. A fixed, geometry-derived 10 m/s world-air design point drives both plates through the two-sided quasi-steady law `F = 0.5 rho Cd A dot(u-v,n) abs(dot(u-v,n)) n`, evaluated from each exact occupied-cell union, its derived equivalent area and normal, and the rigid body's velocity at that plate centroid. There is no motor, speed controller, startup ramp, pose script, velocity override, or post-step projection. A frozen exhaustive search evaluated all 144 bounded geometric candidates at both the short and full horizons and selected the first of 16 passing designs under total occupied voxels, dynamic occupied voxels, envelope volume, and stable-key order. In the selected nominal run both exact cam noses contact the follower, lift and release it, and gravity returns the head to measured anvil impacts over nine qualified cycles, attributed five to one nose and four to the other; neither strict alternation nor two completed trips per revolution is claimed. Generation gates exact sidecar/render parity, ports and load paths, complete collision-excluded overlap, joint anchors, out-of-plane pose drift, axis tilt and pose-derived axis rate, intentional-contact penetration, rotor and tip speed, and one-sided unaccounted-positive-energy diagnostics. Counterfactual worlds separately disable wind, gravity, all cam contact, each exact nose's follower-contact participation, or post-lift anvil contact, or remove one complete sail together with its visible geometry, colliders, mass, and load; they bind those causal interventions rather than merely changing the picture. The scene additionally shows the production line as presentation keyed to those recorded impacts: a mill building shell with two built walls, four corner posts, a header beam over each open face, and a stepped gabled roof — the pitched form every documented working mill shares — keeps the rotor and sails outside its shaft-opening wall while the east and south faces stay open below their headers to expose the working bay; five wheat sacks queue as a finite visible infeed, one reaches the anvil before each blow the magazine can answer and is tipped aside spent, and a flour level in the outfeed bin rises one fixed step per sack milled. Those six appended replay tracks are authored kinematics synthesized at codegen time from the trace's anvil-impact ticks with engine-exact arithmetic, disclosed by the `authored-grain-flour-presentation` capability label, kept outside the recorded final hash, and gated numerically against the rotor's swept bands and the hammer's per-frame envelope; the purpose graph declares grain-mass open through the visible infeed with no sink. This is a bounded rigid-body and quasi-steady aerodynamic fixture, not computational fluid dynamics, a pressure or wake field, turbulence, stall history, blade efficiency, bearing load sharing or friction, stress, deformation, fatigue, wear, heat, sound, forging, safety, arbitrary-wind performance, two-sided energy closure, renderer-owned physics, simulated milling or grain flow, or a reusable general simulation engine.

### Studio scene catalog boundary

The delivered catalog accepts versioned scene documents but currently exposes them as a readonly array copied into a mount-local workspace. Parts and recipes are source-controlled keyed registries, shelf models and parts contain code, and none of those lanes is a durable database today. “Same database family” therefore means the same stable-ID catalog organization; durable IndexedDB storage is a new target specifically for JSON-safe scene records and overlays.

The target catalog wrapper has its own `studio.scene-catalog/1` discriminator, an ID-keyed scene map, section and order manifests that reference scene IDs, replay and simulation-artifact references, and a seed revision. Its ingestion transaction must validate every scene, exact record-key-to-scene-ID agreement, unique stable IDs, complete section coverage, placement keys against the authoritative recipe book, optional shelf coverage as a separate policy, replay identity and duration, and simulation-artifact provenance before the workspace opens.

Because IndexedDB hydration is asynchronous and `mountStudio` is synchronous today, the browser bootstrap must await an injected repository, hydrate and validate one immutable catalog snapshot, and only then mount the workspace. Tests will supply a pre-hydrated in-memory snapshot. No loading or failed migration state may expose a partially populated workspace, and a future collaborative service may implement the same repository boundary without changing scene documents.

The repository envelope around each scene owns its `SceneV1` document, optimistic revision, base-catalog fingerprint, catalog metadata, overlap policy, and references to optional physical or fluid sidecars and immutable pose replays; those references are envelope metadata, not new `SceneV1` fields. Large replay frames, solver instances, callbacks, mutable physics state, review briefs, annotations, and shelf preferences remain separate records or artifacts keyed by stable IDs. This storage belongs to Studio or the catalog producer, never the renderer.

Built-in source-controlled scenes seed the store, while edits and deletions create overrides or tombstones that retain the seed fingerprint they were based on. Hydration must surface a conflict when a seed changed under an override or tombstone; reset explicitly removes the overlay and adopts the current seed. A legacy scene array is accepted only when no new snapshot source is supplied, rejects duplicates before map construction, and migrates deterministically into one default section that preserves array order; supplying both legacy and new sources is an error with migration guidance.

A fixture or game resolves choreography and simulation into versioned state or a deterministic trace; Voxel does not interpret or enforce scene-specific physical laws. The occupancy, solver, and evidence policy is defined in [Physical world invariants](physical-world-invariants.md).

### Current Studio-only scene review artifacts

The private Model Studio keeps one autosaved review brief and an ordered queue of numbered annotations per stable scene id. Annotation is an explicit one-shot stage mode: its left gesture takes precedence over editable placement selection and movement or replay-camera orbit, freezes motion and records the presented picture at press time, and renders a distinct draft marker at that location while the reviewer writes without mutating the scene or simulation. A drag restores prior playback without capturing; a clean release opens the editor. Queueing replaces the draft marker with the annotation number, while canceling removes it. The open draft presentation-locks camera, playback, look, scene-edit, shelf, tab, and panel-resize interaction; automatic stage following waits until the draft closes so an outer layout resize cannot silently reproject its target. Brief and annotation editors preserve native text input and undo ownership, and the review documents persist through guarded browser storage while remaining injectable and mount-isolatable for consumers that need a separate store.

Each annotation is truthfully a captured-view reference rather than a semantic object pick or world-space target. It records a normalized screen point, a versioned fingerprint covering the SceneV1 presentation and resolved seeded/grained model render hashes, exact presented time, camera orbit and pan center, selected placement or no selection, depth mode, lighting and study-edge look, viewport, and optional replay id plus input and final hashes. Draft and queued markers are presented only when the stable scene, resolved content, selection, view, look, framing, viewport, and phase still match; a programmatic context change hides them. Edge targets keep an exact reticle at the normalized point and shift only the connected badge inward. Showing a compatible queued annotation transiently freezes motion and restores that captured context without rewriting the owner's persisted scene-animation permission, while changed content remains explicitly stale instead of silently attaching the old screen point to a new picture.

Scene **Send request** produces private `studio.request/2`: the trimmed brief, only pins belonging to the scene id, a bounded defensive scene snapshot, and current view, unwrapped exact time, selected placement, depth, lighting and edge look, and optional replay provenance. It copies a V4 replay reference and hashes but not the replay frame payload. Briefs, pins, markers, fingerprints, and request envelopes are Studio review artifacts rather than `SceneV1`, renderer state, authoritative simulation, game saves, or additions to the frozen public `voxel/core` and `voxel/three` APIs.

Implementation ratchet: the annotation gesture lifecycle, marker layout, and reversible interaction lock are extracted from the oversized Studio composition root; the remaining composition-local wiring stays there because it alone coordinates the live scene, camera, clock, shell, and Notes panel. Before any further material stage-input growth, extract the contiguous pointer and wheel routing block into one bounded stage-interaction module with explicit model and scene callbacks.

### Current Studio-only clustered-light proof

The private Model Studio now carries a bounded forward+ point-light experiment without changing the frozen public 1.0 declarations or schemas. A Studio scene may author at most 4,096 point lights, and its V3 authoring schema adds deterministic orbit motion; the global **lighting on/off** view preference is shared across models and scenes and persists through the injected view store, which uses guarded browser `localStorage` by default. The control and scene inspector expose the state explicitly; disabled source handles remain dim editing references and contribute no raster light, but lighting does not govern their motion. A separate persisted **simulation on/off** control owns the shared scene clock for moving light sources and animated model placements independently of lighting; ordinary scene Play/Pause updates that saved permission and holds or resumes either kind at the presented phase, while exact inspection and frame rejection may pause transport transiently without rewriting it. A fresh Studio starts with the simulation on, and a legacy stored view migrates the previously coupled light-motion choice from its stored lighting state. Model, editable-scene, and replay inspection share continuous camera-relative WASD ground movement in addition to orbit, drag-pan, and zoom; held-key state is mount-owned and ephemeral, and all movement goes through the same camera/light validation and rollback path. The built-in `studio:scene:lighting-1000` showcase pairs 1,000 full-spectrum sources with 1,000 neutral instanced receivers, moves them on all three axes at varied speeds over twenty-five scrambled depth bands, and proves moving receiver illumination by comparing intensity-on minus intensity-zero contribution at two exact times on pixels lit at both times.

The proof bins visible influence volumes on the CPU into 48-by-48-drawing-buffer-pixel tiles and 24 depth slices, uploads light records and cluster indices through data textures, and injects one fixed shader path that evaluates at most 32 lights per fragment. Light-count changes therefore do not expand Three.js uniform arrays or compile count-specific shader variants, while all visible source markers use one instanced draw. While perspective lighting is active, more than 32 effective finite-range sources with no unbounded source add a data-derived camera-distance floor, pitch bound, and centered-pan policy that keep the eye outside their complete static or orbiting finite influence volume without permitting an edge-on or off-center projection; the built-in proof is swept across 15-degree yaws, bounded pitches, supported viewport shapes, and motion phases, flat and unlit modes retain the ordinary orbit and unrestricted pan, and reactivation applies the paired pan/orbit policy before publishing its frame. Scenes with unbounded sources or fields too large for that conservative policy remain subject to the actual preparation limits rather than an automatic claim of safety. The system has no shadow path; a cluster above 32 influences, more than the bounded light-cluster work, too many unbounded-range lights, a viewport outside the supported bound, or more than 4,096 authored sources produces a specific deterministic rejection and preserves the previous prepared lighting instead of silently dropping influences.

The current sealed [named-hardware measurement](../../benchmarks/results/2026-07-26T06-22-55-772Z-clustered-lights-1000.json) replayed five identical 600-frame sequences from commit `ec2f3ea` on an RTX 4090 at 1280×720. The full 1,000-light and 1,000-receiver workload sustained 1,208.8 GPU-synchronized uncapped Studio draws/s with 0.80/0.90/1.10 ms frame p50/p95/p99, 148,000 triangles, two draw calls, and a measured maximum cluster occupancy of 11/32. This is source-sealed Studio microbenchmark throughput, not display FPS, gameplay FPS, or a game-sized scene.

This Studio seam is not yet the production dynamic-light contract. Cluster preparation publishes a successful light-texture update before `runtime.frame()` presents the world, so `SceneSession` compensates for a subsequent frame failure or lifecycle-unavailable outcome by restoring Studio light resources to their prior presented time and surfaces an aggregate failure if that restoration also fails. A production renderer V2/next-major design must still make light resources part of the same accepted/presented revision transaction as other render state, with explicit ownership and rollback, before exposing them through `voxel/core` or `voxel/three`.

## Architecture

```text
game simulation or editor
          |
          | game-owned adapter
          v
bounded snapshot / revisioned delta
          |
          v
   renderer-owned RenderWorld
      |          |           |
      |          |           +--> asset and material caches
      |          +--------------> instance-batch updates
      +-------------------------> dirty chunk jobs
                                      |
                                      v
                              meshing worker pool
                                      |
                              revision-checked result
                                      v
camera/input intent --> Three.js runtime --> render passes --> canvas/capture
                              |
                              +--> picking IDs, metrics, diagnostics
```

The boundary is deliberately asymmetric. Games know the engine's data contract through their adapters. The engine never imports a game's world, components, rules, or UI.

### 1. Portable core

The core contains only data and deterministic helpers. It has no DOM and no Three.js dependency.

Responsibilities:

- branded world, object, batch, chunk, asset, and material IDs. A render key is either opaque and never reused within a world epoch or explicitly includes `{ localId, generation }`; recycled simulation IDs alone are invalid;
- schema versions, world epochs, resource incarnations, and monotonic accepted and presented revisions;
- finite vector, quaternion, transform, bounds, color, and palette types;
- an explicit coordinate convention: right-handed, `+Y` up, `-Z` forward, floor-based negative chunk coordinates, declared `metersPerWorldUnit`, and scalar or three-axis `worldUnitsPerVoxel`;
- explicit color encodings. Default palette and UI colors are straight-alpha sRGB8; alpha is linear, the runtime converts color channels once into its linear working space, shader/lighting values are linear floats, and captures encode sRGB. HDR values use a distinct linear-float type rather than overloading sRGB8;
- bounded validators for untrusted or cross-worker data;
- deterministic canonicalization and hashes where caches or golden tests depend on identity;
- diagnostics with stable codes rather than only console strings.

The engine should not expose Three.js vectors, matrices, colors, object references, or callbacks through this layer.

### 2. World description, snapshots, and deltas

Start with explicit whole-world and transaction contracts plus a small operation vocabulary, not a universal scene-graph serialization:

```ts
interface WorldDescriptorV1 {
  readonly schemaVersion: 'voxel.world/1';
  readonly worldId: string;
  readonly epoch: string;
  readonly coordinates: CoordinateConventionV1;
  readonly chunkProfile?: ChunkProfileV1;
  readonly colorEncoding: 'srgb8-straight-alpha';
  readonly limits: RenderLimitsV1;
  readonly capabilities: readonly RenderCapabilityV1[];
}

interface RenderSnapshotV1 {
  readonly schemaVersion: 'voxel.render-snapshot/1';
  readonly descriptor: WorldDescriptorV1;
  readonly revision: number;
  readonly resources: readonly RenderResourceV1[];
  readonly chunks: readonly VoxelChunkV1[];
  readonly batches: readonly InstanceBatchSnapshotV1[];
  readonly pickProxies: readonly PickProxyV1[];
  readonly extensions: readonly ExtensionPayloadV1[];
}

interface RenderDeltaV1 {
  readonly schemaVersion: 'voxel.render-delta/1';
  readonly worldId: string;
  readonly epoch: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly operations: readonly RenderOperationV1[];
}

type RenderOperationV1 =
  | DefineResourceV1
  | RemoveResourceV1
  | UpsertVoxelChunkV1
  | RemoveVoxelChunkV1
  | DefineInstanceBatchV1
  | ReplaceBatchInstancesV1
  | PatchBatchInstancesV1
  | RemoveInstanceBatchV1
  | ReplacePickProxiesV1
  | UpsertExtensionPayloadV1
  | RemoveExtensionPayloadV1;

type ApplyResultV1 =
  | { readonly status: 'accepted'; readonly revision: number }
  | { readonly status: 'rejected'; readonly code: string; readonly path: string }
  | { readonly status: 'resync-required'; readonly expectedBaseRevision: number };
```

A snapshot is a complete replacement for one new world epoch: anything absent is deleted, all resource references must resolve inside the transaction or an approved resolver manifest, and duplicate keys or operations are errors. A delta applies only to the declared epoch and base revision. The runtime validates and bounds the entire snapshot or delta before mutating accepted state; failure is atomic. A gap returns `resync-required` so the adapter can request a full snapshot instead of guessing.

Stable keys include world and generation/incarnation information wherever reuse is possible. Every async result, diagnostic, batch map, remove operation, and pick record carries the same identity. Removing and recreating a chunk or resource under the same logical coordinate creates a new incarnation so an old worker or loader result cannot attach to it.

Ordinary `applySnapshot` and `applyDelta` calls borrow inputs only for the call and copy every typed array retained by the renderer. The canonical `RenderWorld` therefore owns immutable storage needed for edits, neighbor meshing, picking, and context restoration. A separately named advanced ingest path may consume explicitly branded adapter-owned transfer buffers; its detachment semantics are part of the type and must never be used with simulation-owned arrays. Worker jobs receive engine-owned immutable chunk/halo snapshots, and returned mesh buffers transfer into engine ownership. Tests cover post-ingest caller mutation, detachment, cancellation, and stale-result cleanup.

Accepted and presented state are different. Applying a valid transaction advances `acceptedRevision`; each visible resource records the revision and incarnation actually on screen. The runtime retains the old presented occupancy and proxies while replacements build. Presentation acknowledgements always name the full `{worldId, epoch, revision}` tuple; no field defaults from newer accepted state. A voxel dependency closure is staged as one presentation group and swaps its mesh, occupancy, bounds, and pick data together at a frame boundary only when every required result is ready, preventing seams or pick mismatch between old and new neighbor chunks. `presentedThroughRevision` advances only when every operation through that revision is visible or intentionally nonvisual. `awaitPresented(revision)` supports deterministic capture and tests. Interactive picking uses the presented occupancy, transforms, and proxies, never newer accepted data. A non-blocking capture may instead return a manifest listing the exact presented resource revisions it recorded.

Do not put camera controls, selection rules, game commands, or arbitrary Three.js scene nodes in this protocol. Camera intent and interaction are local runtime APIs. Custom visuals receive versioned extension payloads or declared geometry resources through the controlled Three.js extension contract described below.

### 3. Voxel storage and meshing

Use fixed-size chunks with configurable dimensions chosen per world profile. A simple palette-indexed dense typed array is the first storage format; sparse or compressed representations can be added behind the same read interface when measured worlds need them. V1 caps a dense allocation at 16,777,216 cells and requires every absolute chunk boundary to remain in the consecutive-integer Float32 interval `[-16,777,216, 16,777,216]`, because the oracle emits absolute Float32 positions. Larger worlds require rebasing or local chunk meshes plus a bounded translation policy rather than silently collapsing adjacent voxel faces.

The first meshing path is deliberately narrow: opaque voxels, palette or vertex color, and no light propagation, ambient occlusion, or transparent-face merging. Add those only after the opaque contract is correct and measured.

The first path should be:

1. hide faces adjacent to opaque voxels, including across chunk boundaries;
2. emit a simple visible-face mesh as the correctness oracle;
3. merge compatible coplanar faces with greedy meshing as an optimization. The compatibility key includes face orientation, palette/material and opacity class, color, UV/texture layer, and every geometry-affecting attribute;
4. emit indexed typed arrays with positions, normals, palette/material IDs, and deterministic bounds; voxel picks use occupancy data rather than triangle metadata;
5. return counts, world epoch, chunk incarnation, source revision, all dependency revisions, and diagnostics;
6. upload one or a small bounded number of meshes per chunk/material policy.

Every mesher declares its exact voxel halo and geometry-affecting dependencies. The opaque face-culling v1 reads a one-voxel face halo, so a boundary edit, neighbor load/unload, chunk tombstone, opacity-class change, or palette rule change dirties every chunk whose halo changed. A future corner ambient-occlusion mesher must expand that closure across the required face, edge, and corner neighbors. The world descriptor declares whether a missing neighbor is empty, sealed, or unavailable; unloaded and confirmed-empty are distinct states.

The scheduler coalesces repeated dirties, prioritizes visible and near-camera work, limits in-flight jobs, snapshots the complete engine-owned halo, and tags every job with epoch, chunk incarnation, source revision, dependency revisions, and mesher/material policy versions. `enqueueTarget` preflights every dependency group, their combined queue cost, and the simultaneous group-lease budget before making the first target-state mutation, so rejection cannot partially supersede an older target. A result is staged only if every identity and dependency still matches; the full dependency closure swaps as one presentation group at a frame boundary.

Keep the correctness path simple and synchronous for unit tests. The browser runtime may execute the same pure mesher in a packaged worker pool using engine-owned transferable buffers. A browser integration test must prove the worker entry resolves through a built local dependency. Pooling, shared memory, and buffer reuse come only after profiling; canonical storage is never detached merely to save a copy.

Smooth terrain via marching cubes or dual contouring is a separate future mesher, not a flag inside the greedy block mesher. Townscaper's irregular connected shells remain consumer-generated geometry unless a second consumer proves the same topology contract.

### 4. Geometry resources and controlled extensions

Procedural or imported mesh data enters through an explicit resource contract. A data-only `GeometryResourceV1` includes a stable key, incarnation, revision, primitive topology, finite typed attributes, index and material groups, local bounds, pivot/origin convention, and content hash. An empty group list selects the instance batch's one material; explicit groups are topology-aligned, ordered, non-overlapping, gap-free partitions of the index range, with a hard per-resource count cap. Define/remove operations govern its lifetime, and instances reference the handle. Validation rejects unsupported attributes, invalid indices, invalid group partitions, non-finite data, inconsistent bounds, and byte-budget violations before accepted state changes.

This contract lets a Townscaper-owned massing planner keep all topology decisions in Townscaper while publishing deterministic render geometry. It also makes geometry rebuilds, removals, picking bounds, context restoration, and captures revision-aware.

Some existing consumer code constructs `THREE.BufferGeometry` or richer objects directly. The Three adapter may support a registered `GeometryProvider` or `SceneExtension`, but not a raw mutable engine group. A provider receives a versioned data payload and a `ResourceScope`; it returns a keyed geometry/object lease with declared revision, bounds, pick proxies, and restore behavior. The scope exposes controlled attach, `own(resource)`, `borrow(handle)`, frame-subscription, abort, and cleanup registration. It owns its extension root and rejects use after disposal. Extensions cannot access engine caches or attach outside the scope. Context restoration replays the last accepted payload through the provider. Anything deliberately created outside this scope is consumer-owned and explicitly excluded from engine accounting, restoration, capture-readiness, and leak guarantees.

Use a geometry resource when possible; use a scoped provider only when a data-only mesh cannot express the effect economically. Water, fog, particles, and other custom visuals receive revisioned extension payloads through the same accepted/presented rules rather than reading game state behind the engine's back.

### 5. Three.js runtime

The Three.js adapter owns:

- renderer creation, pixel ratio, resize, color management, tone mapping, shadows, frame driving, pause/resume, context loss, and disposal;
- renderer-owned `RenderWorld` projection into chunk meshes, instance batches, asset instances, lights, overlays, effects, and debug helpers;
- geometry, material, texture, asset, shader, and render-target caches with reference ownership and diagnostics;
- perspective and orthographic camera strategies with explicit fit, bounds, world/screen conversion, and optional orbit/map control adapters;
- CPU voxel/heightfield queries and spatial-index picking, plus Three.js raycast or pick proxies for mesh and instance objects;
- a small ordered pass model for opaque world, transparent/water, overlays, and post-processing, without inventing a fully generic render graph in v1;
- revision-aware capture and text/JSON diagnostics for automated playtests. Capture should use an explicit render/readback path and must not silently enable a costly global `preserveDrawingBuffer` policy.

The implemented runtime is externally driven: `frame(frameContext)` lets a host such as AoE's game view control simulation, camera, presentation, and draw ordering. Its injected context contains monotonic `nowMs`, clamped `deltaMs`, and `frameIndex`; manual-clock tests advance time explicitly. Deterministic rendering, animation, and capture code never reads wall-clock APIs behind that contract. A future standalone host may own `start()`/`stop()`, but autonomous scheduling is not part of the current package surface.

The first reusable visual-style policy is deliberately smaller than a post-processing stack. An engine-owned scene may install a configurable daylight rig containing a sky/ground hemisphere fill and one directional key light. The consumer supplies finite sRGB colors, intensities, and a world-space sun offset; the runtime tracks the light target with the current view centre and removes the entire rig during idempotent disposal. A borrowed scene receives no implicit light mutation, but may explicitly request an engine-owned rig. Renderer-constructor choices such as antialiasing remain host options because they cannot be changed after context creation. AoE, City, and Townscaper keep their art palettes, fog, time-of-day meaning, and bespoke effects.

This daylight slice does not claim shadow support. Directional shadow maps require an explicit quality budget, caster/receiver policy, frustum tracking, render-target metrics, context-restoration proof, and borrowed-renderer setting restoration. Those gates precede enabling shadows; ambient occlusion and propagated voxel lighting remain mesher features with their own cross-chunk dependency rules.

Standalone mode creates and owns the renderer and canvas integration. Embedded mode borrows a compatible renderer and scene from an existing Three.js host, attaches one engine-owned root, and uses externally driven frames; it never disposes the borrowed renderer, scene, camera, or canvas. Ownership is declared per handle so a narrow City batch can adopt the package without replacing City's whole composition root.

### 6. Instance batches

Repeated props, units, trees, building modules, decals, and simple effects should use archetype-keyed batches.

Batch definition is separate from instance contents. A definition declares:

- geometry and material or asset handles;
- an archetype key plus spatial shard/region key, maximum spatial extent, capacity, and bounds policy;
- growth policy (`grow` with a maximum, `fixed`, or `truncate-with-diagnostic`);
- transparency, shadow, picking, and disposal policy.

Snapshots replace a batch's complete contents. Deltas can atomically patch upserts and removals by opaque never-reused or generational instance key without retransferring the whole batch. Payloads contain transforms and optional colors/custom attributes; optional previous/current presentation samples carry an explicit tick or time and interpolation policy. Generic rigid-transform interpolation belongs in the engine, while path sampling, skeletal state, and gameplay animation semantics remain consumer or scoped-provider responsibilities.

The first reusable animation slice is deliberately rigid and procedural. An optional batch payload supplies one period, phase, translation amplitude, Euler-rotation amplitude, and fractional-scale amplitude per instance. Arrays are structured-clone-safe, copied on ingest, included in the byte budget, and bounded so malformed motion cannot create non-finite transforms or unbounded scale. The Three presenter samples `sin(2π·nowMs/periodMs + phase)` from the injected frame context, post-multiplies local rotation/scale over the accepted affine base matrix, adds world translation, and updates only animated slots. Conservative motion bounds are computed once per accepted batch version, preserving frustum-culling and raycast broad-phase parity without whole-batch scans each frame. A zero period disables motion for that instance. The sampler never advances hidden time, so the same snapshot and frame time produce the same matrices after rebuild or context restoration.

V1 caps a snapshot at 8,192 active animated slots, caps a batch containing any active motion at 16,384 total slots, and coalesces sparse GPU matrix uploads into at most 64 ranges per batch and frame. These are hard safety ceilings rather than throughput promises; consumers still shard crowds by measured spatial and archetype policy.

The engine does not name idle, walk, attack, gather, horse, villager, or siege clips. AoE owns those mappings and phase relationships; City and Townscaper may choose unrelated motion profiles. Skeletal animation, animation textures, root motion, state machines, and gameplay-event synchronization remain later measured strategies rather than extensions of this harmonic lane.

AoE's first speed-matched gait refinement deliberately does not expand this payload. Its adapter already receives the root position after game-owned interpolation, so it accumulates displayed distance per generational render identity and bakes foot lift, direction-aligned limb pose, and wheel rotation into ordinary base transforms. The consumer injects simulation tick-plus-interpolation time only for displayed speed and bounded start/stop/turn smoothing; distance alone advances gait phase. This makes pause behavior independent of wall time and selection-forced redraws. The harmonic lane continues to serve ambient motion that may proceed without root displacement. The AoE adapter also separates static and animated surface lanes so static scenery does not inherit the active-batch ceiling. These policies keep the engine history-free; City vehicle motion and Townscaper route phases remain free to use their own continuity rules.

The initial implementation can use one `THREE.InstancedMesh` per archetype and spatial shard, which reduces draw calls without turning the entire map into one uncullable object. Keep slot allocation internal. A swap-remove map is efficient, but stable external IDs never expose slot numbers. Moving across shards is one atomic remove/upsert presentation. Capacity, shard extent, and overflow are bounded; changed matrices mark instance buffers and shard bounds dirty, and bounding volumes are recomputed before culling or raycasting.

`InstancedMesh` is a v1 primitive for static or rigidly transformed objects. Independently animated skinned crowds require a later measured strategy such as animation textures, baked vertex animation, or non-instanced actors; the first AoE slice does not promise general skinned instancing.

### 7. Assets and materials

Support GLB/GLTF asset loading through string handles and a cache. Cloning, material overrides, animation ownership, fallback placeholders, failure isolation, aborts, and disposal are engine responsibilities; filenames and game archetypes are consumer concerns.

Use a material registry keyed by a normalized structural description, not ad hoc JSON stringification of mutable objects. The first voxel material uses sRGB8 palette or vertex colors converted once to linear working values; it supports only opaque materials. Texture atlases, transparency, voxel lighting, and ambient occlusion are later measured features. Imported GLTF follows the runtime's explicit Three.js color-management policy. Water, foliage wind, fog-of-war, selection outlines, and game-specific stylization remain scoped adapter extensions until their contracts are proven across consumers.

Do not couple the portable core to `ShaderMaterial`, `onBeforeCompile`, TSL, GLSL, or WGSL. Backend-specific shader source and capability checks live in the runtime adapter.

### 8. Picking and interaction

The engine returns stable pick records such as world position, surface normal, voxel coordinate, object ID, batch ID, and instance ID. It does not decide what a click means.

The first portable query primitive is implemented in `voxel/meshing`: `raycastDensePaletteChunks(options)` performs deterministic Amanatides-Woo traversal over caller-supplied uniform, aligned `DensePaletteChunk` grids. It normalizes direction, treats missing chunks as empty, includes hits at `maxDistance`, defines exact-boundary and tied-axis behavior, and throws when its bounded cell-step budget is exhausted. It returns occupancy identity and geometry only. It is not yet bound to the runtime's presented revision, does not query geometry resources or instance batches, and does not provide spatial acceleration or cross-lane hit priority.

Provide separate strategies:

- voxel DDA ray traversal for chunk worlds;
- indexed surface or heightfield picking for large terrain;
- Three.js raycasting or lightweight proxy geometry for mesh and instance objects;
- data-only AABB, OBB, capsule, and stable-ID proxy sets for logical volumes such as Townscaper stories;
- a scoped consumer ray-query provider for semantics that cannot be represented economically as standard proxies;
- optional screen-rectangle queries for RTS drag selection.

The engine composes results under an explicit priority policy and returns stable IDs; the game interprets them as stories, cells, units, buildings, or tools. Picking reads the same presented occupancy, proxy set, spatial-shard bounds, and interpolated transforms used for the frame. State-based picking is preferred over transient mesh hierarchy names, because batching and rebuilds must not change interaction identity.

### 9. Lifecycle and observability

The runtime has explicit `initializing`, `running`, `lost`, `restoring`, `failed`, and `disposed` states with documented legal operations; `failed` is terminal and records the phase that failed. Context loss fences the active device generation, preserves accepted CPU state, stops presentation and capture, and invalidates device-bound loader/worker completions. Deltas may continue into bounded accepted CPU state while lost, but no presented watermark advances. Restoration creates a new device generation, rebuilds built-in and scoped resources from the latest accepted snapshot, then resumes at a frame boundary. Picking either uses the last internally consistent presented state or returns `not-ready`; capture awaits readiness or returns a typed failure.

Every top-level service exposes idempotent `dispose()`. Disposal stops autonomous scheduling or external frame acceptance, aborts loads, cancels or invalidates worker jobs, removes listeners, disconnects observers, releases controls, removes scene nodes, clears scopes and caches, and disposes owned GPU resources exactly once. No operation except repeated disposal is legal afterward.

Expose structured diagnostics and metrics:

- applied, rejected, missing-base, and stale deltas;
- accepted revision, per-resource presented revisions, presentation groups, and `presentedThroughRevision`;
- dirty, queued, in-flight, completed, and discarded chunk jobs;
- chunks and batches visible, culled, resident, and rebuilt;
- draw calls, triangles, points, lines, programs, geometries, textures, and render targets;
- cache hit/miss/eviction counts;
- frame, update, mesh, upload, and render timings;
- context loss/restoration and fallback events.

Metrics are debugging contracts, not promises that all browsers report identical GPU time.

The cross-game presentation target is 60 Hz, which gives the complete host callback 16.67 ms on a 60 Hz display. This is an acceptance profile, not a universal hardware guarantee. Each result names the deterministic scene, source revision, 1280 by 720 viewport and DPR unless otherwise justified, foreground browser, OS, CPU/GPU, warmup, sample count, and draw/resource metrics. Measure both steady frames and frames that accept new presentation state. Require p95 host work at or below the budget, report p99 and maximum, and verify that positions and headings remain continuous across simulation messages. Raw `requestAnimationFrame` cadence and GPU-complete timings are separate evidence: hidden or headless tabs may throttle callbacks, and `WebGLRenderer.render()` normally measures CPU submission rather than GPU completion.

`voxel/testing` provides a clock-free reporter for externally collected frame samples. It discards an explicit warmup, requires contiguous frame indices, validates the steady/presentation discriminant, and reports aggregate plus per-kind timing and work-budget statistics so rare expensive presentation frames cannot hide inside aggregate percentiles. Percentiles use the nearest-rank convention (`ceil(fraction * count)` in ascending order); p95 and p99 therefore equal the maximum for sufficiently small samples. The report also includes aggregate over-budget ratios and streaks plus a conservative missed-refresh estimate. It never schedules frames, samples wall time, changes quality, or declares a particular machine representative. Consumer-owned adaptive quality may protect the budget, but it must not mutate simulation state or make picking or capture disagree with the presented canvas.

## Backend options

### Option A: Three.js WebGLRenderer first -- recommended

Advantages:

- Matches `city` and `townscaper`, so real renderer code and knowledge can be extracted incrementally.
- Supports their existing strict-TypeScript/Vite/browser toolchains.
- Mature path for custom shaders, controls, GLTF loading, instancing, screenshots, and headless browser tests.
- Keeps the engine small enough to focus on voxel data, meshing, batching, lifecycle, and diagnostics rather than rebuilding a scene library.

Costs:

- AoE2 required a renderer migration from Phaser rather than a package swap; its completed standalone promotion demonstrates the integration cost beyond the package boundary.
- Consumer Three.js versions are currently inconsistent, so the first integration must align them or document and test a narrow supported peer range.
- Three.js does not solve chunk design, topology, revision ordering, game adapters, or resource ownership automatically.

### Option B: Three.js WebGPURenderer and TSL first

Advantages:

- WebGPU-first rendering with a documented WebGL2 fallback.
- Node materials and TSL create a path to portable WGSL/GLSL shader generation and newer post-processing.

Costs:

- Three.js still documents this renderer as experimental.
- Existing `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, and `EffectComposer` paths need migration to node materials and the newer post stack.
- Async initialization, readback differences, capability gaps, and shader migration add risk before shared engine contracts are proven.

Decision: add an experimental backend only after the WebGL vertical slices are stable. Avoid WebGL-only assumptions in portable data, but accept that the first runtime adapter is WebGL-specific.

### Option C: Babylon.js

Advantages:

- A fuller game-oriented engine with maintained WebGL and WebGPU paths, tooling, and many built-in systems.

Costs:

- Rewrites the two current Three.js consumers and prevents straightforward extraction of their existing renderer utilities.
- Would have added a second scene/material/asset ecosystem while AoE2 was already migrating away from Phaser.
- Solves more than this repository is intended to own and increases lock-in.

Decision: reasonable for a new standalone game, but a poor fit for the stated goal of sharing current sibling rendering code.

### Option D: raw WebGPU

Advantages:

- Maximum control over buffers, indirect draws, compute meshing, culling, and future high-end features.

Costs:

- Requires building and maintaining device negotiation, pipeline and bind-group management, shader systems, material conventions, asset upload, render passes, readback, fallback behavior, debugging, and compatibility.
- WebGPU is still not available in every widely used browser, so a production browser engine needs a fallback or narrower support target.
- It delays value in all three games while recreating mature infrastructure.

Decision: do not choose this unless measured production scenes hit a hard ceiling that cannot be addressed inside Three.js.

## Migration and delivery plan

### Delivered adjustment: AoE2 proving slice

On 2026-07-11 the user requested that AoE2 be co-edited first while the design remains reusable for City and Townscaper. The first implementation therefore cuts a narrow vertical path through the phases below rather than claiming each broad phase complete: executable contracts, a visible-face oracle, Three chunk/geometry/instance presenters, and an AoE-owned adapter.

AoE2 initially proved this boundary by composing a Three world canvas behind a transparent Phaser input/overlay canvas under `?renderer=voxel`. On 2026-07-13 that migration completed: AoE now has one standalone interactive Three/`voxel` world canvas, no renderer selector or Phaser dependency/source path, and AoE-owned input, fog, selection, feedback, replay, capture, and lifecycle adapters. The reusable data lanes remain separate: voxel chunks for terrain, geometry resources for consumer-authored topology, and instance batches for repeated rigid objects. This promotion is evidence for the boundary, not permission to move AoE rules or art into the package.

### Phase 0: contracts and executable sandbox

- Scaffold strict TypeScript, ESM plus declaration output, Vitest, Vite, ESLint, Playwright, package exports, a packaged worker entry, and a real `verify` command.
- Choose one canonical `three` and matching `@types/three` release. Make Three optional at the package peer level and external to the build; document linked-consumer `resolve.dedupe: ['three']`, then verify core-only import without Three plus `npm ls three`, constructor identity, and bundle inspection in a runtime fixture.
- Implement the complete world descriptor/snapshot/delta transaction, generational identity, accepted/presented revision, typed-buffer ownership, lifecycle-state, frame-mode, manual-clock, and structured-diagnostic contracts.
- Build one small served sandbox on the production runtime skeleton, not throwaway code, with fixed orthographic and perspective views, explicit capture/readback, text/JSON metrics, resize, context loss, and teardown.
- Add deterministic reference scenes representing an RTS field, a Townscaper-like column cluster, and a City-like terrain/batch scene.

Exit gate: built exports and the worker resolve through a local dependency; core imports without Three; the runtime proves a single Three identity; manual-clock capture, context restore, and teardown tests pass; no consumer migration yet.

### Phase 1: shared runtime primitives

- Harden the Phase 0 runtime skeleton with standalone and embedded ownership modes, cameras, scoped resources/extensions, geometry resources, asset/material caches, spatially sharded instance batches, pick proxies, metrics, and capture policy.
- Extract only policy-neutral utilities whose behavior is already proven in at least one sibling, preserving or recreating their contract tests.
- Prove stable resources and bounds across repeated create/patch/move-shard/remove/dispose cycles and context restoration.

Exit gate: the sandbox exercises the full runtime contracts and a City compile/link fixture proves compatibility. Townscaper integration remains gated on upgrading it to the selected Three.js release rather than claiming an unsafe broad peer range.

### Phase 2: voxel path (completed for 1.0)

- Implemented opaque palette-indexed chunk storage and boundary-aware visible-face meshing as the correctness oracle, then selected the in-repo greedy production mesher after evaluating Voxelize and `block-mesh-rs` against the contract and supply-chain gates. The release also delivered the portable deterministic dense-chunk DDA, indexed halo/invalidation path, packaged worker protocol, bounded scheduler and stale firewall, frozen corpus, revision-atomic runtime groups, committed occupancy binding, production measurements, and chunk pipeline/culling metrics.
- Established correctness fixtures for empty/full/checkerboard/staircase/negative-coordinate/load-unload/neighbor-boundary chunks, palette opacity changes, tombstone/recreate, and adversarial revision races.
- Added named performance scenes and budgets after recording representative baselines.

Exit gate: passed. Editing any dependency-boundary voxel rebuilds the declared minimum closure; old/new neighbors never appear in the same presentation group; picks match displayed occupancy; no stale overwrite or detached canonical storage; stable resources under repeated edits. Transparency, AO, and propagated voxel lighting remain out of scope.

### Phase 3: City consumer proof (completed 2026-07-15)

- Added a City-owned adapter for the opaque building-wall lane.
- Replaced that lane through the engine's embedded, externally driven mode while City retained its terrain, camera, capture, picker, shadow policy, and composition root.
- Verified instance identity, add/update/remove behavior, bounds, culling, visuals, draw calls, update cost, and teardown against City's prior batch.
- Camera/capture adoption, picker adoption, and any terrain change remain separate future consumer work. City's flat land/water mesh is not evidence for volumetric voxel meshing; the worker-meshed chunk path is proven by the engine's deterministic and browser suites.

Exit gate: passed. One playable City building-wall path uses the engine without importing City types into `voxel`, loading a second Three instance, or regressing its visual and performance baseline.

### Phase 4: Townscaper adoption

- Upgrade Townscaper to the selected tested Three.js and type release as a separately verified prerequisite, then add a Townscaper-owned column-world or geometry-resource/provider adapter.
- Reuse engine lifecycle, manual clock, caches, batching, logical pick proxies, metrics, and capture while keeping connected massing and art-direction rules local.
- Begin with full-rebuild parity, then replace measured hotspots with dirty-region updates.

Exit gate: a representative town matches structural and visual expectations with stable resource counts and no public debug/export regressions.

### Phase 5: AoE2 3D vertical slice (completed 2026-07-13)

- Introduced the AoE-owned `AoeVoxelGameView` facade and then promoted it to the sole host for frame ordering, renderer-neutral camera/input, bridge swapping, and browser-test APIs.
- Kept orientation, archetype identity, palette, rigid animation, effects, and elevation semantics in AoE's projected contract; the current terrain presentation deliberately remains flat at elevation zero.
- Rendered chunked terrain, multi-part rigid units, buildings, resources, fog, selection, placement, health, and transient feedback through the orthographic adapter while keeping picking proxies AoE-owned.
- Preserved the DOM HUD and minimap, bridge replacement, replay, smooth display interpolation, direct capture, context-loss handling, and headless browser behavior.

Exit gate: passed. The playable Three/`voxel` host became the only world-renderer path without changing authoritative simulation results; the Phaser dependency, source path, selector, fallback, and second world canvas were removed.

### Phase 6: measured advanced features

Consider LOD, occlusion culling, texture arrays, cascaded shadows, GPU-driven particles, streaming, WebGPU/TSL, smooth terrain, or indirect draws only when named scenes and profiler evidence justify them.

## Main difficulties

### Choosing the right abstraction

The central risk is not drawing cubes. It is creating a contract broad enough for chunk terrain, irregular Townscaper shells, City-scale instancing, and RTS units without embedding one game's world model or building a lowest-common-denominator scene graph. Vertical slices in two consumers are the test of this design.

### Chunk correctness and latency

Neighbor faces, transparency, palette changes, ambient occlusion, lighting, and edits at chunk borders expand invalidation. Worker jobs can finish out of order. The solution is explicit neighbor dependencies, coalesced dirties, revision-tagged jobs, stale-result rejection, and fixtures that exercise every boundary.

### Resource lifetime

Geometry rebuilds, capacity growth, shader variants, texture loads, context loss, aborted scenes, and hot reload can leak GPU resources or listeners invisibly. Ownership and teardown must be part of every public type and tested across repeated cycles.

### Transparency, water, fog, and overlays

All three target games need effects whose ordering and readability are more difficult than opaque cubes. Transparent sorting, water shaders, fog-of-war memory, selection outlines, health bars, and occlusion cues should use explicit passes/extensions and real scene tests rather than a single magical material system.

### Picking parity

Batching, interpolation, tall geometry, irregular surfaces, and transparent overlays make mesh-identity picking unreliable. Stable IDs plus specialized spatial queries must agree with what is displayed, including between simulation ticks.

### Visual regression stability

GPU and browser rasterization is not perfectly deterministic across machines. Use structural geometry and metric tests for hard correctness, and tolerance-based screenshots on a controlled browser/software-renderer lane for visual change detection. A pixel diff is evidence, not the only oracle.

### Consumer and dependency drift

The Three-native consumers still require deliberate version alignment. AoE2 and City's adopted building-wall lane use the package's supported Three line and verify one production runtime identity; Townscaper remains separate alignment and adoption work. A peer declaration alone does not prevent linked Vite builds from duplicating Three, so each future adoption still needs externalization, consumer deduplication, runtime identity checks, and an intentional public API policy.

### Asset and art-direction work

A graphics engine cannot manufacture a coherent art style. AoE2's completed renderer migration demonstrates that moving from 2D procedural sprites to readable 3D units/buildings is at least as much an asset, animation, camera, fog, and readability project as an engine integration.

## Achievability

The scoped toolkit is highly achievable. A custom universal renderer that replaces Three.js is not justified.

Approximate focused full-time-equivalent ranges, intended as planning bands rather than commitments:

| Outcome | Feasibility | Rough range | Why |
|---|---:|---:|---|
| Contracts, packaging, runtime skeleton, clocks, capture, lifecycle | High | 2-4 weeks | Familiar stack, but ownership and presented-state tests are real work |
| Spatial batches, scoped resources, assets, picking primitives | High | 3-6 additional weeks | Existing sibling patterns reduce design risk; bounds and teardown need browser proof |
| Opaque chunk store, mesher, worker scheduling, atomic presentation, voxel picking | High but technical | 4-8 additional weeks | Algorithms are known; halo, race, packaging, and parity coverage take care |
| First narrow City building-batch integration | High | 1-3 weeks | Same stack and already clean snapshot boundary; no terrain/camera migration |
| Townscaper version alignment and shared-runtime adoption | Medium-high | 4-10 weeks | Many reusable patterns, but version drift and product-specific geometry/effects add risk |
| AoE2 playable standalone 3D vertical slice | Complete | Delivered 2026-07-11 to 2026-07-13 | The simulation seam held; AoE now owns projection, procedural visuals, fog, silhouette picking, and readability around one Three/`voxel` world canvas |
| Production-grade multi-game toolkit with LOD, streaming, polished effects, broad compatibility | Medium | 6-15 months total | Integration, profiling, art pipelines, and long-tail lifecycle issues dominate |
| Raw WebGPU engine with comparable facilities | Low for the current goal | Multi-year risk | Rebuilds a mature renderer ecosystem before proving shared value |

The original success criterion for roughly the first 10-21 focused full-time-equivalent weeks was not "all games use voxel." It was: the production sandbox proves packaging, lifecycle, capture, spatial batching, and the opaque voxel path; one City building batch uses the embedded runtime; chunk-boundary edits present atomically without stale results or pick mismatch; and no game-specific type leaks into the package. The formal 1.0 roadmap delivered that boundary through fixed-page batches rather than public spatial sharding; spatial sharding remains future work. Townscaper adoption remains post-1.0 behind its explicit Three.js alignment prerequisite.

## Current recommendation

The recommendation remains narrow: maintain reusable rendering infrastructure and an optional true-voxel module on top of Three.js rather than expanding into a whole-game port or universal plugin system.

The bounded AoE2 proving slice and standalone promotion are complete, without moving AoE concepts into the package, and City's building-wall lane now proves the embedded runtime while remaining City-owned. Townscaper adoption through consumer-generated geometry resources and batches remains future work after Three-version alignment. The two delivered consumer proofs validate the boundary; they do not imply that future migrations are automatically small.

## Non-normative references

- Three.js `InstancedMesh`: <https://threejs.org/docs/pages/InstancedMesh.html>
- Three.js `WebGLRenderer`: <https://threejs.org/docs/pages/WebGLRenderer.html>
- Three.js `WebGPURenderer` overview and migration constraints: <https://threejs.org/manual/en/webgpurenderer>
- Vite linked-dependency deduplication: <https://vite.dev/config/shared-options.html#resolve-dedupe>
- MDN WebGPU API support and model: <https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>
- Babylon.js WebGPU support: <https://doc.babylonjs.com/setup/support/webGPU/>
- Voxelize full-stack voxel engine: <https://github.com/voxelize/voxelize>
- `block-mesh-rs` visible-face and greedy meshing: <https://github.com/bonsairobo/block-mesh-rs>
- Taichi.js WebGPU compute project: <https://github.com/AmesingFlank/taichi.js>
- Three.js `VOXLoader`: <https://threejs.org/docs/pages/VOXLoader.html>
- `three-mesh-bvh`: <https://github.com/gkjohnson/three-mesh-bvh>
- meshoptimizer and gltfpack: <https://github.com/zeux/meshoptimizer/tree/master/gltf>
