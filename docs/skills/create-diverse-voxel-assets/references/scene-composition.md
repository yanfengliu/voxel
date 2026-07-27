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

For a directional visual-flow showcase that does not claim simulation:

1. Author connected, independently reusable context recipes for the source, channel, transition, receiver, and exit, and keep an explicit relationship graph beside the scene because placement data alone does not prove flow.
2. Define one plain-data polyline through every visible relationship. Sample it by constant arc length into ordinary rigid placement poses or downstream matrix deltas; never use harmonic translation for one-way travel because it reverses.
3. Phase identical instanced markers around the path. If fading is unavailable, route the return through opaque receiving geometry, below terrain, and back up inside the opaque source so an above-ground adversarial camera cannot see backwards motion or a reset in open air.
4. Hash the canonical path, phases, timing, and generated pose lanes; label the producer as authored kinematics, set only laws it actually follows, and state explicitly that the cue does not prove fluid volume, pressure, continuity, transparency, erosion, or gameplay state.
5. Test fallback-pose parity, direction on each visible reach, hidden-return bounds, maximum adjacent and wrap displacement, static non-overlap, endpoint alignment, descending elevations, receiver containment, both-bank clearance, and animation-off readability.
6. Capture default, overhead, longitudinal, and reverse/adversarial views with lighting and animation states that materially affect readability. Choose a comparison time that is not merely an integer permutation of equally phased identical markers.

The built-in Riverfall canyon is the narrow visual-flow reference: seven ordinary opaque-voxel recipes and one reused seed-varying tree recipe compose a high river, framed fall, pond, and outflow with ten trees across both banks. Twenty-four instances of one glint recipe follow constant-arc-length samples around a hash-pinned closed path within a six-second replay whose return is hidden below the foundation. Its V1 trace repeats frame zero as the final frame, reducing the ordinary held reset to 10 ms while preserving the existing replay schema and avoiding a spatial pop. Private Studio V4 presents those ordinary poses through the same sparse-delta path used by other replays; fixed browser evidence pins default, overhead, longitudinal, and reverse cameras, distinct phases, and exact render workload. The reusable technique is connected recipes plus a plain path plus ordinary pose or matrix updates, not a water-specific renderer feature and not permission to call authored motion fluid simulation.

For a deterministic physics demonstration, keep the solver in a consumer fixture or game and make the render lane observational:

1. Author reusable visual recipes plus explicit bodies, solid/sensor colliders, and attachment ports without claiming that declarations themselves simulate.
2. Make one consumer adapter read those same sidecars into the solver. Add drift tests from recipe voxels to sidecar compounds and from sidecar bodies, shapes, materials, CCD, sensors, and ports to solver objects; a second hard-coded proxy geometry defeats the proof.
3. Define every cross-asset action as a rule with evidence. For attachment, name the two ports and require position, orientation, relative-speed, and dwell tolerances before changing membership. For release, move or remove the physical support exactly when and how its visible counterpart moves; never leave a solid render shape collisionless or an invisible collider supporting it. When a dynamic body hands off to an explicit servo, validate its full position, orientation, and speed state, capture the exact accepted pose as the servo origin, and prove that the mode change introduces no hidden positional or rotational snap.
4. Advance a pinned solver at a fixed timestep from versioned inputs and stable creation order. Hash the complete canonical input: sidecars, scale, body order, trajectories, joints, contact flags, materials, sleep/CCD choices, merge/release rules, thresholds, and event criteria.
5. Record exact poses, velocities, attachment state, causal events, solver/version/gravity metadata, and input/final hashes. Derive positive contact evidence from an active solver manifold and collection from the declared sensor or containment rule, with any solver tolerance explicit and hashed; never add a marker merely because the visual looks close.
6. Validate and defensively own the complete trace once, then project sampled poses through the renderer's ordinary revisioned snapshot or delta path. Give replay poses explicit precedence over procedural animation. If presented-pose picking and editing are not implemented, make the replay scene read-only instead of exposing stale authored interactions.
7. Test event order, port-relative transforms, support contact and clearance, gravity/contact behavior, containment at and around the declared tolerance boundary, repeated byte-identical generation, resynchronization, trace-to-render identity, teardown, and a real-browser phase sequence including the discrete reset. When a scene claims that one subsystem drives another, add paired causal ablations that separately remove the proposed actuator and the proposed transmission mechanism while preserving the complete relevant world geometry, body creation order, joints, load, gravity, controller timing, and every unrelated input. Record maximum displacement over the same interval rather than only final displacement, compare each ablation with the driven baseline under explicit bounds, and hash the complete ablation configurations and observations. A shared authoring datum is not collision evidence: when articulated exact compounds approach or share a boundary, compose their sidecar OBBs, sample every relevant occurrence and a bounded phase grid, distinguish boundary contact from positive-volume intersection with SAT, record the minimum clearance of non-contacting regions, and include an intentional-overlap negative control. If extra geometry exists only to expose a hidden phase or state visually, give it a reusable recipe and exact sidecar, derive its replay pose from the recorded causal state outside the solver, state explicitly that it allocates no physics body or collider, hash that witness mapping, and call it a visual witness rather than evidence of contact or transmission. State which laws and shapes are exercised and which are not.

The built-in Machine Works fixture is the narrow reference: ten ordinary recipes and exact sidecars define the authored set, while one fixture-local Rapier adapter ingests only the nine causal sidecars; 58 kinematic slats, each 26 voxels deep, form a closely pitched articulated loop around two internal drive drums, with each underside following the nominal 2.75-unit pitch datum and bounded straight and turn gaps. Its exact sidecar OBB/SAT proof samples every slat against both pitch drums at 32 phases, accepts only boundary sharing between slat edges and drum end cheeks, rejects all positive-volume overlap, records at least about 0.275 world units of central-barrel radial clearance, and proves the checker with an intentional-overlap negative control. Four exposed axle cogs reuse the tenth cataloged exact kinematic sidecar, but their non-interacting replay tracks derive from the solved drive-drum poses outside Rapier and allocate no solver bodies or colliders. All 64 presented slat, drive-drum, and exposed-cog elements synchronize from one hashed drive phase, but the cogs prove only visible axle-phase agreement while contact plus friction transport an axis-constrained dynamic carrier through named-port-gated compound assembly. The carrier locks align with visible guards without claiming physical guide contact. Paired same-geometry 240-tick ablations recreate the complete causal world of foundation, slats, drive drums, carrier, and jointed load and record maximum displacement over the same interval: zero drive must remain within 0.05 world units, and driven zero friction must remain within 20 percent of the driven trace's maximum, with both configurations and observations hashed. An explicit position servo may tip the still-colliding carrier only after the full X, Y, Z, orientation, and speed handoff passes its declared tolerances, and it starts from that exact accepted pose without a snap. The consumer records 71 tracks over 1,800 fixed-step frames and Studio V4 presents them with two static supports as 73 instances in a defensively owned 30-second trace through ordinary sparse instance deltas, holding the final frame until the discrete reset at exactly 30 seconds, so downstream games can reuse the recipe-sidecar-solver-trace pattern without adding scene-specific behavior to the renderer. Assembly, release, positive manifold contact, and collection occur at about 11.67, 18.33, 20.95, and 24.15 seconds, with the declared bucket sensor and hashed 0.05-unit solver tolerance gating collection. This is evidence for synchronized frictional transport and exact visual axle-phase agreement, not physical guide contact, exposed-cog contact, cog torque transmission, belt tension or compliance, tooth engagement, arbitrary-load no-slip behavior, a general simulation API, or permission to say “all physics laws.”

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
