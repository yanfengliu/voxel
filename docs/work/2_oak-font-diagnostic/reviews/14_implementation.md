# Review 14: implementation

## Target

The separate residual-recovery packet SHA-256 44eaa92432d4e14e31214fbd82be9fb687acea4facd8ec4d1fb1f19c32ab2bc0 and external wrapper SHA-256 1b2c69abf5052be883e5b195ba452cc04afdecb2235659eb9da2908c8fce6984. These are a new bounded mechanism, not a replay of the failed retirement helper.

## Reviewers and coverage

An independent source reviewer checked all six sealed members, the external wrapper, unchanged controller and 24 source/metadata bindings, with 14 exact snapshots retained. The original interpretation and retirement review remained separate and unchanged.

## Reports

The complete authored [residual implementation review](../snapshots/14_residual-implementation-report.md) is retained byte-exact at SHA-256 ee0b04f458130ed14f1cc8db2a840690113bbe9e2a45eef288796e2e5da7d330. Exact inputs remain under civ-engine/tmp/voxel-residual-recovery-review-1111/implementation-reviewed.

## Findings and disposition

No material source finding was established within required quiescent ownership conditions. Root accepted the exact helper and wrapper source. Node keeps fresh enumeration, byte verification, checked long paths and per-file deletion in one runtime, followed only by nonrecursive empty-directory deletion. It guards the complete residual set, accepted archive, one excluded executable's provenance, absent Git metadata, primary/foreign refs and bytes, other registrations and the held lane. Failures retain partial progress and cannot become accepted completion.

The exact owned branch tip is checked immediately before unchanged-controller delete-branch. The report accepts that guard within quiescence and accurately retains the small invocation-window limit: the CLI CAS protects its internally read tip, not an externally passed SHA. Native 0, matching published receipt hash, no failure marker and root-owned process cleanup remain jointly required for any later acceptance.

## Verification

The reviewer checked source, retained metadata, original failure records, accepted archive receipt and small Node provenance files/copies. It did not run the helper, process checker, live census, controller, Git command, payload-wide hash, executable or runtime/test. Its bounded existence check found the new run-1 and root receipt absent. Those source observations are not execution postconditions.

## Round outcome

Exact first-residual source accepted; subsequent actual execution failed. At 2026-11-11 17:26:49 UTC the wrapper recorded actual native1, accepted:false and gateReleased:true before run-1 existed. Both captured logs were empty. Root diagnosed the Node v24.22.1 namespaced-drive-root EISDIR in pre-run ancestor checks, and the failure handler emitted no pre-run diagnostics. No full residual verification or deletion is claimed for this attempt. Its owned list was empty because the short-lived root was missed before polling; this is a tracking limitation, not process-absence evidence. Root separately observed the identified PID absent.

The original source verdict and authored report remain byte-exact and historical. The separate drive-root/diagnostic/root-identity repair and later root-accepted second-attempt result are recorded in [review15](15_implementation.md). Neither that later success nor these wrapper observations turn the first residual attempt or original controller retirement into a pass.
