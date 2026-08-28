# Defect register

Every defect the owner reported, with the symptom as they saw it, what the investigation found, the root cause, and the check that covers it from now on.

Unlike a lesson, an entry stays after it becomes a gate. This is the standing list of what the gates could not see, which is where the next defect comes from — so it is read for its pattern, not only for its instances.

Newest first.

## 2026-08-28 — `main` had not seen a green CI run in five weeks

**Symptom, as reported.** "Fix github CI", followed by: "You need to proactively monitor these things instead of hearing about it from me."

**What the investigation found.** The last successful CI run on `main` was on **2026-07-24**. Every push since — **131 runs, 100 failures and 31 cancelled, no successes** — was red.

The streak is not one defect. It spans a workflow matrix change (the jobs were `Node 22 complete` in early August and are `Node 24 complete` now) and at least one unrelated cause: 2026-08-08 also failed `npm audit`. What was diagnosed here is the state of the streak's most recent five runs, 2026-08-18 through 2026-08-28, which fail identically. The earlier failures were not investigated individually and should not be assumed to share this cause.

In those five runs, the four newest failed in every job on one TypeScript error, and behind it sat a browser suite failing in the `Node 24 complete` job on both Linux and Windows — the only job that runs `npm run verify` end to end.

Five separate defects, not one:

1. `playground-joint-overlay.test.ts:86` handed a `LiveBodySnapshotV1` to `playgroundPrismaticCoordinateV1`, which declared `PlaygroundBodySnapshotV1`. The function reads only translation and rotation, and its own file comment says its checks "hold identically over either lane's frames" — the type said otherwise. Landed in `39a4d75` and never typechecked locally before the push.
2. `model-studio-chain.spec.ts` settled the live world to an absolute tick 30 without pausing it first. A live scene free-runs on the wall clock from the moment its solver is ready, so the tick it has reached when the test arrives is a measure of how slow the machine is. CI arrived at 54. Machine Works and the windmill already open with `setSceneAnimation(false)`, which builds the world paused; the chain never adopted it.
3. `model-studio-lighting-preference.spec.ts:280` asserted that the scene clock advanced under 200 ms across a resume. What it actually measured was its own round trip to the page. CI measured 541.9 ms on a player that was behaving correctly, and the invariant it was reaching for — that resuming does not credit the pause — is already proved exactly against an injected clock in `player.test.ts`.
4. `model-studio-machine-works.spec.ts:612` exceeded the 60-second test budget. The 71.3 s (Windows) and 68.5 s (Linux) in the logs are not its cost — the test was killed at sixty and those include unwinding and writing a failure trace. Measured alone on the workstation it is **53.0 s**, so it had been running at 88% of its budget locally all along. It now declares `test.setTimeout(180_000)` at its own site, the same budget `windmill-assets:279` already took for the same reason.
5. `model-studio-riverfall.spec.ts:445` could not capture a screenshot inside Playwright's unstated 5-second assertion default. Review proposed a better-sounding cause — that the canvas never goes still, because `settleTo` pauses the solver and not the scene transport — and it was tested and disproved: stopping the transport moves 3,786 pixels, because the studio then stops applying the live presentation's poses and all 96 foam flecks snap back from the plunge pool to their authored lattice. The river's foam is placed by the running frame loop. The canvas is otherwise static after a settle, and the failure was slowness.

**Root cause.** Two, and only the first is about tests.

The gate that ran before each of these pushes was not the gate that runs on CI. Locally the browser suite passes because the machine is several times faster than a shared runner rasterising in software; nothing on the author's machine can exercise the slow half of the matrix. That made every one of these a defect only CI could see, on a lane nobody was reading.

Underneath that, the browser lane had no timeout discipline. `tests/testing/test-timeout.ts` derives every vitest budget from measured work — a rule this repo bought on 2026-08-07 after fifteen tests expired on a documentation-only diff — and `test-timeout.test.ts` scans for any test that opts itself below the allowance. That scan deliberately skips `tests/browser/**`, on the stated grounds that Playwright specs have "their own gate and their own timeout config". They had neither: a flat 60,000 ms that no measurement stood behind, and Playwright's 5,000 ms assertion default, which is precisely the unstated-default-below-the-allowance shape the 2026-08-07 entry describes.

**How it is checked from now on.**

- `tests/testing/browser-timeout-headroom.ts` is a Playwright reporter that fails a *passing* run when any test has spent more than 75% of its budget, and prints the five closest to the edge on every run.

  This is the class check rather than the instance check, and measuring it settled where the defect actually lived. `machine-works:612` takes **53.0 s on the workstation, of the 60 s the lane gave every test** — 88%, on the author's own machine, with nothing counting. It was never a fast test a slow runner broke; it was a test with seven seconds of room, and any host slower than this one was going to spend them. Had this reporter existed, the local run before the first red push would have said so. That is the point: the margin is visible where the failure is not.
  The reporter was confirmed to bite before it was trusted: with its threshold neutralized to 0.0001, a run reporting "2 passed" exited 1.
- Budgets are sized for the test they guard, not for the suite's heaviest member. The default is **119,900 ms** — the slowest test that actually uses it (`riverfall:247`, 19.9 s measured alone here), plus `test-timeout.ts`'s 45-second allowance for a machine that is not the author's, plus a 55-second margin for what a slow host does to the work on top of that, from the 1.2x/1.4x/2.4x stretches measured between this workstation and GitHub's Linux runner. The two heavy tests carry their own: `windmill-assets:279` already declared `test.setTimeout(180_000)`, and `machine-works:612` now does, with its 53.0 s recorded beside it. A default stretched to fit the heaviest member is a budget for nothing else, and the margin gate can then say nothing true about any of them.

  There is deliberately no `process.env.CI` branch anywhere: a budget only CI executes is another instance of the defect itself. The assertion budget went to 20,000 ms and is the one term still not derived from a measurement, which the site says.
- The `Node 24 complete` job's own `timeout-minutes` went from 30 to 60. Its Windows leg finished in 29m28s while *abandoning* four tests early; a green run does strictly more work than a red one, so that budget was already the next failure.
- The fleet canon now says a push is finished when the remote gate says so, not when the remote accepts it, and that a red remote gate is the next task ahead of whatever was planned.

**What this register should be read for.** All five defects were invisible to a green local run, and the two that were not timeouts were assertions about wall-clock latency written on a fast machine. A gate that only its author's hardware can satisfy is not a gate, and this repo had one lane where that was true for five weeks without anyone noticing.
