# Physical world invariants

Status: accepted design direction on 2026-07-20. Exact recipe-occurrence
occupancy is implemented in Model Studio, and so is authoring-time physical
data: versioned `PhysicalAssetV1` sidecars beside saved recipes, validated
and compiled into distinct per-occurrence bodies, colliders, joints, and
ports ([design](../superpowers/specs/2026-07-21-physical-asset-sidecar-design.md)).
Runtime collision response, rigid bodies, forces, and joints are not
implemented in Voxel; the compiled data has no solver behind it.

## Outcome

The goal is not a catalog of rules such as "keep this wheel on that car." The
goal is one authoritative physical world through which every solid placement,
movement, force, and connection must pass. Models declare generic bodies,
colliders, and constraints; a solver applies the same rules to all of them.

Voxel remains a renderer. It receives the transforms produced by the
authoritative simulation and presents them atomically. It does not decide
whether an object may occupy a position, copy motion from one model part to
another, or feed a visual animation back into physical state.

## Two related guarantees

### Authoring-time object occupancy

A recipe occurrence is one placement of one saved recipe. Every nonempty voxel
in a built Studio model has exactly one occurrence owner:

- direct `part` and `voxels` steps belong to their enclosing occurrence and may
  repaint one another while sculpting that one object;
- every nested `recipe` step creates a separate occurrence, even when two
  steps name the same recipe;
- a mirrored nested occurrence is a separate occurrence when the mirror adds
  cells;
- two different occurrences may touch at faces, edges, or corners, but may not
  own the same nonempty voxel;
- a cross-occurrence conflict fails the whole build with both occurrence paths
  and a coordinate. The builder never returns a clipped or intersecting model.

This is exact for the discrete recipe grid. It validates reusable authored
objects; it is not continuous collision detection and does not make the
renderer's presented occupancy an authoritative simulation world.

### Runtime physical occupancy

Every physical object has one or more explicit solid colliders. Before a new
object or connected assembly is committed, the simulation checks its complete
candidate shape against itself and the current world. The operation either
commits in full or makes no change. Touching is allowed; penetrating another
solid is not. Sensors and triggers are an explicit non-solid role and do not
claim exclusive occupancy.

For moving bodies, "never intersect" means that committed solver states remain
within one declared penetration tolerance. Literal zero penetration is not a
credible floating-point real-time physics promise. Fast objects use swept
queries and continuous collision detection, and kinematic movement uses swept
targets instead of teleporting through solids.

## Universal invariants

1. The simulation is the only authority for physical poses and velocities.
2. Every solid participates in the same contact layer. Exceptions are explicit
   collision policy, never scenario- or model-name checks.
3. Placement, multi-object movement, and structural edits are bounded atomic
   transactions. Any invalid member rejects the entire transaction.
4. Stable generational identities name worlds, bodies, colliders, constraints,
   and commands. Deleted identities are never reused.
5. Rigidly connected shapes are colliders on one compound rigid body. They
   therefore have one transform and cannot drift apart.
6. Parts that need relative motion are separate bodies joined by a generic
   constraint with body-local anchor frames. A wheel uses a revolute joint, a
   drawer a prismatic joint, and a door a revolute joint; none needs car,
   cabinet, or house logic in the solver.
7. Touching does not imply permanent attachment. Pushing transfers forces
   through contact; pulling transfers forces only through an explicit joint,
   attachment, or other declared physical interaction.
8. Forces, impulses, torque, gravity, contacts, and constraints are resolved in
   one fixed-step solver transaction. Code never manually moves "related"
   objects to imitate a connection.
9. Direct transform writes and teleports are unavailable for dynamic bodies.
   Kinematic targets are validated and swept. Render-only animation cannot
   move a collider-bearing root.
10. Commands and asynchronous work carry world, epoch, tick/revision, and
    generational identities. Stale work cannot mutate a replacement world.
11. Solver output must be finite and within declared budgets and tolerances
    before publication. Failure retains the last valid state and fails closed.
12. Rendering consumes an immutable, revisioned physical snapshot. It never
    feeds a presented transform back into the simulation.

## Ownership and data flow

```text
game command
  -> authoritative placement / physics transaction
  -> overlap, sweep, contact, and constraint solve
  -> immutable simulation snapshot at tick N
  -> game-owned Voxel adapter
  -> Voxel snapshot or delta
  -> presented frame for revision N
```

The ownership split is deliberate:

- games own meanings such as drive, open, grab, and place;
- a game-neutral simulation package owns the fixed-step world, placement
  transactions, colliders, bodies, joints, forces, persistence, and replay;
- Studio authors and previews reusable collision shapes, body membership,
  attachment frames, and constraints;
- Voxel renders and picks the resulting revisioned transforms.

Do not put the simulation package inside `voxel` merely because Studio can
preview its authoring data. Extract it only after a consumer proves the runtime
contract and a second consumer demonstrates genuine shared semantics.

## Versioned physical asset sidecar

`RecipeV1` describes visual construction and must not silently acquire
physical meaning. A future `PhysicalAssetV1` sidecar, or a versioned recipe
successor, should use stable named keys rather than mutable step-array indexes.
Its minimum generic data is:

