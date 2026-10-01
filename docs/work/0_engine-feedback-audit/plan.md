# Clear the audit prerequisite for renderer feedback

Status: active
Owner: Codex engine-feedback worker
Created: 2026-10-01
Updated: 2026-10-01

## Problem and outcome

Voxel remote CI36666621008 fails the high-severity audit and supply-chain gate on brace-expansion 5.0.9. Clear that inherited release prerequisite before proving or repairing the three renderer comments owned by civ-engine work 71 (E05 curved surfaces, E07 quarter-height dense voxels and E08 single-layer transparency). This work unit ships only the bounded development lock repair, not those renderer capabilities.

## Scope

Base 7b27d70719ca93d6b0ded380240d60f7a082a393, voxel package 1.2.0. Primary main is 9cc3f5da69d3903d06198b2f62a51e4447d91158 with two origin docs-only canon commits and pre-existing modified AGENTS.md. Its exact SHA256 b858acee67d123b6e93f642f1af617f209b27d9c9006f9780b9cd8f05a9687f8 remains preserved. Controller-created voxel-worktrees/engine-feedback-voxel-1001 uses codex/engine-feedback-voxel-1001; only the new node_modules junction was verified/unlinked non-recursively, then private ignore-scripts npm ci passed (145 packages, 4.192 seconds). No primary source, dist, dependencies or game pin is changed. The common allocator created this own registry/placeholder in primary; no other primary docs are owned.

The approved change is one existing development package record, brace-expansion 5.0.9 to 5.0.12. No dependency identities/ranges, manifest, package identity, renderer source, public API, persisted format, Three.js pin, physics, Studio assets or consumer code changes. Vitest 4.1.10 remains exact-pinned and its two moderate audit entries are an explicit bound, not a high gate blocker. AoE2 currently pins voxel commit 08398b573ad54bcb5c764ad0c2ef3cedc3cce33f while locally verified dist is primary 1.2.0; later capability evidence and actual adoption must distinguish those inputs.

## Approach

Use official npm patch metadata and preserve every unrelated lock entry byte-for-byte as a parsed record. Update only version/resolved/integrity of the existing node_modules/brace-expansion record. Current dependency balanced-match ^4.0.2, MIT license, dev flag and Node 20 || >=22 constraint are unchanged by the official fixed release. Private npm ci and fresh full/production audits validate manifest/lock consistency. No broad npm solver or force update is used.

The owner graph is eslint 10.7.0 through minimatch 10.2.5. GitHub advisories identify affected 4.0.0 through versions below 5.0.12 and fixed 5.0.12: [nested-brace stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma-parser stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) and [quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). The first two are high severity; the rewrite is moderate. Production audit has no findings. This dependency-only repair does not claim a renderer runtime or vulnerability-free release.

## Acceptance criteria

- Fresh isolated baseline reproduces one high/two moderate full-tree entries with actual audit exit 1; production audit exits 0 with zero findings.
- Exact lock diff changes only three fields in one existing dev record; all package identities, dependency ranges, engines/license/dev flags and the manifest remain unchanged.
- Official resolved tarball/integrity matches the patched installed package; private clean installation accepts the manifest/lock and no primary inputs drift.
- Full audit exits 0 at high threshold with no high/critical; production stays zero. Remaining Vitest moderate entries are recorded honestly.
- Exact pinned independent read-only supply-chain review resolves material findings; permanent reports bind base, patch and final commit.
- The final actual npm run verify, public/consumer/package/supply-chain/browser checks and applicable work-doc structure checks pass under the single shared heavy slot. Any unrelated failure is freshly diagnosed and reported within repair/scope bounds; no weakened gate.
- Merge to main and push preserve the primary owner's AGENTS bytes and all foreign work; remote complete Node24 Linux/Windows and portable Node22 jobs finish green before root adopts a new voxel pin/dist. No engine rolling release or AoE2 pin changes are performed here.

## Implementation steps

- Reproduce isolated full and production audits, record owner graph and official fixed metadata.
- Apply the single-record three-field repair; prove the full graph difference and private install/audits.
- Obtain an exact pinned independent review while root holds game gate/distribution resources; run no full gate/build/browser meanwhile.
- After root releases the shared heavy slot, run final verify with uniquely owned headless processes and finally cleanup. Correct material findings within approved scope.
- Integrate/push/follow remote acceptance, bind review target to the final revision and close this prerequisite. Later E05/E07 capability fixtures and E08 prototype have separate contracts/work outcomes and remain open in work 71.

## Outcome

The isolated one-record three-field repair is implemented. Private clean installation, fresh full high-threshold audit, production audit and npm run test:supply-chain passed. All 178 package records remain; every unrelated manifest/lock field is unchanged. The official 12,620-byte archive matches the patched SRI, and all 13 installed files match its extracted bytes. Full audit retains two Vitest moderate entries, with no high/critical; production has zero findings. Exact pinned independent review 0 passed with a substantive no-P1/P2 verdict; the actual 757-byte staged diff still equals the preserved review patch. The final thirteen-step npm run verify passed with actual exit 0: 2311 unit tests in 297 files (one test/file skipped), all 135 browser tests, typecheck/lint, three TypeScript compatibility versions, public API and self-check, all packed consumer/worker/Three.js checks, and supply-chain self/full checks. The owned JobObject ran 1283.501 seconds, with cleanupProof true and zero remaining members/leftovers; the shared heavy slot was released. This private lock target remains exactly the independently reviewed 757-byte patch SHA256 507911572dfbf015e4074136646145e9f0752ea1ecc6ba84b96701e217c05e8d. A private commit is authorized; primary integration/push and remote acceptance still await root. No renderer capability proof or game adoption is claimed. Primary source/dist/dependencies and the game pin remain unchanged.