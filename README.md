# voxel

`voxel` is a reusable 3D rendering toolkit for browser games such as the sibling `city`, `townscaper`, and `aoe2` repositories.

The intended engine is voxel-first, not voxel-only: it should render chunked voxel terrain, repeated instanced objects, procedural or imported meshes, overlays, effects, and both orthographic and perspective cameras without taking ownership of gameplay or simulation state.

## Status

Version 0.1.3 is an executable strict-TypeScript package with built ESM and declarations. It provides bounded V1 render snapshots, owned ingest, explicit accepted/presented frame boundaries, a deterministic visible-face voxel mesher, a Three.js WebGL runtime, configurable target-tracked daylight, bounded injected-time rigid-instance animation, 2:1 orthographic camera helpers, capture, metrics, context-loss handling, idempotent teardown, and reusable 60 Hz frame-budget reporting. AoE2 is the first live proving consumer.

This is a production-shaped vertical slice, not a finished universal engine. Opaque voxel chunks, consumer-authored geometry, and repeated rigid instances are implemented. Greedy/worker meshing, transparency, skeletal animation, LOD, streaming, WebGPU, and native fog/selection/effects remain deliberately deferred.

## Scope

The repository should own:

- game-neutral render snapshot and delta contracts;
- chunk storage, dirty-region invalidation, voxel meshing, and voxel picking;
- instanced batches, resource caches, cameras, render lifecycle, and capture tooling;
- deterministic geometry tests, browser visual checks, and performance reference scenes.

Each game should continue to own simulation, gameplay rules, UI, save data, art direction, and translation from its state into renderer inputs.

## Package surface

- `voxel/core` — V1 contracts, bounded validation/copying, coordinates, and the accepted/presented `RenderWorld` lifecycle.
- `voxel/meshing` — dense palette chunks and a deterministic boundary-aware visible-face oracle.
- `voxel/three` — snapshot-only Three.js runtime, instance/chunk/geometry presentation, configurable engine-owned daylight, deterministic rigid-instance playback, orthographic camera helpers, capture, metrics, and disposal.
- `voxel/testing` — small consumer-independent test helpers, including a clock-free frame-budget reporter for comparable 60 Hz reference evidence; this surface grows only with proven shared fixtures.

The runtime is tested with `three@0.185.1` and `@types/three@0.185.0`. `three` is a narrow optional peer so core and meshing remain renderer-independent; applications importing `voxel/three` must install the tested Three runtime and deduplicate linked copies.

```bash
npm install
npm run verify
npm pack --dry-run
```

See [the consumer integration guide](docs/guides/consumer-integration.md) for the lifecycle and game-owned adapter boundary. [The engine design](docs/design/spec.md) records the architecture, option analysis, risks, and later phases; [the ecosystem review](docs/research/ecosystem.md) records which mature libraries are adopted, evaluated, or rejected; and [the implementation ledger](docs/plans/implementation.md) is the cross-session source of truth.
