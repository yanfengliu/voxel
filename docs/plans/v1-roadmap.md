# Voxel 1.0 roadmap

Status: released-scope and evidence record, authored from 2026-07-13 and completed with Version 1.0.0 on 2026-07-18. The earlier V1 vertical slice and its historical delivery ledger remain documented in [implementation.md](implementation.md). This document defines what “1.0” means, what it deliberately does not mean, and the evidence that supported the immutable release.

Companion documents:

- [Voxel 1.0 architecture](../design/v1-architecture.md) defines the target contracts and state machines.
- [Voxel 1.0 implementation plan](v1-implementation.md) breaks the roadmap into ordered, testable work packages.
- [Current engine design](../design/spec.md) records the original option analysis and the implemented 0.1.x architecture.

## Product definition

Voxel 1.0 is a browser-first, voxel-first 3D rendering toolkit for the owner's strategy and building games. It is a stable WebGL2 runtime, built on one tested Three.js line, that can render bounded voxel chunks, consumer-authored indexed geometry, and spatially sharded rigid instances from portable versioned data.

The 1.0 claim requires all of the following:

1. Snapshot and delta inputs are bounded, structured-clone-safe, atomically validated, and retained with one ownership copy on the ordinary ingest path.
2. Voxel edits are indexed, dependency-aware, meshed off the render thread in production, protected from stale results, and presented without mixed-revision seams.
3. Picking reads the same chunk occupancy and instance transforms that are visible on the canvas.
4. Orthographic and perspective hosts have explicit resize, frame-clock, capture, context-loss, restoration, ownership, and disposal behavior.
5. AoE2 and one City rendering lane use the public package without game types entering Voxel or a second Three.js runtime being bundled.
6. Public declarations, packed artifacts, browser behavior, performance evidence, dependency audits, and migration policy are repeatable in CI and from a clean checkout.

This is intentionally a useful shared renderer, not a universal graphics engine.

## Every game gets a model studio

Decided 2026-07-17 by the owner. The model studio is not a voxel-repo tool; it
is the pattern every game using this engine gets, the way Townscaper already
has one. The purpose is a loop: games ship models; the studio examines them
frame by frame; the owner pins notes and sends requests; an agent revises
through the same controls; the game reloads the result. Graphics and animation
improve continuously, and the owner steers by looking rather than by reading.

Boundary, per AGENTS.md: the engine repo owns the studio's reusable core --
viewing, playback, checks, notes, requests, the agent-drivable controls. Each
game owns its catalog (which models exist, what they are named, where they
save) and mounts the studio with that catalog. Game meaning never enters the
engine; the studio core never hardcodes a game.

Owner requirement (2026-07-17): a game's shelf is organized into collapsible
sections the game names and orders -- characters, buildings, items, and so on.
The section list is part of the catalog a game provides, never a vocabulary
the studio invents; the studio only knows "sections contain models".

## Models keep the way they were made

Direction set 2026-07-17 by the owner. A studio model gains a saved recipe --
the ordered steps that made it: hand-placed voxels, parts run with settings
and a seed, mirrors. Running a recipe rebuilds the exact grid, so improving a
part can improve every model that uses it. The baked grid stays saved beside
the recipe as the record of what was accepted: improving a part changes no
game's art by itself, and a shelf rebuild is an explicit act judged by
looking at before/after sheets. Parts are earned on second use, never
invented ahead of need.

Lessons that are not code aggregate in one shared cookbook at the fleet root
(`github/voxel-craft.md`); a part proven by a second game graduates into one
shared content repository beside the games, created when the first part earns
it. The engine repo owns only the mechanism -- recipe schema and runner, part
interface, sameness and preview fixtures, rebuild-and-compare -- as studio
tooling, so the published package stays free of authoring. Full design:
[model recipes and shared parts](../superpowers/specs/2026-07-17-model-recipes-and-shared-parts-design.md).

## City art direction: voxel

Decided 2026-07-15 by the owner. City renders low-poly primitives today -- its
lane sends `chunks: []` and four instanced batches of box, cylinder, and sphere
geometry -- so it uses the instanced half of this engine and none of the voxel
half. That is legitimate under "voxel-first, not voxel-only", but it means the
worker-meshed chunk path has no real consumer, including the embedded frame-ticket
work that exists specifically to give it one.

City will move to voxel art. This is a game-side change: City's adapter decides
what to send, and the engine's job is to make the chunk path good enough that
sending voxels is the obvious choice. The engine gains no City semantics from it.

