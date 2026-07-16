# Supply chain and artifact record

Status: recorded 2026-07-15 against `voxel@0.1.4`.

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

Development dependencies are MIT or Apache-2.0 and are not redistributed. The
gate checks each declared license against an allowed permissive set and fails on
an unknown or non-permissive one.

| Dependency | Version | License |
| --- | --- | --- |
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

Both audits npm supports run on every `verify`, and both report zero findings at
`voxel@0.1.4`:

- **runtime-only** (`npm audit --omit=dev`) — the surface a consumer actually
  installs. With no runtime dependencies this is necessarily empty, which is the
  point.
- **full** (`npm audit`) — the development surface, which can still compromise a
  release through the toolchain that builds it.

High and critical findings block. `npm audit` exits non-zero whenever it finds
anything at all, so its exit code cannot distinguish "vulnerable" from "failed to
run"; the gate parses the JSON report and treats a missing report as the real
failure. AGENTS.md permits a documented, expiring exception for a blocking
finding; that is deliberately not a command-line flag, so granting one means
editing the severity list in a reviewed commit.

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

Expected output at `voxel@0.1.4`:

```
[supply-chain] 0 runtime dependencies; @types/three and three optional peers;
13 dev dependencies all permissively licensed; runtime-only audit 0 findings,
full audit 0 findings, none high or critical
```

Re-run before any release candidate. The audit result is a claim about a moment
in time: advisories are published against versions that have not changed, so a
green audit at `0.1.4` says nothing about the same tree next month, which is why
this runs in `verify` rather than being recorded here once.
