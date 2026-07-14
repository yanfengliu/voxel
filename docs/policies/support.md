# Support, compatibility, and distribution policy

Status: proposed 1.0 policy from 2026-07-13. Version 0.1.4 is a prerelease-quality private package and has only the evidence named in README and the implementation ledger. The broader matrix below becomes a support claim only when its implementation-plan gates are green.

## Target 1.0 support matrix

| Surface | Supported target | Required evidence |
| --- | --- | --- |
| Portable Node entries | Node 22 and 24 on Windows and Linux | Unit/type/build/API/packed-core gates |
| Browser renderer | Chromium with WebGL2 on Windows and Linux | Pinned headless correctness lanes plus named real-hardware runs |
| Three.js | Runtime 0.185.x with matching 0.185 type declarations inside the tested peer range | Packed consumer and single-runtime bundle proof |
| TypeScript declarations | 5.7.3 compatibility floor matching AoE's declared `^5.7` range; Voxel and AoE's current lock at 5.9.3; City lock at 6.0.3 | Exact offline compiler aliases and strict compile fixtures |
| Other browsers | Not supported unless added to the matrix | Dedicated browser, visual, lifecycle, and performance evidence |
| Townscaper | Not a 1.0 runtime consumer while it remains on Three 0.166 and declares a TypeScript `^5.5.3` compatibility floor | Separate dependency alignment and consumer gate |
| GPU performance | Only the named hardware/browser/scene measurements | Recorded environment, correctness, percentiles, and resource metrics |

SwiftShader or another software renderer in CI is correctness evidence, not a hardware frame-time claim. Untested combinations may work but are not advertised as supported.

## Compatibility

- Before 1.0, the package may evolve additive contracts quickly, but every public change still updates the API report, changelog, and relevant migration notes.
- From 1.0 onward, SemVer covers public subpath exports, TypeScript declarations, data-schema literals, operation discriminants, stable result/diagnostic codes, documented ownership, and lifecycle behavior.
- Snapshot-only consumers remain supported throughout 1.x. Deltas, worker meshing, presented picking, transfer ownership, and host-managed frames are opt-in.
- Data schemas have their own literal versions. A package can support more than one schema during a migration; a package minor release does not silently reinterpret an existing schema.
- New optional fields or opt-in APIs are minor releases. Removal or incompatible semantic changes require a major release unless repairing behavior that could never satisfy the documented safety contract.
- Deprecations name a replacement and remain for at least one minor release when safety permits.

## Three.js and browser ownership

- Three remains an optional peer and is externalized from Voxel's build.
- Consumers importing voxel/three install a tested peer and deduplicate linked copies. Release evidence must prove one runtime identity.
- Imports from `voxel/core`, `voxel/meshing`, and `voxel/testing` do not require Three, DOM globals, or a browser. The separate `voxel/meshing/browser-worker` subpath is intentionally browser-only.
- Embedded mode never claims ownership merely because an object was passed to it. Renderer, draw, viewport, camera projection, capture, scene root, lights, controls, and extension leases have explicit ownership.
- Voxel disposes only resources it owns and removes only roots/listeners it created.

## Distribution

The initial 1.0 package remains private. The stable channel is an immutable Git tag or release with:

- the exact npm pack tarball produced from the tag;
- SHA-256 and npm integrity values;
- a package-contents manifest;
- source commit, Node/npm versions, tested Three line, and browser build;
- verification and audit results;
- changelog, migration guide, support matrix, known limitations, and license notices.

Public npm registry publication is a separate product decision. It requires an available and approved package name, repository/bugs metadata, provenance/signing policy, license/notice review, ownership and recovery policy, and an explicit maintenance commitment. The private field is not removed merely to satisfy the 1.0 version number.

## Dependency and security maintenance

- Dependency changes update the lockfile and run runtime-only and full audits.
- A new high or critical finding blocks delivery unless the user accepts a documented exception with owner, rationale, mitigation, and expiration.
- Imported code, generated WASM, shaders, textures, models, and fixtures record source, pinned version/SHA, license, notices, build toolchain, generated hash, and redistribution requirements.
- Security fixes may narrow behavior or reject inputs that were previously accepted when necessary to restore a documented bound. The changelog explains the compatibility impact.

## Support lifetime

Until a public maintenance policy is explicitly adopted, only the latest private 1.x minor receives fixes. A new minor does not invalidate older immutable artifacts, but no indefinite backport promise is implied. Critical fixes identify affected tags and replacement versions in release notes.

## Claim discipline

A matrix cell becomes supported only after its named clean-install, compile, unit, browser, lifecycle, and artifact evidence exists. Local success on one machine, a pleasing screenshot, or a peer version range by itself is not a support claim.
