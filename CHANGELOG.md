# Changelog

## Unreleased

- Bounded the packed build payload to emitted ESM and declarations, disabled source-map directives/maps so the tarball is self-consistent, and added hard 350,000-byte packed and 1,700,000-byte unpacked gates. The resulting API-report hash update changes declaration emission only, not exported TypeScript semantics.

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
