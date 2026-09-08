# Gate proofs

The standing answer to "did the gates actually do their job".


## If a gate here is wrong

A gate and the claim in its header can be wrong together, and when they are they look exactly like a gate that is right: retiring 356 lessons across this fleet found 43 that named a defect their own named test did not catch. Auditing one means reaching what was actually believed, measured, and abandoned — never the sentence the gate carries about itself, which is the same self-agreement these gates exist to catch.

That evidence was deleted in the retirement commits, not lost. This repo's evidence file as it stood immediately before, all 36 entries with their anchors:

    git show 8aaecfa:docs/learning/lessons-evidence.md

`git log -- docs/learning/lessons-evidence.md` lists every earlier revision, and `git log -S'<phrase from the gate header>' -- docs/learning/` finds the entry a particular gate came from.


Every entry below names a claim this repository used to carry as prose, the gate that now enforces it, and the exact product-code edit that was made to see the gate go red. A gate nobody has made fail is a claim about a gate, not a gate. Each mutation was applied, run against the narrow test file alone, reverted byte-for-byte, and run again green.

Two shapes of false green are checked for deliberately, because this repository has shipped both:

- **The gate tests the fixed unit while the defect lives at the call site.** A helper can be correct and its caller never invoke it.
- **The gate is green because its horizon stops before the defect.** A tick window, a directory list, an include list, an exemption, a frame count, a solver rate — inside it the gate is honest, outside it silent, and no summary tells the two apart. Where a gate's reach could not be widened, its bound is written into the gate's own header as a known limit.

Proofs run 2026-09-02 unless dated otherwise.

## Oak affine collision preserves raw axes, candidates and metric enclosures

2026-09-08. Gates: `fixtures/oak-ecosystem-consumer/oak-voxel-obb.test.ts`, `oak-voxel-aabb.test.ts` and the equal-bounds collision-dependency case in `oak-fallen-litter-voxel.test.ts`. The promoted 18 binary64 pairs came from an independent exact-oracle review before production implementation. Their expected results are fixed data, independent of implementation constants. The permanent controls also cover the strict literal 1.8189894035458565e-12 threshold, direct OBBs, thin shear, exact singularity, projective input rejection, metric precision, large offsets, extreme/subnormal conversion and bounded candidate enumeration.

Mutations restored the original OBB module for the raw-axis and direct-OBB selectors, the original AABB module for outward-bound and shared-bucket selectors, both original modules for the collapsed-bound wrapper selector, and the original bounds-only cache fingerprint for the orientation selector. All six produced native exit 1 with an assertion failure, and every mutated file was restored byte-for-byte. The old wrapper alone with the new outward AABB stayed green: the outward bound already repairs that example. The combined mutation supplies the missing regression proof; the earlier green result is retained rather than reported as a failure.

The scalar filter uses nonzero input magnitudes in [2^-100,2^100], a common 2^-152 input grid and a degree-four minimum nonzero grid step of 2^-608. Intermediate magnitudes stay below 2^407, so the normal-range error model covers cancellation. With u=2^-53, the reviewed raw numerator error is bounded by 601u B³+184u C B², the squared norm error by 183u B⁴ and the coordinate error by 43u B+5u C. Upper-rounded factors 2048u B²(B+C), 512u B⁴ and 256u(B+C) dominate those bounds. An ambiguous norm or threshold uses the exact fallback. EPS and its square use exact multiplication; fallback powers of two are constructed from binary64 fields rather than exponentiation.

For metric queries, outward N/sqrt(Q) intervals enclose each nonzero raw-axis signed depth. Componentwise minima enclose their minimum. The scalar metric returns only when its upward-rounded width is at most EPS/16 and it resolves the strict threshold; otherwise the preserved interval/exact path runs. The returned air-gap interval negates the depth endpoints in reverse order and clamps at zero. Its upper endpoint is `max(0,-signedDepthLower)`. This is the largest SAT-axis gap, not Euclidean distance. An independently implemented global-MIN_VALUE integer oracle checked 656 frozen pairs and 9,696 nonzero axes after the final arithmetic change: 71 scalar metric results and 585 fallbacks had no interval misses or decision disagreements. This run is algorithmically independent; its author now owns the production integration, so a different owner reviews the integrated code.

