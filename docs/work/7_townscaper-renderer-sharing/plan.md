# Share renderer infrastructure with Townscaper where it reduces maintenance

Status: complete
Owner: Codex integration coordinator
Created: 2026-11-07
Updated: 2026-11-07

## Problem and outcome

Townscaper and Voxel both use Three.js, but maintain separate rendering infrastructure. The owner asked to track the recommended selective sharing work and begin it. Deliver one bounded integration that removes real duplicated maintenance or fixes a demonstrated shared problem, while Townscaper keeps its procedural architecture, water, art direction and interaction semantics.

## Scope

Voxel base cb148947 and Townscaper base 291843c, in sibling isolated worktrees under voxel/output/shared-renderer-20261107. Existing primary changes and all unrelated water worktrees are foreign and remain untouched. This first milestone excludes a wholesale renderer migration, new general-purpose engine systems, save-format changes, and changes to City or AoE2. Dependency alignment is considered only if a demonstrated selected integration requires it; broad Three.js migration is not the default.

## Approach

Share the existing tone-banding CPU functions and GLSL function bodies through a private, peer-free source package at Voxel src/rendering/tone-bands. Both renderers currently duplicate these functions, and Townscaper's GLSL missed Voxel's fractional-band flooring correction: bands 2.5 over range 0.2..0.8 can map the ceiling to 0.92 while the CPU returns 0.8. Keep local uniforms, measured presets and complete passes in their existing owners. Preserve Voxel's public exports and emitted self-contained package. Townscaper adds a pinned file source dependency; neither project's Three.js version changes.

The existing Townscaper float-target GPU parity check will first reproduce the fractional-count mismatch against unchanged rendering code, then verify the shared implementation. Lifecycle and capture were rejected for this milestone because their ownership and revision contracts differ, so extracting common plumbing would add coupling with little removal.

## Acceptance criteria

- The selected integration names the duplicated sites, resulting responsibility boundary and concrete benefit.
- Changed behavior has a failing regression check before the repair; unchanged behavior has appropriate parity evidence.
- Townscaper's supported visuals, interaction, resource ownership and package identity remain coherent; no duplicate Three runtime is introduced.
- Relevant targeted checks and required final repository gates pass on the integrated revisions. Any inherited failure is independently reproduced and recorded honestly.
- Independent review covers the exact changed producer and consumer revisions; material findings are repaired and checked.
- Changes are merged to main and pushed, remote CI is followed to completion, and only owned temporary resources are cleaned.

## Implementation steps

| Todo | Owner | Status | Dependency and next action |
|---|---|---|---|
| Identify Townscaper duplication and select the first component | consumer_usage | complete | Tone-band CPU and GLSL duplication selected; fractional mismatch identified |
| Confirm Voxel contract, packaging and compatibility | engine_quality | complete | Peer-free source package under src emits self-contained dist; public reexports retained |
| Record the selected contract and implementation acceptance | coordinator | complete | Pure functions and GLSL bodies shared; presets/uniforms remain local |
| Implement producer extraction and focused coverage | engine_quality | complete | Eight reviewed paths bound to producer commit 5593964; complete local gate passed |
| Verify the producer with its complete gate | engine_quality | complete | npm run verify exit 0: 2,438 unit tests passed, one skipped; 137 browser tests passed; maximum browser budget consumption 23%; owned process cleanup verified |
| Reproduce GPU mismatch and implement consumer adoption | consumer_usage | complete | Reviewed source pins producer 5593964; consumer f0123b8 merged/pushed |
| Run headless visual/control and resource checks, then final gates | consumer_usage/coordinator | complete | All 2,004 Town tests and type/lint/build/audits pass; 13 baselines exact; final 168 native captures byte-identical to inspected originals; owned browsers/servers exited |
| Obtain independent review and resolve material findings | coordinator/reviewer | complete | Source, lock, reference and final pin reviews pass; F0/F1 repaired and rechecked; reviewed files bound to delivered commits |
| Repair inherited Townscaper audit prerequisite | consumer_usage | complete | Minimal compatible lock repair independently reviewed in round 4; final clean-install audits pass with zero high/critical and nine inherited moderate development findings; runtime audit clean |
| Confirm and repair inherited far reference | consumer_usage/sharing_review | complete | Coverage=1 control recovers every old reference pixel; independently verified lossless far-only refresh reflects the intentional October change; unchanged final gate passes all 13 views exactly |
| Pin the verified producer and run final consumer gates | coordinator/consumer_usage | complete | Producer 5593964a88188da0f0ee87ed83a82b49e3f87cf5 pinned; combined UI/tone source verification and all final consumer gates pass |
| Integrate, push, follow CI and clean owned resources | coordinator | complete | Both sources merged/pushed; hosted CI followed to terminal failure and diagnosed against prior main; evidence retained; disposable worktrees/branches removed during final publication |

## Outcome

Producer 5593964a88188da0f0ee87ed83a82b49e3f87cf5 and consumer f0123b88051dfaf6665c4ea7c901fed956837954 are merged to main and pushed. Independent source reviews and both complete local gates passed. The consumer's expanded real-GPU check first failed against its original shader, then passed the shared shader on RTX 4090 ANGLE D3D11: 1,152 points in nine cases, maximum error 1.428e-7 below 1e-5; a NaN control fails as intended. All 168 final native captures exactly match the first inspected gallery. The original baseline gate passes all 13 views after an independently proven, lossless refresh of the stale far reference. Runtime audit is clean; nine inherited moderate development findings remain, with no high or critical finding. No performance improvement is claimed.

Hosted Voxel CI run 42413010520 completed failure. Both portable jobs and audit/package passed. Linux passed 2,438 unit tests and all 137 browser assertions, then failed the headroom guard: unchanged Oak stages test :76 took 170.6 seconds of its 214-second budget (80%, limit 75%). Prior main cb148947 failed the same guard at 165.1 seconds (77%), also with all 137 browser assertions passing. Windows cancelled after 90 minutes 14 seconds against its 90-minute budget: 124 browser tests passed, five failed and eight did not run. The prior main run also had Oak HUD, keyboard and growth timeouts and cancelled during the milestone retry. These observations support an inherited timing problem; they are not a controlled performance comparison or a green hosted result. See [final acceptance](snapshots/final-acceptance.md) for the exact limits. Concurrent documentation updates were incorporated without changing reviewed runtime code. Townscaper's unrelated unfinished water work remains preserved.

The primary Voxel checkout retains evidence under output/shared-renderer-20261107/evidence: townscaper holds the inspected gallery and consumer proof, and voxel holds local/hosted verification and producer proof. Their RETENTION.md files map historical paths. The 168 duplicate second-sweep images were rehashed before deletion. Disposable checkouts, merged task branches, test probes and temporary authentication files are cleaned during final publication; the primary consumer's required package link and the intentional evidence remain. A fresh census checked 33 recorded identities and eight profile names and found no matching process.

The primary Townscaper install received its previously absent tone-band junction, targeting the primary Voxel source directory; both committed source pins then verified successfully there. The dependency audit results above describe the isolated clean install of the reviewed lock. Existing primary tooling still includes Vite 8.1.2; a subsequent npm ci applies the committed tooling patch as well as rebuilding the local package links.

Townscaper work-folder allocation refused its pre-existing unregistered docs/work/765_moebius_outline; that foreign folder and registry are preserved, and this Voxel work unit tracks the cross-repository deliverable. Townscaper has no hosted Actions runs or workflow at this base, so hosted acceptance applies to Voxel; Townscaper uses the local required gates. Voxel reservation 6 is carried unchanged solely to preserve the allocator sequence; its planned work remains owned by the other session.
