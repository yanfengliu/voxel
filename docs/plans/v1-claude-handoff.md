# Voxel 1.0 Claude handoff

Status snapshot: 2026-07-15. **Historical — do not follow.** Every "next step"
below is delivered and every "current state" claim below is stale: the voxel
worker option is public (`voxelWorkers`), the capability report advertises
worker meshing, both picking lanes, and revision-aware capture, and the E
milestones are complete. The live authority is
[the implementation plan](v1-implementation.md); this file remains only as the
record of what the 2026-07-15 handoff believed.

## Assignment

Continue the scoped Voxel 1.0 delivery defined by:

- `docs/plans/v1-roadmap.md`
- `docs/design/v1-architecture.md`
- `docs/plans/v1-implementation.md`

Read `AGENTS.md`, `README.md`, and `docs/design/spec.md` before changing code. Keep the
renderer downstream of game-owned simulation state, preserve the portable-core/Three boundary,
and do not expand the explicit 1.0 scope without revising the roadmap and evidence gates.

## Repository state at handoff

- Branch: `main`. `origin/main` is still at `2a74c48`; every commit below is local and unpushed.
- The full `npm run verify` gate passes: 80 test files and 644 tests, typecheck, lint, build,
  TypeScript 5.7.3/5.9.3/6.0.3 compatibility, public API report and self-test,
  portable/worker/Three packed-package checks, and four headless browser tests.
- GitHub CLI authentication may still be stale; direct Git push through the configured
  credential path worked previously. Reauthenticate `gh` before relying on it.
- The user's standing instructions are frequent small commits and adversarial review at every
  minimal coherent behavior or ownership boundary. Confirm before pushing.

Run `git status --short --branch` first.

## What this session delivered

V-08 is implemented for standalone runtime-rendered hosts, and picking and capture are
published from it. Fourteen commits since the previous handoff (`7085d81`):

- `b9650ea` fix the three-package gate: npm 10.x runs a directory's `prepare`/`prepack` during
  `npm pack` even under `--ignore-scripts`, so Three's transitive deps are packed from a
  sanitized copy. Without this the verify gate could not run at all.
- `8c54f5c` `RevisionAtomicFrameCommitInternal`: the cross-layer transaction joining the core
  canonical ticket and the Three scene lease.
- `2ce57c6` `CommittedPresentedQueryAuthorityInternal`: the reversible pick-snapshot
  publication owner, joined as a transaction participant.
- `74bfacc` scheduler `preflightTarget` / `preflightReplacingEpochTarget` (nonmutating
  admission validation, public API).
- `dded3ac` coordinator two-phase admission: `prepareAdmissionInternal` /
  `activateAdmissionInternal` / `cancelAdmissionInternal`, resolving the irreversible-admission
  issue the previous handoff raised.
- `768a478` proof that worker-completed targets join the transaction.
- `b208cc7` `RuntimeAtomicPipelineInternal`: plan sequencing and displayed-mesh reuse chaining.
- `76f202a` `ThreeRenderRuntime` integration behind the package-internal `voxelWorkersInternal`
  option.
- `74b3c8d` headless Chromium evidence: real packaged worker, real WebGL2, pixel-dominance
  proof that an accepted-but-unmeshed revision never shows a mixed frame.
- `56add93` fix raw NUL bytes that made `runtimeAtomicFrame.ts` binary to git and invisible to
  grep.
- `e619876` publish committed picking; add public `pickPresented`.
- `9ed83f8` retain the presented manifest; add public `captureWithManifest` and
  `captureWhenPresented`.
- `65492b7`, `8163f4d` keep the README and ledger truthful.

Adversarial review ran at each ownership boundary and found real defects that are fixed and
regression-tested: a scene-retirement failure after the irrevocable canonical commit that left
the phase machine claiming rollback was still possible; disposal debt abandoned by the query
authority's `dispose`; an ownership-transfer rollback that discarded an already-consumed
candidate instead of the store it had produced; a mixed-ownership wedge where a legacy pending
revision could starve forever behind an atomic presented one; and a silent recovery loop.

## Honest completion estimate

Roughly 70-75% through the scoped 1.0 engineering work and 45-55% release-ready. The critical
path's hardest item (V-08) is done and proven in a browser, and picking and capture now hang
off it. What remains is integration, evidence, and release process rather than new
architecture.

Critical path from here:

`embedded frame ticket -> H-05 reconstruction -> V-09/V-10 -> make the worker option public
-> City proof -> evidence/hardening -> API freeze/RC -> 1.0 tag`

One gate still needs the user: named real-hardware performance evidence needs a real machine,
because the browser lane runs on SwiftShader, which proves correctness but not frame time.

Two earlier blockers are resolved. The owner removed the calendar soak on 2026-07-15 (single
consumer, private distribution; the roadmap records the rationale and keeps the risk on E-04),
and granted authority to edit `../city`, unblocking C-02 through C-04.

## The central constraint on everything below

