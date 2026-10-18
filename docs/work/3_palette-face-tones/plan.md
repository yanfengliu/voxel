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

Evidence supplied by the coordinating session: frozen-original.png SHA-256 `83bea5c03c0293710b27578bc0b2d6cf86fbb47bbe987695f9a3a7b1861016ef`, independent local art-study outputs dated 2026-10-18. M01–M06 were rejected broad screen-profile extrusions despite 2D landmark overlap. M07 used actual anatomical volumes, half-unit pitch and stronger per-face tones; the review described improved depth and dense contour hatching. M08/M09 used quieter tones and one-unit pitch projecting about 2.37 pixels at the matched camera; neither was approved as final art. M09's independent multi-angle review verified depth but rejected likeness, including the effect volume and merged cheek/neck/underside forms. Those observations motivate an opt-in tone mechanism and better content review; they do not demonstrate universal art thresholds or a renderer bug.

The later M12 study used the built public helper and a caller-owned occupancy-occlusion pass. Independent review judged genuine depth and material cleanup as progress, but withheld faithful reference approval. Its immutable external packet `m12-visual-20261018` has manifest SHA-256 `cd28bbceb263e3615adb165a9b01ef23c1344c31fd847093342b8468d82c3d25`; the packet explicitly froze while the engine gate/integration was still running. Its pinned compiled helper/public-index hashes equal the implementation's build. The fitted nine views were reviewed without clipping; the old clipped reverse view is retained as a failed capture. Losing capture names had earlier written to one undefined.png path nine times; the failure log, capture preflight checks and corrected distinct paths/hashes were retained before independent review. These are study-authoring failures, not engine defects.

Broader references actually inspected by the coordinating session, kept as view references with no pixels imported into this repository:

- [Teardown official courtyard](https://teardowngame.com/assets/img/screens/s1.jpg), 1920×1080, SHA-256 `8a2dcc3020701b8e8ba48556bd4ec9d150460b4bc2bb55f7ca27613114f16e9b`: fine cubic geometry, coherent material groups, warm direct light, contact shadows and dust.
- [Town to City official Steam aerial image](https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3115220/005d9abe0e09e6fedda1ad9010b9b93e703631ed/ss_005d9abe0e09e6fedda1ad9010b9b93e703631ed.1920x1080.jpg?t=1789996992), 1920×1080, SHA-256 `735ea650877769b49c8a13dbda46c9e226ddb5357a6a706d3075cba51fdd4a07`: voxel grain subordinate to landmarks, routes, roof masses, water and warm long shadows.
- [Voxels.ca Settlers Keep](https://voxels.ca/settlers-keep), [inspected character image](https://carbon-media.accelerator.net/0000000eidI/3Kbn4RrvRVidRVjv6MdrVU;1579x783.png?auto=webp), actual WebP 1579×783, SHA-256 `23e05f634148ead932c052ebe5739065d6c6f22998be5abef3faa4af1d2cc359`: enlarged head/ears/hat/hands, open limb gaps, restricted olive/tan/blue regions and broad shaded planes.
- [Sir Carma firsthand interview](https://80.lv/articles/sir-carma-magica-voxel-was-like-having-infinite-legos-in-my-computer), retained general environment image 1860×1500, SHA-256 `c2e68b7a9169be5aa1b83af675e75567db708ba82d0cf1c3ac12cc65b14c24fe`: large cliff/castle/water masses, clustered crowns and roofs, small voxel accents and legible route/water gaps. The interview describes separately rendered MagicaVoxel sections and postproduction in a general 2015 workflow; it is not verified Latica Cliffs imagery or settings. That specific primary/mirror remained blocked, so no pixel traits were inferred for it.

These comparisons support keeping palette, material, lighting and part grammar with the caller. They are visual observations rather than runtime performance evidence or universal style doctrine. Reference licenses and redistribution permissions were not established; no reference media is redistributed here.

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

Required audit preparation exposed inherited HIGH development-only source-map-js 1.2.1, [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), patched upstream in 1.2.2. Coordinator approved the minimal existing-range lock repair. `npm update source-map-js --package-lock-only --ignore-scripts` changed only that package's version/URL/integrity in addition to intended root version metadata; clean `npm ci --ignore-scripts` and `npm run test:supply-chain` passed, with zero runtime findings and two existing moderate Vitest findings, no high/critical. This maintenance issue is separate from the visual study.

Implementation commit `3c5959643bf66e4ed18601ea2e79dcca4aa3823f` recovers the exact reviewed candidate: excluding the subsequently added review record, its diff from base reproduces patch SHA-256 `e8944d95d9e4d930f7122b1fc603267693bd93ce3f7532a5b8e6e352ea36b38e`. [Review 0](reviews/0_implementation.md) found no material defect in the available Astra lane; pinned Claude abstained on weekly quota. No code changes followed that review.

Final `npm run verify` exited 0 in 1159.549 seconds on Node 24.12.0, Windows, with pinned headless Chromium/SwiftShader, viewport 640×480/DPR1 for the new fixture: all thirteen stages passed, 2434 unit tests passed with one existing skip, and all 136 browser tests passed. The two palette captures retained the exact inspected hashes in this complete run. No performance claim is inferred from software-rendered timings.

Fresh baseline hosted run [39152993370](https://github.com/yanfengliu/voxel/actions/runs/39152993370) on origin/main d2d8be0 failed both complete lanes and audit/package on the inherited source-map-js HIGH finding, verified from failed step logs. Those complete lanes did not reach browser tests, so they establish no fresh font/pixel result. The final local candidate passes the audit after the compatible lock repair.

Latest main differs from the source base only in AGENTS.md canon text. Doc-only provenance/capture guidance and binding records follow the implementation commit. Integration, final main build equality, push, hosted CI and cleanup remain pending.

[Review 1](reviews/1_integration.md) retains supplemental coordinating-agent inspection of the committed source and doc-only integration candidate. No material issue was found; its one capture-count wording nit was accepted. This supplements, rather than replaces, the pinned source review.
