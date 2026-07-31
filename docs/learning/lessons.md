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
