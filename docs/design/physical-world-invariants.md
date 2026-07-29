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
  rejects until they arrive. The convex restriction is a solver narrow-phase
  requirement, not a limit on voxel content — see "Voxel-derived colliders"
  below;
- constraints with stable key, kind, two body-local anchor frames, axes,
  limits, motor, and optional break threshold;
- named attachment ports, each a body-local frame, so a higher-level recipe can
  connect reusable assets without knowing their internal geometry.

## Voxel-derived colliders

Accepted design direction on 2026-07-28. The decomposition is implemented in `tools/studio/voxel-colliders.ts`; nothing yet feeds it into a sidecar or a solver. Every model in this repository is a voxel grid, and no cell is more privileged than another, so collider authoring should not require a human to pick which parts of a model get an accurate shape.

Non-convexity is not a problem for voxel content. Any occupied set is exactly the union of axis-aligned boxes, and every box is convex, so a voxel model needs no hull approximation and loses no fidelity — an interlocked ring, a hollow shell, and a torus all decompose exactly. What the convex restriction actually costs is collider count, not accuracy, and count is bounded by merging runs of occupied cells into maximal boxes the same way the renderer already merges faces.

The consequence for the sidecar is that hand-picked primitives should become the exception rather than the interface. A body should be able to declare that its colliders are derived from its own occupied cells under a named merge rule and a declared budget, with hand-authored primitives reserved for deliberate simplifications that the author states as such. Until that exists, the validator's shape list stands and any voxel-faithful body must be written as explicit compound boxes.

`decomposeVoxelsV1` merges runs of solid cells into maximal boxes in a fixed z-then-y-then-x order, so the same occupancy always yields the same boxes in the same order. `voxelDecompositionIssuesV1` checks a decomposition against the occupancy it came from and reports three failures that are otherwise silent until something tunnels or sticks: a solid cell no box covers, a box that fills empty space, and two boxes claiming one cell. A hollow shell, a ring, and a ragged pseudo-random volume all pass exactly, with the hole left open.

The open questions are unchanged. The collider budget at which a many-body contact island stops solving in real time is unmeasured, no fixture consumes the output yet, and determinism across mirrored and nested occurrences is untested because the decomposition currently runs on a built model rather than on a recipe occurrence.

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

The seam is named as of 2026-07-28, and no code moves yet. Machine Works and Windmill now share one extracted exact-sidecar Rapier adapter at `fixtures/physical-asset-rapier-adapter.ts`, which is the first evidence that the solver is its own layer rather than a fixture detail. Both consumers are fixtures, not games, so the extraction trigger in the delivery sequence below has not actually fired: it asks for a consumer that proves the runtime contract, and a fixture proves a boundary instead. The adapter therefore stays in `fixtures/` until a game consumes it. Naming the seam early is worth it anyway, because it settles which layer owns what — the solver owns gravity, contact, joints, and whether a thing falls or holds; the renderer owns light, materials, and how a surface reflects, transmits, or absorbs; neither may reach into the other. Light in particular is a Voxel responsibility and not a physics one, and the current material model is far from it.

Do not build a general rigid-body engine in-house. Use a mature engine behind a narrow adapter for broad phase, narrow phase, contact constraints, friction, joints, sleeping, queries, and continuous collision detection; keep game rules, body creation order, units, fixed-step scheduling, and publication policy in the consumer.

Do not build a rigid-body solver from scratch. Rapier's browser JS/WASM surface is selected for the delivered fixture proof and remains the leading candidate for production consumer adoption because its documented APIs cover [rigid bodies and continuous collision detection][rapier-bodies], [colliders][rapier-colliders], [fixed, revolute, and prismatic joints][rapier-joints], [overlap and shape-cast queries][rapier-queries], and [deterministic WASM execution under controlled inputs and ordering][rapier-determinism].

