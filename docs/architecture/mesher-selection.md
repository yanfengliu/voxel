# Production mesher selection

Status: provisional integration decision, 2026-07-14. The algorithm and supply-chain gates are complete. Final production acceptance remains contingent on V-08 revision-atomic worker presentation and the browser/end-to-end measurements named below.

## Decision scope

This decision covers the opaque, palette-indexed, axis-aligned chunk mesher behind the frozen `PureVoxelMesherV1` contract. It does not change simulation ownership, chunk semantics, worker scheduling, presentation atomicity, or the WebGL2-through-Three backend.

The synchronous visible-face implementation remains the correctness oracle. The in-repository `voxel.greedy-opaque` implementation is selected for production-path integration because it passes the frozen contract without adding a toolchain, runtime dependency, license obligation, or opaque artifact. It is not called production-complete until V-08 and the final measurement protocol pass.

## Thresholds fixed before final integration measurements

The following limits are fixed for the V-08/V-09 rerun. They must not be relaxed after those results are visible.

| Budget | 2026-07-14 candidate baseline | Maximum accepted |
| --- | ---: | ---: |
| npm tarball compressed bytes | 203,337 | 350,000 |
| npm tarball unpacked bytes | 980,685 | 1,700,000 |
| installed worker module closure, gzip | 21,162 across 20 modules | 120,000 |
| cold module-worker initialization p95 | to be measured by V-08 harness | 100 ms |
| job-owned input plus validated output staging | contract-bounded | 72 MiB per active job |

The existing external-candidate rule remains: at least 30 percent lower end-to-end accepted-to-presented cost on two of the three named scenes, no scene regression above 10 percent, and every correctness, reproducibility, package, memory, and runtime gate must pass.

## Candidate provenance and feasibility

