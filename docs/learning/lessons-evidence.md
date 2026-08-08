# Lessons — evidence

The war story and the anchor behind each line in [lessons.md](lessons.md). Not session-start reading: open an entry when its rule is in doubt, or when the work is in that area.

Every entry carries an anchor — a measurement, a commit, a test id, or a behavior delta — per the fleet constitution; an entry without one is folklore and does not belong here. Entries are appended, and a superseded entry is corrected in place with its correction dated, never silently deleted, so several below end in a correction that contradicts their own headline.

## The Machine Works landing dent resists every cheap fix, and the cheap fixes are not equally wrong

**Anchor:** 2026-07-30. Eleven full trace regenerations against `studio:scene:contrast-machines`, measured through `sceneSurfaceConflictsV1`. Nothing landed; `scene-conflict-report.test.ts` still pins the 0.023 dent.

The finished product dents the collection bucket by 0.023 world units as it lands — 4.6× the 0.005 contact slop. What follows is what was tried, so the next attempt starts past it rather than at it.

**Continuous collision detection does nothing here, and the recorded fix said it would.** Enabling it on the product bodies left the dent at 0.023, unchanged to three decimals. CCD prevents *tunnelling* — a body moving far enough in one step to skip clean over a collider, with no step where they overlap — by sweeping the path. This is *penetration*: the contact is found correctly, but the bodies are already slightly overlapped when it is found. At the landing the core falls 5.53 world units per second, which at the fixed 1/60 s step is 0.09 units of travel between contact tests; a body seven voxels wide cannot skip past anything at that speed, so the sweep finds exactly the contact the discrete test already found. CCD also is not free — it is opt-in per body precisely because swept tests cost — so this would have been permanent cost for no benefit.

**Solver tuning is noise, not progress.** 16 iterations gave 0.016; adding internal PGS iterations and a tighter error tolerance gave 0.022; iterations combined with damping gave 0.010 against damping's own 0.009. Tightening `normalizedAllowedLinearError` to 0.0002 alone was the single best honest result at 0.007, but tightening it further to 0.00002 went back up to 0.016. Across eleven configurations the number wanders between 0.007 and 0.025 without trending. The landing is chaotic and the scan samples 96 instants, so each configuration catches a different moment. Treat a band like that as noise and stop tuning — and do not pin an improved number from inside it, because the improvement is not reproducible.

**Damping the drop works on the dent and breaks something truer.** Damping the product from its release tick does reduce the arrival speed and, with the tolerance change, cleared the dent entirely. But `machine-works-simulation.test.ts` asserts that solver gravity accelerates the airborne assembly at between 5 and 20 world units per second squared, and damping strong enough to matter drops the observed acceleration to 0.48 (damping 6) or 3.11 (damping 2). The scene would stop demonstrating the thing it claims to demonstrate. A spatial gate bought with a falsified physical claim is a bad trade; the gate is a proxy for honesty, not the point of it.

**The fixture's guards are load-bearing and each one paid off.** Damping declared on the assets applies from the first tick, including while the belt carries the product, and at useful strength the carrier loses belt contact — the output-servo guard rejected the trace with the exact tick and distance. Damping applied at release instead, but too strong, left the product still moving at the end of the fixed 1800-tick trace — the collection guard rejected it with the final speed, position, and containment. Neither failure needed debugging; both messages named the cause. When a change to this fixture is wrong, the fixture says so.

**What is actually left.** The dent is impact penetration at a 60 Hz step, so the honest fix is temporal resolution: substep the world several times per frame. That preserves both the drop's appearance and the gravity claim. It is real work rather than a parameter change, because kinematic targets are set once per tick with `setNextKinematicTranslation` and would have to be interpolated across substeps — and that is the belt-friction transport driving the entire trace.

## Corollary: one parameter, two opposed outcomes

Release damping had to be strong enough to soften a landing and weak enough to let the product settle inside a fixed-length trace, and separately weak enough to keep the fall gravity-driven. The usable window for the first two constraints was 4 to 6; the third excluded all of it.

When one knob controls outcomes that pull against each other, scope it to the phase that needs it — damping at the release tick rather than on the asset was the right *shape* even though the value never worked. If no scoping helps, the knob is the wrong lever and the cost is in the model, not the tuning.

## A rule that is only prose drifts inside the session that wrote it

**Anchor:** 2026-07-31. `LIVE_TIMESTEP_SECONDS_V1` and `PLAYGROUND_TIMESTEP_S_V1` both spelled `1 / 240` independently; `tools/studio/solver-rate.test.ts` now fails on any lane that drifts.

The owner's rule is 60 Hz everywhere. Written as prose it lasted less than a session: two files spelled the same literal and agreed by coincidence rather than by construction, so the headless twin and the live session were quietly different worlds and nothing said so.

Turning the rule into a test found three more things immediately that no reviewer had noticed — two stale doc comments claiming a 1/240 tick, and a user-facing button in the playground panel still telling the owner it advanced "one 1/240 s solver tick" on screen. All three were left behind by the very change that moved the lane to 60 Hz. A rule a gate checks is worth more than a rule everyone agrees with, because the gate reads every line and no one does.

The exemption list is part of the design, not a hole in it. Each entry states why, the test asserts the reason still appears in the file it exempts, and the playground case is written to **fail when the playground is fixed** — telling whoever fixes it to delete the exemption. An exception that cannot notice its own obsolescence becomes permanent.

## Lessons nobody reads are not lessons

**Anchor:** 2026-07-31. AGENTS.md's Conventions section began naming this file in its session-start reading — "read `README.md`, `docs/design/spec.md`, and `docs/learning/lessons.md` before substantial work"; before that, the file was named only in the rule governing its own format.

