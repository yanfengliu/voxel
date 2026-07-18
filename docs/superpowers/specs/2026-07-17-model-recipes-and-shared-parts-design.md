# Model recipes, shared parts, and the craft cookbook

Status: direction agreed 2026-07-17 by the owner — models keep the way they
were made, craft lessons aggregate in one shared place, and parts are shared
by graduation. Step 1 of the build order landed 2026-07-17:
`tools/studio/recipe.ts` (schema, validation, builder with per-voxel
provenance), `tools/studio/parts.ts` (the box and brick-wall parts),
`tools/studio/recipes.ts` (the shelf models as recipes), pinned cell for cell
by `tools/studio/recipe.test.ts` and `tools/studio/parts.test.ts`, and
rendered for a look by `npm run studio:recipes`. Steps 2–6 remain open.

## Why

Today a studio model is a finished voxel grid. Every improvement — a better
roof line, a cleaner walk — lives and dies inside the one model it was made
in. The next model starts from nothing, and the agent building it starts
from nothing too. The owner's direction: build up parts, ways of combining
them, and working methods so model making improves over time instead of
being one-shot every time. The studio is the harness for judging models;
this is the harness for making them.

## The rule everything hangs on

Save how a model was made, not only the finished voxels.

A recipe is a short ordered list of steps — "floor slab here, wall part
around it, roof part on top with these settings, mirror it, then these
thirty hand-placed voxels for the chimney." Running the recipe with its seed
rebuilds the exact grid, every time. Once the recipe is the source and the
grid is derived, improvement compounds: make the roof part better, rebuild,
and every building that uses a roof gets the better roof.

This is the rule the engine already lives by, one level up: the simulation
is authoritative and meshes are derived; here the recipe is authoritative
and the grid is derived. [model.ts](../../../tools/studio/model.ts) already
points this way — the seed field exists so "every random choice a generator
makes" can flow from it, and its header names regeneration as the goal.

The baked grid stays saved beside the recipe. It is the record of what was
accepted, so nothing a game shows can change because a part changed —
see "Rebuild and look" below.

## What accumulates

**Parts.** Small functions: settings and a seed in, a voxel fragment out.
Wall, pitched roof, arch, window, trunk, foliage blob, limb. Each part
carries its settings with bounds, a few named presets, a sameness test
(same settings, same seed, same voxels), and a preview picture. A part is
done when you would trust it in a model you did not build.

**Placing steps — kept few.** The operations that put fragments into a
model. The full menu is small — place at, stack on, mirror, repeat along a
line, scatter by seed, carve away — and the first implementation gets only
three: raw voxels, place a part, mirror. Power comes from many parts and
good arrangements, not from a rich step language. If the steps grow into a
little programming language, sculpting by hand wins and the system dies;
adding a step kind is an owner decision.

**Raw voxels are a step, not a failure.** Hand-sculpted detail layers on
top of generated parts inside the recipe. Without this, the first corner no
part can express forces the model back to a plain grid and out of the
system. This step is load-bearing and never removed.

**Color roles, not colors.** Parts paint with roles — wall, trim, roof,
leaf-dark — and a palette maps roles to actual colors per game or per
model. A game-wide recolor is one palette edit; parts stay game-neutral;
the same roof part in City's colors and AoE2's colors reads as two art
styles. Shared bones, per-game skin.

**The cookbook.** Lessons that are not code: what reads well, what does
not, and why. Lives at the fleet root (see "Learned across games").

## How it improves instead of sprawling

**Rebuild and look.** Improving a part changes no art by itself. A shelf
rebuild is an explicit act: run every recipe again, render before/after
sheets (the sprite sheet the studio already draws is the right artifact),
and the owner accepts or pins notes by looking. The baked grids are the
baseline the rebuild is compared against — the same discipline as the
engine's visual baselines, applied to models.

**Notes reach the part that made the voxel.** The builder remembers which
step placed each voxel. A note pinned on a torn roof edge names the roof
part, the request carries that, and the fix lands in the part — healing
every model that uses it — instead of in one model's grid. This flows
through the request files the
[studio redesign](2026-07-16-model-studio-redesign-design.md) already
defines; the recipe just gives the agent an address one level up.

**Parts are earned.** Build each new model the fastest honest way:
existing parts where they fit, raw voxels where they do not. When the same
shape gets hand-sculpted a second time, promote it into a part. Never build
a part ahead of need — the same rule this repo already applies to
abstractions, for the same reason: it keeps the shelf full of parts that
are actually used.

## Learned across games, aggregated in one place

Owner direction, 2026-07-17. Two kinds of things share differently:

- **The cookbook shares freely, immediately.** Craft knowledge has no game
  meaning and no blast radius. One shared cookbook at the fleet root —
  `github/voxel-craft.md`, beside the fleet canon — that every game's
  model work reads first and writes the same day a lesson is proven.
- **Parts share by graduation, not by birth.** A part is born in the game
  that needed it. When a second game needs the same shape, it graduates
  into one shared content repository beside the games — created the day
  the first part earns it, named then. The entry bar is game-neutral
  vocabulary: color roles not colors, sizes in voxels, bounded settings,
  no game words. "Pitched roof" graduates; "siege tower" stays AoE2's.
