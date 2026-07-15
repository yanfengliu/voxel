# Voxel 1.0 implementation plan

Status: active from 2026-07-13. This is the executable work breakdown for [the 1.0 roadmap](v1-roadmap.md) and [target architecture](../design/v1-architecture.md). Check an item only when its named code and evidence exist. A milestone title is not evidence.

## Execution rules

- Work in dependency order and keep each change independently reviewable.
- Begin behavior changes with an externally meaningful failing test or fixture.
- Keep snapshot compatibility until a documented major-version decision explicitly says otherwise.
- Build package-internal seams before adding public API. Do not publish a type that has no complete lifecycle.
- Use deterministic unit/model tests for portable behavior and real headless WebGL for GPU/browser claims.
- Record performance baselines before optimizing or setting final thresholds.
- Run the smallest affected check while iterating and npm run verify before an implementation item is called complete.
- Run an adversarial review for public contracts, async scheduling, picking, context restoration, and release candidates.
- Review and commit each minimal coherent verified unit promptly, before unrelated work accumulates in the worktree.
- Do not modify City, Townscaper, or AoE2 from this repository unless the task explicitly grants sibling-repository authority.

## Status vocabulary

- Planned: design is accepted but implementation has not begun.
- In progress: live code or tests are being changed and the item is not yet through its gate.
- Implemented: code and targeted tests pass, but later milestone evidence may still be outstanding.
- Complete: the named exit evidence is durable and the full applicable gate passes.
- Blocked: a concrete dependency or authority is missing and safe local work is exhausted.

## Dependency map

    F foundations
      -> D atomic deltas and canonical state
        -> V indexed/worker voxel presentation
          -> P presented picking
        -> H host/readiness/context lifecycle
      -> C second-consumer integration (requires D and host-managed H; V only for voxel adoption)
    F + D + V + P + H + C
      -> E evidence and hardening
        -> R release candidate and 1.0

P and most of H may run in parallel after the presentation ledger exists. Mesher candidate integration waits for a frozen corpus and worker contract. City integration begins with its instance lane and does not wait for production voxel meshing.

## Baseline — verified 0.1.4

- [x] B-01: Record the clean baseline: package 0.1.4, main at faa00bf, 12 unit files/108 tests, typecheck, lint, build, packed portable fixture, and one real-browser lifecycle test passing on 2026-07-13.
- [x] B-02: Ground the 1.0 scope in live Voxel, AoE2, City, and Townscaper code rather than the earlier design alone.
- [x] B-03: Write the authoritative roadmap and target architecture with required/non-goal boundaries, release train, contracts, state machines, and evidence gates.

## F — foundations and truthful delivery

Current status after the first 0.2 implementation slice on 2026-07-13:

- [x] F-01 documentation routing, changelog/migration note, and support policy; local link/fence/whitespace checks pass.
- [x] F-02 declaration/API report, deterministic update, drift diagnostics, and in-memory diagnostic self-test.
- [ ] F-03 CI/package gates: workflow and local-equivalent gates are implemented; the first remote GitHub Actions run remains required before completion.
- [x] F-04 snapshot/delta copy instrumentation, defensive exports, canonical retention, deterministic RenderWorld read/reset hooks, and profiled presentation-staging current/peak telemetry are implemented. Unique output-buffer capacity is exact across provisional rejection, replacement, pending/frame overlap, commit, abort, reentrant settlement, and disposal.
- [x] F-05 prepared canonical snapshot ingest, exact world/base commit fencing, direct paged equality, defensive public access, presentation reuse, and mutable borrowed-scene isolation. A 257-instance color/animation regression proves one logical ownership copy across two fixed pages and runtime/world telemetry parity.
- [x] F-06 immutable truthful backend capability report and pre-commit compatibility behavior.
- [x] F-07 local support/consumer fixtures: policy, packed single-Three proof, exact TypeScript 5.7.3/5.9.3/6.0.3 compilers, and the City-shaped portable/host contract fixture are implemented. H-03 and C-01 subsequently upgraded that fixture to executable embedded-host coverage.

Historical local evidence recorded at the first foundation checkpoint on 2026-07-13, before the later D/V/H/C work: 14 unit files/117 tests, typecheck, lint, build, the exact three-compiler compatibility matrix and City core execution, API report/self-test, packed portable consumer, packed single-Three consumer, and the real headless WebGL lifecycle test passed under npm run verify. Runtime-only and full audits reported zero vulnerabilities. `npm pack --dry-run --json` reported 107 files, 73,060 packed bytes, and 349,216 unpacked bytes. Adversarial review found and closed canonical BufferAttribute aliasing, unbounded structural mesher readers, and a borrowed-scene documentation mismatch; final re-review reported no substantive finding. This paragraph is checkpoint provenance, not the current repository test or package count.

