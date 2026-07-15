# Changelog

## Unreleased

- Added the authoritative Voxel 1.0 roadmap, target architecture, executable implementation plan, and support/distribution policy.
- Added a committed declaration/API compatibility report and CI jobs for Node 22 Windows/Linux complete verification, Node 24 portable compatibility, dependency audits, and package inspection.
- Bounded the packed build payload to emitted ESM and declarations, disabled source-map directives/maps so the tarball is self-consistent, and added hard 350,000-byte packed and 1,700,000-byte unpacked gates. The resulting API-report hash update changes declaration emission only, not exported TypeScript semantics.
- Added prepared Three snapshot ingest, defensive public RenderWorld accessors, presentation reuse, and mutable borrowed-scene isolation; fixed-page canonicalization still performs a second batch-array copy and remains open F-05 work.
- Added snapshot validation-copy telemetry for inspected/copied bytes and copy operations, defensive exports, current/peak canonical retention, and presentation staging; fixed-page paging copies are not yet folded into the public ingest-copy counters, and deterministic RenderWorld read/reset hooks live under `voxel/testing`.
- Added exact TypeScript 5.7.3, 5.9.3, and 6.0.3 declaration fixtures plus an executable City-shaped sparse building lane using a borrowed renderer/scene, perspective camera, sparse generational deltas, host-owned frame/capture/viewport flow, neutral shadows, bounds, and ownership-safe teardown.
- Added the additive `voxel.render-delta/1` contract, stable delta issue-code table, descriptor transaction budgets, immutable canonical lane indexes/tombstones, and atomic `acceptDelta` paths in RenderWorld and ThreeRenderRuntime.
- Added deterministic put/remove operations for resources, chunks, and batches plus keyed instance patching, ordered resync results, final-graph validation, backend-atomic rejection, operation-order independence, and delta copy/retention telemetry.
- Added fixed-size copy-on-write instance pages, exact sparse presenter ranges, reentrancy-safe presentation commits/waiters, and cumulative matrix/color/range upload metrics. Sparse patches no longer materialize or upload an entire unchanged batch.
- Added optional per-batch cast/receive-shadow participation; omission remains neutral and Voxel does not create or configure a shadow system.
- Added indexed uniform voxel profiles, O(1) chunk/neighbor identity, exact dirty closures, frozen mesher contracts/corpus, and a budgeted local-space indexed oracle that removes the fixed 512-chunk limit for profiled worlds.
- Added the packaged Three-free `voxel.mesh-worker/1` module, copied job-owned transfer buffers, validation on both sides, offline/CSP-relative loading, startup-failure handling, a browser-bundler launcher under `voxel/meshing/browser-worker`, a bounded deterministic scheduler, atomic group staging leases, coalescing/cancellation, one crash retry, a timer-free unproven-generation startup circuit with one half-open probe, real Chromium async module-failure/teardown evidence, and receipt/completion/precommit stale-result firewalls.
- Added `VoxelMeshSchedulerV1.enqueueTarget` for all-or-none admission of one revision's dependency groups, including combined queue and simultaneous staging-lease preflight before older work is superseded. The additive `enqueueReplacingEpochTarget` form performs the same complete preflight before it retires the prior epoch or refreshes workers.
- Added an internal revision-atomic target coordinator that joins whole-target worker admission, deterministic multi-group completion, off-scene Three staging, supersession and epoch fencing, zero-job targets, generation-aware worker-crash retry/failure routing, terminal cleanup, and retryable idempotent worker/stager disposal. A bounded internal browser-worker driver now owns generation-captured ports and listeners, reserves an in-order fail-closed crash receipt per worker under one strict queue cap, queues delivery without scheduler reentrancy, preserves message-before-error order, advances the coordinator once per cycle, and retries scoped teardown before same-slot replacement. The legacy runtime centralizes its root, presenters, animation, metrics, reset, and disposal behind one presentation-surface owner. Runtime adoption, atomic frame integration, and browser evidence remain open. The callable Three API is unchanged, while its declaration hash records TypeScript's private-field layout change.
- Added a palette-preserving greedy opaque mesher candidate, shared oriented-face correctness corpus, installed worker execution, reproducible benchmark harness/evidence, package-closure budget, external feasibility audit, and provisional production selection ADR. Revision-atomic runtime integration remains the final acceptance gate.
- Added isometric, owned-perspective, and borrowed-camera policies; explicit viewport ownership; finite-safe projection/ray helpers; and an immutable Three capability report that truthfully includes runtime-rendered and embedded host modes while keeping worker presentation, picking, revision-aware capture, and full GPU reconstruction disabled until their runtime gates land.
- Added host-managed single-use frame tickets with prepare/commit/abort, exact canonical target tokens, reentrancy/device fences, rollback, standalone protocol reuse, host-owned draw/capture/viewport policy, and immutable frame/camera/viewport manifests.
- Added bounded plain presented-picking query/result contracts and internal voxel/instance paths with full frame/generational identities, hard voxel/instance/primitive work caps, typed budget/lifecycle outcomes, robust rays, exact group materials, and deterministic distance/lane/stable-identity ordering; committed runtime-store exposure remains a staged milestone.
- Added the initializing/running/lost/restoring/failed/disposed runtime state machine, stable failure codes, exact waiter integration, generation fences, and transactional initialization/resize; full GPU resource reconstruction remains an open H-05 milestone.
- Added `VoxelMeshSchedulerV1.preflightTarget` and `preflightReplacingEpochTarget`, which validate complete target admission — budgets, duplicates, stale precedence, and epoch policy — without enqueueing, superseding, or cancelling any prior work. An `admissible` verdict is a reservation-grade prediction for two-phase runtime admission; activation still runs the real preflighted enqueue. Internal revision-atomic work also added the cross-layer frame transaction joining canonical presentation tickets, staged Three scene leases, and a reversible committed pick-snapshot publication owner, so a rendered revision commits across the visible, canonical, and query lanes atomically or the prior displayed revision is preserved.
- Integrated the revision-atomic voxel worker pipeline into `ThreeRenderRuntime` behind a package-internal construction option: accepted profiled snapshots and deltas reserve worker admission before the canonical commit and activate it after, frames advance worker events and commit each ready target through the cross-layer transaction after its draw, draw failure preserves the prior displayed and canonical revision, mid-draw reentrant acceptance is refused while a presentation is in flight, and re-admission of a lost pending target is bounded before the runtime fails explicitly. Atomic runtimes reject unprofiled candidates and embedded hosts until those integrations land, and the public callable API is unchanged while the runtime declaration hash records TypeScript private-field layout.