- **Adoption stays per-game.** Improving a shared part changes nothing
  anywhere until a game rebuilds its shelf, looks at the before/afters,
  and accepts — on its own schedule. Its baked grids are its record of
  what it accepted. Learning aggregates; adoption stays deliberate.
- When the shared repository exists, the cookbook moves into it — one home
  for shared craft, and versioned from then on.

## Where each piece lives

- **Engine repo: mechanism only, as studio tooling.** Recipe schema and
  runner, the part interface, sameness and preview fixtures, and the
  rebuild-and-compare flow live with the studio core under `tools/`. No
  parts, no recipes, no game content — the published package stays free of
  authoring, per the spec's non-goals, and the studio core never hardcodes
  a game, per the roadmap boundary.
- **Each game:** its parts, recipes, palettes, shelf sections, and baked
  models.
- **Shared content repository (later):** graduated parts with their tests
  and previews, plus the cookbook once it exists.
- **Fleet root (now):** the cookbook.

## Animation is the same idea, one stage later

Today motion is nine whole-model sliders — one harmonic period, phase, and
amplitudes. Recipes make the next stage natural: a recipe knows its parts,
so parts can carry motion roles — body bobs, legs swing in opposite phase —
and "walk" becomes a named, reusable pattern instead of slider settings
rediscovered per model. That needs per-group motion in the engine first, so
it is stage two. Recipe v1 does not reserve fields for it; when per-group
motion exists, the recipe schema versions forward.

## Recipe sketch — the pre-implementation record

The live authority is `tools/studio/recipe.ts`. The implementation kept this
shape and added what building taught: `motion` is required (a recipe rebuilds
the whole model, not just its voxels), `roles[0]` is pinned to `'empty'`
everywhere, `seedSalt` is optional and defaults to 0 so identical steps are
identical on purpose, and build errors report every bad step at once.

```ts
// The original sketch, kept as the record of what was proposed.
// Same ground rules as StudioModelV1: plain data, JSON-safe, no functions.
export const VOXEL_RECIPE_SCHEMA_V1 = 'studio.voxel-recipe/1';

interface RecipeV1 {
  readonly schemaVersion: typeof VOXEL_RECIPE_SCHEMA_V1;
  readonly id: string;
  readonly label: string;
  /** Every random choice flows from this, salted per step. */
  readonly seed: number;
  readonly size: readonly [number, number, number];
  /** Role names in slot order; slot 0 is the empty slot. */
  readonly roles: readonly string[];
  /** One color per role — the model's skin. */
  readonly palette: readonly { r: number; g: number; b: number }[];
  readonly steps: readonly RecipeStepV1[];
}

type RecipeStepV1 =
  | {
      /** Hand-sculpted voxels, layered in recipe order. */
      readonly kind: 'voxels';
      readonly at: readonly [number, number, number];
      readonly size: readonly [number, number, number];
      readonly voxels: readonly number[]; // role slots; 0 leaves untouched
    }
  | {
      readonly kind: 'part';
      readonly part: string; // e.g. 'roof/pitched'
      readonly at: readonly [number, number, number];
      readonly settings: Readonly<Record<string, number | string | boolean>>;
      readonly seedSalt: number;
    }
  | { readonly kind: 'mirror'; readonly axis: 'x' | 'z' };

/**
 * A part maps settings and a seed to a fragment: its own size, its own
 * role names, and voxels indexing them. The builder merges role names
 * into the recipe's slots. Same input, same fragment, always.
 */

/**
 * buildModel(recipe, parts) returns the StudioModelV1 the studio and
 * games already read, plus one step index per voxel — "which step placed
 * this" — so a pinned note can name the part to fix.
 */
```

## Build order

1. Recipe schema and runner with the three step kinds; one or two parts
   extracted from an existing model; parity proof — one existing model
   rebuilt from a recipe into the identical grid, verified by test and by
   looking at its sheet.
2. Note routing: the built model carries which step placed each voxel, and
   the request payload includes it.
3. Rebuild-the-shelf with before/after sheets and explicit acceptance.
4. The cookbook habit: a resolved request that taught something lands its
   lesson the same day.
5. First graduation creates the shared content repository.
6. Motion roles, after the engine has per-group motion.

City's move to voxel art is the forcing function: a city is walls, roofs,
and windows repeated hundreds of times — exactly the shape that pays for a
part library.

## Risks

- **Step language creep.** The step kinds are capped; adding one is an
  owner decision. Power lives in parts and arrangement.
- **Speculative parts.** The second-use rule; a part nobody uses is
  deleted, not kept.
- **Silent art drift.** The baked grid is the record; rebuilds are
  explicit and judged by looking, never automatic.
- **Hand fixes locked out.** The raw-voxels step is load-bearing; if
  sculpting on top ever stops working, the system gets abandoned.
- **One shared style flattening the games.** The graduation bar keeps game
  words out of shared parts; per-game palettes and presets keep each
  game's look in.
- **The fleet-root cookbook is unversioned.** Accepted while entries are
  few; it moves into the shared repository, and under version control,
  when that repository exists.

## Out of scope

- Wiring engine picking into the studio, black face edges, full turns —
  tracked in the [studio redesign](2026-07-16-model-studio-redesign-design.md).
- Imported meshes or glTF as parts, LOD, transparency — engine roadmap
  concerns, not recipe concerns.
- Any change to the published package surface; everything here is studio
  tooling and game content.
