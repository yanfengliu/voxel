# Supply chain and artifact record

Status: updated 2026-08-04 against `voxel@1.0.0`.

This is the E-05 record: what this package redistributes, under what terms, and
which checks hold each claim. Every figure here is produced by
`npm run test:supply-chain`, which runs inside `npm run verify`. Nothing below
is asserted by hand.

## What the tarball redistributes

**No third-party code.** The package declares zero runtime dependencies. That is
the load-bearing fact this whole record rests on: the published tarball contains
only this repository's own emitted ESM and declarations, so there is no upstream
code to attribute, no upstream notice to carry, and no transitive runtime tree to
audit. `test:supply-chain` pins the count at zero, because adding a runtime
dependency is a licensing decision rather than an implementation detail and
should fail a gate rather than surface at release.

`three` and `@types/three` are **optional peer dependencies**. The consumer
installs and owns them; this package never bundles or re-exports Three.js source.
The gate pins both the peer relationship and its optionality, since a portable
consumer of `voxel` and `voxel/meshing` must be able to install neither.

## Licensing

This package is MIT (`LICENSE`). No file in `src/` carries a third-party
copyright notice, an SPDX header, or an "adapted from" attribution, because no
external source was vendored.

The mesher is original work. The selection ADR records that no external candidate
reached benchmarking, so `voxel.greedy-opaque` carries no upstream provenance or
redistribution obligation. There are no imported shaders, textures, models, or
sample assets, and therefore no asset licenses to track. A sibling repository's
asset is not automatically appropriate for a reusable engine package; if one is
ever imported, its source, version, license, and redistribution terms belong in
this document before it ships.

The 14 direct development dependencies tabulated below are MIT or Apache-2.0, and none of them is redistributed. The gate sweeps wider than that table: it checks every installed package — 145 of them on the machine this was last run against — and fails on an unknown or non-permissive license. Three build-time-only packages sit outside the permissive set and carry recorded exceptions naming their exact declared license, so a version that relicenses fails the gate rather than inheriting an old exception: `lightningcss` and whichever one of its eleven platform binaries the machine installed, both MPL-2.0, and `minimatch`, BlueOak-1.0.0. None of the three is redistributed either, because the packed tarball carries only `dist`. `@dimforge/rapier3d-compat` is used only by the headless Machine Works and Windmill consumer fixtures to generate committed numeric pose replays through their shared fixture-private exact-sidecar adapter; `src/`, `dist`, and the package tarball do not import or include its JS/WASM implementation. Its source is the npm registry package locked at `0.19.3`, its declared license is Apache-2.0, the lockfile records registry integrity, and generation tests bind each trace to SHA-256 input and final hashes.

| Dependency | Version | License |
| --- | --- | --- |
| `@dimforge/rapier3d-compat` | 0.19.3 | Apache-2.0 |
| `@eslint/js` | 10.0.1 | MIT |
| `@playwright/test` | 1.59.1 | Apache-2.0 |
| `@types/node` | 22.14.1 | MIT |
| `@types/three` | 0.185.0 | MIT |
| `eslint` | 10.7.0 | MIT |
| `globals` | 17.7.0 | MIT |
| `three` | 0.185.1 | MIT |
| `typescript` | 5.9.3 | Apache-2.0 |
| `typescript-5-7` (`typescript@5.7.3`) | 5.7.3 | Apache-2.0 |
| `typescript-6-0` (`typescript@6.0.3`) | 6.0.3 | Apache-2.0 |
| `typescript-eslint` | 8.63.0 | MIT |
| `vite` | 8.1.4 | MIT |
| `vitest` | 4.1.10 | MIT |

## Audits

Both audits npm supports run on every `verify`, and both reported zero findings on 2026-08-04 at `voxel@1.0.0`:

- **runtime-only** (`npm audit --omit=dev`) — the surface a consumer actually
  installs. With no runtime dependencies this is necessarily empty, which is the
  point.
- **full** (`npm audit`) — the development surface, which can still compromise a
  release through the toolchain that builds it.

That run followed one that did not. Earlier the same day the full audit blocked on GHSA-rgw5-rvv9-x895 against a `brace-expansion` the tree had carried unchanged since 2026-07-31: a newly published advisory, not a dependency change. This is the closing note below happening rather than an exception to it, and it is why the date above is a fact about one run and not a property of the tree.

High and critical findings block. `npm audit` exits non-zero whenever it finds anything at all, so its exit code cannot distinguish "vulnerable" from "failed to run"; the gate parses the JSON report and treats a missing report as the real failure. [The support policy](../policies/support.md) permits a documented exception for a blocking finding, carrying owner, rationale, mitigation, and expiration; that is deliberately not a command-line flag, so granting one means editing the severity list in a reviewed commit.

## Artifact inspection

These gates already existed and are listed here because E-05 requires the
inspection, not a second implementation of it:

- **Packed contents and size** — `test:core-only-package` bounds the tarball to
  emitted ESM and declarations under hard 350,000-byte packed and 1,700,000-byte
  unpacked ceilings.
- **Source maps** — map files and directives are disabled, so the tarball is
  self-consistent and ships no path from a developer's machine.
- **Declarations** — `test:api` pins a hash per public declaration, so a change
  to the public surface cannot land unreviewed.
- **Worker URLs** — `test:mesh-worker-package` resolves and imports the packed
  worker offline, without Three.js, proving the packaged worker needs no network
  and no renderer.
- **Three externalization** — `test:three-package` resolves `voxel/three`,
  `three`, and `@types/three` in one consumer and typechecks them, proving Three
  is external to the build and that exactly one runtime instance is present.

## Reproducing

```
npm run test:supply-chain
```

Expected output at `voxel@1.0.0`:

```
[supply-chain] 0 runtime dependencies; @types/three and three optional peers; 14 direct dev dependencies and all 145 installed packages permissively licensed (3 recorded build-time exceptions); runtime-only audit 0 findings, full audit 0 findings, none high or critical
```

Which `lightningcss` platform binary is installed is machine-dependent — npm installs exactly one of eleven, chosen by the machine — so a Linux run covers a different binary than the Windows run above. The figures here were measured on Windows; the gate recomputes them on every run rather than comparing against anything recorded here.

Re-run before any release candidate. The audit result is a claim about a moment in time: advisories are published against versions that have not changed, so a green audit at `1.0.0` says nothing about the same tree next month, which is why this runs in `verify` rather than being recorded here once.