Migration: snapshot and delta schemas remain additive. The pre-1.0 `RendererLike` boundary now requires `getSize(Vector2)` and `getPixelRatio()` so a borrowed runtime-owned viewport can be rolled back exactly if construction fails; Three.js `WebGLRenderer` already implements both. Custom renderer test doubles and adapters must add those two methods. `MeshSchedulerConfigV1` adds the optional `maxConsecutiveUnprovenWorkerFailures` limit (default 2), exhaustive consumers of `workerCrashed` must handle the new `worker-unavailable` result, and scheduler metrics add unproven-crash, circuit-trip, and open-slot fields. See [the consumer integration guide](docs/guides/consumer-integration.md) and [the 0.2 foundation migration note](docs/guides/v0.2-foundations.md).

## 0.1.4 - 2026-07-13

- Added the Three-free `raycastDensePaletteChunks` query with normalized-distance hits, exact grid-boundary and simultaneous-crossing rules, negative-coordinate and chunk-seam coverage, and a bounded visited-cell guard.
- Added an allocation-fresh V1 renderer-lifecycle reference scene plus a headless real-WebGL endurance gate covering 120 forced resource revisions across repeated create, capture, idempotent-dispose, and terminal-operation cycles.
- Hardened the packed portable-consumer gate to install without Three, import `voxel/core`, `voxel/meshing`, and `voxel/testing`, and compile their installed declarations without renderer dependencies.
- Reconciled the active documentation with AoE2's completed promotion to a sole Three/`voxel` renderer while keeping the former Phaser composition as dated history.

## 0.1.3 - 2026-07-13

- Added the clock-free `createFrameBudgetReport` helper under `voxel/testing` for comparable consumer-owned frame evidence.
- Reported nearest-rank p50/p95/p99/max timing, steady versus presentation-frame costs, over-budget ratios and streaks, and estimated missed refreshes after an explicit warmup.
- Kept scheduling, wall-clock sampling, hardware acceptance, and adaptive-quality policy in consumers rather than the reusable package.

## 0.1.2 - 2026-07-12

- Added optional copied and validated `InstanceTransformAnimationV1` arrays for deterministic harmonic translation, local rotation, and scale offsets over rigid instance batches.
- Sampled motion only from injected frame time, with static-slot stability, base-matrix restoration, context-loss fencing, and cumulative animation metrics.
- Preserved affine shear and zero-scale inputs through direct offset composition; rejected animated perspective matrices and unsafe Float32 headroom.
- Bounded each snapshot to 8,192 active slots, each animated batch to 16,384 total slots, and sparse GPU uploads to 64 coalesced ranges per frame.
- Computed conservative motion bounds at reconciliation so frustum culling and Three raycast broad-phase remain correct without full-batch scans every frame.

## 0.1.1 - 2026-07-12

- Added a typed, validated `ThreeDaylightOptions` surface for sky/ground hemisphere fill and a directional sun.
- The engine-owned light rig tracks the current view centre, so panning keeps a stable light direction across large worlds.
- Supplied scenes still receive no implicit lighting; consumers may explicitly request an engine-owned rig, which is removed during idempotent disposal.
- Kept antialiasing, palettes, fog, art recipes, shadows, and post-processing under explicit consumer or later measured policies.

## 0.1.0 - 2026-07-11

- Added bounded, copied V1 render snapshots with explicit world epochs and accepted/presented revisions.
- Added dense palette chunks and a deterministic boundary-aware visible-face mesher.
- Added a Three.js WebGL runtime for voxel chunks, arbitrary geometry resources, rigid instance batches, 2:1 orthographic views, capture, metrics, context loss, and idempotent disposal.
- Established a narrow tested Three.js peer line and exercised the first real consumer through AoE2's opt-in composed isometric voxel renderer.
- Documented the build-versus-adopt boundary, mature-library research, consumer contract, cross-game design, and phased City/Townscaper follow-ups.
