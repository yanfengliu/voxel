# Giving a game its own model studio

Status: current from 2026-07-26. The renderer-neutral shell is consumed by Harborform, while Voxel's own page and the Harbor fixture (`tools/studio/game-fixture.ts`) prove the grid-renderer adapter.

The model studio is the pattern every game using this engine gets. The engine owns the reusable half; each game brings its own models. This guide covers the two-file browser UI setup, the optional local request-writer route, and the boundary between them.

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

That is the whole browser UI integration. `mountStudio` returns a handle carrying the harness and an idempotent `dispose()`, for a game that mounts the studio inside its own page rather than on a page of its own. A mount that fails — an invalid V2 profile, an `instanceId` already mounted in the document, a model the engine rejects, or catalog data whose recipe or physical sidecar throws while the studio first reads it — throws before anything global exists and puts back whatever it briefly held: the render session is released, a connected shell is taken down, and the studio's own markup is cleared from the root, while a mount that failed before writing the root leaves the host's own content untouched. The harness and listeners attach only after everything else has succeeded, so a failed mount never replaces another mount's `window.voxelStudio` and never leaves a document listener behind.

Saving a **Send request** file has one additional development-server requirement: Voxel's `tools/studio/vite.config.ts` supplies the local `POST /studio/requests` writer. A consumer served through another Vite config must proxy or provide that endpoint; without it, the Studio reports the rejected request and does not claim a file was saved.

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
five regions and five standard panels exactly as before, and its `selectTab`
refuses an unknown tab id exactly as V2 does rather than silently deselecting
every tab.

A configurable game calls `renderModelStudioShellV2` with a stable unique
kebab-case `instanceId`, a canonical-order `coreTabs` subsequence containing
`examine`, and any declarative add-ons. Add-on ids use lowercase
`game:addon-name` namespaces and always follow the standards. Mount the
returned markup, then pass its exact shell root to `connectModelStudioShellV2`.
The V2 handle exposes the same five regions plus `tabIds`, `hasTab`, dynamic
`panel(id)` lookup, focus-aware `selectTab`, and idempotent `dispose`. When
the tabs outgrow their row, the scroll buttons appear and retire on every
resize of the tab list as well as on every scroll, so a narrowed window can
never strand a clipped tab out of pointer reach.

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

On Voxel's Studio dev server, **Send request** saves a timestamped JSON file under `tools/studio/requests/`; it starts no agent and sends no notification. Ask an agent to process the reported file when ready.

## Recipes and parts

A model saved only as a grid can never be improved except by hand. A recipe is how the model was made — hand-placed voxels, parts run with settings and a seed, mirrors — so improving a part improves every model whose recipe uses it.

Parts are pure: settings and a seed in, a voxel fragment out, the same fragment every time. They paint *role names* ('hull', 'mortar', 'trim') rather than colours, and the recipe's palette gives the names their colours — so the same part can wear two games' art directions. A standalone part preview uses deterministic neutral colours only for inspection; it does not assign consumer art direction to those roles.

Keep the parts a game actually reuses, and no more. Build each model the fastest honest way, with raw voxels wherever no part fits; when the same shape gets hand-sculpted a second time, promote it into a part. A part built ahead of need is a part nobody calls.

### Curating for contrast

The canonical end-to-end workflow is the [Create Diverse Voxel Assets skill](../skills/create-diverse-voxel-assets/SKILL.md). It turns the Studio mechanisms below into a complete engine-and-consumer process: brief the gameplay or scene need, generate structurally different hypotheses, select with evidence, compose scenes through relationships rather than catalog grids, and verify the actual downstream game.

Voxel's reference catalog adds 30 manually curated recipes across six deliberately different families: arches and voids, tapered and stepped masses, frames and trusses, radial mechanics, branching organic forms, and asymmetric hybrids. They span four neutral domains: infrastructure, civic architecture, mechanical industry, and natural or organic forms. Seven shape-changing reusable parts support them: `arch-span`, `tapered-mass`, `open-frame`, `stair-run`, `radial-wheel`, `branching-form`, and `truss-span`; each was promoted only after a second real recipe use, and future parts must clear the same reuse threshold.

Four domain scenes place every curated contrast recipe exactly once. The mechanical-industrial, civic-architectural, and natural-organic scenes contain four semantically chosen whole-model animations: a reciprocating flywheel, cable drum, kinetic compass, and windbreak pine, so the persisted scene-animation control has useful work outside the lighting showcase.

Contrast, not count, is the acceptance rule. A palette swap or seed-only mutation is not a new design, and a promoted recipe must differ from its nearest catalog neighbors on at least two independent axes among topology or negative space, multi-view silhouette or massing, scale or proportion, construction or part grammar, spatial material rhythm, and supported motion.

`fingerprintStudioModelV1` records deterministic raw model evidence: a tightly cropped topology hash, a render-content hash, occupied dimensions and proportions, density, exposed surface, connected components, horizontal symmetry, palette usage, and normalized 16-by-16 silhouettes from six axis-aligned views. `analyzeStudioCatalogDiversityV1` combines those fingerprints with category, direct-step, part, tag, seed-sensitivity, and nearest-neighbor coverage; these are inspectable partial signals, not an aesthetic score or an automatic promotion decision.

The metrics are intentionally orientation-sensitive: they do not canonicalize rotations or reflections, so a rotated or mirrored version can compare as structurally different without being a new idea. They also do not automatically score construction grammar, motion semantics, or the spatial rhythm of material roles, which means a human must still inspect negative space, readability, semantic intent, and the claimed contrast axes.

