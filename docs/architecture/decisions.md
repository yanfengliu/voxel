# Architecture decisions

This log records decisions that must survive individual implementation sessions. Newer decisions may supersede older ones, but existing entries remain as history.

## ADR-0001: Use Three.js rather than an in-house renderer

- Status: accepted on 2026-07-11.
- Decision: use Three.js `WebGLRenderer` for the first production adapter. Keep portable inputs and meshing free of Three.js and the DOM.
- Reason: City and Townscaper already use Three.js, while rebuilding cameras, materials, loaders, batching, capture, browser compatibility, and context handling would delay every game.
- Version policy: the first tested runtime is Three.js `0.185.1` with `@types/three` `0.185.0`, matching City's locked versions. `three` is an optional peer of this package and a direct dependency of each Three consumer. Linked Vite consumers deduplicate it.

## ADR-0002: Keep three independent render-data lanes

- Status: accepted on 2026-07-11.
- Decision: public snapshots keep `VoxelChunk`, `GeometryResource`, and `InstanceBatch` as independent resource families.
- Reason: AoE terrain benefits from voxel chunks, AoE units and City populations benefit from rigid instance batches, and Townscaper must retain ownership of its irregular connected-shell topology through geometry resources. "Voxel-first" does not mean forcing every visual through cubes.
- Boundary: game concepts such as units, roads, zones, facades, stories, owners, fog memory, health, and commands never enter the reusable package.

## ADR-0003: Own contracts and lifecycle; reuse or vendor narrow algorithms

- Status: accepted on 2026-07-11.
- Decision: own validation, epochs, accepted/presented revisions, worker-result ordering, resource ownership, capture, and consumer adapters. Do not build a renderer, BVH, asset optimizer, or advanced voxel algorithm from scratch.
- Meshing policy: ship a small deterministic visible-face mesher only as the correctness oracle behind an injectable `VoxelMesher` interface. Before greedy meshing, ambient occlusion, lighting, liquids, or custom blocks, bake off Voxelize's MIT Rust/WASM mesher against `block-mesh-rs` and the oracle. Prefer a pinned component extraction or maintained fork over importing Voxelize's full game/server world.
- Deferred mature components: adopt `three-mesh-bvh` when mesh-query load requires it, and glTF Transform plus meshoptimizer when imported assets enter a consumer slice. Taichi.js is not a production dependency; native Taichi and OpenVDB remain optional offline tools.

## ADR-0004: Prove the first consumer through a reversible AoE2 composition

- Status: accepted on 2026-07-11 at the user's request.
- Decision: the first consumer slice is an AoE-owned `?renderer=voxel` path. Three.js renders the 3D world on a canvas behind a transparent Phaser canvas; Phaser temporarily retains simulation frame ordering, camera/input, fog, selection, placement, health, debug, replay, and browser-test overlays.
- Reason: AoE2's simulation/render seam is sound, but its current `GameScene` also owns input, camera conversion, bridge replacement, and test hooks. A two-canvas composition produces real 3D voxel graphics without a one-shot rewrite of those contracts.
- Promotion gate: voxel becomes the default only after selection, commands, pan/zoom, fog, save/load, replay, capture, teardown, and fixed-scene visual evidence pass. `?renderer=phaser` remains a bounded fallback until the standalone host migration is complete.
- Reuse constraint: the AoE adapter may translate game entities into neutral chunks, geometry, and batches, but no AoE types or art-role rules move into this repository.

## ADR-0005: Share a bounded daylight rig, not game art direction

- Status: accepted on 2026-07-12.
- Decision: `voxel/three` may own a configurable sky/ground hemisphere fill plus one directional key light whose target follows the current view centre. AoE, City, and Townscaper continue to own palettes, model recipes, fog meaning, time of day, animation, and effects.
- Ownership: an engine-created scene receives the default rig unless disabled. A supplied scene receives no implicit lights, but may explicitly request a rig; that rig is the runtime's owned subtree and is removed during disposal without mutating unrelated scene state.
- Deferred boundary: shadow maps are not part of this slice. They require explicit caster/receiver policy, frustum and map-size budgets, render-target metrics, context restoration, borrowed-renderer setting restoration, and teardown proof before enablement.

## ADR-0006: Animate rigid instances with bounded harmonic offsets

