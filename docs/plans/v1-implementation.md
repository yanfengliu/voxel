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
- [x] D-05 reentrancy-safe ledger, readiness, abortable waiters, and synchronous runtime integration are implemented, and both integrations the item waited on are now pinned from outside the package. A worker-meshed revision settles its waiter only once a draw has acknowledged it, never at accept time, in both host modes: the runtime's own draw standalone, and the host's frame-ticket commit embedded. Disposal settles waiters as terminal `unavailable`/`disposed` rather than transient `not-ready`, so a caller stops waiting instead of retrying forever, and a lost device reports `context-lost` while the revision is still accepted and still meshed.
- [x] D-06 deferred past 1.0 on 2026-07-15, which the item's own terms allow: it is not automatically a 1.0 blocker, and it only implements when copies prove material. They have not. No consumer reports copy cost as a problem, and the telemetry that would reveal one ships and is tested, so this is discoverable rather than assumed: `snapshotInputTypedArrayBytes`, `snapshotCopiedTypedArrayBytes`, and `snapshotCopyOperations` for snapshots, with the equivalent delta counters, expose exactly the ratio the decision turns on.

  Deferring is the conservative direction here, not the expedient one. An ownership-taking API detaches the caller's buffers, and the load-bearing boundary is that simulation-owned memory is never transferred; shipping that tool before a measurement demands it invites a consumer to detach memory its own simulation still reads. It is also purely additive, so adding it later breaks nothing that 1.0 froze.

  Reopen when a named E-02 scene shows ingest copies material against its frame budget. The full implementation obligation stands unchanged if that happens: branded claim/take, accepted and rejected detachment, complete transfer list, detached/duplicate/foreign/overlapping/SharedArrayBuffer cases, no extra retained copy, disposal, and the documentation warning.

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
- [x] V-07 bounded deterministic scheduler, group leases, coalescing/cancellation, one-crash retry, a timer-free unproven-generation startup circuit with one half-open probe, three eligibility firewalls, lifecycle accounting, focused tests, and real Chromium asynchronous module-failure teardown evidence.
- [x] V-08 revision-atomic staging is implemented for both host modes. Whole-target scheduler admission and the internal target coordinator join deterministic multi-group completion, off-scene ownership transfer, supersession fencing, zero-job targets, generation-aware worker-crash retry/failure routing, and cleanup. A bounded internal browser-worker driver owns generation-captured ports/listeners, reserves one in-order fail-closed crash receipt per worker under the total queue cap, queues transport delivery without scheduler reentrancy, preserves message-before-error ordering, pumps once per advance cycle, and retries scoped teardown before same-slot replacement. A cross-layer frame transaction sequences the canonical presentation ticket, the staged Three scene lease, and a reversible committed pick-snapshot publication owner: activation and validation precede the draw, tentative scene-then-canonical publication follows it, canonical finalization is the irrevocable commit whose synchronous waiter callbacks may reentrantly present a newer revision, and predecessor retirement happens only afterwards. The scheduler exposes nonmutating `preflightTarget`/`preflightReplacingEpochTarget`, and the coordinator's `prepareAdmissionInternal`/`activateAdmissionInternal`/`cancelAdmissionInternal` let the runtime reserve admission before canonical acceptance and cancel it on rejection, supersession, or disposal. `ThreeRenderRuntime` reserves admission before the canonical commit, activates only when the committed world still matches, drives worker events and commits each ready target through the transaction after its draw, refuses reentrant mid-draw acceptance while a presentation is in flight, bounds re-admission of a lost pending target before failing explicitly, and rejects unprofiled candidates so one runtime never mixes presentation owners. Headless Chromium proves a real packaged worker and WebGL2 draw commit revisions with no observable mixed frame. Both host modes now drive the same transaction: the prepare half activates a ready revision and the commit half acknowledges the draw, so a standalone frame and an embedded host's frame ticket differ only in who draws in between. An orphaned atomic ticket is settled at the device transition, because a stale ticket can be neither committed nor aborted by its host and would otherwise hold its target for the rest of the session; the rolled-back revision re-admits and presents after restoration.
- [x] V-09 accepted `voxel.greedy-opaque` for production on 2026-07-15. Every budget the [selection ADR](../architecture/mesher-selection.md) fixed on 2026-07-14, before any result existed, is met and none was relaxed: 252,574 packed and 1,223,381 unpacked bytes against 350,000/1,700,000; a 21,162-byte gzip worker closure across 20 modules against 120,000; a 36.3 ms cold module-worker p95 against 100 ms; and 768/1,008 peak staging bytes against 72 MiB per active job. The integration gates are met by the frame transaction, the eligibility firewalls, restoration in all three host modes, the packed-worker check, and a real-WebGL endurance run. No external candidate reached benchmarking, so the 30-percent end-to-end rule that governs one is moot. Accepted-to-presented latency is recorded rather than asserted because the browser lane is SwiftShader; named-hardware timings remain E-02's obligation and the release measurement must rerun from the immutable RC commit.
- [x] V-10 culling and pipeline metrics. Culling was already structural: one local-space mesh per nonempty chunk, exact bounds from the mesher's own output, a grid transform per chunk, and Three's default frustum test. What was missing was the reporting, so `ThreeRenderMetrics.atomic` now carries it: loaded, nonempty, and in-frustum chunks; presented and failed targets; staging, queue, and worker-event high-water marks; and the retirement backlog. In-frustum is computed against the live camera rather than read back, because the renderer reports one total draw count and cannot attribute draws to this lane. A test pins that pointing the camera away leaves chunks loaded and nonempty while drawing none, and the endurance suite pins 1,000 presented targets with none terminal.

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
- [x] P-02/P-03 internal voxel and exact instance query paths, work caps, committed snapshot/store objects, and focused tests are implemented and published. Each drawn revision's committed pick candidate is built from its exact canonical state, presented bundle, and frame manifest, and joined to the V-08 frame transaction through a reversible publication owner, so the query lane advances with the canvas or not at all. Instance material slots mirror the presenter's own resolution.
- [x] P-04 composite ordering is published through `ThreeRenderRuntime.pickPresented`, which merges bounded voxel and instance hits under the P-01 deterministic ordering and reads no accepted, pending, mutable-camera, or live-presenter state. Optional logical proxies remain undecided: no AoE2 or City interaction has yet demonstrated a hit area that displayed geometry cannot express, so none are added. Public capability advertisement waits for the voxel worker option to become public.

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
- [x] H-04 revision-aware capture is published. The runtime retains the manifest of the frame it last presented and adapts it to the capture port, so `captureWithManifest` describes the frame the canvas currently shows and `captureWhenPresented` resolves only once the requested revision has actually been drawn; an accepted-but-undrawn revision is never captured as ready. Runtime-owned capture issues one readback fenced to the committed manifest and its device generation; embedded hosts retain capture ownership; manifests enumerate only presented canonical state. Fixed-camera visual baselines remain E-03 work.
- [x] H-05 context restoration works in every host mode and is proven. Standalone hosts restore
  through `frame()`; embedded
  hosts now restore through the frame-ticket protocol they already own, because they may never
  call `frame()` and previously stayed `restoring` for the rest of the session. The atomic
  worker path is proven to keep its displayed revision across a loss: the staged bundles are
  CPU-side Three objects the renderer re-uploads. Repeated loss/restore cycles are pinned for
  drift.

  The bounded checkpoint/retry/resource-ownership prototype was retired rather than wired
  (removed 2026-07-15; preserved at `5d2ffea`). It predated V-08, and the design it modelled —
  prepare, then an explicit draw acknowledgement, then commit — is now realised in the runtime
  itself through the host frame ticket, which is the acknowledgement the prototype lacked. It
  imported nothing, was reachable from no export, and shipped 32,865 dead bytes while its 28
  green tests made reconstruction look implemented where it was not. Its remaining unmodelled
  idea is retry beyond a single attempt; the runtime instead treats a reconstruction error as
  terminal, and a real transient-failure case should motivate any retry policy.

  Thirty real WebGL2 device losses now run against a live context: each one is detected, each
  rebuild resumes to running, and a fresh revision accepts and presents after every one, so the
  pipeline keeps working rather than merely surviving. Each rebuild re-uploads exactly the
  displayed revision and no predecessor, and the pipeline's occupancy returns to zero every
  cycle. That test deliberately does not carry the GPU-release claim: a context loss resets
  Three's `info.memory`, so a leaked bundle is invisible to it and stubbing retirement leaves its
  numbers unchanged. The repeated-edits test carries release instead, and does climb 2 to 30 when
  retirement is stubbed. Loss between an embedded prepare and commit is covered by the atomic
  host-frame suite.

  A reconstruction that cannot rebuild the device is terminal and exercised end to end: the
  runtime reports `three.runtime.restore-failed` once, does not count the failed frame, refuses
  later frames rather than silently retrying, and still disposes cleanly. Retry beyond a single
  attempt stays unmodelled until a real transient-failure case motivates a policy.

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
- [x] C-02 design and authority gate: the owner granted authority to edit `../city` on
  2026-07-15, and City's live building, scene, camera, capture, and teardown paths are traced
  in its own migration plan, which lives in that repository at
  `docs/architecture/voxel-buildings-migration.md` (City commit `884a2ba`).
  The first slice is the `walls` layer of all three zone archetypes: opaque, one shared
  material, no emissive and no per-frame material mutation, plain indexed unit-box geometry,
  and still shadow-casting so neutral per-batch flags are exercised while City keeps
  shadow-map policy. The trace established that City owns the renderer, camera, controls,
  animation loop, viewport, and capture, so Voxel embeds borrowing all of them; that keyed
  batches let the wall slot layout safely diverge from City's remaining four layers; and that
  the one required City change is an additive after-draw hook, because City's frame callbacks
  run only before its single draw.
