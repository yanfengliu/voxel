# Preliminary CI cost and probe review

## Target

Read-only preliminary investigation of committed d05c06a5a2f9843f9c1d54096e2ae253f34067b8 against d2d8be0e416ed9bd12c288ed1c7a189716f05a12 and retained hosted run39155851899 / baseline39152993370 logs. Immutable initial evidence manifest: 60c7b5d42109b08a90ccc83c71ee2009edbd12fab7dbcbc1e8c55b4251570ea3. This assignment preceded the authored work4 plan text; no review of its uncommitted preimage is claimed.

## Reviewers and coverage

Independent read-only ci_cost_probe agent, pinned review model and reasoning from the live multi-CLI runbook. Scope: raw timing evidence, changed inputs, reporter populations and cheapest discriminating probes. No edits, tests, browser sessions or full gates. This is preliminary investigation, not final exact-revision code-review credit.

## Reports

The following is the investigator's complete authored final report, preserved verbatim.

Existing evidence supports **an inherited Linux deadline problem and an unresolved Windows slowdown**. It does not establish that the palette helper caused, or is wholly unrelated to, the Windows failures.

- **Node 22 Linux:** baseline units took 843.09s; current units 845.54s. Both completed units and typecheck, then exhausted the unchanged 15-minute job budget during lint. This reproduces the deadline before the helper.
- **Node 22 Windows:** baseline passed in 885s, leaving about 15s; current was cancelled with units incomplete after 855s. Both used Node 22.23.3 and image `20261007.264.1`, but different runners. Common unchanged workloads slowed broadly: leaf-fall 439.5→570.9s, fluid simulation 248.2→333.8s, projection cache 36.1→46.5s. This supports investigating runner/environment or shared execution cost; it does not prove either cause.
- **The input delta includes a dependency change:** `source-map-js` 1.2.1→1.2.2. “Only an additive helper changed” is therefore an invalid causal premise. Its actual contribution remains unmeasured.
- **The +22 unit cases are 11 source cases plus 11 emitted copies.** The source and emitted files took 20ms and 16ms respectively on Linux. `package.json:50` builds during installation; `tsconfig.build.json:11` includes `src`; `vitest.config.ts:36` does not exclude `dist`, and installed Vitest defaults exclude only `node_modules` and `.git`. This is a real denominator issue, but eliminating these millisecond bodies cannot explain the Windows delay.

The late Windows browser cost deserves a narrower description than “three test timeouts”:

| Case | Observed failure |
|---|---|
| HUD | 110.5s test deadline **and another teardown deadline**, on both attempts; `boundingBox()` stalled at different controls. |
| Keyboard | The **20s polling assertion** waiting for `simulation.hostTick` to increase failed twice, before keyboard input. |
| Stages | 214.2s test deadline plus teardown deadline; retry interrupted near the job cap. |

The HUD begins at 19:23:56; cancellation is 19:48:51. Thus roughly 25 minutes of the 42.3-minute browser span occurs after the first HUD attempt starts. The passed-test headroom maximum of 51% cannot characterize that interval: the reporter includes only passed attempts in its ranking and only `timedOut` attempts in its killed list (`tests/testing/browser-timeout-headroom.ts:122`). Keyboard assertion failures are absent from both populations.

**Cheapest next discriminator:** inspect the already retained Windows traces before launching anything. Artifact `12148044519` from run `39155851899` is 34,153,029 bytes. Download into a new ignored directory, preserving the immutable evidence folder:

```powershell
gh run download 39155851899 --repo yanfengliu/voxel --name playwright-failure-output-windows-latest --dir tmp/palette-windows-causation
```

Read the HUD and keyboard trace archives without launching the viewer. Extract timestamped call spans and lifecycle events. This can separate time spent in the original interaction from stalled evaluation/teardown; it cannot identify the revision responsible. Sources defining the actual inputs are `tests/browser/oak-ecosystem-hud.spec.ts:45`, `tests/browser/oak-ecosystem-keyboard.spec.ts:60`, and `tests/browser/oak-ecosystem-browser-support.ts:266`.

After the machine lease is trustworthy, the **smallest faithful browser control** is the first original failing HUD case on fixed predecessor **A=`d2d8be0e416ed9bd12c288ed1c7a189716f05a12`**, then fixed current **B=`d05c06a5a2f9843f9c1d54096e2ae253f34067b8`**, using each revision’s lockfile on the same Windows host:

```powershell
npm run test:browser -- tests/browser/oak-ecosystem-hud.spec.ts --retries=0 --workers=1
```

Preserve the existing assertions, viewport, simulation and timeout. Budget at most five minutes per invocation including teardown, with owned-process cleanup. This probe does not overlap the dispatched font diagnostic, whose two selected tests do not include HUD, keyboard or stages (`.github/workflows/oak-font-diagnostic.yml:48`).

- Matching failure in A proves that failure can occur without the helper.
- Failure only in B warrants an order-reversed confirmation before attributing the delta.
- Both passing leaves the original late-suite/runner condition unresolved; it does **not** exonerate the full change or justify timeout inflation.

For an even cheaper **Node 22 CPU discriminator**, run this unchanged, fixed workload on A and B under Node 22.23.3:

```powershell
npm test -- fixtures/riverfall-consumer/riverfall-fluid-simulation.test.ts --testNamePattern "is byte-identical for the same input, seed, numeric mode, and order" --maxWorkers=1 --no-file-parallelism
```

It preserves two simulations of 80 frames with 160 burn-in substeps (`fixtures/riverfall-consumer/riverfall-fluid-simulation.test.ts:153`); its original CI case costs were 11.406s versus 15.635s. Require exactly one executed case and record import versus body time. Cap each invocation at 90s. A stable current-only increase would justify isolating the dependency delta; parity rejects only a persistent slowdown in this workload, **not** full-suite scheduling or the original job deadline.

No files changed, gates run, browser sessions launched, or persistent processes created. This is preliminary investigation, not final review credit.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | Dependency patch is part of the input delta. | Accepted; helper-only causal premise is invalid. | Pin each original lockfile and isolate only after a discriminator justifies it. |
| F1 | Passed-attempt headroom excludes failed keyboard polling and teardown. | Accepted; owner independently checked reporter line122. | Preserve raw failure/teardown spans and describe their separate population. |
| F2 | An isolated passing probe cannot exonerate the full source delta. | Accepted. | Record narrow positive and negative interpretation bounds before each probe. |

## Verification

Owner inspected `tests/testing/browser-timeout-headroom.ts:122` outside the feature diff: only passed results enter consumers; only timedOut results enter killed. The initial immutable raw logs remain unmodified. Offline trace inspection subsequently used the already maintained parser, verified positive/negative controls, and retained six original/retry trace archives; that new probe is recorded in the plan and is not part of this authored review target.

## Round outcome

Accepted as independent preliminary investigation. No source repair, budget increase, screenshot replacement or final code-review approval follows. Current required hosted gates remain unresolved; same-host local controls await a trustworthy machine-wide lease.
