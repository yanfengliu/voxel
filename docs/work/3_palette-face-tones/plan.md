# Caller-owned palette face tones

Status: active
Owner: engine_palette_style
Created: 2026-10-18
Updated: 2026-10-18

## Problem and outcome

The owner requested reusable engine support and durable learnings from an independent reference-art study, so later games can reuse the mechanism without inheriting one asset recipe. The study exposed content and sampling problems; no generic renderer defect was established. Deliver a small optional palette-face remap and an authoring guide whose claims stay within the observed evidence.

## Scope

Owner: engine_palette_style, assigned by the coordinating art-study session. Base: main 55af3d3 (two fetched canon-only commits after the assignment's 5d6d4c9). Workspace: isolated managed palette-face-tones worktree. Include portable meshing helper, additive 1.3.0 API report, focused tests, a tiny original public-runtime fixture, guide, review and delivery. Exclude game code, content recipes, AO, worker-contract changes, render defaults, new dependencies, imported reference pixels, and any change to the primary checkout's preexisting AGENTS.md modification.

## Approach

Add `shadeVisibleFacePaletteV1(mesh, tones): Uint16Array` with caller-owned six-slot mappings in -X,+X,-Y,+Y,-Z,+Z order. The support policy explicitly permits opt-in APIs in a minor release. Preserve unmapped slots and original geometry. Resolve slots to caller sRGB8 vertex colors through existing unlit geometry resources. No occupancy reads means no additional chunk-neighbor or invalidation contract. Normals are local to the asset; a rotating asset rotates its tones. The [guide](../../guides/voxel-palette-style.md) carries practical limits rather than adding a broad art rule.

Evidence supplied by the coordinating session: frozen-original.png SHA-256 `83bea5c03c0293710b27578bc0b2d6cf86fbb47bbe987695f9a3a7b1861016ef`, independent local art-study outputs dated 2026-10-18. M01–M06 were rejected broad screen-profile extrusions despite 2D landmark overlap. M07 used actual anatomical volumes but half-unit pitch plus stronger per-face tones produced dense contour hatching in review. M08/M09 used quieter tones and one-unit pitch projecting about 2.37 pixels at the matched camera; neither was approved as final art. M09's independent multi-angle review verified depth but rejected likeness, including the effect volume and merged cheek/neck/underside forms. Those observations motivate an opt-in tone mechanism and better content review; they do not demonstrate universal art thresholds or a renderer bug.

Provenance: the independent local study's original caller helper in outputs/source/m09-author.mjs was candidate behavioral evidence, not imported code. The new helper and one-cell/two-cell fixtures are authored here from the public mesh contract. External reference artist, source license and redistribution permission were not supplied for the frozen image, so no reference pixels or derivative asset recipe enter this repository. No claim of reference redistribution rights is made. Broader references remain separate visual observations owned by the coordinating session.

## Acceptance criteria

- Existing mesher/default output is untouched; opt-in results deterministically map six face directions, preserve unmapped slots and inputs, and reject malformed mappings/flat-face lanes.
- Original tiny occupancy tests cover literal direction slots, one-shot remaps, negative origin, local/world position space and a hidden neighbor face. A deliberate direction mutation must make the fixed literal expectation fail.
- A headless fixture consumes the built public API, resolves slots to unlit vertex colors, checks captured sRGB on all six faces across opposite views, and receives native-resolution visual inspection bound to capture hashes.
- Preserve substantive independent review reports, run final `npm run verify`, integrate main, push, follow available CI, and remove owned worktree/processes. Report failed, unavailable or skipped checks and bounded visual acceptance.

## Implementation steps

- Implement portable remap and tests, then document caller ownership and study limits.
- Run focused correctness, browser, strict and mutation checks; obtain the pinned independent multi-CLI review and resolve material findings.
- Serialize the full final gate with other sessions, then integrate, push, follow CI and clean owned resources.

## Outcome

Focused checks: 11 unit tests passed; swapping the X-direction mapping produced two failures and nine passes, then the exact original source was restored and 11 passed. Strict typecheck and focused ESLint passed after expressing the tuple-length runtime guard as a general array-length check. The headless public-runtime fixture passed in 2.7 seconds (test body 1.4 seconds under the unchanged 111-second suite budget).

Native 640×480, DPR1 SwiftShader captures were inspected directly: front SHA-256 `ddef20141c3e775afa452caa66bd5ec7f0ef73a6d517671ef1f947606e5cea63`, reverse `9d8519a64d66f4e55e7b9c25f617345e64461fbe2e2ab6be989780967b75cbff`. Each shows the intended three intact flat cube faces, without borders or extra geometry; opposite views cover six directions. Captures remain ignored task evidence until review/delivery cleanup. This is a palette-transfer proof, not a model-approval result.

Required audit preparation exposed inherited HIGH development-only source-map-js1.2.1, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), patched upstream in1.2.2. Coordinator approved the minimal existing-range lock repair. `npm update source-map-js --package-lock-only --ignore-scripts` changed only that package's version/URL/integrity in addition to intended root version metadata; clean `npm ci --ignore-scripts` and `npm run test:supply-chain` passed, with zero runtime findings and two existing moderate Vitest findings, no high/critical. This maintenance issue is separate from the visual study.

Independent review, final full verification and integration pending.