The candidate grid contracts each endpoint inward by at most EPS/2, with outward arithmetic, only if the interval's certified width exceeds EPS. Thin contained intervals remain unchanged. The coordinate SAT margin is the cross-endpoint margin, not literal intersection width under containment. Each pair's cross-endpoint margin loses at most EPS, so a margin strictly greater than EPS retains a common interval and a common outward-divided bucket. The supported grid requires finite positive pitch, finite ordered bounds, safe integer coordinates and at most 1,000,000 cells per box. AABB hits are candidates; record SAT makes final litter decisions. The separately named weather helper retains trimmed-interior occupancy semantics.

Independent integrated review found a further conversion boundary: a stored column of 5*MIN_VALUE at center 2*MIN_VALUE has an exact half-edge 2.5*MIN_VALUE. Against an EPS half-width box its exact margin is EPS+MIN_VALUE/2, but rounded halves report equality and reject. A column of MIN_VALUE wrongly became zero. Direct OBB fields with axis 1.0000000000000002, half length 0.3 and center 0.30000000000000004 likewise expose a normal-scale product error. The record path now checks whether doubling each computed half exactly recovers its source column. A failed check prepares original dyadics with exponent reduced by one. Direct OBB products are compared with exact dyadic products. Lossy conversions use the same fallback loop with exact nondegeneracy validation and no rounded-vector zero shortcut. The new 64 signed odd-subnormal controls and signed ordinary/subnormal OBB cases pass; restoring each old conversion produces native exit 1 with AssertionError and is restored byte-for-byte. These two additional mutation proofs cover the reviewer-found class, beyond the six original mutations.

Bound: these numerical inputs, bounded indexing domain and the named source/material/presented-solidity checks. This repair does not certify a physical trajectory, material attachment, Euclidean clearance or sustained runtime FPS. The ignored `output/oak-physics-continuation/collision-integration/` evidence retains exact commands, native results, mutations, independent oracle inputs and code/proof hashes. Independent integrated round-two review accepted the corrected source set `27082f4c1747e08b5b92ed9a4157ea186431c88e0f47d6388a72fa826bdab8a9`; the reviewer separately checked 96 literal matrix pairs, 24 half-edge pairs, 34 OBB product pairs, 192 AABB bounds and required grid candidates. Final `npm run verify` passed with native exit 0 on those unchanged bytes: 2,305 unit tests and all 135 browser tests, with one explicitly opt-in unit worker skipped and no browser skips, retries or flaky cases. The slowest browser budget use was 45%. Root accepted this bounded SAT increment for local delivery on main; the complete oak beauty/physics goal remains active. No push is authorized. No existing lesson is retired by this entry.

## A bound checked on one property is not a bound on how the value is read: a guard on `length` binds nothing if the copy consults an iterator

- **Gate:** `tests/core/snapshot-validation.test.ts` :: `copies bounded lists by index without invoking a caller iterator`, and its delta twin `tests/core/render-delta.test.ts` :: `copies the operation list by index without invoking a caller iterator` — run by `npm run test`.
- **Mutation:** in `src/core/snapshot-validation.ts`, `copyByIndexInternal` replaced by `return Array.from(value);`; the identical indexed loop in `src/core/delta-reducer.ts#list` replaced the same way.
- **Red:** both files, `AssertionError: expected 1 to be +0` on `iteratorCalls` — the caller's iterator was consulted, which is how a length-zero array delivered 10,000 elements past `maxResources: 1`.
- **Green after revert:** yes (53 tests).
- **Bound:** the two public validators. A third entry point that copies a bounded list would not be covered; there is no scan for the shape.

## An include list is a claim about coverage that nothing checks