This file existed, had a rule about how to write entries, and was never once instructed to be read. `CLAUDE.md` is `@AGENTS.md`, so AGENTS.md reaches every agent automatically and this file reached none of them.

The consequence for where things go: a rule that must be followed belongs where it is loaded and cannot be overwritten; the evidence behind it belongs here, which is now read at session start. Writing a hard-won lesson only here was, until 2026-07-31, the same as deleting it.

**Corrected 2026-08-05, by the failure this entry did not anticipate.** The anchor above originally cited `AGENTS.md:68` and `AGENTS.md:28` by line number, and both had moved — line 68 now holds an unrelated known trap. Worse, the conclusion said a rule that must be followed "belongs in AGENTS.md, which is loaded", and the rule requiring these very anchors was put there and then deleted: it sat inside the generated `FLEET-CANON` block, and the 2026-08-04 fleet sync (`99f09f2`) trimmed the clause out of `FLEET.md`, taking it from this repo without anyone deciding to drop it. It now lives in `docs/policies/local-rules.md`, which no sync can rewrite. **Two corollaries, both learned the hard way: a line number into AGENTS.md is stale within days, so quote the rule instead; and "loaded" is only half the requirement — a repo-local rule written inside the canon block is loaded right up until the moment it silently is not.**

## A timeout sized against the suite's current load is a time bomb

**Anchor:** 2026-07-31. `tools/studio/lighting-1000-showcase.test.ts` and `tests/testing/mesher-benchmark-harness.test.ts` both timed out under a full `npm run test` and passed alone — the lighting test at 756 ms and 8.8 s respectively in isolation.

The lighting test already carried a comment explaining that 20 s was chosen to "leave room for parallel-suite load" after an earlier timeout. It expired anyway, because the live-physics scenes then added their own multi-second Rapier runs and ate the margin.

Any margin picked against what else happens to be running is consumed by the next heavy test anyone adds, and each expiry presents as a real failure until someone reruns and sees green. That teaches rerunning-until-green, which is how a suite stops being a gate. Size a timeout against the work the test itself does, generously, and let the machine be slow.

**It happened again on 2026-08-01, to a third case, and this is how it should be handled.** `riverfall-fluid-simulation.test.ts`'s causal-evidence attestation expired at its 60 s budget inside a full `npm run verify`, on a diff that had changed nothing but comments since the same code passed the same gate twenty minutes earlier. Measured alone it takes 44.4 s, and its sibling ablation sweep 29.9 s — both were carrying 60 s, a 26% margin. The point is what *not* to do: rerunning until green would have worked, and would have left the bomb armed. Both now derive from one `RIVERFALL_HEAVY_CASE_TIMEOUT_MS` at four times the measured work, with the measurement written beside it. **A timeout that fires on a diff which cannot have caused it is not noise to rerun past; it is the defect reporting itself.**

**It happened a fourth time on 2026-08-07, and the 4× rule above is why.** See the next entry: a multiple of the work does not scale down, and the fix is now a gate rather than a paragraph.

## A budget below the shared floor is worse than none, and a multiple of the work is not a floor

**Anchor:** 2026-08-07. 15 tests across 11 files expired at vitest's unstated 5,000 ms default on a markdown-only diff, reproduced exactly (11 files, 15 tests, 1,876 passing) under 24 competing CPU workers on 32 cores. `tests/testing/test-timeout.test.ts` now pins the rule and scans every test file for violations; the same load passes 226 files / 1,898 tests.

Those tests measure 570 ms to 1,694 ms alone and 5,425 ms to 11,708 ms under that load. None had chosen a budget at all — they inherited a default sized against nothing.

**Four times the work would not have saved one of them.** That is the multiple the entry above established from the Riverfall cases, and it does not transfer down the scale: four times 570 ms is 2.3 s, *less* than the 5 s default the test had already blown. The stretch is worse for shorter tests — 570 ms goes 10.8×, 1,694 ms 6.9×, 9,629 ms only 5.5× — because contention costs a roughly fixed amount of scheduling delay on top of whatever it multiplies. So a budget is an allowance **plus** a multiple, never the larger of the two. `timeoutForMeasuredWorkMs` is 45,000 ms + 4 × measured, and the config's global default is that rule applied to zero work.

**An explicit budget below the shared default is strictly worse than writing none**, because it opts its test out of the floor every other test gets. Ten hand-written literals did that here — `15_000` and `30_000` — two of them in `riverfall-fluid-simulation.test.ts`, the file that already carried the entry above. They passed the 24-worker reproduction at 24.7 s and 21.9 s against their 30 s, then blew it at 41.8 s and 52.7 s when the load doubled. **A budget that survives the load you happened to test at is the same bomb with a longer fuse.**

**The inventory is the finding, and the first one was truncated.** The initial sweep for existing timeouts ended in `head -40`, which cut off before reaching `fixtures/`. So the first fix shipped covering the 15 tests that had no budget while missing the ten that had a bad one, and the very next run failed on two of them. That is the exemption entry's lesson arriving from the other side: a search covering part of the tree reads, in every summary, like a search that covered it.

## Moving to 60 Hz found two tests that had been passing for the wrong reason

**Anchor:** 2026-07-31, commit `73f9bbc`. Machine Works, moved off its 240 Hz solver onto the shared lane; once both defects were repaired the run test passed at both 32 and 72 simulated seconds.

**The carrier's tip was never implemented, and 240 Hz hid that.** The scene had always said that a position command tips the carrier about its bucket-boundary edge so gravity empties it. No code did that. At 240 Hz the product left the carrier anyway, by an accident of contact timing; at 60 Hz it simply sat there. The rate change did not break the scene — it stopped the scene getting away with a missing mechanism. So anything whose result depends on contact resolution is worth running at a second rate before it is believed, because passing at one rate is compatible with the mechanism under test not existing.

