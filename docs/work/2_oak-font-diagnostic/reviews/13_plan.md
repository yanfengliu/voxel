# Review 13: plan

## Target

The written residual-recovery criteria and frozen remaining-census metadata after the failed original retirement. The census SHA-256 is 89438fa27a3ffe0904363f8f754e56cccdc5714338a58c7cc57f5c506410bf00; this interpretation preceded the new mechanism's implementation review.

## Reviewers and coverage

An independent reviewer assessed whether cleanup of an already unregistered, task-owned remainder could satisfy the existing ownership rules. The reviewer read the original failure evidence, criteria, controller and retained census/receipt metadata without executing a new census, helper, Git command or cleanup.

## Reports

The complete authored [residual interpretation](../snapshots/13_residual-interpretation.md) is retained byte-exact at SHA-256 3db475722014e9025a43b41fc1c457e22a91fd6a238d47b169002ae0c3ace586. Its exact inputs remain under civ-engine/tmp/voxel-residual-recovery-review-1111/interpretation-inputs.

## Findings and disposition

No material policy gap was established for bounded residual-output cleanup, conditional on fresh proof that registration/admin/pointer remain absent and every remaining entry matches the frozen archived subset or the one previously approved reproducible-tool exclusion. Broad deletion, fake worktree recreation, modified controller/policy, loss of unknown files or an old-helper replay remain outside that interpretation. Root accepted the conditional interpretation separately from any mechanism or executed result.

The watch point is explicit: public controller delete-branch passes expected=null and CAS-deletes the tip it reads. A new helper must require exact owned tip 5d6d4c911c6d05b62a5a81ad62f05993cf44e9de immediately before invocation under quiescence; it cannot claim that the CLI accepts an external expected-SHA argument.

## Verification

Retained metadata reconciles 2,816 residual files, 323 directories, 506,358,600 bytes and zero recorded links: 2,815 paths match archived lengths, and the sole unarchived remainder is the previously excluded Node v22.23.3 executable, 86,973,768 bytes. This was a metadata comparison, not a live census or payload-byte verification. All original failure evidence stays unchanged.

## Round outcome

Conditional interpretation accepted for exact implementation review. No removal, actual recovery acceptance or product/runtime success was established by this round; review 14 separately judges the resulting source.
