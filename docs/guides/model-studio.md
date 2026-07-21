# Giving a game its own model studio

Status: current from 2026-07-20. The renderer-neutral shell is consumed by
Harborform, while Voxel's own page and the Harbor fixture
(`tools/studio/game-fixture.ts`) prove the grid-renderer adapter.

The model studio is the pattern every game using this engine gets. The engine
owns the reusable half; each game brings its own models. This guide is the
two-file setup and the boundary between them.

## What each side owns

The engine owns one Three-free UI package at `tools/studio/shared-ui`: the exact
top/shelf/stage/player/inspector grid, scoped visual tokens, the standard
**Examine / Build / Edit / Motion / Notes** vocabulary, tab accessibility and
keyboard behavior, disposal, and the normalized browser baseline. V1 keeps the
original five-tab workbench unchanged. The parallel V2 descriptor keeps
Examine mandatory, permits explicit omission of unadopted standard features,
and appends namespaced game add-ons after the enabled standards. A reusable UI
change belongs here, so every mounted game can receive it without a shell fork.

Voxel's grid adapter owns the viewer and orbiting stage, playback and timeline,
frame checks and sprite sheet, voxel editing, notes and requests, recipe
runner, and the agent-facing harness on `window.voxelStudio`. A game with a
different renderer supplies its own stage/player/pane content to the shared
shell without importing `StudioSession`, `StudioModelV1`, Three.js, or the grid
editor. Harborform proves that boundary across the 0.166/0.185 Three.js split.

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
    <link rel="stylesheet" href="../../voxel/tools/studio/shared-ui/style.css" />
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

import { boatRecipe, createBoat, harborParts } from './models.js';

const catalog: StudioCatalogV1 = {
  sections: [
    {
      name: 'Boats',
      models: [{
        id: 'harbor:boat',
        label: 'Fishing boat',
        load: createBoat,
        howItsMade: () => ({ recipe: boatRecipe, parts: harborParts }),
      }],
    },
  ],
};

