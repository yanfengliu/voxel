# Voxel Studio workflow

Use this reference for the Voxel repository or a consumer that has adopted the shared Model Studio shell. Verify every path and command against the live checkout before acting.

## Ownership and vocabulary

The Studio is private development tooling, not a public runtime asset-evolution API. It works with:

- **parts**: deterministic settings-and-seed functions that paint semantic material roles;
- **recipes**: rebuildable sequences of direct voxel work, positioned part invocations, positioned nested recipes, explicit X- or Z-mirror steps, and whole-model motion;
- **models**: built outputs presented on the shelf with `howItsMade`;
- **scenes**: arrangements of reusable whole models, plus whichever lights and motion the live scene schema supports;
- **physical sidecars**: optional separate rigid-body, collider, sensor, hinge, slide, and port meaning; they describe composition but run no solver.

Resolve scenes through the live stable-ID catalog or repository when one exists. Keep the scene document, review annotations, replay payloads, and solver artifacts as separate records or artifacts; inspect the implementation and do not assume a planned repository or migration has landed.

Use the reuse ladder `direct steps -> earned part -> recipe -> composed recipe -> scene`. Do not create a part before two real assets need the same shape grammar.

## Human Studio loop

1. Run `npm run studio` from Voxel and open the local URL Vite prints.
2. Use **Models**, **Parts**, **Recipes**, and **Scenes** to inspect the current catalog.
3. Use **Examine** for metadata and role, **Build** for construction stages and nested reuse, **Motion** for phase semantics, and **Notes** for review findings.
4. Inspect the asset from several yaws, at the intended game scale, in both study-edge and game-like presentation where applicable.
5. Pin concrete notes against geometry or composition.
6. Use Build stages and fixed views for the subtraction-and-relocation pass; pin a note whenever an element's job, location, support, actuation, or handoff is not visibly legible.
7. Use **Send request** only as a brief handoff. Voxel's dev server saves JSON under `tools/studio/requests/`; it does not start an agent or send a notification.

Everything important should also be reachable through `window.voxelStudio`. Prefer that harness for deterministic browser evidence rather than inventing a parallel debug path.

Voxel currently has no single generic package command that captures an arbitrary named scene. For scene evidence, drive the real page headlessly, wait for `window.voxelStudio`, call `openScene(sceneId)`, set an explicit viewport and view, and capture the default and adversarial views. Reuse an existing browser helper when live files provide one; otherwise add a focused repository-owned driver or test with explicit browser and server cleanup rather than claiming `studio:diversity` rendered the scene.

## Recipe implementation

For an ordinary recipe:

1. Add its creator to the appropriate `tools/studio/*-recipes.ts` module, or create a focused module for a genuinely new section.
2. Add it to that module's recipe book.
3. Add its `recipeEntry` to the correct `tools/studio/catalog.ts` section, plus a physical-book entry when needed.
4. Ensure the aggregate recipe book and shelf-registration tests see it exactly once.

For a curated contrast recipe:

1. Author it in the matching `contrast-*-recipes.ts` family module.
2. Give it a meaningful `studio:contrast:*` id, label, summary, tags, domain, visual thesis, deterministic seed, palette roles, steps, and earned motion.
3. Add it to that module's exported curated family array. The aggregate contrast book and catalog sections derive from those arrays.
4. Add it to a hand-authored scene only when it has a real compositional role. Catalog coverage alone belongs in contact-sheet evidence.

Use direct steps when no reusable grammar fits. Use `partStepV1` for an earned part and nested recipe placement for a reusable assembly. Watch the Build stages to catch forbidden nested-occurrence intersections, hidden duplicate mass, accidental or unexplained repainting, no-op steps, clipped mirrors, and misleading construction prose. Direct steps within one recipe may layer deliberately when the builder contract permits it.

For a non-trivial recipe, group steps into named authored features and record each feature, part invocation, material accent, and motion in its Build note or a creator-local purpose map; reserve the fuller location, removal, and relationship record for non-obvious or mechanical choices, and test coverage without inventing a public schema.

Run `npm run studio:build <modelId>` for a headless construction sheet when the live script supports the model. Inspect `scripts/studio.mjs` and `package.json` before assuming additional subcommands in a consumer repo.

Run `npm run studio:recipes` to rebuild the live shelf recipes, compare baked parity, and produce recipe evidence when the current package script still provides that contract.

## Candidate generation and diversity evidence

In Voxel, `npm run studio:diversity` starts and closes its own headless Studio and writes ignored evidence under `output/playwright/studio-diversity/`:

- one four-yaw contact sheet per accepted contrast family;
- one four-phase sheet for accepted models with semantic motion;
- `manifest.json`;
- `report.json` for accepted catalog fingerprints and neighbors;
- `candidate-report.json` for every generated proposal, survivor, and rejection.

The current bounded generator attempts 64 deterministic candidates per contrast family through part-setting changes, subtraction, step reordering, relayout, duplication, mirroring, and bounded accents. It rejects empty, invalid, duplicate, and quantitatively weak proposals. Every human-review survivor carries a frozen rebuildable recipe. It preserves the source seed, palette roles, palette, and motion and does not invent a semantic brief, family, part grammar, palette concept, or motion concept.

The generator never promotes, registers, or rewrites acceptance. Its `promotedRecipeIds` must remain empty. Treat survivors as prompts for visual review, not accepted assets.

`fingerprintStudioModelV1` and `analyzeStudioCatalogDiversityV1` provide topology and render hashes, occupied bounds and proportions, density, exposed surface, connected components, symmetry, palette use, six normalized silhouettes, nearest neighbors, part and category coverage, and seed sensitivity. They are orientation-sensitive and do not judge aesthetics, construction meaning, motion semantics, or scene coherence.

The generated contact sheets show already accepted catalog recipes, not unpromoted candidate survivors. The runner checks the accepted fixture before rendering and stops on catalog or hash drift, so use it as accepted-catalog evidence rather than pretending it is a complete candidate-review UI. Render shortlisted candidate recipes through a deliberate preview path before promotion.

Use the existing builder and harness for that preview. Read `candidate-report.json` in the Node driver, pass one survivor's frozen `recipe` into the page, build it with the live parts and recipe books, then call `window.voxelStudio.load(model)` before sampling fixed views:

```js
await page.evaluate(async (recipe) => {
  const [{ buildRecipe }, { createStudioParts }, { createStudioRecipeBook }] = await Promise.all([
    import('/recipe.ts'),
    import('/parts.ts'),
    import('/recipes.ts'),
  ]);
  const built = buildRecipe(recipe, createStudioParts(), createStudioRecipeBook());
  window.voxelStudio.load(built.model);
}, candidate.recipe);
```

Run this inside the repository's owned headless browser and Studio-server cleanup path. Do not temporarily catalog-register a candidate merely to obtain a picture.

## Promotion

Before promotion:

1. Rebuild the candidate from its frozen recipe.
2. Compare it with its nearest live catalog neighbors from multiple fixed yaws.
3. Inspect its Build stages and intended game-scale silhouette.
4. Confirm at least two independent major contrast axes and no orientation, reflection, seed, palette, or padding false positive.
5. Give it a durable authored identity and rewrite generated construction prose where needed.
6. Place it into a coherent scene or a clearly labeled comparison board only when that evidence adds value.
7. Update `tools/studio/fixtures/diversity-accepted-v1.json` manually only after the accepted visual and structural evidence has been reviewed.

Run focused recipe, catalog, diversity, scene, and browser tests while iterating. Run `npm run verify` before committing code in Voxel.
