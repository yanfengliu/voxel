# Physical asset sidecars for Studio recipes

Status: design accepted 2026-07-21. This is step 2 of the delivery sequence
in [physical world invariants](../../design/physical-world-invariants.md):
describe, validate, and compose the physical shape of a saved recipe at
authoring time. No runtime solver, no forces, no contact response — that
work stays outside `voxel` until a consumer proves it with Rapier behind its
own adapter.

## Why

A recipe says how a model looks and how it was made. It deliberately says
nothing about how the model behaves as a thing in a world: what moves as one
piece, what shape it blocks, and where a hinge or slide is allowed. Games
need that data, and they need it per saved object, so a nightstand carries
its own drawer slide into every room that places one.

Writing it into `RecipeV1` would quietly change what every saved recipe
means. So it lives beside the recipe instead: a sidecar document with its
own schema version, keyed by the recipe id it describes. A recipe without a
sidecar has no physical claims at all — that is a valid state, not a
default guess.

## The rule everything hangs on

Visual nesting is reuse and placement, never attachment. Placing a lamp
recipe on a nightstand recipe makes two distinct physical objects that
happen to touch. Anything stronger — resting, fixed, hinged, sliding — must
be said out loud in physical data, and in this slice the only place that can
say it is one asset's own internal joints.

## The sidecar document

Plain data, one document per recipe id, gathered in a book exactly like
recipes are. Survives JSON, `structuredClone`, and IndexedDB.

```ts
export const STUDIO_PHYSICAL_ASSET_SCHEMA_V1 = 'studio.physical-asset/1';

export interface PhysicalAssetV1 {
  readonly schemaVersion: typeof STUDIO_PHYSICAL_ASSET_SCHEMA_V1;
  /** The recipe this sidecar describes; one sidecar per recipe id. */
  readonly recipeId: string;
  readonly bodies: readonly PhysicalBodyV1[];
  readonly colliders: readonly PhysicalColliderV1[];
  readonly constraints: readonly PhysicalConstraintV1[];
  readonly ports: readonly PhysicalPortV1[];
}
```

Every body, constraint, and port carries an author-chosen stable string
key, unique within its list. Keys, never array indexes, are how anything
refers to anything — the invariants doc requires this so an edit that
reorders a list cannot silently rewire physics.

### Bodies

A body is a piece that moves as one. A chair is one body; a cart is a
chassis body and four wheel bodies.

```ts
export interface PhysicalBodyV1 {
  readonly key: string;
  /** fixed: never moves. dynamic: fully simulated. kinematic: driven. */
  readonly type: 'fixed' | 'dynamic' | 'kinematic';
  readonly pose: PhysicalPoseV1;
  /** Overrides density-derived mass when present. Kilograms, > 0. */
  readonly mass?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly gravityScale?: number;
  /** Asks for swept collision checks when a solver exists. */
  readonly continuous?: boolean;
}
```

### Colliders

A collider is one solid (or sensor) shape on one body. Several colliders on
one body make a compound rigid shape — a chair's legs, seat, and back — so
no separate compound shape kind exists.

```ts
export interface PhysicalColliderV1 {
  readonly body: string;
  readonly shape: PhysicalShapeV1;
  readonly pose: PhysicalPoseV1;
  readonly density?: number;
  readonly friction?: number;
  readonly restitution?: number;
  /** Sensors overlap without claiming space. Default 'solid'. */
  readonly role?: 'solid' | 'sensor';
}

export type PhysicalShapeV1 =
  | { readonly kind: 'box'; readonly halfExtents: readonly [number, number, number] }
  | { readonly kind: 'sphere'; readonly radius: number }
  | { readonly kind: 'capsule'; readonly halfHeight: number; readonly radius: number }
  | { readonly kind: 'cylinder'; readonly halfHeight: number; readonly radius: number };
```

Convex hulls, meshes, and heightfields are named future shapes; the
validator rejects them today with a message that says so, rather than
accepting data nothing can check. Capsules and cylinders run along local Y.

### Poses, units, and axes

