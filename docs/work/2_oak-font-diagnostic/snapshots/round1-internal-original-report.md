# FONT-R0-001 focused internal re-review

## Target and verdict

PASS for the fixture-only FONT-R0-001 repair. The original HIGH finding is resolved by the inspected code and retained focused execution evidence. No new material source finding. One nonblocking P3 documentation inconsistency remains below. This is an internal independent read-only vote; the requested external round-1 Codex re-review was rejected before process launch and remains DID NOT RUN, with no vote. I did not retry it or use an external alternative.

Target workspace: `C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001`; base/HEAD `6e28629fe8dff1fef638b434d3a5381792f4b133`. The round-1 sixteen-input manifest is SHA-256 `9d3d6cb4255672052039e5113df750d66fb52a82f9690a1cf1b8224026295258`. All sixteen current files and their retained `round-1/target/` copies match the declared sizes and hashes. The complete original external round-0 BLOCK report remains 2,800 bytes, SHA-256 `85ca5ab5993433006bdc9ac403ac19740ae1e9081f285fdeccf7622b96c25606`, both at its ignored original path and its permanent snapshot path.

Reviewer: `/root/occupation_source_acceptance`; integration ownership remains with root and the engine worker. I inspected files and retained results only. No tests, runtime, browser, build, probe, network request, model CLI, child review, target write, Git write or process census was performed. Only this report and its LF input manifest were written under primary ignored `tmp/review-runs/voxel-font-internal-f0-1001/`.

## Finding disposition and exact repair

FONT-R0-001 identified a real portability regression: successful mocked reports inherited the test runner's `process.version`, while the diagnostic checker requires a Node 24 report identity. The existing portable CI lanes explicitly select Node 22 and run `npm test`; I read this outside the diff at [ci.yml:115](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/.github/workflows/ci.yml:115) and [ci.yml:125](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/.github/workflows/ci.yml:125). Thus a valid Node 22 test runner could reject its own supposed-success fixture before testing corruptions.

The entire repair relative to retained original fixture SHA-256 `d56e2ec6415eb082356f823b0ba1f9505448ddbf8b6a934976524522dacefe7c` is three added lines: an explanatory comment, literal `v24.0.0` identity for both success reports at [test line 230](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/testing/oak-font-diagnostics.test.ts:230), and a `v22.0.0` rejection mutation at [line 236](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/testing/oak-font-diagnostics.test.ts:236). The current 19,152-byte fixture hashes to `fba3c74ae4aed172404d276131f19d06f083a9d697ef55f8a68d33ef2b2912b4`. These are explicitly mocked diagnostic-report identities, not fabricated observations in the real observer.

The mutation loop restores the good report after each corruption and requires the real checker subprocess to reject the mutated report. The other valid report remains present. Success still requires the real checker to return zero and print COMPLETE. No assertion, test count, production identity requirement or checker guard was removed. The real [observer](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/browser/oak-font-diagnostics.ts:145) still records `process.version`; the real [checker](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/scripts/verify-oak-font-diagnostic.mjs:46) still requires `^v24\.`; the [workflow](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/.github/workflows/oak-font-diagnostic.yml:31) still selects Node 24.

The other five source files exactly match the original reviewed manifest `b3d711994861561e15c0e732f225895d81ae9fe25204eda1d490beef9e8e1460`: workflow `f581a34842d6a74149b5027988c783e06c6298f2e1909db3b59e95e541954284`; checker `a2d998ee3e0e156bf53ad7c18b1bf902400039495d16c7c8c1c684c58939f058`; weather caller `68685807f3c1ea4f141ad5b7fcf26a67614c269132efd8f3c5536497ebef32b5`; mature caller `629bd93bc466890c4819be6ef030ac12fae2197ea02ff63b87c75a85e0f5b23f`; observer `4ea78d38159103dd53b0a3aeb50291995dbaca16aeedbad2f035c7c36429e895`.

## Preserved diagnostic boundaries

I read the unchanged observer, checker and workflow and the guarded capture call sites. Default opt-out still avoids diagnostic invocation at [mature caller line 437](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/browser/oak-ecosystem.spec.ts:437) and [weather caller line 236](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/browser/oak-ecosystem-weather.spec.ts:236); the helper also returns before Git/file/CDP work when disabled. The existing literal controls and exact original-caller hash reconstruction remain unchanged.

The workflow keeps default-branch-only execution, event-selected `github.sha` checkout, read-only contents permission, pinned actions and disabled retained credentials. Its user-supplied SHA is an assertion passed through the environment, not an arbitrary checkout or shell command. Preflight precedes dependency installation and browser execution. Diagnostic completion and the original screenshot-test outcome remain separate, with no continue-on-error or relaxed image assertion.

The helper retains exactly eleven actual selector/index nodes, nonempty text, typed font rows and positive aggregate glyph use per node. Before/after checkpoints retain full simulation SHA, camera/navigation/weather and coherent accepted/presented/render identities; frame/FPS counters remain outside the claim. The checker requires the exact ordered fourteen-input digest population and recomputes actual bytes. Reports remain exclusive `wx` writes in the owned ignored output directory. Acquired CDP sessions detach after read settlement, and an existing primary read error wins if cleanup also fails. These read-only observation and cleanup requirements are unaffected by the fixture identity correction.

