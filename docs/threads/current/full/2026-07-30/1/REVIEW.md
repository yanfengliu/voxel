# Full-codebase adversarial review — objective `full`, 2026-07-30, iteration 1

Reviewers: Codex CLI `gpt-5.6-sol` (reasoning `ultra`) and Claude CLI `claude-fable-5[1m]` (effort `max`), seven reviewer runs across six lenses: portable data plane (src/core + src/meshing), Three.js runtime (src/three), model studio (tools/studio), cross-cutting invariant audit, tests/gates/verification machinery, and docs accuracy. This is the first full-codebase review thread in this repo; no prior-iteration reports existed. Raw CLI captures lived in gitignored `tmp/review-runs/full/2026-07-30/1/` and are deleted after synthesis; this file is the durable record.

Codex lens A (data plane) was killed mid-run by the Codex cybersecurity filter while reading the repo's hostile-input-hardening code — the prompt asked for no exploit construction; this is the documented spurious-trigger failure mode. Coverage was restored by a fifth Claude instance carrying the same lens plus a reframed correctness-only Codex retry (lens A2), which completed its review and then tripped the same filter on its way out, so its `-o` file was empty and the review was recovered from the last marker pair in the stdout log. Codex lens B (Three runtime) went ten-for-ten on driver verification and overturned two spot-check clean bills from the invariant lens; lens A2 independently reproduced the delta-ingest hole with a live probe and added six findings no other lens saw. Both are methodology lessons recorded below.

A concurrent session was actively building the trebuchet physics station in this shared worktree throughout the review (13 dirty files centered on `tools/studio/physics-playground-*`, `tools/studio/live-physics.ts`, `fixtures/physics-playground/*`). Findings inside those files were verified against HEAD (`03bb895`) and are DEFERRED to that session or iteration 2 rather than edited underneath it.

Every finding below was independently re-verified against live code by the review driver before acceptance. Severity is the driver's post-verification judgment; where a reviewer's claim did not survive verification as stated, the finding records what actually held (F35 is the clearest case). Findings F1–F33 are numbered in the order they were synthesized; F34–F40 arrived later with lens A2.

## Findings — placed-things-are-solid enforcement (studio)

### F1. MAJOR — `sceneOverlapsV1` has confirmed false negatives: the cell scan only looks downward (studio lens; driver-confirmed structurally and empirically)

`tools/studio/scene-overlap.ts:138-165` hashes target boxes by the unit cell of their low corner and probes only offsets `-ceil(probe.size)..0` per axis, so a target whose low corner sits inside the probe's span but across a cell wall above is never tested. Two grain-1 cubes overlapping 0.85 world units report zero shared voxels in one argument order; shallow cross-wall penetrations with mutually offset grids are missed in both orders; which side probes is decided by voxel count with scene-order tie-breaks, so detection is content- and authoring-order-dependent. This function is the still-placement half of the owner's absolute rule, trusted by the live conflict line and every pinned "no two models in the same space" test, and the existing tests use aligned coordinates that cannot hit the bug. Disposition: fix the candidate-cell enumeration (bounded for large grains), add cross-cell fractional regression cases in both argument orders, re-run the pinned scene suite, and re-inspect any pin that stops being clean.

### F2. MAJOR — moving-vs-moving pairs are structurally invisible to the conflict line (studio lens; driver-confirmed)

`tools/studio/scene-conflict-report.ts:29-33` drops all replay-driven placements from the overlap lane and `tools/studio/scene-surface-fights.ts:475+` checks moving bodies against still indexes only, so two replay-driven placements can share volume or fight surfaces for their entire runtime while the announcer reports the scene clean — against the owner's rule that recorded poses are included. Machine-works ships ≥6 moving placements (per-fixture generation-time budgets exist there); the windmill and chain lanes and any future replay scene get nothing at the scene boundary. Disposition: extend `sceneSurfaceFightsV1` to judge moving-vs-moving pairs at the same sampled frames with the same slop, or make the announcer print an explicit unchecked-pairs line; silence is the defect.

