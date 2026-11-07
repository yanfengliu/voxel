# Review 0: plan

## Target

The exact initial plan is retained at ../snapshots/initial-plan.md, SHA-256 3dea263f6789b70165d2b50cd633d6d4ae792d799f254818e9248502e4714363. Declared source bases: Voxel cb148947 and Townscaper 291843c. The review is of the selected tone-band extraction approach, not approval of changing implementation files.

## Reviewers and coverage

Independent gpt-6-astra at xhigh, read-only. Coverage included both operators, real resolve-pass callers, parity and unit tests, package manifests, build emission, public-export checks and the existing consumer source-pin verifier. No builds, browser checks or CLI commands ran in this review. Implementation was progressing concurrently, so exact implementation acceptance requires a later frozen-target review.

## Reports

### gpt-6-astra

Verdict: proceed with this bounded extraction; resolve **F0** before treating GPU parity as acceptance.

Reviewed initial-plan.md, verified SHA-256 `3dea263f6789b70165d2b50cd633d6d4ae792d799f254818e9248502e4714363`. Declared bases: Voxel `cb148947`, Townscaper `291843c`.

- **F0 — P2: Reject non-finite parity samples explicitly.** In Townscaper `scripts/tone-band-parity-check.ts:160`, `Math.abs(NaN)` followed by `>` leaves the zero-initialized worst differences unchanged. If readback contains NaN and the other samples stay within tolerance, the final acceptance expression at line 188 reports success. While extending this gate, require finite CPU/GPU outputs for every sample and demonstrate rejection of a non-finite result. This is an inherited verifier weakness relevant to the plan's principal acceptance evidence.

The sharing boundary is justified by actual duplication and drift: Townscaper's GLSL uses the raw band count at `src/rendering/artStyleToneBands.ts:206`, while its CPU floors it at line 143. Keeping presets, uniforms and complete passes local preserves the meaningful renderer boundary. The peer-free package avoids requiring Townscaper to adopt Voxel's newer Three.js runtime.

Coverage included both operators, real resolve-pass callers, parity and unit tests, package manifests, build emission, public-export checks and the existing consumer source-pin verifier. The new pin must coexist with Townscaper's existing UI subtree pin. No broader renderer migration or performance benefit is justified by this slice.

Limitations: read-only plan review; implementation files were changing concurrently. No builds, browser checks or CLI commands ran. This approves the approach, not the final implementation or its reported test results.

## Findings and disposition

| ID | Finding | Disposition and reason | Repair or follow-up |
|---|---|---|---|
| F0 | Non-finite GPU samples can evade parity maxima | Accepted; the primary acceptance gate must reject non-finite output | Consumer owner will add finite checks and a failing non-finite control; final implementation review will inspect the repair |

## Verification

Reviewer verified the retained plan digest and read the source sites. Coordinator separately observed the consumer worker's real-GPU RED report; that report is not this review's verification. Claude 2.1.308 with the pinned model was unavailable because its login probe returned an expired OAuth token (401); no Claude review is claimed.

## Round outcome

Approach accepted with F0 required before GPU acceptance. Final code, source identity, package emission, visuals and gates remain to be verified and reviewed.
