# Full-codebase adversarial review — objective `full`, 2026-08-13, iteration 1

Reviewers: Claude CLI `claude-fable-5[1m]` (effort `max`) and Codex CLI `gpt-5.6-sol` (reasoning `ultra`), six lenses over the whole tree — portable data plane (`src/core` + `src/meshing`), Three.js runtime (`src/three`), studio/scenes/physics (`tools/studio` + `fixtures`), tests/gates/verification, cross-cutting invariants and the public boundary, and documentation accuracy. Raw CLI captures lived in gitignored `tmp/review-runs/full/2026-08-13/1/` and are deleted after synthesis; this file is the durable record.

The studio lens (C) died silently on its first run: exit 0, an empty `-o` file, and no status line. It was relaunched with the same prompt and completed. Codex reported that its own Claude Fable pass could not reach the API, which is why the Codex lenses carry no second opinion of their own; the four Claude lenses supplied that independently. No lens was dropped.

Eight findings were confirmed and fixed; a ninth was confirmed, attempted, and reverted with its evidence recorded. Every behavioural fix landed test-first: the test was watched failing on the unfixed code, and for four of them the fix was then neutralized to confirm the test bites rather than passing for its own reasons.

## Confirmed and fixed

### High — a caller's iterator walked past every public input bound

`list()` in both `snapshot-validation.ts` and `delta-reducer.ts` checked an array's `length` and then copied it with `Array.from`, which consults `Symbol.iterator` before the array-like path. A probe against a real `validateAndCopySnapshotV1` — control snapshot validating first, so the probe proved something — executed **10,000 iterator yields from an array declaring `length: 0`**, against `maxResources: 1`. An endless iterator hangs `acceptSnapshot` synchronously on the caller's thread. Both validators now copy by index. Found by Codex lens E, which reported its own probe; reproduced here before acting.

### High — a worker protocol error wedged a scheduler slot forever

`meshWorkerProtocolErrorV1` carries no job identity, by design: it answers a request the worker could not trust enough to echo. `receiveMeshSchedulerResultV1Internal` therefore fell into its `jobId !== job.activeJobId` branch, counted a stale result, discarded the diagnostic, and — unlike the neighbouring terminal branches — never settled the slot. It is the only reply that request will ever receive, and there is no timeout anywhere in `src/` (grep-confirmed), so one main-thread/worker bundle skew wedges every slot and the mesh pipeline stops with no failed group and no named cause. Now terminal for the slot's active job, reported as `invalid-result` with the worker's issue attached through a new optional `issue` field. Claude lens A.

### High — an animated batch dropped the frame's other instance updates

`markAnimatedMatrixRanges` cleared every queued update range before adding its own. Three uploads exactly the ranges present at draw time and clears them afterwards (`WebGLAttributes.js` — read, not assumed). Since the runtime reconciles and then animates in the same frame, a delta moving a non-animated instance never reached the GPU, while the CPU matrix, the conservative bounds, and `instancePresentationMatrixWrites` all reported the move. Only the pending-full-upload branch clears now. Claude lens B.

The first version of this test passed on unfixed code twice — once because the batch had no animation lane so `animate` skipped it, then because a pending full upload from the entry's creation masked the loss. The real path needs frame one to reconcile *and* animate before frame two's sparse update, which is what production does every frame.

### High — capture published pixels under a manifest describing a different frame

`resize()` and `setView()` change the drawing buffer and the camera without retiring `lastPresentedManifest`, and the capture fence compared only manifest identity, device generation, and lifecycle. A capture after a resize returned pixels at the new size stamped with the old viewport and camera matrices — poisoning any consumer un-projecting image coordinates through `manifest.camera`. Both now retire the manifest, so the existing typed unavailable outcome is reported. Claude lens B.

### High — a finite descriptor still produced non-finite geometry

`worldUnitsPerVoxel` and geometry pivots accepted any finite number. A probe confirmed `worldUnitsPerVoxel.x = 1e308` is accepted and `Math.fround(1 * 1e308)` is `Infinity`. Chunk coordinates were already bounded to the exact Float32 integer range; the scale that turns them into world units was not. Both are now bounded to what a Float32 position buffer can hold, and the message names the value and the range. Codex lens E.

This made the presented store's `voxel-coordinate-overflow` guard unreachable through the public boundary, so the test that reached it by feeding `Number.MAX_VALUE` was rewritten to pin the stronger contract — the refusal happens before a store can exist — rather than deleted.

