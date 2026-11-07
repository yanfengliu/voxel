# Final acceptance, 2026-11-07

The selective-sharing milestone delivered Voxel 5593964a88188da0f0ee87ed83a82b49e3f87cf5 and Townscaper f0123b88051dfaf6665c4ea7c901fed956837954 to main. The eight reviewed producer files and 16 reviewed consumer files were compared to their committed blobs; only normal Git line-ending conversion differed. Both remote main refs were read back after source pushes. The final work-record commit changes documentation only and uses the repository's documentation checks; its skip-ci marker avoids another unchanged runtime run.

Townscaper retains its game-owned presentation and Three.js line. One peer-free source package supplies the shared CPU operators and GLSL functions, fixing the demonstrated fractional-band mismatch. GPU regression, non-finite fault control, complete local gates, exact source-pin checks, the native image inspections, final capture equivalence and independently proven stale-reference repair all passed. The preceding delivered-source snapshot and reviews 0 through 8 record their scope and findings. No renderer performance improvement is claimed.

## Hosted result

[Run 42413010520](https://github.com/yanfengliu/voxel/actions/runs/42413010520), attempt 1 for producer 5593964, completed with conclusion failure at 22:21:31 UTC. No rerun, cancellation request or code change was made to obtain another result.

| Job | Actual result |
|---|---|
| Audit/package, Node 24 | Passed |
| Node 22 portable, Linux | Passed; 2,438 unit tests passed and one skipped |
| Node 22 portable, Windows | Passed; 2,438 unit tests passed and one skipped |
| Node 24 complete, Linux | 2,438 unit tests and all 137 browser assertions passed; final headroom guard failed |
| Node 24 complete, Windows | Cancelled after 90m14s against the configured 90m cap; units passed, browser summary 124 passed, five failed, eight unrun |

Linux's failed guard was Oak growth at tests/browser/oak-ecosystem-stages.spec.ts:76: 170.6 seconds of 214 seconds (80%) against a 75% limit. The [preceding cb148947 run](https://github.com/yanfengliu/voxel/actions/runs/42313542584) failed the same guard at 165.1 seconds (77%) while all 137 browser assertions passed. The workflow, browser configuration, timeout helpers and Oak test sources are unchanged by this milestone. This establishes that this guard already failed before the integration; hosted timings are not a controlled performance comparison.

Windows timed out in the Oak HUD, keyboard, growth and milestone tests. The final Oak controls case was interrupted/reported failed during cancellation, so its isolated behavior is not established. The preceding main run also failed HUD, keyboard and growth checks and cancelled during a milestone retry; its font timeout did not recur in the current run, where that check passed in 80.5 seconds. Elapsed time, the cancelled verification step and logs support the configured job cap as the cancellation explanation; the connector did not expose a separate timeout annotation. These remain inherited timing/teardown limits, with no demonstrated tone-math assertion failure. This is not hosted matrix acceptance.

Townscaper has no hosted Actions workflow/run for its delivered source commit. Its required local gates passed: 2,004 tests, typecheck, lint, build, source checks and both high-severity audits; all 13 reference views matched exactly and all 168 final native images matched the inspected originals. The clean lock install has zero runtime findings and nine moderate development findings, with no high or critical finding.

## Delivery and retained limits

Source delivery is accepted for this bounded integration on the reviewed exact code and complete local evidence. The existing hosted Oak timing problem remains outside this milestone. The primary Townscaper install received the required source-package junction and passed both source-pin checks. Its existing development installation still contains Vite 8.1.2; npm ci applies the reviewed lock's tooling updates. Audit results above refer to the isolated clean install, not a claim that every pre-existing installation was upgraded.

The recorded review gap is Claude's unavailable authentication lane (401); independent pinned Codex reviews passed, including checks of the F0 and F1 repairs. The original three Town water edits and Voxel work-5 edits remain unchanged. Allocator reservation 6 remains owned by its original session; it was carried unchanged only to preserve sequence.

Intentional local evidence is retained in the primary Voxel checkout under output/shared-renderer-20261107/evidence. Each archive has a retention/relocation note; the inspected Town gallery remains, while the duplicate capture set and derivable temporary files were removed. All archived producer files and retained Town files were hash-checked after moving. The final process census found zero matches across 33 recorded process identities and eight unique profile names; the producer JobObject independently recorded empty membership after cleanup. Disposable task worktrees and merged branches are removed before publishing this final record; the required primary dependency link remains.
