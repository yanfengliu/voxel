# Clear the five vite advisories that block verify

Status: active
Owner: a Claude Code session that the fleet's slim-core coordinator started on 2026-11-06 and that took the branch over; before that vitebump (worker of the met coordinator)
Created: 2026-10-31
Updated: 2026-11-06

## Problem and outcome

`npm run verify` fails on origin/main 7a93bae at `test:supply-chain` with "full audit reports blocking findings: vite (high)". The tree did not change: five advisories published on 2026-10-20 and 2026-10-21 cover `vite` 8.0.0 to 8.1.5, and voxel pins `vite` exactly at 8.1.4. They are GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm (high), GHSA-9jrq-w75r-8gcw and GHSA-rq7h-c2jc-7f22. Every voxel commit's gate is blocked until this is fixed.

The outcome: `vite` pinned exactly at the lowest release above 8.1.4 that clears all five, both audits free of high and critical findings, and `npm run verify` green.

On 2026-11-06 the branch was still unmerged, and the task grew to CI. CI on main had failed on every push since at least 2026-10-29, for three reasons across four failed jobs in run 41963047196 (2026-11-05). The vite audit failed `Audit and package` and stopped the Windows `Node 24 complete` leg inside `npm run verify`. GitHub moved `ubuntu-latest` to Ubuntu 26.04, where Playwright 1.59.1 refuses to install Chromium's system libraries, so the Linux `Node 24 complete` leg failed before running anything. The Windows `Node 22 portable` job was cancelled at its 15-minute cap during unit tests. Behind those, the browser suite has its own CI failures, recorded in `docs/learning/defect-register.md`: two Linux HUD pixel baselines, three Windows per-test timeouts, a Linux budget-headroom report, and a Windows leg that does not fit its one-hour cap. That last is a slowness defect, and raising the cap does not close it: the Windows leg ran 116 browser tests in 15.7 minutes on 2026-08-28 (run 33205964399) and reached 118 in 42.3 minutes on 2026-10-18. The outcome now also includes CI on main green on every job.

## Scope

In scope: the `vite` pin in `package.json`, its `package-lock.json` entry, the `vite` row and an audit note in [the supply-chain record](../../architecture/supply-chain.md), this work unit and a devlog line. The two consumers that link voxel by `file:../voxel`, aoe2 and city, are checked read-only: a detached worktree of each from origin/main, linked to this voxel, runs its build and unit tests, and nothing is committed there.

Out of scope: the 13 moderate full-audit findings, which do not block (GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8 against `@vitest/mocker`, GHSA-g3hv-75wg-m249 against `minimatch`); the consumers' own `vite` pins (aoe2 `^6.4.3`, city `^8.1.2`), which are named in the outcome and not changed; `vite` 8.2 and 8.3.

Added on 2026-11-06: `.github/workflows/ci.yml` (the Ubuntu runner of `Node 24 complete`, the time caps of `Node 24 complete` and `Node 22 portable`, and a `workflow_dispatch` trigger), the browser suite's CI failures, and one wording change in `tests/testing/lessons-pairing.test.ts`, which lands in its own commit: the fleet canon's R8 now adds a rule to `docs/policies/local-rules.md` only when the owner asks, and civ-engine, lego and investing made the same edit that day. `.github/workflows/oak-font-diagnostic.yml` moves to the same `ubuntu-24.04`, with the runner list that `tests/testing/oak-font-diagnostics.test.ts` pins: it ran the same failing install on `ubuntu-latest`, and fonts come with the image, so only that leg's image explains that leg's pixels. The primary checkout's uncommitted allocations (this unit's template plan and unit 6, `fleet-lessons-route`) belong to other participants and are left alone.

## Approach

Each advisory's GitHub record lists 8.1.6 as the first patched release for the range `>= 8.0.0, <= 8.1.5`. The later lines are patched in 8.2.4 and 8.3.3. So 8.1.6 is the lowest release above 8.1.4 that clears all five, and it is a patch release on the line voxel already uses. The older lines' fixes, 6.4.4 and 7.3.7, would be downgrades. `npm audit fix --force` would install 8.3.5, the newest release, which is two minor versions past what the fix needs. Staying on 8.1 has a cost: if Vite stops patching 8.1, a later advisory will need a minor-version jump. This change does not check Vite's support window.

