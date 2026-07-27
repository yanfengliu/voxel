# Physical world invariants

Status: accepted design direction on 2026-07-20. Exact recipe-occurrence occupancy is implemented in Model Studio, and so is authoring-time physical data: versioned `PhysicalAssetV1` sidecars beside saved recipes, validated and compiled into distinct per-occurrence bodies, colliders, joints, and ports ([design](../superpowers/specs/2026-07-21-physical-asset-sidecar-design.md)). Runtime collision response, rigid bodies, forces, and joints are not implemented in Voxel; the compiled data has no solver behind it.

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

### Which occupancy check runs when

There is no single always-on occupancy check because authored voxel ownership, static scene composition, dynamic rigid contact, fluid boundaries, and renderer picking answer different questions.

| Lane | When it runs | Authority | Policy |
| --- | --- | --- | --- |
| Recipe composition | Every recipe build | Studio recipe builder | Reject cross-occurrence voxel overlap atomically; touching is allowed. |
| Static scene composition | Incrementally after placement edits and exactly on save or catalog promotion | Scene repository validator | Show an edit-time warning; reject promotion for positive-volume overlap unless the scene stores an explicit, reasoned pair waiver. |
| Rigid placement and motion | On placement transactions and every fixed simulation step | Consumer-owned rigid-body engine | Use collider overlap and contact constraints each step, swept queries for candidate motion, and continuous collision detection for declared fast bodies; never infer collision from rendered voxels. |
| Fluid motion | Every solver substep | Consumer-owned fluid solver | Apply the model's explicit boundary conditions or collider coupling and publish model-specific residual diagnostics. |
| Replay presentation | Never re-simulated while rendering | Trace validator, then renderer | Validate schema, scene identity, and provenance field shapes before passing accepted plain-data poses to the renderer; hash authenticity remains the producer's evidence responsibility. |
| Voxel picking | Only when a query is requested | Presented renderer state | Return displayed cell occupancy; never reuse it as general collision or simulation state. |

Only recipe occupancy currently applies as a global invariant. Built-in static scenes are checked by tests through `sceneOverlapsV1`, not by the editor or scene builder, and replay-driven placements are excluded; Machine Works and Riverfall implement narrow fixture-specific portions of the rigid and fluid rows. The scene-store migration must move static overlap checking into the save and promotion transaction so catalog integrity does not depend on remembering a test.

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
physical meaning. The delivered `PhysicalAssetV1` sidecar uses stable named
keys rather than mutable step-array indexes. Its minimum generic data is:

- asset ID and schema version;
- bodies with stable local keys, `fixed | dynamic | kinematic` type, local pose,
  damping, gravity, continuous-collision policy, and mass policy;
- colliders with body key, bounded shape, local pose, density, friction,
  restitution, and `solid | sensor` role;
- shapes today limited to box, sphere, capsule, and cylinder, with compound
  shapes expressed as several colliders on one body; bounded convex hulls and
  static heightfields or meshes remain named future shapes the validator
  rejects until they arrive;
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

Physics is a separate authoritative subsystem, not a Voxel renderer feature. “Separate” means a consumer-owned module or worker behind a versioned snapshot or trace adapter; it does not require a separate repository, process, or generalized engine abstraction before two consumers prove the same contract.

Do not build a general rigid-body engine in-house. Use a mature engine behind a narrow adapter for broad phase, narrow phase, contact constraints, friction, joints, sleeping, queries, and continuous collision detection; keep game rules, body creation order, units, fixed-step scheduling, and publication policy in the consumer.

Do not build a rigid-body solver from scratch. Rapier's browser JS/WASM surface is selected for the delivered fixture proof and remains the leading candidate for production consumer adoption because its documented APIs cover [rigid bodies and continuous collision detection][rapier-bodies], [colliders][rapier-colliders], [fixed, revolute, and prismatic joints][rapier-joints], [overlap and shape-cast queries][rapier-queries], and [deterministic WASM execution under controlled inputs and ordering][rapier-determinism].

