# Review 0: implementation

## Target

Repository voxel, base commit `7a93baeda56dfa5d2652e767d7d525684436f7fd` (origin/main on 2026-10-31), plus the uncommitted working-tree diff of `package.json`, `package-lock.json`, `docs/architecture/supply-chain.md` and `docs/work/registry.json`, plus the untracked `docs/work/5_vite-advisories/plan.md`. The reviewers read that diff as `git diff HEAD`: 4,066 bytes, SHA-256 `32f4e524578f9e8859c3dbe5d64986ecaac905a64426376cc5ce67a5b5573850`.

- `package.json` and `package-lock.json`: the commit that lands this unit carries the reviewed changes byte for byte.
- `docs/work/registry.json`: the reviewed change added the entry for ID 5 after ID 4.
- The two documents were edited after the review, in answer to the findings below, so their reviewed bytes are kept here: [snapshots/reviewed-plan.md](../snapshots/reviewed-plan.md) (3,999 bytes, SHA-256 `5043667db3f86281795a2fdd6f651c3a68803a98ef3b687aacf87d8f6dd0eb28`) and [snapshots/reviewed-supply-chain.md](../snapshots/reviewed-supply-chain.md) (7,713 bytes, SHA-256 `a4b530646d16fc5049a5e54bc5dd66cd56a93b3e7f7bc79d4a1971f0427d85be`, Git blob `c4ee17d`, the post-image the reviewed diff names).

The post-review edits to the two documents, this record and the devlog line were not reviewed.

## Reviewers and coverage

Both lanes ran from the ignored run folder `fleet/tmp/review-runs/voxel-5-vite-r0`, with the reviewed tree as their working folder, on the prompt the runbook asks for: the owner's evidence, six questions, and the diff appended. The tree's `git status --porcelain` and `git diff HEAD` were the same before and after each lane.

- Codex CLI 0.163.0, `gpt-6-astra`, `model_reasoning_effort=xhigh`, `--sandbox read-only --ephemeral`, 2026-10-30 23:50 to 23:53 PDT. It started after the only other read-only `codex exec` on the machine had ended. The runbook's check printed `keep` (0 failed commands). Its log shows it read the repository: `AGENTS.md`, the policies, the plan, the lockfile, `scripts/verify-supply-chain.mjs`, `scripts/verify-mesh-worker-package.mjs`, `tools/studio/vite.config.ts`, the CI workflow, and the installed `node_modules/vite/dist/node/chunks/node.js`. The owner spot-checked three citations outside the diff: `scripts/verify-mesh-worker-package.mjs:216` (`await build({`), `tools/studio/vite.config.ts:209` (the `/studio/requests` middleware) and aoe2's `scripts/voxel-build-if-stale.mjs:85` (`package.json` in the staleness check). All three hold. It did not delegate.
- Claude Code 2.1.308, `claude-opus-5-5[1m]`, `--effort max`, tools `Read,Glob,Grep,Task,Bash`, `--permission-mode dontAsk`, no settings, no MCP servers, 2026-10-30 23:38 to 23:50 PDT. The `system/init` event named the pin, those five tools, `dontAsk` and no MCP servers. The report command printed `keep success claude-opus-5-5[1m]`, and stderr was empty. It made 73 tool calls, all reads, and the permission rules refused 2 Bash calls. It did not delegate.

Neither lane ran npm, tests or builds, or used the network, as the prompt asked. Both took the advisory ranges, the registry facts, the `npm diff` summary and the audit results from the owner's evidence.

## Reports

### Codex (gpt-6-astra, xhigh)

SHIP

F1 [nit] [docs/work/5_vite-advisories/plan.md:26](/C:/Users/38909/Documents/worktrees/voxel-vite/docs/work/5_vite-advisories/plan.md:26) - “`vite` runs only as voxel’s development server … and inside `vitest`” omits the production-bundling path in [scripts/verify-mesh-worker-package.mjs:216](/C:/Users/38909/Documents/worktrees/voxel-vite/scripts/verify-mesh-worker-package.mjs:216). Add that package-verification use. The statement about Voxel’s library build using TypeScript remains correct.