### F-01: Documentation routing

Deliverables:

- Link the roadmap, architecture, and this plan from README.md, docs/design/spec.md, and docs/plans/implementation.md.
- Label the old implementation ledger as historical/current-0.1 evidence and these documents as the forward 1.0 authority.
- Add a short support/distribution policy and changelog if they do not already exist.

Tests/evidence: Markdown fence balance, relative-link existence, whitespace check, and diff review.

Dependencies: B-03.

### F-02: Public API report

Deliverables:

- Add scripts/verify-public-api.mjs.
- Traverse every declaration reachable from the five exported declaration entry points after build; normalize line endings; record deterministic SHA-256 values and entry-point reachability in api/public-api.json.
- Add test:api and api:update scripts. Verification rejects missing, extra, or changed reachable declarations with a useful per-file diagnostic.
- Require intentional API changes to update the report, package changelog, and migration note together.

Tests/evidence:

- Current build matches the committed report.
- A test fixture with a modified declaration fails and names the file.
- A private unreachable declaration does not change the public report.
- Packed consumer still resolves all public declarations.

Dependencies: F-01.

### F-03: CI and package gates

Deliverables:

- Add GitHub Actions for supported Windows/Linux and Node combinations.
- Separate portable quality, real-browser, and audit/package jobs so browser installation is explicit.
- Verify npm ci, unit tests, typecheck, lint, build, API report, packed portable consumer, package contents, and headless Chromium lifecycle.
- Run runtime-only and full npm audits at high severity and upload failure diagnostics/captures only when useful.
- Add engines and package metadata only for combinations the matrix actually proves.

Planned support lanes: complete Ubuntu/Windows Node 22 gates including pinned Playwright Chromium, Ubuntu/Windows Node 24 portable/package compatibility, and named real-hardware runs for performance. SwiftShader CI proves correctness, not hardware frame-time claims.

Tests/evidence: workflow syntax review, local script parity, clean npm pack --dry-run contents, and first green remote run when remote CI is available.

Dependencies: F-02 for the API job; browser job may land earlier.

### F-04: Copy and retained-byte instrumentation

Deliverables:

- Add package-internal counters for input typed-array bytes, bytes copied into canonical ownership, defensive export bytes, current/peak retained bytes, and presentation staging bytes.
- Add a deterministic reset/read test hook under voxel/testing rather than mutable production globals.
- Measure the current snapshot path and preserve the result as a regression fixture.

Tests/evidence: every typed-array lane is counted once, shared buffers are not double-counted unless distinct retained ranges require it, and counters do not change validation outcomes.

Dependencies: F-01.

### F-05: Prepared canonical snapshot path

Deliverables:

- Extract shared parsing/budget logic and a package-internal prepared transaction token.
- Let RenderWorld and ThreeRenderRuntime use prepare → backend guard → commit.
- Expose only defensive snapshot copies publicly; presenters receive internal readonly canonical views and change sets.
- Remove the current validate/copy, RenderWorld validate/copy, and pendingSnapshot copy sequence from Three ingest.

TDD cases:

- Caller mutation after accept cannot alter canonical or presented state.
- Every invalid portable/backend case leaves accepted identity, canonical hash, retained bytes, pending state, and presented state unchanged.
- One accepted snapshot copies each newly retained typed-array byte exactly once before presentation.
- Existing public RenderWorld and Three snapshot behavior remains source- and runtime-compatible.

Dependencies: F-04.

### F-06: Truthful backend capability report

Deliverables:

- Add immutable ThreeRuntimeCapabilitiesV1 and getCapabilities.
- Report schema, topology, alpha, camera, worker, picking, context-restoration, viewport/DPR, and tested peer support.
- Move all backend compatibility checks ahead of canonical commit.
- Either implement line/point presentation before 1.0 or explicitly report/reject it; never imply support from portable validation alone.

Tests/evidence: capability values match executable preflight cases and are unchanged by runtime state.

Dependencies: F-05.

### F-07: Distribution/support policy and consumer fixtures

Deliverables:

- Document supported Node 22/24 portable entries, TypeScript declaration checks against AoE 5.7/Voxel 5.9/City 6.0, Chromium/WebGL2 on Windows/Linux, the tested Three 0.185 line, and private-tag distribution.
- Add a packed Three consumer that verifies exactly one Three runtime identity.
- Add a Voxel-owned City-shaped compile/runtime fixture using sparse building-shaped data without importing City types. The foundation slice may define and compile-check the perspective borrowed-host boundary before H exists, but must not pretend that boundary executes.