The bounded generate-wide/select-narrow `generateStudioContrastCandidateReportV1` pass in `contrast-candidate-batch.ts` deterministically makes 64 candidates per family through part-setting changes, subtraction, step reordering and relayout, duplication, mirrors, and bounded additive accents. It ranks each against the live catalog, rejects empty output, catalog or earlier-candidate topology duplicates, invalid builds, and changes that lack both grammar contrast and a quantitative morphology axis, and carries a frozen rebuildable `RecipeV1` for every proposal that reaches human review. Its `promotedRecipeIds` is deliberately always empty: the report preserves candidate and rejection evidence for a person to select from, but it never edits the catalog or promotes its own output.

Run `npm run studio:diversity` for the visual half of review. The headless driver writes one contact sheet per family at fixed yaws of 45, 135, 225, and 315 degrees, one semantic-motion sheet at phases 0, 0.25, 0.5, and 0.75, a manifest, the accepted-catalog report, and the complete buildable candidate and rejection report under ignored `output/playwright/studio-diversity/`; those outputs are disposable review evidence, not committed approval.

The independently reviewed `tools/studio/fixtures/diversity-accepted-v1.json` fixture is the durable acceptance boundary: it pins each promoted recipe's authored seed, family, domain, topology and render hashes, visual thesis, and reviewed sheets. Ordinary generation never rewrites it; accepting a changed or new recipe requires deliberate human review and a manual fixture edit.

This entire loop is bounded development tooling. It does not evolve assets at runtime, auto-promote models, change the public renderer schema, or move consumer-specific art direction into Voxel.

### Discovering parts and recipes

A part may be a bare function or a self-describing `PartDefinitionV1` — a title, summary, category, tags, a settings schema with bounds and defaults, and named presets, alongside its `build` function. The shelf accepts either and the builder runs both the same way through `partBuildV1`, so a game adopts definitions where they earn their keep. The schema is honest rather than decoration: the build reads its inputs through it (`resolvePartSettingsV1`), so the bounds a browser shows are the bounds the part enforces.

Declare the game's whole palette on the catalog — `parts` and `recipes` — so the studio can list every part and reusable recipe, not only the ones some shelf model already uses. Omit them and the studio falls back to the union of what its models call. Recipes may carry an optional `summary` and `tags` for the same browsing.

The studio then offers discovery for free, to people and agents alike:

- the left rail switches between **Models**, **Parts**, **Recipes**, and — when the catalog ships any — **Scenes**, over one search box; every item is a flat name-only button that renders or opens on click, model section headings are fixed rather than expandable, and descriptive metadata appears in the right **Examine** inspector; on hover-capable devices, hovering a row reveals only that row's **⋯** action button, while keyboard-visible focus and an open menu preserve the same affordance; devices without hover keep the action buttons visible and tappable; drag an unfiltered entry to rearrange it, or use **Move up** / **Move down** in the same keyboard-navigable **⋯**, right-click, and `Shift`+`F10` action menu; models remain inside their catalog section;
- model actions open the model for examination or construction and rename its mount-local display alias; the immutable id, catalog model, recipe keys, and scene placements do not change, so references keep resolving and another mount still sees the catalog name;
- clicking a part renders its declared defaults (or empty settings for a bare part), shows its summary, schema, presets, and usage on the right, and leaves named preset rendering in its action menu with the same fixed seed and neutral preview skin;
- clicking a recipe immediately renders a fresh output from its authoritative recipe-book key and shows its summary, dimensions, direct dependencies, and usage on the right; its construction remains available under **Build**, while the redundant **Render current recipe** and **Open shelf model** controls are intentionally absent;
- the harness reports and rearranges the same data — `shelf()`, `shelfOrder(kind, sectionIndex?)`, `moveShelfItem(request)`, `activeShelfModel()`, `modelDisplayLabel(id)`, `renameModel(id, label)`, `restoreModelName(id)`, `availableParts()`, `findParts(query)`, `openPart(name, { preset })`, `activePart()`, `activePartPreset()`, `availableRecipes()`, `findRecipes(query)`, `openRecipe(id)`, and `activeRecipe()` — so an agent browses and renders the whole palette through one `page.evaluate`; recipe discovery exposes both the authoritative book-key `id` used by `openRecipe` and the declared `recipeId` used by its built model and matching shelf entry.

The full design, including how craft lessons and parts are shared between
games, is in
[model recipes and shared parts](../superpowers/specs/2026-07-17-model-recipes-and-shared-parts-design.md).

### Scenes

A scene stands finished models together in one world — a table and a sofa in a
room, a street of houses — without merging them into a new recipe. It is an
arrangement of whole, still-reusable models, not one combined grid. A game
ships scenes on its catalog:

```ts
const catalog: StudioCatalogV1 = {
  sections: [...],
  scenes: [
    {
      schemaVersion: 'studio.scene/1',
      id: 'game:street',
      label: 'Main street',
      placements: [
        { id: 'house-1', model: 'game:cottage', at: [0, 0, 0] },
        { id: 'house-2', model: 'game:cottage', at: [16, 0, 0], turns: 2 },
        { id: 'lamp', model: 'game:street-lamp', at: [8, 0, 6] },
      ],
    },
  ],
};
```

Scenes retain the stable origin-centered opening frame unless their catalog explicitly opts that scene id into `sceneOpeningViews: { [sceneId]: 'occupied-world-bounds' }`; the opt-in rebuilds the visible seeded and grained placement boxes, ignores empty recipe padding, centers their exact world-space union in X/Z while retaining the Y=0 ground-plane navigation contract, and fits symmetrically around that ground plane so elevated geometry is not cropped. Use it only when the scene's authored inspection depends on content-centered horizontal framing, because changing the policy deliberately changes captured-view and visual-baseline evidence for that scene.