**Verified myself**

- HEAD is the supplied base, `7a93baeda56dfa5d2652e767d7d525684436f7fd`. The tracked diff matches the prompt; I also read the untracked plan. `git diff --check` passed.
- The pin is exact. [package-lock.json:2433](/C:/Users/38909/Documents/worktrees/voxel-vite/package-lock.json:2433) contains version 8.1.6, the corresponding registry URL, the supplied integrity, and the new dependency ranges. Locked PostCSS 8.5.23 satisfies `^8.5.17`; Rolldown 1.1.5 satisfies `~1.1.5`. Only the root Vite pin and Vite package entry changed in the lockfile.
- Installed Vite metadata agrees with the version, dependency ranges and engine declaration; it declares no install or prepare script. Vitest and its mocker accept Vite `^8.0.0` ([package-lock.json:2536](/C:/Users/38909/Documents/worktrees/voxel-vite/package-lock.json:2536), line 965).
- CI selects Node 24 complete and Node 22 portable jobs on Linux and Windows ([.github/workflows/ci.yml:20](/C:/Users/38909/Documents/worktrees/voxel-vite/.github/workflows/ci.yml:20), line 100). Node 24 and Node 22.12+ satisfy the unchanged engine range. No newly introduced engine mismatch is apparent.
- The audit gate blocks only high and critical severities and rejects missing or malformed reports ([scripts/verify-supply-chain.mjs:17](/C:/Users/38909/Documents/worktrees/voxel-vite/scripts/verify-supply-chain.mjs:17), lines 127–163). Thirteen moderate findings therefore do not block, consistent with `docs/policies/support.md:52`.
- Studio’s middleware handles request submissions; it does not pass URLs to `transformIndexHtml` ([tools/studio/vite.config.ts:209](/C:/Users/38909/Documents/worktrees/voxel-vite/tools/studio/vite.config.ts:209)). Browser specs use ordinary `createServer` configurations. I inspected the installed URL-cleaning, resolved-path and dynamic-import changes and found no concrete incompatibility with these uses. Voxel declares ESM, and the editor argument restrictions do not affect ordinary Studio/oak startup.
- Linked consumers use Voxel’s exported `dist` and package metadata. They do not acquire its Vite devDependency as their application bundler. Voxel’s existing `prepare` invokes its unchanged TypeScript build ([package.json:50](/C:/Users/38909/Documents/worktrees/voxel-vite/package.json:50)). An indirect effect is possible: AoE’s stale-build check watches Voxel’s `package.json`, so this edit can trigger a rebuild ([voxel-build-if-stale.mjs:85](/C:/Users/38909/Documents/github/aoe2/scripts/voxel-build-if-stale.mjs:85)).
- Searches found no missed active 8.1.4 pin; remaining references describe historical evidence. Changed documentation links resolve, fences balance, and new paragraphs follow the writing convention. Apart from F1, I found no actionable documentation inconsistency.

**Taken from the owner’s evidence**

- Advisory ranges establish **8.1.6 as the lowest upgrading release from 8.1.4 that clears all five**. Staying on 8.1 avoids unnecessary minor-version changes; the supplied evidence gives no reason to require 8.3.5.
- Registry provenance, publication dates, the complete nine-file upstream diff, clean-install/deduplication results, and before/after audit outcomes remain owner-supplied evidence. I corroborated selected installed code and metadata, not registry authenticity or the complete upstream comparison.
- Full verification and consumer checks were still running. I ran no npm, Node, tests, builds, installs or network requests, and modified no files.

This is a review approval with one documentation nit. It does not certify the pending verification, consumer checks or remote CI.

### Claude (claude-opus-5-5[1m], effort max)

FIX-THEN-SHIP

The pin and the lockfile are correct, and I found nothing in them to block on. 8.1.6 is the smallest move that clears all five advisories. It keeps the same Node range, its new dependency ranges are already met by the lockfile, and `rolldown` stays at 1.1.5, so the bundler underneath does not change. It is also 24 days old, against 9 for 8.3.5, which I'd prefer for a fix like this. The fixes needed are in the docs. I did not see the result of the `npm run verify` that is running, and it is still an acceptance criterion.

