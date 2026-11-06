# Review 1: integration

## Target

Repository voxel, base `origin/main` at `0263e10e01bbe36bfc4e08852567b23a985d9953`, target branch `vite-bump` at `ed3dd93fa5dc68aed54b67c16dd27e32109f66c2` plus one uncommitted change, the wording edit to `tests/testing/lessons-pairing.test.ts`. The reviewers read the working tree's `git diff 0263e10` appended to their prompt (65,319-byte prompt, SHA-256 `8c3d3b253bb921d78281b77789681f7bb90cafaece8d3be3e334aaa30a0542f8`). The uncommitted part was `git diff HEAD` of 1,159 bytes, SHA-256 `a1f779dd7a4c5848d6034b48edbf9ffc126af31ff7c0f1c227548fa384fa0fcb`, and it was committed unchanged as the lessons commit on this branch.

What the target holds: the `vite` 8.1.6 bump of `3c30315` (round 0), the merge of origin/main, `a29b266` (round 0's record quotes the rule instead of an AGENTS.md line number), `ed3dd93` (`ci.yml`: `Node 24 complete` on `ubuntu-24.04`, caps 60 → 90 and 15 → 30 minutes, `workflow_dispatch`; this unit's plan and the devlog line) and the lessons wording.

The fixes made after this round, listed under "Findings and disposition", were not reviewed.

## Reviewers and coverage

Both lanes ran from the ignored run folder `fleet/tmp/review-runs/voxel-5-r1-integration`, with the reviewed tree as their working folder, on the runbook's prompt: the change, the owner's evidence, seven questions and the diff. The prompt asked for no npm, tests, builds or network, and no delegation without reason. Nothing in the tree changed while either lane ran: the first file written after the review, `.github/workflows/ci.yml`, is dated 20:51:53Z, after both had finished. The after-run `git status` and `git diff HEAD` were not taken before those edits, so that check rests on file times and on each lane's own tool calls, read below.

- Codex CLI 0.163.0, `gpt-6-astra`, `model_reasoning_effort=xhigh`, `--sandbox read-only --ephemeral`, 2026-11-06 20:36:40 to 20:39:42Z. A smoke test before it read a file from the tree. The runbook's check printed `keep` (0 failed commands). Its log shows 15 read-only shell commands over the instructions, the policies, both workflows, `docs/learning/defect-register.md`, `docs/work/1_portable-ci-budget/`, the plan and `scripts/verify-oak-font-diagnostic.mjs`; it never opened the run folder. Spot-checked citations outside the diff: `docs/policies/gates.md:7` (budgets sized from a measurement) and `tests/testing/browser-timeout-headroom.ts:159` (the margin filter) hold. It did not delegate.
- Claude Code 2.1.308, `claude-opus-5-5[1m]`, `--effort max`, tools `Read,Glob,Grep,Task,Bash`, `--permission-mode dontAsk`, no settings, no MCP servers, 2026-11-06 20:36:40 to 20:50:12Z. The login check before it named the pin with no tools or MCP servers. The `system/init` event named the pin, those five tools, `dontAsk` and no MCP servers. The report command printed `keep success claude-opus-5-5[1m]`, and stderr was empty. It made 49 tool calls, all reads (19 Read, 21 Grep, 9 Bash: `git log`, `git show`, `git diff` and `ls`), and the permission rules refused 1 Bash call. None touched the run folder. It did not delegate.

## Reports

### Codex (gpt-6-astra, xhigh)

FIX-THEN-SHIP

F1 [should-fix] `.github/workflows/oak-font-diagnostic.yml:20` — The dedicated diagnostic retains the same unsupported runner/install combination: `ubuntu-latest` here and `--with-deps` at line 41. Given the supplied CI failure, its Linux leg will stop before collecting the font evidence needed for the next repair. The literal assertion in `tests/testing/oak-font-diagnostics.test.ts:204` is not a reason to preserve a broken environment: update the workflow and its expected runner together, retaining the SHA, permissions and diagnostic checks. This is a known same-cause omission, not a regression introduced by the Vite bump.