| Candidate | Source/version | Source SHA | Build inputs | License | Result |
| --- | --- | --- | --- | --- | --- |
| Voxel in-repo greedy | repository source, contract version 1 | `8764ecd52d2940ffe09de093448aae62b1171ec777605044c069fbc87c8c9806` for the measured source | TypeScript 5.9.3 and package lock `fc30500fe2344b69856bb999713a6cdd525c8649e658dc9cfb40a86ba21cdaad` | repository MIT | selected for V-08 integration |
| [Voxelize](https://github.com/voxelize/voxelize) | `main` inspected 2026-07-14; WASM mesher package 1.0.0 | `44fd97543626f30abbee47d8fe12a02cc012a28e` | stable Rust, Cargo workspace, `wasm-pack`, pnpm, and project-specific core/block registry; pnpm lock SHA-256 `0b4464f115c5facbd8b9f1a5c4bf96fb60cd20393df4212ece91cc98a13e477d`; no committed Cargo lock at inspected root | MIT; license SHA-256 `f2479e663260f1d34a79a80b202147099a27a6ba94c5b0bdee4a3edc13220fdf` | rejected before benchmarking: not a contract-compatible mesher artifact and fails the pinned transitive Cargo-input gate |
| [block-mesh-rs](https://github.com/bonsairobo/block-mesh-rs) | crate 0.2.0 at inspected `main` | `6194e3580f826eefcc905dfa2386460a403396f7` | Rust 2021 crate with unpinned semver dependencies and no committed lock; `Cargo.toml` SHA-256 `878013e00a6c6fdbb8c7886420d9b5f43fa9061a806f0f1a17594f819ceb9553` | MIT OR Apache-2.0 | rejected before benchmarking: no browser/WASM artifact or bridge and fails the pinned transitive-input gate |

The local feasibility audit had Rust 1.94.0, Cargo 1.94.0, and pnpm 11.7.0. `wasm-pack` and `protoc` were absent. Installing them would not repair either reproducibility failure, so no external build artifact or dependency was added to Voxel.

## Correctness gates

The candidate is covered by `tests/meshing/greedy-opaque-mesher.test.ts` and the shared hard result validator:

- all 13 frozen fixtures match independent oriented unit-face occupancy truth;
- output is byte-stable across repeated identical calls;
- outward signed axis normals, winding, index bounds, exact local bounds, and palette attributes pass the shared validator;
- a solid 4 x 4 x 4 chunk becomes six quads, 24 vertices, 36 indices, and 12 triangles while retaining 96 exposed unit faces;
- palette boundaries are not merged;
- borrowed sample data remains unchanged; and
- output and deterministic work limits fail closed.

Command:

```text
.\node_modules\.bin\vitest.cmd run tests/meshing/greedy-opaque-mesher.test.ts tests/testing/mesher-corpus.test.ts
```

Result: 2 files and 9 tests passed on 2026-07-14. The focused ESLint gate and package build also passed.

## Algorithm baseline

The committed baseline is [windows-i9-13900kf-algorithm-baseline.json](../../fixtures/meshing/windows-i9-13900kf-algorithm-baseline.json). It is explicitly a pure-algorithm measurement, not an end-to-end presentation claim. The harness warms each implementation for 250 calls, then alternates candidate order over 40 samples of 50 calls on Node 24.12.0, Windows 10.0.26100, and an i9-13900KF. It proves the full corpus before timing.

| Scene | Candidate p50 time | Candidate p95 time | Output bytes | Triangles |
| --- | ---: | ---: | ---: | ---: |
| AoE-like | 1.3% lower | 9.4% lower | 49.3% lower | 49.3% lower |
| City-like | 40.4% lower | 40.4% lower | 71.5% lower | 71.5% lower |
| Worst-output checkerboard | 17.2% lower | 23.0% lower | unchanged | unchanged |

Reproduction command, after a clean build:

```text
npm run benchmark:meshers
```

The baseline was captured from a clean detached worktree at commit `184ced8c3f9b561ff1fdd4e1111dd42bb2f5661f` and tree `c13bfcb603bb75e24daa95a813de1ca6f1ce399c`. The report records `workingTreeDirty: false`, `dirtyRunAuthorized: false`, `sourceHashMode: canonical-git-blobs`, exact hashes for seven key source inputs, and built-module-tree SHA-256 `fa18780db20d358b48740481cbc2d2dbf220c048cce97bfa74330e9cb560d75c`; the commit and tree identify the complete repository state. A repository test re-hashes those committed inputs and checks the reported protocol and metric math. All three scenes improved in this pure-algorithm run, but only the final V-08/V-09 end-to-end rerun can satisfy the production selection rule. The final release measurement must run again from the immutable RC commit.

## Package baseline

`npm pack --dry-run --json --ignore-scripts --cache tmp/npm-cache` reported 233 entries, 203,337 compressed bytes, and 980,685 unpacked bytes after the candidate worker build. The offline package verifier traced the installed entry's complete static module closure: 20 modules, 104,424 raw bytes, and 21,162 gzip bytes. The package contains no source maps or dangling source-map directives. No external dependency, WASM artifact, generated source, notice, or patch was retained.

## Remaining production gates

V-08 must integrate the selected descriptor into the packaged worker path and prove:

- every completion order commits a whole revision at one frame boundary;
- stale, cancelled, failed, and prior-epoch output never becomes presented;
- GPU allocation, swap, render, loss, abort, and restore preserve the last displayed revision;
- the worker package remains CSP-compatible and offline-loadable; and
- the named browser harness records cold worker p95, queue plus transfer latency, accepted-to-presented latency, staging high-water marks, package closure bytes, and structural parity.

If any gate fails, the runtime falls back to the visible-face oracle while the candidate is corrected; the public mesher contract and canonical data model do not change.

## Consequences

- Accepted dependency/artifact: none; only reviewed TypeScript source inside Voxel.
- License/notice change: none.
- Rejected artifacts removed: Voxelize and block-mesh-rs inspection clones are temporary and are not package inputs.
- Known limitation: opaque, axis-aligned palette faces only. Transparency-aware merging, ambient occlusion, arbitrary block models, LOD, and material-specific merge semantics remain outside 1.0 unless separately specified and proven.