Sequenced after the frame inspection core, so the art can be judged by looking at
it rather than by description. See [frame inspection](../design/frame-inspection.md).

## Roadmap baseline (faa00bf, 2026-07-13)

At that baseline commit, version 0.1.4 was a production-shaped vertical slice, not a 1.0 candidate. It provided:

- strict TypeScript subpath exports for core, meshing, Three.js, and testing;
- bounded whole-world snapshots and copied typed-array ownership;
- deterministic dense chunks, an opaque visible-face oracle, and a portable occupancy DDA ray query;
- Three.js presenters for chunk meshes, triangle geometry, materials, and rigid instance batches;
- an externally driven orthographic runtime with deterministic animation, metrics, capture, context-loss fencing, and idempotent disposal;
- a packed portable-consumer check, 108 unit tests, and a real headless WebGL lifecycle test;
- production proof through AoE2's sole world-renderer path.

The complete verification gate passed at that roadmap baseline commit. That evidence proved the vertical slice; it did not prove deltas, production meshing, worker races, presented-state picking, perspective use, real restoration, City adoption, broad performance, or release stability. Later milestone status and evidence are tracked in the implementation plan rather than retroactively rewriting this baseline.

## Scope boundaries

### Required for 1.0

- Whole snapshots plus sparse, atomic deltas for resources, chunks, batches, and keyed instance changes.
- Opaque voxel meshing with a simple correctness oracle and a measured production implementation.
- Fixed-profile chunk indexing, face-halo invalidation, worker scheduling, cancellation, stale-result rejection, and atomic dependency-group swaps.
- Triangle geometry resources and rigid instance batches. Portable core may describe additional topology only when backend support is advertised truthfully.
- Presented-state voxel and rigid-instance picking with stable generational identities.
- Orthographic, perspective, owned, and borrowed-camera runtime modes.
- Externally injected time, deterministic frame-boundary presentation, revision-aware capture, context restoration, metrics, and complete teardown.
- Chromium/WebGL2 support on Windows and Linux, plus portable-core Node support on the declared active LTS lines.
- AoE2 and City proof, API compatibility reports, release notes, immutable package artifacts, and a tagged 1.0.0 release candidate.

### Explicitly outside 1.0