`vite` 8.1.6 was published on 2026-10-06. `npm audit signatures` verifies its registry signature and its provenance attestation, which names the `vitejs/vite` tag `v8.1.6` (commit `dade886f0cc17fedf777eff804593d2af182abd4`) and the workflow `.github/workflows/publish.yml`. The attestation's digest equals the lockfile's integrity. 8.1.6 asks for `postcss` `^8.5.17` and `rolldown` `~1.1.5` instead of `^8.5.16` and `~1.1.4`. The lockfile already holds `postcss` 8.5.23 and `rolldown` 1.1.5, so only the `vite` entry changes. Its Node range, `^20.19.0 || >=22.12.0`, is the same as 8.1.4's.

voxel's `build` script is `tsc -p tsconfig.build.json`, and voxel has no runtime dependencies. `vite` runs as voxel's development server (Studio, the oak fixture, the servers the browser specs start), inside `vitest`, and as the bundler that `scripts/verify-mesh-worker-package.mjs` runs during `verify` to build a browser consumer of the packed worker. The consumers bundle voxel's `dist` with their own `vite`.

CI, 2026-11-06. `Node 24 complete` is pinned to `ubuntu-24.04`, the OS its Linux leg last ran the browser suite on, rather than moving Playwright: a new Playwright brings a new Chromium, which can move every pixel baseline at once. `Node 22 portable`'s new cap is set from measurements: its Windows unit tests took 531 to 729 s in passing runs and had not finished after 825 s when the 15-minute cap cancelled them, and 30 minutes is twice the slowest complete job, 14m50s. `Node 24 complete`'s 90 minutes is not a measurement. No Windows leg has finished the suite since run 35164009617 (2026-09-16), and at the rate of its first 118 tests the 2026-10-18 run would have needed about 66 minutes, so 90 is room to measure a complete Windows run in, and the cap is set from that run afterwards. A higher cap gives something up. The 15-minute cap is what first showed the unit tests' cost, and [work unit 1](../1_portable-ci-budget/plan.md) cut that cost rather than raise the cap, and asked for a reviewed justification before any cap change; this record and review round 1 are that justification. No test budget or assertion changes, and the Windows leg's slowness stays open as a defect. `workflow_dispatch` lets a branch run CI, because this machine has no Linux and the next repairs are judged on Linux.

## Acceptance criteria

- `package.json` pins `vite` exactly at 8.1.6. The lockfile diff changes only the `vite` entry and the root's `vite` line (git diff).
- `npm ci` from the new lockfile installs `vite` 8.1.6, deduped under `vitest` (`npm ls vite`).
- `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high` both exit 0, with no high or critical finding, and `npm run test:supply-chain` passes.
- `npm run verify` passes in this worktree.
- aoe2 and city, each from origin/main and linked to this voxel, pass their build and unit tests, and commit nothing.
- One review round with both lanes of the fleet runbook, its blocking and should-fix findings resolved.
- The change lands on main as its own commit, a fast-forward push, and remote CI is followed to completion.
- Added 2026-11-06: `npm run verify` passes in full on the merged tree; a second review round covers the integration and the CI changes; the lessons wording lands in its own commit; and every job of CI on main passes.

## Implementation steps

- Reproduce the failing gate and record both audits before the bump.
- Read each advisory's patched range and pick the lowest release that clears all five.
- Bump with `npm install --save-exact vite@8.1.6`, reinstall with `npm ci`, rerun both audits and `npm run verify`.
- Check aoe2 and city from origin/main, linked to this voxel, read-only.
- Run one review round with both lanes and resolve its findings.
- Merge origin/main, rerun `npm run verify`, push as a fast-forward, follow CI, fast-forward the primary checkout only if it is clean on main, and remove the worktrees and the branch.
- 2026-11-06: fix the runner and the caps in `ci.yml`, add `workflow_dispatch`, rerun `npm run verify`, run review round 1, land the lessons wording, push to main and read every job of the run.
- Then repair what that run shows of the browser suite's own failures, trying Linux-only changes on a branch first, within the canon's five-attempt limit.
- Set `Node 24 complete`'s cap from the first complete Windows run, and keep the Windows leg's slowness open until it is fixed or the owner decides otherwise.

