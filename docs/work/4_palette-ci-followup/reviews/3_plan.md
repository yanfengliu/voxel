# Independent CI lifecycle investigation

## Target

Source A d2d8be0e416ed9bd12c288ed1c7a189716f05a12 versus B d05c06a5a2f9843f9c1d54096e2ae253f34067b8, plus original current Windows failed/retry traces from run39155851899 and the completed cold diagnostic39161375652. Main11af924 changes documentation only. Before dispatch, tmp/palette-ci-followup/search-contract.md fixed the reproduction, source delta, acceptance and false-pass disqualifiers.

## Reviewers and coverage

Fresh independent read-only ci_lifecycle_probe agent using the live review-runbook pin. Distinct mechanism: browser/server/context/runtime ownership and startup inputs, rather than repeating whole-suite timing arithmetic. No files, tests, npm commands, browsers, servers or jobs were created. No final source-review or hosted clearance is claimed.

## Reports

Complete authored final report follows. In this tracked copy only local Markdown citation destinations are redirected from the owned worktree to the primary checkout, whose executable blobs remain B. The original report is retained unchanged in ignored tmp/palette-ci-followup/lifecycle-report-original.md, SHA-256857c015ae920f1d569d672f8f1f4cb6deeb00fd77a360a48baea23a510776ecc. Installed dependency citations name the observed lockfile versions and do not imply future installed files retain those bytes. The original trace archive remains inside retained Windows artifact ZIP SHA-2560e088c27b0f9bde8f740158c943498a5969b6cc35583aac3f5ae5c18d14bc965.
Read-only lifecycle report: **no introduced leak was established; Windows causation remains unresolved.** The smallest same-host run of the unchanged HUD test on A and B remains the cheapest discriminating runtime probe.

Compared A `d2d8be0e416ed9bd12c288ed1c7a189716f05a12` with B `d05c06a5a2f9843f9c1d54096e2ae253f34067b8`, including `source-map-js` 1.2.1→1.2.2. The inspected worktree’s `src`, `tests`, Playwright config and package files match B. Runtime initialization/disposal, the three failing Oak specs, browser support and page-error support have identical Git blobs between A and B.

- **The added fixture has explicit cleanup and no identified recurring workload.** [face-palette-tones.spec.ts](C:/Users/38909/Documents/github/voxel/tests/browser/face-palette-tones.spec.ts:18) creates one Vite server and closes it in `afterAll` at line 24. [face-palette-tones.html](C:/Users/38909/Documents/github/voxel/tests/browser/fixtures/face-palette-tones.html:34) constructs a runtime for each of two views, submits one frame, captures it, and disposes in `finally` at line 59. It supplies no voxel workers and starts no animation loop. [ThreeRenderRuntime.ts](C:/Users/38909/Documents/github/voxel/src/three/ThreeRenderRuntime.ts:600) removes listeners and releases presentation, world, lighting and owned-renderer resources. Its disposal implementation attempts every release and surfaces failures. This is a source-level ownership bound, not evidence that all hosted resources were reclaimed.

- **Browser-context teardown is broader than GPU cleanup.** The installed versions match the locked Playwright 1.59.1, Vite 8.1.4 and Three 0.185.1. Playwright creates test-scoped contexts and closes them, while its browser is worker-scoped. [browserContext.js](C:/Users/38909/Documents/github/voxel/node_modules/playwright-core/lib/client/browserContext.js:453) awaits pre-close instrumentation at line 459 before sending actual context close at line 478. [Playwright’s artifacts recorder](C:/Users/38909/Documents/github/voxel/node_modules/playwright/lib/index.js:607) awaits tracing, screenshot and ARIA capture during that instrumentation. Consequently, a long “context” fixture span cannot independently identify context destruction, renderer disposal, or GPU cost.