**The run test built its own world.** It constructed bodies from the scene's authored placements, while the studio builds them from the live profile's opening poses, so the belt's slats started on the grid instead of on their path. It had been green for weeks against a world the studio never builds. It now constructs through the studio's own path. A test that assembles the world itself is testing the world it assembled, and no amount of it passing says anything about the product's.

A third defect in the same commit is the same shape from a third angle: the machine driver advanced once per `observe` call rather than by the solver steps that had actually happened, so it ran the machine at the wrong rate and dropped the product outside the world — which the render showed and no test did.

## The mill's flour climbed out through the roof with 953 tests green

**Anchor:** 2026-07-31, commit `eb1260e`. Found by looking at the live Windmill from three angles at 1,200-tick intervals, not by a test; `windmill-live-production.test.ts` now runs twenty blows past the fifth and requires the level to stop.

The flour level rose one fixed step per hammer blow. That was right while the recorded lane carried exactly five blows, and wrong the moment the mill went live: a live mill strikes for as long as the wind blows, so the level climbed without bound. Every number involved stayed sane — a level, a blow count, a step size, each finite and each plausible — and all 953 tests passed. The scene already said what the answer was: five sacks, five rises, bin full. Only blows that mill a sack raise the level now.

**Then the picture lied about what was wrong.** In the same visual check, the front-left view appeared to show a sack sitting on the roof. It was the far sail seen against the roofline: the sails top out at 2.625 and the roof reaches 3.25, and a side elevation showed the whole mechanism enclosed with nothing above the ridge. Looking is what finds the defect a green suite cannot; measuring is what tells you whether the thing you saw is one.

## Two tests written to a reviewer's finding passed with and without their fix

**Anchor:** 2026-07-30, commit `08ca50e`. The review thread is `docs/threads/current/full/2026-07-30/1/REVIEW.md`, whose closing notes record this against its forty findings.

Every fix in that review was checked by neutralizing it and watching its test fail. Two candidate tests did not fail, and were discarded rather than committed. One passed because an unrelated guard rejected the payload before the code under test ever ran; the other because the validator already caught what the estimator was said to have missed, so the finding was not reproducible at all.

Both were written against the reviewer's claim rather than against observed behaviour, which is what made them plausible enough to nearly ship. An adversarial finding is a hypothesis: it names a mechanism that would explain a defect, and it can be right about the code and wrong about the consequence, or right about neither. A test derived from the claim inherits whatever the claim got wrong and then reports green, which reads in the log exactly like a repair.

The failing-first check is what separates a repair from a story, and it costs one run. It is the discipline the physics fixtures already spend on counter-runs, pointed at review output instead.

## Test the obvious suspect before recording it as unexplored

**Anchor:** 2026-07-31. Rapier's `lengthUnit` at 0.25, 0.5, 1 and 2, against the playground's 60 Hz floor-penetration failure. None changed it.

`lengthUnit` is the reference scale Rapier expresses penetration tolerances against, and the playground runs 0.25 m voxels while never setting it — a textbook explanation for bodies resting too deep, and one the windmill fixture already sets explicitly. It was worth an hour of certainty that the earlier tuning sweep had been scaling values against the wrong unit.

It was not the cause. Recording that is worth as much as a fix, because the next person will have the same idea, and "already tried, no effect" is what stops a good hypothesis being tested three times.

Also worth naming: the second failure that appears at 60 Hz reads as a determinism break, and is not one. The determinism case re-runs the scenario and asserts it does not fail, so it simply reports the penetration failure a second time. A failing check that shows up twice under two names invites a much larger investigation than it deserves.

## Riverfall's apparent freeze was a startup stall followed by a catch-up spiral

**Anchor:** 2026-08-02. At commit `f5a5670`, headless Chromium measured 15.600 seconds from `openScene` to the first accepted live surface pose, a 15.036-second maximum `requestAnimationFrame` gap, and then 243 fixed solver ticks but only 41 visible pose commits over 5.326 seconds. Direct construction took 14.345 seconds and `advance(1/60)` measured 18.30 ms on that browser lane before rendering.

Two separate multipliers made one symptom. `RiverfallLiveSurfaceV1` repeated the canonical 3,200-substep burn-in synchronously on the browser main thread, even though burn-in always produces the same deterministic initial condition. Afterward, a slow frame accumulated up to six session ticks and the presentation ran a complete fluid solve and 321-tile remap for every tick before drawing any of them, producing repeated 90–160 ms tasks and about 7.7 visible commits per second. The poses themselves changed, so neither the solver nor the runtime delta path was frozen.

The generated consumer evidence now also pins a compact post-burn-in solver state. Studio defensively copies that initial condition and solves every later state live; it is not a pose trace and it does not supply any later motion. Fixed-step contact watchers and machine controllers still observe every tick. Riverfall likewise preserves every 60 Hz PBF and advected-phase sample when one animation callback contains several ticks, but batches them and materializes the 321 final tile poses only once; the fixed-step equivalence test proves that grouping six ticks produces the same pose map as six separate frames.

The autonomous browser regression starts a heartbeat before opening, never calls deterministic `settleLive`, and requires readiness, ongoing solver steps, and a changed canvas. After exact catch-up batching, a repaired run reached live stepping in 1,366.8 ms, kept the maximum observed rAF gap to 200.0 ms, and advanced 230 solver ticks over the 3.80 seconds spanning the two screenshot samples; the committed test uses categorical bounds rather than pinning those host-dependent timings.

## A live Riverfall costs almost a whole frame, and the solver is most of it

