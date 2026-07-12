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
