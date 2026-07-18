# Giving a game its own model studio

Status: current from 2026-07-18. The mount seam is proven by the Harbor
fixture (`tools/studio/game-fixture.ts`) and its headless check,
`npm run studio:game`.

The model studio is the pattern every game using this engine gets. The engine
owns the reusable half; each game brings its own models. This guide is the
two-file setup and the boundary between them.

## What each side owns

The engine owns the mechanism: the viewer and the orbiting stage, playback and
the timeline, the frame checks and the sprite sheet, notes and requests, the
recipe runner and the part contract, and the agent-facing harness on
`window.voxelStudio`.

A game owns its content: which models exist and what they are called, the
sections its shelf is organized into, its parts, its recipes, its palettes,
and where its models are saved. Game meaning never enters the engine — the
studio only knows that sections contain models.

## The two files

A game's studio is a page and an entry module. Both live in the game's
repository.

`studio.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>harbor model studio</title>
    <link rel="stylesheet" href="../../voxel/tools/studio/studio.css" />
  </head>
  <body>
    <div id="studio"></div>
    <script type="module" src="./studio.ts"></script>
  </body>
</html>
```

`studio.ts`:

```ts
import { mountStudio, type StudioCatalogV1 } from '../../voxel/tools/studio/index.js';

import { createBoat, createCrate } from './models.js';

const catalog: StudioCatalogV1 = {
  sections: [
    { name: 'Boats', models: [{ id: 'harbor:boat', label: 'Fishing boat', load: createBoat }] },
    { name: 'Dockside', models: [{ id: 'harbor:crate', label: 'Crate', load: createCrate }] },
  ],
};

mountStudio({ catalog });
```

That is the whole integration. `mountStudio` returns a handle carrying the
harness and an idempotent `dispose()`, for a game that mounts the studio
inside its own page rather than on a page of its own.

The import path is a relative path into the engine repository, not a package
subpath. This is deliberate: the studio is dev-time tooling, and the published
`voxel` package stays free of authoring — a renderer that shipped a studio
would be the asset-authoring tool the engine's non-goals rule out. Games in
this fleet already link the engine by path, so the studio comes along with it.

## Saving models

The studio edits a model in memory and sends requests; it does not decide
where a game's models live. A game's `load()` returns whatever it wants —
a model built from a recipe, a model read from its own files, or one authored
by hand:

```ts
import { buildRecipe } from '../../voxel/tools/studio/index.js';

const createBoat = () => buildRecipe(boatRecipe, harborParts).model;
```

## Recipes and parts

A model saved only as a grid can never be improved except by hand. A recipe is
how the model was made — hand-placed voxels, parts run with settings and a
seed, mirrors — so improving a part improves every model whose recipe uses it.

Parts are pure: settings and a seed in, a voxel fragment out, the same
fragment every time. They paint *role names* ('hull', 'mortar', 'trim') rather
than colours, and the recipe's palette gives the names their colours — so the
same part can wear two games' art directions.

Keep the parts a game actually reuses, and no more. Build each model the
fastest honest way, with raw voxels wherever no part fits; when the same shape
gets hand-sculpted a second time, promote it into a part. A part built ahead
of need is a part nobody calls.

The full design, including how craft lessons and parts are shared between
games, is in
[model recipes and shared parts](../superpowers/specs/2026-07-17-model-recipes-and-shared-parts-design.md).

## Driving it from an agent

Everything the buttons do exists on `window.voxelStudio` first. An agent can
open a model, edit it, step frames, sweep an animation for soundness, compose
a sprite sheet, pin notes, and send a request — the same calls, against the
same page a person uses. A control with no harness equivalent would be a claim
about a model that only a human could check, which is the thing this studio
exists to remove.

`scripts/studio.mjs` in this repository is a working headless driver:
`check` judges an animation and writes every frame, `sheet` tiles one period
into a single image, `recipes` rebuilds recipe-backed models and compares them
against their saved grids, and `game` drives the Harbor fixture. A game's own
driver is the same shape pointed at its own page.
