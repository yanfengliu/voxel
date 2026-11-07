# Review 4: Townscaper dependency prerequisite

## Target

Townscaper package-lock.json after the bounded development-audit repair, SHA256 a1a58455979cd66270ce7f611dc6479d61fcda27d9bcb32ccd4114f2df2fdde1. This review does not cover the pending producer pin or image-reference repair.

## Reviewers and coverage

Independent gpt-6-astra at xhigh compared the lock against the pre-audit helper-adoption lock, checked incoming dependency ranges and retained registry metadata, and inspected the retained install and audit results. Claude review was unavailable because its OAuth probe returned 401; no Claude review is claimed.

## Reports

No F1+ findings. Approve the bounded lock-only repair on source and retained audit evidence.

Exact target: package-lock.json, SHA256 `a1a58455979cd66270ce7f611dc6479d61fcda27d9bcb32ccd4114f2df2fdde1`, rechecked after review.

- Independently compared against the pre-audit helper-adoption lock, whose hash matches the earlier frozen consumer manifest: exactly 25 existing entries changed, no additions/removals, root requirements unchanged. All seven other previously reviewed source files still match.
- The changes form a bounded compatible closure. All 28 incoming requirement edges accept the selected versions; engine requirements support Node 24. Vite's updated dependencies account for picomatch, Rolldown, OXC types and the 15 platform bindings.
- All 25 entries match the retained registry-derived resolver metadata, including integrity/resolved fields; the brace-expansion v5 alias was explicitly normalized for comparison. Package classifications remain unchanged.
- Three, Playwright, TypeScript, civ-engine source metadata and both Voxel source links are unchanged. No unrelated package updates remain.
- The retained full audit reports 0 high, 0 critical and 9 moderate; all nine moderate records are identical to pre-repair records. Runtime audit reports zero findings. This supports the stated high-threshold result, not a vulnerability-free claim.

Limits: read-only review; no install, tests or browser rerun. The retained npm-ci log shows install completion. Final consumer gates, producer pin acceptance and the separate baseline control remain outside this approval.

## Findings and disposition

No material finding. Accept this prerequisite separately from the shared tone-band implementation. The final Townscaper gates and repeated visual sweep must run with this repaired lock.

## Verification

Retained evidence under the isolated Townscaper output/tone-sharing directory: audit-lock-delta.json, audit-repair-rationale.txt, audit-npm-ci.log, audit-after.json, audit-runtime-after.json and audit-graph-after.txt. Final install/runtime acceptance remains pending.

## Round outcome

Bounded dependency repair accepted on source and retained audit evidence. No high or critical finding remains at this check; nine inherited moderate development findings remain.
