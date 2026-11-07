# Review 8: final consumer source integration

## Target

Townscaper's 16-file final-consumer-manifest.json, SHA256 36520f229149aaf5a1c5fa038ecead77244f3bd9dae7b48c35ceee023fca3093, against base 2df6eb4f03de3d550af7485f8090dd20ca18907a. Coordinator-owned progress.md is excluded. The target binds the final source pin, accepted lock repair, far reference and implementation documentation.

## Reviewers and coverage

Independent gpt-6-astra at xhigh inspected all listed hashes and sizes before and after review, compared the earlier reviewed source and lock targets, checked actual producer Git trees and installed junctions, and read the normal-product runtime evidence. No install, build or browser ran during review.

## Reports

No new material findings. Source acceptance passes; final gate acceptance remains pending.

- The seven source files retain their previously reviewed hashes. The lockfile remains the approved repair, SHA256 a1a58455979cd66270ce7f611dc6479d61fcda27d9bcb32ccd4114f2df2fdde1; no additional dependency drift.
- The tone pin names actual commit 5593964a88188da0f0ee87ed83a82b49e3f87cf5. Its package tree is 8fb3a7bd908057a999b5f4de1e6b47a738860031, matching the clean current source. Committed implementation/package metadata match the reviewed producer; LICENSE differs only by Git's CRLF normalization.
- Both installed packages are junctions to their verified Voxel directories. The existing UI pin remains c349114ab14b9d6b211ca427c572237eac7a6767, with its original tree intact. The retained source-verifier log confirms both checks.
- The tracked far PNG exactly matches the independently verified packed candidate: 523,082 bytes, SHA256 a6650d7e7b75be22d796d3d588bf71d0d72fec47556a586ab0882ee2b3d010db. Baseline documentation accurately records the coverage=1 causal control and lossless comparison. The baseline harness and resolve pass are unchanged from the original base; the far threshold remains 0.0002.
- Architecture/devlog changes stay within the selective-sharing scope. Retained normal-product evidence reports one Three revision-166 core module, no duplicate-instance warnings and no page errors. The helper has no dependencies or peers.

Limits: read-only source/evidence review. The final baseline, repeated 168-view sweep, tests, typecheck, lint, build and audit results must still pass before delivery acceptance.

## Findings and disposition

No new material finding. Earlier F0 and F1 remain resolved in their reviewed repairs. Accept the exact final consumer source, preserving separate gate and delivery acceptance.

## Verification

Reviewer matched every final-manifest file hash/size, seven earlier source hashes, the repaired lock digest, source Git trees and installed junction targets. Original renderer-baseline-check.ts and artStyleResolvePass.ts remain unchanged. The coordinator will recheck the manifest before committing and bind it to the delivered consumer commit after the gates.

## Round outcome

Final consumer source integration accepted. This round does not substitute for final executable checks or claim hosted CI is green.