## Findings — Three.js runtime (all Codex lens B; all driver-confirmed)

### F3. MAJOR — embedded capture ownership is decided before `hostKind` exists

`src/three/ThreeRenderRuntime.ts:145-147` constructs the capture coordinator in a field initializer; the port factory at `:623` evaluates `this.hostKind === 'embedded' ? 'host' : 'runtime'` eagerly while `hostKind` is still undefined, so every runtime — embedded included — gets runtime-owned capture. An embedded runtime then redraws and reads the host's shared canvas instead of reporting host-capture-owned; City's borrowed-renderer lane is the affected consumer. Disposition: make the port read ownership lazily (every neighboring port member is already a closure) and add an embedded-capture test.

### F4. MAJOR — capture can publish current pixels under a stale camera/viewport manifest

`resize()`/`setView()` mutate the drawing buffer and camera immediately (`src/three/ThreeRenderRuntime.ts:470-503`, `src/three/runtimeResize.ts:20-36`) without invalidating `lastPresentedManifest` (`commitViewportState` at `:1002-1006` touches only scalars); the capture fence (`src/three/runtimeCaptureSupport.ts:87-96`) checks manifest identity, device generation, and lifecycle, then redraws current state and stamps dimensions from the old manifest (`:104,155`). A capture between a resize and the next frame encodes new-size pixels while claiming the old size; a capture after `setView` encodes the new angle under the old camera identity. Disposition: fence on live viewport and camera state against the manifest's recorded values and verify actual canvas dimensions, reporting the typed presentation-changed outcome on divergence.

### F5. MAJOR — atomic commit can report success after a synchronous context loss

`src/three/runtimeAtomicFrame.ts:535` guards post-waiter-callback publication with `hasRuntimeEndedAfterCallbacks()` (disposed/failed only); the sibling predicate for lost/restoring exists (`ThreeRenderRuntime.ts:1038`) but is never consulted, so a waiter callback that synchronously triggers context loss still reaches `commitPresentedPointers` and returns a successful manifest from a lost runtime. Disposition: check frame-unavailable-after-callbacks at the same point (and audit the `:508`/`:522` siblings), with a regression test.

### F6. MAJOR — sparse instance-color updates upload the wrong GPU components

`src/three/instanceBatchPresenter.ts:162` registers color update ranges with stride 4; three@0.185.1 lazily allocates `instanceColor` as 3-component RGB (`InstancedMesh.setColorAt`), which the presenter's own comment at `:319` acknowledges. Sparse color changes upload unrelated floats and leave the intended slot stale on the GPU (and can run past the attribute tail); the unit test at `tests/three/paged-instance-presenter.test.ts:169-178` pins the wrong stride. Disposition: derive ranges from the attribute's itemSize, fix the pinning test, and add page-boundary and final-slot coverage.

### F7. MAJOR — profiled worker worlds never run rigid-instance animation

`animate` is invoked only from the legacy standalone path (`ThreeRenderRuntime.ts:703`) and host-restoration ops (`:766`, `:906`); no atomic module calls it, and atomic staging rebuilds presenters from base matrices — so in exactly the flagship configuration (chunkProfile + voxelWorkers, required for committed picking), engine-owned instance animation stays frozen at base matrices forever. Disposition: drive the active bundle's presenter from the injected frame clock in both prepared and idle atomic frames, with a test that a profiled world's animated instance actually moves.

### F8. MAJOR — a reentrant dispose during batch reconciliation permanently retains a mesh

`src/three/instanceBatchPresenter.ts:347` adds the new `InstancedMesh` to the observable graph before `:349` records it in the entry map — the map the code's own comment (`:343-345`) calls "every disposal path's only index." A `childadded` listener that disposes the presenter re-enters, clears the map, sets `disposed`, and then the resumed loop records the mesh into a map nothing will walk again; later disposal idempotently skips it. Disposition: record the entry before attaching to the graph and guard the reconcile loop on `disposed`, cleaning up partially inserted objects.