const studio = mountStudio({ catalog });
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) studio.dispose();
});
```

That is the whole integration. `mountStudio` returns a handle carrying the
harness and an idempotent `dispose()`, for a game that mounts the studio
inside its own page rather than on a page of its own.

The grid adapter import path is relative to the engine repository, not a
published runtime subpath. The UI-only boundary is a private file package,
`@voxel/model-studio-ui`, which renderer-neutral games link from
`file:../voxel/tools/studio/shared-ui`. Both are deliberate dev-time tooling;
the published `voxel` runtime package remains free of authoring UI and its
narrow Three.js peer never enters the shared shell.

## A game with its own renderer

Add `@voxel/model-studio-ui` as a file dev dependency and import the scoped
`@voxel/model-studio-ui/style.css`. A fixed-profile game may continue to call
`renderModelStudioShell` and `connectModelStudioShell`; that V1 pair returns the
five regions and five standard panels exactly as before.

A configurable game calls `renderModelStudioShellV2` with a stable unique
kebab-case `instanceId`, a canonical-order `coreTabs` subsequence containing
`examine`, and any declarative add-ons. Add-on ids use lowercase
`game:addon-name` namespaces and always follow the standards. Mount the
returned markup, then pass its exact shell root to `connectModelStudioShellV2`.
The V2 handle exposes the same five regions plus `tabIds`, `hasTab`, dynamic
`panel(id)` lookup, focus-aware `selectTab`, and idempotent `dispose`.

Do not copy the template, tab list, controller, or outer CSS into the game. A
feature the game never adopts may be omitted in V2; a supported feature that is
temporarily unavailable for one model remains present with a nonempty
accessible explanation. Game add-ons own only their panel semantics and
harness commands. If a capability becomes useful to multiple games, promote it
into the shared package instead of reimplementing it.

## Saving models

The studio edits a model in memory and sends requests; it does not decide
where a game's models live. A game's `load()` may build from a recipe or read
an accepted artifact from its own files, but every catalog entry also supplies
`howItsMade` so the accepted model can be reconstructed from zero:

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

### Household reuse ladder

The **Bedroom furniture** shelf is the reference workflow for building upward
without redrawing an object at a higher level:

1. Save the bed frame, mattress, pillow, blanket, nightstand, and table lamp as
   independently buildable recipes.
2. Build **Made bed** only by placing the saved frame, mattress, pillow, and
   blanket recipes. Mirroring the pillow creates the second occurrence.
3. Build **Bedroom furniture set** only by placing the saved made bed,
   nightstand, and table lamp recipes, then mirroring the bedside pair.
4. Keep every level on the shelf. A designer can inspect the full arrangement,
   expand its parts list, and open each reusable child on its own.

Run `npm run studio:build studio:bedroom-furniture-set` to step through that
complete chain headlessly. Adding a higher-level room later should place these
saved recipes rather than reproduce their internal steps.

Recipe nesting records construction reuse and placement, not physical
attachment. Future body, collider, and joint authoring is a separate versioned
sidecar described by [physical world invariants](../design/physical-world-invariants.md).

## Watching a model get made

Every catalog model declares `howItsMade` and shows its construction in the
studio's **Build** tab: the empty grid it starts from, then the model
after each step, with plain words for what the step did and how many cubes it
added. Play it, step through it, or click any step to see the model as it
stood then.

Recipe-backed models open on **Build**, whose first section is the recipe parts
list. Final ownership removes erased placements and no-op mirrors from the
top-level counts — for example, one table and six chairs — while mirrors remain
in the construction stages instead of pretending to be parts. Expanding an
assembly shows that reusable recipe's saved contents, scaled by the number of
surviving assembly occurrences. A nested recipe placement is a distinct
physical object: if it shares even one solid voxel with another occurrence,
or with paint owned by its parent recipe, the build fails with both stable
occurrence paths, the first conflicting coordinate, and the total overlap.
Painting steps inside one recipe occurrence may still layer intentionally.
Mirrored copies obey the same rule, so a partly blocked reflection cannot
silently become a clipped object. When the child recipe is also a shelf model,
**Open** shows it on its own.

This is an authoring-time occupancy guarantee for recipe-built voxel models.
It prevents intersecting saved objects from reaching the shelf; it does not
claim runtime collision detection or rigid-body physics, which belong to a
game-owned simulation rather than the renderer.

This intentionally tightens the accepted builds for the existing V1 input
shape. A recipe that relied on one nested recipe overwriting another must move
that layering into direct steps of one occurrence or make the placements
disjoint. The serialized fields did not change, but every existing catalog
must be rebuilt through the stricter builder before it is accepted.

```ts
{
  id: 'harbor:boat',
  label: 'Fishing boat',
  load: createBoat,
  howItsMade: () => ({ recipe: boatRecipe, parts: harborParts }),
}
```

Each stage replays the recipe from the beginning rather than hiding voxels
from the finished grid. That matters: a later step may repaint an earlier
one, and hiding would show a hole where the model genuinely had paint.

Previewing a step never costs edits. The studio remembers the model that was
open and puts it back when you press **Finished model** or leave the tab, so
no other tab is ever looking at a half-built model — editing or sending a
request against a partial model would be a silent trap.

`npm run studio:build [modelId] [page]` does the same walk headlessly and
writes the stages tiled into one image, plus a screenshot of the **Build**
panel with its parts list. It is worth running on any recipe you have only
read: watching the Harbor boat get
made is what revealed that its hand-placed oar was landing on cells the hull
had already filled, adding nothing, and that its mirror step was duplicating
the mast rather than the oars. Both were invisible in the finished model and
in every passing test.

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

`tests/browser/model-studio-shell.spec.ts` is the inheritance gate. It runs
the engine page and game fixture through the same marker, region geometry,
five-tab ARIA/keyboard contract, overflow checks, and required-recipe sweep,
then compares normalized workbench chrome against one committed pixel
baseline. Consumer browser checks must assert the same shell contract before
their renderer- and content-specific behavior.
