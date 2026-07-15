# Voxel 1.0 Claude handoff

Status snapshot: 2026-07-14

## Assignment

Continue the scoped Voxel 1.0 delivery defined by:

- `docs/plans/v1-roadmap.md`
- `docs/design/v1-architecture.md`
- `docs/plans/v1-implementation.md`

Read `AGENTS.md`, `README.md`, and `docs/design/spec.md` before changing code. Keep the
renderer downstream of game-owned simulation state, preserve the portable-core/Three boundary,
and do not expand the explicit 1.0 scope without revising the roadmap and evidence gates.

## Repository state at handoff

- Branch: `main`.
- `origin/main` was pushed through `2a74c48` (`feat: defer canonical readiness settlement`).
- `5d2ffea` preserves the isolated H-05 reconstruction prototype described below.
- The commit containing this note should be the only additional local handoff commit.
- The full `npm run verify` gate passed immediately before this handoff: 74 test files and
  591 tests, typecheck, lint, build, TypeScript 5.7.3/5.9.3/6.0.3 compatibility, public API
  checks, portable/worker/Three packed-package checks, and three headless browser tests.
- GitHub CLI authentication is stale. Direct Git push through the configured Git credential
  path worked. Reauthenticate `gh` before relying on it for Actions or pull-request queries.
- The user requested frequent small commits and adversarial review at every minimal coherent
  behavior or ownership boundary. The interim implementation was pushed as requested; the next
  explicitly requested push is the completed 1.0 state. Confirm with the user before publishing
  any additional interim handoff commits.

Run `git status --short --branch` first. The intended handoff state is a clean worktree with
`main` ahead of `origin/main` only by the H-05 preservation and this handoff note.

## Honest completion estimate

The implementation is approximately 55-60% through the scoped 1.0 engineering work and
35-45% release-ready. The foundations, canonical snapshot/delta data plane, worker/scheduler
subsystems, camera modes, lifecycle, and host-frame tickets are substantial and tested. The
remaining work is integration-heavy rather than broad greenfield construction.

The implementation ledger has 22 of 46 numbered packages checked complete. Twenty-four remain,
including seven partially implemented packages. A realistic planning range is 25-45 additional
small reviewed commits, about 15-25 focused engineering days, and the mandatory seven-day RC
soak. Real City integration, context restoration, Linux browser CI, performance evidence, or
endurance findings may extend that range.

Critical path:

`V-08 atomic runtime -> picking/capture -> H-05 reconstruction -> City proof -> evidence/hardening -> API freeze/RC -> seven-day soak -> 1.0 tag`

## Immediate task: finish V-08

The current convergence point is a cross-layer frame transaction. Do not wire the worker driver
straight into `ThreeRenderRuntime`; first make the atomic ownership boundary explicit and tested.

Relevant implemented pieces:

- `src/core/prepared-canonical-presentation.ts` provides the opaque single-use canonical ticket.
- `prepareCanonicalPresentationInternal`, `publishCanonicalPresentationInternal`,
  `finalizeCanonicalPresentationInternal`, and `abortCanonicalPresentationInternal` live in
  `src/core/render-world.ts`.
- `src/three/revisionAtomicPresentationLease.ts` and
  `src/three/revisionAtomicStaging.ts` provide prepare/activate/validate/publish/finalize/abort for
  the staged Three scene. Published predecessors may finalize after a newer presentation.
- `src/three/revisionAtomicTargetCoordinator.ts` joins whole-target worker-group completion.
- `src/three/runtimeMeshWorkerDriver.ts` owns bounded worker event delivery and crash handling.
- `src/three/runtimePresentationSurface.ts` centralizes the legacy runtime presentation graph.
- `src/three/ThreeRenderRuntime.ts` still runs the legacy reconciliation path and does not import
  the atomic stager, target coordinator, or worker driver.

Required frame ordering:

1. Prepare the exact canonical ticket, worker target, scene bundle, presented voxel/instance
   candidates, and future manifest state without mutating the live display.
2. Activate the scene lease and validate the exact target immediately before the draw.
3. Let runtime-rendered mode draw once, or return an opaque ticket so an embedded host draws once.
4. After successful draw acknowledgement, tentatively publish every visible/query/capture lane.
5. Finalize the core ticket only after all state that waiter callbacks may observe is published.
   Core finalization is irrevocable because readiness callbacks run synchronously and may accept
   or present a newer revision, lose context, or dispose the runtime.
6. Finalize/retire the older Three and query resources after the irrevocable commit. Older
   retirement must not overwrite a newer reentrant presentation.
7. On any pre-finalization failure, roll back in reverse ownership order and preserve the prior
   displayed canonical state, scene, picking authority, capture manifest, and frame counters.

Tests must cover successful standalone and embedded commits, host abort, render throw, target
supersession, context loss at every phase, scheduler-group failure, participant publication throw,
rollback throw aggregation, duplicate/foreign tickets, and a waiter callback that synchronously
commits revision R+1 while revision R is finalizing.

