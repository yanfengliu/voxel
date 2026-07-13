# AGENTS.md

## Headless-first execution

Always work headlessly by default. This is a mandatory execution rule, not an adaptable default. Use a visible browser window, desktop application, GUI automation, or another non-headless interaction only when it is absolutely necessary to complete or adequately verify the task and no headless alternative is sufficient. State the reason before launching the non-headless path.

## Working style

Treat this file as adaptable defaults except where it names a load-bearing boundary or correctness gate. Optimize for a correct, verified, readable result. If a default makes the work worse, deviate deliberately and explain why.

Scale the workflow to the task. Handle trivial edits directly. For substantial features, migrations, audits, or broad refactors, use an explicit explore -> plan -> implement -> verify flow, parallelize genuinely independent work, and keep the primary agent responsible for decisions and integration.

Continue through an accepted multi-step plan without artificial checkpoints. Stop only for a genuine blocker, missing authority, an explicit stop, or a material product decision that cannot be inferred safely.

Preserve unrelated user changes. Inspect the worktree before editing, keep the diff scoped, and verify claims against live files rather than prompts or stale documentation.

## Session start

Read `README.md` and `docs/design/spec.md` before substantial work. Inspect the relevant consumer path in `../city`, `../townscaper`, or `../aoe2` before changing a public contract intended for that consumer.

Do not modify a sibling repository unless the task explicitly includes it. Consumer code is evidence for an engine contract, not automatically code that belongs here.

`CLAUDE.md` is a pointer to this file. Keep canonical policy here rather than duplicating it in agent-specific files.

## Project intent and status

This repository is a browser-first, voxel-first 3D graphics and rendering toolkit for the owner's strategy and building games. It should support voxel chunks, low-poly procedural geometry, imported assets, instanced entities, overlays, effects, and orthographic or perspective views.

It is not a simulation engine, ECS, game-rules library, UI framework, persistence layer, asset evolution studio, or complete general-purpose replacement for Three.js. A useful renderer shared by two games is preferable to a universal abstraction that serves none well.

The repository currently contains a production-shaped V1 vertical slice: strict-TypeScript package exports, bounded snapshots, a visible-face oracle mesher, and a Three.js WebGL runtime proven through AoE2's opt-in adapter. Advanced meshing, deltas, picking, assets, workers, spatial sharding, and broader consumer adoption remain planned. Do not claim that a package, command, backend, benchmark, shader, mesher, adapter, or test exists until live files and executable behavior prove it.

## Load-bearing boundaries

- The game simulation is authoritative. Renderer state, Three.js scenes, meshes, materials, textures, acceleration structures, captures, and metrics are disposable derived artifacts.
- Public render inputs are bounded, structured-clone-safe data with opaque never-reused render keys or explicit local-ID generations, plus schema, epoch, and revision fields. They contain no callbacks, DOM objects, Three.js objects, or consumer-specific world types.
- Portable core, voxel storage, meshing, and voxel/heightfield ray-query code must not import Three.js or touch the DOM. The Three.js adapter may use `THREE.Raycaster` and owns all GPU and browser integration.
- Consumer adapters translate game snapshots or deltas into engine inputs. Roads, zones, AoE units, Townscaper facades, simulation components, and other game semantics stay in their game repositories.
- Coordinate, unit, color-space, alpha, and transform conventions are explicit at the boundary. Never rely on an implicit axis swap, scale, or color conversion.
- Input typed arrays are borrowed and copied on ordinary ingest. Only an explicitly named ownership-taking API may consume and detach adapter-owned transfer buffers; simulation-owned memory is never transferred.
- Meshing is deterministic for identical canonical inputs. Async jobs carry world epoch, resource incarnation, source revision, and dependency revisions; stale worker results never overwrite newer state.
- Track accepted state separately from presented state. Mesh swaps happen at frame boundaries, picking reads the same presented data as the canvas, and revision-aware capture waits for or reports incomplete presentation.
- GPU ownership is explicit. Every renderer, control, listener, frame callback, geometry, material, texture, render target, cache entry, extension scope, and worker has an idempotent disposal path. Context loss and restoration follow an explicit state machine.
- Time is injected through the frame context. Deterministic paths never read `Date.now()` or `performance.now()` directly; tests can drive a manual clock.
- Never create one scene object or draw call per voxel at production scale. Cull hidden faces, mesh by chunk or region, instance repeated objects, and make growth or overflow policy explicit.
- If the first implementation is one package, keep `three` as an optional peer via `peerDependenciesMeta`, externalize it from the build, align `three` and its type declarations to one tested release, deduplicate linked Vite consumers, and verify only one runtime Three.js instance. Split `voxel/three` into a package if that contract becomes awkward.
- WebGL2 through Three.js `WebGLRenderer` is the first production backend. Keep the data plane portable, but do not build a speculative backend abstraction or promise WebGPU parity before a measured need and working proof.