**Anchor:** 2026-07-31. Measured through `RiverfallLiveSurfaceV1` at `LIVE_TIMESTEP_SECONDS_V1`: 15.75 ms per frame after optimisation, against the 16.67 ms a 60 Hz frame has for everything including rendering.

Converting Riverfall off the recorded lane is not blocked by the surface mapping, which was the part that looked expensive. It is blocked by the fluid.

The split, measured separately: the PBF solver costs **2.97 ms per 5 ms substep**, and a 1/60 s frame needs **3.33** of them — **9.89 ms of solver per frame**. The surface remap costs the rest.

The remap started at 8.05 ms and is now 6.23 ms, from one change: it was collecting every candidate particle for a cell into an array, sorting the whole array, and keeping the nearest eight. With 321 cells against 288 witnesses that is 321 sorts a frame of a list that is 97% discarded. Keeping the best eight by insertion instead produces the identical selection — the ordering was (distance, then particle index), which is exactly the order particles arrive in for ties — and the byte-for-byte replay pin proved the output did not move by a single float. That pin is what made the optimisation safe to attempt at all.

What is left is the solver, and the honest lever is its substep. `substepMs` is 5, chosen for the recorded lane where wall-clock cost did not matter. Doubling it to 10 would halve the per-frame solver cost, but it changes the integration, so it changes the recorded trace, and PBF stability at a coarser substep has to be re-measured rather than assumed — density error, boundary correction, and the acceptance gates all bound behaviour that a longer substep degrades. Do not simply raise it to make the frame fit; that is the same mistake as widening a penetration tolerance.

**Corrected 2026-07-31, the same day it was written.** The last paragraph's conclusion was wrong, and so was the entry's headline. The substep was never the lever, and the fluid was never the blocker. A profile taken instead of assumed found the frame was mostly waste, and removing it took the frame to 4.32 ms with the integration untouched — see the entry below. The warning about `substepMs` stands on its own merits and is why it was not touched; but it was offered here as the way forward, and it was not. What this entry got wrong is instructive: its numbers came from timing two things and subtracting, which attributes every cost to whichever half you did not measure directly.

## The Riverfall frame was three-quarters waste, and none of it was where subtraction said

**Anchor:** 2026-07-31. `RiverfallLiveSurfaceV1.advance(1/60)` measured at 14.21 ms before and 5.2–7.3 ms after by the same mean-of-300 harness, 4.32 ms by a min-of-batches estimator. All 62 Riverfall tests pass throughout, including the byte-for-byte replay hash, and the new neighbour search was checked against the old one across 159,888 pairs for identical set, order, and distance.

The entry above concluded the fluid solver was the blocker and the substep was the lever. Both were wrong, and the method that produced them is the lesson: it timed the whole frame, timed the solver, and called the difference "the remap". A subtraction cannot tell you *which part* of the remainder is expensive, so it silently attributed 6.23 ms to the mapping loop that had just been optimised. Timed directly, that loop costs **1.19 ms** for all 321 cells.

Three real costs, found by profiling the parts rather than the halves:

**Rebuilding static geometry every frame — the largest single cost in the scene.** `smoothRiverfallSurfaceSignalsV1` called `riverfallSurfaceNeighborsV1(cells)` once per frame. That function derives cell adjacency from `baseTranslation`, which never moves, at a cost of 321 × 321 = 103,041 distance computations and 321 intermediate arrays. It was larger than the fluid solver it existed to present. Caching it by cell list is the entire fix. Look for this shape: a pure function of immutable data called from a per-frame path.

**The neighbour search was 68% of a substep and almost none of it was searching.** 1.878 ms of a 2.758 ms substep, rebuilt five times per substep. Per build it allocated ~2,880 strings to key a hash map, called the domain sampler ~6,600 times — each call allocating a result object and scanning the reach list with a closure — allocated an object per accepted pair, and comparison-sorted them. About 300 ns per pair, nearly all of it garbage. A counting sort into a flat cell table writing into reused typed arrays took the substep to 0.898 ms.

**92,448 throwaway arrays a frame.** The mapping loop built a three-element tuple per particle per cell to hold numbers used once, and spread a tuple into `Math.hypot`.

The pattern across all three: **the arithmetic was never the cost — allocation and repetition were.** Nothing here needed a cheaper algorithm in the mathematical sense; the same operations in the same order, without the garbage, were enough.

Two things made it safe to be aggressive. The byte-for-byte replay pin means any numerical drift fails loudly, so "did I change the physics?" is answered by a test rather than by reasoning — which is why `Math.hypot` was kept over the faster `sqrt(a*a+b*b)` and distances were stored as `Float64Array` rather than `Float32Array`. And the equivalence check against the old neighbour builder caught ordering mistakes the pin would have caught later and less specifically.

Finally, on measuring: **a single timing run on a loaded machine is worthless, and will invert your conclusion.** The same suite took 27 s and then 44 s minutes apart; a remap change measured as 9.51 ms then 14.07 ms with nothing between them but load. Use the minimum over several batches — the least-disturbed run is the closest to the truth — and never compare a mean baseline against a min result.

## The trebuchet worked at 240 Hz and not at 60 Hz, and only the browser ran it at 60

**Anchor:** 2026-08-01. The same machine, through the same live path, with only `LIVE_TIMESTEP_SECONDS_V1` changed: at 240 Hz the ball flies to the wall and moves 12 of 33 bricks, the farthest by 6.32 m; at 60 Hz it goes almost straight up — apex 16.9 m against 14.5 — lands 31 m short of the wall at z −8.6, drifts 3.69 m off the firing plane, and moves nothing. `tests/browser/model-studio-physics-playground.spec.ts:328` and `:425` fail on exactly this.

