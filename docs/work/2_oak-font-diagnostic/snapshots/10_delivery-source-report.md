# Original Voxel delivery-helper review

Reviewed 2026-11-11. Original helper SHA-256: 64519389a5bc12e615ce8d57690d7927d75f498e5f30ee26fae590c169fc5ca7, 3,705 bytes. Exact original bytes are preserved in helper-original.mjs; delivery-paths.json is the exact 25-path input, SHA-256 8581adead2acc7e01e56edbf62f7b13117a137110da386041e465a335259a069.

Verdict: BLOCK this original revision. Root accepted both findings and prepared a separate repair; that repair is not judged in this original report.

## VD-R0-001 [P1] The clean-index check does not protect unconditional index replacement

Original helper lines 21 and 37-40. The helper checks a clean index, performs remote/ref/file reads and preflight writes, advances main, then unconditionally runs git read-tree target without exclusive index ownership spanning the check and replacement. Another session may stage changes in that interval. read-tree replaces the newly changed index; its short-lived index lock protects the write, not the prior clean-state assumption. The post-check of a clean index cannot detect the foreign staged state that was discarded. The ref compare-and-swap protects main, not the index.

Hold exclusive index ownership across current-state validation and installation, or use an operation that validates/preserves staged state under its own lock. Preserve a recoverable index preimage and inspect partial-failure handling because main advances before the original index/checkout writes. A second unlocked cleanliness check only narrows the race. This is material in the shared primary checkout with a separately owned dirty work-5 file. No race was executed.

## VD-R0-002 [P2] The push is not bound to the reviewed commit

Original helper lines 45-46. git push origin main resolves the live local ref at push time. A concurrent local main advance after the checks can cause an unreviewed revision to be pushed; the subsequent equality check detects it only after remote mutation. The earlier ref compare-and-swap does not lock the name for the rest of the helper.

Push the immutable target commit to refs/heads/main with an ordinary non-force push, then verify local and remote state separately. Concurrent remote advancement must refuse rather than be overwritten.

## Correctly bounded portions

The path list has 25 unique, safe relative docs/work paths and excludes the foreign work-5 plan. The helper fixes old/origin/target revisions, validates main/owned-tree/ancestry and the exact changed-path set, pins the foreign working bytes, compares owned source files to target Git blobs, and requires new destinations to be absent. It exclusively saves the foreign preimage and preflight record. checkout-index names only the 25 owned paths; foreign disk bytes are checked after checkout and push. Those checks avoid intentionally overwriting work-5 disk content but do not eliminate the separate index race.

The intended target is 7c1457cd39fa0b2e8d0690246d2290ece66eb852, from expected primary main 8db1c16c60a712004dd1c5d9f6c9a43bea916bf9 and remote main 020c8b10107162bd31ae770e293bc8c335f9ecca. The earlier final documentation/result review is separate evidence, not live Git validation by this reviewer.

## Limits and preservation

No Git execution/mutation, helper run, test/runtime, browser, controller, payload-wide hash, cleanup, deletion or delegation occurred. Only the report and small source/input snapshots were written in the assigned review directory. No persistent process was launched. The original snapshot write correctly refused after the helper path changed during report preparation; the exact original was then recovered from root's separately retained voxel-delivery-helper-before-concurrency-fix-1111.mjs after checking its original SHA-256. Both revisions and both authored verdicts must remain distinct.
