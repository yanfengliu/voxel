# Lessons

Findings that cost real time to learn and cannot be re-derived by reading the code.

Every entry carries an anchor — a measurement, a commit, a test id, or a behavior delta. AGENTS.md is explicit that an unanchored lesson is folklore, so an entry without one does not belong here. Entries are appended; a superseded entry is corrected in place with its correction dated, never silently deleted.

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

**Anchor:** 2026-07-31. `AGENTS.md:68` now lists `docs/learning/lessons.md` in the session-start reading; before that, `AGENTS.md:28` mentioned the file only to govern its format.

This file existed, had a rule about how to write entries, and was never once instructed to be read. `CLAUDE.md` is `@AGENTS.md`, so AGENTS.md reaches every agent automatically and this file reached none of them.

The consequence for where things go: a rule that must be followed belongs in AGENTS.md, which is loaded; the evidence behind it belongs here, which is now read at session start. Writing a hard-won lesson only here was, until today, the same as deleting it.

## A timeout sized against the suite's current load is a time bomb

**Anchor:** 2026-07-31. `tools/studio/lighting-1000-showcase.test.ts` and `tests/testing/mesher-benchmark-harness.test.ts` both timed out under a full `npm run test` and passed alone — the lighting test at 756 ms and 8.8 s respectively in isolation.

The lighting test already carried a comment explaining that 20 s was chosen to "leave room for parallel-suite load" after an earlier timeout. It expired anyway, because the live-physics scenes then added their own multi-second Rapier runs and ate the margin.

Any margin picked against what else happens to be running is consumed by the next heavy test anyone adds, and each expiry presents as a real failure until someone reruns and sees green. That teaches rerunning-until-green, which is how a suite stops being a gate. Size a timeout against the work the test itself does, generously, and let the machine be slow.

## Test the obvious suspect before recording it as unexplored

**Anchor:** 2026-07-31. Rapier's `lengthUnit` at 0.25, 0.5, 1 and 2, against the playground's 60 Hz floor-penetration failure. None changed it.

`lengthUnit` is the reference scale Rapier expresses penetration tolerances against, and the playground runs 0.25 m voxels while never setting it — a textbook explanation for bodies resting too deep, and one the windmill fixture already sets explicitly. It was worth an hour of certainty that the earlier tuning sweep had been scaling values against the wrong unit.

It was not the cause. Recording that is worth as much as a fix, because the next person will have the same idea, and "already tried, no effect" is what stops a good hypothesis being tested three times.

Also worth naming: the second failure that appears at 60 Hz reads as a determinism break, and is not one. The determinism case re-runs the scenario and asserts it does not fail, so it simply reports the penetration failure a second time. A failing check that shows up twice under two names invites a much larger investigation than it deserves.

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

## The trebuchet works at 240 Hz and does not work at 60 Hz, and only the browser runs it at 60

**Anchor:** 2026-08-01. The same machine, through the same live path, with only `LIVE_TIMESTEP_SECONDS_V1` changed: at 240 Hz the ball flies to the wall and moves 12 of 33 bricks, the farthest by 6.32 m; at 60 Hz it goes almost straight up — apex 16.9 m against 14.5 — lands 31 m short of the wall at z −8.6, drifts 3.69 m off the firing plane, and moves nothing. `tests/browser/model-studio-physics-playground.spec.ts:328` and `:425` fail on exactly this.

The playground's headless twin still runs at 1/240 — `solver-rate.test.ts` records that as delivery work with a stated blocker — and the browser session runs at the lane's 1/60. So the only lane that exercises this machine at the rate the owner actually watches is the browser lane, and there it is broken. Every headless scenario passes, because they all run at 240.

The release is what is rate-sensitive. The sling's two cup walls exist to "delay separation by about 190 ticks, which is what aims the throw" — a delay tuned at 240 Hz. At 60 Hz the same geometry holds the ball into a later, steeper part of the whip. Removing the cup walls at 60 Hz straightens the shot completely (lateral drift 3.69 m → 0.21 m) and lands it at z −26.2, still 6 m short; the same machine without cup walls at 240 Hz overshoots past the wall and falls out of the world. There is no single geometry that satisfies both rates, which is the point: **the two lanes have to be one world before this machine can be tuned at all.**

Measuring what that costs: flipping `PLAYGROUND_TIMESTEP_S_V1` to 1/60 fails 10 checks across `fixtures/physics-playground`, and one of them is worse than a threshold — the counter-run that proves bearing friction is load-bearing ("without bearing friction the machine never stops swinging") **passes** at 60 Hz, so the law loses its demonstrated failure. A counter-run that stops discriminating is not a smaller problem than a scenario that fails.

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