A placement names a model by its authoritative recipe-book key, the spot its base stands on (a scene grounds every model on one floor), an optional quarter-`turns` about the up axis, and an optional `grain` to override the model's voxel size — so a fine flower and a coarse building stand side by side. Repeated models render as instances, so a street of identical houses stays one geometry and many transforms.

When a catalog ships scenes, the rail grows a **Scenes** lane; opening a scene draws the whole arrangement on the stage under the same look controls, and opening any model leaves it. Drag a scene to rearrange the lane, hover or keyboard-focus it to reveal its **⋯** button, right-click the row, or press `Shift`+`F10` while it is focused to move, rename, or delete it. Renaming an open editable scene participates in its undo history; deleting any open scene, including a read-only replay scene, returns to the underlying model and clears its selection and history.

An ordinary scene is edited by arranging it, not by building steps, so it hides Build and Motion, keeps Notes available, and fills **Edit** with a scene editor: an add-model picker and a list of placements. Selecting one — in the list, or by clicking the model on the stage — opens its move, turn, and remove controls and outlines it. Selection is one thing the stage outline and the Edit controls share, so clicking a second model moves the controls to it. On the stage a left-drag slides the selected model across the floor, a middle-drag turns the view, a right-drag pans, the wheel zooms from 0.25 to 256 visible vertical world units, and held `W`/`A`/`S`/`D` moves the camera continuously across the ground relative to its current yaw; diagonal movement is normalized, and releasing the keys stops immediately. Opening an asset retains the established comfortable 3-to-80 auto-fit, after which the wheel can travel across the wider inspection range. Dense finite lit scenes keep their separately proven 80-unit far ceiling; their perspective view also retains its data-derived near limit and movement constraints. Unlit views, sparse-light scenes, and model views use the complete range. The same WASD navigation works while a model or consumer replay is open, does not run while focus is in a text field or control, and double-click restores both the default orbit and the world origin. **Snap to grid** (a scene-only toggle) lands a dragged model's footprint on whole cells. `Ctrl`/`Cmd`+`Z` undoes a scene edit; `Ctrl`+`Y` or `Ctrl`/`Cmd`+`Shift`+`Z` redoes it.

The scene **Notes** tab keeps one autosaved brief and an ordered queue of numbered annotations for each stable scene id. Choose **Annotate scene**, then use one left gesture on the picture: this explicit one-shot mode takes precedence over ordinary placement selection or dragging and over a replay scene's left-drag orbit, freezes a moving scene at press time, places a bright `+` exactly where the press captured the picture, and opens the annotation editor on release. A gesture that becomes a drag restores its prior playback and stays armed rather than capturing the later release position. Queueing replaces the draft marker with the annotation number; canceling removes it. While the draft is open, the scene view, playback, look, shelf, editing tabs, and column resizing are presentation-locked, and an outer window resize temporarily stretches the unchanged captured raster instead of moving the target under the marker. A rejected capture restores the prior playback and armed state instead of leaving the scene paused. `Shift`+`Enter` adds a line, `Enter` queues the annotation, and `Escape` cancels it. Text fields retain native typing and undo behavior, so `W`/`A`/`S`/`D` and `Ctrl`/`Cmd`+`Z` do not move the camera or edit the scene while a brief or annotation has focus; covered model-only controls are inert and absent from the scene tab's keyboard and accessibility order.

A scene annotation is deliberately a captured-view reference, not a semantic pick or a world-space target. It records the normalized screen spot, camera orbit and pan center, selected placement or no selection, depth mode, lighting and study-edge look, viewport, exact presented time, a versioned fingerprint of the scene plus every resolved seeded/grained model's render content, and — for a consumer replay — the replay id plus input and final hashes. The draft `+` and queued number appear only while that same scene, presentation fingerprint, selection, camera, look, framing, viewport, and phase are shown; programmatic context changes can still hide them instead of pretending that the old screen point names a new picture. At an edge, a small reticle remains centered on the exact target while a connected `+` or number shifts just far enough inward to stay legible. **Show** transiently freezes movement and restores the saved selection, look, view, and phase when the stable scene content still matches without turning off the persisted scene-animation permission; a changed presentation reports why the old capture is stale and leaves it in the review queue as evidence.

Scene briefs and captured annotations use guarded browser `localStorage` by default and remain isolated by stable scene id across switches and reloads. Each synchronous operation refreshes the latest stored document before changing it, preventing a sequentially stale mount from overwriting newer state; simultaneous cross-tab editing is not a transaction, so independent editors should inject stores backed by separate storage adapters. These records do not enter `SceneV1`, a recipe, renderer input, game save data, or replay simulation state, and deleting a mount-local catalog scene does not silently erase the durable review record for that stable id.

**Send request** from a scene saves a private `studio.request/2` artifact containing the trimmed scene brief, only that scene's pins, a bounded snapshot of the current scene, and the current camera, center, selected placement, depth, lighting and edge look, unwrapped exact time, and replay provenance. It includes the V4 replay reference and hashes but never copies generated replay frames. Request filenames are created exclusively and collision retries never overwrite an earlier review; a delayed response also cannot replace status from newer same-scene brief or pin edits. Like the model request route, saving starts no agent and sends no notification; it adds no public `voxel/core`, `voxel/three`, physics, or simulation API.