The playground's headless twin still runs at 1/240 — `solver-rate.test.ts` records that as delivery work with a stated blocker — and the browser session runs at the lane's 1/60. So the only lane that exercises this machine at the rate the owner actually watches is the browser lane, and there it is broken. Every headless scenario passes, because they all run at 240.

The release is what is rate-sensitive. The sling's two cup walls exist to "delay separation by about 190 ticks, which is what aims the throw" — a delay tuned at 240 Hz. At 60 Hz the same geometry holds the ball into a later, steeper part of the whip. Removing the cup walls at 60 Hz straightens the shot completely (lateral drift 3.69 m → 0.21 m) and lands it at z −26.2, still 6 m short; the same machine without cup walls at 240 Hz overshoots past the wall and falls out of the world. There is no single geometry that satisfies both rates, which is the point: **the two lanes have to be one world before this machine can be tuned at all.**

**Resolved 2026-08-01, the same day.** Both lanes now step at the one shared rate, and the machine works at it. The conclusion above — that no single geometry satisfies both rates — was true and was the wrong thing to be solving: the fix was not a geometry that suits two rates but a repository with one. The cup walls that "aim the throw" by delaying release were tuned in ticks; removed, the ball leaves straight. See the three entries below for what the move actually cost, and note that the 10 failing checks named here were mostly not physics at all.

Measuring what that costs: flipping `PLAYGROUND_TIMESTEP_S_V1` to 1/60 fails 10 checks across `fixtures/physics-playground`, and one of them is worse than a threshold — the counter-run that proves bearing friction is load-bearing ("without bearing friction the machine never stops swinging") **passes** at 60 Hz, so the law loses its demonstrated failure. A counter-run that stops discriminating is not a smaller problem than a scenario that fails.

## The exemption outlived the problem, and hid three lanes while it did

**Anchor:** 2026-08-01. `solver-rate.test.ts` carried one exemption and scanned one directory. Widened to the whole repository it found four lanes off the shared rate, not one: the playground twin, the chain consumer running a real Rapier world at a quarter rate, the windmill consumer at a sixteenth, and `studio-playground-panel.ts:459` printing `tick 240 Hz` to the owner while the solver ran at 60.

The exemption was written honestly. It named its lane, stated its blocker, and carried a case designed to fail when the lane was fixed. It still went wrong in three ways worth separating.

**Its stated blocker did not exist.** It said the stacking stations "rest about 0.05 m into the floor" at the coarser rate. Measured, they rest 0.00133 m into it — identical to five decimals at both rates, by Rapier's own narrow phase and by an independent geometric measure. Three attempts had been backed out trying to tune a solver against a number that was not measuring the solver. **An exemption records a diagnosis, and a diagnosis can be wrong; nothing about writing it down makes it true.** The comment had been read and trusted by every later session, this one included, for hours.

**Its scan was narrower than its rule.** It searched `tools/studio` because that is where the drift had happened before. The rule was about every solver in the repository, and a fixture directory it never looked at held a world stepping at a different rate the whole time. A gate that enforces a rule over part of the codebase reads, in every summary and every commit message, as a gate that enforces the rule.

**It could not see a rate that was not shaped like a rate.** It searched for `1 / 240`-style literals. The panel's `tick 240 Hz` display string was invisible to it, so the product told the owner the wrong number for as long as the exemption existed.

The replacement is an exact set rather than a list of allowances: anything new fails, **and the set shrinking also fails**, which is what makes it delete itself. That shape was already in the repo — the old case was written to fail when its lane was fixed — and it is the part worth keeping.

## A sampler denominated in ticks is a second variable

**Anchor:** 2026-08-01. `PLAYGROUND_SNAPSHOT_STRIDE_V1 = 8`, commented "30 Hz sampling of a 240 Hz world". At 60 Hz it became 7.5 Hz sampling, and the checks reading its frames went on reporting as though nothing had changed.

Three separate failures, all one cause, and none of them looked like sampling:

**A landing read as a resting body.** The floor check reported 0.0342 m where the true per-tick peak was 0.16427 m and the resting depth was 0.00133 m. The reported number was neither — it was whatever instant the stride happened to land on, six ticks past the deepest. Restoring the sampling density made the reported number four times *worse*, which is the proof it had been under-sampling rather than the fix making anything worse.

**A gate became arithmetically unreachable.** A touch-down comparison allowed 4% and read strided frames, so its measurable values were 0, 11.1%, 20%, 25% — nothing between 0 and 11.1%. Its own comment says the tolerance was chosen because "one sample is ~3%" over a ~260-tick fall; at the new rate the fall is ~66 ticks. The 240 Hz pass was also a 5-in-8 draw on grid phase rather than a physical result.

**A real regression was hidden.** Solver energy injection during a violent whip is five times higher at the coarser step, over its budget. The wider sampling gaps let dissipation swamp it and the check reported green. Restoring honest sampling is what surfaced it.

The general rule: **anything expressed in ticks is expressed in the rate**, and will silently mean something else the moment the rate moves. This repo had 58 authored scenario windows in ticks, a settle window, and this sampler. The one that mattered most was the sampler, because it changed what every other check could see.

## A contact fix is geometry before it is numerics

**Anchor:** 2026-08-01. On the falling station a body closes 0.1779 m in one step while Rapier's default prediction distance reaches 0.002 m ahead. Peak burial 0.16427 m; with soft continuous prediction, 0.00342 m.

Years of solver-tuning instinct says a body sinking into the floor is a convergence problem. It was not, and the tell was sitting in the data: the one station that passed at the new rate closes 0.0015 m per step, which is the only station whose closing distance fits inside the default look-ahead. Solver iterations, allowed linear error, contact natural frequency and length unit were all swept and none of them moved it, because none of them changes *when the contact is found*.