Foundation interpretation: the initial City fixture executed sparse building data through the portable snapshot lane and defined the real borrowed `WebGLRenderer`/`Scene`/`PerspectiveCamera` host shape. H-02 added that camera through the `view` policy, and H-03/C-01 subsequently upgraded the fixture to executable host-managed embedding. Camera support alone was never counted as embedding proof.

Tests/evidence: core-only packed fixture has no Three/DOM dependency; Three fixture has one runtime; the exact compiler matrix passes; the City core lane executes; unsupported combinations are not advertised.

Dependencies: F-03 and F-06. The perspective portion may initially be compile-only until H is complete.

F exit gate: one-copy snapshot ingest, truthful capabilities, API and package gates, support policy, and local CI-equivalent commands pass with no public snapshot regression.

## D — canonical transactions and sparse deltas

Current status after the paged-delta implementation slice:

- [x] D-01 additive schema/result/operation types, stable issue codes, optional transaction limits, neutral shadow participation, compiler fixtures, and migration examples.
- [x] D-02 immutable canonical lane indexes, deterministic materialization, per-lane incarnation tombstones, same-epoch snapshot ABA rejection, and defensive public access.
- [x] D-03 atomic reducer, compact prepared change sets, resync ordering, final-graph/backend rejection, operation-order independence, and deterministic reference-model parity.
- [x] D-04 fixed 256-slot copy-on-write pages, deterministic keyed compaction, exact presenter ranges, bounded copied bytes, and sparse runtime upload metrics.
- [ ] D-05 reentrancy-safe ledger, readiness, abortable waiters, and synchronous runtime integration are implemented; worker dependency groups and host frame-ticket effects must integrate before completion.
- [ ] D-06 transfer-owned path remains measurement-gated.

### D-01: Freeze delta schemas and issue codes

Deliverables:

- Add RenderRevisionRefV1, render-delta/1, put/remove operations, PatchBatchInstancesV1, DeltaApplyResultV1, neutral optional batch cast/receive policy, and hard/default transaction limits exactly as accepted in the architecture.
- Export diagnostic code constants or a documented stable code table where consumers branch on them.
- Add migration examples showing snapshot-only, resync, and sparse batch paths.

TDD cases: compile-only old consumer; exhaustive type fixtures; schema/discriminant literals; unknown fields policy; numeric/path diagnostics.

Dependencies: F-02 and F-05.

### D-02: Immutable canonical state store

Deliverables:

- Replace whole-array state as the internal authority with immutable maps for resources, chunks, batches, and per-lane tombstones.
- Preserve deterministic defensive snapshot materialization.
- Track unique retained bytes and enforce live-plus-tombstone bounds.

TDD cases: full snapshot parity, epoch reset, deterministic iteration/export, key/incarnation/revision rules, tombstone reclamation, defensive export mutation.

Dependencies: D-01.

### D-03: Atomic delta reducer

Deliverables:

- Implement acceptDelta in RenderWorld and ThreeRenderRuntime.
- Perform header resync checks, one-target validation, old/new candidate construction, final-graph references, limits, backend guard, and atomic commit.
- Emit a lane/key change set for presentation.

TDD cases:

- Create/update/recreate/remove for every lane.
- No world, wrong world/epoch/base, replay, and out-of-order resync.
- Missing/wrong incarnation, non-monotonic resource revision, tombstone reuse, duplicate targets, and invalid final references.
- A resource may be removed in the same delta that every dependent is removed or rebound.
- Every failure preserves canonical hash/identity/bytes and presentation ledger.

Dependencies: D-02.

### D-04: Paged sparse instance batches

Deliverables:

- Store matrices, colors, and animation attributes in fixed-size copy-on-write pages with key-to-slot mapping.
- Apply unique disjoint remove/upsert sets and preserve optional lane layout.
- Emit bounded presenter update ranges while keeping external instance keys independent from slots.

TDD cases: add/update/remove/swap removal, page boundary, last element, colors/animation presence, stable keys, deterministic materialization, bounded copied bytes, and full put/patch equivalence.

Dependencies: D-03.

### D-05: Presentation ledger and waiters

Deliverables:

- Track the accepted transaction chain, target effects, complete staged revisions, globally presentedThrough state, and bounded waiter registry.
- Add presentationReadiness and awaitPresented with AbortSignal.
- Settle targets deterministically on presentation, safe supersession, epoch replacement, failure, abort, and dispose.

TDD cases: numeric revision gaps, d1/d2 coalescing, independent effects, render failure, lost/restoring, already-aborted signal, abort race, epoch reset, disposal, and no waiter leak.