### High — a static projective instance matrix broke its own bounding sphere

Affine validation ran only inside `if (animation !== undefined)`. The conservative batch bounds scale a radius by the linear part's Frobenius norm, which bounds nothing for a projective transform, so the instance falls outside the sphere meant to contain it and vanishes under frustum culling and the raycaster broad phase. Every instance matrix is checked now. The new check runs *after* the animated one so an animated batch keeps reporting the more specific `batch.animation.matrix-affine` it always did — only previously-accepted input changes verdict. Codex lens E.

### High — the playground's two lanes solve different worlds (confirmed, not fixed)

The headless twin sets soft CCD on every dynamic body; the live studio lane applies it only when a body plan declares it, and no playground profile ever did (`softCcdPrediction` appeared nowhere outside its own declaration — grep-confirmed). Rapier's default is 0. Both files promise the lanes are one world; the measured gap is 0.16427 m of burial against 0.00342 m, and only the headless number was ever checked.

**The obvious fix was made, gated, and reverted.** Declaring `softCcdPrediction` for every dynamic body in the profile builder takes the live trebuchet from 23 bricks knocked past a quarter metre to **zero** — caught by `model-studio-physics-playground.spec.ts` in the full gate, and confirmed by reverting only that line and watching the spec pass again. The headless trebuchet's 19 scenarios stay green either way, because none of them assert the wall coming down.

That is the whole difficulty: "make the live lane match the twin" assumes the twin is right, and nothing here establishes that. The headless lane is the one with the assertions, but the browser lane is the one with a working machine, and the setting is a solver accuracy knob rather than a physical law — this repo has already measured that soft CCD reads linear velocity only and is inert for a rotating contact. Which lane to move is a physics question with its own measurements, and bending the browser expectation to protect the change would have been exactly the workaround-as-furniture the owner rule forbids.

Recorded as a comment at the divergence site carrying the measurement and the failed attempt, so the next session starts past it rather than at it.

### High — deleting the open scene skipped the live-physics teardown

`deleteStudioScene`'s open-scene branch was a hand-copied subset of `closeSceneMode` and had drifted by exactly the two calls that matter: `liveInteract.openScene(null, …)` and `playgroundPanel?.sceneOpened(null)`. Nearly every shipped scene has a live profile, so deleting one left its Rapier world stepping against a retired snapshot until the pose delta threw `pose.instance-missing` over the restored model view, with the Adjust/Interact buttons and the playground panel still on screen. The delete path now calls `closeSceneMode()` and keeps only its own retirement work. Claude lens C — which also named the duplication as the cause, not a coincidence.

### High — two solver body constructors escaped the universal physics laws

`spawnAt` (the ball-drop spawner) and the chain fixture built raw Rapier bodies with no linear damping, while `#applyRollingResistance` still governed their spin — a body whose rotation was damped and whose fall was not. Both now apply the air law at construction. Reported independently by Claude lens C and Codex lens F, which is what raised it above "latent".

## Gate and coverage holes closed

- **`fixtures/chain-consumer` and `fixtures/deterministic-math.test.ts` were in no TypeScript program.** A live Rapier lane, four source files, with type-aware lint disabled for `fixtures/**` — so a wrong shape passed `typecheck`, `lint`, and `test` alike. Adding them found three real `Object is possibly 'undefined'` errors on the first run. `tests/testing/typecheck-coverage.test.ts` now asks the compiler which files it covers (`tsc --listFilesOnly`, not the include list, because TypeScript also pulls in what an included file imports) and fails when a fixture falls outside. Confirmed to bite.
- **The solver-rate scan listed `scripts/` but read only `.ts`,** and every file there is `.mjs` — so that directory contributed zero files while the scan's own comment claimed whole-repository coverage. Widened; confirmed by planting a `1 / 240` in a `scripts/*.mjs` and watching it fail.
- **The timeout meta-scan could not see the multi-line trailing-comma budget form** already in the tree, and swept `node_modules`. Both fixed; confirmed by lowering that exact budget below the floor and watching the gate catch it.
- **CI proved the complete gate only on Node 22** while `.nvmrc` and the canon declare Node 24 the baseline — the browser suite, compatibility, package and supply-chain gates never ran on the declared toolchain. The roles are swapped: Node 24 carries `npm run verify`, Node 22 carries the portable subset. Found by Claude lens D and independently by this session's own reading.

## Documentation corrected

Codex lens F carried this, and its findings matched three the session had already found by hand.