`studio.scene/2` scenes may carry up to 4,096 plain-data static point lights with stable ids, positions, sRGB colors, intensity, and range; `studio.scene/3` adds optional deterministic orbit motion while preserving static lights; private `studio.scene/4` adds a required catalog pose-replay reference. Adding the first light to a V1 working scene migrates that edited copy to V2, while editing a V3 scene preserves its discriminator and behavior data. An older Studio therefore rejects a lit, moving-light, or replayed scene instead of accepting an earlier schema and silently omitting or freezing its behavior. The Edit tab adds, moves, recolors, brightens, dims, and removes lights through the same whole-scene undo history, while small colored handles make their positions visible.

A `studio.scene/4` consumer replay is an observational, read-only scene in Studio. Its Edit tab explains that boundary instead of exposing authored placement or light controls; the snap toggle, stage picking, selection outline, and placement dragging are disabled because they describe the static source scene rather than the poses currently presented by the replay. A left drag orbits the camera, right-drag and WASD move the view, the view and lighting controls remain available, Play and timeline scrubbing remain available, and the scene can still be deleted. Harness selection, snap, rename-while-open, and scene-edit attempts reject with an actionable message; change the consumer simulation or trace source and regenerate the replay when the assembly itself must change.

The **lighting on/off** toggle is one global stage-view preference shared by models and scenes, not a property of the open scene. Its visible text, pressed state, scene status, stage hint, and right-side scene details all report the active state. Switching it off keeps lighting off when another scene or model opens and after a reload through the Studio's injected view store, backed by guarded `localStorage` by default; source handles remain visible but dim for editing and contribute no raster light. Lighting never starts, stops, or changes the phase or scrub window of scene movement.

The separate **animation enabled/disabled** button is a persisted scene-wide movement preference shared by every scene. On a motion-bearing scene, ordinary Play enables the preference and resumes moving point-light sources, animated model placements, and consumer pose replays from the presented phase, while Pause disables it and holds all three; the button reports that saved permission, and Play/Pause reports whether the transport is advancing right now. Bare `Space` invokes that same Play/Pause action when the active Studio owns page or stage focus; text fields and focused controls retain their native Space behavior, and holding the key toggles only once. Exact-time harness draws, timeline seeks, and rejected frames pause the transport transiently at the last phase they actually presented without rewriting an enabled preference, so Play or `Space` remains the explicit way to resume that inspection pause. A newly opened or reloaded animated scene honors the stored choice; a fresh Studio defaults animation enabled, while a legacy stored view without the field migrates its former moving-light behavior from the stored lighting choice before subsequent writes become independent. When browser storage is unavailable, the Studio remains usable but falls back to the defaults on the next visit.

#### Wind-powered trip mill proof

Open **Scenes → Wind-powered trip mill**, turn **animation enabled** on, and press **Play**. The scene contains four functional assemblies: the grounded frame carries two separated rotor bearings, one hammer bearing, and their foundation ties; the two stepped pitched sail plates collect wind load into one continuous shaft; both opposed cam noses contribute follower contacts and qualified cycles during the run; the hammer's upper head cell face-connects its right beam to its impact toe and contributes sidecar-derived static mass and analytical head-down gravity torque; and that toe strikes a direct-ground anvil face. The five recorded cycles group as two from the primary nose followed by three from the opposed nose, so neither strict alternation nor two completed trips per revolution is claimed. The voxel bearing rings show ideal-joint datums and fixed visual routes to ground, but do not contact the linked moving bodies in Rapier; the passive revolutes at named ports enforce the axes. The paired collars are balanced visible shoulders, not solved axial stops, and the follower elbow sits at the first column beyond the bounded maximum cam nose so neither interference nor a purposeless raised extension is accepted. This is not an isolated dynamic ablation of the upper cell: the H1/H2/H3 search varies multiple geometry and mass conditions and does not prove that cell independently necessary or responsible for a cycle. Bare `Space` pauses or resumes during the trace. The 12-second physical run ends on an exact recorded terminal state, which the one-shot holds for its final display interval and thereafter; `Space` or **Play** from the end explicitly restarts at zero. Pause, scrub, then orbit to the side and rear to verify that the shaft passes through both rotor bearings, the hammer journal passes through its bearing, each cam nose clears the follower after lift, and the toe meets the anvil instead of floating through it. The four corresponding **Windmill** shelf recipes remain independently rebuildable and expose the same exact named boxes, colliders, materials, masses, and ports consumed by the fixture. Their selected purpose ledger assigns a unique record to every exact box, binds canonical front/side and every exact-box removal to declared quarter-camera footprint and pixel-difference thresholds, and retains structural relocation evidence for every box plus visual relocation artifacts for the bounded representative set; static `studio.scene/3` review variants are mounted exactly as authored and do not borrow a replay pose.

The committed replay is generated headlessly by the consumer-owned `fixtures/windmill-consumer` Rapier `0.19.3` fixture at 960 Hz and recorded from that same solver loop at 60 Hz: the opening state plus every sixteenth solver tick produces 721 frames over 12 seconds of physics and 12,016.666… milliseconds of finite presentation. A fixed 10 m/s world-air design point drives the two exact plates using `F = 0.5 rho Cd A dot(u-v,n) abs(dot(u-v,n)) n`; the exact occupied cells determine each equivalent area, centroid, chord/radial frame, and normal, and the body's live velocity at that centroid supplies `v`. The force changes sign with relative normal flow and tends to zero with normal slip, without a motor, speed controller, ramp, scripted pose, velocity override, or post-step correction. Passive impulse revolutes constrain the rotor and hammer, collision filtering admits only the two individually named cam noses against the follower and the hammer toe against the anvil, and each accepted cycle requires attributed cam contact, minimum lift, release, apex, downward return speed, and a positive anvil impulse in order. The selected minimum-form candidate is the deterministic first of 19 passes after all 144 candidates run both the short and full horizons and completes five nominal cycles, with both cam noses causally represented. Generation gates every collision-excluded visible pair at every solver tick, exact physical/visual parity, anchor and out-of-plane pose error, axis tilt and pose-derived axis rate, active-contact penetration, angular and tip speed, input work, and one-sided unaccounted-positive-energy diagnostics. Seven counterfactual runs separately disable wind, gravity, all cam contact, each individual nose's follower-contact participation, or post-lift anvil contact, or remove one complete sail with its geometry, colliders, mass, and load. This fixture implements a bounded quasi-steady relative-flow plate law and rigid-body mechanism; it does not solve computational fluid dynamics, pressure or wakes, turbulence, stall history, blade efficiency, bearing load sharing, deformation, fatigue, wear, heat, sound, forging, safety, arbitrary wind, or global energy conservation. Voxel validates and presents the accepted plain-data trace but does not run or own the simulation.