Dependencies: D-03. V and H integrate their effects before this item is complete.

### D-06: Optional transfer-owned path decision

Deliverables:

- Measure ordinary ingest in named scenes after D-04.
- If copies remain material, implement branded claim/take APIs and the buffer audit from the architecture; otherwise record a decision to defer.

Required tests if implemented: accepted and rejected detachment, complete transfer list, detached/duplicate/foreign/overlapping/SharedArrayBuffer cases, no extra retained copy, disposal, and documentation warning.

Dependencies: D-04 and measured evidence. This is not automatically a 1.0 blocker.

D exit gate: model-generated delta chains equal reference full snapshots; sparse City-shaped updates scale with changed pages/ranges; resync and rejection are atomic; snapshot-only compatibility remains green.

## V — production voxel pipeline

Current status after the indexed-oracle slice:

- [x] V-01 uniform profile, checked coordinate math, alignment, and missing-neighbor policy.
- [x] V-02 O(1) chunk index, slot generations, and dependency signatures.
- [x] V-03 exact bounded dirty closures and deterministic preparation groups.
- [x] V-04 pure mesher contract, hard result validation, frozen corpus, oriented-face oracle, and selection ADR template.
- [x] V-05 indexed copied-halo synchronous oracle, local-space geometry, aggregate work budgets, and profiled-world Three integration.
- [x] V-06 packaged Three-free module worker, copied transfer ownership, hard result protocol, offline/CSP path, startup failure, and real headless-browser evidence.
- [x] V-07 bounded deterministic scheduler, group leases, coalescing/cancellation, one-crash retry, three eligibility firewalls, lifecycle accounting, and 39 focused tests.
- [ ] V-08 revision-atomic staging is in progress; whole-target scheduler admission and the internal target coordinator now join deterministic multi-group completion, off-scene ownership transfer, supersession fencing, zero-job targets, generation-aware worker-crash retry/failure routing, and cleanup. A bounded internal browser-worker driver owns generation-captured ports/listeners, queues transport delivery without scheduler reentrancy, preserves message-before-error ordering, pumps once per advance cycle, and retries scoped teardown. The legacy runtime's complete root/presenter lifecycle is centralized behind one presentation-surface owner so an atomic mode will not share or double-own its graph. An asynchronous-startup circuit breaker, overflow-receipt accounting, runtime/frame integration, presented-store commit, and browser evidence remain open.
- [ ] V-09 has a corpus-correct in-repo greedy candidate, packaged-worker proof, reproducible benchmark harness/baseline, external feasibility audit, and [provisional selection ADR](../architecture/mesher-selection.md); final production acceptance waits for V-08 end-to-end evidence.
- [ ] V-10 remains planned behind V-08/V-09.

### V-01: Uniform profile and coordinate math

Deliverables:

- Add UniformVoxelChunkProfileV1, checked coordinate conversion, canonical coordinate keys, alignment validation, and explicit missing-neighbor policy.
- Keep unprofiled arbitrary chunks on the bounded compatibility/oracle path.

TDD cases: negative floor division, nonzero grid origin, safe-integer edges, alignment, duplicate coordinate, profile immutability, and new-epoch requirement.

Dependencies: D-02.

### V-02: ChunkIndex, slot generations, and dependency signatures

Deliverables:

- Add O(1) coordinate lookup, six-face neighbors, monotonically increasing slot generations, canonical signatures, and old/new index views.

TDD cases: add/remove/recreate ABA, key/incarnation/revision changes, explicit missing tokens, deterministic signatures, and no linear whole-world neighbor scan.

Dependencies: V-01.

### V-03: Exact dirty closure

Deliverables:

- Derive direct dirties from transaction changes and dependent rebuild targets from declared mesher offsets using old and new indexes.
- Union overlapping closures into deterministic preparation groups without recursive world expansion.
- Distinguish topology, attribute, and material-only invalidation.

TDD cases: all six boundaries, create/update/delete/move, palette color/opacity, material rebind, neighbor availability, overlapping closures, and no accidental transitive rebuild.

Dependencies: V-02 and D-03.

### V-04: Freeze mesher interface, corpus, and selection ADR template

Deliverables:

- Define pure input/output/descriptor contracts and hard result validation.
- Add empty, solid, hollow, checkerboard, staircase, stripes, negative, all-neighbor, seeded-random, AoE-like, City-like, column, and worst-output fixtures.
- Add oriented-unit-face comparison so topology can be compared independent of greedy quad layout.
- Predeclare correctness, reproducibility, license, build, package, and performance selection rules.