## Outcome

2026-10-31: implemented and verified locally. The verify below ran before round 0's record was written, and that record then failed `npm test`; see 2026-11-06.

- `vite` is pinned at 8.1.6 in `package.json`. The lockfile changed only the `vite` entry and the root pin.
- Audits on 2026-10-31: the runtime audit had 0 findings before and after. The full audit had 14 findings before (13 moderate, 1 high) and 13 moderate after, exiting 0 at `--audit-level=high`. `npm audit signatures` verified 145 registry signatures and 49 attestations, and vite 8.1.6's provenance digest equals the lockfile's integrity.
- `npm run verify` passed on the reviewed package bytes in 23 min 13 s: every stage, 2,434 unit tests (1 skipped) and 136 of 136 browser tests.
- Consumers, read-only: a detached worktree of each from origin/main, with `node_modules/voxel` linked to this worktree. aoe2 at 87623a72 (`vite` 6.4.3, `vitest` 3.2.6): `npm run build` passed (voxel's `dist` up to date, 896 modules bundled), and `npm test` passed 649 files and 5,010 tests (3 skipped). city at 6805c1e (`vite` 8.1.2, `vitest` 4.1.9): `npm run build` passed (317 modules, worker budget 162,626 of 166,000 bytes), and `npm test` passed 132 files and 881 tests. Neither tree changed. `npm ci` in each consumer ran voxel's `prepare`, which rebuilt this worktree's `dist`.
- The consumers' own exposure is left to them: aoe2's locked `vite` 6.4.3 (patched in 6.4.4) and city's 8.1.2 (patched in 8.1.6) are in the same five advisories' ranges.
- Review: [round 0](reviews/0_implementation.md). Both lanes kept: Codex answered SHIP and Claude FIX-THEN-SHIP, and every finding has a disposition there. F9, a pre-existing sentence about Rapier in the supply-chain record, is left open.
- The next release entry in `CHANGELOG.md` should record this bump, as the 1.1.0 and 1.3.0 entries recorded earlier dev-only advisory fixes.

2026-11-06, after taking the branch over:

- The worktree was clean and nothing in it had changed since 2026-10-31 00:06, so the branch was carried forward rather than redone. origin/main (`0263e10`) merged without conflict; main had changed only docs.
- `3c30315` as committed fails `npm test`: `tests/testing/repo-wide-gate-coverage.test.ts` rejected line 63 of round 0's record, which cited a line of AGENTS.md by number. That record was written after the verify above ran. Round 0's record now quotes the rule instead and says so.
- Audits on 2026-11-06 after `npm ci`: runtime 0 findings; full audit 12 moderate, no high or critical, exit 0 at `--audit-level=high`. `npm run test:supply-chain:self` and `npm run test:supply-chain` passed.
- `npm run verify` on the merged tree with the record fix and the CI changes (`ed3dd93`, before review round 1): exit 0 in 23 min 53 s, every stage, 2,434 unit tests (1 skipped) and 136 of 136 browser tests, the slowest at 34% of its budget.
- [Review round 1](reviews/1_integration.md): both lanes kept, both FIX-THEN-SHIP. Its fixes, the lessons wording and the final verify are recorded there.
- Pushed to main as `cf1cb28`, a fast-forward from `0263e10`; CI run 42296582066 followed it. The primary checkout's local `main` was not moved: its uncommitted registry and untracked template plan for this unit, another participant's, would be overwritten.
- The first browser-suite repair, the Linux HUD font, is on branch `hud-font` and recorded in [the defect register](../../learning/defect-register.md). The HUD draws a bundled Source Sans 3 with grayscale, unhinted text. On Windows the full browser suite then failed exactly the two HUD tests, with every changed pixel inside the panel, and the five HUD baselines were regenerated, inspected at native resolution and reproduced on a rerun. Its gate, `tests/browser/oak-ecosystem-font.spec.ts`, went red with "Segoe UI" restored. On Linux, CI run 42300848349 of the branch passed all 137 browser tests, the five HUD baselines among them, where main's run 42296582066 of the same day had failed the two HUD tests by the usual 16,303 and 16,105 pixels.
