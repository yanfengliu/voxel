# Owned Voxel worker retention and disposition

Status: read-only preparation complete; no archive, runtime, test, controller call, unlink, removal, Git mutation or source edit performed. Prepared 2026-11-09 local date. The metadata files were written at approximately 2026-11-10T03:24:54–56Z. This packet is an inventory and proposed disposition, not a cleanup authorization or retention receipt.

Scope is exactly `C:/Users/38909/Documents/github/voxel-worktrees/engine-feedback-voxel-1001`. The original work-0 plan identifies this as the controller-created tree for the engine feedback audit, with private dependencies. The `voxel-disclose`, `voxel-hudfont`, and `voxel-probe` trees are foreign and outside this packet. The primary Voxel checkout is read-only input, never a cleanup target.

## Current source state

The worker is on `codex/engine-feedback-voxel-1001`, HEAD `5d6d4c911c6d05b62a5a81ad62f05993cf44e9de`. Its HEAD is an ancestor of primary `main`. Primary HEAD, local `main`, and local `origin/main` all resolve to `8db1c16c60a712004dd1c5d9f6c9a43bea916bf9`; no fetch or remote query was performed, so the remote-tracking equality is local evidence only.

There are 19 dirty paths: seven modified tracked files and twelve untracked files. The index lists 1,112 entries, with no staged diff. `worker-git.json` preserves the full status/index, HEAD, branch, and literal Git pointer. `source-parity.json` records SHA-256 and exact comparison of all 19 small authored source/document paths against current primary bytes. No raw runtime-evidence payload was hashed.

Of the 19 paths, only the 170,188-byte `fixtures/oak-ecosystem-consumer/fonts/SourceSans3VF-Upright.woff2` is byte-identical to current primary. Its SHA-256 is `5f16566f7a40d39b339ad26be151fa5a1ab1f0c2574c7a2e619765584a1acbd8`. Seven modified files differ from current primary; eleven untracked paths do not exist there. These are genuine unshipped records and private diagnostic source, not an empty dirty checkout.

The modified files are the work-0 plan, work-1 design/plan, work-2 design/plan, and two oak browser callers. The untracked files are the paired-font helper/test, its review-3 summary and seven frozen review snapshots, the private font license, and the font asset. The two caller diffs add an import and guarded `OAK_FONT_AB === '1'` call. Current primary has evolved separately; do not apply old whole-file copies onto main.

## Delivered work versus private work

| Work | Source-grounded disposition |
| --- | --- |
| Original engine-feedback audit | The lock-only brace-expansion fix was delivered in `1230be1`; this did not add renderer APIs. Original audit, bootstrap, review and failure artifacts remain evidence to retain. |
| Portable oracle/CI work | Oracle matcher work was delivered in `6e28629`. The 530 warm/cold comparison recorded 162.873 to 126.815 seconds, a single instrumented comparison rather than a general performance promise. The original complete local gate recorded 2,369 unit and 135 browser tests with one existing skip. |
| Original opt-in font observer | The six-path read-only observer and its final shipping record are represented by worker HEAD `5d6d4c9`, which is contained in main. Its original local gate recorded 2,412 unit and 135 browser tests. The hosted two-OS dispatch `36863735290` accepted actual Ubuntu DejaVu identity but retained the original pixel failures; Windows failed/cancelled before completed checker/upload, so it did not prove hosted Windows font identity. |
| Production font fix | Current main contains `8ba2f25` (bundled font), `7812f99` (Linux CI `42300848349`, all 137 browser tests passed), and `cb14894` (Adobe 3.052R provenance and byte test). These are delivered historical results read from repository records; no new CI run or test was performed. |
| Private paired-font experiment | Uncommitted helper/test, two guarded callers, source review and snapshots remain only in this tree. Review 3 is SOURCE PASS, with four explicit runtime limitations FP-R0-L01–04. This is not native DOM/FontFace, pixel, cross-platform, package-enumeration, full-gate, commit, push, or adoption acceptance. No independent record says this candidate was rejected; do not relabel it rejected. |
| Later renderer-sharing/timing work | Main contains later sharing work and its own recorded timing limits. Those inherited CI headroom/Windows-timeout issues are outside this cleanup; this packet neither repairs nor accepts them. |

The final private helper hash recorded by its source review is `42c20b86df7ccf9bedb35a7a516e069b8623abd969314826be86c4bf89fc955c`; fixture hash is `ccbcd03711e219cc6e2474a23da31bf85e992fbf1cc5db9adf2804279899d842`. The earlier helper had 30 mocked fixture passes; the final repair ran only nine affected cleanup/error cases, with 21 deliberately filtered, plus type/lint success. Preserve that distinction. Review 3's original 14,276-byte report is retained among the untracked snapshots and in raw review evidence; its recorded hash is `9bc81286d9c8651c089a210240f0fa9e3e9ae73c0d2790a2c00f168c24adaccd`.

Recommended root disposition: preserve the private paired-font experiment as superseded diagnostic work after accepting the already delivered production fix, without starting new renderer work or claiming the private experiment passed native acceptance. If root still intends to ship the private experiment, this tree cannot be discarded as completed work and its stated runtime acceptance remains open. The choice must be explicit; this read-only packet does not silently abandon it.

