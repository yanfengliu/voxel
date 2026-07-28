# Downstream integration

Use this reference when asset work happens in a Voxel consumer, moves between repositories, or changes an engine contract for a game need.

## Start from the live consumer

Read the consumer's instructions, rendering adapter, catalog or asset registry, camera, picking path, animation path, performance budgets, and representative gameplay scene before designing. Treat the following fleet examples as orientation only; verify current status in live files.

Require each visible feature, bounded procedural group, exception, placement, material transition, light, and motion to name the authoritative consumer state, interaction, physical structure, or specific readability need that requires it. Prove exact scope, location, removal and relocation failure, smallest adequate form, and live evidence; a generic purpose note does not establish necessity. Do not integrate render-only machinery that the consumer cannot support; remove it or label the artifact as a study.

Voxel is a renderer and authoring reference, not the owner of a game's simulation, commands, save format, UI, faction rules, economy, pathfinding, or art direction.

Confirm that the requested semantic role or entity already exists in the game's authoritative content. If it does not, separate the gameplay or content-design addition from the rendering work and obtain the authority that broader change needs; do not create a render-only fiction that the simulation cannot produce.

## Decide where the work belongs

Keep work in the **game repo** when it contains:

- game-specific semantic names, factions, eras, building roles, resources, roads, biomes, or progression;
- the game's palette, damage states, team colors, selection feedback, or gameplay animation;
- conversion from authoritative game state to render inputs;
- scene composition that proves a particular game loop.

Move work into **Voxel** only when:

- a second real use has already earned the part or recipe inside its game, and a second distinct consumer normally proves that the shape or authoring grammar is genuinely engine-neutral;
- an explicitly shared authoring-shell need may justify engine ownership without two runtime consumers, but game semantics still may not cross the boundary;
- the API can use bounded, versioned, structured-clone-safe data;
- no consumer world type, callback, DOM object, or Three.js object crosses into portable core;
- ownership, coordinate, scale, color, alpha, time, revision, and disposal semantics are explicit;
- engine and affected consumer tests prove the contract.

Do not modify a sibling repo unless the user explicitly includes it in scope. Reading consumer code is evidence for a contract, not authorization to edit it.

Voxel's current contrast candidate generator and accepted-catalog contact sheets operate on Voxel's private Studio recipes. Do not assume they accept a consumer's recipe, instance, or mesh representation. Build a game-local preview and fingerprint adapter, or use a deliberate manual shortlist, when the consumer has a different authoring model; import private engine tooling only when live contracts explicitly support it.

## Preserve the render boundary

The game remains authoritative. Its adapter emits current Voxel snapshot or delta inputs, procedural meshes, chunks, instance batches, cameras, or motion data. Voxel's presented scene is disposable derived state. Preserve the accepted or baked game artifact beside its deterministic recipe and prove rebuild parity before considering engine promotion.

Inject time through the frame context. Keep deterministic asset construction free of wall-clock reads.

Use stable render keys, explicit local-id generations or incarnations, epochs, and revisions. Do not copy an id-only proof into a reusable or asynchronous lane. Never transfer simulation-owned buffers through an ownership-taking API.

Verify picking against presented geometry. A cheap occupancy proxy must not replace a consumer's visible recipe silhouette when the two differ.

Dispose every consumer-owned and engine-owned renderer resource through the correct host boundary. Studio evidence does not prove runtime teardown.

## Consumer patterns

### AoE2

Treat AoE2 as a standalone sole-renderer host only when live files still prove it. Keep unit types, building types, armor, weapons, mounts, Gaia, civilizations, selection, combat, resources, gait, and attack state in AoE2. Preserve its presented posed-recipe silhouette and matching epoch and revision for raised or moving hit regions rather than substituting dense occupancy. Drive disposable motion and interpolation from injected presented time. Validate assets at the orthographic gameplay camera, team-color treatment, animation cadence, population scale, and selection path.

### City

Treat City as an embedded borrowed-renderer consumer only for lanes live files prove. Keep roads, zones, utilities, RCI meaning, vehicles, simulation messages, interpolation, and host render-loop ownership in City. An engine-authored building or wall primitive must fit the borrowed renderer, sparse update, capture, and teardown boundaries without claiming that Voxel owns the rest of the world. Treat any current id-only render key as a bounded proof, not the identity pattern for a new lane; use the protocol's generation or another explicit incarnation.

### Townscaper

Do not assume Townscaper is a Voxel runtime consumer. Verify live package imports, Three.js alignment, and runtime integration before importing `voxel/core` or `voxel/three`; a shared private Model Studio UI alone is not runtime adoption. Preserve Townscaper's production procedural semantics, deterministic cells and seeds, staged rebuilds, water, batching, and game-owned world and scene facades. Build Studio specimens through the production rebuild pipeline rather than maintaining visually similar prefab geometry.

## Consumer proof

For each integrated asset or family:

1. Record source, version, license, and redistribution provenance for imported code or assets.
2. Name the concrete second consumer or shared-shell need that earns engine promotion.
3. Rebuild the asset deterministically from the consumer-owned source and compare it with the accepted or baked artifact.
4. Define the minimal bounded, versioned, JSON- or structured-clone-safe contract with explicit coordinates, units, color, alpha, time, identity generation, revision, ownership, and disposal.
5. Render through the actual consumer adapter and camera.
6. Exercise selection or picking, animation, edits or deltas, context loss where relevant, and teardown.
7. Record draw calls, triangles, instance counts, GPU resources, and stale-job behavior proportionate to the change.
8. Compare the consumer capture with the Studio hypothesis and explain intentional differences.
9. Run the engine and every affected consumer gate when a shared contract changes.

Keep temporary captures and reports under ignored output directories. Commit only durable fixtures and concise evidence that future maintainers need.
