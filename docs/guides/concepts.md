# Voxel concepts

Status: from 2026-07-15. This is the plain-language guide to the vocabulary the rest of the
documentation assumes. The other documents are written for someone already fluent; this one
exists to make you fluent.

Every term here was invented to prevent a specific bug. The bug is the point, so each entry
names it. If a definition ever reads as ceremony, the bug it prevents is the thing to argue
with.

## The one idea everything descends from

**The game is the truth. The renderer is a disposable mirror.**

Data flows one way: simulation to renderer. The renderer never owns game state, never decides
anything, and can be destroyed and rebuilt at any moment without the game noticing. Every rule
below is a consequence of taking that seriously.

## Naming things that change over time

An object's name is not enough to identify it, once work happens in the background.

**Snapshot** is "here is the entire world right now". **Delta** is "here is only what changed".
Both are plain data: numbers, strings, typed arrays. No functions, no Three.js objects, no
references into live game state.

**Structured-clone-safe** is the technical name for "plain enough to survive being sent to a
worker thread". That single constraint is why the public contracts look the way they do.

**World, epoch, revision** together form the address of a moment. `worldId` says which world.
The **epoch** says "everything before this is void" — a new map, a new game. The **revision**
is a counter that ticks up as the world changes.

> Why both epoch and revision? You load a new map. Background work for revision 57 of the *old*
> map finishes and tries to apply itself to revision 57 of the *new* one. Same number, unrelated
> worlds. The epoch makes that mistake impossible to express.

**Incarnation** distinguishes two different objects that share a name. You delete `chunk:5`, and
later create a new `chunk:5`.

> Why: the ABA problem. Something looks unchanged because its name matches, but it is actually a
> different thing. Without incarnations you can render a deleted building's mesh under a new
> building's name.

**Canonical state** is the renderer's own private, validated, owned copy of the data. "Owned" is
literal: it *copies* your typed arrays on the way in. Mutate yours afterwards and the renderer is
unaffected. This is what "one ownership copy" means in the changelog.

**Tombstone** is a marker that a key was deleted, kept so the key cannot be quietly reused inside
the same epoch.

## The distinction that explains almost everything

- **Accepted** — the renderer has validated and stored this data. It exists in memory.
- **Pending** — accepted, waiting to be drawn. The queue between the other two.
- **Presented** — this is what is *actually on the screen*.

They differ because meshing takes time. You accept revision 10 instantly; workers spend
milliseconds turning it into triangles; until that finishes and gets drawn, **the screen still
shows revision 9.**

> Why it matters: the player clicks. What did they hit? It must be revision 9 — what they *saw* —
> not revision 10, which exists in memory but was never drawn. Otherwise a player clicks a
> building that is not on screen yet.

That one requirement is the reason for **committed** state. Anything described as committed
corresponds to pixels a human actually saw. It is why `pickPresented` and `captureWithManifest`
exist, and why they refuse to read accepted or pending state.

## Voxels to pixels

**Chunk** — voxels are stored in fixed blocks, never individually. A million voxels as a million
scene objects is instantly fatal; one mesh per block is survivable. A **chunk profile** declares
the fixed block size and grid origin a world uses.

**Meshing** — turning "this cell is dirt" into triangles.

**Visible-face oracle** — the deliberately dumb mesher: emit a face wherever a solid cell touches
air. Slow, and obviously correct.

**Greedy mesher** — the fast one: merge neighbouring same-coloured faces into larger quads, so
far fewer triangles reach the GPU.

> Why keep both? The oracle is the *reference*. The greedy mesher is checked against it on a
> frozen corpus of shapes. Correctness comes from the dumb one, speed from the clever one, and
> neither has to be both.

**Worker** — meshing runs on a background thread so the game does not stutter. This buys
performance and creates every race condition below.

**Stale result** — work started for revision 9 finishes *after* revision 10 arrived. Every job
carries world, epoch, revision, incarnation, and policy versions, and anything describing a world
that no longer exists is discarded. The **firewalls** are the points where that check runs: on
receipt, on group completion, and again before commit, because a job can go stale at any of them.

## The frame

**Staging** — building the new version off-screen while the old one is still displayed.

**Seam**, or a mixed frame — the bug all of this exists to prevent: for one frame, half the screen
is new terrain and half is old, or the picture updates but clicking still uses the previous data.

**Atomic**, or the **frame transaction** — a revision touches many things at once: meshes, GPU
buffers, click data, capture identity. Update them one at a time and there is a window where they
disagree. The transaction makes it all-or-nothing:

    prepare everything off-screen
      -> swap it in and validate
        -> draw exactly once
          -> publish every lane together
            -> only now is it "presented"
              -> only now free the old version