`@dimforge/rapier3d-compat` `0.19.3` is pinned as a development-only dependency for the headless `fixtures/machine-works-consumer` proof. Studio catalogs twelve exact sidecars; nine causal sidecars enter Rapier as rigid bodies, compound colliders, fixed joints, materials, CCD, sensors, and named ports, while the press bridge, output trunnion dock, and exposed phase flags remain hashed and validated outside the solver. The bridge sidecar matches its painted solids, four named feet terminate on distinct occupied foundation-pad top faces, and rear head pads remain tangent to straight faces as visual alignment datums. Each narrowed cream stator stays inside the empty opening of an orange moving C-yoke through the full prescribed stroke. The exact validation requires three connected occupied yoke bars, a centered empty-cavity port, at least 0.4 world units of running clearance on every transverse stator face, and zero positive-volume overlap between the swept bars and stator. The bridge supplies no Rapier body, captive guide, solved load transfer, or stress evidence. Its cabinet, overhead bus, fixed housings, load beam, and stators form one exact face-connected external actuation route ending at fixed-stator/moving-yoke engagement; each moving head instead carries a precharged local buffer whose internal conduit and ram backing terminate at the pickup plate. The fixture simulates no charging, flexible moving feed, electricity, electromagnetic force, motor torque, feedback dynamics, or energy use. Both heads start preloaded: each component outer face exactly meets an energized pickup plate and a fixed joint retains it. After position, orientation, relative-speed, dwell, and two-voxel clearance insertion pass, the cap crown underside must meet the core top plane after its key occupies core layers seven and eight. Immediately before the pickup joint is removed and exact component colliders are installed on the retained base, the consumer measures the live body against its canonical merged pose, records the actual world-space translation and shortest quaternion-angle correction, rejects correction above 0.025 world units or 0.03 radians, and rejects deepest contact-manifold penetration above the hashed 0.001-world-unit tolerance. Retention is an explicit software compound weld, not a solved lock, latch, magnetic-force calculation, articulated jaw, or in-trace grab. Fifty-eight exact kinematic slats form one bounded articulated loop around two synchronized drums, while four minimal collision-excluded hub-and-radial flags derive from the same hashed phase without claiming gear teeth, contact, or torque. Exact OBB/SAT regression proves boundary-only end-cheek contact, central-barrel clearance, and detection of an overlapping negative control. Rapier contact and friction transport an axis-constrained carrier, and zero-drive and zero-friction ablations bound that causal claim. Full output pose and speed validation precede a prescribed no-snap rotation about the visible carrier trunnion. The axle extends beyond both belt edges into two open C-bearing cradles whose plinths face-contact separate occupied foundation guard-top solids. Each bearing remains at least 0.5 world units outside the belt; all non-axle carrier solids are axially separated from every dock solid; the dock neither penetrates the foundation nor overlaps the bucket; and the axle's complete canonical quarter-turn swept cylinder retains about 0.1528 world units of clearance. A third foundation-contacting foot supports an outboard servo housing whose safety coupler face-contacts the axle. Analytic sin/cos extrema check the complete configured-angle carrier sweep rather than sampled poses: the canonical carrier retains about 0.7528 world units from the foundation and 0.6000 from the bucket. The accepted live release pose repeats the continuous quaternion-aware sweep with at least 0.14 world units from the dock, about 0.7518 from the foundation, and about 0.5990 from the bucket before actuation; the measured tick, pivot, rotation, configured tip angle, radius, all three minimum clearances, and every limiting solid enter the final hash. The dock remains outside Rapier, so this proves neither a revolute constraint, bearing contact response, motor torque, feedback dynamics, nor energy use. The 30-second, 1,800-frame trace records 71 poses per frame and presents 74 instances, with assembly, release, contact, and collection evidence at about 11.67, 18.33, 20.87, and 27.42 seconds. Rapier is not imported by `src/`, emitted into `dist`, or made authoritative by Studio.

The private `studio.scene/4` lane resolves that committed trace from the catalog, validates and defensively owns it once, samples supplied poses at injected time, and projects them into ordinary sparse `patch-batch-instances` deltas. The reusable seam is deliberately renderer-neutral: deterministic recipes define visible geometry, physical sidecars define consumer-readable physical meaning, a fixture or game owns solver rules and the V4 trace, and Voxel observes versioned plain-data poses through its existing delta path. Voxel still performs no integration, collision response, drive control, attachment decision, or feedback from presented animation to the fixture. This proves that bounded consumer-to-renderer seam, not a reusable simulation package, arbitrary-world physics, rollback, persistence, picking parity, or every item in the required-evidence list below.

[rapier-bodies]: https://rapier.rs/docs/user_guides/javascript/rigid_bodies/
[rapier-colliders]: https://rapier.rs/docs/user_guides/javascript/colliders/
[rapier-joints]: https://rapier.rs/docs/user_guides/javascript/joints/
[rapier-queries]: https://rapier.rs/docs/user_guides/javascript/scene_queries/
[rapier-determinism]: https://rapier.rs/docs/user_guides/javascript/determinism/

