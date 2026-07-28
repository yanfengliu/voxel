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

Give every placement, including foundations, context, and landmarks, a named purpose and at least one intentional relation:

```text
feeds -> gates -> carries -> crosses -> drains
supports -> spans
serves -> accesses
frames -> reveals
signals -> directs
contains -> releases
terminates -> anchors
```

If an asset has no relation, remove it or move it to a comparison board. A landmark must still anchor hierarchy, orientation, or navigation.

For each placement record why it is present, why it has this coordinate and orientation, what changes if it is removed, and which datum or relationship relocation would break. If none, remove it or move it to comparison evidence.

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

For visible mechanisms, trace the support or load path to ground or parent, anchor and joint, actuator or transmitted power, allowed motion and clearance, and contact, grasp, transfer, and release sequence. Visual adjacency does not prove a handoff, and a decorative frame does not prove support or power.

Overlap-free placement is only a validity gate. It does not prove contact, flow, access, hierarchy, or meaning.

Represent necessary context such as a channel, bank, floor, road, or room through explicit reusable context models or a clearly scoped scene foundation supported by the live catalog and schema. Test required subject-asset coverage separately from total scene placement count; adding honest context should not fail a brittle “placements equal promoted recipes” assertion.

## Decide where interaction lives

Inspect the live scene and motion schemas before promising behavior.

Use Studio motion for deterministic visual proof that the schema can honestly express. Synchronize periods and phases only when they communicate a relationship.

Use a composite recipe when several pieces are one authored asset and the recipe or physical sidecar can represent that truth.

Use the authoritative consumer/game or an explicit consumer fixture for gates, production, traffic, combat, water state, damage, pathing, triggers, or other simulated behavior. The renderer presents state; it does not become authoritative simulation.

For a directional visual-flow showcase that does not claim simulation:

1. Author connected, independently reusable context recipes for the source, channel, transition, receiver, and exit, and keep an explicit relationship graph beside the scene because placement data alone does not prove flow.
2. Define one plain-data polyline through every visible relationship. Sample it by constant arc length into ordinary rigid placement poses or downstream matrix deltas; never use harmonic translation for one-way travel because it reverses.
3. Phase identical instanced markers around the path. If fading is unavailable, route the return through opaque receiving geometry, below terrain, and back up inside the opaque source so an above-ground adversarial camera cannot see backwards motion or a reset in open air.
4. Hash the canonical path, phases, timing, and generated pose lanes; label the producer as authored kinematics, set only laws it actually follows, and state explicitly that the cue does not prove fluid volume, pressure, continuity, transparency, erosion, or gameplay state.
5. Test fallback-pose parity, direction on each visible reach, hidden-return bounds, maximum adjacent and wrap displacement, static non-overlap, endpoint alignment, descending elevations, receiver containment, both-bank clearance, and animation-off readability.
6. Capture default, overhead, longitudinal, and reverse/adversarial views with lighting and animation states that materially affect readability. Choose a comparison time that is not merely an integer permutation of equally phased identical markers.

Riverfall is a current fluid worked fixture, not a reusable implementation recipe. Reuse its recipe-sidecar-solver-trace boundary and verify exact claims against [Physical world invariants](../../../design/physical-world-invariants.md), the live fixture, and its tests instead of copying volatile counts, timings, or status into this skill.

For a deterministic physics demonstration, keep the solver in a consumer fixture or game and make the render lane observational:

1. Author reusable visual recipes plus explicit bodies, solid/sensor colliders, and attachment ports without claiming that declarations themselves simulate.
2. Make one consumer adapter read those same sidecars into the solver, and add drift tests from authored geometry to sidecars and from sidecars to solver objects; a second hard-coded proxy geometry defeats the proof.
3. Define cross-asset actions as explicit rules backed by solver evidence. Keep visible and physical supports synchronized, validate named mating frames and tolerances, and prove any dynamic-to-authored handoff introduces no hidden snap.
4. Advance a pinned solver at a fixed timestep from versioned inputs and stable creation order. Hash the complete canonical inputs, record poses, velocities, causal events, solver metadata, and result hashes, then validate and defensively own the trace before presenting it through ordinary renderer state.
5. Test event order, contacts and clearances, declared residual or drift budgets, deterministic regeneration, trace-to-render identity, teardown, and a real-browser phase sequence. Use controlled causal ablations and intentional-overlap negative controls where the claim requires them, and state exactly which laws, shapes, controllers, and limitations the evidence covers.

Machine Works is the current rigid-body worked fixture. Treat [Physical world invariants](../../../design/physical-world-invariants.md), its live consumer fixture, and its tests as the source of truth for implemented scope and evidence; exact fixture counts and thresholds are evidence, not reusable skill rules.

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
5. For every visible feature, what job would be lost if it vanished?
6. Which feature can move elsewhere without weakening its job, and if it can, why is it here?
7. What supports each moving element, how is it attached and constrained, and what actuates or powers it?
8. What exact contact or event causes each pickup, carry, release, or transfer?
9. Does any shape or material choice communicate only ornament rather than load, routing, safety, hierarchy, or state?
10. Is any claimed interaction only proximity?

If the reviewer sees isolated specimens, repair composition rather than explaining the title more loudly.

## Test durable intent

Add scene-specific tests for important relationships: shared axes, adjacency, elevation, turns, clearances, model roles, synchronized periods, schema capabilities, and fixed default-view evidence. Keep generic catalog-membership coverage separate; membership does not prove composition.

When intent is encoded as creator constants, add coverage tests that every scene placement and recipe has an exact live purpose-map entry, every direct recipe step or authored feature has a purpose-bearing Build note or feature record, and no record names a missing element. For mechanisms, test visible-to-physical support alignment, grounded load paths, named attachment frames, actuator-to-body linkage, allowed-axis clearance, contact-before-grasp, stable carried relative transform, release-before-deposition, and absence of proximity-only teleports. Keep subtraction and relocation readability as fixed-view human review; a purpose string alone does not prove the rendered result.