F2 [should-fix] `docs/work/5_vite-advisories/plan.md:58` — “Implemented and verified locally” overstates the recorded integration evidence. The full pass at line 62 predates the review-record failure; the November 6 outcome ends at line 72 with audits and supply-chain checks, without the rerun result that the prompt says is recorded there. Label the earlier pass by date/revision and mark merged-tree verification pending until its actual result is available. Likewise, line 22 says the lessons wording “landed in its own commit,” but it is currently the sole uncommitted change.

F3 [nit] `docs/work/5_vite-advisories/plan.md:32` — “The two caps are raised to measured bounds” blurs observation and allowance. The workflow correctly describes 90 minutes as a provisional ceiling for obtaining a complete measurement. Use that qualification here and in `docs/devlog/summary.md:3`. Raising a job cap also reduces sensitivity to aggregate runtime regressions; “a cap is not a test” does not eliminate that tradeoff.

**Verified myself**

- Read the live instructions, policies, relevant tests and workflows. HEAD is `ed3dd93fa5dc68aed54b67c16dd27e32109f66c2`; the only uncommitted change is the supplied lessons wording. The integration history matches the prompt. `git diff --check` passed.
- Both package files are unchanged from `3c30315`. The exact Vite pin remains 8.1.6, and the lockfile changes remain confined to its root pin and Vite entry. Installed Vite metadata also says 8.1.6. I did not reopen the upstream version-choice review.
- Pinning only the complete job within `ci.yml` is appropriate: the other jobs install no browser. Searches found no executable dependency on the old complete-job display name or Linux artifact name. The Oak diagnostic is a separate outstanding case, as F1 explains.
- The caps preserve every test assertion, per-test timeout, retry setting and headroom check. Outside the diff, `docs/policies/gates.md:7` specifies measured browser budgets, and `tests/testing/browser-timeout-headroom.ts:159` still identifies excessive budget consumption. The supplied figures support additional job allowance: 825/531 is approximately 1.554; twice 14m50s is 29m40s, reasonably rounded to 30 minutes. Ninety minutes remains provisional. Neither increase repairs the underlying slowness.
- `workflow_dispatch` adds no inputs, secret references or broader token permissions. Concurrency remains scoped by workflow and ref; a manual run can replace another run on that same ref. Artifact paths remain fixed, with distinct matrix names and seven-day retention. I found no new security or artifact-collision problem.
- Comparing the retained report against `3c30315` shows only the announced explanatory paragraph and F4 citation replacement. The quoted fragment matches R24 at `7a93bae`; the finding and its reason survive. This satisfies the preservation requirement in `fleet/docs/skills/multi-cli-review.md:118`.
- The lessons edit changes only a comment and diagnostic text. Its filtering and assertion are unchanged. The owner-controlled route matches current R8 and `docs/learning/lessons.md:5`.
- I modified nothing and ran no npm, Node, tests, builds, installs or network requests. No delegation or browser processes were used.

**Taken from the owner's evidence**

- Hosted runner images, installation failures, job durations, cancellations and absence of branch protection.
- Advisory ranges, provenance, clean-install/deduplication results, audit counts, supply-chain passes and historical verification/consumer results.
- The known Linux baseline/headroom and Windows timeout failures remain unresolved. I have not independently verified a successful full run on this integrated target or any repaired remote CI run.

### Claude (claude-opus-5-5[1m], effort max)

FIX-THEN-SHIP

**Findings**

F1 [should-fix] `.github/workflows/ci.yml:36` - "So no complete Windows run has been measured yet" is false. The repo records complete Windows legs: run 33205964399, 116 passed in 15.7 min (`docs/learning/defect-register.md:383`), and run 35164009617, all 135 tests in 39.1 min (`defect-register.md:52`). Say "none since run 35164009617". The 2026-10-18 partial run also gives a bound. It reached 118 of 136 tests in 42.3 min, after about 17.7 min of earlier stages. If the last 18 tests cost the same, the job needs about 66 min (my arithmetic).

