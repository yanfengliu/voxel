# Review 6: concrete primary-preservation helper

## Target

Ignored task helper preserve-primary.py implementing review 5's bounded procedure. Initial SHA256 d11b57de1d291d56aa52bbe38462bbd66d2aa90e3d0c21d23fd59248518a87b2; repaired SHA256 a83f4ec079c4ed34117de38e554feeba566d7e603fb67f2ed479786beb8b3baa. No execution is claimed by this review.

## Reviewers and coverage

Independent gpt-6-astra at xhigh inspected the concrete Python source, Git parsing, index-write ownership, rollback and merge preconditions. The same reviewer checked the bounded repair. No mutation or test was performed.

## Reports

The initial review found F1 (P2): rollback iterated every planned seed, including entries never successfully written if an earlier update-index failed. A concurrently staged later entry with the same candidate blob could be mistaken for this invocation's write. Track successful writes separately and roll back only those; reread HEAD and each entry immediately before restoration. Also recheck branch, HEAD and the expected seeded index immediately before merging.

The focused rereview concluded: F1 is fixed; pass for the bounded procedure. Successful index writes are recorded individually. Rollback visits only those writes, rechecks HEAD per entry and reads the specific current entry before restoring it. Before merging, the helper requires main, the original HEAD and the exact expected seeded index. No further material findings. Run with Python assertions enabled and a task-owned evidence path. Separate Git commands remain non-atomic against another session.

## Findings and disposition

| ID | Finding | Disposition | Verification |
|---|---|---|---|
| F1 | Rollback could touch an entry never written by this invocation | Resolved by successful-write ownership and fresh per-entry guards | Independent rereview of repaired digest above |

## Verification

Read-only source review and focused repair verification. Actual execution will record old/target commit IDs, before/after working-file hashes, seeded entries and outcome under ignored task evidence.

## Round outcome

Concrete helper accepted for the bounded procedure. No foreign working bytes may be overwritten; changed preconditions abort execution.
