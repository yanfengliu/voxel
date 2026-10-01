**BLOCK — FONT-R0-001 · High: the new CLI test will fail both Node 22 portable jobs.**

The test constructs its success reports through the helper at [oak-font-diagnostics.test.ts:223](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/testing/oak-font-diagnostics.test.ts:223), then expects checker success at line 231. The helper records `process.version` at [oak-font-diagnostics.ts:145](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/tests/browser/oak-font-diagnostics.ts:145), while the checker requires `v24.*` at [verify-oak-font-diagnostic.mjs:46](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/scripts/verify-oak-font-diagnostic.mjs:46). Nothing replaces that field in the fixture.

Outside-diff evidence: the existing [ci.yml:115](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/.github/workflows/ci.yml:115) selects Node 22 and runs `npm test` at line 125. Thus both portable jobs will reject the supposedly valid report before reaching the mutation controls. This conclusion is from source inspection, not an executed test.

**Minimum correction:** give both mocked success reports an explicit valid Node 24 identity independent of the test runner. Preserve the real checker’s Node 24 requirement. Verify the focused test on Node 22 and Node 24 in the next authorized slot.

No additional material issue found in the reviewed workflow, observer, or report path:

- Default-branch `github.sha` checkout, assertion-only SHA input, preflight ordering, read-only permissions, existing action pins, and disabled retained credentials are intact.
- Both callers reconstruct exactly to the independent original pins. Default opt-out bypasses diagnostic invocation; original assertions/configuration remain intact.
- Population/font validation, checkpoint equality, exclusive report creation, awaited detach, and primary-error preservation match the contract. Outside-diff [host lifecycle:184](C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001/fixtures/oak-ecosystem-consumer/oak-browser-host.ts:184) supports excluding per-frame counters.
- Retained Windows reports contain 11 nodes each, 204/212 glyphs, matching checkpoints, and matching current 14-input digests. Their completion remains separate from original test outcomes.

**Drift:** all 19 frozen targets still match the manifest. Observer before/closing source hashes agree; all 71 baselines match. The two authored work docs differ from their pre-observer hashes, but match the frozen review targets. No unexpected review-target drift found.

No tests, gates, browser, background tasks, or writes were performed. Full local gate, main acceptance, and hosted diagnostic dispatch remain pending.