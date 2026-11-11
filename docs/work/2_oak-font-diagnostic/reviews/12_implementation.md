# Review 12: implementation

## Target

The original old-worker retirement packet, SHA-256 45055e8df280dd107ad2cc7ab12e76271465cfe75931c1dae66d4cf59bb7366a, and external wrapper SHA-256 5923321fa81f0381f79873cc6f0e23914700ce6ef909ad7c5582b9ae3d8602cd. The fixed target was engine-feedback-voxel-1001 and the accepted archive was copy-2.

## Reviewers and coverage

An independent source reviewer checked all five sealed members, external wrapper, pinned unchanged controller and bounded accepted-copy metadata. This review did not run a census, payload hash, helper, controller or cleanup.

## Reports

The complete authored [original retirement source report](../snapshots/12_retirement-source-report.md) is retained byte-exact at SHA-256 10c2c62169d894935555c836ac80c4a86ec4a1b5687a81c30838b05ba5817923. Exact reviewed inputs remain under civ-engine/tmp/voxel-retirement-review-1111.

## Findings and disposition

No material source finding was established under the stated quiescent ownership conditions. Root accepted that bounded source verdict. The report expressly warned that native failure could follow partial deletion and did not claim the future attempt would succeed. This original authored verdict remains unchanged after the observed failure.

## Verification

The reviewer reconciled the accepted archive receipt/result/root records, selected counts, pinned metadata and guards; it did not repeat the full working-byte verification. Later root execution did complete the helper's source/archive verification, fresh metadata/Git/process checks and dry run before invoking the unchanged controller. Actual helper and controller exits were 1: Git's force-removal path failed with Windows Filename too long after partial removal. The preserved run-1/failure.json, native-044.json, pre-removal.json, verified-rows.json and root-run.json under civ-engine/tmp/voxel-retirement-1111 record failure, accepted:false, no remaining recorded owned processes and released gate.

Historical checkpoint after the original failed attempt, 2026-11-11 16:44 UTC: root observed the old registration, admin directory and .git pointer gone while the residual folder and merged branch remained. The accepted archive, both copier-attempt records and failed retirement records remain preserved. These were root execution/state observations, not a new independent result review; the later separate accepted residual cleanup is recorded in [review15](15_implementation.md) and does not change this original failure.

## Round outcome

Original source review accepted; actual retirement failed after partial removal. No successful retirement is claimed. The bounded residual-cleanup interpretation and exact new implementation are separate rounds 13 and 14; they do not rewrite this failed attempt.