F2 [should-fix] `ci.yml:92-93` - The upload step's comment still says "`timeout-minutes: 60` above is itself a budget sized from a measurement". The cap is now 90, and its own comment says 90 is not measured.

F3 [should-fix] `docs/devlog/summary.md:3`, `docs/work/5_vite-advisories/plan.md:32` - "two CI time caps are sized from measurements" and "raised to measured bounds" contradict `ci.yml:36-37`. Only the 30 is measured. The subject line of `ed3dd93` says the same. `docs/policies/rules/docs.md:9` asks prose to claim only what its evidence shows.

F4 [should-fix] `ci.yml:121-128`, `plan.md:14,32` - Raising the caps is defensible: the 18 tests that never ran can't be judged any other way, and no test budget changes. But the record leaves out what the raise gives up. The 15-minute cap is what found the leaf-oracle cost (`defect-register.md:41-47`). Work unit 1 then chose to cut that cost: "No ... raised timeout is selected". It also asked for "a separate concrete reviewed justification" before any cap change (`docs/work/1_portable-ci-budget/plan.md:14,18`). The Windows browser leg went from 15.7 min for 116 tests (2026-08-28) to 42.3 min for 118 tests reached (2026-10-18). R22 calls that kind of slowness "a defect to fix". `playwright.config.ts:30-36` explains why widening the only timeout that watches duration gives something up. The browser lane answers that with a margin reporter; job caps have none. Fixes:
- Cite work unit 1.
- Keep "a Windows leg that does not fit its one-hour cap" (`plan.md:14`) open as a slowness defect, so the higher cap does not quietly close it.
- Add "set the 90 from the first complete Windows run" to the plan's steps. Today it lives only in a comment.

F5 [should-fix] `plan.md:22` - `oak-font-diagnostic.yml:20,41` now fails at its Linux install step as well. It is the repo's tool for the Linux HUD font question (`docs/work/1_portable-ci-budget/design.md:19-25`). Deferring it is fine if the plan says two things: that it is broken, and that once fixed it must run on the same image as `Node 24 complete`. Fonts come with the image, so a result from 26.04 cannot explain the pixels on the 24.04 leg. The test pin (`tests/testing/oak-font-diagnostics.test.ts:204`) just means changing two lines together. The real cost of doing it now is one more verify.

F6 [should-fix] `plan.md:58,68-72` - "Implemented and verified locally" now heads the 2026-11-06 work too, but no verify result for that work is recorded. Owner evidence item 5 says the post-fix run is reported in the plan; it isn't. The uncommitted `lessons-pairing.test.ts` edit is a code change, so record which full verify covered it before committing it.

F7 [nit] `tests/testing/lessons-pairing.test.ts:104` - The comment still says "promote it to the fleet canon". R8 reserves that for the owner too ("Change fleet rules (FLEET.md, …) … only when the owner asks"). The failure message (`:111-113`) correctly says "stage them in canon-candidates.md". civ-engine has the same leftover (`civ-engine/tests/lessons-pairing.test.ts:67-68`).

F8 [nit] `docs/work/5_vite-advisories/reviews/0_implementation.md:53` - The edit note is a plain paragraph inside the retained report, so it reads as the reviewer's own words. Fleet records put such notes in brackets (`fleet/docs/work/20_runbook-powershell-gate/reviews/3_implementation.md:77`). It would also help to name `3c30315` as holding the original text.

F9 [nit] `ci.yml:124-125` - "The rest of the job takes about three minutes" does not match the evidence, which gives 114, 161 and 121 s. With three minutes, the 729 s run would have gone past 15 minutes, but that job took 14m50s.

F10 [nit] `plan.md:14` - "four separate reasons" should be three reasons across four failed jobs. Also, `summary.md:3` says the Linux leg "had failed before running anything since 2026-10-29". The evidence shows that install failure only in the 2026-11-05 run, on an image dated 2026-11-01.