- [x] C-03 building-lane adapter: City draws its building walls through an embedded Voxel
  runtime behind `?voxelWalls=1` (City commits `8a07109`, `756dbdf`, `a33f33b`). City keeps the
  renderer, camera, viewport, capture, shadow policy, and the draw; Voxel contributes one root
  and learns its work reached the canvas through City's additive after-draw hook. All three
  zone archetypes collapse into one keyed batch because walls never varied by zone. Browser
  evidence on City's 453-building fixture: draw calls 39 → 37, triangles identical at 452,211,
  exactly one Voxel runtime root, no page errors, and a worst-case pixel delta equal to the
  same-config animation noise floor. Ownership is pinned by tests that fail if Voxel claims the
  viewport. This was the first real host to exercise embedded mode — AoE2 is standalone and
  C-01 is Voxel-authored — and it found two adapter defects that a self-authored fixture could
  not: a double sRGB conversion rendering walls ~3.5× too dark, and a `vertexColors` material
  mismatch against a geometry with no colour attribute. Both were City-side and are now pinned.
  A broad low-amplitude pixel residual remains and is inherent to this package's 8-bit sRGB
  instance-colour lane quantising City's float32 tints.
- [x] C-04 cross-consumer regression: AoE2's complete gate passes unchanged against this
  package — 2,128 unit tests, 108 real-browser tests including context loss/restoration and
  replay-scrub epoch rebuilds, typecheck, lint, and production build. No shared contract needed
  reconciling; the only public change in this cycle was the additive scheduler preflight pair.

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