Dependencies: V-01. Must complete before candidate integration.

### V-05: Indexed synchronous oracle

Deliverables:

- Run the visible-face oracle through ChunkIndex and copied halo samples.
- Emit local-space geometry and exact bounds while preserving deterministic topology.
- Remove the 512-chunk adapter cap from profiled worlds; replace it with declared count/byte/work budgets.

TDD cases: oracle parity, seams, anisotropic scale, negative coordinates, output exhaustion, and large indexed world lookup.

Dependencies: V-03 and V-04.

### V-06: Worker artifact and protocol

Deliverables:

- Add the Three-free mesh-worker/1 protocol and built worker entry.
- Resolve the worker relative to installed runtime code, include it in npm pack, and expose the bundler-recognized browser launcher only through `voxel/meshing/browser-worker` so the primary meshing entry stays DOM-free.
- Copy canonical chunk/halo data to job-owned transfer buffers and validate all returned buffers.

TDD/browser cases: malformed request/result, canonical buffers remain attached, offline packed-worker load, CSP-compatible module worker path, output limits, and worker startup failure.

Dependencies: V-04 and F-03.

### V-07: Scheduler and stale-result firewall

Deliverables:

- Add configurable bounded workers, deterministic priority/starvation promotion, dispatch-time allocation, coalescing, logical/cooperative cancellation, one crash retry, and metrics.
- Apply every eligibility check from the architecture on receipt, group completion, and commit.

TDD cases: deterministic order, queue overflow, newest coalescing, all stale conditions, duplicate result, crash/retry, deterministic failure, epoch swap, late result after dispose, and bounded queue/staging memory.

Dependencies: V-03 and V-06.

### V-08: Revision-atomic staging and presentation

Deliverables:

- Stage CPU and GPU replacements off-scene by target revision.
- Commit all lanes and presented stores in one frame-boundary transaction only when every effect is ready.
- Mark presented only after a successful render; dispose old resources afterward.
- Preserve/reconstruct the last displayed revision on preparation, swap, render, or context failure.

TDD/browser cases: every R/R+1/R+2 completion order, partial group failure, GPU creation throw, render throw, no mixed seam frame, accepted-newer picking/capture, loss during staging, and stable resources after 1,000 boundary edits/100 epochs.

Dependencies: V-07, D-05, and H lifecycle hooks.

### V-09: Mesher bake-off and production selection

Deliverables:

- Pin source/version/SHA/toolchain/lock/license/notice for Voxelize and block-mesh-rs experiments where feasible.
- Run the frozen corpus and named measurements against oracle and candidates.
- Record an ADR selecting a candidate or an in-repo production implementation under the predeclared rule.
- Remove rejected experimental dependencies and artifacts.

Dependencies: V-04, V-06, and baseline harness. Candidate production integration must pass V-08 behavior.

### V-10: Culling and pipeline metrics

Deliverables:

- Use one local-space mesh per nonempty chunk, exact bounds, grid transform, and Three frustum culling.
- Report loaded/nonempty/in-frustum/drawn chunks, job and byte high-water marks, generated topology, commits/failures, and resource reuse/disposal.

Dependencies: V-08 and V-09.

V exit gate: the selected production path matches oracle coverage, packaged workers behave under races, global revisions are atomic, no stale output presents, edit storms stay bounded, and named voxel scenes meet accepted budgets.

## P — presented-state picking

Current status:

- [x] P-01 bounded plain query/result identities, validation, lifecycle/budget outcomes, and deterministic distance/lane/stable-identity ordering.
- [ ] P-02/P-03 internal voxel and exact instance query paths, work caps, committed snapshot/store objects, and focused tests are implemented; `ThreeRenderRuntime` integration/publication and public exposure wait for V-08 integration.
- [ ] P-04 remains planned behind the committed composite runtime path.

### P-01: Plain query/result contracts

Deliverables: PickQueryV1, voxel/instance hit types, full presented identity, max work/hits, lane selection, distance/lane ordering, and stable tie rules.

Dependencies: F-02 and D-05.

### P-02: Presented voxel store

Deliverables:

- Commit occupancy/index/bounds with chunk meshes.
- Convert world rays correctly for anisotropic voxel scale and query only displayed state.
- Return chunk and voxel identity with exact world distance/normal/point.

TDD cases: current DDA cases plus anisotropic scale, pending edit, deletion/recreate, atomic seam swap, budget exhaustion, and context states.

Dependencies: V-08 and P-01.

### P-03: Presented instance picking

Deliverables:

