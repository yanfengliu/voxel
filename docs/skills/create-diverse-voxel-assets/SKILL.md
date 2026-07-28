---
name: create-diverse-voxel-assets
description: Author, expand, curate, purpose-audit, review, promote, or integrate actual creative procedural voxel and low-poly asset content with Voxel Model Studio and downstream game adapters. Use for models, reusable parts, recipes, semantic motion, candidate batches, art-direction matrices, composed visual scenes, unexplained geometry, weak composition, or repetitive catalogs. Do not use for Studio UI, notes or annotations, scene storage/schema/migrations, general occupancy or physics architecture, or documentation cleanup unless the task also authors or reviews creative asset content.
---

# Create Diverse Voxel Assets

Create assets through an authored, reproducible pipeline: gameplay or scene need, contrasting design hypotheses, recipes and parts, structural and visual evidence, deliberate promotion, then consumer integration.

## Route the task

- For every task that creates, changes, promotes, or reviews visible asset or scene content, read [purpose accountability](references/purpose-accountability.md). It is the acceptance gate for every other route.
- For creative model, part, recipe, catalog-content, candidate, or promotion work, read [Voxel Studio workflow](references/voxel-studio-workflow.md) and [diversity review](references/diversity-review.md).
- For authoring or reviewing a composed visual scene, environment, diorama, or asset interaction, also read [scene composition](references/scene-composition.md). Do not load it merely because a tooling or storage task mentions a scene record.
- For integrating authored content in a game repo or across the engine boundary, also read [downstream integration](references/downstream-integration.md).
- For model motion, read the Studio and diversity references; for scene-placement or light motion, also read scene composition; for gameplay animation or state-driven poses, also read downstream integration.
- For an asset-pipeline audit or broad creative expansion, read purpose accountability plus all four route references — all five references total.

Read the selected references completely before editing. Inspect the live repository and its instructions before relying on any command, path, schema, count, or consumer status in the references.

## Non-negotiables

- Keep authoritative simulation and game-specific semantics in the consumer/game or an explicit consumer fixture; never put them in renderer/core. Private Studio may own authoring storage, but not consumer saves or gameplay authority. Keep Voxel inputs bounded, plain-data, deterministic, and game-neutral.
- Treat a recipe as the reproducible source of an asset. A finished voxel grid alone is evidence, not an authoring workflow.
- Promote a reusable part only after a second real use. Prefer honest direct recipe steps to speculative abstraction.
- Count structural ideas, not output rows. Seed changes, palette swaps, arbitrary rotations, mirrors, and small decorations do not establish creative diversity.
- Require a promoted design to contrast with its nearest relevant neighbors on at least two independent major axes. Prefer three when expanding a dense category.
- Treat fingerprints and batch scores as search evidence, never as aesthetic approval. Review every promoted design from multiple views at its intended game scale.
- Never auto-promote generated candidates or rewrite accepted fixtures from generation output.
- Distinguish a comparison board from a composed scene. A grid of unrelated models stays a contact sheet even when every model shares a domain.
- Enforce the no-orphan-pixel invariant at authored-decision granularity. Every visible voxel group, bounded generative rule, exception, void, material change, direct step, part invocation, recipe or model feature, placement, light, and motion must name who or what requires it, its job, location datum, removal and relocation failure, smallest adequate form, evidence, and honesty boundary. Delete anything without that dependency chain; “looks cool,” generic realism, symmetry, surface breakup, and plausible prose do not pass.
- Treat a purpose record as a falsifiable claim, not approval. Require exact record-to-authoring coverage plus subtraction, relocation, simplification, and intended-view evidence before promotion.
- Make visible mechanisms mechanically legible: show or explicitly account for support and load paths, anchors and joints, actuation or power transmission, constrained degrees of freedom, contact or grasp, transfer, and release. If the artifact cannot honestly express these, move the behavior to a consumer fixture or label it a static or kinematic study.
- Give motion semantic work. Do not animate an asset merely to make a playback control active.
- Verify visual behavior in a real browser at fixed camera, viewport, and device scale. Do not approve a rendering or composition from source inspection alone.

## Workflow

### 1. Discover the live lane

Read the applicable `AGENTS.md`, package scripts, and whichever live catalog, recipe and part registries, scene schema, Studio guide, or consumer adapter the task actually touches. Determine which capabilities are public runtime contracts, private authoring tools, explicit consumer fixtures, or game-local code.

Inventory the current catalog by semantic role, shape family, construction grammar, scale, palette-role rhythm, and motion. Identify repetition and missing combinations before proposing more assets.

### 2. Write a contrast brief