`@dimforge/rapier3d-compat` `0.19.3` is now pinned as a development-only dependency for the headless `fixtures/machine-works-consumer` proof. It maps nine of ten exact recipe sidecars into dynamic and kinematic rigid bodies, compound colliders, fixed joints, materials, CCD, sensors, and named ports; 58 kinematic slats, each 26 voxels deep, form one closely pitched articulated conveyor loop around two synchronized internal drive drums. Each slat underside follows the nominal 2.75-unit drum pitch datum and straight and turn gaps are explicitly bounded. The exact sidecar OBB/SAT regression samples all 58 slat compounds against both pitch-drum compounds at 32 drive phases; it requires slat edges and drum end cheeks to share boundary only with zero positive-volume overlap, records at least about 0.275 world units of radial clearance from the central barrel, and moves a boundary witness into intentional overlap as its negative control. The tenth exact sidecar remains cataloged for the exposed axle-cog recipe, but the four cogs never enter Rapier or allocate bodies or colliders: their non-interacting replay poses derive from the two solved drive-drum poses, so one hashed drive phase aligns all 64 presented slat, drive-drum, and exposed-cog elements while the cogs establish only visible axle-phase agreement. Rapier contact and friction transport an axis-constrained dynamic carrier whose locked axes align with the visible foundation guards without claiming guard contact or cog-driven contact. Paired same-geometry 240-tick ablations recreate the complete causal world of foundation, slats, drive drums, carrier, and jointed load in stable order: zero drive must keep maximum displacement within 0.05 world units, and driven zero friction must keep maximum displacement within 20 percent of the driven trace over the same interval; both configurations and both maximum-displacement observations enter the hashes. After validated insertion and compound assembly, the carrier must pass hashed X, Y, Z, orientation, and speed tolerances before an explicit position-based servo captures the exact accepted dynamic pose and starts its tip there without a positional or rotational snap. The resulting 30-second, 1,800-frame trace records 71 poses per frame, presented with two static supports as 73 instances, plus exact assembly, release, positive contact-manifold, and bucket-collection evidence at about 11.67, 18.33, 20.95, and 24.15 seconds; the committed replay carries input/output hashes and the declared 0.05-unit collection tolerance, holds the final frame, and resets discretely at exactly 30 seconds. Rapier is not imported by `src/`, emitted into `dist`, or made authoritative by Studio, and the fixture does not model exposed-cog contact, cog torque, belt tension or compliance, tooth engagement, or arbitrary-load no-slip behavior.

The private `studio.scene/4` lane resolves that committed trace from the catalog, validates and defensively owns it once, samples supplied poses at injected time, and projects them into ordinary sparse `patch-batch-instances` deltas. The reusable seam is deliberately renderer-neutral: deterministic recipes define visible geometry, physical sidecars define consumer-readable physical meaning, a fixture or game owns solver rules and the V4 trace, and Voxel observes versioned plain-data poses through its existing delta path. Voxel still performs no integration, collision response, drive control, attachment decision, or feedback from presented animation to the fixture. This proves that bounded consumer-to-renderer seam, not a reusable simulation package, arbitrary-world physics, rollback, persistence, picking parity, or every item in the required-evidence list below.

[rapier-bodies]: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
[rapier-colliders]: https://rapier.rs/docs/user_guides/javascript/colliders/
[rapier-joints]: https://rapier.rs/docs/user_guides/javascript/joints/
[rapier-queries]: https://rapier.rs/docs/user_guides/javascript/scene_queries/
[rapier-determinism]: https://rapier.rs/docs/user_guides/javascript/determinism/

## Fluid direction

Riverfall currently uses a fixture-local deterministic two-dimensional position-based-fluid thin-sheet solver. It advances a fixed particle set with projected gravity, fixed-order density corrections, XSPH smoothing, explicit boundary projection, heuristic lip and impact transitions, a speed cap, and an external recirculation pump, then records a replay for Studio. It does not collide with rendered voxel geometry and it is not a volumetric or free-surface Navier-Stokes engine.

Keep that implementation as a bounded fixture while the requirement remains a stylized deterministic waterfall proof. Do not grow it by accretion into a general fluid engine. A production fluid project starts by choosing the model from gameplay needs: a heightfield or shallow-water grid for terrain flow, a two-dimensional surface or particle solver for stylized sheets, or a true three-dimensional free-surface solver only when volume, splashing, and arbitrary obstacles justify its cost.