- `AGENTS.md` named the solver-rate gate under a `tests/studio/` directory that does not exist; it lives at `tools/studio/solver-rate.test.ts`. It also still listed Machine Works, Riverfall, Windmill and the chain as "delivery work to convert" — all four converted, and `catalog.test.ts` now refuses a recorded shelf scene. Both corrected; the ban on new recorded scenes stays.
- The Gates section named no toolchain, which the 2026-08-13 canon sync made a requirement. It now does, and the sentence was rewritten once CI was changed to make it true — the first draft described a CI that did not exist yet.
- `model-studio.md` described Machine Works as a 30-second replay with a scrubbable timeline, listed eleven of the fourteen live profiles, and said the chain's live bodies "start at the recording's opening poses". `chainLiveSpawnPosesV1` derives that curve analytically and reads no recording; the same stale idea sat in two comments in `scenes.ts`.
- `consumer-integration.md` promised that a `voxelWorkers` runtime keeps the synchronous path for an unprofiled world. Ingest rejects it with `three.voxel-profile-required` on both snapshot and delta.
- `physics-playground.md` said eight scenes (nine), 2 % fall-time agreement (4 %, and the same guide said 4 % elsewhere), a wall that moved twice to −26.6 (four times, to −24.5), no first-law check (there is one), and a 250–300 detection floor (200–400).
- `physics-playground-materials.ts` carried a long note saying the lane had *not* reached 60 Hz and that moving the constant was unsafe — directly above the line deriving it from the shared rate. The twin claimed a 1/240 tick in two places. The rate scan strips comments by design, so nothing could catch these.
- README and CHANGELOG attributed flat-resource evidence to 30 real device losses; that test's own comment says a context loss resets Three's memory counters, so it cannot see a leak and the claim belongs to the repeated-edit test.
- `voxel/physics` shipped after the frozen 1.0 tag under version `1.0.0`, with no changelog entry. HEAD is now `1.1.0` with a release section.

## Iteration 1b — five more fixed after a scope challenge

The first pass deferred eight findings. Reviewing that list honestly, several
deferrals were fatigue rather than judgement, and one of them was a bug of
exactly the class the pass had just fixed.

### High — a valid snapshot was rejected once a world got thin

The chunk-overlap sweep sorted on `x` and stopped scanning forward when a chunk
began past the current chunk's end on that axis. A world *thin in x* — a wall, a
tower, a corridor — never triggered that break and paid n²/2 comparisons.
Probed: **1,400 chunks in a single x-slab with zero overlaps are accepted, 1,415
are rejected** with `limit.chunk-overlap-comparisons`. Correctness never depended
on the axis; only the cost did, so the sweep now sorts on whichever axis the
chunks actually spread along. Both halves are pinned — the 2,000-chunk wall is
accepted, and a deliberate overlap in that same shape is still caught.

The duplicate implementation went at the same time: `snapshot-validation.ts` and
`delta-final-graph.ts` maintained the same thirty-five lines and the same budget
literal, and now share `src/core/chunk-overlap.ts`. Profiled worlds skip the
sweep entirely — equal sizes, grid-aligned origins and distinct grid coordinates
are a partition, which `assertUniformChunkProfileInternal` already proves, so
sweeping them again was charged work that could only reach the same answer.

### Medium — a deterministic result depended on how busy the host was

`PlaygroundScenarioResultV1.status` was `failed ? 'fail' : slow ? 'warn' : 'pass'`,
where `slow` came from `performance.now()`. The field's own doc comment said
timing was "reported, never part of the verdict inputs" — the code contradicted
its documented contract, and the determinism test had to tolerate two runs of one
scenario disagreeing.

This had already cost something: a loaded full-gate host measured 62 ms and
81.48 ms steps that turned all-checks-passed runs into reported failures, and the
repo had built `expectScenarioCorrectV1` plus three explanatory comments around
it. The verdict is now a pure function of the checks, timing stays in
`maxStepMs`/`meanStepMs`/`timingNote`, the determinism test asserts equality, and
the workaround comments are gone.

### Medium — a contact policy that silently applied to nothing

The policy resolves colliders through the built-body map, and a spawn-only body
is not in it yet, so the policy applied to an empty list and `spawnPlanned` later
built colliders with Rapier's default groups — colliding through pairs the policy
never granted. An unnamed spawned body was not inert at all, the inverse of the
stated guarantee. No profile combines the two today, so the combination is now
refused at construction with a message naming the bodies and what would satisfy
it, rather than shipping a policy that is a decoration.