Two near-misses are worth as much as the fix:

**Contact skin is an offset wearing a fix's clothes.** At 0.005 the burial is bit-identical to no fix at all; it improves the reported number only by lifting bodies off the ground, and by 0.01 the hover is visible. A fix that improves a measurement without changing the thing measured is the shape to distrust.

**A global contact parameter is a law change every scene inherits.** A wider prediction distance fixes the drop and stops the Machine Works product ever coming to rest; a value chosen against the floor check alone drops the structures arch two metres while still passing the check that was supposed to be judging it. Scaling it per body's own voxel is worse still — that machine's larger parts are its slower ones, and the distance depends on speed. It belongs where friction and rolling resistance already live: declared by the content that needs it.

## A look toggle moves a paused live scene, and three plausible causes were not it

**Anchor:** 2026-08-01. Riverfall, solver paused, scene animation off, camera untouched: two consecutive canvas screenshots are byte-identical, and one `setLit(false)` / `setLit(true)` round trip — ending lit, exactly where it started — produces a different frame. Reproduced on Riverfall, not reproducible on the chain.

Found by accident. A motion measurement that toggled the look between reads reported that the river was perfectly still, which was not believable, and chasing why cost more than the defect is worth. Recording it so the next attempt starts past the three explanations that are already excluded.

**Not the transport.** Riverfall's kelp carries authored model motion, so with scene animation enabled two consecutive screenshots differ on their own and any comparison across a toggle is meaningless. With `setSceneAnimation(false)` the stage is stable, and the toggle still changes the frame.

**Not the camera.** At the time of this measurement, `setLit` ran the former dense-light opening clamp and could move a dense perspective view, which made it the most promising explanation. Measured: yaw, pitch, view height and centre were identical either side of the round trip. That interaction policy was removed on 2026-08-02; exact clustered-light presentation now accepts the requested camera or rolls it back without silently clamping it.

**Not the solver.** Step count and body positions are unchanged across the toggle. Whatever moves, it is the presentation.

The mechanism is visible in the code but the obvious fix did not work, which is why this is a finding rather than a repair. `SceneSession.#accept` — the path every look change takes — rebuilds the runtime snapshot from the authored scene document and hands it to `acceptSnapshot`, discarding every live pose delta accepted since. On a running scene the next frame repaints over it and nobody sees it; on a paused one the authored frame stays until the solver runs again. Making `#accept` remember the last accepted live poses and re-apply them when the live lane owns them **did not change the observed frame**, with `stageMode()` confirmed as `interact` at the moment of the toggle, so either the restore is not reached or the rebuilt delta is not what moves the tiles. That attempt is not in the tree.

Two general points worth more than the defect. A measurement that changes a setting between samples is measuring the setting as much as the subject — the toggle here was incidental to the question being asked and turned out to dominate the answer. And "the frame changed" is not "the thing I am watching changed": three separate mechanisms could each have produced this frame difference, and ruling them out one at a time is what turned an unbelievable result into a bounded finding.

## Doubling the water does not fix a river that bunches

**Anchor:** 2026-08-01. Per-cell support counted directly over 3,600 frames at 288, 576 and 1,152 particles. The worst cell is `surface-river-00-00` in every case, and its floor is zero in every case. `riverfall-live-surface.test.ts` now pins the failure at under 1,800 frames.

The entry below says the live Riverfall is blocked on surface coverage and that the cause is undiagnosed. It is diagnosed now, and it is not the particle count.

Only five of the 321 cells ever fall below the two visible particles the reconstruction requires: the river's first row, at z −31. The fluid domain's river reach starts at z −29. **That row is drawn over water that is not simulated**, so it is reconstructed entirely from whatever is downstream, and its support swings between 0 and 37 as the closed loop bunches.

Three things were measured and none of them worked:

**Raising the count.** 288 threw at frame 784 of live play. 576 survived 3,600 — but only because at unit mass 576 particles double the measured density, which blows the density-error acceptance gate twenty-fold (6.73 against 0.3). The physically correct companion change is half the mass per parcel, same water cut finer; with that, 576 throws again at frame 1,869. 1,152 with quarter mass still floors at zero, and costs about three times the frame.

**Extending the domain** upstream to z −32 so water exists under the first row is right in principle and made it worse: the same particles over a longer loop pulled three more rows to zero. The rows behind the first had a floor of exactly two — the bare minimum — so an eight percent dilution tipped them.

**More than half the loop is hidden pipe.** Sink, return and source-rise are 80 of about 153 units, so most of the water is invisible to the surface at any instant, and raising the count raises the packet size rather than closing the gaps.

What is left is the flow: water has to re-enter the river steadily rather than in slugs. That is a change to how the hidden return feeds the source, and it has to be re-validated against the causal acceptance rules that pin recycle count, fall speed and density error — which is why it is a piece of work rather than a constant.

The general shape, worth more than the specifics: **a coverage floor that a statistical fix cannot lift is a geometry or a flow problem wearing a sampling problem's clothes.** The tell was that the failing cells were always the same five, and always the ones at the edge of the simulated region.

**The flow fix, found and measured the same day.** Three changes together take the worst cell across all 321 from zero to five, which is the first time it has had margin:

**Water in the hidden return was excluded from the density solve.** `buildRiverfallFluidNeighborsV1` skipped every particle the surface cannot see, so the pipe was a conveyor rather than a body of water: each parcel was assigned the pump's speed and none pushed on any other, and whatever spacing the pond discharged with came out of the source unchanged. Letting the pipe interact is what lets it absorb a burst. This is the largest of the three.

