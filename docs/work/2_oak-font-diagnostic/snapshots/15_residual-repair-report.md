# Residual recovery attempt 2: focused repair review

Verdict: bounded source acceptance; no material findings in the exact repaired packet and external wrapper. The declared repair preserves the previously reviewed cleanup boundaries and acceptance conjunction. This verdict is source-only, not an executed recovery result or a grant of another native game proof. Review lane: native Astra / xhigh as assigned; no dual-CLI review was performed.

The original controller retirement remains the separately recorded native-1 long-path failure. Residual attempt 1 also remains failed: actual helper native 1 before its run directory existed. Attempt 2 is prepared and unexecuted at the reviewed existence check. Earlier authored interpretation and implementation reports remain preserved, not rewritten into success records.

## Exact reviewed inputs

New packet `C:/Users/38909/Documents/github/civ-engine/tmp/voxel-residual-recovery-2-1111/packet.json` SHA-256 is `cd5ba5eed378fad1615b39e75bc4bb90d5433981741882e5478687b89887541c`. All 22 sealed members independently match their lengths/hashes. All 13 `prior-attempt/` members also match their original paths byte-for-byte. The external wrapper and post-seal binding record are included in this review separately from that seal.

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| recover.mjs | 22013 | 37b9d87482557a15de78f475f5b4b810637caefd8730ef1e800df60af40caf04 |
| process-check.ps1 | 1755 | 808e4fcfdfca816c84344c05de4c370f01c3de07c79da08857b9b1ea03df6829 |
| external run-voxel-residual-2-1111.ps1 | 6076 | 568b82050080aabbcc3787c589d06e3816ba4b92581568773d6105e07facca49 |
| root-path-fixture.mjs | 3823 | 4e32e9256d42ca89d040d80b6d33e04655a8cbeec0d7405dbb1ad7b66195f7c7 |
| root-path-proof.json | 5097 | 4555e993024e549927af2217199c8df4fad27f4204c6443a04e07562257dbabd |
| source-delta.json | 1205 | 11d6326094cb722e9cb46f57f84a329170c67ef8f48fc3b39e4f9d422d9352f4 |
| wrapper-binding.json | 494 | da84065a58f7591b3a60f07892268fc9710cf3b1260d47662af025fb2a172df0 |

`repair-reviewed/` preserves 25 exact snapshots, including all packet members, packet, wrapper and wrapper binding. `repair-inputs.json` records 40 input bindings and the independent static comparison results; its SHA-256 is `eb2c0c25155cc159b8fb3859a3377b0d300f30d1ce60a09e6f3f78bdbe9f51fa`. Source citations below refer to these exact retained revisions and original line numbers.

## Focused findings and conclusions

No actionable material finding was established.

1. **The drive-root repair is narrow.** `repair-reviewed/recover.mjs:43` resolves the absolute path and keeps ordinary spelling only when the entire resolved path equals its parsed filesystem root. Descendants still use `path.toNamespacedPath`. The ancestor loop still visits and lstats every ancestor, including the drive root (`recover.mjs:48`); it does not skip the problematic root or weaken its no-link check. Fixed source/archive roots, containment, directory/device identity and per-file verification remain unchanged. In this fixed local-drive scope the correction avoids the observed namespaced drive-root call while retaining long-path spelling for the residual files.

2. **Early failure becomes visible without creating success.** The catch at `recover.mjs:142` still sets process exit 1, closes an open journal, and writes the existing `completed:false` failure record if the attempt directory was created. Its added stderr diagnostic reports completed false, phase, runCreated and error even before RUN exists. A diagnostic-write error cannot turn the native exit into success. The success path still ends at exclusive final hard-link publication (`recover.mjs:141`); the new diagnostic is only in the failure handler, so no successful-publication post-I/O regression was introduced.

3. **No undeclared helper or checker broadening was found.** Independently reversed the new BASE/run, grant/owner, three prior-evidence pins, root conversion and catch diagnostic in the entire repaired helper text. The result exactly reproduces the old helper bytes and SHA-256 `2ee6112c2c598d575f34d9f91990036a02b69acba8913d38546611602f3c88fa`. This verifies the source-delta claim independently, rather than relying on its boolean. The process checker exactly matches its old source with only `root-approved-voxel-residual-1` replaced by `root-approved-voxel-residual-2`. The 2816-file/323-descendant-directory census, 2815 archived pairs plus the sole approved executable exclusion, MAIN `7c1457c`, branch tip `5d6d4c9`, archive receipt `921f7664...55bdc`, full byte/identity guards, one-at-a-time unlink/nonrecursive empty-directory removal, unchanged-controller branch deletion, mutation journal and receipt logic are therefore preserved.