### Low-medium — bearing friction outlived the joint that earned it

`#jointedBodies` was add-only: ids went in on joint creation and never came out,
not on `detachJoint` and not when `removeBody` took a partner away.
`#applyRollingResistance` kept charging `bearingFriction` — 25 to 40 times
`airSpinDrag` — to a body no joint held, though the law is written in the present
tense. The set is derived from `#joints` now and recomputed on every mutation,
and `angularDampingOfV1` was added so a test can watch the law act, matching the
fixture lane's `linearDampingOfV1`.

### Test coverage — eight browser specs asserted nothing about page errors

Including the Interact-lane spec that drives real pointer input against the whole
app, which is where an incidental exception is most likely and least visible: an
overlay, HUD, annotation or teardown path can throw without disturbing the poses
a test reads or the region it screenshots. `tests/browser/page-errors.ts` adds a
one-line-per-file hook covering all 34 tests, skipped when a test already failed
so it never masks the real failure. Verified by injecting a `console.error` into
the studio mount path and watching all five mount tests go red.

## Iteration 1c — the last four, measured

All four remaining findings were closed. Two needed a measurement, which was taken; one needed a contract decision, which was made narrow enough to be additive; and one turned out to rest on a claim that did not hold.

### The duplicated heavyweight solves — claim did not survive measurement

The finding said both suites "re-solve the entire live scene", costing "minutes of duplicated solver work on every `npm test`". Measured: one 32-second Machine Works solve is **623 ms**, the second case **732 ms**; the windmill's are **141 ms** and **102 ms**. The duplication costs about 0.7 s and 0.1 s respectively, not minutes, and sharing a run would trade two tests' independence for that. Not done, and the premise is recorded so it is not re-proposed.

The other half of the finding was real. Both files carried bare literals — `900_000` and `600_000` — for work measured in hundreds of milliseconds. Those sit *above* the shared floor, so the meta-scan never saw them, but fifteen minutes of budget for two thirds of a second would let almost any regression pass. Both now derive from `timeoutForMeasuredWorkMs` with the measurement stated beside the constant.

### The windmill legibility floors — measured, and one constant was serving two populations

Measured from the canonical renders: across **138 footprint samples** the smallest real asset covers **5,734 pixels** (the floor was 50); across the **8 relocation cases** the tightest moves **2.44%** of pixels in its best camera (the floor was 0.01%, **244x below**).

Raising the shared floor to match the relocations immediately failed four removal proofs — and that failure was the useful part. Removing one exact box legitimately changes well under one percent of the frame: across **98 removal variants** the smallest detection is **0.000359**. One constant had been serving two populations whose true magnitudes differ by two orders of magnitude, which is why the relocation assertion sat near noise for its own population.

They are separate constants now, each set at half the measured minimum of its own population, so a real asset keeps 2x headroom and a regression to a sliver cannot pass. Verified load-bearing by raising the relocation floor past every real detection and watching all eight fail.

### Capture colour space — made detectable rather than redesigned

`docs/design/spec.md` promises captures encode sRGB. `RendererLike` carried no colour-space information, and nothing in `src/three` set or asserted it, so a borrowed renderer configured for linear output produced a capture that satisfied every MIME and dimension check with the wrong colours. Three's own `WebGLRenderer` sets `outputColorSpace`, so a borrowed real renderer always supplies it.

`RendererLike.outputColorSpace` is optional and read only when present — existing custom adapters keep compiling — and capture refuses a non-sRGB renderer with `three.capture.output-color-space`, naming what it found and what would satisfy it. That is the narrow version: the mismatch becomes a named refusal instead of silent wrong colour, without redesigning where the burden sits.

### `ChunkIndexV1`'s unbounded slot map — the mechanism, recorded

This one stays open, and now with the reason rather than an estimate. The retention is not incidental: a coordinate with no slot restarts at generation 1, so dropping a tombstone lets an in-flight worker result from a coordinate's previous occupancy carry a generation the new occupancy also claims. `chunk-index.test.ts` already pins the ABA case at generation 4, so the unsafe repair fails loudly — which is the right state for it to be in.

Bounding rather than dropping is safe in principle, but the only correct response to "this index can no longer prove staleness for old coordinates" is a new epoch, and the profiled plan path that calls `build` has no epoch-replacement path to fall into. So the work is a runtime lifecycle change, not a cap in the index. That, and the condition that would trigger it — a consumer paging chunks through a long-lived epoch, which the current release does not have — is now recorded at the site.