**Findings**

F1 [should-fix] `docs/architecture/supply-chain.md:3` - The status line still says "updated 2026-08-04 against voxel@1.0.0". No dev dependency changed between that date and the base: `git log` of `package.json` since 2026-08-03 shows only version bumps and the new `oak` script. So this diff is the first table change since that line was written, and the line becomes false. Update the date and the version.

F2 [should-fix] `supply-chain.md:70`, `plan.md:10` - "published on 2026-10-20 and 2026-10-21": the evidence I was given has no publish dates for the advisories. Check each record's `published_at` before committing.

F3 [should-fix] `docs/work/5_vite-advisories/plan.md:26` - "`vite` runs only as voxel's development server … and inside `vitest`" is false. `scripts/verify-mesh-worker-package.mjs:10,216` runs vite's production `build()` inside `verify`. That is the one place where vite bundles voxel's own code, so the plan should name it. `docs/policies/rules/docs.md:9` asks for proof of "only" claims.

F4 [should-fix] `plan.md:16` - A devlog line is in scope, `AGENTS.md:53` requires one, and the 2026-10-01 audit fix got one (`docs/devlog/summary.md:10`). It is not in the reviewed target. Add it before the commit, and say that it has not been reviewed.

F5 [nit] `supply-chain.md:70` - "The full audit still reports 13 moderate findings" is in the present tense. Lines 68 and 107 of the same file say an audit result describes one run, not the tree. Say what it reported, and on which date. Also, "the lockfile changed only the `vite` entry" leaves out the root pin at `package-lock.json:24`.

F6 [nit] Dates disagree. `plan.md:5-6` say 2026-10-31. `supply-chain.md:70` says 2026-10-30, and so does `plan.md:24`, since "24 days" after 2026-10-06 is 2026-10-30. Pick one date convention.

F7 [nit] `plan.md:12,22` - "The lowest release that clears all five" is wrong as written, because 6.4.4 and 7.3.7 are lower and also clear all five. Say "the first patched release at or above 8.1.4". Also record the cost of staying on 8.1. The patched set (8.3.3, 8.2.4, 8.1.6, 7.3.7, 6.4.4) matches Vite's published support window as I remember it; I did not check that here. Once 8.4 ships, 8.1 drops out of that window, so the next advisory will probably force a minor jump.

F8 [nit] `CHANGELOG.md:7,60` - Earlier advisory fixes to dev-only packages (`source-map-js`, `nanoid`) each got a changelog line. Add one here, or say that it will go in with the next release.

F9 [nit] The evidence has no check of registry signatures or provenance (`npm audit signatures`). `npm diff` and the integrity check in `npm ci` cover what is in the tarball, not who published it.

F10 [nit, existing problem outside the diff] `supply-chain.md:39` - It says Rapier is "used only by the headless … consumer fixtures". But `tools/studio/live-physics.ts:415` imports it in the browser Studio. That import is also the only one 8.1.6's dynamic-import change could touch. Rapier is an ES module (`node_modules/@dimforge/rapier3d-compat/package.json:3,31-35`), so the CommonJS path should not apply, and the live-physics browser specs exercise this import.

F11 [nit] `aoe2/scripts/voxel-build-if-stale.mjs:85` - This script rebuilds voxel when voxel's `package.json` is newer than its `dist`. So aoe2's first gate after this lands will rebuild voxel's `dist`, and voxel's `prebuild` deletes `dist` first. That script's lines 16-25 describe what this can do to anything reading `dist` at the time. It is harmless, but expect it.

**Verified myself** (reading files and git only)