- Status: accepted on 2026-07-12 for the first animated AoE consumer slice.
- Decision: an instance batch may carry game-neutral per-instance harmonic translation, Euler-rotation, and fractional-scale amplitudes, with a finite period and phase. `voxel/three` samples those offsets from the injected frame context and composes them over the accepted base matrix without asking the consumer for a new snapshot every frame.
- Reason: AoE's procedural voxel people, mounts, tools, and siege parts are already rigid instances. City pedestrians/props and Townscaper wildlife or ornaments can use the same deterministic mechanism, while a skeletal system or consumer-specific clip enum would be premature.
- Boundary: consumers own which parts move, their amplitudes, periods, phase relationships, state transitions, sharding, and gameplay meaning. The engine owns validation, copied storage, deterministic sampling, affine-safe matrix updates, conservative motion bounds, bounded partial uploads, metrics, context-loss fencing, and disposal. V1 caps active slots per snapshot and total slots per animated batch rather than presenting the million-slot static ceiling as a real-time animation budget.
- Deferred boundary: this is not skeletal animation, vertex animation, root motion, an animation graph, or an attack/gather event protocol. Those require imported-asset and simulation-event contracts proven by a later consumer.

## ADR-0007: Keep path-distance gait sampling in consumers

- Status: accepted on 2026-07-12 after tracing AoE's displayed interpolation path.
- Decision: a consumer that already owns root interpolation may accumulate displayed distance and bake locomotion pose into ordinary rigid-instance base transforms. Do not add gait history, stride length, velocity inference, foot planting, or movement-state enums to the engine snapshot contract.
- Reason: AoE can match foot cadence exactly to the path the player sees, including gameplay speed modifiers and interpolation, without projecting incomplete simulation velocity or making engine output depend on presenter history. It injects tick-plus-interpolation simulation display time for speed/transition sampling, so manual or replay pause freezes gait even when selection forces redraws; stopped or paused roots never advance phase. Townscaper route phases and City vehicle interpolation have different semantic clocks, so a shared state machine would be false reuse.
- Boundary: the engine's harmonic lane remains appropriate for ambient motion that advances under injected render time. Direction smoothing, travel-plane pitch, ground clearance, history reset, and static/animated batching policy remain consumer concerns. Consider extracting only a pure game-neutral pose-sampling contract after a second consumer demonstrates the same requirement; until then consumer adapters own motion history and base-pose generation.

## ADR-0008: Treat 60 Hz as a measured reference-scene contract

- Status: accepted on 2026-07-13 after auditing AoE2, City, and Townscaper frame loops.
- Decision: target a 60 Hz presentation rate and a 16.67 ms full host-frame work budget on named deterministic scenes, viewports, browsers, and hardware. Do not promise a hardware-independent minimum frame rate: browser scheduling, display refresh, background throttling, drivers, and device capability are outside the package's control.
- Measurement: consumers own scheduling and collect foreground `requestAnimationFrame` interval, complete host callback work, runtime submit work, and whether a frame presented new state. `voxel/testing` requires contiguous indices and turns injected samples into nearest-rank p50/p95/p99/max timings, aggregate and per-kind work-budget statistics, aggregate over-budget streaks, and a missed-refresh estimate without reading a clock or changing renderer policy. Separating steady and presentation frames prevents a small expensive class from hiding below aggregate p95. GPU-complete timing remains a separate controlled benchmark because `WebGLRenderer.render()` normally measures submission rather than completion.
- Acceptance profile: record source revision, scene fixture, viewport, DPR, browser/OS/CPU/GPU, warmup and sample counts, visibility state, draw and resource metrics, and steady versus presentation frames. A passing named profile has p95 full-frame work at or below 16.67 ms, no motion discontinuity when new simulation state arrives, and stable resource counts; raw rAF cadence is reported separately because a headless or background browser may throttle it.
- Boundary: target frame rate, quality degradation, path interpolation, teleport handling, shortest-turn policy, and facing meaning remain consumer responsibilities. A reusable transform-patch lane or pose sampler requires measured need and matching semantics in a second consumer.

## ADR-0009: Enforce physical invariants upstream of rendering

- Status: accepted as a design direction on 2026-07-20; runtime physics is not implemented.
- Decision: every solid placement and movement must eventually pass through one authoritative simulation world with atomic overlap checks, rigid bodies, contacts, and generic constraints. Voxel consumes revisioned solved transforms and never owns collision response, force integration, or physical pose authority.
- Current slice: Model Studio rejects any solid voxel shared by two distinct recipe occurrences, and a versioned `PhysicalAssetV1` sidecar beside a saved recipe now authors bodies, colliders, fixed/revolute/prismatic joints, and attachment ports, compiled per occurrence — mirrors included — into distinct stably named bodies. Direct construction steps inside one occurrence may still layer intentionally. These are exact authoring-time invariants and authoring data, not a runtime-physics claim.
- Connection rule: rigidly fixed shapes share one compound body; articulated shapes use explicit generic joints and local anchor frames. Touching never silently creates a permanent attachment, and model names never select solver behavior.
- Adoption rule: evaluate Rapier JS/WASM behind a narrow consumer-owned adapter before adding a dependency or extracting a shared simulation package. Require fixed-step replay, overlap and swept-query behavior, joints, continuous collision detection, browser lifecycle, supply-chain, and performance evidence.
- Detailed contract: [physical world invariants](../design/physical-world-invariants.md).
