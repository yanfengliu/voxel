# Review 5: preserving concurrent primary work

## Target

The bounded procedure for fast-forwarding Voxel's primary checkout from 0263e10 to the eventual verified delivery commit while preserving its foreign modified and untracked files. The isolated integration-probe-2 records 182b2be to 08e93a9. This review approves the procedure, not its future execution.

## Reviewers and coverage

Independent gpt-6-astra at xhigh inspected the actual probe, primary status/index flags/hooks, incoming changes and official Git documentation. No mutation or test was performed.

## Reports

Acceptable for this checkout, with narrowly guarded rollback. It preserves foreign bytes without stashing or replacing their working files.

The actual probe records a fast-forward from 182b2be to 08e93a9. Its index matches HEAD, while foreign.txt retains "foreign uncommitted content" and registry.txt retains "foreign reservation". This confirms the observed endpoint; the reviewer did not rerun the probe or independently observe its starting bytes.

The mechanism is documented: when the index already matches the incoming tree, Git's two-tree merge keeps that entry and leaves differing working content intact. `--cacheinfo` supplies the candidate's mode/blob without reading working content. See [Git carry-forward rules](https://git-scm.com/docs/git-read-tree#_two_tree_merge) and [cacheinfo documentation](https://git-scm.com/docs/git-update-index#_using_cacheinfo_or_info_only).

- Preseed only foreign dirty/untracked paths overlapping incoming tracked files. Clean incoming paths must receive the normal checkout update.
- Pin the old HEAD and candidate SHA; require a clean starting index. Record each touched entry's original mode/blob or absence, plus raw working-file hashes.
- Use `merge --ff-only --no-autostash --no-overwrite-ignore <exact-SHA>`. These flags avoid configured autostashing and accidental replacement of ignored files.
- On failure, restore an original index entry only if HEAD is still the original commit and that entry still equals the seeded value. If HEAD moved, or another session changed the entry, stop and inspect; restoring the old index then would create incorrect staged changes.
- After success, verify HEAD equals the candidate, the index matches HEAD, and every preserved working-file hash remains identical. Previously untracked files can legitimately become tracked-but-dirty.

Current primary state matched the premise: HEAD 0263e10, origin/main c5be6e2, clean index, two modified files and three untracked plans. There were no assume-unchanged/skip-worktree entries or active hooks. Incoming changes were ordinary additions/modifications, without deletions or file-type transitions. Recheck against the actual delivery commit.

No safer alternative is necessary for this bounded case. Concurrent primary-index activity remains the main operational risk; a hash snapshot detects interference but cannot prevent it.

## Findings and disposition

No material finding against the bounded procedure. Adopt the explicit merge flags and conditional rollback guards; abort on any changed precondition.

## Verification

The coordinator's second isolated probe demonstrated preservation of original working bytes and a clean resulting index. The reviewer inspected its endpoint and Git's specified behavior. Actual primary execution and hash verification remain pending.

## Round outcome

Procedure accepted with the stated guards. It does not authorize overwriting, stashing, deleting or committing foreign working changes.