### F9. MAJOR — idle atomic redraws split picking identity from the published frame

Every idle frame mints a manifest with `cameraGeneration + 1` (`ThreeRenderRuntime.ts:960`) and publishes it (`runtimeAtomicFrame.ts:385-404`), but the committed pick candidate is republished only on new revisions — so after any view change the canvas and capture identify frame B while pick hits stay stamped with frame A and unproject with A's camera. Disposition: refresh the committed pick frame identity on committed idle redraws (or stop minting new camera generations when the camera is unchanged and refresh on change), keeping pick and canvas describing the same frame.

### F10. MAJOR — every profiled revision rebuilds the full instance presentation (plan recorded; not fixed this iteration)

`src/three/revisionAtomicStaging.ts:156-169` creates a fresh presentation bundle per revision; chunk meshes are reused via `priorProfiledMeshes`, but the bundle's instance presenter starts empty, so any accepted revision — even a one-instance patch — allocates new `InstancedMesh`es and rewrites every slot, with transient double residency until commit. The README's ~1.3 ms sparse-patch benchmark measures the legacy path; the atomic path silently degrades to full rebuilds. Disposition: too large to rearchitect safely inside this review alongside everything else — recorded here with a bounded plan (carry the instance lanes across bundles copy-on-write, keyed by batch key + version, preserving the atomic swap; benchmark profiled sparse deltas in `benchmarks/`), spawned as its own task for the owner, and re-reviewed when implemented.

### F11. MINOR — sparse churn grows conservative batch bounds monotonically

`src/three/instanceBatchPresentationAccess.ts:189-240` clones prior bounds and only expands around changed slots; moves and removals never shrink them, so long-lived churn degrades frustum culling and raycast broad phases (correctness holds — the bounds are deliberately conservative). Disposition: recompute on count shrink and document the sparse-move behavior; per-page bounds are the recorded follow-up if measurement shows it matters.

### F12. MINOR — `voxelWorkers` option prose promises a synchronous fallback the runtime refuses

`src/three/runtimeTypes.ts:75-79` says unprofiled worlds "keep using the synchronous path, so enabling this never silently changes an unprofiled world"; with workers configured, ingest rejects every unprofiled candidate with `three.voxel-profile-required` (`src/three/runtimeIngest.ts:63-73`) and a test pins the rejection. The behavior is the contract; the comment lies. Disposition: correct the comment (and the same claim anywhere in docs).

## Findings — portable data plane (Claude lens K5; driver-confirmed)

### F13. MAJOR — delta ingest leaves the getter-TOCTOU window the snapshot path closes and tests

