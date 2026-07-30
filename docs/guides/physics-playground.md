# The physics playground

The playground is a set of Studio scenes plus a headless twin for exercising the solver lane: five diagnostic stations, three load presets, deterministic scenarios with compact verdicts, and smoke tests. It exists so "does X behave?" is answered by opening a scene or running a test, not by editing source for every experiment.

Both lanes build their worlds from the same data. Station definitions in [physics-playground-stations.ts](../../tools/studio/physics-playground-stations.ts) turn into solver-ready body specs through [physics-playground-bodies.ts](../../tools/studio/physics-playground-bodies.ts); the studio's live Interact lane and the vitest fixture consume those same specs, so a behaviour seen on screen is reproducible in a test by construction. Colliders come from each placement's own voxels through `decomposeVoxelsV1` — the simulated shape is the drawn shape — with one stated exception, the rolling station's ideal-ball twin.

## Launching it

```bash
npm run studio
```

Open **Scenes** in the left rail and pick any of the eight "Physics: …" scenes. A playground scene opens in Interact with the live solver running and the playground panel pinned to the stage's lower left. Nothing in this lane is recorded or hashed; it is a sandbox, and the fixtures are the evidence lane.

Headlessly, the same stations run as deterministic scenarios:

```bash
npx vitest run fixtures/physics-playground/
```

A failing scenario reports a one-line verdict with its timing — status, failed checks, max and mean solver-step cost, and the deepest floor dip — in the assertion message. The preset tests log the same line on success too, but vitest swallows console output by default; to see the timing lines on a green run, add the flags:

```bash
npx vitest run fixtures/physics-playground/playground-presets.test.ts --silent=false --disable-console-intercept
```

## The stations

**Falling objects** — solid stone, hollow stone, and wood cubes plus a long beam drop from six meters. Equal fall acceleration across a fourfold mass ratio, distinct mass readouts, honest landing and rest, and no floor penetration beyond 0.02 m.

**Ramp and friction** — four material blocks on a smooth ramp whose angle the panel selects (5–40°). The ramp is authored flat and pose-pitched in the live world, because a voxel staircase would add geometric friction and drown the comparison. Below `atan(friction)` a block holds; above it, it slides — ice first, stone last. A berm ends every slide on screen.

**Collision range** — five lanes: light wood into heavy steel, heavy steel into light wood, equal masses, a 300 m/s shot at a one-voxel wall with CCD on (stopped) and off (tunnels — the documented discrete-stepping artifact), and a pyramid knock-down. Cases fire from the panel and replay exactly in the headless runner. The engine has no voxel destruction system, so the range tests rigid response only.

**Structures** — a five-block tower, a post-and-lintel arch, a beam on two supports, a contact-clamped cantilever, and a three-pier bridge. Drop weights on them, or remove the bridge's middle pier and watch both spans fall. Rigid bodies and contact only: no joints, no stress field, no deformation, and "attached" honestly means clamped by friction.

**Rolling and rotation** — six shapes race down a 28° slope: the voxel sphere and its ideal-ball twin, solid and hollow cylinders, a cube, and an asymmetric chunk. An identical second track runs 45° to the voxel grid; the spheres stay world-aligned on it, so any behaviour difference between tracks is the grid-direction artifact, with the primitive-ball twin as the smooth control.

**Fields (small / medium / stress)** — the same deterministic drop pile at 10, 100, and 500 blocks. The stress preset does not promise the target frame rate; it promises honest timing numbers instead.

## The panel

Transport: **pause** freezes the solver clock, **tick** advances exactly one 1/240 s step (works while paused), **slow** runs quarter-speed, **reset station** rebuilds the live world from its definition, and **reset playground** also restores the station's defaults. Case buttons fire the scripted scenarios; the ramp's angle menu rebuilds at the chosen pitch. **spawn** releases the next queued magazine block (mass always has a drawn source), **remove** deletes the selected body outright, and **impulse** applies an upward shove worth a 3 m/s velocity change scaled by the body's own mass — a fixed impulse reads as a tap on heavy bodies and a launch on light ones.

Two presentation conventions are worth knowing. A removed body's drawn model freezes at its last presented pose — the authored placement is data the sandbox never edits — so the solver-truth about what still exists is the panel's body list, not the picture. And a spawned magazine block teleports from the drawn queue to its release point; the queue is the visible source, not a feeder mechanism. Stations without a magazine (launcher, structures, rolling, and the fields, whose spawnables are case-driven or pre-placed) show the spawn button disabled.

