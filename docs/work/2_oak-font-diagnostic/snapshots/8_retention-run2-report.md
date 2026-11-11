# Focused source review of Voxel retention run 2

Reviewed 2026-11-11. Exact packet SHA-256: dde4f8d1d3a7a01a77f28881b69120f1cdd480d7e839f21248b31348aca8e639. The packet and all 26 members are retained byte-exact under reviewed/; inputs.json binds those 27 snapshots.

Verdict: no new material finding in this exact source/provenance amendment. The additional allowance is one explicit docs-only origin-tracking revision, not a relaxation to latest/current refs or source contents. The selection and prior safety checks remain intact. This is source-review acceptance only; it is neither a successful run-2 archive result nor permission for removal. The separate root wrapper has not been reviewed here.

## Exact ref amendment

copy.mjs:21-22 fixes the required current refs to HEAD/main 8db1c16c60a712004dd1c5d9f6c9a43bea916bf9 and origin/main 020c8b10107162bd31ae770e293bc8c335f9ecca, with the retained proof SHA-256 e76089b5cf7ea1185a92cef6e19f1445e18371da49050d02ea3d6087a24c9e61. checkGit at :64-65 still requires the original saved primary-ref triplet to remain all-8db and then compares live refs to the exact amended literals. Its return record at :71 retains original and amended refs plus proof identity. The proof file is hash-checked explicitly at :127 and is also a sealed, copied metadata member.

Both opening and closing checkGit calls remain (:152 and :160), including exact owned HEAD/branch/status/index/staged state, the live .git pointer, ancestry in local main and one exact unlocked/unprunable target registration. No unknown future origin commit is accepted. Unrelated worktree registrations are still outside the target comparison, so the separate owned closeout tree does not silently alter source acceptance.

I read primary-ref-proof.json's full bounded commit description and diff, not only its changed-path summary. The retained proof records one commit with parent 8db1c16 and only docs/work/5_vite-advisories/plan.md changed. The diff changes its status/date and appends blocked CI/slowness/owner-decision records; it changes no executable path. The six recorded Git calls have native exit 0 and no signal/error. This is inspection of retained local Git evidence, not an independently rerun Git command, remote-server freshness check or endorsement of the historical measurement/causal claims within that foreign document.

The original primary working-tree work-5 content is not selected or written. The amendment does not assign work to that owner, resolve the blocked issues, amend renderer behavior, or satisfy old hosted acceptance criteria.

## Unchanged guards and fresh invocation identity

I compared the actual run-2 files to the preserved repaired run-1 source, independently of the supplied diff text. Executable changes match the stated narrow scope: BASE, fresh copy-2/run-2 paths, new grant and gate-owner tokens, explicit primary-ref proof/binding and retained provenance. census.ps1 changes only its four fixed identity/output literals. Its recursive file metadata, directory names, no-reparse/no-lock checks and process/port refusal policy remain unchanged.

copy.mjs:134-142 retains the original selection seal and 3,175 / 424,222,063 limits, 1,112 indexed paths, 19 dirty paths/source bindings, empty staged-state contract, exact indexed/dirty membership, and case-collision guard. No selected file is dropped, no primary source binding is refreshed, and no old cache/provenance exclusion is widened.

Repeated source/archive hashing, identity checks, final destination census, pre/post source/admin/Git checks and shared-lock byte ownership remain unchanged. The failure-safe finalization remains :166-187: prerequisite hashes/writes precede publication, the failure receipt stays false, a candidate/result alone is insufficient, the exclusive hard-link publication is the last authored fallible I/O, and catch sets completed:false. Actual native exit 0, matching valid result/published receipt hash and flag, and absence of run-2/failure.json remain mandatory together.

This is a distinct fixed invocation, not resumption or overwrite of run 1. Existing run-2/archive paths still refuse, no automatic retry exists, and there is no unlink/delete/controller/Git-write path. The new lock owner is root-voxel-retention-1111-run2 and the explicit grant is root-approved-voxel-retention-2. The fixed source remains engine-feedback-voxel-1001; the only archive destination is civ-engine/tmp/voxel-worker-retained-1111/copy-2.

## Actual membership and preserved failure

All 26 sealed member lengths and SHA-256 hashes match. Case-insensitive member names are unique. The planned metadata population is exactly 38: 9 original plan/inventory files, 2 selection-review files, and 27 current executor packet files including its seal. Working data remains 3,175 files / 424,222,063 bytes; the final receipt is additional. The 38 count follows the actual packet membership and copy.mjs:143-145, not a stale handoff count.

Every prior-run1/ member matches the corresponding original executor directory file. This includes the original repaired source/packet and initial preimages, plus root-run.json, stdout/stderr, run-1/failure.json and run-1/native-calls.json. The focused repair report/input manifest are separately preserved under prior-run1-review/ with their original exact hashes.

Outside the source diff, prior-run1/root-run.json records nativeExitCode:1, accepted:false, no leftovers and gateReleased:true. prior-run1/run-1/failure.json records completed:false, commitPointReached:false, destinationExists:false and exactly the origin-ref mismatch. The retained stderr points to checkGit's original equality assertion; it does not report a census, payload-copy or publication failure. These records consistently establish an early refused attempt and do not count later guards as passed. Cleanup/gate-release fields remain recorded wrapper results, not a fresh independent process/lock census by this reviewer.

At this review checkpoint run-2/ and copy-2 were absent. The original failed run and earlier review files were not modified or cleaned.

## Exact primary bindings

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| packet.json | 4719 | dde4f8d1d3a7a01a77f28881b69120f1cdd480d7e839f21248b31348aca8e639 |
| copy.mjs | 20229 | 0133e235c35d31251a467ab3d4045b739357014d922f82f463282f08103bc18b |
| census.ps1 | 6241 | f624fa02175ce4e48bb7c944352f3251496502e3fab8dd8e7c541fe5106dd4f3 |
| handoff.md | 8747 | 28618c9528dca6f6df401a21075c9f9a8d5cb560a1292fccedb67e329d3c8db3 |
| primary-ref-amendment.md | 4090 | fafe077b2eb4c0dde72896ac5d63d89677a6c98137294cc6378c3acb60e05918 |
| primary-ref-proof.json | 18010 | e76089b5cf7ea1185a92cef6e19f1445e18371da49050d02ea3d6087a24c9e61 |

inputs.json retains all 27 exact reviewed snapshot bindings, including the supplied source diffs and preserved original failure.

## Limits and subsequent acceptance

No copier/census/helper execution, payload-wide hash, runtime/test/browser, process/port census, controller, Git command/mutation, source edit, deletion, cleanup or delegation ran in this review. Only the assigned report and small reviewed source/metadata snapshots were written. No persistent process was launched.

This review does not refresh worker contents or independently certify current ownership/ancestry/ref state; the executor's unweakened guards and root's later checks must establish those facts. Prior limits concerning caller-owned lock assertions, open handles, change-and-restore races, non-atomic snapshots, hard-link/native behavior and wrapper cleanup remain. A new mismatch must stop the run and retain failure evidence. Successful archival remains separate from canonical status/delivery and any unchanged-controller retirement.