F11 [nit] `ci.yml:16-18` - Running the workflow by hand on `main` puts it in the same group as push runs, so it cancels any main run in progress. I found no other risk: there are no secrets, the token is `contents: read` (`ci.yml:13-14`), and artifacts belong to their own run.

F12 [nit] `plan.md:22` - "landed in its own commit" describes an edit that is still uncommitted.

**Verified myself** (reading files and git only)

- **Vite pin:** `git diff --stat 3c30315 HEAD -- package.json package-lock.json` is empty. `package.json:110` and `package-lock.json:24,2433-2435` hold the only `vite`, at 8.1.6. The installed `node_modules/vite/package.json:3` reads 8.1.6. `git diff --check` is clean.
- **Round 0 edit:** The R24 line of AGENTS.md at `7a93bae` contains the quoted words exactly. `a29b266` changes only the note and F4, and F4 was line 63 of the record as committed in `3c30315`. The scan is at `repo-wide-gate-coverage.test.ts:242`, and no AGENTS.md line citation remains outside the scanner file.
- **Lessons test:** Its check (`:106-108`) is unchanged, so it still tests the same thing. The new wording matches R8 and `docs/learning/lessons.md:5` ("when the owner asks for it").
- **Runner and job names:** No test, script or doc reads `ci.yml`, the job names, the runner or the artifact names. Pinning `ubuntu-24.04` is right and enough to get past the install step. The Linux leg will still fail on the two HUD baselines, whose pixel counts have not changed since September (`defect-register.md:98`).
- **Arithmetic:** 03:46:51 to 04:00:36 is 825 s. 825/531 is 1.55. 2 × 14m50s is 29m40s.
- **Tools:** One Bash call (a folder listing) was refused by permissions, so I used file search instead.

**Taken from the owner's evidence**

- Every CI run, job time, runner image and Playwright error, and the absence of branch protection.
- The 2026-11-06 install, the audits (12 moderate) and the supply-chain passes, and that the first verify on the merged tree failed on one test. I found no post-fix verify result anywhere.
- That lego and investing made this edit on 2026-11-06. I saw "ask the owner" wording in their files, and civ-engine's, but did not check the dates.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | `oak-font-diagnostic.yml` runs the same failing `--with-deps` install on `ubuntu-latest` (Codex F1, Claude F5). | Accepted. It is the same cause, it is the tool for the Linux HUD font question, and fonts come with the image, so it has to run on the image `Node 24 complete` uses. | The diagnostic's matrix is `[ubuntu-24.04, windows-latest]`, with the reason beside it, and `tests/testing/oak-font-diagnostics.test.ts` pins the new list. |
| F1 | The plan's outcome reads as verified for the 2026-11-06 work, records no verify of the merged tree, and says the lessons wording "landed" while it was uncommitted (Codex F2, Claude F6 and F12). | Accepted. | The outcome dates the 2026-10-31 verify and says it ran before round 0's record, records the `ed3dd93` verify, says the wording "lands in its own commit", and points here for the final verify. |
| F2 | "Measured bounds" and "sized from measurements" overstate the 90-minute cap, which its own comment calls unmeasured (Codex F3, Claude F3). The subject of `ed3dd93` says the same. | Accepted. | The plan, the devlog line and the cap's comment now say the 30 is measured and the 90 is room to measure in. `ed3dd93`'s subject is left as committed rather than rewriting the branch. |
| F3 | "No complete Windows run has been measured yet" is false: runs 33205964399 (116 tests in 15.7 minutes) and 35164009617 (135 tests in 39.1 minutes) completed (Claude F1). | Accepted; both are in `docs/learning/defect-register.md`. | The comment now says no Windows leg has finished the suite since run 35164009617, and gives the reviewer's estimate that the 2026-10-18 run needed about 66 minutes. |
| F4 | The upload step's comment still calls `timeout-minutes: 60` "a budget sized from a measurement" (Claude F2). | Accepted. | It now says only that the cap is a budget the lane sits against. |
| F5 | Raising the caps gives something up, and the record left it out: the 15-minute cap found the leaf-oracle cost, work unit 1 cut that cost instead and asked for a reviewed justification before a cap change, and the Windows leg slowed from 15.7 to over 42 minutes (Claude F4, Codex F3). | Accepted. | The plan's approach names the trade-off and work unit 1, keeps the Windows leg's slowness open as a defect, and adds the step to set the 90 from the first complete Windows run. Both cap comments say what a higher cap gives up. |
| F6 | The lessons comment still says "promote it to the fleet canon", which R8 also reserves for the owner (Claude F7). | Rejected for this change. The task gave this wording to match the edit civ-engine, lego and investing made the same day, and the failure message already says to stage the lesson in `canon-candidates.md`. | Reported to the coordinator as a fleet-wide wording point; civ-engine has the same comment. |
| F7 | The edit note in round 0's report reads as the reviewer's own words (Claude F8). | Accepted. | The note is in square brackets, says it is not the reviewer's, and names `3c30315` as holding the original text. |
| F8 | "The rest of the job takes about three minutes" does not match 114, 161 and 121 s (Claude F9). | Accepted. | The comment says 114 to 161 s. |
| F9 | "Four separate reasons" are three reasons across four failed jobs (Claude F10). It also doubted that the Linux leg failed at the install step from 2026-10-29. | The count is accepted. The date stands: run 40930561874 on 2026-10-29 ran its Linux leg on image ubuntu-26.04 20261025.179.1 and failed with the same "Playwright does not support chromium on ubuntu26.04-x64". | The plan says three reasons across four failed jobs. |
| F10 | A run by hand on main shares the push runs' concurrency group and cancels a main run in progress (Claude F11). | Accepted as a note; no other risk was found. | The trigger's comment says so. |