4. **The new attempt does not overwrite the failed one.** BASE/output are now `voxel-residual-recovery-2-1111/run-2`; grant and gate owner are distinct (`recover.mjs:10`, `recover.mjs:60`). The helper additionally pins the original residual packet, actual failed root receipt and old wrapper at their original paths (`recover.mjs:35`). The frozen criteria and residual census retain their original hashes. Each prior-attempt copy was independently compared with its original, including both empty logs and actual failure receipt. No old attempt or source verdict was altered. The new wrapper pins this packet and refuses its own existing root receipt; the helper still refuses its existing run directory.

5. **Immediate root process attribution addresses the missed first poll.** Immediately after Start-Process, before output/polling, `run-voxel-residual-2-1111.ps1:41` records root PID and StartTime in the owned map, retaining full UTC StartTime as evidence. `Creation-Key` truncates 100-nanosecond ticks to microsecond precision (`run-voxel-residual-2-1111.ps1:18`). The same normalization is used for the initial root key, discovered children, live-parent comparisons, cleanup matching and remaining-process checks (`run-voxel-residual-2-1111.ps1:30`, `run-voxel-residual-2-1111.ps1:56`). The record no longer depends on a first CIM poll finding the root alive. This is source confirmation of the repair, not a demonstrated live StartTime/CIM or cleanup result.

6. **Wrapper acceptance and ownership boundaries remain intact.** Independently reversed only the new identity/path/hash pins, added creation-key function, immediate-root block and corresponding normalization substitutions. The entire result exactly reproduces the previously reviewed wrapper SHA-256 `1b2c69abf5052be883e5b195ba452cc04afdecb2235659eb9da2908c8fce6984`. Actual native exit capture, no-failure-marker requirement, exact result path, counts, branch-controller exit, receipt hash, owned PID/creation cleanup, token-matching gate release and acceptance conjunction remain unchanged (`run-voxel-residual-2-1111.ps1:45`). Missing observations or capture failures are not evidence of success. The existing polling/missed-descendant limitation remains explicitly disclosed; the change is not an OS process-group guarantee.

## Retained regression evidence and provenance

Read the fixture source and proof rather than executing either. The fixture binds the exact repaired helper hash, selects exactly `long`, `noLinks`, `ordinary`, `identity` and `hashFile`, and evaluates only those standalone definitions. Its source contains no full-helper import, census, controller invocation or deletion. It checks a drive root, a namespaced ordinary descendant directory, the metadata of one frozen 341-character file, and the hash of the old 1564-byte packet.

Independently extracted those exact five function lines and reproduced their proof hash `717794133a3bc8fc2dbb420da5f6af6cda95da517f5ac405d1427a2399882502`. The proof's raw output parses to its retained result exactly. It records actual fixture exit 0 on pinned Node v24.22.1, reproduced original EISDIR/path `C:`, successful repaired root metadata, preserved descendant namespacing, the 64078-byte long-path metadata case, and matching small-packet hashes. This is bounded author-run regression evidence whose bindings were reviewed, not independently rerun execution and not proof of deletion or full archival verification. The preparation and wrapper-binding records report parse/AST success; those were not rerun either.

The first residual attempt's immutable root receipt is SHA-256 `0589a37f83de37788f96b09888acf5a1910a587cc6987c71fa82a937bb3f2218`: actual native 1, accepted false, gate released, and an empty owned list. The empty list is accurately described as the original polling limitation. The separate root observation records that PID absent and no attempt run directory, while the source remains and Git pointer/admin are absent. This reviewer read those retained observations; no new live process or filesystem census was performed. The repair handoff distinguishes this early failure from the preceding controller long-path failure.

## Limits and abstention

No helper, fixture, process checker, controller, Git command, live census, payload-wide hash, deletion or runtime/test was executed by this reviewer. Checks were exact source/metadata hashes, bounded retained-record reads, full-text inverse comparisons and proof-content binding checks. At the bounded existence check the new run-2 and new root-run receipt were absent. No canonical review or status document was created.

The source-only acceptance retains every limit of the earlier implementation review: quiescent ownership and the shared idle lane must be real at execution; filesystem checks are not an atomic snapshot; exact branch-tip checking has the disclosed small invocation window before the unchanged controller reads its CAS tip; process polling does not prove all possible writers or descendants absent; partial deletion can precede a later failure. Actual acceptance still requires helper native 0, the matching final result/receipt hash, no failure marker and verified owned-process cleanup/gate release. Any failed or ambiguous attempt must remain failed and preserved. No product, font-research, Windows/hosted or timing criterion is waived by this repair review.