- **Gate:** `tests/testing/typecheck-coverage.test.ts` :: `leaves no source-root TypeScript file outside the compiler program`, and `tests/testing/repo-wide-gate-coverage.test.ts` :: `lints every source root` — run by `npm run test`.
- **Mutation A:** removed `"fixtures/windmill-consumer"` from `tsconfig.json` `include` — the exact 2026-08-01 defect.
- **Red:** `these fixture files are in no TypeScript program: add their directory to tsconfig.json "include"…`, listing the whole consumer.
- **Mutation B:** removed `"tools"` from `tsconfig.json` `include`, after the gate was widened past `fixtures/`.
- **Red:** the same message with 125 files. Before the widening this mutation was invisible — the gate globbed `fixtures/**` only, so the include list could have dropped `src`, `tools` or `tests` and it would still have reported full coverage. That horizon is the reason for the widening.
- **Mutation C:** removed `fixtures` from the `lint` script in `package.json`.
- **Red:** `npm run lint covers only part of the repository — 'eslint src tests tools scripts …' names none of these source roots: fixtures`.
- **Green after revert:** yes.

## A gate that enforces a rule over part of the codebase reads, in every summary, as one that enforces the rule

- **Gate:** `tests/testing/repo-wide-gate-coverage.test.ts` :: `names every top-level directory that holds first-party source` — run by `npm run test`.
- **Mutation:** removed `'fixtures'` from `REPOSITORY_SOURCE_ROOTS_V1` in `tests/testing/repo-source-roots.ts` — the shape of the 2026-08-01 defect, where the rate scan searched `tools/studio` while its rule was about every solver in the repository.
- **Red:** `these directories hold source that no repository-wide gate scans … expected [ 'fixtures' ] to deeply equal []`.
- **Green after revert:** yes.
- **Finding worth keeping.** Under the same mutation, `tools/studio/solver-rate.test.ts` :: `scans every source root…` and the widened typecheck gate both stayed **green**, because they iterate the very list the mutation edited. A list checked against another list agrees with itself. That is why this gate re-derives the roots by walking the checkout, and why the other two are not sufficient on their own.

## An exemption records a diagnosis, and a diagnosis can be wrong; write it to fail when its lane is fixed

- **Gate:** `tests/testing/repo-wide-gate-coverage.test.ts` :: `still has a compatibility lane that compiles outside the typecheck` and `still routes browser budgets through the margin gate that excuses them` — run by `npm run test`.
- **Mutation A:** renamed `fixtures/compatibility` out of the way, so the lane the typecheck exemption names no longer exists.
- **Red:** `fixtures/compatibility no longer exists, so the typecheck exemption for it excuses nothing: delete COMPATIBILITY_ONLY_PREFIX from tests/testing/typecheck-coverage.test.ts`.
- **Mutation B:** deleted the `['./tests/testing/browser-timeout-headroom.ts']` reporter from `playwright.config.ts` — the state the browser lane was actually in on 2026-08-28, when the timeout exemption claimed Playwright specs had "their own gate and their own timeout config" and they had neither.
- **Red:** `playwright.config.ts no longer registers the margin reporter, so the browser exemption in tests/testing/test-timeout.test.ts excuses a lane nothing watches`.
- **Green after revert:** yes.
- **Bound:** these are the exemptions that state a substitute. The rate scan's `generated-` skip is a standing policy rather than a diagnosis — a recording states the rate it was made at as a fact about itself — and is held only to the weaker check that some test still spells a rate.

## A rule inside the generated canon block is loaded right up until a sync silently drops it, and a line number into AGENTS.md is stale within days — quote the rule instead

