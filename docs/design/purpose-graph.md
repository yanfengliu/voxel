# Purpose graph

Status: accepted design direction on 2026-07-28. The model, the checker kernel, and projections of Machine Works and Windmill are implemented in `tools/studio/purpose-graph.ts`, `purpose-graph-check.ts`, `machine-works-purpose-graph.ts`, and `windmill-purpose-graph.ts`. Nothing in `src/` depends on it; it is an authoring-time tool, not a renderer or solver contract.

## Why

The no-orphan rule says every authored decision must trace to a named need. Machine Works and Windmill both recorded that trace, and both recorded it as prose.

`MachineWorksMechanicalRelationshipV1` pairs a typed `verb` with an English `object`, and one real entry reads `'belt-drive-west, belt-drive-east, and the closed slat path'` — three targets in one string. `WindmillPurposeEntryV1` has a typed `needId` but an English `beneficiary`. Only `WindmillCompactInterfaceNeedV1` got it right, with `requiredByNeedIds` as an array of ids.

An English beneficiary cannot be traversed, so nothing could ask whether a node's chain of reasons actually terminates. Review had to catch that by reading, and reading does not reliably catch a two-node circle. Typing the edge turns the rule into reachability.

## Model

A node is one authored decision. An edge points from a node to whatever needs it.

| Kind | Meaning |
| --- | --- |
| `experience-need` | What a player, reader, or consumer requires. The only self-justifying kind; every other node must reach one. |
| `solid` | Authored visible geometry. |
| `interface` | A required meeting between two solids — a contact pair, an adjacency, a port. |
| `motion-rule` | A consumer- or solver-owned rule such as a joint, a load law, or a contact policy. |
| `material-source` / `material-sink` | Where mass enters or leaves the system. |
| `energy-source` / `energy-sink` | Where work enters or leaves the system. |

Every node also carries `evidence`, which is either `bound` — naming a run, trace, or capture and what it establishes — or `open`, which records the reason it is unproven and the specific run that would close it. An open obligation is tracked and reported, never silently tolerated and never automatically fatal. This is the same discipline as an admitted hole in a proof assistant: the claim is allowed to be incomplete, but the incompleteness has to be visible and counted.

## Sources and sinks

A bounded scene cannot simulate a universe, so mass and energy have to come from somewhere and disappear into somewhere. Naming those points is the compromise that lets the rest behave physically.

Three fixtures were already doing this without a name for it. Riverfall runs an external recirculation pump. Windmill applies a fixed 10 m/s world flow. Machine Works actuates from a precharged buffer whose charging it explicitly does not simulate. Each is a declared point where the system opens.

Every boundary node states the `quantity` that crosses, whether it is `visible` or `invisible` in the scene, and what it `truncates` — the upstream or downstream process deliberately left unsimulated. Visibility is presentation; the accounting does not care.

A `PurposeConservationClaimV1` then states, for one quantity, whether the system is closed and which boundaries it crosses. This is what makes the honesty rule checkable rather than a warning in prose. A claim that a quantity is closed while the graph declares a source for it is rejected, because a source is exactly where a system opens. A claim that a quantity is open while naming no boundary is also rejected, because it cannot be checked against anything.

Gravity is not a boundary. It is a conservative internal field: the Windmill lever returns to its starting height each cycle, so gravity does no net work over the cycle. Modelling it as an energy source would overstate what crosses the edge of the system.

## Checks

`checkPurposeGraphV1` reports findings; `assertPurposeGraphV1` throws with all of them named.

- `duplicate-node-id`, `unresolved-edge`, `self-justifying-edge` — the graph does not resolve.
- `orphan-node` — an authored decision that names nothing needing it.
- `root-with-edges` — a stated need that claims to exist for something else.
- `justification-cycle` — nodes that justify each other and never reach a need. The finding prints the whole cycle.
- `unserved-need` — a stated need that nothing serves. This is the failure prose review almost never catches, because a missing thing has no entry to read.
- `empty-binding` — evidence that names a proof but nothing the proof establishes.
- `closed-claim-with-boundary`, `open-claim-without-boundary`, `unlisted-boundary`, `unclaimed-quantity`, `claim-polarity-mismatch` — the boundary accounting above.

The kernel never judges whether a claim is true. It judges whether the graph is well-formed and whether every claim is either backed by named evidence or openly recorded as unproven. Truth is still a fixture run's job.

## What projecting the existing systems found

Windmill's prose was mutually justifying in two places. The cam nose said it existed for the follower shoe; the follower shoe said it existed for the cam noses. The head toe and the anvil witness face said the same about each other. Both statements in each pair are reasonable, and together they are a circle with no ground.

The fix was not to pick a winner. A contact pair exists for the contact, and the contact exists for the motion the scene has to show, so both participants now point at an `interface` node. That is a more honest account than either sentence was alone, and `purpose-graph-live.test.ts` pins the literal prose reading as a rejected cycle so the finding cannot quietly return.

Machine Works projected without restructuring. Its press bridge, output dock, and exposed phase flags became tracked open obligations, which matches what the design record already said about each of them staying outside the solver.

## Adding a system

Derive nodes from the existing purpose records rather than restating them, so the prose stays the single source of truth and the graph adds only edges and evidence. Both current projections do this: they import the ledger, look each entry up, and fail with a named diagnostic when an entry has no declared edge.

Author the roots deliberately. `machine-works:need:visible-support-to-ground` and its Windmill counterpart exist because objects fall unless something holds them up, and a scene that leaves a mass unsupported contradicts the first physical law a viewer checks.

## Boundaries of this tool

It records claims and checks their shape. It does not prove geometry, dynamics, or visual results, and passing it is not evidence that a scene is correct — only that its stated reasons hang together. It has no runtime, no world, and no tick, so it is a library rather than an engine.