Met on 2026-07-15. AoE2 runs standalone as its sole world renderer; City draws its building
wall lane through embedded Voxel behind a flag while owning every other lane, its renderer,
camera, capture, and shadow policy. No consumer type entered this package: City's adapter and
its `BuildingRenderView` live in City. Both consumers resolve exactly one Three runtime —
AoE2's packed single-Three check and City's `resolve.dedupe(['three'])`, whose test fails if
the dedupe is removed. Snapshot-per-dirty-frame in City's adapter rebuilds every matrix where
its own view wrote one; if that proves material, the fix is this package's sparse delta path
and not a change to the boundary.

## E — evidence and hardening

### E-01: Model/property/fuzz suite

- [x] Delivered. A pinned-seed hostile-snapshot corpus proves malformed input is always a typed rejection rather than an escaping throw, and that a rejected mutant leaves canonical ownership byte-identical to the baseline.

The corpus is pinned rather than randomly reseeded per run, because a fuzz suite that finds a new failure only on someone else's machine is a flake, not evidence. Two earlier drafts of it were worthless -- one returned on the first accepted mutant, one shared a world across cases so ownership drift hid -- which is why the accepted/rejected split for the seed is asserted rather than assumed.

Dependencies: feature milestones.

### E-02: Named reference scenes

- [~] The lane exists and the first named-hardware measurement is recorded; the scene corpus is partial.

`npm run benchmark:scenes` records against the real device and refuses to record on a software rasteriser, because a silent fallback would write a file indistinguishable from a hardware run. The first recording (`benchmarks/results/2026-07-16-named-hardware.json`, commit `d18bf03`, clean worktree) covers the atomic cold-start, warm-revision, and palette-swap scenes on an NVIDIA RTX 4090 via ANGLE D3D11, Windows 11, i9-13900KF, headless Chromium, 640x480 at DPR 1: cold p50/p95/max 25.5/31.5/45.4 ms, warm 11.6/13.0/13.2 ms, 768/1008 peak CPU/GPU staging bytes, one draw call and twelve triangles, with the correctness result recorded beside the timings rather than separately -- 16,384 green-dominant pixels mid-flight is the same no-mixed-frame claim the SwiftShader lane asserts, now on hardware.

That settles the question V-09 deferred here: the ADR's 100 ms cold budget holds on real hardware with room to spare, and the SwiftShader lane's 36.3 ms was pessimistic rather than flattering.

Still open: the staircase and checkerboard chunk scenes, the 9x9 boundary edit field, AoE-like terrain, City-like 10k/50k sparse instances, combined picking, and teardown endurance as *named* scenes. Each exists as a correctness test already; what they lack is a recorded hardware measurement.

Add fixed solid/staircase/checkerboard chunks, 9×9 boundary edit field, AoE-like terrain, City-like 10k/50k sparse instances, combined picking, context reconstruction, and teardown endurance scenes.