- asset ID and schema version;
- bodies with stable local keys, `fixed | dynamic | kinematic` type, local pose,
  damping, gravity, continuous-collision policy, and mass policy;
- colliders with body key, bounded shape, local pose, density, friction,
  restitution, and `solid | sensor` role;
- shapes initially limited to box, sphere, capsule, cylinder, bounded convex
  hull, compound shape, and static heightfield or mesh;
- constraints with stable key, kind, two body-local anchor frames, axes,
  limits, motor, and optional break threshold;
- named attachment ports, each a body-local frame, so a higher-level recipe can
  connect reusable assets without knowing their internal geometry.

Visual recipe nesting means reuse and placement only. It does not infer a
physical connection. A chair's legs, seat, and back can compile to multiple
colliders on one body. A wheel and chassis compile to separate bodies with a
revolute joint. A bedroom furniture set compiles to independent pieces unless
its physical sidecar explicitly says otherwise.

## Transaction lifecycle

Each command batch follows one path:

1. validate schema, references, identities, finite values, and budgets;
2. recursively instantiate physical assets using stable namespaced keys;
3. build the entire candidate body, collider, and constraint graph off-world;
4. run broad-phase rejection, exact candidate/world overlap tests, internal
   candidate checks, and swept-placement checks;
5. atomically commit every valid structural change or commit none;
6. advance one fixed timestep with bounded substeps;
7. solve contacts and constraints together;
8. audit finite output, penetration tolerance, constraint drift, and budgets;
9. publish one immutable snapshot and a bounded event batch;
10. let the game translate that snapshot into ordinary Voxel render data.

A connected-island move excludes the island's current shapes from the world
query, checks the complete target island and all internal pairs, then commits
all-or-none. This prevents sequential member moves from creating temporary or
order-dependent intersections.

## Solver direction

Do not build a rigid-body solver from scratch. Rapier's browser JS/WASM surface
is the leading candidate for a consumer spike because its documented APIs
cover [rigid bodies and continuous collision detection][rapier-bodies],
[colliders][rapier-colliders], [fixed, revolute, and prismatic joints][rapier-joints],
[overlap and shape-cast queries][rapier-queries], and [deterministic WASM
execution under controlled inputs and ordering][rapier-determinism].

No dependency is added by this design. A spike must first prove the narrow
adapter, license and supply-chain gates, browser lifecycle, fixed-step replay,
performance, and teardown. Solver objects stay private behind that adapter;
public snapshots remain bounded structured data.

[rapier-bodies]: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
[rapier-colliders]: https://rapier.rs/docs/user_guides/javascript/colliders/
[rapier-joints]: https://rapier.rs/docs/user_guides/javascript/joints/
[rapier-queries]: https://rapier.rs/docs/user_guides/javascript/scene_queries/
[rapier-determinism]: https://rapier.rs/docs/user_guides/javascript/determinism/

## Delivery sequence

1. Enforce exact cross-occurrence occupancy in Studio recipes and keep each
   reusable household object visible on the shelf. Delivered.
2. Define physical sidecars and collider/attachment visualization in Studio.
   Prove that a composed set produces distinct bodies and that one intersecting
   placement rejects without mutation. The sidecar schema, validation,
   per-occurrence compile, and bedroom worked example are delivered;
   collider and port visualization in the Studio viewer remains open.
3. Build a headless static-placement kernel in one consumer: exact overlap,
   swept moves, sensors, atomic rollback, and stable conflict diagnostics.
4. Spike Rapier behind a narrow adapter for dynamic and compound bodies,
   gravity, contact, friction, sleeping, and continuous collision detection.
5. Add fixed, revolute, and prismatic constraints. Use a hinged door, sliding
   drawer, and four-wheel serving cart as generic fixtures.
6. Project solver poses into ordinary Voxel instance matrices. Prove exact-tick
   pose parity, interpolation isolation, presented picking parity, and replay.
7. Harden lifecycle, snapshot/restore, deterministic replay, worker teardown,
   soak behavior, and measured browser performance.
8. Extract a shared simulation package only after a second consumer validates
   the same contracts.

## Required evidence

- Overlapping placement is rejected with typed conflicting identities and zero
  mutation; face-touching placement succeeds.
- Random placement and movement sequences never publish a forbidden overlap;
  rejected batches leave byte-identical authoritative state.
- Translation, rotation, and input-order metamorphic tests preserve outcomes.
- Nested and mirrored assets preserve collider counts, stable namespacing,
  anchor frames, and joint handedness.
- A compound rigid object preserves every relative collider transform under
  arbitrary impulses.
- A wheel anchor stays coincident while rotation remains free; pushing or
  pulling the connected chassis moves the constrained island.
- Door and drawer limits and motors never escape their permitted degrees of
  freedom.
- Continuous collision detection prevents named fast-body tunnelling cases.
- Stacks settle within declared penetration, energy, and constraint-drift
  tolerances.
- Delete/recreate and stale-command tests prove ABA-safe identities.
- The same seed, initial state, command order, solver version, and target
  produce identical supported snapshots.
- Physics pose at tick N equals the matrix submitted for render revision N;
  visual-only animation cannot alter a physical root.
- Repeated world creation, restoration, and disposal leave stable resource and
  process counts.
