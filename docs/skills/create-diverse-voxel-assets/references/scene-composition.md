# Scene composition

Use this reference when creating or reviewing a Studio scene, gameplay environment, diorama, asset set in context, or animated system.

## Choose the honest artifact

Decide which artifact is needed before placement:

- A **contact sheet** compares assets under controlled spacing and camera conditions.
- A **context scene** proves scale, palette, camera readability, and coexistence.
- A **system scene** communicates functional relationships, routes, dependencies, or synchronized behavior.

Do not name a contact sheet like a functioning place. Equal-gap rows, arbitrary quarter-turns, and a flat inventory remain comparison evidence even if every asset shares a domain.

## Write the relationship graph first

List the scene's nodes and edges before coordinates.

Give each placement a role such as source, destination, support, crossing, control, transfer, storage, service access, boundary, hazard, or landmark.

Give every non-background placement at least one intentional relation:

```text
feeds -> gates -> carries -> crosses -> drains
supports -> spans
serves -> accesses
frames -> reveals
signals -> directs
contains -> releases
terminates -> anchors
```

If an asset has no relation, remove it, move it to a comparison board, or state why it is an intentional landmark.

When the live scene schema has no relationship fields, keep the graph as authored design data, creator constants, tests, or concise documentation rather than silently inventing a runtime contract. Encode its visible consequences through positions, turns, elevations, periods, and model choices.

## Author the spatial story

Establish:

1. a primary flow, route, room, street, shoreline, production line, or sightline;
2. meaningful elevations and connection datums;
3. aligned openings, decks, ports, tracks, banks, thresholds, or service clearances;
4. one focal node and a supporting hierarchy;
5. readable foreground, middle distance, and background from the default camera;
6. enough contextual surface to explain relationships without swallowing reusable models into one undifferentiated grid.

Place crossings perpendicular to what they cross. Attach controls to what they control. Make stairs and lifts reach real levels. Make signals face an approach. Make supports meet their loads. Make channels enter and leave compatible openings.

Overlap-free placement is only a validity gate. It does not prove contact, flow, access, hierarchy, or meaning.

Represent necessary context such as a channel, bank, floor, road, or room through explicit reusable context models or a clearly scoped scene foundation supported by the live catalog and schema. Test required subject-asset coverage separately from total scene placement count; adding honest context should not fail a brittle “placements equal promoted recipes” assertion.

## Decide where interaction lives

Inspect the live scene and motion schemas before promising behavior.

Use Studio motion for deterministic visual proof that the schema can honestly express. Synchronize periods and phases only when they communicate a relationship.

Use a composite recipe when several pieces are one authored asset and the recipe or physical sidecar can represent that truth.

Use the downstream game's simulation and adapter for gates, production, traffic, combat, water state, damage, pathing, triggers, or other gameplay behavior. The renderer presents state; it does not become authoritative simulation.

If the available authoring schema can only co-locate models, describe the artifact as a static study. Do not imply mechanical or causal interaction in its name or summary.

## Review the scene

Capture and inspect:

- the intended default camera and gameplay camera;
- at least one rotated or adversarial view that exposes accidental spacing or intersections;
- lighting on and off when lighting affects readability;
- animation enabled and disabled when the scene has motion;
- exact motion phases for synchronized elements;
- selection, picking, and edit handles without stale overlays;
- scale relationships and navigation clearances;
- the relationship graph against what is visibly communicated.

Ask a fresh reviewer:

1. What is the scene about without reading its title?
2. Which object is focal, and why?
3. What connects to what?
4. Where does movement or flow begin and end?
5. Which placement could be removed without changing the story?
6. Is any claimed interaction only proximity?

If the reviewer sees isolated specimens, repair composition rather than explaining the title more loudly.

## Test durable intent

Add scene-specific tests for important relationships: shared axes, adjacency, elevation, turns, clearances, model roles, synchronized periods, schema capabilities, and fixed default-view evidence. Keep generic catalog-membership coverage separate; membership does not prove composition.
