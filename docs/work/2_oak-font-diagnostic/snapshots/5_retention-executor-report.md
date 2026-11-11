# Independent review of the fixed Voxel retention executor

Reviewed 2026-11-11. Target packet SHA-256: 989e082570fb645245d3b7e2631476da4095d249b61619f02d383efc7a2cdeef. Exact reviewed bytes are retained under reviewed/ in this directory. This is source review only; the executor, census, copier, controller, tests, browser and application runtime were not executed. No delegation occurred.

Verdict: do not execute this exact revision until VEX-R0-001 is repaired and the changed source is checked. The fixed selection, exclusive copy and repeated content-check approach otherwise match the reviewed retention scope. VEX-R0-002 is a bounded metadata-proof limitation. This review does not authorize copying, source adoption, Git mutations or removal.

## VEX-R0-001 [P2] A failed finalization can produce a success-labelled receipt

Location: reviewed/copy.mjs:157-165 (same line numbers as the source target).

Line 157 sets receipt.completed=true before hashing either retained census. Lines 158-159 still must write native-calls.json, write the receipt and establish its hash/result. If a retained census read/hash or the native-call write fails, catch receives a receipt already labelled completed and line 163 writes it into the partial archive with completed:true plus failure. If the final result write fails after the receipt exists, the existing completed:true receipt is likewise left alongside a failing native process. This violates the handoff's distinction between a successful receipt and a failure receipt and makes the archive's durable completion flag unsafe as a later cleanup prerequisite.

Keep completed:false through every fallible prerequisite, gather the census hashes and required native-call evidence before publishing a successful receipt, and reset failure state explicitly in catch. Define and check the success commit point so that a failure after an immutable receipt is published cannot be presented ambiguously as both successful and failed. Root must require the successful native exit, matching result and receipt hash as well as receipt.completed; a receipt flag alone must never suffice. Preserve exclusive writes and the no-overwrite/no-resume rule in the repair.

This finding follows directly from the assignments and catch path. No fault injection was run.

## VEX-R0-002 [P3] Git-admin stability covers top-level entries only

Location: reviewed/census.ps1:52-59 and reviewed/copy.mjs:86-87.

The census recursively checks admin descendants for links and .lock files, but serializes only Get-ChildItem of the admin root as admin.entries. checkCensus compares only those top-level names, lengths, attributes and timestamps. Existing voxel/.git/worktrees/engine-feedback-voxel-1001/logs/HEAD is a 2,506-byte nested file; its observed timestamp is 2026-10-01 12:37:08 UTC while its parent logs directory is 03:23:44 UTC. A nested file modification need not change its parent's timestamp, so unchanged admin.entries does not prove full admin metadata stability.

Either retain and compare the recursive adminScan file/directory metadata, or explicitly limit the report/receipt claim to top-level admin metadata plus recursive no-link/no-lock checks and logical Git status/index/ref bindings. This is not an observed Git mutation or an omitted selected working file, and it does not show an unsafe traversal. It is a limitation of the requested full metadata check, not a reason to run a Git mutation or hash the payload.

## Source checks supporting the approach

The target and archive are literal fixed roots (copy.mjs:10-17), arguments are refused (:107), and the source cannot be replaced by an invocation parameter. Scoped paths reject traversal, absolute paths, backslashes, colons, repeated separators and trailing dot/space aliases (:31-35). The frozen selected paths already passed the independent selection review. Final expected paths additionally reject case collisions (:137).

The original sealed plan, all eight members, the authored selection report/input manifest, and the five-file executor packet are hash-bound before copying (:115-123). The original 3,175 / 424,222,063 selection, 1,112 index entries, 19 dirty paths, empty staged state, source-parity inputs and unchanged primary counterparts are explicitly checked (:124-144). The source selection remains the full non-cache ordinary inventory minus its two reviewed exclusions; nested evidence is retained. The planned archive contains 3,175 working files and 16 metadata files, followed by its receipt.