#### Riverfall fluid replay proof

Open **Scenes → Riverfall canyon**, turn **animation enabled** on, and press **Play**. The default front-left camera shows a high river between asymmetric seeded tree rows, a blue curtain dropping between cliff shoulders, a lower pond, a narrow outflow through the front bank, and one continuously covered blue surface whose voxel ripples travel across every reach without a separate drop or foam-particle layer. Turn **lighting on** for shaded relief, switch between study edges and game look, scrub the 6.025-second replay to inspect evolving solver states, and orbit through overhead, longitudinal, and reverse views to read the complete source-to-outflow chain and seamless loop without relying on the scene title.

The landscape, river underfill, waterfall underfill, pond underfill, outflow underfill, and two fluid-surface tile sizes remain seven independent opaque scene recipes, the optional ripple specimen remains on the asset shelf rather than overlaid in this scene, and the ten trees reuse the ordinary seed-varying tree recipe. A fixture-local deterministic 2D PBF thin-sheet/surface model advances 288 fixed-mass particles through the exact twelve-reach sidecar: river, lip, fall, three widening and narrowing pond reaches, outflow, visible submergence, occluded sink, under-foundation return, occluded source rise, and visible emergence. It records 240 genuine particle keyframes at 25 ms with five fixed 5 ms substeps per keyframe, then reconstructs the visible field onto 321 Eulerian tiles with a fail-closed world-space Wendland-C2 kernel: every cell-frame requires at least two visible particles inside radius 10 and only the nearest eight, ordered by distance then particle id, influence its local tracer, speed, and support-occupancy samples. A hashed downstream coordinate adds a coherent 20-unit presentation carrier whose phase advances from a five-unit surface-wave floor plus the local PBF speed term, and one bounded neighbor pass smooths across the river, lip, fall, pond, and outflow seams. The authored grid exactly tiles all five live scene-recipe water footprints, tile centers move only along fixed outward normals, fixed tile orientations keep every posed footprint bank-contained, and the moving tiles and concealed underfill use the exact same blue. A 24-frame cubic Hermite presentation bridge joins the final observed field back to frame zero with matching endpoint slope, and an appended frame-zero pose at 6,000 ms makes the 6,025 ms replay wrap pose-exact rather than visibly snapping. The same scene remains structurally legible with animation disabled.

The fixture solver projects gravity along the domain, applies a fixed-order Jacobi density constraint and XSPH neighbor smoothing, explicitly attaches particles at the lip, resolves dissipative fall-to-pond impact, and uses an occluded external pump to complete the sink/return/source loop. Its tests separately remove gravity, hidden-pump forcing, the density solve, and XSPH while preserving the remaining world, so those are causal fixture checks rather than visual labels; canonical generation also rejects out-of-budget particle accounting, compact-support coverage, density, speed, and boundary results. The surface input hash covers the particle input hash, complete presentation configuration, and every canonical topology field, while a paired near-versus-distant perturbation proves that supported local particle motion affects its tile and an out-of-support change does not. Studio's private `studio.scene/4` defensively owns the generated replay and sends the two tile groups through ordinary instanced sparse matrix deltas; Voxel does not run the solver, and there is no Riverfall renderer branch. Fixed lit and unlit browser views verify that the reconstructed surface and underfill share one exact blue instead of reading as separate droplets, while a twelve-phase default-camera union requires at least ten percent of stable water pixels to change and replay tests require every reach to participate, every cell to have substantial full-cycle amplitude, the all-frame adjacent-height p95 to remain bounded, and the cyclic seam to stay below its temporal displacement budget. The carried tracer, support-occupancy proxy, authored carrier wave, neighbor smoothing, and loop-closing bridge are presentation devices driven or modulated by accepted local solver observations; they are not a solved water height, energy or density field. This remains a bounded deterministic 2D surface/thin-sheet visualization, not volumetric or free-surface Navier-Stokes, a continuously deforming mesh, transparency or refraction, erosion or hydrology, or gameplay water state.

#### Machine Works assembly proof