- The diff matches the prompt. `git diff --numstat` shows 6 changed lines in the lockfile. They are the root pin (`:24`) and, in the `vite` entry, the version, resolved URL, integrity and two dependency ranges (`:2434-2443`).
- The rest of the `vite` entry is unchanged: Node range (`:2449-2451`), peer dependencies, optional dependencies, and no `hasInstallScript` flag. There is no nested copy of `vite`.
- The locked versions meet 8.1.6's ranges: `postcss` 8.5.23 (`:2096`), `rolldown` 1.1.5 (`:2145`), `lightningcss` 1.32.0, `picomatch` 4.0.5, `tinyglobby` 0.2.17 and `fsevents` 2.3.3.
- `vitest` (`:2536`) and `@vitest/mocker` (`:965`) both accept `^8`, so one copy of `vite` serves them all.
- The pin is exact (`package.json:110`), like the other 13 dev dependencies, and there is no `.npmrc`. The integrity string matches the owner's value (compared as text).
- Nothing else in the repo pins or asserts the vite version. The only other mention is a past review (`docs/work/4_palette-ci-followup/reviews/3_plan.md:20`).
- CI runs Node 24 and Node 22 (`ci.yml:42,118`). The recorded CI versions, 22.23.3 and 24.21.0 (`4_palette-ci-followup/plan.md:60,80`), are inside `^20.19.0 || >=22.12.0`. The CI audits use `--audit-level=high` (`ci.yml:165,169`).
- The gate blocks only on high and critical findings, judged per package (`scripts/verify-supply-chain.mjs:17,160-162`). So the 13 moderate findings do not block.
- The browser specs and the `oak` script bind to 127.0.0.1 (`package.json:69`). The Studio's own middleware handles only POST requests and never calls `transformIndexHtml` (`tools/studio/vite.config.ts:98-111,205-213`).
- Consumers: city links voxel (`city/package-lock.json:3035-3037`) and locks vite 8.1.2 (`:2868`). aoe2 locks vite 6.4.3 (`aoe2/package-lock.json:4047`). Both lockfiles keep a copy of voxel's manifest (city `:43-61`, aoe2 `:51-69`), still showing voxel 1.2.0 and vite 8.1.4. That copy is only a record. As I understand npm, it does not install a linked package's dev dependencies; I did not run anything to confirm this.
- What the consumers do take is voxel's `dist`. That is built by `tsc` (`package.json:55`), not vite, and it imports only `three`, which both consumers dedupe (`city/vite.config.ts:57`, `aoe2/vite.config.ts:19`). Voxel's `prepare` script (`package.json:50`) runs `tsc` on their install, and this diff does not change it. So nothing in this change reaches their bundles.

**Taken from the owner's evidence**