`src/core/delta-reducer.ts:555-559` validates every put payload with a borrowing budget (`copyArrays = false`; `snapshot-byte-budget.ts:91` returns a view over the caller's buffer); later operations' property reads run caller getters that can mutate earlier-validated arrays; `validateDeltaFinalGraphInternal` re-checks only cross-item invariants (`delta-final-graph.ts:99`); ownership copying happens after the loop (`delta-reducer.ts:860`). The sibling snapshot path re-parses the normalized graph precisely to close this window (`canonical-snapshot-ingest.ts:33-37`) and tests it; `tests/core/render-delta.test.ts` has no equivalent, so a hostile delta can place NaN positions or out-of-range indices into "validated" canonical state. Disposition: close the window in the same shape as the snapshot path (own or re-validate payload contents before canonical commit) and add the missing TOCTOU test. Held until the Codex data-plane retry finishes reading this code, then fixed this iteration.

### F14. MINOR — mesher dependency-offset contract accepts descriptors the pipeline then rejects

`mesher-contract-validation.ts:74-112` accepts arbitrary nonzero offsets; `chunk-index.ts:331-334` hard-asserts face offsets; `indexed-oracle-input.ts:150-151` resolves descriptor offsets through that assertion, so a diagonal-dependency mesher validates then dies with a message naming a constraint the contract never stated (an invariant-11 defect on top). The halo copier and dirty closure are already offset-general. Disposition: constrain descriptors to face offsets at validation with an honest message naming the offending offset, until a mesher actually needs the general path.

### F15. MINOR — chunk-index slot tombstones grow monotonically within an epoch and re-copy on every rebuild

`chunk-index.ts:243-244, 300-308`: vacated coordinates become retained `'empty'` slots (required so remove/recreate cannot reuse a generation) and the whole map is copied per rebuild — an unbounded per-epoch memory ratchet and quadratic total copy work for a roaming streaming consumer. Disposition: document the per-epoch bound where streaming integration is specified and record the persistent-map/watermark alternatives; no behavior change this iteration.

### F16. NIT — epoch replacement restarts every worker slot, discarding unrelated worlds' in-flight jobs

`voxel-mesh-scheduler-epoch.ts:27-54` refreshes all slots on any world's epoch replacement; correctness holds (jobs retry without consuming the crash budget). Disposition: comment the scorched-earth restart as intentional, or scope termination to the replaced world's slots.

### F17. NIT — `assertMatchingChunk` withholds the mismatch specifics

`dense-palette-raycast.ts:168-171` names neither the chunk coordinate nor expected-vs-actual size/origin; the surrounding module sets the standard. Disposition: include them.

### F34. MAJOR — meshing takes ownership through the input's own `slice`, which an untrusted subclass controls (Codex lens A2; driver-confirmed)

`src/meshing/dense-palette-chunk.ts` (constructor and `copyVoxels`) and `src/meshing/mesh-worker-request.ts` copied via `value.slice()`, while `mesher-validation-internal.ts:147-166` admits any `instanceof` match and returns it unchanged — so a `Uint16Array` subclass whose `slice` returns `this` leaves the chunk sharing caller storage (and `copyVoxels` handing it back out), and makes the worker transfer detach the caller's own buffer. Core already had the answer — `typed-array-intrinsics.ts` copies through captured `%TypedArray%` intrinsics — and the invariant lens verified core clean, which is exactly why this lane needed its own reviewer. Fixed: both sites copy through `copyTypedArrayInternal`; regression test in `tests/meshing/dense-palette-chunk.test.ts` pins that a hostile slice cannot alias the chunk.

### F35. MINOR — the delta work estimate trusted an overrideable `length` (Codex lens A2; premise confirmed, impact not reproduced)

`src/core/delta-work-budget.ts` read the view's own `length`, which a subclass can report as 0 while validation scans the real elements through a hook-free base view. The reviewer claimed this let an oversized lane pass the element limit; the driver could not reproduce that — the scan charges its own work and still rejects. What is real is narrower: the pre-charge that exists to refuse the payload *before* the scan was defeated, so the scan happened anyway. Fixed by reading the same intrinsic length the scan uses. No test: a scenario asserting the outcome passes with and without the fix, and a test that cannot fail is worse than none.

### F36. MINOR — `splitVoxelCoordinate` returned a local coordinate one voxel off at the safe-integer extremes (Codex lens A2; driver-confirmed numerically)

`src/core/coordinates.ts` derived the local part as `value - chunk * size`; at the ends of the safe-integer range that product is not exactly representable, so voxel −9007199254740991 in a 97-wide chunk returned local 65 where the exact remainder is 66 — a public API returning the wrong cell for documented-legal input. Fixed with an exact remainder; `tests/core/coordinates.test.ts` pins four extremes.

### F37. MAJOR — a profiled world's epoch replacement is refused when the chunk profile changes (Codex lens A2) — DEFERRED to iteration 2

The runtime hands the last presented chunk index to the next plan regardless of epoch, and `ChunkIndexV1` rejects a changed size, grid origin, or missing-neighbor policy that core explicitly permits across a replacement epoch. Not yet driver-verified end to end; it needs a runtime-level reproduction before a fix, and it interacts with F38.

### F38. MAJOR — a worker protocol error without job identity can strand a scheduler slot (Codex lens A2) — DEFERRED to iteration 2

An unsupported or drifted mesher yields a protocol error carrying no job id; the receipt path classifies it as stale without settling the active job, and the reviewer's one-worker probe left the slot busy and every later dispatch blocked. Needs its own reproduction and a settle-or-retry policy decision.

### F39. MINOR — coordinate tombstones are unbounded per epoch and re-copied per rebuild (Codex lens A2, escalating F15) — DEFERRED

Same code as F15, with the added observation that the runtime carries tombstones across same-profile epoch replacements, removing the natural reset boundary. Recorded together for one bounded-policy change.

### F40. MINOR — DDA normalization can lose a direction's sign at the float floor (Codex lens A2) — DEFERRED to iteration 2

With a direction component of `-Number.MIN_VALUE` beside `Number.MAX_VALUE`, normalization underflows the small component to zero before the initial cell and entry normal are chosen, so a ray starting exactly on a boundary can report a zero-distance hit on the wrong side. Needs a reproduction test against `dense-palette-raycast.ts` before the sign-preserving fix.

## Findings — cross-cutting, gates, docs (invariant/tests/docs lenses; driver-confirmed)

### F18. MAJOR — the file-size ratchet failed open exactly where it was disabled

`tools/studio/studio-app.ts:1` carries the tree's only `eslint-disable max-lines`; the file is 3,250 raw / 2,735 code lines against the enforced 1,000-code-line cap and roughly doubled in four days, while the spec's recorded precondition (`docs/design/spec.md` implementation-ratchet paragraph: extract the pointer/wheel routing block before further material stage-input growth) accrued ~214 more stage-mode lines unexecuted. Eight further files sit above 1,000 raw lines but under the enforced code-line cap (933–993 code lines: `harness.ts`, `recipe.ts`, `ThreeRenderRuntime.ts`, `machine-works-recipes.ts`, `snapshot-validation.ts`, `paged-instance-batch.ts`, `machine-works-fixture-config.ts`, `tests/three/runtime.test.ts`) — legitimately passing lint, crowding the cap. Disposition: execute the spec-mandated stage-interaction extraction now; rewrite the disable comment to name the honest remaining debt and the next extraction candidates; the eight near-cap files' candidates are recorded here as the ledger: split `snapshot-validation.ts` by lane (resources/chunks/batches), split `runtime.test.ts` by lifecycle phase, extract `harness.ts` scene-session accessors, extract `recipe.ts` step execution from validation, split `machine-works-recipes.ts` and the fixture config by station, and extract `ThreeRenderRuntime.ts` context-loss handlers — each only when its file next grows materially.

### F19. MAJOR — README's current-state test counts rotted within days

`README.md:43` asserts "1,319 unit tests across 155 files" and "all 65 browser tests" as present fact; the live tree has 214 unit-test files and 21 browser spec files (~84 tests). Disposition: date-stamp the sentence and phrase it so it cannot rot silently.

### F20. MINOR — supply-chain license sweep is direct-devDependencies-only while claiming tree-wide coverage

`scripts/verify-supply-chain.mjs:220-228` vs the stated intent at `:18-22`. Driver dry-run over the full installed tree (140 packages): three packages outside the allowlist — `lightningcss` ×2 (MPL-2.0) and `minimatch` (BlueOak-1.0.0), both fine for non-redistributed dev tooling (the same script separately pins zero runtime deps). Disposition: widen the sweep to every installed package with SPDX OR handling and a labeled dev-only allowlist tier, so the gate does what its comment claims.

### F21. MINOR — five error messages withhold the offending value and requirement

`src/three/committedPresentedPickSnapshot.ts:99-101`, `src/three/captureManifest.ts:101-103`, `src/three/runtimeMeshWorkerDriver.ts:141-145`, `src/meshing/voxel-mesh-scheduler.ts:293-295`, `tools/studio/shared-ui/index.ts:360-362` — each knows the received value and the valid set and names neither; the rest of the tree is unusually disciplined here. Disposition: include both, on the pattern of each file's own compliant siblings.

### F22. MINOR — mojibake in the studio transport labels

`tools/studio/studio-player.ts:110-111` carries double-encoded UTF-8 (`Â·`) in both template literals (hex-dump confirmed) while line 113 is correct; no test pins these strings. Disposition: fix both literals and pin the label in a browser assertion.

### F23. MINOR — the studio dev server accepts cross-origin request POSTs and persists v1 bodies raw

`tools/studio/vite.config.ts:44-140`: no Origin/Sec-Fetch-Site check on fixed port 5180, and `studio.request/1` bodies skip normalization (`durable = parsed`). Any webpage in the same browser can land a no-cors POST that materializes an owner-authored-looking request file agents later act on — a drive-by injection lane into the agent workflow (contained: gitignored folder, JSON-only, 1 MB cap, server-invented filenames). Disposition: reject foreign origins and normalize v1 like v2.

### F24. MINOR — live-physics colliders ignore `placement.seed`

`tools/studio/studio-live-interact.ts:104` builds collider sources without folding the placement seed; the render lane (`scene-build.ts:153-175`) and both conflict checks fold it. Latent until the first seeded live scene; the trebuchet work is expanding exactly this machinery. Disposition: fold `mixSeed` identically (unless the builder lives in the trebuchet session's dirty files, in which case defer with F26/F27).

### F25. MINOR — the riverfall byte-pin self-skips when its generated file is missing

`fixtures/riverfall-consumer/riverfall-replay-generation.test.ts:26` skips instead of failing when `generated-riverfall-fluid-replay.ts` is absent; its three sibling suites hard-fail. Disposition: absence fails with the regeneration command named, when the update flag is unset.

### F26. MINOR — live lane duplicates gravity/timestep literals against its own one-source parity claim (DEFERRED: file owned by the in-flight trebuchet session)

HEAD `tools/studio/live-physics.ts:147,200` hardcodes `1/240` and `-9.81`; the headless twin reads `PLAYGROUND_TIMESTEP_S_V1`/`PLAYGROUND_GRAVITY_V1`. Fix in that session or iteration 2: import the constants or pin equality in a smoke test.

### F27. MINOR — Rapier WASM worlds leak on constructor/build throw paths in both lanes (headless half DEFERRED: file dirty in trebuchet session)

HEAD `fixtures/physics-playground/playground-world.ts:79-81` creates the world before specs that may throw; HEAD `tools/studio/live-physics.ts` constructor likewise. Fix: build specs before the world; free-on-throw in the live constructor.

### F28. MINOR — two fixed wall-clock waits before positive real-time assertions in the browser gate

`tests/browser/model-studio-live-physics.spec.ts:135` and `tests/browser/model-studio-lighting-preference.spec.ts:77` — flake reservoirs on shared runners in a retries:0 gate. Disposition: convert to the poll/settle idiom the same suites already use.

### F29. MINOR — the model-studio guide documents a `recipes` subcommand that does not exist

`docs/guides/model-studio.md:399-403` attributes `recipes` to `scripts/studio.mjs`; the live dispatch has no such command — the capability is `npm run studio:recipes`. Disposition: reattribute.

### F30. MINOR — the spec's lifecycle-state list contradicts the shipped state machine

`docs/design/spec.md` §9 lists a `paused` state that does not exist and omits the terminal `failed` state that does (`src/three/runtimeTypes.ts:29-35`). Disposition: correct the list.

### F31. NIT — two one-shot studio timers with no disposal path

`tools/studio/studio-app.ts:1831` (conflict-scan timer: no handle, guard never checks `disposed`, dispose never clears `sceneOpen`) and `tools/studio/studio-editor.ts:199` (flash timer). Disposition: track and clear, or guard on `disposed`.

### F32. NIT — `fixtures/**` exempted from type-checked lint, dropping the floating-promise guard

`eslint.config.js:38-41`; currently latent. Disposition: re-enable typed lint for fixtures if the project service reaches them cheaply; otherwise record the exemption's reason in the config.

### F33. NIT — hard-wrapped prose in ~14 older docs violates the one-line-per-paragraph rule

Unwrap opportunistically when each file is next edited; no mass rewrite.

## Clean sweeps (adversarially checked and held)

Portable purity (no three/DOM imports, no wall-clock/random reads anywhere in `src/`); structured-clone-safe public inputs with never-reused keys; borrow-and-copy snapshot ingest hardened against hostile accessors, subclasses, proxies, SABs, and detached buffers; the four-factor-plus stale-result firewall enforced at receive, complete, and commit; worker results required to own distinct full transfer buffers with re-derived geometry; DDA raycast edge cases (negative/boundary starts, tied axes, inclusive max distance); greedy/oracle winding agreement and halo discipline; scheduler boundedness; every verify-chain gate failing on exit codes with two gates self-testing their own failure detection; frozen mesher corpus pinned and consumed; benchmark claims chained to git-blob provenance and named hardware; browser tests driving the real served app with structural assertions before pixels; DOM hygiene in the studio (escaped template writes only); request-runner teardown; annotation storage versioning with quarantine-not-destroy; deterministic headless playground; docs link/command/constant accuracy essentially everywhere not named above.

Methodology notes for future iterations:

- The invariant lens marked accepted/presented separation and disposal idempotency "clean on spot-check"; the runtime lens's deeper tracing then found F4/F5/F8/F9 inside those same subsystems, and lens A2 found F34 in meshing right after the invariant lens correctly cleared the same discipline in core. A clean bill is evidence of absence only at the depth and in the lane actually swept — record both, and never generalize one lane's discipline to its neighbour.
- Two reviewer claims did not survive verification as stated: F35's bypass (real premise, no reproducible impact) and the suggestion to normalize `studio.request/1` bodies, which collides with a deliberately pinned backward-compatibility contract. Both were kept honest rather than implemented as written — the reviewer is a source of hypotheses, not verdicts.
- Every fix here was checked by neutralizing it and watching its test fail; two candidate tests were discarded for passing either way. That step, not the passing run, is what made the difference between a fix and a claim.
- The browser gate cannot be attributed in a shared worktree while another session is mid-feature in the same studio: its half-written panel code is what the dev server serves, so failures there say nothing about this change set. The fix is a throwaway `git worktree` at HEAD with only this change set applied and its own `npm ci` — the only way to get a browser result that belongs to your own diff. Recorded because the shared-worktree trap this repo already documents for the index applies equally to any gate that runs the whole app.

## Dispositions and iteration log

Iteration 1 (2026-07-30).

Fixed and verified this session, each with a test that fails without the fix: F1 (cover-hash cell enumeration, plus the one real content overlap it exposed — the Riverfall middle kelp at grain 0.45 pierced the pond film, corrected to 0.4 with the geometry recorded in the placement comment), F2 (moving-vs-moving lane, both volume and same-facing planes, with tilted-tilted pairs announced as unchecked rather than silent), F3, F5, F6, F13/A2-1, F21, F22, F23 (origin gate only — see below), F24, F25, F28, F31, F34, F36; F12, F19, F29, F30 corrected in docs; F20 widened to the full installed tree with a labeled build-time exception tier, proven to fail on an unlisted license; F35 hardened without a test.

F2 immediately earned its keep: the new lane found one real finding in the flagship recorded scene — the finished product dents the collection bucket by 0.023 world units at a single sampled instant as it lands, 4.6× the contact slop. It is pinned exactly in `tools/studio/scene-conflict-report.test.ts` rather than tolerated by a wider slop, so a deeper dent or any new pair fails, and re-recording that drop with continuous collision is spawned as its own task.

Deferred with reasons: F4, F7, F8, F9, F10, F11, F37, F38, F39, F40 — the deeper Three-runtime and scheduler work, each needing its own reproduction and verification rather than a same-session patch; F26, F27 — files owned by the concurrent trebuchet session; F14, F15, F16, F17, F32, F33 — small, recorded, no urgency.

Iteration 2 should verify this iteration's fixes against the live code, work the deferred MAJORs in their own units, and re-run the data-plane lens now that its two loudest findings are closed.