### Admission issue to resolve

`RevisionAtomicTargetCoordinatorInternal.admitInternal()` is currently irreversible. Same-epoch
admission supersedes older groups, epoch admission cancels the old epoch/workers/history, and a
zero-job epoch replacement is also terminal. Runtime integration therefore needs either:

- `prepareAdmissionInternal(plan)` plus a reservation handle, followed by guaranteed
  `activateAdmissionInternal(handle)` after canonical acceptance; or
- an equivalently explicit no-fail reservation/activation protocol.

Cancel the reservation on canonical rejection, supersession, throw, loss, or disposal. Do not
pretend immediate admission can be rolled back.

Suggested first commit sequence:

1. Add the tested cross-layer canonical/Three transaction primitive.
2. Give the committed presented voxel/instance state a reversible publication owner and join it
   to that transaction.
3. Join whole-target worker completion and host-frame tickets to the same transaction.
4. Add a headless browser case proving successful draw commits atomically and abort/render failure
   restores the prior visible and pickable revision.

## Picking and capture after V-08

The internal work is substantial but not runtime-published:

- `src/three/presentedVoxelStore.ts`
- `src/three/committedInstancePickStore.ts`
- `src/three/committedPresentedPickSnapshot.ts`
- `src/three/committedPresentedNdcPicking.ts`
- `src/three/revisionCaptureCoordinator.ts`

Complete P-02/P-03/P-04 and H-04 by publishing one exact committed snapshot/manifest from the
V-08 transaction. Public queries and captures must never read accepted, pending, mutable camera,
or live presenter state. Update `src/three/capabilities.ts` only when runtime APIs and browser
evidence make the capability true.

## H-05 prototype

Commit `5d2ffea` tracks four internal modules and three test/fixture files for a bounded context
reconstruction prototype. Its 28 focused tests pass. It models exact CPU checkpoints, device
generations, bounded retries, stale invalidation, ownership transfer, retryable disposal debt, and
typed terminal failure.

Do not integrate it unchanged:

- `ContextReconstructionCoordinatorInternal.restoreInternal()` synchronously performs
  `swap -> validate -> draw -> commit`. A genuine embedded host must receive a prepared ticket,
  draw externally, and acknowledge success before commit.
- `publishRestoredAvailabilityInternal()` is currently an irreversible port boundary. If a port
  transitions to running and then throws, or a later postcondition fails, the coordinator can
  dispose leases and report failure while the port remains running. Production integration needs
  transactional availability or a reserved no-throw commit.
- Fixture disposal proves call accounting and retry ownership, not real scene rollback or a
  plateau of actual GPU resources.

After V-08 exists, split reconstruction into prepare plus standalone/embedded draw acknowledgement
plus commit/abort. Rebuild renderer-owned GPU objects, presentation state, size/DPR, camera policy,
daylight, and staged targets from the exact retained CPU checkpoint. Present the previous displayed
revision before reporting ready, then queue any newer complete accepted target normally.

## Remaining milestones

- Close D-05 by integrating worker dependency groups and frame-ticket effects. Make the D-06
  transfer-owned ingest decision from measurements; it may be explicitly deferred.
- Close V-09 production mesher selection with end-to-end V-08 evidence and supply-chain records.
- Implement V-10 chunk culling and pipeline/resource metrics.
- Complete C-02 through C-04. Editing `../city` still requires explicit user authority. Start with
  one opaque City building lane in embedded mode; preserve City's terrain, water, camera, picker,
  capture, shadow policy, simulation types, and other render lanes. Re-run AoE2 after shared API
  changes.
- Complete E-01 through E-05: deterministic fuzz/model tests, named scenes, fixed visual baselines,
  1,000 boundary edits, 100 epoch replacements, repeated loss/restore and teardown, measured
  resource plateaus, hardware/browser records, dependency audits, and packed-artifact inspection.
- Complete R-01 through R-05: API/schema freeze, clean consumer rehearsal, adversarial audit,
  immutable RC tarball/hash/manifest, seven-day soak, final documentation, 1.0.0 tag, and
  reproducible artifact. Registry publication remains separately authorized.

## Verification and Git discipline

Use the smallest focused test while iterating and run `npm run verify` before completing a
behavioral unit. Renderer claims require headless browser evidence; visual correctness,
performance, and cleanup each need their own appropriate evidence.

Before every commit:

1. Inspect `git status`, staged names, staged diff/stat, `git diff --cached --check`, and secrets.
2. Stage only one coherent unit.
3. Obtain adversarial review for async, public-contract, presentation, lifecycle, or ownership work.
4. Fix substantive findings and re-run relevant checks.
5. Commit immediately once that minimal unit is green.

On this Windows checkout, use per-command safe-directory configuration when Git requires it:

`git -c safe.directory=C:/Users/38909/Documents/github/voxel ...`

Work headlessly, clean up task-owned processes, preserve unrelated changes, and never discard user
work to obtain a clean tree.