- The advisories' affected ranges and first patched versions.
- The publish dates of 8.1.6 and 8.3.5.
- 8.1.6's manifest beyond what the lockfile shows, and what `npm diff` contains.
- The `npm ci` and `npm ls` results.
- The audit counts (14 before, 13 after) and which advisories the 13 come from.
- The `test:supply-chain` pass.
- The consumers' build and test runs, and the `verify` result, which I have not seen.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | The plan says `vite` runs "only" as a development server and inside `vitest`, but `scripts/verify-mesh-worker-package.mjs:216` runs its production `build()` in `verify` (Codex F1, Claude F3). | Accepted. Both lanes found it, and the owner read the call. | The plan's approach now names that bundling use. |
| F1 | The supply-chain record's status line still dates the whole file to 2026-08-04 and `voxel@1.0.0` (Claude F1). | Accepted. `git log -p -- package.json` since 2026-08-03 shows no dependency version change before this one, so the line was true until this diff. | The status line now says the `vite` row and the audit note on the `vite` advisories date from 2026-10-31, against `voxel@1.3.0`. |
| F2 | The advisories' publish dates were not in the evidence (Claude F2). | Checked; the text stands. `published_at` is 2026-10-20T18:30:24Z for GHSA-698v-4r3x-3vcv, 19:48:25Z for GHSA-587h-7wmj-h5pm and 19:51:52Z for GHSA-r825-w8mm-5pxw, and 2026-10-21T16:47:42Z for GHSA-rq7h-c2jc-7f22 and 16:48:14Z for GHSA-9jrq-w75r-8gcw. | None. |
| F3 | The devlog line was not in the reviewed target (Claude F4). | Accepted. | Added to `docs/devlog/summary.md` after the review; not reviewed. |
| F4 | The audit note gives one run's result in the present tense, and "only the `vite` entry" leaves out the root pin (Claude F5). | Accepted. | The note now gives the result with its date, and names the root `vite` pin. |
| F5 | The documents mix 2026-10-30 and 2026-10-31 (Claude F6). | Accepted. The allocator dates the plan in UTC, and the change lands on 2026-10-31. | 2026-10-31 throughout; the "24 days" figure is gone. |
| F6 | "The lowest release that clears all five" is wrong as written, since 6.4.4 and 7.3.7 also clear them; record the cost of staying on 8.1 (Claude F7). | Accepted. Vite's support window was not checked. | The plan and the record now say "the lowest release above 8.1.4", and the plan names the cost. |
| F7 | Earlier dev-only advisory fixes got a changelog line (Claude F8). | Rejected for this commit. Since 1.0.0 `CHANGELOG.md` has no unreleased section, and those lines were written into the release entry that shipped them: nanoid's in 1.1.0 (`3f9817c`), source-map-js's in 1.3.0 (`3c59596`). | The plan's outcome says the next release entry should record this bump. |
| F8 | No check of registry signatures or provenance (Claude F9). | Accepted. | `npm audit signatures`: 145 packages with verified registry signatures, 49 with verified attestations, none invalid or missing. vite 8.1.6's provenance names `vitejs/vite` tag `v8.1.6`, commit `dade886f0cc17fedf777eff804593d2af182abd4`, `.github/workflows/publish.yml`, on a GitHub-hosted runner, and its SHA-512 equals the lockfile's integrity. |
| F9 | `supply-chain.md:39` says Rapier is used only by headless fixtures, but `tools/studio/live-physics.ts:415` imports it in the browser Studio (Claude F10). | Accepted as true and left open. It predates this change and is not about `vite`. The status line no longer claims the rest of the file was checked on 2026-10-31. | Reported to the coordinator. |
| F10 | aoe2's staleness check will rebuild voxel's `dist` after this lands, because `package.json` is newer than `dist` (Claude F11). | Accepted as expected behaviour; no change. The consumer check also saw `npm ci` in a consumer run voxel's `prepare`, which rebuilds `dist`. | None. |

## Verification

All on the reviewed package bytes, in the worktree `C:/Users/38909/Documents/worktrees/voxel-vite`, on Windows with Node 24.18.1 and npm 11.16.0:

- Before the bump, on the base: `npm audit --omit=dev --audit-level=high` exited 0 with 0 findings; `npm audit --audit-level=high` exited 1 with 14 findings, 13 moderate and 1 high (`vite`); `node scripts/verify-supply-chain.mjs` failed with "full audit reports blocking findings: vite (high)".
- After the bump: `npm ci` installed 145 packages, and `npm ls vite` shows `vite@8.1.6` deduped under `vitest@4.1.10` and `@vitest/mocker@4.1.10`. The runtime audit exited 0 with 0 findings. The full audit exited 0 with 13 moderate findings and no high or critical one. `npm run test:supply-chain` passed.
- `npm run verify` exited 0 in 23 min 13 s: 301 unit test files passed and 1 skipped (2,434 tests passed, 1 skipped), typecheck, lint, the three TypeScript compatibility versions, the public API check and its self-test, the packed core, mesh-worker and Three.js checks (the mesh-worker check bundled its consumer with `vite` 8.1.6), the supply-chain self-test and gate, and 136 of 136 browser tests.
- The consumers, aoe2 and city, are recorded in [the plan's outcome](../plan.md#outcome).

## Round outcome

Both lanes kept. Codex answered SHIP with one nit. Claude answered FIX-THEN-SHIP with four should-fix findings and seven nits, none against the pin or the lockfile. All findings have a disposition above. F0, F1, F3, F4, F5, F6 and F8 were fixed or answered after the review, F2 was checked and stands, F7 was rejected with its reason, and F9 is left open as a pre-existing problem outside this change. The post-review edits are wording in the two documents, the devlog line and this record. They change no reviewed package byte, so no second round was run.
