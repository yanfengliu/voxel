# Cross-game implementation plan

Status: historical/current-0.1 delivery ledger from 2026-07-11. The first working package and AoE2 standalone consumer are delivered. New work toward a stable release is tracked in the [1.0 roadmap](v1-roadmap.md), [target architecture](../design/v1-architecture.md), and [1.0 implementation plan](v1-implementation.md). Preserve this file as evidence of the proving slice; update a checkbox only when its named evidence exists.

## Outcome

Deliver and extend an executable `voxel` package while preserving contracts needed by City and Townscaper. The playable AoE2 isometric-voxel slice and its promotion to a standalone sole renderer are complete.

The first slice succeeded with the following evidence:

- `voxel/core`, `voxel/meshing`, `voxel/three`, and `voxel/testing` resolve from built output;
- ordinary ingest copies retained typed arrays, invalid snapshots fail atomically, and accepted state is staged until an explicit frame boundary;
- one AoE seed renders terrain through voxel chunks and renders units, buildings, and resources through geometry resources plus instance batches;
- the AoE adapter contains all AoE semantics, with stable `id:generation` keys and a renderer epoch reset on bridge replacement;
- AoE-owned fog, selection, placement, health, input, replay, HUD, and browser hooks remained functional through promotion, after which the Phaser source, dependency, selector, fallback, and second world canvas were removed;
- fixed 800x600 before, after, and pixel-diff evidence plus structural metrics are recorded;
- dependency audits and both repositories' complete applicable gates pass.

## Phase A: durable contracts and executable package

- [x] Scaffold strict TypeScript, ESM/declaration output, Vitest, ESLint, package subpath exports, package preparation, and a single `verify` command.
- [x] Declare narrow optional peers for Three runtime/types; test `three` `0.185.1` and `@types/three` `0.185.0`; keep Three external to portable entry points.
- [x] Define bounded V1 world, epoch, revision, coordinate, palette, voxel-chunk, geometry-resource, material, instance-batch, snapshot, and apply-result contracts.
- [x] Implement atomic snapshot validation and owned copies of every retained typed array, including detached-buffer, overlap, group, bounds, and byte/output guards.
- [x] Implement accepted versus successfully rendered frame-boundary presentation, world+epoch namespacing, and idempotent disposal.
- [x] Add deterministic unit tests for invalid input, mutation after ingest, world/epoch replacement, revision ordering, backend rejection, and resource replacement.
- [x] Add a packed portable-consumer fixture: `npm run test:core-only-package` installs the actual tarball offline into a fresh temporary consumer, proves Three and consumer-local TypeScript are absent, imports `voxel/core`, `voxel/meshing`, and `voxel/testing` from installed `dist`, compiles their installed declarations with the repository TypeScript CLI, and removes the fixture in `finally`.

Exit gate: package builds from a clean checkout and `npm run verify` passes; no consumer types appear in declarations.

## Phase B: replaceable voxel and Three.js presentation paths

- [x] Implement dense palette chunks and a pure visible-face oracle mesher with neighbour sampling, deterministic typed output, and a hard face budget.
- [x] Add fixtures for empty, single, adjacent, solid, boundary-neighbour, negative-origin, deterministic-repeat, and budget-exhaustion chunks.
- [x] Export a Three-free deterministic `raycastDensePaletteChunks` DDA over uniform aligned dense chunks, with normalized direction, inclusive distance, negative-coordinate and seam coverage, exact-boundary/tied-axis rules, and an explicit cell-step budget that throws rather than returning a false miss.
- [x] Implement Three presenters for chunks, geometry resources, grouped materials, and stable-key instance batches with dependency rebinding.
- [x] Add a parameterized orthographic 2:1 isometric view, explicit frame/readback capture, metrics, resize, context-loss fencing, and idempotent teardown.
- [x] Add a repeated engine-owned real-WebGL rebuild/dispose lane: the headless fixed-view reference runs six renderer lifecycles and 20 forced resource revisions per lifecycle, checks accepted/presented ordering, stable nonzero geometry and shader-program counts, the intentional zero-texture baseline, direct post-dispose Three counters, draw/triangle metrics, capture, idempotent teardown, terminal rejection, request/console warnings and errors, explicit test-context loss, and owned server/browser cleanup.