Record browser, OS, hardware/GPU, viewport, DPR, clock, scene seed, package commit, draw/topology/resources, queue/staging/copy bytes, timings, correctness result, and capture identity.

Dependencies: V, P, H, C.

### E-03: Visual regression

- [ ] Open. Depends on E-02.

Use fixed camera, viewport, DPR, injected clock, and controlled Chromium lane. Keep structural geometry assertions authoritative and use documented screenshot tolerances for raster evidence.

Dependencies: E-02.

### E-04: Endurance and cleanup

- [x] Delivered across both lanes, split by what each can actually support. Node runs 1,000 boundary edits, 100 epoch replacements, repeated sparse batch changes, capture aborts, and 50 loss/restore cycles, holding live occupancy flat while the lifetime counters climb -- 1,000 targets presented, none terminal. Real Chromium runs 120 remeshes and 30 real device losses against a live WebGL2 context.

The split is the point. A Node fake renderer structurally cannot observe a GPU, so it cannot support a disposal claim no matter how many cycles it runs; only `renderer.info.memory` on a live context can, and stubbing retirement makes the real-browser edit test climb from 2 to 30 while leaving every Node assertion green. The context-loss test deliberately does not carry that claim either, because a loss resets `info.memory`.

Dependencies: E-02 for named-hardware timings; the cleanup claims do not wait on it.

### E-05: Supply chain and artifact audit

- [x] Recorded 2026-07-15 in [the supply chain record](../architecture/supply-chain.md), and enforced by `npm run test:supply-chain` inside `verify` rather than by hand.

The record is short because the tarball redistributes no third-party code: zero runtime dependencies, `three` and `@types/three` optional peers the consumer owns, no vendored source, and an original mesher with no upstream provenance. There are therefore no external asset or shader licenses to track. Both audits npm supports run on every `verify` and report zero findings; high and critical block.

The gate pins the properties that make the record true rather than restating it: the runtime dependency count, both peers' optionality, and every dev dependency's license against an allowed permissive set. Adding a runtime dependency, un-optionalizing a peer, or introducing an unknown license each fail it. Artifact inspection was already covered by the packed-content, source-map, declaration-hash, worker-URL, and Three-externalization gates, which the record enumerates rather than duplicates.

Dependencies: V-09 and F-03. F-03 does not gate the audit itself, which runs locally in `verify`; the remote run only repeats it.

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

### R-04: Immutable candidate

- Produce tarball, integrity hash, contents manifest, source commit, environment, audit results, and evidence index.
- Tag a release candidate and run the complete supported matrix against that exact artifact from a clean checkout. Any public or correctness change afterwards requires a new candidate and a new run.
- No calendar soak is required; see the roadmap's rationale. The accumulative-failure risk a soak covered belongs to E-04, which must be green against the candidate.

### R-05: 1.0.0

- Confirm every roadmap requirement and exit gate from live evidence.
- Finalize changelog, support policy, migration guide, known limitations, and post-1.0 backlog.
- Tag the verified commit and attach the reproducible private artifact. Registry publication remains separately authorized.

R exit gate: no required item is incomplete, no substantive review issue is open, the complete supported matrix is green against the candidate from a clean checkout, and the artifact can be reproduced from the tag.

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
| Release candidate | all above | clean install, complete CI/support matrix, artifact hash |

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

The V-08 transaction exists and commits standalone worker-meshed revisions with
real browser evidence. The critical path continues:

1. ~~Join the embedded host frame ticket to the V-08 transaction.~~ Delivered:
   an embedded host's successful draw is now the presentation acknowledgement
   and the explicit rejection is gone.
2. ~~Redesign H-05 reconstruction as prepare plus standalone/embedded draw
   acknowledgement plus commit/abort.~~ Delivered; readiness is never published
   from an internal draw that violates host ownership.
3. ~~Close V-09/V-10 with end-to-end selection evidence, culling, resource
   metrics, and edit-storm bounds.~~ Delivered.
4. ~~Make the voxel worker option public, flipping the picking and
   worker-meshing capabilities with it.~~ Delivered: `voxelWorkers` is public,
   the browser evidence now runs through the public option, and the capability
   report advertises worker meshing, both picking lanes, and revision-aware
   capture. `revisionAwareCapture` had been false since before H-04 published
   it, which the flip also corrects.

The critical path is clear. What remains for 1.0 is evidence and release work:
E-02 named reference scenes on real hardware, E-03 visual baselines, E-05 the
supply-chain and artifact audit, F-03 a first green remote CI run, D-05/D-06,
and the R-series freeze, rehearsal, audit, and tag.

Each numbered step is split into minimal coherent verified commits and receives adversarial review as soon as its first public, async, presentation, or ownership boundary exists.
