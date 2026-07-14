# Rendering and voxel ecosystem review

Reviewed: 2026-07-13. Re-check versions, activity, licenses, and browser support before adding a dependency; this is a decision record, not a forever-current catalog.

## What we should adopt

| Need | Mature component | Decision |
|---|---|---|
| Browser renderer and scene primitives | [Three.js](https://threejs.org/docs/pages/WebGLRenderer.html) | Use now. City and Townscaper already depend on it, and it supplies the renderer, cameras, materials, loaders, instancing, render targets, and readback that would be wasteful to rebuild. |
| Repeated rigid objects | [Three.js `InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html) and later `BatchedMesh` | Use before adding a batching framework. The shared package owns stable keys, capacity/revision policy, metrics, and cleanup around these primitives. |
| MagicaVoxel `.vox` input | [Three.js `VOXLoader`](https://threejs.org/docs/pages/VOXLoader.html) | Use if a consumer introduces `.vox` assets. Do not write a format parser first. Convert loaded content into a game-owned recipe or a versioned geometry resource. |
| Imported asset processing | [glTF Transform](https://gltf-transform.dev/) and [meshoptimizer/gltfpack](https://github.com/zeux/meshoptimizer/tree/master/gltf) | Defer until GLB assets enter a real slice, then adopt for validation, deduplication, quantization, compression, and mesh optimization. Keep this offline rather than in the frame loop. |
| Heavy triangle queries | [`three-mesh-bvh`](https://github.com/gkjohnson/three-mesh-bvh) | Defer until measured picking or spatial-query cost requires it. Voxel occupancy should still use grid/DDA queries rather than triangle raycasts. |

## Verification toolchain provenance

- `@playwright/test` `1.59.1` is locked from the npm registry, is Apache-2.0 licensed, and is used only for the headless real-WebGL lifecycle gate. Neither Playwright nor its downloaded browser is included in the package's `dist`-only tarball.
- `@types/node` `22.14.1` is locked from the npm registry's DefinitelyTyped package, is MIT licensed, and is used only to typecheck the Node-owned browser fixture server and configuration. It is not a runtime or packed dependency.
- `package-lock.json` records the exact registry sources and integrity hashes. A dependency change must continue to pass both runtime-only and complete audits.

## Voxel-specific candidates

### Voxelize

[Voxelize](https://github.com/voxelize/voxelize) is an MIT-licensed Rust and TypeScript full-stack voxel engine. Its documented scope includes multithreaded client/server chunk meshing, custom static and dynamic block meshes, chunk-overflow generation, multiplayer, physics, raycasting, persistence, and game event systems.

That is credible prior art, but most of the product is intentionally outside this repository's scope. Importing it whole would create a second world, networking, physics, and event authority beside each game's simulation. The useful next experiment is a pinned, provenance-recorded extraction of its meshing path compiled to WASM and compared behind our neutral mesher interface. We should adopt it only if that bounded component wins on correctness, bundle size, build reliability, and representative chunk timings.

### `block-mesh-rs`

[`block-mesh-rs`](https://github.com/bonsairobo/block-mesh-rs) is dual MIT/Apache-2.0 Rust code focused specifically on block meshing. It exposes both visible-face and greedy-quad algorithms, a right-handed Y-up configuration, padded-neighbour input, and merge values for deciding which faces may combine.

Its narrow scope fits better than a whole voxel game engine. It has no GitHub releases, so adoption would require an exact commit, a reproducible Rust-to-WASM build, license/provenance records, browser packaging tests, and parity fixtures against the TypeScript oracle. It is the leading advanced-mesher candidate, not an automatic dependency.

### Voxel.js

[Voxel.js](https://voxel.github.io/voxeljs-site/) pioneered modular Three.js voxel games in the browser, but the published [`voxel-engine`](https://www.npmjs.com/package/voxel-engine) release is from the old Three/CommonJS ecosystem and was last published more than a decade ago. Its modular decomposition and meshing references are useful historical design evidence; its runtime dependency graph is not a sound foundation for these strict-ESM, current-Three consumers.

## Taichi and GPU-compute options

There are multiple projects called Taichi.js, which should not be conflated:

- [AmesingFlank/taichi.js](https://github.com/AmesingFlank/taichi.js) compiles JavaScript functions to WebGPU compute shaders. It is interesting for experiments such as dense simulation fields or offline/one-shot GPU generation, but it is a compute framework rather than a voxel scene engine. Making it the runtime foundation would add a WebGPU-only programming model beside Three's tested WebGL path while leaving cameras, materials, assets, picking, lifecycle, and game integration unsolved.
- [taichi-dev/taichi.js](https://github.com/taichi-dev/taichi.js) runs compiled Taichi kernels through JavaScript/WASM and describes itself as early-stage. It is not the modern browser renderer needed here.
- [Native Taichi](https://github.com/taichi-dev/taichi) is a mature Python-embedded GPU/CPU compute system with sparse fields and several native backends. It can be valuable in an offline authoring or preprocessing pipeline, where Python and native drivers are acceptable, without becoming a production browser dependency.

Decision: do not put Taichi.js in the game runtime. Revisit it only for a measured compute problem with a small replaceable boundary. Prefer standard asset outputs or typed buffers so the games do not inherit a Taichi-specific world model.

## Renderer alternatives

[Babylon.js](https://doc.babylonjs.com/setup/support/webGPU/) is a mature, fuller game engine and a reasonable greenfield choice. At selection time it would have rewritten both existing Three consumers while requiring a separate AoE migration away from Phaser; AoE has since completed that migration on Three/`voxel`, which reinforces rather than changes the shared-stack decision. Raw WebGPU gives more control but would require us to recreate the scene, material, asset, readback, fallback, and debugging infrastructure we are explicitly trying to share.

The practical boundary is therefore selective ownership:

- own game-neutral snapshots, generations, revisions, validation, deterministic oracle meshing, resource lifecycle, metrics, capture semantics, and consumer adapters;
- reuse Three.js and its addon ecosystem now;
- evaluate a narrow Rust/WASM mesher before building greedy meshing;
- adopt BVH and asset optimizers only when a profiled consumer needs them;
- keep native/GPU compute tools offline or behind replaceable experiments.

This is materially less work than building everything in-house while preserving the contracts that City, Townscaper, and AoE actually need to share.