Any failure before that commit rolls the whole thing back to the previously displayed revision.

**Ticket**, **lease**, **handle** — single-use tokens meaning "you may commit *this* frame,
*once*". They prevent double-commits and use-after-free.

**Retire** / **dispose** — GPU memory is not garbage collected; it must be freed explicitly.
Retiring is freeing the *old* version, but only after the new one is safely on screen. Too early
gives flicker or a crash; never gives a leak.

**Preflight**, **admission**, **reservation** — checking that work fits (queue depth, memory
budgets) *before* committing to it, so nothing is ever half-accepted. **Backpressure** is
honestly saying no instead of falling over.

## Who owns what

**Standalone** (also called *runtime-rendered*) — Voxel owns the canvas, the camera, and the draw
call. This is AoE2 today.

**Embedded** — the game owns the renderer, camera, and draw; Voxel only contributes objects to
the game's scene. This is City's path, and the migration route for any game that already has a
renderer.

**Borrowed vs owned** — who is responsible for cleanup. If Voxel borrowed your renderer it must
never resize, reconfigure, or dispose it. That is what keeps a host's tone mapping and shadow
settings safe.

**Frame ticket** — in embedded mode Voxel cannot draw, so it cannot know when its work became
visible. It hands the host a ticket: draw, then give this back. Only then is the frame presented.

**Capability report** — a machine-readable, honest list of what actually works, so a consumer can
ask instead of guessing. It is deliberately conservative: a feature that works only behind a
package-internal switch is reported as unsupported, because no consumer can turn it on.

## Animation

Two different models are in use, and both are legitimate.

**Parametric** — the batch declares an oscillation and Voxel evaluates it each frame from injected
time. Per instance: a period, a phase, and translation, rotation, and scale amplitudes. The
motion is `amplitude * sin(2 * pi * t / period + phase)`. Cheap, because nothing is uploaded per
frame. AoE2 uses this for unit motion.

**Host-computed** — the game calculates matrices itself every frame and sends them. Fully general.
City does this today for vehicles and pedestrians: it writes a rotation, scale, and position per
instance per frame. Expressible through ordinary batch updates; the cost is uploading the changed
instances.

Known limits worth naming, rather than discovering later:

- The parametric model **oscillates**; it cannot express continuous rotation. A bobbing boat is
  natural, a turning windmill is not.
- There is **no material animation contract**. City's night glow drives a material's emissive
  intensity, and its water drives a shader time uniform. Neither can currently cross the
  boundary, because `MaterialResourceV1` has no emissive or time fields.
- **Skeletal animation is not implemented, and nothing needs it yet.** A survey on 2026-07-15
  found no `SkinnedMesh`, morph target, `AnimationMixer`, or bone in either City or AoE2. Both
  animate entirely through per-instance transforms and material tricks. It stays deferred because
  no consumer needs it — not because it is forbidden. See the roadmap for the current scope.

## Where to look

| Term | Lives in |
| --- | --- |
| Snapshot, delta, resources, batches, animation | `src/core/contracts.ts` |
| Canonical state, ownership copies | `src/core/canonical-store.ts` |
| Accepted / pending / presented, waiters | `src/core/render-world.ts`, `src/core/presentation-ledger.ts` |
| Chunks, profiles, chunk index | `src/meshing/dense-palette-chunk.ts`, `src/meshing/chunk-index.ts` |
| Oracle and greedy meshers | `src/meshing/visible-face-oracle.ts`, `src/meshing/greedy-opaque-mesher.ts` |
| Workers, scheduling, firewalls | `src/meshing/mesh-worker-*.ts`, `src/meshing/voxel-mesh-scheduler*.ts` |
| Staging, leases, retirement | `src/three/revisionAtomicStaging.ts` |
| The frame transaction | `src/three/revisionAtomicFrameCommit.ts` |
| Committed picking | `src/three/committedPresentedQueryAuthority.ts`, `src/three/pickingContracts.ts` |
| Revision-aware capture | `src/three/revisionCaptureCoordinator.ts` |
| Host modes and ownership | `src/three/runtimeHost.ts`, `src/three/hostFrameProtocol.ts` |
| Capabilities | `src/three/capabilities.ts` |

For what is actually implemented today, read [the README status section](../../README.md) and
[the implementation ledger](../plans/v1-implementation.md); a term appearing here is not a claim
that its feature is finished.