- **Raw evidence confirms test-body continuation during teardown.** I directly read the original HUD archive, SHA-256 `d6cec0b0784dcd58a7f1a07362065262d588a9a578735643977876c95714e75b`, under `C:/Users/38909/.codex/worktrees/palette-ci-followup/voxel/tmp/palette-ci-followup/windows-artifact/test-results/oak-ecosystem-hud-keeps-st-ee570-rols-and-diagnostics-scroll/trace.zip`. In its `test.trace`, line 268 reports the 110500 ms test deadline; `hook@214` starts “After Hooks” at `1157231.680`. Context fixture `fixture@217` begins at `1163522.894` (line 278). Nevertheless, body call `pw:api@223` scrolls the overhead control at `1169324.847–1187763.739` (lines 297–298; HUD source line 78), and `pw:api@225` clicks it at `1193344.413–1216807.244` (lines 301–302; source line 80). `expect@252` starts another viewport assertion at `1267892.084` (line 355), immediately before context teardown times out at line 356. These are overlapping wall intervals, not additive CPU measurements. Playwright’s [timeout manager](C:/Users/38909/Documents/github/voxel/node_modules/playwright/lib/worker/timeoutManager.js:75) races the callback against a timeout promise, which permits this observed continuation. This inherited mechanism can amplify failed-run work; it does not explain why the first deadline was crossed.

- **A concrete introduced startup contribution remains possible.** Vite defaults scan repository `**/*.html`, including the new fixture, and use a shared `node_modules/.vite` cache: [Vite source](C:/Users/38909/Documents/github/voxel/node_modules/vite/dist/node/chunks/node.js:30698). The new meshing barrel export also adds a module to runtime import graphs even where its function is never called. Explicit `optimizeDeps.include: []` in Oak specs matches Vite’s default; it does not disable discovery. Vite’s close implementation awaits watcher, WebSocket, environment and HTTP closure, and destroys tracked sockets; however, its `Promise.allSettled` means successful resolution alone does not prove every close operation succeeded. None of these paths has measured cost here. The dependency delta also remains relevant through PostCSS’s `source-map-js` imports.

**Next probe:** retain the prepared same-host HUD A/B, original assertions and budgets, explicitly controlled cache state/order, and raw phase evidence. Measure the initial failure separately from trace export, context close and worker/browser exit. A result distinguishing A and B justifies deeper isolation of the changed startup inputs. Two passing cases would leave the original cumulative-suite reproduction unresolved; they would not clear B.

No files were created or modified. No tests, npm commands, browsers, servers, GUI applications or remote jobs were launched. All read-only command processes completed; no task-owned persistent process or temporary artifact remains. This report provides no final code-review or hosted-CI clearance.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | Teardown spans overlap continuing test-body work and pre-close artifact export. | Accepted after literal raw trace/source spot checks. | Keep initial failure, trace export, context close and process exit separate; infer no CPU/GPU attribution. |
| F1 | New HTML/barrel may affect default Vite discovery even when its test is excluded. | Accepted as unmeasured possibility, not a diagnosed regression. | Control original cache state and order in the proposed same-host A/B; isolate only after a difference. |
| F2 | Explicit static cleanup does not prove hosted reclamation. | Accepted. | No leak exoneration or full-suite clearance from this review. |

## Verification

Owner independently verified HUD trace SHA-256d6cec0b0784dcd58a7f1a07362065262d588a9a578735643977876c95714e75b and literal rows268,278,297–298,301–302,355–356. The receipt retains call IDs, original stacks and timestamps. Owner read installed BrowserContext.close before-instrumentation/channel-close order, timeout-manager Promise.race, Vite default HTML discovery and default cache path. This establishes the stated source/trace bounds, not a measured introduced cost or inherited first-deadline cause.

## Round outcome

No introduced leak established; Windows source/host/cumulative causation remains unresolved. The unchanged original HUD same-host A/B with controlled cache/order remains the cheapest runtime discriminator. No source fix, repeated full gate, budget increase or success claim follows. CI substantive repair attempts remain0/5; local runtime controls await a trustworthy orchestrator lease.