**The source was visible for one unit of a twelve-unit rise.** Water becomes visible only in `source-emergence`, and a parcel crossed that one unit at pump speed in 0.05 s — so the head of the river was almost never occupied by visible water, whatever the count. Lengthening the visible rise to 4.5 units gives the first tile row water it can actually see.

**Then the water: 576 parcels at half mass.** On its own this does nothing (measured above); on top of the two changes it lifts the floor from one to five.

Alone, the first two take the failure from 13 seconds of play to 45.

**Corrected the same day: the second of those three is illegal, and there is no clean subset.** Lengthening the visible source was measured against coverage and never against the domain's own rules, and the rules say no — `sourceRise.end[1] + clearance` must equal the drawn river's top, because the rise passes through opaque rock, and water shown inside rock is a worse defect than the one being fixed. Every other combination was then measured, and each one moves the failure rather than removing it:

- **Pipe interaction alone, at 288 particles, is a regression:** 4 seconds, against 13 without it. Spreading the water evenly makes the river uniformly thin, where before it had dense clumps that happened to cover cells. It only pays with more water underneath it.
- **Dropping the dead first tile row** — the drawn river reaches z −32 while no water is simulated behind z −29, so the row centred at −31 is drawn over nothing — reaches 30 seconds and then fails on the next row. Whichever row is first sits at the water's edge with half its support ball outside the water, so the problem relocates rather than closing.
- **Slowing the inlet** so the head holds water starves mid-river instead: 7 seconds, failing at cell 04-07.

So there is no self-contained fix to land, and the remaining decision is not a numerical one. The package is pipe interaction plus 576 parcels at half mass plus a choice about the river's head — shorten the drawn river to where water actually starts, move the spring upstream so water enters behind the first drawn tile, or accept one fewer tile row — and every version changes what the scene looks like, which makes it the owner's call rather than a tuning step. The measurements above are what each is worth.

## The live Riverfall runs out of surface coverage before it runs out of budget

**Anchor:** 2026-07-31. Benchmarking `advance(1/60)` over roughly 3,000 frames — about 50 simulated seconds — throws from `riverfallSurfaceSignalV1`: cell `surface-river-00-00` found 1 visible particle inside the 10-unit compact support where 2 are required, nearest distance 8.095457.

Found by accident, while a profiler ran the river far longer than any test does. The recorded lane is finite and never reaches this state, so nothing in the suite covers it; the solver is provably bit-identical to before the optimisation work, so this is pre-existing rather than introduced.

It matters because a live scene has no end. Whatever the remaining budget is, a scene that throws after a minute of play is not converted. This is now the blocker for taking Riverfall off the recorded lane, in place of the frame cost that was assumed to be the blocker — and it is undiagnosed: it is not yet known whether the particle distribution drifts, recycles unevenly, or simply thins at that cell under a state the short recording never visits.

**Diagnosed 2026-08-01**, in the entry above: the cell sits upstream of the simulated domain, the loop bunches, and no particle count lifts its floor off zero.

## A rate gate can reject a working machine without becoming an output proxy

**Anchor:** 2026-08-01, corrected 2026-08-02. The selected windmill consumer proof completes nine cycles at 60 Hz while its maximum hammer-axis direction rate is 0.099983 rad/s, above the retired 0.05 rad/s ceiling. Focused candidate `r5-g2-s4-c2x1-a4-h3-q0` is the counterexample to treating the ceiling as an output classifier: it completes four cycles while staying at 0.038561 rad/s, then fails the separate full-sweep-clearance and head-anvil-penetration gates. `windmill-compact-evaluator.test.ts` pins both facts, while the committed frozen selection separately records 144 full evaluations and 16 total passers.

The old ceiling was chosen at 960 Hz and no longer described the selected machine at the shared step. That is enough to retire it; it is not enough to infer an exhaustive anti-correlation. The earlier claim that every candidate below 0.05 failed to strike is false, and the statement that 103 candidates failed on that gate alone confused a count exceeding the threshold with exclusive gate failure. The current committed selection proves 16 total passers under the current declaration, but it does not retain the per-candidate counterfactual needed to publish an old-gate-only count or range, so none is claimed here.

The number is a consecutive-step change in the shaft's world direction divided by the step. Absolute tilt does not make that rate redundant: two endpoints at opposite 0.004-radian tilts both remain inside the 0.005-radian envelope, yet crossing between them in one 60 Hz step measures 0.48 rad/s. `windmill-compact-axis-diagnostics.test.ts` pins that construction.

Planarity is measured directly by the separate absolute-tilt and out-of-plane-drift gates. The direction-rate ceiling has a narrower job: the axis may not cross its whole permitted tilt envelope inside one solver step, so it is derived as `maximumAxisTiltRadians / SOLVER_TIMESTEP_SECONDS_V1` and moves with the solver rate by construction.

The general shape, and it is not the same as "anything expressed in ticks is expressed in the rate": **a quantity denominated per second can still be a per-step quantity wearing a per-second name.** The tell is a threshold that starts rejecting the outcome it exists to protect. The evaluator declaration already carried the precedent one field away — `rawBodyOffAxisAngularSpeed` had long been excluded from acceptance because "it did not converge while pose constraints did", which is exactly what happened here to its pose-derived sibling.

## Soft CCD does nothing for a rotating contact, and the prediction distance does it all

**Anchor:** 2026-08-01. Cam-follower penetration on the windmill's promoted geometry, measured through the product's own evaluator.