```ts
export interface PhysicalPoseV1 {
  /** Voxel units, same axes as the grid, from the recipe's grid origin. */
  readonly position: readonly [number, number, number];
  /** Unit quaternion, [x, y, z, w]. Identity when omitted. */
  readonly rotation?: readonly [number, number, number, number];
}
```

One voxel is one unit of length. A body pose is relative to the recipe's
grid origin corner — the same corner `at` placements use — so a collider
wrapping voxels reads directly off the recipe. Collider and anchor poses
are body-local. No implicit axis swap, scale, or unit conversion anywhere.

### Constraints

A constraint joins two bodies of this same asset and allows one named kind
of relative motion. Axes and limits live in each body's local frame through
anchor poses.

```ts
export interface PhysicalConstraintV1 {
  readonly key: string;
  readonly kind: 'fixed' | 'revolute' | 'prismatic';
  readonly bodyA: string;
  readonly bodyB: string;
  readonly anchorA: PhysicalPoseV1;
  readonly anchorB: PhysicalPoseV1;
  /** Local axis for revolute and prismatic; forbidden on fixed. */
  readonly axis?: readonly [number, number, number];
  /** Radians for revolute, voxel units for prismatic. min <= max. */
  readonly limits?: readonly [number, number];
  readonly motor?: { readonly targetVelocity: number; readonly maxForce: number };
  readonly breakForce?: number;
}
```

A drawer is a second body plus a prismatic constraint with limits. A door
is a second body plus a revolute constraint. The solver-facing meaning is
recorded now; enforcing it is solver work, later, elsewhere.

### Ports

A port is a named body-local frame where a future parent may attach
something — a socket, declared without knowing who plugs in.

```ts
export interface PhysicalPortV1 {
  readonly key: string;
  readonly body: string;
  readonly frame: PhysicalPoseV1;
}
```

This slice defines, validates, and namespaces ports through composition.
Wiring them — a parent recipe declaring "lamp base port meets nightstand
top port, fixed" — needs a stable name for a child occurrence, which today
is only a step index. That means an optional `key` on `SubRecipeStepV1`,
a recipe schema addition. It is deliberately deferred to its own slice with
its own migration note, so this slice changes no existing schema at all.

## Compiling a placed arrangement

`compilePhysicalModelV1(recipe, parts, book, physicalBook)` walks the same
occurrence tree the recipe builder walks and returns the flattened physical
content of one built model:

- every occurrence of a recipe with a sidecar contributes its bodies,
  colliders, constraints, and ports, translated by the occurrence placement;
- compiled keys are the occupancy occurrence path plus the local key —
  `studio:made-bed/steps[2]<studio:pillow>#body:pillow` — so two pillows
  are two bodies with distinct stable names and diagnostics read the same
  in occupancy failures and physics failures;
- occurrences without a sidecar contribute nothing, silently — no guessed
  boxes;
- constraints stay inside their occurrence; nothing infers a joint from
  touching;
- the compile either returns the whole graph or throws the whole issue
  list (`PhysicalCompileError`, same stance as `RecipeBuildError`) — never
  a partial or clipped result.

Compiled output is derived data, rebuilt on every compile, so step-indexed
occurrence paths are safe in it; only saved documents must avoid indexes.

The builder is the one authority on which occurrences exist. `BuiltRecipeV1`
carries an `occurrences` ledger — the root, every placed subtree, and every
landed mirror copy, including compositions that own no voxels — and the
compile filters its walked candidates against that ledger rather than
re-deriving landing decisions.

Building this slice exposed and fixed a path-grammar ambiguity: appending
`/mirrors[step:axis]` at the deep end of a copied path let a mirror at one
level and a same-numbered mirror inside a nested recipe spell the identical
path for two different physical occurrences — the furniture set's step-3
mirror collided with the made bed's own step-3 pillow mirror. The marker
now sits directly after the path of the recipe whose mirror ran
(`set/mirrors[3:x]/steps[1]<nightstand>`), which is unambiguous by
construction and reads as what happened.

