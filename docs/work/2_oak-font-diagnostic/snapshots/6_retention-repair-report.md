# Focused repair review of the Voxel retention executor

Reviewed 2026-11-11. Exact repaired packet SHA-256: ddb8a70f971eb3902c60fea14046725bbe32f33a1db8af349bb5fec720ed6d7a. Original report.md and reviewed/ remain unchanged; repair-reviewed/ preserves this revised packet and every member, and repair-inputs.json binds those exact copies.

Decision: VEX-R0-001 and VEX-R0-002 are resolved at the source-review level. No new material finding was identified in the repair. This is not an executed archive result or permission for copying/removal. Native exit 0, the matching result/published receipt hash and completion flag, and absence of run-1/failure.json are all mandatory execution-acceptance conditions.

## VEX-R0-001 — resolved in source

copy.mjs:145 initializes the failure-state receipt with completed:false. Final census hashes and native-call output/hash are established while it stays false (:164-166). The complete success object is separate from that mutable failure object (:168). It is written exclusively to receipt-candidate.json, hashed, paired with a written/read-back result, and hashed again before publication (:169-172). Absence of failure evidence, no-link receipt ancestry and same-volume publication are checked before the final operation (:173-174).

fs.linkSync(candidate, RECEIPT) at :178 is the final authored fallible filesystem operation. There is no later authored hash, receipt/result write or console output on its success path. It publishes the already complete ordinary-file candidate at a previously absent path without overwriting; this is an ordinary hard link rather than a symlink/junction or a link to the worker. The candidate and published receipt are intentional retained aliases and must remain unmodified through acceptance and later evidence retention.

On an earlier exception, catch explicitly resets completed:false (:180); if no final receipt exists, its failure receipt uses that object (:181). A prewritten completed result/candidate without successful final publication is insufficient. If the final filesystem operation has an ambiguous failure or failure-evidence writing itself fails, the thrown exception still prevents a successful native exit. Root must apply the complete acceptance conjunction and must not accept either a receipt flag or result file alone. This removes the previous path where the mutable failure receipt was marked complete before its prerequisite hashes/writes.

Hard-link behavior, crash timing and the failure paths were not exercised in this review. The new source ordering and explicit external acceptance rule resolve the reported source defect without claiming runtime proof.

## VEX-R0-002 — resolved within the stated metadata scope

census.ps1:27 includes ordinary-file path, relative path, length, attributes and last-write timestamp. Its admin output now retains all recursive adminScan.files and adminScan.directories (:59). copy.mjs:88-91 compares top-level admin entries, the sorted recursive ordinary-file metadata, recursive directory names and source directory names before/after.

This includes the previously uncovered logs/HEAD. The updated handoff correctly limits the result to recursive file metadata and directory names; it does not claim admin content hashes or all recursive directory timestamps. Logical Git source/index/ref bindings and no-link/no-lock checks remain separate existing guards.

## Scope preservation and new packet members

I read both complete repaired helper files and compared their changed lines with preimage/review-r0. Changes to executable code are confined to recursive admin metadata retention/comparison and finalization/failure handling. Fixed source/destination, original selection seal, source-parity count, all 1,112 indexed/19 dirty-path checks, shared-lane grant, process/port refusal policy, exclusive target writes and no-resume/no-delete behavior remain as reviewed in round 0.

The revised seal has ten members rather than four: the current four source/handoff/input files plus six preserved original packet/report files. All ten member lengths and hashes match. The executor's existing loop over seal members includes their retained preimages in the archive, making the planned copy 3,175 working files plus 22 metadata files, with the final receipt additional. This changes retained review evidence, not the working-file selection.

Outside the repair, original voxel-final-retention-1109/plan.md:54-60 still requires fresh ownership/source/link checks, verified retention and a separately assessed unchanged-controller path. This repair does not remove those prerequisites, resolve canonical task status, move primary refs, authorize source adoption, or authorize any worktree removal. An unrelated new closeout-worktree registration remains compatible with exact source registration checking; a later movement of pinned primary refs intentionally refuses this copy.

## Exact revised bindings

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| packet.json | 1823 | ddb8a70f971eb3902c60fea14046725bbe32f33a1db8af349bb5fec720ed6d7a |
| copy.mjs | 19671 | d32f5a8ccba9371241791074236a85bfd619340dac7e8b03fcdbbc5ceafdd03e |
| census.ps1 | 6236 | 63c242cccbab3199eb3852961dbc139985e260acfbe3ee9fbbf2978038cb8a4e |
| handoff.md | 8072 | e8098677b109ee26cbd831cb47e88c52b6b55666da1a8e0715ba954e61f0119e |
| inputs.json | 3023 | 918ab63acc50c10c4a71c219aee2d29e06c882a102a07427cfb7797d45a85e20 |

The original review report remains SHA-256 a56d77f60c5f6f9025860229d472972de2f5c51ca1ed3bab9faf0907fd29448d and is itself preserved in the revised sealed packet. repair-inputs.json provides all eleven snapshot bindings, including the revised seal.

## Limits

No executor/census/helper or archive run, runtime/test/browser, process/port census, payload-wide hashing, controller invocation, Git mutation, source edit, unlink, deletion or delegation occurred. Only small reviewed source/report bytes were copied into the assigned review directory. No persistent process was launched. Existing round-0 limitations on quiescence, ancestor/device proofs, caller-owned lock assertions, open handles, change-and-restore races and native behavior remain; the repair does not expand that coverage. A later source change invalidates this exact repair verdict where it changes the reviewed behavior.