If a second consumer needs the same fluid semantics, define a consumer-owned fluid provider with explicit domain, units, fixed timestep and substeps, material and boundary parameters, initial state, deterministic input ordering, output snapshots, diagnostics, provenance, and disposal. Time-box mature library candidates against browser and worker support, CPU fallback, licensing, serialization, deterministic replay requirements, collider coupling, and measured scene budgets. Import a candidate only if it meets those constraints; otherwise extract the smallest proven solver module, not a universal physics engine.

[NVIDIA PhysX 5](https://nvidia-omniverse.github.io/PhysX/physx/5.2.1/docs/ParticleSystem.html) documents a mature position-based particle-fluid path, but its particle-system implementation requires CUDA and a CUDA context, so it is not a portable WebGL2 browser dependency for this repository. It remains a useful reference and an option for a native GPU consumer, not a reason to put fluid solving in Voxel.

## How physical-law claims are enforced

The following is the required production acceptance policy. Current fixtures implement named subsets of it and are evidence for the boundary, not proof that a general enforcement layer already exists.

A real-time solver numerically approximates selected equations and constraints; no library switch enforces “all physics laws.” Each simulation must declare its supported law set, external forces and controllers, open or closed system boundary, numerical method and version, units, fixed timestep, substeps, tolerances, and known nonphysical clamps or transitions.

Each simulation must reject invalid schemas, non-finite values, unresolved references, unsupported shapes, and exceeded budgets before stepping. Units are declared at the boundary, and adapters must validate every conversion they can check rather than pretending untagged values prove dimensional consistency. Generation must record the diagnostics required by that model, which may include finite-state checks, penetration or boundary residuals, density or constraint error, speed and correction limits, contact impulses, and iteration counts. Publication fails closed when a declared hard bound is exceeded.

Evidence combines deterministic replay or toleranced reproducibility, small reference oracles, metamorphic tests, adversarial initial states, conservation or drift budgets that match the declared system, and causal ablations that remove one force or constraint while holding the rest of the world fixed. An open waterfall with gravity, dissipation, and an external pump must not claim global energy conservation; it should instead prove particle accounting, bounded density and boundary residuals, the expected response to gravity and pumping, and the measurable effect of viscosity. A rigid-body proof should likewise distinguish engine contact from kinematic actuators, servos, sensors, and game-authored state changes.

Current fixture trace generation refuses failed causal thresholds that it explicitly declares. Production trace generation and future catalog promotion must also refuse outputs when that model's required step diagnostics fail. The trace validator validates schema, scene identity, and provenance field shapes, then the renderer presents accepted plain-data poses; neither component establishes hash authenticity or upgrades a passing visual result into a physics claim.

## Delivery sequence

1. Enforce exact cross-occurrence occupancy in Studio recipes and keep each
   reusable household object visible on the shelf. Delivered.
2. Define physical sidecars and collider/attachment visualization in Studio.
   Prove that a composed set produces distinct bodies and that one intersecting
   placement rejects without mutation. Delivered: the sidecar schema,
   validation, per-occurrence compile, the bedroom worked example, and the
   viewer's collider-and-port outline toggle with browser evidence.
3. Build a headless static-placement kernel in one consumer: exact overlap, swept moves, sensors, atomic rollback, and stable conflict diagnostics. Not delivered by the Machine Works fixture.
4. Spike Rapier behind a narrow adapter for dynamic and compound bodies, gravity, contact, friction, sleeping, and continuous collision detection. The single-purpose Machine Works consumer now has a fixture-local exact-sidecar adapter and exception-safe world/event-queue cleanup; its repeated resource-stability and failure-injection teardown proof, a public or production consumer adapter, and browser lifecycle/performance proof remain.
5. Add fixed, revolute, and prismatic constraints. Use a hinged door, sliding drawer, and four-wheel serving cart as generic fixtures. Machine Works uses fixed joints only; the generic constraint set remains.
6. Project solver poses into ordinary Voxel instance matrices. Prove exact-tick pose parity, interpolation isolation, presented picking parity, and replay. Private Studio pose replay and sparse-delta projection are delivered; presented picking parity and a production consumer adapter remain.
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
