# Voxel graphics engine design

Status: the V1 vertical slice was implemented on 2026-07-11. This document records the original architecture and option analysis; it is not a claim that every proposed section exists. The shipped surface is bounded snapshots, an oracle mesher, a deterministic dense-chunk occupancy ray query, and a Three.js WebGL runtime, proven first through AoE2. Forward work toward a stable release is governed by the [1.0 roadmap](../plans/v1-roadmap.md), [target architecture](v1-architecture.md), and [implementation plan](../plans/v1-implementation.md).

## Decision summary

Build a browser-first, voxel-first rendering toolkit in strict TypeScript, using Three.js `WebGLRenderer` for the first production backend.

The toolkit should be voxel-first rather than voxel-only. A dense or sparse block world needs chunk storage and meshing, but the target games also need instanced units, procedural building shells, imported GLB assets, water, overlays, particles, and UI-compatible picking. Forcing all of those through a cube grid would make the shared engine less useful.

Use one package with subpath exports during the first implementation:

- `voxel/core` for game-neutral data contracts, coordinate conventions, IDs, revisions, and bounded validation;
- `voxel/meshing` for Three-free voxel storage, dirty-region tracking, deterministic mesh generation, and voxel raycasts;
- `voxel/three` for the scene runtime, resource caches, chunk meshes, instanced batches, cameras, picking bridges, assets, render passes, and capture;
- `voxel/testing` for reference scenes, structural assertions, browser capture helpers, and render metrics.

Split these into independently versioned workspace packages only if real release or dependency pressure appears. In the one-package form, `three` is an optional peer declared through `peerDependenciesMeta`, externalized from the library bundle, and required only by `voxel/three`; core and meshing entry points and declarations must not reference it. Phase 0 chooses one tested `three` plus matching `@types/three` release, aligns consumers before integration, configures linked Vite consumers with `resolve.dedupe: ['three']`, and verifies the bundle contains exactly one Three.js runtime. Do not advertise a broad 0.x peer range without a real compatibility matrix.

Keep WebGPU as a later experimental backend. The portable data plane and Three-free mesher should not prevent it, but MVP APIs should not pretend that WebGL and WebGPU shaders, post-processing, readback, and lifecycle behavior are interchangeable.

The delivered 0.1 slice is governed by the durable [architecture decisions](../architecture/decisions.md), [ecosystem review](../research/ecosystem.md), and [cross-game implementation ledger](../plans/implementation.md). Those documents record the selective build-versus-adopt boundary and the user-requested AoE2-first proving slice. The separate 1.0 documents are authoritative for future scope and ordering.

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

`city` is the closest next Three-native consumer. Its simulation runs in a worker and emits structured-clone-safe render views; its renderer already uses Three.js, instanced buildings, vehicles, structures, trees, texture overlays, renderer-side interpolation, and versioned road geometry.

The reusable ideas are the simulation/render boundary, revision-aware updates, growable or capped instance pools, sparse overlays, renderer-owned interpolation, explicit draw-call budgets, and ground/preview picking.

City-specific roads, zones, utilities, RCI colors, building rules, and protocol messages must remain in `city`. Its existing lifecycle also demonstrates a gap the shared runtime should close: top-level views need comprehensive, idempotent teardown for render loops, listeners, controls, meshes, materials, textures, and workers.

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

The runtime has explicit `initializing`, `running`, `paused`, `lost`, `restoring`, and `disposed` states with documented legal operations. Context loss fences the active device generation, preserves accepted CPU state, stops presentation and capture, and invalidates device-bound loader/worker completions. Deltas may continue into bounded accepted CPU state while lost, but no presented watermark advances. Restoration creates a new device generation, rebuilds built-in and scoped resources from the latest accepted snapshot, then resumes at a frame boundary. Picking either uses the last internally consistent presented state or returns `not-ready`; capture awaits readiness or returns a typed failure.

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

### Phase 2: voxel path

- Implement opaque palette-indexed chunk storage and boundary-aware visible-face meshing as the correctness oracle, then bake off Voxelize's mesher and `block-mesh-rs` before selecting or implementing greedy optimization. The portable deterministic dense-chunk DDA, indexed halo/invalidation path, packaged worker protocol, bounded scheduler/stale firewall, frozen corpus, and provisional in-repo greedy selection are now implemented. Revision-atomic runtime groups, committed occupancy binding, final production measurements, and chunk pipeline/culling metrics remain open.
- Establish correctness fixtures for empty/full/checkerboard/staircase/negative-coordinate/load-unload/neighbor-boundary chunks, palette opacity changes, tombstone/recreate, and adversarial revision races.
- Add named performance scenes and budgets only after recording representative baselines.

Exit gate: editing any dependency-boundary voxel rebuilds the declared minimum closure; old/new neighbors never appear in the same presentation group; picks match displayed occupancy; no stale overwrite or detached canonical storage; stable resources under repeated edits. Transparency, AO, and propagated voxel lighting remain out of scope.

### Phase 3: first real consumer -- City

- Add a City-owned adapter.
- Replace one existing growable building instance batch through the engine's embedded, externally driven mode. Keep City's current terrain, camera, capture, picker, and composition root unchanged for this slice.
- Compare instance identity, add/update/remove behavior, bounds, culling, visuals, draw calls, update cost, and teardown against the current batch before expanding scope.
- Treat camera/capture adoption, picker adoption, and any terrain change as separate later slices. City's current flat land/water mesh is not a meaningful proof of volumetric voxel meshing; prove chunks in the 3D sandbox first.

Exit gate: one playable City building path uses the engine without importing City types into `voxel`, loading a second Three instance, or regressing its visual and performance baseline.

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

The Three-native consumers still require deliberate version alignment. AoE2 now uses the package's tested Three line and verifies one production runtime identity, while City and Townscaper remain separate alignment/adoption work. A peer declaration alone does not prevent linked Vite builds from duplicating Three, so adoption still needs externalization, consumer deduplication, runtime identity checks, and an intentional public API policy.

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

The best success criterion for roughly the first 10-21 focused full-time-equivalent weeks is not "all games use voxel." It is: the production sandbox proves packaging, lifecycle, capture, spatial batching, and the opaque voxel path; one City building batch uses the embedded runtime; chunk-boundary edits present atomically without stale results or pick mismatch; and no game-specific type leaks into the package. Townscaper adoption follows its explicit Three.js alignment prerequisite rather than being forced into this first milestone.

## Current recommendation

Proceed, but keep the promise narrow: build reusable rendering infrastructure and an optional true-voxel module on top of Three.js. Do not begin by porting a whole game or designing a universal plugin system.

The bounded AoE2 proving slice and standalone promotion are complete, without moving AoE concepts into the package. Next prove one City embedded instance batch, then bring Townscaper in through geometry resources and batches after Three-version alignment. AoE2's delivery is evidence for the boundary, not evidence that future consumer migrations are automatically small.

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