## Executed evidence inspected

I read the focused runner, native receipt, all three test logs, lint/typecheck logs, JobObject result and process trace. The runner verifies both original and fixed fixture hashes, verifies the Node 22 executable hash, writes the original fixture for the negative control, restores the fixed fixture before both positive arms, checks expected native exits and literal test totals, and restores the fixed bytes in `finally`. Its receipt reports exact restoration, unchanged other five source files and unchanged old observer reports. My own hash checks agree.

| Retained command | Native result | Observed bound |
| --- | --- | --- |
| Original fixture, Node 22.23.3 | Exit 1; no signal | 1 failed / 42 passed / 43 total. The named checker CLI test fails at original line 231: expected status 0, received 1. This is an executed assertion RED. |
| Fixed fixture, Node 22.23.3 | Exit 0; no signal | 43/43 passed. |
| Fixed fixture, Node 24.12.0 | Exit 0; no signal | 43/43 passed. |
| Test-file ESLint, max warnings 0 | Exit 0; no signal | Scoped fixture lint; empty output. |
| Strict test-file TypeScript, no emit | Exit 0; no signal | Scoped fixture/import graph with `skipLibCheck`; empty output. This is not the repository's full typecheck gate. |

The receipt is SHA-256 `f6e3a5e4b94c0dd5bcff8b4104a4e1fe901ded90fbd8147b4d580f4b42e5750a`; successful owned-job result is `a11d469c6dc7f0d5b8c04b1cbb08ce83efb9a631dc3ac7a88acd7762965053da`. The owned job exited zero in 11.903 seconds. Its trace shows assignment before release, wrapper exit zero, successful membership query/close and zero remaining members; the retained result reports `cleanupProof=true`, no leftovers and no error. I did not infer cleanup from a test summary or terminate any shared process.

An earlier launch is separately retained as DID NOT RUN: custom-lock rejection, exit 1, null root PID, no assignment and no cleanup proof. It provides no test or cleanup success vote. The later successful job is the evidence above.

I independently hashed the isolated `node.exe`: 86,973,768 bytes, SHA-256 `9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e`. The retained official `SHASUMS256.txt` has exactly one `win-x64/node.exe` row with that digest; `verified.json` records the Node 22.23.3 nodejs.org executable/checksum URLs and isolated, uninstalled status. The execution receipt records actual version strings for both run binaries. I did not download or execute either binary during review.

The unchanged historical Windows observer reports are 13,752 bytes / SHA-256 `697a754465191b30c02ff9b2cd3ee0b7c1628149ad8d0821ef25a6437c3fc934` and 13,772 bytes / `9333398dc013546cdee1bfdce609f06a4a5008b1e9ed94070dc47e8294b6b965`. I read their fourteen-input bindings, eleven-node populations, 204/212 glyph totals and equal before/after checkpoints. Both identify win32, Node 24.12.0 and Chromium 147.0.7727.15. Their fixture input is the original `d56e2ec...` digest; the fixture is the only recorded input now differing from current bytes. These are intentionally pre-repair observations. They are not rewritten or presented as new browser verification of the repaired fixture.

## Remaining finding and limits

P3 — stale current-status phrase in [work2 plan.md:10](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/docs/work/2_oak-font-diagnostic/plan.md:10): it says CI36841363533 “is running”, while the same frozen plan at line 45 records the completed Linux failure and Windows cancellation. Replace or date that phrase when reconciling the plan for publication. This does not block source acceptance of FONT-R0-001. Root was notified; this reviewer did not edit the target.

The work2 design and outcome otherwise retain the relevant bounds: no adopted font, no claimed actual Linux font identity, no font/baseline/raster/tolerance/timeout/dependency/production change, no diagnostic main integration or dispatch, and no complete local diagnostic gate. Existing hosted pixel/headroom/Windows-cost failures remain open. Their detailed causes are outside this fixture re-review; their status is retained owner evidence, not a fresh network observation by this reviewer.

The earlier complete external review remains BLOCK on its original bytes and is not rewritten. This internal focused PASS resolves that finding for the repaired fixture using the current evidence. The denied external round-1 launch has no approval vote. No broader voxel performance, work108 or M7 acceptance follows from this review.

## Closing handoff

Accept the exact FONT-R0-001 source repair. Preserve this authored report verbatim when publishing its work2 review wrapper, including the P3 doc note, historical observer binding and external DID NOT RUN boundary. The accompanying LF manifest records every inspected frozen, supporting and outside-diff digest plus the independent closing check. All sixteen frozen inputs and target copies remain exact; the other five source files and old reports remain unchanged.

Root and the engine worker still own documentation reconciliation, required full verification, final integration, main/push and any later reviewed-SHA manual two-OS diagnostic dispatch. This private repair remains uncommitted in the assigned worktree. No reviewer-owned browser, GUI, server, watcher or persistent process exists to clean up.