- Raycast the exact matrices last uploaded/rendered, including animation.
- Map Three instanceId through the displayed key table and return batch/geometry/instance identity.
- Instrument candidate counts; keep spatial sharding consumer-configured until measurements justify more acceleration.

TDD/browser cases: static/animated matrices, swap removal, batch replacement, pending delta, exact ties, culling bounds, and resource disposal.

Dependencies: D-04, P-01, and frame animation integration.

### P-04: Composite ordering and optional proxy decision

Deliverables:

- Merge bounded voxel/instance hits under deterministic ordering.
- Run AoE/City interaction fixtures. Add versioned AABB/sphere proxies only if a demonstrated logical hit area cannot be represented by displayed geometry.

Dependencies: P-02 and P-03.

P exit gate: automated rays agree with fixed captures through pending updates, animation, loss/restore, and disposal; accepted-but-unpresented content never hits.

## H — host, camera, readiness, capture, and recovery

Current status after the lifecycle/camera slice:

- [x] H-01 explicit runtime states, stable failures, waiter integration, generation fences, transactional rollback, last-presented CPU reconstruction, and reentrancy-safe retryable disposal.
- [x] H-02 isometric, owned-perspective, and borrowed-camera strategies; explicit projection/viewport ownership; finite-safe projection and ray helpers; legacy compatibility.
- [x] H-03 host-managed frame tickets, standalone protocol reuse, rollback, generation/reentrancy fences, immutable manifests, and an adversarial borrowed-renderer reentrancy regression are implemented and independently reviewed.
- [ ] H-04 internal revision-aware capture contracts, coordinator, exact manifest/parity tests, and bounded lease cleanup are implemented; public `ThreeRenderRuntime` integration, exports, and browser evidence remain.
- [ ] H-05 remains planned at committed HEAD; its reconstruction seam depends on the V-08 presenter transaction boundary.

### H-01: Runtime lifecycle state machine

Deliverables: internal initializing/running/lost/restoring/failed/disposed states, legal transitions, stable diagnostics, a richer runtimeStatus API, source-compatible legacy metrics.state projection, and integration with presentation waiters.

TDD cases: constructor rollback, loss in each phase, duplicate events, terminal failure, input policy by state, and idempotent dispose.

Dependencies: F-05 and D-05.

### H-02: Camera strategy union

Deliverables:

- Add isometric orthographic, owned perspective, and borrowed generic camera modes.
- Define host/runtime resize ownership and preserve legacy option normalization.
- Add world/screen/ray helpers where behavior is unambiguous; leave controls and game camera intent to consumers.

TDD/browser cases: projection/resize/DPR in both owned modes, borrowed non-mutation, legacy parity, finite/range validation, and disposal ownership.

Dependencies: F-06.

### H-03: Host-managed embedded frame protocol

Deliverables:

- Add a mode that never changes borrowed renderer size/DPR, borrowed camera, host scene settings, shadow policy, animation loop, or final render ordering.
- Prepare Voxel scene changes and animation for a host frame, then return a single-use frame ticket.
- The host reports rendered success or abort/failure; only successful completion may advance globally presented state.
- Keep the current runtime-owned render call as standalone compatibility mode.
- Snapshot camera projection/world matrices, viewport/DPR, device generation, and camera generation at successful commit for pick/capture parity.

TDD/City-shaped cases: host renders once, abort retains old presented state, duplicate/late ticket completion rejects, borrowed settings remain byte-for-byte unchanged, and dispose removes only Voxel roots/resources.

Dependencies: H-01, H-02, and D-05.

### H-04: Revision-aware capture

Deliverables: captureWhenPresented, captureWithManifest, typed unavailable states, explicit readback, and exact summary/resource manifests while retaining synchronous capture in runtime-rendered mode. Embedded mode returns host-capture-owned unless the host supplies an explicit bounded capture lease; Voxel never performs an extra shared-renderer draw for capture.

TDD/browser cases: target ready/pending/superseded, abort, lost/restoring/failed/disposed, viewport/DPR, no preserveDrawingBuffer dependency, and manifest/display parity.

Dependencies: H-01, H-03, and D-05.

### H-05: Real context reconstruction

Deliverables:

- Rebuild renderer-owned GPU objects, presenters, state, size/DPR, camera policy, daylight, and staged targets from canonical CPU state.
- Render the prior displayed revision before ready, then present a newer complete target when available.
- Bound retries and enter failed on terminal reconstruction error.

TDD/browser cases: loss before/after accept, during worker/upload/host ticket/capture, repeated loss/restore, failed restore, exact readiness, stable resources, and disposal from every state.

Dependencies: H-01, V-08 hooks, and H-03.