- **Gate:** `tests/testing/repo-wide-gate-coverage.test.ts` :: `cites no line number into AGENTS.md`, `keeps this repository's own rules out of the block a fleet sync rewrites`, and the non-vacuity case `sees a citation that hides inside prose` — run by `npm run test`.
- **Mutation A:** added a sentence to `docs/policies/local-rules.md` citing the constitution by line number — the file name, a colon, and a line — which is the form this gate forbids and is therefore not spelled here.
- **Red:** the offender list grew to name that line — the scan reads whole lines of prose, which is the only place this defect has ever lived.
- **Mutation B:** renamed `docs/policies/local-rules.md` out of the way.
- **Red:** `docs/policies/local-rules.md is gone; this repository's own rules have nowhere to live that a fleet sync cannot rewrite`.
- **Green after revert:** yes.
- **Bound:** the second case proves the *pointer* to local rules survives outside the canon block. It cannot prove a repo-local rule was never written inside the block, because the block's contents are not this repository's to compare against.

## Size a timeout against the work the test itself does, not the suite's current load

- **Gate:** `tests/testing/test-timeout.test.ts` :: `has no bare numeric budget below the allowance` — run by `npm run test`.
- **Mutation:** `fixtures/physics-playground/playground-cart.test.ts`, one trailing budget `240_000` changed to `30_000` — below `CONTENTION_ALLOWANCE_MS`, which is what ten literals in this repo were doing on 2026-08-07.
- **Red:** `a budget below the allowance opts its test out of the floor every other test gets … playground-cart.test.ts:231 — }, 30_000) (30000 ms)`.
- **Green after revert:** yes.
- **Bound, stated in the gate itself:** the scan cannot read Playwright budgets, and an *intra-test* `{ timeout: 30_000 }` on a single wait inside a browser spec is still invisible to everything. Two of the 2026-08-28 defects were exactly that.

## A frame-loop bug needs the frame loop's own sequence: run two frames, and let the first leave the state the second starts from

- **Gate:** `tests/three/paged-instance-presenter.test.ts` :: `keeps presentation ranges queued when an animated batch also animates` — run by `npm run test`.
- **Mutation:** restored `entry.mesh.instanceMatrix.clearUpdateRanges();` at the head of the non-full-upload branch of `markAnimatedMatrixRanges` in `src/three/instanceBatchPresenter.ts`.
- **Red:** `expected false to be true` on `covers257` — the moved instance's range never reached the GPU.
- **Green after revert:** yes (6 tests).
- **Bound:** two frames. The defect needed exactly two; a three-frame variant is not covered and no shorter sequence reproduces it, which is the lesson.

## A fix landed in one of two parallel lanes is half a fix

- **Gate:** `fixtures/physics-playground/playground-cart.test.ts` :: `bearing friction stops when the last joint lets go` — run by `npm run test`.
- **Mutation:** deleted `this.#refreshJointedBodies();` from `detachJoint` in `fixtures/physics-playground/playground-world.ts`, restoring the add-only registry the twin kept for thirteen days after the live lane was repaired.
- **Red:** `expected 0.8199999928474426 to be close to 0.02` — a released carrier still paying bearing friction at 40x its free-air rate.
- **Green after revert:** yes.
- **Bound:** this gates the twin's behaviour, not the general claim. The durable half — joint construction exists once, in `physics-joint-build.ts` — is not asserted; `fixtures/machine-works-consumer` and `fixtures/windmill-consumer` still build Rapier joints directly, so a scan forbidding that would be false today.

## Two lanes at different solver rates are two worlds, and geometry tuned in ticks on one will not survive the other