Ordinary source files are hashed through an opened handle with dev/inode/size/mtime/ctime comparison to the path before and after (:36-48). Each target is exclusively opened with wx, its streamed digest is checked against the pre-read source digest, then both source and target are rehashed (:97-106). All rows receive another source/archive hash check before success (:150). These checks are meaningful under the declared quiescent-copy assumption; they are not atomic snapshot guarantees.

Native child launch errors, signals and nonzero status throw (:49-55); Git reads disable optional locks. checkGit compares exact source HEAD/branch/status/index/staged state and pointer, the saved primary refs, ancestry and one exact unlocked/unprunable source registration (:56-68). A new unrelated closeout worktree registration is allowed because it is not counted as a source match. Primary docs/work/5_vite-advisories/plan.md is not a source-parity input and is not edited or reset by this executor.

The PowerShell traversal rejects every encountered reparse point before descent, scans excluded root caches for links, checks the full non-cache file metadata against the original and cache count/bytes, and enforces an exact final destination file set (census.ps1:18-29; copy.mjs:80-92). Source directory names are compared before/after. Node records root canonical paths and device/inode identities; ancestor link checks and recursive PowerShell reparse checks supplement this. No full per-ancestor or per-descendant device manifest is retained, and the filesystem identity check treats creation of the destination parent specially (:153); do not describe this as an atomic containment proof.

The source/admin/packet/destination ancestor and recursive link checks, current source Git binding, unopened fresh run/archive requirements and final census are appropriate layers for this fixed quiescent copy. Any fresh mismatch must remain a refusal. The executor creates only its new run evidence/archive; it contains no delete, unlink, controller, Git write, overwrite or resumption path. Existing failed output is intentionally retained.

The shared lock is not acquired, modified or removed by this executor. It requires the caller's exact owner string and only owner.json, binds its bytes before/after, and records that root is responsible for lane reservation/release (:115-116, :155). This is a caller assertion with byte stability, not independent proof that the caller owns an exclusive live process lease. Keep root's owned wrapper and actual child-exit recording as required external preconditions.

CIM enumeration and TCP-listener queries must succeed; unreadable command lines of the named runtime classes, explicit source-path command lines and listeners on 4318/4173/5173 refuse the copy (census.ps1:37-45). No process is terminated. The stated limitations are correct: unlisted executables, relative-path cwd users, open handles and change-and-restore races are not ruled out. Root's independent quiescence check remains necessary.

Outside the changed executor, original plan.md:54-60 requires fresh ownership/source/link state, independently reviewed exact copying, verified retention and separate unchanged-controller handling. The selection review VR-R0-001 still requires canonical closeout; root's separate docs-only worktree is compatible with this copy provided the currently pinned primary refs do not move during the run. A later primary commit will deliberately fail the old ref binding rather than silently widen approval.

## Exact bindings and review limits

| Retained reviewed file | Bytes | SHA-256 |
| --- | ---: | --- |
| reviewed/packet.json | 680 | 989e082570fb645245d3b7e2631476da4095d249b61619f02d383efc7a2cdeef |
| reviewed/copy.mjs | 18081 | 0fb972e7361677c91c4ffad54a9d360dd76013ab85d9353d6316834cfd058e05 |
| reviewed/census.ps1 | 6144 | 8cec65173875c84ef4107b304bf04735f20fdbeffd40809a83f52e2cd4687c2a |
| reviewed/handoff.md | 6365 | 908030423ec3aa592f589a6fab239e3ac54b2420b98524867f8e4e1db7ff3c97 |
| reviewed/inputs.json | 2758 | 77c1faf2f21b6c6cb37eeca32969225b51b84b03ea5b72026af848f7a9224b12 |

All five retained snapshots match the independently read source hashes. The only copy operations in this review preserved these small source-review inputs in the assigned review directory; no worker evidence/archive copier ran. No payload-wide hash, process/port census, controller invocation, native proof, Git mutation, source edit, browser, GUI, server, unlink or deletion occurred. No persistent process was launched. This review reasons about code paths and does not claim that Node/PowerShell file-handle behavior, permissions, process queries, native failure paths, source stability or archive verification have been exercised. The parent's fresh live Git check is supplied context, not independently rerun evidence here.