The private `fonts/LICENSE.md` is absent from current primary and uses the older 2010–2022 Adobe notice. Current primary's tested folder is exactly `OFL.txt` plus the WOFF2, with the corrected 2023 Adobe provenance. Preserve the private license as historical evidence; do not transplant it into the current font folder.

## Canonical record gap

Current main's work-2 plan is still 56 lines and marked active with old pending dispatch/source wording. The worker has additional historical acceptance and paired-font checkpoints in work-0/1/2 records plus a source-only review absent from main. Main's later production-font records do establish delivery, but they do not make the worker's dirty documents byte-redundant. Before removal, root should either record a concise canonical closeout with the superseded/private limitations and retained archive location, or explicitly preserve these private historical documents in the verified archive and acknowledge the canonical gap. This assignment does not edit Voxel docs or reopen the runtime criteria.

## Finite retention selection

`retention-selection.json` lists exactly 3,175 ordinary files totaling 424,222,063 bytes. It keeps the authored working tree, private experiment and snapshots, all original raw reviews, all `output/` captures and observer reports, and all task `tmp/` evidence including original archives, extracted artifacts, frozen source/runtime bindings, failures, successful checks, timings and mutation-control records. Nested evidence directories are never removed merely because their names resemble a build/cache directory.

The metadata census saw 3,177 non-root-cache ordinary files totaling 511,195,919 bytes and no filesystem links. It also saw 6,695 ordinary root dependency/build/cache files totaling 192,144,928 bytes, no Git-admin links, and no Git-admin `locked` marker. These are observations at census time, not proof that the worker stays idle or unchanged.

Only these items are excluded from the ordinary payload selection:

1. Ordinary files beneath root `node_modules/`, `dist/`, `coverage/`, and `.vite/` (6,695 files, 192,144,928 bytes), as reproducible dependency/build/cache output. No equivalent nested evidence path is excluded.
2. Exactly `tmp/engine-feedback/node22-tool/v22.23.3/node.exe` (86,973,768 bytes). Its retained `verified.json` binds official Node URL, version, byte length and SHA-256 `9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e`; `SHASUMS256.txt` is also selected. The downloaded executable itself is reproducible. No other runtime-bound historical artifact is excluded.
3. The 88-byte live `.git` pointer is recorded literally in `worker-git.json` rather than recreated as an operational archive checkout pointer. The archive must retain this metadata, full index listing and current source bindings.

Selected evidence includes the entire original `audit` directory (129,346,872 bytes), `font-shipping-1001` (121,836,583), `ci-cost` (108,448,026), private `font-pair` (1,392,544), all three raw review-run families, and `output` (24,389,955). Original archive bundles and extracted files both remain selected; no deduplication or “success-only” filtering is proposed.

## Preconditions for a later controller cleanup

Root must first accept the private-work disposition and independently review this exact selection. The source and metadata must be rechecked when the shared hash lane is idle; no background process or owner may still rely on this tree. Refresh root/ancestor/device/Git-admin/no-follow link state and exact Git/source bindings, and stop on any change. The present no-link snapshot does not authorize blindly skipping a fresh link census.

Copy the selected ordinary files to a fresh, exclusively created archive using an already reviewed mechanism adapted and reviewed for this exact tree. Verify source and archive byte hashes, exact selected paths/lengths, source stability, staged/current bindings and the resulting receipt. Retain this packet and all metadata alongside that receipt. This packet is not an executor and does not authorize reusing an AoE retention script with invented roots or destination arguments.

Only then consider the unchanged controller's dry run and removal for this exact registered tree, using its dirty-worktree contract because the 19 paths remain dirty. The generic AoE controller inspected in the earlier cleanup task supports exact merged dirty-worktree removal with `--discard-changes`; it performs its own containment, link and registration checks. Its availability and identity must be revalidated by root at execution time; no Voxel-local controller was found in the bounded current policy/script search. Never substitute manual recursive/force deletion, and never change the controller merely to get cleanup through. Any refusal is a stop-and-inspect condition.

Current worker HEAD ancestry alone does not prove the dirty paired-font work was shipped or archived. No additional test, gate, browser attempt, source adoption or final-game shipment is a prerequisite for retaining the existing bytes; successful archive verification and an explicit disposition are prerequisites for discarding them.

## Read-only inputs and limits

Read current primary `AGENTS.md`, `docs/policies/local-rules.md`, `docs/policies/rules/concurrency-and-commits.md`, `docs/policies/rules/evidence-and-searches.md`, `docs/learning/lessons.md`, current devlog, design section map, current work-5/7 records, relevant historical commits, original worker work-0/1/2 records and review-3 source snapshots. Frozen raw evidence contents and payload hashes were not revalidated; historical runtime results above are repository-record claims, not newly rerun verification.

`collect-readonly.ps1` is a fixed-root metadata collector, not a cleanup/retention executor. Its first invocation stopped before writes because a function name shadowed native Git; the name was repaired and the single successful inventory wrote the three JSON files exclusively. No execution helper, archive copier, unlinker, or removal script was created for this task.