The readout shows the tick rate, step count, body/collider/contact counts, awake bodies and their voxel total, and the solver's per-frame cost. Selecting a body adds its material, voxel count, mass, position, center of mass, linear and angular velocity, sleep state, and its contacts with the deepest penetration and the touching bodies named. **debug view** draws the selected body's collider boxes, contact points with normals, and velocity vector over the stage.

Browser tests drive all of this through `window.voxelStudio.playground` — the panel's own capabilities as synchronous plain-data calls.

## Constants and tolerances

Everything lives in [physics-playground-materials.ts](../../tools/studio/physics-playground-materials.ts): grain 0.25 m per voxel, timestep 1/240 s, gravity −9.81. Densities are mass units per voxel cube with real-material ratios (wood 0.6, stone 2.5, steel 7.8, ice 0.92). Friction is a single Coulomb coefficient per material (wood 0.45, stone 0.7, steel 0.3, ice 0.04) because Rapier's JS surface has no static/dynamic split. Restitutions: wood 0.2, stone 0.08, steel 0.15, ice 0.05.

The comparison decks (floors, ramp, tracks) declare friction and restitution 1.0 with the Multiply combine rule, so a contact pair's coefficient equals the touching block's own material value — the ramp reads material differences undiluted, and this is a declared testing device, not a hidden knob.

Scenario tolerances are declared beside each check: floor penetration 0.02 m (0.05 m for the fields), rest speed 0.15 m/s, fall-time agreement 2 %, and a 50 ms per-step timing budget that turns a slow run into a reported warning, never a silent pass.

## Findings from building it

Real behaviours the playground exposed, kept here because they are what it is for:

1. **Spawn overlap is silently ejected.** Bodies spawned intersecting get shoved apart with no warning — it displaced the ramp lineup 0.17 m, the bridge decks 0.26 m, and the sphere lanes 0.15 m during authoring. A narrow-phase guard test now fails any station whose bodies spawn penetrating.
2. **80 m/s does not tunnel a 0.25 m wall.** Discrete stepping catches endpoint overlap and ejects the projectile violently backward. True tunneling needs per-step travel beyond the wall-plus-projectile support (~1 m), hence the 300 m/s probe.
3. **CCD works at 300 m/s.** `setCcdEnabled(true)` stops the same shot the discrete path tunnels.
4. **Faceted voxel cylinders do not roll below ~24°.** A d7 cylinder rests on a 0.75 m flat facet and holds via the tipping threshold, not friction. The rolling tracks run at 28° because of it.
5. **The faceted inertia race inverts and is unstable.** On voxel rims, tip-rolling speed is corner-impact-loss dominated; the solid-versus-hollow ordering flips with centimeter-scale spawn changes (±0.05–0.25 m over 8 m, both orderings observed). Only the smooth-collider ball wins robustly: bodies meant to race by inertia need primitive colliders.
6. **High restitution plus a slope equals creep.** Wood at restitution 0.3 crept 0.17 m down a 10° slope it statically holds, walking on its own contact jitter; 0.2 stopped it. The material table documents the change.
7. **An ideal ball never stops on flat ground.** With no rolling resistance it left the world off the apron edge; and a wall lower than the ball's center height just torques it over. The berms stand 1.25 m because of both.
8. **Impulses must scale with mass.** 40 impulse units moved a 130-mass cube one centimeter; the panel's impulse control derives from the body's own mass.
9. **First step is warmup.** A fresh world's first step costs 5–8 ms; steady state runs 0.03 ms (10 bodies) to 0.43 ms (500 single-collider bodies) on the repo's named benchmark machine (i9-13900KF, Node 22 wasm, single-threaded — the same host recorded in [benchmarks/results](../../benchmarks/results)) — the first measured datum for the open collider-budget question in [physical-world-invariants.md](../design/physical-world-invariants.md).

## Deferred

An in-studio compact-result run of the deterministic scenarios (the headless runner and reset-plus-watch cover it today); a collapsible panel so wide stations are never partially occluded; a static/dynamic friction split (upstream Rapier JS limitation); a true compression arch of voxel wedges; joint and motor stations — the trebuchet named in the roadmap is the natural next machine; per-pair contact impulses in the overlay (points, normals, and depth ship today); and a scalar grid-artifact metric (bounce-height spectra per heading) beyond today's positional comparison.
