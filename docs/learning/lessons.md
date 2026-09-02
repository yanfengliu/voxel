# Lessons

A queue, not a destination.

A lesson lands here the session it is learned, anchored in [lessons-evidence.md](lessons-evidence.md) to a measurement, a commit or a test id, and **naming the gate it is waiting for**. It is deleted in the commit that lands that gate, because from then on a machine reads every line and nobody has to. An entry that can name no gate is not a lesson: fleet-wide knowledge is staged in [canon-candidates.md](canon-candidates.md), repo-only knowledge goes to [../policies/local-rules.md](../policies/local-rules.md), and the rest is folklore and is dropped.

Every entry costs every session in this repository the time to read it, so the gate comes as early as it can be written, and an entry that has been sitting here is a thing that failed to graduate rather than a thing worth keeping.

`tests/testing/lessons-pairing.test.ts` holds the shape: a rule has an entry, an entry has a rule, and a rule names the gate it waits for.

On 2026-09-02 this file held 42 rules. Ten were already gated and were mutation-proved before deletion, five had gates written for them, nineteen were promoted to `canon-candidates.md`, two moved to `docs/policies/local-rules.md`, and three were dropped. The proofs are in [gate-proofs.md](gate-proofs.md). What remains below is what could not honestly be deleted.

## Solver rate and contacts

- Anything expressed in ticks is expressed in the rate, and silently means something else the moment the rate moves. ([evidence](lessons-evidence.md#a-sampler-denominated-in-ticks-is-a-second-variable)) — **waiting on:** a scan in `tools/studio/solver-rate.test.ts` that fails an authored tick window in product code the way it now fails a respelled rate. Blocked on `MACHINE_WORKS_TICKS`, which authors the whole Machine Works schedule in ticks: the scan would be red at birth, and moving that schedule to seconds is a piece of work rather than a gate.

## Live scenes

- Sampling limits are the ceiling on how fine a moving pattern can be: past a few samples per cycle, neighbours disagree and the field reads as noise. ([evidence](lessons-evidence.md#the-tile-pitch-is-the-ceiling-on-the-wavelength-and-it-had-none-to-spare)) — **waiting on:** a mutation proof for `tools/studio/riverfall-flow.test.ts` "moves every reach legibly without checkerboard discontinuities". The gate exists and is real, but it reads the byte-pinned generated replay, so shortening the wavelength in `riverfall-fluid-config.ts` trips the provenance guard instead of the p95 adjacent-cell gate. Proving it needs a fixture regeneration, which is what the gate is there to make expensive.
- A comparison between a moving thing and a still one measures the movement; when several cases return the same number, that number is what they share, not what distinguishes them. ([evidence](lessons-evidence.md#a-visual-gate-measured-the-sails-and-four-variants-agreed-to-four-decimals)) — **waiting on:** a case in `tests/browser/model-studio-windmill-assets.spec.ts` that compares the eight judged changed-fractions *to each other* and fails when they agree. Zeroing a relocation delta already makes the existing per-variant proof go red, but dropping `holdStill` — the actual defect — leaves it green, because its assertion is a lower bound on change and motion only adds change.