## Fluid direction

Riverfall currently uses a fixture-local deterministic two-dimensional position-based-fluid thin-sheet solver. It advances 288 fixed-mass particles with projected gravity, fixed-order density corrections, XSPH smoothing, explicit boundary projection, heuristic lip and impact transitions, a speed cap, and an external recirculation pump. A deterministic particle-to-grid presentation maps 240 observed frames onto 321 Eulerian tiles whose grid is checked against the live river, lip, exposed fall, pond, and outflow recipes: every cell-frame fails closed unless at least two visible particles lie inside a radius-10 world-Euclidean Wendland-C2 kernel, and only the nearest eight contribute its recording-start carried tracer, local-speed sample, and support-occupancy proxy. A hashed authored downstream coordinate adds a coherent carrier whose phase uses a bounded five-unit surface-wave floor plus local PBF-speed modulation, cross-reach neighbors smooth the scalar once, and fixed-orientation tile centers move only along the local surface normal so their footprints remain bank-contained. A 24-frame cubic Hermite presentation bridge and appended frame-zero pose close the replay without a pose discontinuity. The derived surface input hash covers the particle input, presentation configuration, and complete canonical topology, and paired near-versus-distant perturbation tests prove local influence without distant extrapolation. Every tile and the concealed underfill use the same blue. The carrier, tracer, occupancy proxy, displacement, neighbor smoothing, and loop bridge are presentation constructs rather than a solved water height, energy, or density field; they do not collide with rendered voxel geometry, and this is not a volumetric or free-surface Navier-Stokes engine.

Keep that implementation as a bounded fixture while the requirement remains a stylized deterministic waterfall proof. Do not grow it by accretion into a general fluid engine. A production fluid project starts by choosing the model from gameplay needs: a heightfield or shallow-water grid for terrain flow, a two-dimensional surface or particle solver for stylized sheets, or a true three-dimensional free-surface solver only when volume, splashing, and arbitrary obstacles justify its cost.

If a second consumer needs the same fluid semantics, define a consumer-owned fluid provider with explicit domain, units, fixed timestep and substeps, material and boundary parameters, initial state, deterministic input ordering, output snapshots, diagnostics, provenance, and disposal. Time-box mature library candidates against browser and worker support, CPU fallback, licensing, serialization, deterministic replay requirements, collider coupling, and measured scene budgets. Import a candidate only if it meets those constraints; otherwise extract the smallest proven solver module, not a universal physics engine.

[NVIDIA PhysX 5](https://nvidia-omniverse.github.io/PhysX/physx/5.2.1/docs/ParticleSystem.html) documents a mature position-based particle-fluid path, but its particle-system implementation requires CUDA and a CUDA context, so it is not a portable WebGL2 browser dependency for this repository. It remains a useful reference and an option for a native GPU consumer, not a reason to put fluid solving in Voxel.

## Declared system boundary

Accepted design direction on 2026-07-28. A bounded scene cannot simulate a universe, so mass and energy have to come from somewhere and disappear into somewhere. Declaring those points is the compromise that lets everything inside behave physically without pretending the simulation is complete.

Three fixtures were already doing this without a shared name for it. Riverfall runs an external recirculation pump. Windmill applies a fixed 10 m/s world flow. Machine Works actuates from a precharged local buffer whose charging it explicitly does not simulate. Each is a point where the system opens, and each is why those fixtures may claim bounded work input but not conservation.

A source or a sink declares the quantity that crosses, whether it is visible or invisible in the scene, and what it truncates — the upstream or downstream process deliberately left unsimulated. Visibility is presentation only; the accounting is identical either way. A conservation claim then states, for one quantity, whether the system is closed and which boundaries it crosses.

This turns the rule in the next section from prose into arithmetic. A system that claims a quantity is closed while declaring a source for it is contradicting itself, because a source is exactly where a system opens; a system that calls a quantity open while naming no boundary has said nothing checkable. Gravity is not a boundary — it is a conservative internal field, and treating it as a source would overstate what crosses the edge.

The model, the checker, and the projections of Machine Works and Windmill are implemented in [the purpose graph](purpose-graph.md). No fixture yet meters a declared boundary numerically, so the current checks are structural: they catch a contradicted or unstated boundary, not an unbalanced one.

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