### Mirrors

The bedroom set mirrors a nightstand-and-lamp pair, so composition must
reflect physical data, not just voxels. Reflection across the grid's middle
plane is not a rigid motion, but every V1 shape is symmetric about its own
local axes, so a mirrored collider is again a valid collider with a
transformed pose: position reflects, orientation conjugates through the
reflection (for the X plane, quaternion `(x, y, z, w)` becomes
`(x, -y, -z, w)`), and constraint axes reflect with their frames. Joint
handedness must survive: a drawer that slides out +X on the left must slide
out -X on the right. This is the subtlest part of the slice and gets the
hardest tests — double-mirror restores every pose and axis exactly, and
mirrored assemblies preserve body, collider, constraint, and port counts.

Like the voxel rule: a mirrored occurrence that lands is a new occurrence
with its own compiled name; a mirror that adds nothing adds nothing.

## Validation

`validatePhysicalAssetV1` returns the whole issue list in one pass, path
plus plain message, exactly like the recipe validator. It enforces:

- schema literal, recipe id, and key shape (nonempty, no whitespace or
  `/ < > #`, unique per list);
- every reference resolves: collider to body, constraint to two distinct
  bodies, port to body;
- finite numbers everywhere; unit quaternions within epsilon; nonzero
  normalized axes; positive dimensions, densities, and masses; ordered
  limits; axis present exactly when the kind needs one;
- named bounds as constants, not magic numbers: at most 64 bodies, 128
  colliders, 64 constraints, and 32 ports per asset; shape dimensions at
  most 256 units; pose positions within ±1024 units.

The book-level check rejects a sidecar whose `recipeId` disagrees with its
book slot, and compiling rejects a sidecar naming a recipe the recipe book
does not hold.

## Worked example: the bedroom shelf

The household recipes gain sidecars that exercise every feature honestly:

- **Bed frame** — one fixed body, compound box colliders (posts, rails,
  platform, headboard).
- **Mattress and pillow** — one dynamic body each, box collider; they rest
  by placement, not attachment, exactly as the invariants doc demands.
- **Blanket** — deliberately no sidecar. A draped textile has no honest
  rigid shape, and the schema must not force a lie; this pins the
  "no sidecar, no claims" rule in a real catalog entry.
- **Nightstand** — a fixed cabinet body plus a dynamic drawer body joined
  by a limited prismatic constraint: the internal-joint showcase.
- **Table lamp** — one dynamic compound body (base, stem, shade) with a
  `base` port for the future attachment slice.
- **Made bed and furniture set** — no bodies of their own; they exist to
  prove composition: distinct bodies per occurrence, correct counts through
  nesting and mirroring, stable compiled names.

Body types here are illustrative authoring data for the reference shelf,
not game rules; a game's own catalog decides what is fixed in its world.

## Out of scope, on purpose

- Collider-against-collider overlap checks. Continuous shape overlap is the
  placement kernel's job (delivery step 3, in a consumer); an authoring-time
  half-version here would duplicate it badly and teach false confidence.
  The exact voxel occupancy check remains the authoring guarantee.
- Cross-occurrence connections and the `SubRecipeStepV1` key (next slice).
- Any solver, integration, contact, or sleeping behavior (steps 4+).
- Convex hull, mesh, and heightfield shapes.
- Studio viewer visualization of colliders and ports. It follows this
  slice, once there is compiled data worth drawing.

## Build order

1. `tools/studio/physical-asset.ts` — schema, constants, validator — with
   `physical-asset.test.ts` pinning every rule and bound. Commit.
2. `tools/studio/physical-compile.ts` — occurrence walk, translation,
   mirror reflection, atomic failure — with `physical-compile.test.ts`
   including the double-mirror and handedness property tests. Commit.
3. `tools/studio/household-physical-assets.ts` — the worked example and its
   tests; update the invariants doc's delivery status, ADR-0009's current
   slice, and the model-studio guide. Commit.

Each step lands only after the studio suite, typecheck, and lint pass, and
the arc closes with the full verify gate.