Exit gate: a fixed reference scene reports deterministic topology and resource metrics; simple meshing is explicitly the oracle, not the planned advanced backend.

## Phase C: AoE-owned adapter and reversible composition (completed historical proving step)

- [x] Write the matching AoE design and plan under `docs/threads/current/voxel-renderer-migration/` before code changes.
- [x] Add opt-in `?renderer=voxel`, safe-default `?renderer=phaser`, and a deterministic two-canvas stack.
- [x] Project terrain elevation and fog-memory generations without changing simulation/save behavior; deliberately flatten elevation in the composed adapter until overlays/input share a heightfield contract.
- [x] Map terrain to chunks; map game-owned blocky archetype recipes to geometry resources; map displayed entities to instance batches using `id:generation`.
- [x] Synchronize the Three orthographic camera to the existing Phaser 2:1 camera while keeping Phaser input and overlays.
- [x] Reset the renderer epoch on bridge replacement and dispose all Three resources/canvas state on shutdown.
- [x] Provide explicit-readback composite capture so annotations and automated evidence contain both canvases without `preserveDrawingBuffer`.

Exit gate: the named seed is playable under `?renderer=voxel`; selection, commands, marquee, pan/zoom, fog, save/load, replay, capture, and teardown pass targeted browser tests.

## Phase D: promotion and cross-game proof

- [x] Compare controlled tick-one 800x600 before/after screenshots and structural metrics; the reviewed slice is nonblank and aligned on the flat input plane.
- [x] Run adversarial code review and resolve every substantive finding; the animation review closed affine composition, Float32 headroom, workload caps, conservative bounds, full-versus-partial uploads, and sparse-range command bounds.
- [x] Promote AoE to one standalone voxel-only Three host after raised-object picking, selection/commands, capture, context-loss, lifecycle, and browser gates pass; remove the renderer selector, Phaser source/dependency, and fallback canvas.
- [ ] Integrate one City instance batch through embedded mode without replacing City's terrain or composition root.
- [ ] Upgrade Townscaper to the tested Three line, then prove one geometry-resource/full-rebuild slice while its topology stays local.
- [ ] Run the Voxelize versus `block-mesh-rs` mesher bake-off before implementing greedy meshing.

Exit gate: at least two games exercise the public package without game-specific types leaking into it.

## Active visual-quality increment: reusable daylight plus AoE vocabulary

- [x] Add a typed engine-owned daylight rig with validated sky, ground, sun, intensity, and offset inputs.
- [x] Track the directional target with `setView`, preserve the no-implicit-mutation rule for borrowed scenes, prove idempotent teardown, and roll back both owned and borrowed constructor failures transactionally.
- [x] Keep renderer creation flags such as antialiasing consumer-controlled; do not add speculative post-processing or shadow parity.
- [x] Let AoE use the shared rig while keeping faction palettes, building/unit/resource recipes, terrain decoration, fog, selection, and animation meaning in AoE.
- [x] Record fixed-camera before/after/diff evidence plus draw-call, instance, and resource budgets before calling the increment complete. AoE's controlled tick-zero frame uses 1,000 instances, four batches, eight draw calls, 16,632 triangles, five materials, and one geometry resource.

Exit gate: unit tests prove rig validation, target tracking, borrowed-scene behavior, and cleanup; AoE's controlled voxel scene is visibly richer without game semantics entering this package.

## Active rigid-animation increment: harmonic instance motion plus AoE block rigs

- [x] Add an optional bounded `InstanceTransformAnimationV1` payload to rigid instance batches without breaking static V1 snapshots.
- [x] Copy and validate every animation typed array, include it in the snapshot byte budget, reject non-finite or unsafe amplitudes/periods/matrices, and preserve atomic ingest.
- [x] Sample translation, Euler-rotation, and fractional-scale harmonics only from `ThreeFrameContext.nowMs`; never read wall-clock APIs or integrate hidden mutable time.
- [x] Update only animated instance matrices at frame boundaries, preserve full uploads after reconciliation, bound/coalesce partial uploads, compute conservative picking/culling bounds, expose animated-batch/instance/update metrics, and restore base matrices when motion disappears.
- [x] Prove deterministic phase sampling, affine shear/zero-scale preservation, context-loss fencing, revision replacement, idempotent disposal, and unchanged static-batch behavior.
- [x] Let AoE map the neutral motion lane onto original block-rig idle and locomotion poses while keeping unit roles, part names, gait amplitudes, memory policy, and gameplay animation meaning in AoE.
- [x] Record a same-camera, paused-simulation two-phase browser comparison showing pixels change while accepted/presented revisions stay fixed, plus bounded draw/resource/animation metrics.