State the gameplay or scene job, viewing distance, art-direction invariants, physical or picking needs, animation meaning, and nearest existing neighbors.

Write the purpose ledger before geometry. Trace every authored decision to the consumer, interaction, asset, or scene relationship that requires it; include location, removal, relocation, minimality, evidence, and honesty boundaries. For mechanisms, name the load path, anchor, actuator or power source, joint or constraint, and contact, transfer, and release sequence.

Give each candidate family a one-sentence visual thesis. Name the major axes it must change and the constraints it must preserve. Include at least one cross-family hypothesis and one wildcard hypothesis that changes the organizing idea rather than tuning parameters.

### 3. Generate wide by hypothesis

Generate families of solutions, not a linear mutation chain. Explore topology, negative space, mass hierarchy, proportion, construction grammar, asymmetry, material-role rhythm, articulation, and semantic motion.

Use deterministic batch generation to cover a neighborhood, then author ideas outside that neighborhood. A bounded mutation generator is a search accelerator, not the creative ceiling.

### 4. Build a reuse ladder

Build the smallest useful asset first: direct steps, then an earned reusable part, then a recipe, then a composed recipe, then a scene. Keep role names separate from consumer colors. Preserve deterministic seeds and a reconstructable build history.

Reject empty, invalid, clipped, no-op, non-rebuildable, unintentionally intersecting, hidden-duplicate, or unexplained destructive-repainting results before visual review. Preserve deliberate layering inside one recipe when the live builder permits it.

Before visual review, prove exact purpose-ledger coverage, then run subtraction, relocation, and simplification. Remove each authored scope in turn at the intended camera and scale; restore it only when the recorded failure occurs. Move it away from its datum and reduce it toward the smallest adequate form. If the claim survives removal, arbitrary relocation, or simplification, delete or redesign the scope.

### 5. Select narrow with evidence

Compare every survivor with its nearest catalog neighbors, not only with its source recipe. Record the claimed contrast axes, quantitative support, fixed-view evidence, intended semantic role, and any residual similarity.

Reject false novelty caused by padding, orientation, reflection, palette, seed, or decorative noise. Favor a smaller catalog of legible, reusable ideas over a larger catalog of weak variants.

### 6. Compose scenes as systems

Start with a relationship graph and a spatial story, then place models. Give each placement a role and at least one meaningful relation such as feeds, crosses, supports, gates, frames, serves, signals, or terminates.

Align connection points, routes, elevations, clearances, focal hierarchy, and flow direction. Use contextual terrain, water, roads, rooms, or boundaries when they are necessary to make the relationship readable.

If the current authoring schema cannot express the promised interaction, either build an honest composite, move behavior to a consumer/game-owned simulation or explicit consumer fixture, record a deterministic consumer trace that the renderer only observes, or rename the result as a study. Never imply a working system that is only co-located specimens, and never fabricate contact or completion events from visual proximity.

For physics-backed system scenes, the visual recipe, physical sidecar, consumer adapter, solver trace, and replay presentation must form one evidence chain. Reusing exact sidecars, validating named mating frames, keeping visible and physical supports synchronized, hashing every solver input, and making unsupported replay editing explicitly read-only are promotion requirements, not optional polish.

### 7. Promote deliberately

Assign a durable id, useful name, visual thesis, family, domain, tags, and semantic motion only after review. Register only the recipe, catalog entry, scene record, physical sidecar, or accepted fixture required by the live repository; inspect the live stable-ID catalog or repository and do not assume a planned persistence target exists.

Keep rejected candidates and generated evidence disposable unless the repository explicitly requires durable evidence. Never let the generator edit the catalog.

### 8. Integrate at the right boundary

Place broadly reusable shape grammar and authoring evidence in Voxel only when real consumers earn it. Keep faction, building, road, economy, biome, and gameplay meanings in the game repo.

Translate game state through the consumer adapter into the engine's current plain-data contracts. Verify the actual consumer scene, camera, picking, animation, performance, and teardown rather than treating the Studio preview as integration proof.

### 9. Verify and deliver

Run focused structural tests while iterating, then the repository's authoritative gate. Capture fixed multi-view evidence for models, phase evidence for motion, and a default-view plus adversarial-view proof for scenes.

Adversarially review non-trivial catalog or scene work. Ask the reviewer to find orphan decisions, counterfeit purposes, arbitrary locations, needless complexity, duplicates, weak theses, misleading interactions, boundary leaks, and evidence gaps.

Report the no-orphan audit, visual evidence, tests, commit, and remote status. When the work generated or promoted candidates, also report the exploration count, rejection reasons, promoted ids, contrast axes, and relevant scene relationships. Clean task-owned browser, server, and generated output resources.