Open **Scenes → Machine works**, turn **animation enabled** on, and press **Play**. The 30-second replay starts with a product base on an axis-constrained dynamic carrier while 58 visible slats, each 26 voxels deep, circulate around two internal drive drums; each underside follows the nominal 2.75-unit pitch-drum datum and the articulated straight and turn gaps are bounded. The exact sidecar OBB/SAT regression checks all 58 slats against both drums at 32 phases, proving boundary-only slat contact at the drum end cheeks, no positive-volume overlap, at least about 0.275 world units of central-barrel radial clearance, and detection of an intentionally overlapping negative control. Four minimal exterior hub-and-radial flags share the solved drum phase but remain collision-excluded replay witnesses rather than gears or evidence of tooth contact or torque transmission. Rapier belt contact and friction transport the axis-constrained carrier. The purpose-built insertion bridge has four feet on four occupied foundation pads, two rectilinear towers, one load beam, and two narrowed cream fixed stators. Each stator remains inside the empty opening of an orange three-sided moving C-yoke for the whole prescribed stroke; exact swept bounds require at least 0.4 world units of running clearance on every transverse face and zero positive-volume stator/bar overlap. Rear pads and straight bridge faces are visual alignment datums only, and the bridge is not a Rapier body, so the scene claims neither captive guidance nor solved load transfer. The cabinet, overhead bus, fixed servo housings, load beam, and stators form an exact face-connected external actuation route that ends at the fixed-stator/moving-yoke coupling. Each moving head instead carries a precharged local buffer whose internal conduit and ram backing terminate at the pickup plate; the fixture simulates no charging, flexible moving feed, electricity, magnetic force, motor torque, feedback dynamics, or energy use. Both heads start preloaded by fixed joints with each component outer face touching its energized magnetic pickup plate; there is no in-trace grab or jaw motion. At each station the consumer validates position, orientation, relative speed, dwell, and two-voxel insertion into empty clearance. The cap key occupies core layers seven and eight with deliberate lateral assembly clearance, then its crown underside reaches the core top plane as the vertical seat. Before either component becomes an explicit software-welded compound, the trace measures the live body against the canonical merged pose, records actual translation and shortest angular correction, rejects correction above 0.025 world units or 0.03 radians, and rejects maximum solver penetration above the hashed 0.001-world-unit budget; retention is not a solved key latch. The three-piece product is assembled at about 11.67 seconds. Belt contact delivers the carrier to output, where full pose and speed validation precede release at about 18.33 seconds. The chassis-backed orange trunnion axle extends beyond both belt edges into two open C-bearing cradles whose plinths terminate on separate occupied foundation guard-top faces. Each bearing remains at least 0.5 world units outside the belt, while a third grounded foot supports the outboard servo and its safety coupler face-contacts the axle. Canonical validation axially separates every non-axle carrier solid from the dock, excludes positive-volume dock overlap with the foundation and bucket, leaves about 0.1528 world units around the axle's complete quarter-turn swept cylinder, and analytically checks the complete carrier sweep rather than sampled angles, retaining about 0.7528 world units from the foundation and 0.6000 from the bucket. Before the position command rotates the carrier, the accepted live release pose repeats the quaternion-aware continuous sweep with at least 0.14 world units of dock clearance, about 0.7518 from the foundation, and about 0.5990 from the bucket; the dock still supplies no Rapier revolute constraint, bearing response, motor torque, feedback, or energy model. The product hits the bucket at about 20.87 seconds and satisfies the declared sensor at about 27.42 seconds with the hashed 0.05-unit containment tolerance. The final frame holds until the discrete reset at exactly 30.0 seconds. Pause or scrub the timeline to inspect any phase; the lighting toggle changes illumination only.

The scene status advances through the latest accepted assembled, released, contact, and collected event, while its tooltip exposes the solver version and both hashes. `window.voxelStudio.drawAt(timeMs).scenePoseReplay` returns the same provenance, accepted interpolation frames, and latest causal event as plain inspection data.

The **Machine Works** model shelf contains twelve independent rebuildable recipes: conveyor underframe, insertion press bridge, belt slat, internal drive drum, exposed axle phase flag, collection bucket, output trunnion dock, transfer carrier, insertion head, product base, product core, and product cap. Open one there and enable **colliders** to inspect the sidecar's compound solid or sensor shapes and named attachment ports. The exact press-bridge sidecar exposes four foundation feet, straight alignment faces, narrowed fixed stators, and the face-connected fixed service route. The insertion-head sidecar exposes contacting pickup and alignment faces, a local `pickup-buffer` service origin, and an `actuator-yoke-cavity` port centered in empty space between three exact orange yoke bars. Painted-solid parity, four distinct foundation contacts, swept alignment, cavity enclosure on three sides, exact bar presence, empty-cavity containment, at least 0.4 world units of running clearance around every transverse stator face, zero positive-volume stator/bar overlap, and continuity from the head-local buffer through its conduit, ram backing, and pickup are generation-gated against the hashed sidecar geometry and hashed tolerances. Validator implementations and their canonical proof outcomes are not bytes in the input hash. The output-dock and carrier sidecars expose one common pivot axis, widened near and far trunnion/bore pairs outside the belt, exact open C-bearing bars, two bearing plinth contacts plus one servo-foot contact on occupied foundation guard-top faces, a face-coupled safety coupler, zero positive-volume dock overlap with the foundation or bucket, and a continuous full-interval carrier-versus-environment sweep. The bridge, output dock, and exposed-phase-flag sidecars remain outside Rapier; the four flag scene occurrences are phase-derived witnesses. The other nine sidecars supply the causal Rapier world. Source sidecars additionally declare body type, density, friction, restitution, damping, and the product base's CCD request, but the current overlay does not display every numeric property. Sidecars remain authoring data and do not run a solver by themselves.