H exit gate: standalone and genuinely host-managed embedded modes work with orthographic/perspective/borrowed cameras; capture/readiness are exact; real context restoration and ownership pass repeated browser tests.

## C — consumer proof

Current status:

- [x] C-01 Voxel-owned City-shaped sparse building fixture executes through a borrowed renderer/scene, perspective camera, host-owned prepare/draw/commit/capture/resize loop, neutral shadow policy, bounds, generational replacement, sparse upload metrics, and ownership-safe teardown across the TypeScript compatibility matrix.
- [ ] C-02 through C-04 still require the design/authority gate and real-consumer regression evidence.

### C-01: Voxel-owned City compatibility fixture

Deliverables: a fixture shaped like City's BuildingsView sparse upsert/remove stream, PerspectiveCamera, borrowed renderer/scene, host-owned resize/render/capture loop, neutral cast/receive flags, bounds, and teardown expectations.

Dependencies: D-04 and H-03.

### C-02: City integration design and authority gate

Deliverables:

- Trace the current City building, worker-diff, scene, camera, picker, capture, and teardown paths at implementation time.
- Write a City-owned migration plan limiting the first slice to one building lane.
- Obtain explicit authority before editing the sibling repository.

Dependencies: C-01. This is the only acceptable blocking point for sibling writes.

### C-03: City building-lane adapter

Deliverables: translate one opaque building lane's existing add/update/remove messages to Voxel batch transactions in host-managed embedded mode while preserving City simulation types, host-owned shadow-map policy, facade/custom-material lane, and all other render lanes.

Tests/evidence: identity/generation, add/update/remove, perspective bounds/culling, visual parity, one Three identity, draw/update budgets, context behavior, hot replacement, and teardown.

Dependencies: C-02 authority and green gates, D-04, H-03.

### C-04: Cross-consumer regression

Deliverables: re-run AoE's complete package/unit/browser/visual/performance checks and City's applicable gates; reconcile only genuinely shared contracts.

Dependencies: C-03.

C exit gate: AoE and a playable City lane use public Voxel without game types or duplicate Three; both retain their authoritative simulation and consumer-owned visual semantics.

## E — evidence and hardening

### E-01: Model/property/fuzz suite

Cover snapshot/delta equivalence, unknown shapes, numeric extremes, metadata/byte/work budgets, typed-array alias/detachment, chunk edits, completion permutations, picking, and lifecycle races using deterministic seeds recorded on failure.

Dependencies: feature milestones.

### E-02: Named reference scenes

Add fixed solid/staircase/checkerboard chunks, 9×9 boundary edit field, AoE-like terrain, City-like 10k/50k sparse instances, combined picking, context reconstruction, and teardown endurance scenes.

Record browser, OS, hardware/GPU, viewport, DPR, clock, scene seed, package commit, draw/topology/resources, queue/staging/copy bytes, timings, correctness result, and capture identity.

Dependencies: V, P, H, C.

### E-03: Visual regression

Use fixed camera, viewport, DPR, injected clock, and controlled Chromium lane. Keep structural geometry assertions authoritative and use documented screenshot tolerances for raster evidence.

Dependencies: E-02.

### E-04: Endurance and cleanup

Run at least 1,000 boundary edits, 100 epoch replacements, repeated sparse batch changes, repeated context losses/restores, capture aborts, and runtime rebuild/dispose cycles. Prove plateaued workers, listeners, waiters, geometries, materials, programs, textures, buffers, render targets, and staging memory.

Dependencies: E-02.

### E-05: Supply chain and artifact audit

Record every external mesher/source/asset version, SHA, license, notices, build toolchain, generated hash, and redistribution requirement. Run runtime/full audits and inspect packed contents/source maps/declarations/worker URLs/Three externalization.

Dependencies: V-09 and F-03.

E exit gate: every support/performance claim has repeatable evidence, no leak or stale presentation remains, audits meet policy, and complete local/CI gates pass.

## R — release candidate and 1.0

### R-01: API/schema freeze

- Freeze public declarations, exports, schema literals, operation discriminants, stable result/diagnostic codes, support matrix, and ownership semantics.
- Resolve every accidental API report difference and remove undocumented experimental exports.

### R-02: Migration and clean-consumer rehearsal

- Document 0.1 snapshot compatibility, opt-in deltas/workers/picking/host changes, and any deprecation.
- Install the packed RC into clean portable, AoE-shaped, and City-shaped fixtures and the authorized real consumers.

### R-03: Adversarial review

- Review correctness, atomicity, stale races, seams, copy/transfer ownership, picking parity, host mutation, context restoration, leaks, API compatibility, supply chain, and unsupported claims.
- Every substantive finding blocks the RC until fixed and reverified.