- **Gate:** `tools/studio/solver-rate.test.ts` :: `is 60 Hz, and every lane derives from the same constant`, `is spelled nowhere at all`, and the new `is not respelled by a lane that happens to agree with it` — run by `npm run test`.
- **Mutation A:** `PLAYGROUND_TIMESTEP_S_V1 = 1 / 240` in `tools/studio/physics-playground-materials.ts` — the original drift.
- **Red:** `expected 0.004166666666666667 to be 0.016666666666666666`, and `these lines spell a solver rate instead of deriving it from SOLVER_TIMESTEP_SECONDS_V1`.
- **Mutation B:** `MACHINE_WORKS_FIXED_STEP_MS = 1_000 / 60` in `tools/studio/machine-works-machine.ts`.
- **Red:** `these lines respell the shared solver rate instead of deriving it from SOLVER_TICKS_PER_SECOND_V1 — agreeing by coincidence is the defect this gate exists for, not a lesser version of it`.
- **Green after revert:** yes.
- **Live defect found by building this.** Mutation B was not a mutation when it was written: `MACHINE_WORKS_FIXED_STEP_MS` really did spell `1_000 / 60`, for the entire life of the gate whose stated purpose was to end lanes agreeing by coincidence. The scan had a horizon — it looked only for a *wrong* rate — and the right rate, respelled, is the original defect rather than a lesser version of it. `tests/browser/windmill-selected-proof-browser.ts` carried a second instance. Both now divide by `SOLVER_TICKS_PER_SECOND_V1` rather than multiplying `SOLVER_TIMESTEP_SECONDS_V1`, because `1_000 / 60` and `1_000 * (1 / 60)` are different doubles and every recorded replay's provenance carries the first.

## A quantity denominated per second can still be a per-step quantity wearing a per-second name

- **Gate:** `fixtures/windmill-consumer/windmill-compact-axis-diagnostics.test.ts` :: `derives its ceiling from the envelope and the step, not from a number` — run by `npm run test`.
- **Mutation:** `MAXIMUM_SHAFT_AXIS_DIRECTION_RATE_RADIANS_PER_SECOND = 0.05` in `fixtures/windmill-consumer/windmill-compact-evaluator-config.ts`, replacing `MAXIMUM_AXIS_TILT_RADIANS / WINDMILL_FIXED_STEP_SECONDS` with the retired flat value measured at a sixteenth of the current step.
- **Red:** `the axis-rate ceiling is spelled rather than derived, so it is a per-step quantity wearing a per-second name and silently means something else the moment the solver rate moves: expected 0.05 to be 0.3`. Separately, `fixtures/windmill-consumer/windmill-compact-evaluator.test.ts` :: `runs the frozen full nominal horizon` also goes red — the working machine rejected by its own gate, which is the tell the lesson names.
- **Green after revert:** yes.

## A live scene has no end, so a recorded lane's finite trace cannot cover the state it reaches after a minute of play

- **Gate:** `tools/studio/riverfall-live-surface.test.ts` :: `still covers every cell after a minute of unbroken play` — run by `npm run test`.
- **Mutation:** in `tools/studio/riverfall-live-surface.ts#captureWitnesses`, every second parcel marked invisible — the 288-witness water the scene had before 2026-08-01, without touching the config the warm-state pin hashes.
- **Red:** `Cannot map Riverfall surface cell 'surface-pond-13-10' on the live step; found 1 visible solver particles inside the 10-unit compact support (nearest distance 7.210137), but the canonical presentation requires at least 2.`
- **Green after revert:** yes (8 tests, 58 s).
- **Bound, and it is the lesson's own subject:** 3,600 frames, one minute of play. A live scene has no end and this gate does; a failure that first appears at two minutes is outside it. The first mutation attempted here — dropping `RIVERFALL_FLUID_PARTICLE_COUNT` to 288 — failed at import on the warm-state provenance guard rather than on coverage, and is recorded as a mutation that proves nothing.

## A presentation keyed to a measured event inherits that event's cadence, and a cadence is not a constant

- **Gate:** `tools/studio/windmill-live-production.test.ts` :: `predicts the next answered beat-aligned blow instead of inventing a stride` — run by `npm run test`.
- **Mutation:** deleted the spot-occupancy skip `if (impact - ARRIVE_LEAD_SECONDS < spotFreeAt) continue;` from `windmillMilledImpactsV1` in `tools/studio/windmill-production-kinematics.ts`, so the filter answers every blow whatever the cadence — which is what slid sacks through each other on the recorded lane's 0.867–1.000 s gaps.
- **Red:** `expected [ 2.5899620085542834, …(2) ] to deeply equal [ 2.054340000000001, 0.15625, 0.875 ]`.
- **Green after revert:** yes (9 tests).
- **Finding.** Under the same mutation the sibling case `leaves a sack queued when its blow lands too soon to reach the anvil` stayed **green**: it is satisfied by the measurable-beat guard before the spot filter is ever consulted, so it does not gate the rule its title describes. Recorded rather than repaired.