The replay is generated headlessly by `fixtures/machine-works-consumer/machine-works-simulation.ts` using pinned `@dimforge/rapier3d-compat` `0.19.3`, then committed as hash-bearing Float32 observations for 71 tracks across 1,800 fixed steps; Studio adds the static foundation, bridge, and output dock for 74 rendered instances. The input hash covers all twelve sidecars and grains, the stable nine-sidecar Rapier creation order, the exact non-ingested bridge and output geometry, scene layout and support tolerances, configured tip angle and live minimum-clearance rules, the phase-derived non-interacting flags, the closed belt, pitch and articulation limits, the shared 64-element drive phase, controller and axis constraints, station and mating tolerances, the contacting preloaded pickup frames, keyed insertion and cap seat, the 0.025-world-unit translation, 0.03-radian angular, and 0.001-world-unit penetration merge budgets, the software compound-weld rule, prescribed dock-axis rotation, CCD, counterfactuals, and collection thresholds. Generation separately gates those hashed inputs through painted-solid parity, bridge-foot, swept-alignment, empty-C-yoke, disjoint-sweep, fixed-service-route, head-local-buffer-route, output foundation-contact, belt-separation, bucket-separation, axial-carrier-separation, and continuous carrier-envelope validators; validator code and canonical proof outcomes are not part of `inputHash`. The final hash also covers the observed attachment dwell, actual applied translation and shortest-angle merge corrections, maximum pre-merge penetrations, accepted output tick, pivot, quaternion, configured tip angle, swept radius, minimum dock, foundation, and bucket clearances with every limiting solid, belt contact, speed and travel, exposed-phase-flag tracks, counterfactual displacements, and causal events. This is a bounded proof of fixed-step rigid-body gravity, primitive contact, frictional transport, restitution, CCD, kinematic actuation, magnetic-pickup fixed joints, clearance-key insertion with a vertical cap seat, explicit software welding, prescribed output motion, and sensor containment. It does not prove captive guides, bridge contact or load transfer, electromagnetic force, electricity, motor torque, feedback dynamics, energy use, a solved key latch, an output revolute constraint or bearing response, phase-flag contact or torque, belt tension, tooth engagement, arbitrary-load no-slip behavior, deformable bodies, fluids, thermodynamics, energy conservation across every solver approximation, or “all physics laws.” Voxel only presents the consumer-owned trace.

The current renderer is an internal Studio-only WebGL2 forward+ proof. It bins visible lights into 48-by-48-drawing-buffer-pixel tiles and 24 depth slices, stores light records and cluster indices in data textures, and runs a fixed shader loop of at most 32 local light evaluations per fragment, so authoring or moving more lights does not create a shader variant per count. The 4,096 authored-light ceiling is not permission for 4,096 lights to overlap one fragment: preparation rejects a cluster above 32 influences, excessive cluster work, excess unbounded-range lights, or an oversized viewport with a specific error and retains the previously prepared lighting instead of silently dropping an influence. While perspective lighting is active with more than 32 effective finite-range sources and no unbounded source, camera gestures keep the eye outside the scene's complete static or moving finite influence volume, bound pitch short of an edge-on projection, and pin right-drag and WASD ground-plane movement to the scene origin; the stage hint explains that flat view or lighting off restores movement. This data-derived distance plus centered safety policy prevents the built-in dense proof's reachable camera views from conservatively collapsing its source cloud into one cluster. Dense active lighting retains its separately proven 80-unit far ceiling in both camera projections; flat view restores unrestricted pan, while disabling lighting restores both unrestricted pan and the ordinary 0.25-to-256 camera range. Sparse and unbounded-source scenes remain transactional rather than inheriting the finite dense envelope, and re-enabling perspective lighting reapplies pan, pitch, and zoom before drawing. A scene with unbounded sources or a larger or more overlapping authored field remains governed by the explicit cluster and work limits, which preserve prior lighting whenever its prepared frame would overflow. All light handles share one `InstancedMesh`, so they add one marker draw call rather than one object and draw call per light; disabling lighting changes that shared batch to a subdued edit-handle presentation without allocating another material or program.

The built-in **1,000 orbiting lights** scene (`studio:scene:lighting-1000`) is the deterministic correctness and performance showcase: one thousand neutral instanced receiver cards each have a full-spectrum point light moving roughly one receiver-width around them. The lights span all three orbit axes, varied 1.8–4.5 second periods, and twenty-five row-and-column-scrambled depth bands; their small handles identify source positions without covering the colored receiver response. A browser proof samples two exact times, subtracts an intensity-zero render at each time while holding handles and daylight constant, requires both ordinary and at-least-24-level point-light contribution on more than five percent of the canvas with more than three percent moving strongly, and requires more than three quarters of those strong pixels to be chromatic with substantial warm, cool, and green populations; marker color, marker motion, and marker occlusion therefore cannot satisfy the illumination claim. This remains immediate finite-range raster point lighting only—there is no ray tracing, bounce lighting, denoising, reflection, or shadow path.

The current sealed [named-hardware run](../../benchmarks/results/2026-07-26T06-22-55-772Z-clustered-lights-1000.json) measured commit `ec2f3ea` on an RTX 4090 at 1280×720. Across five identical 600-frame runs, the complete 1,000-light and 1,000-receiver scene sustained 1,208.8 GPU-synchronized uncapped Studio draws/s with 0.80/0.90/1.10 ms frame p50/p95/p99, all 1,000 lights visible, 148,000 triangles, two draw calls, and a measured maximum of 11/32 lights in one cluster. This is deterministic Studio microbenchmark throughput, not requestAnimationFrame/display FPS, gameplay FPS, or a full game-sized scene.

This proof does not add dynamic lighting to the frozen public `voxel@1.0.0` declarations or scene transaction. A successful clustered-light update currently publishes its texture data before `runtime.frame()` draws; if that later draw fails or reports presentation unavailable during a device transition, the Studio compensates by rebuilding its light state at the last successfully presented time and reports both failures if that restoration also fails. That recovery is still not one atomic renderer transaction, so a production renderer V2/next-major light-resource lane needs to integrate light preparation and presentation into the runtime's accepted/presented transaction rather than promote this Studio seam as-is.