Penetration is one step of the contact's own travel, and it is linear in the step: 0.00457 m at 960 Hz, 0.0105 at 480, 0.0184 at 240, 0.0493 at 120, 0.0903 at 60, against a 0.005 m gate. The cam nose sits 0.75 m from the shaft and sweeps about 7 m/s, so it closes roughly 0.12 m in a 1/60 s step while Rapier looks 0.002 m ahead by default. The contact is found once the nose is already deep inside the follower.

The lane's usual answer is per-body soft CCD — it is why `SOLVER_SOFT_CCD_PREDICTION_V1` exists, and it fixed the playground's falling stations. **Here it is inert:** 0.10, 0.25 and 0.50 m produce byte-identical runs, because Rapier drives soft CCD from a body's linear motion and this cam's centre barely moves while its nose sweeps. At 960 Hz it made penetration slightly worse, 0.00457 to 0.00509, which was enough to fail the gate on a machine that otherwise passed. Raising `maxCcdSubsteps` from 1 to 8 changed nothing at all, bit for bit, so full CCD never engages for this rotation either.

What worked is the world's contact prediction distance, sized at one step of the nose's own travel: 0.10 m takes penetration from 0.0711 to 0.00129 m — better than the 960 Hz baseline. It is non-monotone, so it is worth sweeping rather than reasoning about: 0.05 gave 0.00452 and 0.25 gave 0.00606. The contact natural frequency also went back to Rapier's 30 Hz default from the 45 Hz the old search chose, and that one is a measurement, not a stability argument — see the correction below.

The reusable part: **a fast rotating part is not a fast moving body, and the lever that catches one does not catch the other.** Check which motion the solver's own mechanism is reading before reaching for it.

**Corrected the same day, by reading the engine instead of inferring it.** Two claims above were written from measurement alone and one of them was wrong. Rapier's narrow phase computes the soft-CCD prediction from `rb.linvel()` only, clamped to `soft_ccd_prediction / dt` (`src/geometry/narrow_phase.rs`), which is exactly why a cam whose body origin sits on the shaft is unaffected at any value — the inference was right and is now sourced. But the first draft also said a 45 Hz contact natural frequency "cannot be represented by a 1/60 s step at all". It can. Rapier's contact softness is `erp = dt*w / (dt*w + 2*zeta)` with a default damping ratio of 5 (`src/dynamics/integration_parameters.rs`), which saturates smoothly and has no step-size limit: at 1/60 s, 45 Hz gives erp 0.32 against 30 Hz's 0.24. Stiffer, not unstable. **A measurement tells you what happened; only the source tells you why, and a plausible mechanism invented to explain a real measurement is still an invention.** The owner's standing direction, given the same day: research the readily available resources before building or explaining physics behaviour yourself.

## Freeze the declaration before the search, not after

**Anchor:** 2026-08-01. The windmill's 144-candidate search was run three times at 60 Hz for one result. Nine minutes each.

The second run was thrown away because the evaluator declaration changed after it: one string in `ablationExpectations` was reworded, and that string is inside `WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1`, which is hashed into `evaluatorDeclarationSha256`, which is hashed into every candidate's `combinedEvaluationSha256`. The physics was identical and every measured number matched to the last decimal; only the hashes moved, and the whole evidence chain had to be regenerated anyway.

Anything a search's evidence binds is frozen from the moment the search starts. For this fixture that is the evaluator declaration, the numerical profile, and the geometry generator — comments and docstrings are safe, and every declared value, including prose fields inside declaration objects, is not.

## A whole consumer fixture sat outside the typecheck, and nothing said so

**Anchor:** 2026-08-01. `tsconfig.json` listed `fixtures/machine-works-consumer`, `fixtures/physics-playground` and `fixtures/riverfall-consumer`, and not `fixtures/windmill-consumer`. Adding it surfaced nine errors, six of them in one function that had never been checked.

They were found by accident: a browser proof needed one constant from `windmill-compact-recorder.ts`, and that import pulled the module into the graph for the first time. The six were all the same defect — TypeScript does not reset a captured `let`'s narrowing for assignments made inside a nested function, so `let profile = null` assigned only inside an observer callback stays `null`, the guard after the run narrows to `never`, and every later read is an error. Reading the fields off a holder object and destructuring them after the guard narrows the way it reads.

`npm run lint` did cover the directory, so the gap was specific and quiet. The fix is one line of tsconfig; the lesson is that an include list is a claim about coverage that nothing checks.

## A presentation rule that held by luck reads as a rule until the numbers change

**Anchor:** 2026-08-01, corrected after live numerical-profile alignment on 2026-08-02. The committed windmill fixture records nine anvil impacts in twelve seconds, while the aligned live product path's first six post-lift rising edges are ticks 110, 244, 382, 520, 658, and 796 at 60 Hz. `windmill-live-run.test.ts` pins the live sequence and the occupancy comparison.

The live lane had already exposed the finite-magazine rule by capping flour at one rise per sack; an uncapped level climbed out through the roof. The recorded lane initially demanded exactly five impacts for five sacks, so it kept a rule that was only a coincidence of its former cadence.

A second rule was latent in the same place and neither lane had it. A sack occupies the milling spot for exactly `WINDMILL_SACK_SPOT_SECONDS_V1`, currently 1.270833 seconds, while the committed fixture's impact gaps are only 0.867 to 1.000 seconds, so answering every fixture blow slid sacks through each other. The shared filter answers blows in order, skips any that land before the spot is free, and stops at the magazine's capacity. The aligned live gaps are 2.233 to 2.300 seconds, so the same rule answers every landed live blow until all five sacks are spent; “roughly every second blow” describes the fixture cadence, not the live scene.

Worth separating from the physics: none of this was a solver problem, and all of it was found by a clearance test measuring authored tracks against each other at every frame. **A presentation keyed to a measured event inherits that event's cadence, and a cadence is not a constant.**
