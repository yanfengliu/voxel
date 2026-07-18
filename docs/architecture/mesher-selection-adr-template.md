# ADR template: production voxel mesher selection

Status: template. V-09's accepted record is [mesher-selection.md](mesher-selection.md); copy this file for any future mesher ADR and replace every bracketed field.

## Decision record

- ADR: `[number and slug]`
- Date: `[YYYY-MM-DD]`
- Deciders: `[names]`
- Selected candidate: `[candidate or maintained in-repo implementation]`
- Engine commit: `[full SHA]`
- Corpus version: `voxel testing mesher corpus V1`

## Context

The synchronous visible-face implementation is the correctness oracle, not the production
selection by default. This ADR compares production candidates behind the frozen pure mesher
contract. It does not change simulation ownership, chunk semantics, worker scheduling, or the
WebGL2-through-Three backend decision.

## Candidate provenance

Complete one row per candidate before running measurements.

| Candidate | Source URL | Version/tag | Source SHA | Toolchain and version | Lockfile hash | License | Notice/redistribution files | Generated artifact hash |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `[name]` | `[URL]` | `[version]` | `[SHA]` | `[toolchain]` | `[SHA-256]` | `[SPDX]` | `[paths]` | `[SHA-256]` |

An entry with unknown provenance, an incompatible license, incomplete notices, or an
unreviewable generated artifact is disqualified rather than conditionally accepted.

## Hard correctness gates

Every candidate must pass all gates. A faster candidate with one failure is disqualified.

- The complete frozen corpus passes: empty, solid, hollow, checkerboard, staircase, stripes,
  negative-coordinate, all-neighbor, seeded-random, AoE-like, City-like, column, and
  worst-output.
- Oriented unit-face coverage equals the occupancy truth independent of greedy quad layout.
- Chunk seams and all declared dependency/halo cases match the oracle.
- Winding is outward; normals are finite signed axis vectors; indices are in range;
  triangles are nondegenerate and axis-aligned.
- Palette and any declared material attributes are preserved with no mixed-attribute face.
- Positions are source-local integer voxel boundaries and reported bounds are exact.
- Output is byte-deterministic for identical canonical input across repeated runs and all
  supported environments.
- Input, output, attribute-byte, unit-face, vertex, index, total-byte, meshing-work, and
  result-validation budgets fail closed.
- Malformed, stale-identity, truncated, oversized, and detached worker results are rejected by
  the shared hard result validator before GPU allocation.

Record the exact command, seed, result artifact, and engine/candidate SHA for every gate.

## Reproducible build gates

- The source and all transitive build inputs are pinned by version and cryptographic hash.
- A clean offline build succeeds from the recorded source archive and lockfiles without
  downloading unrecorded inputs.
- Two clean builds in isolated directories produce the same packaged worker bytes and hash, or
  every documented nondeterministic byte is normalized by a reviewed reproducible step.
- The complete build command, OS/container image, compiler/runtime versions, flags, and any
  patch set are recorded below.
- Generated sources are either committed with provenance or reproducibly regenerated; opaque
  local binaries are forbidden.

Reproduction command and environment: `[exact command and environment manifest]`

## Package and runtime gates

- The worker and support files load from the packed tarball using an installed-runtime-relative
  module URL, with no development-tree path or runtime network fetch.
- The core and meshing entry points remain free of DOM and Three.js imports; Three remains an
  external optional peer with one runtime copy in the Three-shaped fixture.
- The module worker path passes the supported CSP and offline packed-consumer tests.
- Packed declarations, source maps, licenses, notices, and worker artifacts are present and
  point only to shipped files.
- Added compressed and unpacked bytes do not exceed the predeclared budgets below.
- Rejected experimental dependencies, build outputs, patches, and notices are removed before
  landing the decision.

| Budget | Baseline | Maximum accepted | Candidate result |
| --- | ---: | ---: | ---: |
| npm tarball compressed bytes | `[bytes]` | `[bytes]` | `[bytes]` |
| npm tarball unpacked bytes | `[bytes]` | `[bytes]` | `[bytes]` |
| worker compressed bytes | `[bytes]` | `[bytes]` | `[bytes]` |
| cold worker initialization p95 | `[ms]` | `[ms]` | `[ms]` |

## Performance protocol and selection rule

Use the same named hardware/browser/OS, viewport, DPR, worker count, injected scene seed,
warm-up, sample count, and correctness check for all candidates. Record cold initialization,
algorithm p50/p95/max, queue-plus-transfer latency, output bytes, peak CPU/GPU staging memory,
package bytes, and end-to-end accepted-to-presented latency.

The production-shaped scenes are fixed before measuring:

1. `[AoE-like scene, revision and budget]`
2. `[City-like scene, revision and budget]`
3. `[boundary-edit or combined scene, revision and budget]`

An external candidate qualifies only if it:

1. passes every correctness, reproducibility, license, build, package, and runtime gate;
2. improves combined named-scene end-to-end presentation cost by at least 30 percent on at
   least two of the three production-shaped scenes;
3. regresses no named scene by more than 10 percent; and
4. remains within every predeclared package and memory budget.

These thresholds are not changed after measurements are visible. On a qualifying tie, select
the narrower dependency and simpler reproducible toolchain. If no external candidate
qualifies, select a maintained in-repo production implementation only after it passes the same
gates. The synchronous oracle is not silently relabeled production-ready.

## Results

| Candidate | Correctness | Reproducible/license | Package/runtime | Scene 1 | Scene 2 | Scene 3 | Peak staging | Qualifies |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `[name]` | `[pass/fail + evidence]` | `[pass/fail]` | `[pass/fail]` | `[%]` | `[%]` | `[%]` | `[bytes]` | `[yes/no]` |

Raw evidence index: `[durable paths and hashes]`

## Decision and consequences

Decision: `[selection and exact reason under the predeclared rule]`

- Accepted dependencies/artifacts: `[list]`
- Required license/notice changes: `[list]`
- Rejected candidates and gate that disqualified each: `[list]`
- Experimental dependencies/artifacts removed: `[list plus clean-worktree evidence]`
- Follow-up integration and rollback plan: `[work items]`
- Known limitations that remain unsupported: `[list]`