The atomic voxel pipeline is reachable only through the package-internal
`voxelWorkersInternal` option on `initializeRuntimeInternal`. No public configuration can
enable it. That is deliberate and it is why `getThreeRuntimeCapabilitiesV1()` still reports
`pickingLanes: []` and `workerMeshing: false` — advertising them would promise support a
consumer cannot obtain. `capabilities.ts` records the exact gate.

So `pickPresented`, `captureWithManifest`, and `captureWhenPresented` are public and honest
but, for any public configuration today, always report `no-presented-frame` or `unavailable`.
Making the option public is what turns this work into consumer value, and it is blocked on the
next three items.

## Next steps

### 1. Embedded host frame ticket joins the V-08 transaction

`initializeRuntimeInternal` currently throws for `voxelWorkersInternal` + an embedded host
(`tests/three/runtime-atomic.test.ts` pins this). Standalone drives the transaction inside
`frame()`; embedded must drive the same transaction across `prepareFrame` / `commitFrame` /
`abortFrame`, with the host's successful draw as the acknowledgement. Read
`RuntimeAtomicFrameCoordinatorInternal.commitFrameInternal` in `src/three/runtimeAtomicFrame.ts`
— it already separates activate, draw, and commit; the host ticket needs to carry the
`RevisionAtomicFrameCommitInternal` between `prepareFrame` and `commitFrame`, and
`abortFrame` must abort it and settle the lease. Watch the existing host-frame reentrancy and
device-generation fences in `runtimeHostFrameTicket.ts`.

### 2. H-05 reconstruction

Commit `5d2ffea` still holds the isolated prototype and the previous handoff's analysis of it
remains accurate: `restoreInternal` does `swap -> validate -> draw -> commit` synchronously,
and `publishRestoredAvailabilityInternal` is an irreversible port boundary. Now that V-08
exists, rebuild reconstruction on it: prepare, then a standalone or embedded draw
acknowledgement, then commit/abort. Rebuild renderer-owned GPU objects, presentation state,
size/DPR, camera policy, daylight, and staged targets from the retained CPU checkpoint;
present the previous displayed revision before reporting ready.

### 3. V-09/V-10

V-09 needs end-to-end selection evidence now that the greedy candidate meshes through the
atomic path in a real browser; the provisional ADR is `docs/architecture/mesher-selection.md`.
V-10 needs chunk frustum culling plus pipeline/resource metrics. The atomic pipeline already
exposes worker and staging metrics worth surfacing.

### 4. Then E-04 endurance, and make the option public

1,000 boundary edits and 100 epoch replacements with plateaued resources is an explicit V-08
exit gate and the last thing blocking the option from going public. The browser fixture
`tests/browser/fixtures/atomic-runtime.html` is a good starting point. When it holds, make the
option public and flip `pickingLanes` and `workerMeshing` together.

## Architecture notes worth knowing

- The frame transaction's ordering is load-bearing and documented in
  `revisionAtomicFrameCommit.ts`: activate/validate before the draw, tentative
  scene-then-canonical publication after it, canonical finalization as the irrevocable pivot,
  retirement only afterwards. Waiter callbacks run synchronously inside canonical finalization
  (via structural `AbortSignal.removeEventListener`) and may reentrantly commit a newer
  revision or dispose the scene; both are tested.
- The query authority retires a predecessor's snapshot before its scene bundle. The committed
  pick store's no-op resource lease depends on that ordering; if you change retirement order,
  the lease must become a real retention.
- `ThreeRenderRuntime` sits just under the 1000-line ceiling. Prefer the established ops-seam
  pattern (`runtimeAtomicFrame.ts`, `runtimeCaptureSupport.ts`, `runtimeHostFrameRestore.ts`)
  over adding logic to the class.
- ESLint's `max-lines` counts code lines, not raw lines, so `wc -l` will read higher than the
  reported count.

## Verification and Git discipline

Use the smallest focused test while iterating and run `npm run verify` before completing a
behavioral unit. Renderer claims require headless browser evidence.

Before every commit: inspect `git status`, staged names, staged diff/stat,
`git diff --cached --check`, and secrets; stage only one coherent unit; obtain adversarial
review for async, public-contract, presentation, lifecycle, or ownership work; fix substantive
findings and re-run relevant checks; commit immediately once that minimal unit is green.

Two traps this session hit that are worth avoiding:

- A rejected tool call does not run its earlier `&&` clauses. After a rejected
  `git reset && git add ...`, the index may still hold a previous `git add -A`; re-check
  `git status` rather than assuming.
- Never write raw control characters into source. Use JavaScript unicode escapes; a NUL byte
  inside git's 8000-byte sniff window silently turns a file binary.

On this Windows checkout, use per-command safe-directory configuration when Git requires it:

`git -c safe.directory=C:/Users/38909/Documents/github/voxel ...`

Work headlessly, clean up task-owned processes, preserve unrelated changes, and never discard
user work to obtain a clean tree.