- WebGPU parity or a speculative backend abstraction.
- Smooth terrain, marching cubes, Surface Nets, Transvoxel, LOD, streaming, occlusion systems, indirect draws, or infinite worlds.
- General ECS, simulation, networking, saves, UI, game rules, camera controls, or asset-authoring workflows.
- Skeletal animation, clip graphs, animation textures, root motion, or gameplay animation state machines. Deferred because no consumer needs them, not because they are forbidden; see [the animation scope](#animation-scope) for the standing direction and what would reopen this.
- Ambient occlusion, propagated voxel lighting, transparent-voxel merging, liquids, engine-owned shadow-map/quality policy, post-processing, or GPU particle systems. Neutral per-batch cast/receive flags are required so an embedded host may apply its existing shadow system.
- A general render graph, arbitrary mutable Three.js nodes in portable inputs, or consumer callbacks in the data plane.
- A complete Townscaper migration. Townscaper compatibility is tracked, but its Three.js upgrade and topology-specific adoption are post-1.0 unless they become cheap, independently verified additions.
- Public npm registry publication. The 1.0 gate is an immutable tagged and packed artifact; registry publication requires a separate package-name, provenance, and support decision.

## Release train

Milestone labels express dependency order, not calendar promises. Time ranges are planning estimates for one focused engineer with review support and may change when measured evidence contradicts an assumption.

| Version | Theme | Planned duration | Exit summary |
| --- | --- | ---: | --- |
| 0.2 | Foundations and truthful delivery | 1–2 weeks | One-copy snapshot path, explicit backend capabilities, CI, API baseline, and clean packed artifacts |
| 0.3 | Atomic delta data plane | 2–4 weeks | Put/remove transactions, resync, tombstones, sparse batch patches, bounded validation, model parity |
| 0.4 | Production voxel pipeline | 3–5 weeks | Indexed chunks, bake-off winner, worker pool, stale guards, atomic dependency swaps, culling metrics |
| 0.5 | Presented-state picking | 2–3 weeks | Voxel and instance hits agree with the displayed frame across animation, edits, and races |
| 0.6 | Runtime and host completeness | 2–4 weeks | Perspective/borrowed cameras, host frame tickets, readiness, revision capture, real context restoration, lifecycle state machine |
| 0.7 | Second-consumer proof | 2–4 weeks | One City building lane uses embedded Voxel with parity and one Three runtime; AoE remains green |
| 0.8 | Evidence and hardening | 2–4 weeks | Fuzz, endurance, visual, browser, performance, budget, cleanup, and cross-platform evidence |
| 0.9 | Release candidate | 1–2 weeks | API and schema freeze, migration rehearsal, immutable artifact, no unresolved release blockers |
| 1.0 | Stable release | — | RC evidence is green from a clean checkout, release notes and support policy are final, tag and artifact are reproducible |

The expected critical path is 0.2 → 0.3 → 0.4 → 0.5/0.6 → 0.7 → 0.8 → 0.9 → 1.0. Picking and host work may proceed in parallel after the presentation ledger exists. Documentation, API reports, audits, and consumer fixtures advance continuously rather than being deferred to the release candidate.

## Milestone outcomes

### 0.2 — foundations and truthful delivery

- Replace the current Three snapshot path's repeated validation/copy cycle with one canonical owned candidate and package-internal readonly presentation views.
- Preserve existing public snapshot APIs and defensive copy accessors.
- Advertise the Three backend's actual topology, alpha, camera, and context capabilities; reject unsupported features before accepted state mutates.
- Add a declaration/API baseline with intentional-update workflow and a changelog entry requirement.
- Add Windows and Linux CI for unit, type, lint, build, packed-portable, browser, package-content, and dependency-audit checks.
- Define supported Node, browser, Three.js, TypeScript-declaration, and package-distribution policy.

Exit evidence: post-call caller mutation remains harmless; rejected backend input leaves accepted state unchanged; copied-byte instrumentation proves one retained copy before presentation; current public snapshot consumers compile unchanged; the clean CI matrix passes.

### 0.3 — atomic delta data plane

- Add a separate render-delta/1 schema without adding required fields to render-snapshot/1 or world/1.
- Apply one operation per lane/key using final-candidate semantics, exact world/epoch/base revision matching, and a typed resync-required result.
- Track incarnation tombstones so removed keys cannot be accidentally reused within an epoch.
- Add keyed instance remove/upsert patches backed by copy-on-write pages rather than whole-batch copies.
- Bound operation count, changed instances, input bytes, retained bytes, validation work, tombstones, and readiness waiters.
- Keep ordinary ingest borrowed-and-copied; defer explicitly destructive transfer ownership until the safe path is proven.

Exit evidence: generated valid delta streams produce the same canonical state as equivalent full snapshots; every rejection and resync is atomic; a City-shaped sparse update copies and uploads work proportional to touched pages/ranges; old snapshot-only code still compiles.

### 0.4 — production voxel pipeline

- Add a declared fixed chunk profile and explicit missing-neighbor policy for worlds using production voxel meshing.
- Replace linear neighbor scans with deterministic indexed lookups and face adjacency records.
- Benchmark the current TypeScript oracle, a TypeScript greedy candidate, Voxelize, and block-mesh-rs where licensing/build constraints allow; record the decision rather than selecting by reputation.
- Retain the visible-face implementation as the correctness oracle and ship the measured winner behind the same pure mesher contract.
- Package a bounded worker pool with visible/near priority, dirty coalescing, cancellation, transferable job buffers, and deterministic synchronous fallback for tests.
- Tag every job/result with world, epoch, chunk incarnation/revision, dependency revisions, and policy versions. Discard and dispose every stale result.
- Stage edited chunks and their face-halo dependents as atomic presentation groups, including occupancy, bounds, mesh, and pick state.

Exit evidence: boundary edits/load/unload/tombstone/recreate never show a mixed old/new seam; stale and cancelled jobs cannot overwrite current state; repeated edit storms keep queue, allocation, and GPU-resource counts bounded; production topology matches the oracle.

### 0.5 — presented-state picking

- Bind portable voxel DDA queries to the presented occupancy store.
- Add stable instance hits from the transforms actually submitted for the frame, including procedural animation.
- Return full world/epoch/presented revision and generational resource identities with every hit.
- Sort composite hits by distance with a documented deterministic tie break; return multiple lanes so consumer selection policy remains outside the engine.
- Add optional bounded AABB/sphere logical proxies only if AoE or City proves a geometry-independent need during integration.

Exit evidence: fixed rays hit exactly what captures show through pending deltas, chunk swaps, animation, context loss, and restoration; no accepted-but-unpresented object is pickable.

### 0.6 — runtime and host completeness

- Generalize the runtime camera boundary to orthographic, perspective, and explicitly borrowed strategies while retaining the existing isometric helpers.
- Separate draw, viewport, camera-projection, and capture ownership. Embedded mode must not resize or draw through a shared renderer.
- Add prepare/commit/abort frame tickets so a host-owned successful render is the presentation acknowledgement.
- Make runtime states and legal transitions explicit: initializing, running, lost, restoring, failed, and disposed while retaining the legacy metrics state projection.
- Add presentationReadiness and abortable awaitPresented without reading wall-clock time in core.
- Add revision-aware capture and manifests while retaining the current synchronous capture as a runtime-rendered compatibility API; embedded capture stays host-owned unless a capture lease is supplied.
- On WebGL context restoration, recreate renderer-owned GPU state from canonical CPU state and present it at a frame boundary before reporting ready.
- Make renderer, scene, camera, daylight, listeners, controls, workers, callbacks, render targets, and extension scopes individually owned or borrowed with idempotent cleanup.

Exit evidence: resize/DPR, both camera modes, runtime-rendered/host-managed and owned/borrowed combinations, frame-ticket success/abort, loss during upload, repeated restore, failed restore, capture ownership/readiness, and teardown pass unit and real-browser tests with stable resource counts.

### 0.7 — second-consumer proof

- Add a City-owned adapter for one existing opaque building instance lane in embedded/external-frame mode, including neutral cast/receive flags while City retains shadow-map policy.
- Preserve City's terrain, water, camera, picker, capture, worker protocol, simulation model, and composition root during the first slice.
- Translate City's existing sparse upsert/remove stream to Voxel deltas and compare identity, bounds, culling, visuals, draw calls, update cost, capture, and teardown with its current growable batch.
- Verify package linking/bundling resolves exactly one Three.js runtime.
- Re-run AoE's unit/browser/visual/performance evidence after every shared-contract adjustment.

Exit evidence: a playable City path and AoE both use the public package without consumer types in Voxel. Changes to the City repository require explicit task authority; until then, Voxel owns only compile fixtures and adapter-contract evidence.

### 0.8 — evidence and hardening

- Add deterministic property/model tests for snapshots, deltas, chunk adjacency, dirty closures, job races, and picking.
- Fuzz unknown input shapes, typed-array aliases/detachment, numeric extremes, metadata sizes, and budget exhaustion.
- Add named AoE-like, City-like, chunk-edit, context-restore, and teardown endurance scenes with correctness checked beside timing.
- Record draw calls, triangles, instances, rebuilds, queue depth, stale/cancelled jobs, retained/copied bytes, GPU resources, captures, viewport/DPR, browser, OS, and hardware context.
- Run controlled screenshot baselines with fixed camera, viewport, DPR, clock, and tolerance policy.
- Verify dependency licenses, source/redistribution records, runtime-only audit, full audit, package contents, source maps, declarations, and no bundled Three.js duplicate.

Exit evidence: all declared budgets have measured baselines and justified thresholds; repeated runs do not leak; supported browser/OS lanes pass; no open high/critical dependency finding lacks an accepted expiring exception.

### 0.9 and 1.0 — freeze and release

- Freeze schema literals, discriminants, stable diagnostic codes, subpath exports, and 1.0 public declarations.
- Publish migration notes from 0.1 snapshots through each opt-in feature and rehearse clean installs in representative consumers.
- Produce a deterministic npm pack artifact from the release commit, record its integrity hash and contents, and attach it to an immutable Git tag or release.
- Require an adversarial code review with no unresolved substantive finding.
- Verify the release candidate against the complete supported matrix from a clean checkout. Any public or correctness change after that verification requires a new candidate and a new run.

The 1.0 tag is allowed only when every required exit gate has durable evidence linked from the implementation ledger.

#### No calendar soak

Earlier revisions required a one-week soak of the tagged candidate. That is removed. The
owner is currently the only consumer, distribution is private tag and packed artifact, and a
regression is therefore found and fixed by the same person who would have waited out the
window; the soak bought delay rather than information.

The risks a soak covers are kept, moved to gates that produce evidence directly instead of by
elapsed time:

- Accumulative leaks and time-dependent failures are E-04's job: 1,000 boundary edits, 100
  epoch replacements, repeated loss/restore and teardown cycles, all with measured resource
  plateaus. A soak observes those slowly; E-04 forces them.
- Flakiness is caught by repeated matrix runs, which do not need to be spread over days.
- Environment drift is real and unhurried by a soak: it is caught whenever the matrix next
  runs, which the release process already requires from a clean checkout.

Reinstate a soak window if the distribution model changes — a second team, a public registry,
or any consumer who cannot roll back on their own.

## Support and compatibility policy

- SemVer governs exported declarations, subpath exports, schema literals, operation discriminants, stable result statuses, and documented behavior after 1.0.
- New optional fields and new opt-in functions are minor releases. Removing or changing existing public contracts requires a major release.
- Data schemas are versioned separately from the package. A package may support multiple schema versions during migration.
- Snapshot-only adapters remain supported at 1.0. Deltas, workers, presented picking, and transfer ownership are opt-in capabilities.
- The `voxel/core`, `voxel/meshing`, and `voxel/testing` entries must install and execute without Three.js, DOM libraries, or a browser. The explicitly named `voxel/meshing/browser-worker` entry is browser-only.
- The Three entry uses one narrow optional peer range and is tested against every supported peer version before the range changes.
- Browser support claims name exact engines and platforms. Untested browsers may work but are not advertised as supported.
- Private Git/tag and packed-artifact distribution is the initial stable channel. Public registry publication is a separate product decision.

## Animation scope

Standing direction from the owner on 2026-07-15: **Voxel should support every animation City
and AoE2 already make, and potentially more. Keep the contract flexible and open.**

That direction is bounded by evidence, not by ambition. A survey of both consumers on the same
day found:

- **No skeletal animation anywhere.** No `SkinnedMesh`, morph target, `AnimationMixer`, or bone
  exists in either City or AoE2. Both animate entirely through per-instance transforms and
  material properties.
- **Two legitimate models, both already expressible.** AoE2 uses the parametric path: a batch
  declares per-instance period, phase, and translation/rotation/scale amplitudes, and Voxel
  evaluates `amplitude * sin(2*pi*t/period + phase)` from injected time, uploading nothing per
  frame. City computes matrices itself each frame for vehicles and pedestrians and sends them
  through ordinary batch updates.

So the non-goal above stands for now on the strength of the survey, not on principle. Nothing
is blocked.

Three real gaps are named rather than discovered later. They are the concrete meaning of
"potentially more":

1. **Continuous rotation.** The parametric model oscillates. A bobbing boat is natural; a
   turning windmill or gear cannot be expressed at all.
2. **Material animation.** `MaterialResourceV1` has no emissive or time fields, so City's night
   glow (emissive intensity) and water (a shader time uniform) cannot cross the boundary. This
   will block those City lanes even though it does not block buildings.
3. **Skeletal animation.** Not needed today. If a consumer ever needs a limb to bend, this
   returns as an explicit scope revision with its own evidence gates — not by accretion.

"Flexible and open" is a design constraint on the contract, not a licence to build all of it
now. Concretely, it means: extend animation additively behind versioned optional fields;
advertise each capability truthfully in the capability report so a consumer asks instead of
guessing; and never encode an assumption that rigid transforms are the only possible model.
The bar for implementing any of the three is the same as everywhere else in this plan — a real
consumer needs it, and the evidence gate is named before the code.

## Decision gates

The following decisions must be made from evidence at their named point:

1. Production mesher: decide after the 0.4 bake-off using correctness, seams, build complexity, bundle size, license, cold/warm time, allocation, and maintainability.
2. Transfer-owned ingest: add only after ordinary one-copy and delta paths are stable, and only if measured copies remain material.
3. Pick proxies: add only when a real AoE or City interaction cannot be expressed by presented voxel/instance hits.
4. Registry publication: decide after 0.9 package-name, provenance, license, ownership, and maintenance review.
5. Townscaper adoption: schedule after 1.0 unless its Three.js alignment and first geometry slice can be completed without delaying required evidence.

## Definition of done

“Implemented” means the contract exists in live exports, behavior has deterministic tests, browser/GPU claims have headless browser evidence, resource ownership has teardown proof, documentation describes the actual state, and the complete repository gate passes. A checked roadmap item without that evidence is a planning error and must be reopened.
