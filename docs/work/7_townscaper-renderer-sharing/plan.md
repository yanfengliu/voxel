# Share renderer infrastructure with Townscaper where it reduces maintenance

Status: active
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
| Implement producer extraction and focused coverage | engine_quality | complete | Eight paths frozen and independently source-reviewed; full gate remains separate |
| Verify the producer with its complete gate | engine_quality | complete | npm run verify exit 0: 2,438 unit tests passed, one skipped; 137 browser tests passed; maximum browser budget consumption 23%; owned process cleanup verified |
| Reproduce GPU mismatch and implement consumer adoption | consumer_usage | complete | Code frozen and independently source-reviewed; exact producer pin remains an integration dependency |
| Run headless visual/control and resource checks, then final gates | consumer_usage/coordinator | active | Native sweep and image inspection 168/168 and startup controls pass; final repaired-dependency sweep and inherited-reference control now running |
| Obtain independent review and resolve material findings | coordinator/reviewer | complete | Source reviews 1 and 2 pass, F0 resolved; final pin/integration checks remain separate |
| Repair inherited Townscaper audit prerequisite | consumer_usage | complete | Minimal compatible lock repair independently reviewed in round 4; zero high/critical and nine inherited moderate development findings; runtime audit clean; final gates remain |
| Confirm and repair inherited far reference | consumer_usage/sharing_review | pending | Old-tone control is byte-identical to candidate; reference predates intentional October 17 ink-coverage change; after heavy lane, one-uniform control must recover old reference before refreshing only that PNG |
| Pin the verified producer and run final consumer gates | coordinator/consumer_usage | pending | Depends on producer final gate/commit and the two inherited prerequisites |
| Integrate, push, follow CI and clean owned resources | coordinator | pending | Verified and reviewed integrated revisions |

## Outcome

Producer implementation, independent review and complete local verification passed; consumer final acceptance remains active. The consumer's expanded real-GPU check first failed against its original shader, then passed the shared shader on the same RTX 4090 ANGLE D3D11 path: 1,152 points in nine cases, maximum error 1.428e-7 below 1e-5. A NaN fault control exits nonzero. The first 168-view native sweep and inspection passed; the repaired-dependency repeat and causal far-reference control remain pending. No performance improvement is claimed. Source reviews 1 and 2 pass, lock prerequisite review 4 passes, and final pin/integration acceptance remains separate. Concurrent documentation updates advanced the isolated bases to Voxel c5be6e2 and Townscaper 2df6eb4 without changing reviewed runtime code. Voxel main's inherited hosted browser-cost failures and Townscaper's unrelated unfinished water work remain separate from this milestone.

Townscaper work-folder allocation refused its pre-existing unregistered docs/work/765_moebius_outline; that foreign folder and registry are preserved, and this Voxel work unit tracks the cross-repository deliverable. Townscaper has no hosted Actions runs or workflow at this base, so hosted acceptance applies to Voxel; Townscaper uses the local required gates. Voxel reservation 6 is carried unchanged solely to preserve the allocator sequence; its planned work remains owned by the other session.
