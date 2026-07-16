# voxel

`voxel` is a reusable 3D rendering toolkit for browser games such as the sibling `city`, `townscaper`, and `aoe2` repositories.

The intended engine is voxel-first, not voxel-only: it should render chunked voxel terrain, repeated instanced objects, procedural or imported meshes, overlays, effects, and both orthographic and perspective cameras without taking ownership of gameplay or simulation state.

## Status

Version 0.1.4 is an executable strict-TypeScript package with built ESM and declarations. It provides bounded V1 render snapshots, owned ingest, explicit accepted/presented frame boundaries, a deterministic visible-face voxel mesher, a bounded deterministic dense-chunk occupancy ray query, a Three.js WebGL runtime, configurable target-tracked daylight, bounded injected-time rigid-instance animation, 2:1 orthographic camera helpers, capture, metrics, context-loss handling, idempotent teardown, and reusable lifecycle and 60 Hz frame-budget fixtures. AoE2 is the first live proving consumer, running Voxel standalone as its sole world renderer; City is the second, drawing its building wall lane through an embedded, borrowed-renderer runtime while keeping every other lane.

The current unreleased work adds the 1.0 delivery plan, declaration/API drift detection, cross-platform CI policy, bounded snapshot ownership and exact copy/retention/presentation-staging telemetry, exact TypeScript 5.7/5.9/6.0 consumer fixtures, additive atomic Delta V1 ingest, fixed-page sparse instance updates, a reentrancy-safe presentation ledger, indexed copied-halo voxel meshing, the packaged Three-free module worker, a bounded deterministic scheduler with target-atomic group admission, nonmutating admission preflight, and stale-result firewalls, and a corpus-proven greedy opaque candidate with recorded selection evidence. Explicit runtime lifecycle states, perspective/borrowed-camera policies, host-managed single-use frame tickets, and one-copy canonical snapshot ingest are implemented; the Voxel-owned City-shaped sparse embedded-host fixture executes end to end. Revision-atomic async scene swaps now commit through a cross-layer frame transaction: standalone runtime-rendered hosts reserve worker admission before canonical acceptance and present each worker-meshed revision at a frame boundary, with headless Chromium evidence that an accepted-but-unmeshed revision never produces a mixed or partial frame. Committed presented-state picking and revision-aware capture are published from that transaction and advertised through the capability report. Embedded hosts now drive the same transaction through the frame ticket they already own, so worker meshing is no longer standalone-only, and `voxelWorkers` is a public option rather than a package-internal seam. Both proving consumers are green against this line: AoE2's complete gate, including 108 real-browser tests, and City's embedded wall lane, whose browser evidence shows three wall meshes collapsing to one batch with identical triangles and no observable visual change beyond its animation noise floor. Named reference-scene timings on real hardware, visual baselines, and the release-candidate gates remain open milestones.

This is a production-shaped vertical slice, not a finished universal engine. Opaque voxel chunks, consumer-authored geometry, repeated rigid instances, portable dense-grid occupancy raycasts, worker execution, scheduler policy, and host-managed composition are implemented. The greedy candidate is installed in the packaged worker, meshes revisions through the revision-atomic runtime path in a real browser, and was accepted for production against budgets fixed before any result existed. Presented voxel/instance picking is exposed from committed runtime state and reads the same bundle the canvas shows. Transparency-aware voxel merging, skeletal animation, LOD, streaming, WebGPU, and native fog/selection/effects remain deliberately deferred.

## Scope

The repository should own:

- game-neutral render snapshot and delta contracts;
- chunk storage, dirty-region invalidation, voxel meshing, and voxel picking;
- instanced batches, resource caches, cameras, render lifecycle, and capture tooling;
- deterministic geometry tests, browser visual checks, and performance reference scenes.

Each game should continue to own simulation, gameplay rules, UI, save data, art direction, and translation from its state into renderer inputs.

## Package surface

- `voxel/core` — V1 snapshot/delta contracts, bounded validation/copying, immutable canonical lanes, coordinates, and the accepted/presented `RenderWorld` lifecycle.
- `voxel/meshing` — dense palette chunks, uniform profiles and indexed adjacency/invalidation, deterministic pure mesher contracts, copied-halo visible-face oracle and greedy candidate, packaged worker protocol/runtime, bounded scheduler, and a Three-free bounded DDA occupancy ray query.
- `voxel/meshing/browser-worker` — the browser-only bundler entry that starts Voxel's packaged module worker through a static `Worker`/`new URL` reference; portable and custom hosts continue to use the factory API from `voxel/meshing`.
- `voxel/three` — snapshot/delta Three.js runtime, runtime-rendered and host-managed frame modes, fixed-page sparse instance updates plus chunk/geometry presentation, configurable engine-owned daylight, deterministic rigid-instance playback, orthographic/perspective/borrowed camera policies, capture, metrics, lifecycle/readiness, and disposal.
- `voxel/testing` — small consumer-independent test helpers, including an allocation-fresh V1 renderer-lifecycle scene, a clock-free frame-budget reporter, and deterministic RenderWorld ownership-counter hooks; this surface grows only with proven shared fixtures.

The runtime is tested with `three@0.185.1` and `@types/three@0.185.0`. `three` is a narrow optional peer so core and meshing remain renderer-independent; applications importing `voxel/three` must install the tested Three runtime and deduplicate linked copies.

```bash
npm install
npm run test:browser:install
npm run verify
npm pack --dry-run
```

New to this codebase? [The concepts guide](docs/guides/concepts.md) explains the vocabulary the rest of the documentation assumes — epochs, accepted versus presented, meshing, the frame transaction, and host ownership — in plain language, with the bug each idea prevents.

See [the consumer integration guide](docs/guides/consumer-integration.md) for the lifecycle and game-owned adapter boundary. [The current engine design](docs/design/spec.md) and [0.1 implementation ledger](docs/plans/implementation.md) record the delivered vertical slice. The forward 1.0 authority is [the roadmap](docs/plans/v1-roadmap.md), [target architecture](docs/design/v1-architecture.md), and [implementation plan](docs/plans/v1-implementation.md); [the support policy](docs/policies/support.md) defines when a platform or artifact becomes supported. [The ecosystem review](docs/research/ecosystem.md) records which mature libraries are adopted, evaluated, or rejected.