## A ratio needs both terms from the same source

- **Gate:** `tests/testing/browser-timeout-headroom.test.ts` :: `measures each test against its own budget, not against the largest` — run by `npm run test`; the reporter itself is registered in `playwright.config.ts` and runs under `npm run test:browser`.
- **Mutation:** `budgetMs: test.timeout` replaced by `budgetMs: 180_000` in `tests/testing/browser-timeout-headroom.ts` — the denominator assumed from the suite's largest declared budget rather than read from the same source as the duration, which is exactly how "passed on Windows in 60.0 s against a 60 s budget" was computed and was false.
- **Red:** two cases, `expected undefined to deeply equal { status: 'failed' }` — a crowded test no longer reported.
- **Green after revert:** yes (8 tests).

## A display channel built for a light needs a light in the scene, or it resolves to nothing however hard it is driven

- **Gate:** `tools/studio/riverfall-scene.test.ts` :: `declares a light for the tilt channel that exists to be shaded` — run by `npm run test`.
- **Mutation:** `lights: RIVERFALL_LIGHTS_V1` replaced by `lights: []` in `tools/studio/riverfall-scene.ts`, the state the scene shipped in before 2026-08-14.
- **Red:** `this scene drives a surface-tilt channel whose whole visible output is shading, and declares no light to do the shading — the channel then resolves to nothing however hard it is driven…`.
- **Green after revert:** yes (12 tests).
- **Bound, stated in the gate:** it reads this scene's declaration, not every scene's, and cannot tell whether a declared light reaches the water. The pixel measurement in the browser lane is what covers that.

## A control wired to one subsystem answers for one subsystem, and reads as an answer for the effect

- **Gate:** `tests/browser/model-studio-live-physics.spec.ts` :: `one simulation switch stops a live scene that has no authored motion` — run by `npm run test:browser`.
- **Mutation:** `sceneCanSimulate()` in `tools/studio/studio-app.ts` reduced to `return sceneSession?.hasMotion() === true;`, dropping the `|| liveInteract.state().available` half — the state in which the control hid itself on the one scene in the catalog that is nothing but simulation.
- **Red:** that test, plus `a scene only a solver moves offers no timeline, and Play drives the solver`; 5 of 7 passed, both failures deterministic across the retry.
- **Green after revert:** yes (7 passed, 34.1 s, slowest test at 9% of its budget).

## A comparison between a moving thing and a still one measures the movement — NOT PROVED, and the reason matters

- **Gate under test:** `tests/browser/model-studio-windmill-assets.spec.ts` :: `<variant> is visible where it moved` (eight generated cases) — run by `npm run test:browser`. Baseline: 8 passed, 42.1 s, slowest at 3% of its budget.
- **Mutation:** every relocation delta zeroed in `tools/studio/windmill-scene-purpose-review.ts`, so each variant is the canonical scene.
- **Red:** `windmill:review:frame-off-ground-and-joints was not detectably relocated in either view that frames the move. Measured: … changed 0.0000% of pixels with max channel delta 0`, deterministic across the retry.
- **Green after revert:** yes.
- **But that is the gate's non-vacuity, not the lesson.** The lesson is that with both mills *running*, every variant returned 0.0244–0.0273 from the rear — including variants whose moved part is not visible from behind — and the floor was then derived from one of those sail numbers. Reintroducing that defect means dropping `holdStill`, and dropping `holdStill` leaves this gate **green**: the assertion is a lower bound on change, and motion only adds change. A gate that can only be failed by removing the signal cannot notice a comparison that is measuring something else.
- **Therefore the lesson is retained, not deleted**, naming the gate it waits for: a case that compares the eight judged changed-fractions *to each other* and fails when they agree, because a per-variant proof returning one number for every variant is measuring what the variants share. That needs cross-test aggregation the Playwright lane does not currently do.