The harness drives every one of these, so an agent can arrange, annotate, and manage an ordinary scene the way a person does and read the result back: `scenes()` lists the mount's working collection; `openScene(id)`, `renameScene(id, label)`, and `deleteScene(id)` manage it; `sceneState()` is the open scene as plain data; `selectPlacement(id)` / `selectedPlacement()` are the shared selection; `editScene(next)` commits an add/move/turn/remove (recording one undo step); `undoScene()` / `redoScene()` step the history; `setSnapToGrid(on)` / `snapToGrid()` are the snap flag; `sceneAnnotations(sceneId?)`, `setSceneBrief(text, sceneId?)`, `addSceneAnnotation(draft)`, `removeSceneAnnotation(id)`, `clearSceneAnnotations(sceneId?)`, `showSceneAnnotation(id)`, `setSceneAnnotationMode(on)`, `sceneAnnotationMode()`, and `sendSceneRequest(words?)` expose the same private review flow; `viewState()` and `viewCenter()` separately report the orbit and translated world center; `setViewCenter([x, currentY, z])` drives ground-plane translation through the same camera/light safety path as right-drag and WASD and rejects a vertical jump; and `drawAt(timeMs)` deterministically draws moving lights and returns the clustered-light work metrics for that frame. While a V4 consumer replay is open, `drawAt(timeMs)`, Play, pause, timeline seeks, view controls, captured-view annotations, inspection reads, and `deleteScene(id)` remain valid, while selection, snap, rename, and edit calls reject rather than mutating or outlining stale authored transforms.

Scene changes and every library lane's custom order are currently isolated to the Studio mount. Ordering moves only stable IDs, so catalog objects, model aliases, recipes, and scene placement references remain untouched; a reload reconstructs the source catalog. The accepted persistence direction is an injected, optimistic-revision scene repository with ID-keyed canonical records and separate display-order and preference records. An asynchronous browser bootstrap will hydrate and validate one immutable snapshot from IndexedDB before calling the synchronous Studio mount, while tests will supply an in-memory snapshot. Built-in records remain source-controlled seeds; user overrides and tombstones retain their base seed fingerprint so upgrades surface a conflict or an explicit reset instead of silently hiding new source content. Review annotations remain separate stable-scene-ID records, and a legacy array migrates only when no new snapshot is supplied, after duplicate detection, into one default section preserving its order. This target is not implemented yet; [the engine design](../design/spec.md#studio-scene-catalog-boundary) owns the contract.

Scenes are what earn a game's recipes: filling a street wants a house, a lamp,
and a tree, so building the scene is what drives building those.

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
attachment. Physical meaning lives in a separate versioned sidecar: a
`PhysicalAssetV1` beside a saved recipe names which pieces move as one,
what shape each piece blocks, and where a hinge or slide is allowed. The
bedroom shelf carries the worked example — the nightstand is a fixed
cabinet plus a drawer on a limited slide, the lamp declares a `base` port,
and the blanket deliberately has no sidecar because a draped textile has
no honest rigid shape. `compilePhysicalModelV1` turns a placed arrangement
into distinct, stably named bodies per occurrence, mirrors included; it
proves composition, not physics — no solver runs behind it. On the stage,
the **colliders** toggle outlines those shapes over the picture — solid
outlines for blocking shapes, dashed for sensors, a small cross per
attachment port — and appears only when the open model's recipe carries
physical data. Agents drive the same thing through
`physicalShapes()` and `setPhysicalOverlay(on)` on the harness. The contract
and its limits are in
[physical world invariants](../design/physical-world-invariants.md) and the
[sidecar design](../superpowers/specs/2026-07-21-physical-asset-sidecar-design.md).

Why each authored solid exists is recorded separately from what it is. Machine Works and Windmill each keep a purpose ledger, and both are projected onto a typed graph whose edges are node ids rather than prose, so a checker can ask whether every authored decision reaches a stated need, whether any pair justifies only each other, and whether a declared need is served by nothing. See [the purpose graph](../design/purpose-graph.md).

### Where recipes live and how to add one

Ordinary shelf sections keep recipes in `shapes-recipes.ts`, `wall-recipes.ts`, `garden-recipes.ts`, `cottage-recipes.ts`, `furniture-recipes.ts`, `household-recipes.ts`, `house-recipes.ts`, `home-recipes.ts`, `home-furnishings.ts`, and `outdoor-recipes.ts` under `tools/studio/`, with each module exporting its creators and section book. System-scene assets live in the same reusable recipe lane through `machine-works-recipes.ts`, `riverfall-recipes.ts`, and `windmill-recipes.ts`; none of those scenes owns a renderer-only model format. The contrast catalog is split by family across `contrast-arch-recipes.ts`, `contrast-tapered-recipes.ts`, `contrast-frame-recipes.ts`, `contrast-radial-recipes.ts`, `contrast-branching-recipes.ts`, and `contrast-hybrid-recipes.ts`; those modules export curated family arrays, and `contrast-recipes.ts` assembles them into `createContrastRecipeBook`. The `recipes.ts` hub re-exports and merges every book into `createStudioRecipeBook` so sharing is always a recipe naming another, not a curated subset deciding what may be reused. Shelf entries are derived from the recipes themselves: the id and label on the shelf are the recipe's own, so the two can never disagree.

Adding a recipe takes three steps, and forgetting one is loud:

1. write its creator in the section module it belongs to (or start a
   new module for a new section);
2. add it to that module's section book;
3. add one `recipeEntry` line to its section in `catalog.ts` — plus a
   physical book reference if it carries sidecars.

A shelf test pins that every recipe in the book stands on the shelf
exactly once under its own name, so a half-registered recipe fails the
suite instead of existing quietly.

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