## Verification

All in the worktree `C:/Users/38909/Documents/worktrees/voxel-vite`, on Windows with Node 24.18.1 and npm 11.16.0:

- Before the review, on the tree of `ed3dd93`: `npm run verify` exited 0 in 23 min 53 s, with 2,434 unit tests (1 skipped) and 136 of 136 browser tests. A run started with the lessons wording added was stopped after its unit stage (2,434 passed, 1 skipped) and typecheck, so that the fixes below could join it; its later stages did not run.
- The lessons wording: its test and `repo-wide-gate-coverage.test.ts` passed, and ESLint was clean on the file. With a rule naming no gate appended to `docs/learning/lessons.md`, the test failed with the new message ("stage them in canon-candidates.md, ask the owner about docs/policies/local-rules.md, or drop them"); with the file restored it passed.
- After the fixes: `tests/testing/oak-font-diagnostics.test.ts`, `repo-wide-gate-coverage.test.ts` and `lessons-pairing.test.ts` passed (58 tests); `git diff --check` was clean and neither workflow holds a tab. No YAML parser is installed here, so the workflow files were checked by reading them; GitHub parses them on push.
- Final `npm run verify` on the fixed tree: exit 0 in 22 min 15 s on `ed3dd93` plus the fixes above and the lessons wording, with every stage passing: 2,434 unit tests (1 skipped), typecheck, lint, the compatibility, API and package checks, the supply-chain self-test and gate, and 136 of 136 browser tests in 16.1 minutes. This record's last edit, which writes this line, and the devlog line for the lessons wording came after it; the tests that read the docs were run again on them before committing.

## Round outcome

Both lanes kept, and both answered FIX-THEN-SHIP; neither found anything against the `vite` pin, the lockfile, the runner pin or the lessons wording. Every finding has a disposition above: F0 to F5 and F7 to F10 were fixed, and F6 was rejected with its reason. The fixes are wording in the plan, the devlog, the workflow comments and round 0's edit note, plus the diagnostic workflow's runner and the test line that pins it. They were checked by the tests above and the final verify, not by a second review round.
