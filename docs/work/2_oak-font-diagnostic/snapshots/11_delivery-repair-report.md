# Focused repair review of the Voxel delivery helper

Reviewed 2026-11-11. Exact final helper SHA-256: f5f5d9fb83c5646c45627507e09348f3fb93292c9699b9503d63a984852114e1. Original report.md and helper-original.mjs remain unchanged; helper-repaired.mjs is the exact final revision, and helper-lock-intermediate.mjs preserves the intervening lock-only revision.

Decision: VD-R0-001 and VD-R0-002 are resolved in source. No new material preservation/fast-forward issue was identified in this focused repair. This is not an executed delivery result or an acceptance of later old-worker cleanup.

## VD-R0-001 — resolved for cooperating Git index writers

Final helper lines 20-27 reject inherited index/repository redirects, bind the primary Git directory and acquire primary .git/index.lock exclusively with wx before the clean-index/main/status checks. The lock's device/inode/file identity is retained and checked before sensitive transitions. Lines 31-46 repeat the original state/ref/path/foreign-content/source-byte preconditions while that lock remains held.

Lines 47-50 preserve the foreign working file and a new exclusive primary-index-before.bin, with its hash recorded in preflight, before any ref movement. Lines 52-53 build the target in a separate alternate index and verify its tree identity. The primary index is therefore not replaced by the earlier unprotected read-tree call.

The held primary lock spans ref compare-and-swap, checkout of only the 25 owned paths, foreign-content verification, target-HEAD verification, filling/fsyncing the owned lock and renaming that completed lock over the primary index (:54-62). Cooperating Git stage/index writers cannot introduce the formerly vulnerable between-check-and-replacement changes. The alternate index is explicitly selected only for its own operations.

The finally path releases only the lock whose recorded identity still matches (:63-65). It does not delete a worktree or foreign content. If ownership cannot be established, it throws rather than deleting a replacement lock. This is a cooperative Git-lock guarantee, not protection against another process deliberately bypassing or removing that lock.

An error after the ref CAS can still leave partial local delivery, such as main advanced while index/worktree installation is incomplete. That is not represented as success; the saved original index, fixed old/target revisions, foreign bytes and alternate index provide recovery evidence. Root must inspect the actual partial state rather than blindly rerun or roll back another session's later changes. No automatic rollback or force deletion was introduced.

## VD-R0-002 — resolved

Line 70 now pushes the immutable target 7c1457cd39fa0b2e8d0690246d2290ece66eb852 to refs/heads/main without force. A later movement of the local main name cannot substitute a different pushed commit. Lines 69, 71 and 72 separately inspect local and remote target identity; ordinary remote non-fast-forward refusal remains intact. No force/lease bypass or wildcard/latest target was introduced.

Foreign working bytes remain checked after checkout and again after the push (:59 and :73). The delivered receipt is written only after the local/remote/content checks, and source file checks still bind the actual owned outputs to target Git blobs.

## Narrow scope and preserved inputs

The final amendment relative to the lock-only revision adds only the exclusive original-index backup and its preflight hash. The lock-only revision's other changes address the two original findings: exclusive index ownership, alternate-index construction/validation, fixed target push and separate local/remote checks, plus inherited Git-environment rejection.

The original 25-path input remains SHA-256 8581adead2acc7e01e56edbf62f7b13117a137110da386041e465a335259a069. It contains only task-owned docs/work paths and excludes docs/work/5_vite-advisories/plan.md. The helper still checks that old-to-target changes equal those 25 paths plus that one foreign committed document, and it never checks out the foreign path. No runtime source, dependency, tolerance, renderer, worktree deletion or controller path was added.

Retained exact revisions:
- Original helper: 64519389a5bc12e615ce8d57690d7927d75f498e5f30ee26fae590c169fc5ca7.
- Lock-only intermediate helper: 809e8039b9b932877f679f0a1ac9b190347e9db7bb44e0b6c8ce8c43ee110fa8.
- Final helper with index preimage: f5f5d9fb83c5646c45627507e09348f3fb93292c9699b9503d63a984852114e1.
- Original authored report: c172d249d5b22113cd272241c9f4953747e65abc7967178e54fdade8f381cf5f.

## Limits

No helper/Git execution, index/ref mutation, test/runtime/browser, controller, payload-wide hash, lock creation/release, cleanup, deletion or delegation ran. Only the assigned review reports and small source/input snapshots were written. No persistent process was launched. Native lock/rename/checkout/push behavior, permissions, hooks and failure paths were not exercised, and current live Git/index/ref state remains for the helper's actual preflight. This focused source verdict does not establish delivery, hosted CI success or old-worker removal.