## Change workflow

- Read the affected path and trace data flow end to end before editing.
- Prefer the smallest coherent change that proves a real consumer need. Extract after a contract is understood; do not move an entire game renderer into this repository.
- Use test-driven development for behavior. Start with an externally meaningful contract: geometry topology, chunk seams, revision ordering, picking, disposal, public exports, or rendered output.
- Make async state, ordering, cancellation, retries, ownership, cleanup, and terminal outcomes explicit.
- Preserve public API compatibility unless the task authorizes a versioned breaking change. Schema changes require explicit versioning and migration guidance.
- Keep tunable budgets and renderer policy in typed configuration or named constants rather than scattered magic numbers.
- Prefer composition over inheritance. Keep files focused and normally under 500 lines; 1000 lines is a hard ceiling requiring an explicit reason and follow-up.
- Do not create a shared abstraction solely because two functions look similar. Share stable semantics and lifecycle contracts, not incidental syntax.

## Verification

The authoritative commands live in `package.json`: `test`, `typecheck`, `lint`, `build`, and the complete `verify` gate. Run the smallest relevant check while iterating and `npm run verify` before declaring implementation complete. Documentation-only work must at least pass diff review, link/path checks, Markdown-fence checks, and whitespace checks. Do not invent successful command results.

For renderer changes, verification must match the risk:

- deterministic unit and property tests for storage, meshing, bounds, seams, revisions, and picking;
- browser tests against the served application for resize, input, capture, context loss, and teardown;
- fixed-camera, fixed-viewport, fixed-DPR reference scenes with before/after screenshots or a justified visual baseline update;
- structured render metrics such as draw calls, triangles, GPU resource counts, rebuild counts, queue depth, and dropped stale jobs;
- repeated rebuild and teardown checks that demonstrate stable resource counts;
- measured performance on named reference scenes, with hardware/browser context recorded and correctness checked alongside speed.

Do not approve visual behavior from source inspection alone, structural correctness from a pleasing screenshot alone, or performance from a single unrepeatable frame-time number.

## Review

Self-review trivial prose and formatting. Adversarially review non-trivial behavior and public-contract changes. Every reviewer must inspect the live code and verify symbols, types, paths, and assumptions before making a claim.

Review for correctness, deterministic output, chunk seams and invalidation, revision races, public API compatibility, resource leaks, draw-call and allocation growth, consumer boundary violations, picking parity, and missing browser evidence. One substantive defect outweighs multiple ungrounded approvals.

## Dependencies and supply chain

When dependencies change, update the lockfile, run both runtime-only and full dependency audits supported by the package manager, and block new high or critical findings unless the user accepts a documented, expiring exception.

Record the source, version, license, and redistribution requirements for imported code, shaders, textures, models, and sample assets. Permission to view or use a sibling asset does not automatically make it appropriate for a reusable engine package.

## Documentation and Git hygiene

Keep `README.md` truthful about implemented status and keep `docs/design/spec.md` aligned with architectural contracts and delivery gates. Update consumer integration notes when a public API or supported Three.js range changes. Add heavier devlog, decision-log, or progress trees only when recurring implementation work makes them useful.

Preserve unrelated work, stage only coherent requested changes, and never discard user changes. Follow the task's authority for commits, pushes, releases, and sibling-repository edits; when delivery is authorized, land only after the applicable gates pass.

Temporary captures, traces, benchmark output, and renderer dumps belong in ignored output directories. Commit only durable fixtures, concise evidence, and documentation useful to a future maintainer.