### R-04: Immutable candidate and soak

- Produce tarball, integrity hash, contents manifest, source commit, environment, audit results, and evidence index.
- Tag a release candidate and run the full matrix without public/correctness changes for the soak window. Any such change creates a new RC.

### R-05: 1.0.0

- Confirm every roadmap requirement and exit gate from live evidence.
- Finalize changelog, support policy, migration guide, known limitations, and post-1.0 backlog.
- Tag the verified commit and attach the reproducible private artifact. Registry publication remains separately authorized.

R exit gate: no required item is incomplete, no substantive review issue is open, the RC soak is green, and the artifact can be reproduced from the tag.

## Verification command matrix

The package scripts remain the authority. The target gate grows to cover:

| Change | Iteration checks | Completion checks |
| --- | --- | --- |
| Documentation only | relative links, fences, whitespace, diff | documentation checks plus API report if exports are described |
| Core contract/state | targeted Vitest, typecheck | unit/model/fuzz, packed core fixture, API report, full verify |
| Meshing/index | targeted fixtures/property tests | oracle parity, race harness, worker pack/browser, full verify |
| Three presenter/host | targeted unit tests | real WebGL lifecycle/capture/context tests, leak metrics, full verify |
| Picking | portable unit plus presenter tests | fixed browser rays/captures, performance budget, full verify |
| Dependency | targeted build/tests | lockfile, runtime/full audits, license record, pack inspection, full verify |
| Public API | type fixtures | API update, changelog/migration, packed consumers, adversarial review, full verify |
| Release candidate | all above | clean install, complete CI/support matrix, artifact hash, soak |

## Risk register

### Atomic staging memory

Risk: globally atomic revisions retain old display plus new CPU/GPU staging.

Control: preflight current/peak staging budgets, structural sharing, bounded closure/atomic chunk limits, no GPU allocation for stale results, and explicit backpressure/rejection before accepted state when work cannot be scheduled.

### Worker cancellation and late output

Risk: synchronous WASM cannot be forcibly interrupted and old work completes after newer state.

Control: logical cancellation, complete identity signatures, eligibility checks at three boundaries, bounded queue/workers, result disposal, and process termination on epoch/dispose.

### Delta implementation becomes O(world)

Risk: sparse input still clones full arrays/maps or revalidates every scalar.

Control: immutable lane maps, paged instance storage, final-reference indexes, copied/work metrics, and City-shaped complexity assertions.

### Context restore reports readiness too early

Risk: event receipt is mistaken for reconstructed visible state.

Control: restoring state, rebuild from CPU authority, successful render requirement, typed readiness, and repeated real-browser tests.

### Host-managed mode mutates City ownership

Risk: embedded Voxel changes renderer size/DPR, camera, shadows, loop, or final render.

Control: explicit host mode, frame ticket, borrowed object snapshots in tests, and a first slice limited to one root/lane.

### Candidate supply-chain burden

Risk: a faster mesher adds opaque generated WASM, licensing, toolchain, or maintenance risk.

Control: frozen bake-off gates, pinned sources/toolchain/hash/notices, offline reproducibility, package budget, and removal of rejected experiments.

### Picking scales poorly

Risk: large unsharded instance batches make raycasting exceed budget.

Control: stable consumer spatial shards, candidate metrics, bounded max hits/work, and measured adoption of focused acceleration only when the named scene fails.

### Scope expansion delays a stable renderer

Risk: WebGPU, LOD, skeletal animation, effects, or a general scene graph displace required correctness work.

Control: roadmap non-goals and decision gates. New 1.0 scope requires an explicit revision to the roadmap, critical path, and exit evidence.

## Immediate implementation slice

The foundation telemetry gap is closed. The current critical path resumes at V-08:

1. Give every synchronous presenter an explicit prepare/activate/commit/abort ownership boundary with rollback tests and no live-scene mutation during preparation.
2. Integrate eligible worker groups into the same whole-revision transaction and prove that render or host-ticket failure restores the prior displayed scene and stores.
3. Publish the committed presented voxel/instance stores and complete P-02 through P-04 without reading accepted or mutable host state.
4. Complete H-04 revision-aware capture against the same committed manifest.
5. Redesign H-05 reconstruction as prepare plus standalone/embedded draw acknowledgement plus commit/abort; never publish readiness from an internal draw that violates host ownership.
6. Close V-09/V-10 with end-to-end selection evidence, culling, resource metrics, and edit-storm bounds.

Each numbered step is split into minimal coherent verified commits and receives adversarial review as soon as its first public, async, presentation, or ownership boundary exists.
