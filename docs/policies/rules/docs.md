# Docs

One of [voxel's local rules](../local-rules.md).

Voxel-only as of the 2026-08-05 canon cut, which kept `Write prose one line per paragraph` as house style and dropped the rest of `Docs are part of the change` as derivable. Voxel keeps the whole rule, because `README.md` is capability-oriented here and an automatic README edit works against that.

- Docs are part of the change: update every affected surface in the same commit; affected surfaces do not automatically include `README.md`; never reference or mandate files that don't exist.

- Quantified, exhaustive, and causal claims require durable executable proof at the same scope as the prose (owner rule, 2026-08-02). A reviewer assertion, a plausible mechanism, a partial sweep, or a count of candidates exceeding one threshold is not proof for “every,” “only,” “failed on this gate alone,” or an exact causal attribution. Preserve a deterministic counterexample, reviewed fixed fixture, reviewed deterministic proof input or proof generator, or the generator or command plus concise reproducible provenance that can refute the claim when it regresses, and narrow the prose to what that input or procedure actually establishes. Every retained input follows the fleet promotion and Git-blob-size rules; raw task-run measurements remain ignored local evidence and are deleted when no active task, process, reviewer, or documented local workflow needs them.