Exit gate: rigid procedural parts animate continuously under the injected frame clock without per-frame world snapshots, static objects remain bit-for-bit stable, and no AoE, City, or Townscaper semantic enters the package. Skeletal meshes, clip graphs, root motion, attacks, gathering, and simulation timing remain separate measured work.

## Consumer proof: AoE speed-matched gait without a new engine schema

- [x] Trace AoE's live presentation path and confirm the adapter receives already-interpolated displayed positions at render cadence.
- [x] Keep stride length, displayed-speed estimation, gait history, foot planting, limb pairing, wheel rotation, and transition smoothing in the AoE-owned adapter and recipes.
- [x] Advance locomotion pose by displayed distance and bake it into ordinary instance base matrices; retain the harmonic payload only for independent ambient motion.
- [x] Preserve generational identity, disappearance/memory reset, bridge-epoch reset, clock-rewind reset, deterministic replay inputs, and non-penetrating planted feet in AoE tests.
- [x] Prove simulation-display-time pause invariance, eased travel headings, X/Z/diagonal pitch alignment, transformed-corner foot clearance, static/animated lane separation, and a targeted browser gait diagnostic in the consumer.
- [x] Decline a new externally sampled pose or gait state-machine contract until City or Townscaper proves the same neutral data requirement.

Exit gate: the shared package remains unchanged and history-free while the AoE consumer demonstrates speed-matched rigid locomotion through existing snapshots. This is evidence for the current boundary, not a claim that skeletal or clip animation is complete.

## Active 60 Hz motion-quality increment

- [x] Define the 60 Hz target as a named reference-scene contract with a 16.67 ms full host-frame budget rather than an arbitrary-hardware guarantee.
- [x] Add a pure `voxel/testing` reporter for warmup-bounded frame samples, p50/p95/p99/max timing, over-budget ratios and streaks, and missed-refresh estimates without adding a runtime scheduler or wall-clock dependency.
- [x] Prove AoE exact-tick root interpolation when one browser frame advances multiple simulation ticks, interpolate moving fine-grid wildlife, and rotate the complete voxel actor through its eased travel heading.
- [x] Raise Townscaper's deliberate live-loop cap from 20 Hz to 60 Hz and prove its existing distance-sampled pedestrian positions and blended corner headings remain continuous.
- [x] Preserve City's 60 Hz renderer policy while easing vehicle yaw through the shortest arc from the actually presented pose.
- [ ] Record fixed-scene browser evidence for all three games with named environment metadata, host-frame percentiles, draw/resource stability, and no positional or angular discontinuity. AoE and Townscaper have passing named evidence. City has two recorded production runs with 59.2-60.0 FPS, 16.8-17.5 ms p95 cadence, and 0.9-1.1 ms p95 callback work, but its stricter p99/consecutive-miss gate is not repeatably green and the final browser discontinuity probe remains open.

Exit gate: the named reference profiles meet their measured 60 Hz budget, every moving actor updates continuously between simulation messages and faces travel through bounded turns, and no game movement semantics enter the shared package.

## Explicitly deferred

- Runtime-owned presented-state voxel picking, geometry/instance hit composition, cross-lane priority, and spatial acceleration; the portable dense-chunk occupancy DDA is implemented but intentionally unbound.
- General skeletal crowd animation, animation textures, clip graphs, root motion, and gameplay-event synchronization.
- Greedy/WASM/worker meshing, AO, propagated light, transparent voxel merging, liquids, and block-model registries.
- Smooth-terrain Surface Nets or Transvoxel, WebGPU/TSL, LOD, streaming, indirect draws, and GPU-driven particles.
- Shadow maps until caster/receiver, frustum, metrics, borrowed-renderer restoration, context-loss, and teardown policies are executable.
- City road policy, Townscaper massing/facade rules, or AoE selection/fog/command policy in the shared package.
