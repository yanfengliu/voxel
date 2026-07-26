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

For a deterministic physics demonstration, keep the solver in a consumer fixture or game and make the render lane observational:

1. Author reusable visual recipes plus explicit bodies, solid/sensor colliders, and attachment ports without claiming that declarations themselves simulate.
2. Make one consumer adapter read those same sidecars into the solver. Add drift tests from recipe voxels to sidecar compounds and from sidecar bodies, shapes, materials, CCD, sensors, and ports to solver objects; a second hard-coded proxy geometry defeats the proof.
3. Define every cross-asset action as a rule with evidence. For attachment, name the two ports and require position, orientation, relative-speed, and dwell tolerances before changing membership. For release, move or remove the physical support exactly when and how its visible counterpart moves; never leave a solid render shape collisionless or an invisible collider supporting it.
4. Advance a pinned solver at a fixed timestep from versioned inputs and stable creation order. Hash the complete canonical input: sidecars, scale, body order, trajectories, joints, contact flags, materials, sleep/CCD choices, merge/release rules, thresholds, and event criteria.
5. Record exact poses, velocities, attachment state, causal events, solver/version/gravity metadata, and input/final hashes. Derive positive contact evidence from an active solver manifold and collection from the declared sensor or containment rule, with any solver tolerance explicit and hashed; never add a marker merely because the visual looks close.
6. Validate and defensively own the complete trace once, then project sampled poses through the renderer's ordinary revisioned snapshot or delta path. Give replay poses explicit precedence over procedural animation. If presented-pose picking and editing are not implemented, make the replay scene read-only instead of exposing stale authored interactions.
7. Test event order, port-relative transforms, support contact and clearance, gravity/contact behavior, containment at and around the declared tolerance boundary, repeated byte-identical generation, resynchronization, trace-to-render identity, teardown, and a real-browser phase sequence including the discrete reset. State which laws and shapes are exercised and which are not.

The built-in Machine Works fixture is the narrow reference: exact sidecars drive one fixture-local Rapier adapter, named ports gate compound attachment, a colliding servo carriage visibly tips away, and positive manifold contact plus the declared bucket sensor and hashed 0.05-unit solver tolerance gate collection. It is evidence for that path, not a general simulation API or permission to say “all physics laws.”

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
