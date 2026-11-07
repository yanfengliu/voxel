# AGENTS.md — voxel

## What this is

A browser-first, voxel-first 3D graphics and rendering toolkit for the owner's strategy and building games — voxel chunks, low-poly procedural geometry, imported assets, instanced entities, overlays, effects, and orthographic or perspective views. Stack: strict TypeScript, a Three.js WebGL2 runtime, Vitest + Playwright.

Non-goals: not a simulation engine, ECS, game-rules library, UI framework, persistence layer, asset-evolution studio, or a general-purpose Three.js replacement. A useful renderer shared by two games beats a universal abstraction that serves none well. **Do not claim a package, command, backend, benchmark, shader, mesher, adapter, or test exists until live files and executable behavior prove it.**

These non-goals describe the public renderer/runtime boundary. Private Studio authoring storage and explicit consumer fixtures may live in this repository, but renderer/core never owns durable consumer data or authoritative simulation.

Voxel's own rules — its strengthenings of the fleet constitution and the rules it adds — live in [docs/policies/local-rules.md](docs/policies/local-rules.md). They add repository constraints consistent with the fleet constitution below. That file holds one line per rule, each linked to the file that holds the rule in full with its reasons and evidence. Do not write them into that section: it is a generated copy of `../fleet/FLEET.md` between `FLEET-CANON` markers. The fleet sync writes only inside those markers and refuses a block it did not write; the 2026-08-01 incident was caused by the retired heading-delimited sync.

<!-- FLEET-CANON:BEGIN sha=7f2f32ea7a5c generated from ../fleet/FLEET.md by `npm run sync-canon` — do not edit inside this block; this repo's own rules go in docs/policies/local-rules.md -->
## Fleet constitution

Shared rules for every repo under `github/`, kept in `../fleet/FLEET.md`; `../fleet/` is fleet's checkout beside this repo's primary checkout. Where a rule gives its reason, use the reason to judge cases the rule does not name; each `[Rn]`'s history is in `../fleet/docs/canon-rationale.md`. This repo's `docs/policies/local-rules.md` may add rules but cannot change these permissions or limits. [R13]

The main agent owns delivery and may implement directly. Use subagents when bounded, independent work or independent judgment materially improves speed or quality; keep small or tightly coupled work with one agent (owner directive, 2026-11-07). [R2, R3]

The designated coordinator reads `../fleet/docs/skills/coordinator.md` before planning and after each compaction, and any agent reads that file's "Delegate" section before delegating. Before these kinds of work, read the matching section of `../fleet/docs/work-rules.md`: standing loops and unattended runs; editing skills, agent instructions or rules; handing off or stopping mid-task.

### Permissions

- Commit, merge to main and push without asking. Force-pushing and rewriting history (they destroy history), and deploying and publishing (they reach other people), need the owner's OK. [R14]
- Ask before a major architecture or product change, a new major dependency, a change to a persistent format or a security boundary, or any other consequential action outside this machine, such as posting or sending something. [R8]
- Change fleet rules (FLEET.md, fleet skills and runbooks, agent memory) or add a rule to a repo's `docs/policies/local-rules.md` only when the owner asks, because the owner sets policy. You may add a proposal with its evidence to `../fleet/canon-candidates.md`, but not edit its entries. [R8]

### Sharing the machine

- Other Claude and Codex sessions may be working in this checkout, and you cannot see them. Do anything beyond a quick read in your own worktree, because two sessions in one tree spoil each other's gates and commits. Never revert, overwrite or delete changes you did not make. When resuming, check which worktrees, branches and files already exist. [R7]
- Done means merged to main and pushed: the owner archives sessions, and work left on a branch is lost. Merge on your branch, get the gates passing there, then move main, because other worktrees build on local main. Judge the merged result itself, not a worker's summary. Then remove your worktree and branch, and report where any unmerged work is. [R14]

### Doing the work

- The repo's gates must pass before any commit that touches code. Docs-only changes need content checks and any gate the repo names for docs, not runtime tests or CI waits. [R14]
- Check the thing that should have changed (the file, the page, the number), not just the exit code or a tool's report: both can pass over a defect. Retest a blocker you inherit before repeating it. Never weaken a test or hide a failure to get green. [R9]
- Look at visual and interactive work rendered at full resolution, through the real controls, from fixed and random views, because passing tests say nothing about pixels. Run it headless unless a visible window is needed. [R16]
- Slowness on the critical path, such as a gate rendering on the CPU of a machine with a GPU, is a defect to fix. [R22]
- After pushing code, follow CI to the end; read a failed job's steps before blaming the code, since a billing limit fails jobs before any step runs. [R15]
- If a fix fails twice for one reason, rethink it. After five real repair attempts at one problem, whatever the approach and counting earlier sessions, stop and report, unless the owner set another limit; for a problem that keeps winning, run the search in `../fleet/docs/skills/hard-problem.md`. Stop when the task's criteria are met; do not invent follow-up work. [R11]
- For substantial or high-risk changes, use independent review when available. High-risk includes persistence and migrations, security and auth, concurrency, money, supply chain, and code changes in another repo. Review the exact revision against the task's criteria, and say so when review was unavailable. Fix the findings that matter and have those fixes checked; note minor ones instead of starting another round. `../fleet/docs/skills/multi-cli-review.md` provides the review mechanics. [R10]
- A defect the owner reports gets a test for its whole class and an entry in `docs/learning/defect-register.md`, because a fix without a check tends to come back. [R17]
- Sessions run long: take new requests in the same session, and never hand off to a new session to shed context. Split work expected to need more than about 200k tokens of context into milestones, each merged to main. [R6]

### Records, sized to the work

- Read `docs/learning/lessons.md` at session start; it lists this repo's known traps, and its header says how to add one. [R18]
- Every change that alters behaviour adds a dated line to `docs/devlog/summary.md` (`../fleet/docs/devlog-template.md`) when it lands, because later sessions orient from its newest entries. Work that spans sessions, has several agents writing, or gets an independent review also keeps its plan and review records in `docs/work/` (`../fleet/docs/work-docs.md`); other work needs none. [R24]
- Raw output (logs, captures, screenshots) stays in ignored folders. Never commit a binary over 512 KiB or any file over 1 MiB; LFS needs the owner's OK. [R23]

### Style and environment

- Plain words; one line per paragraph, no hard wrapping. A report says what changed, how it was checked (including any check skipped or failed) and what is not done. [R25]
- Node 24 is the baseline. Products pin the model IDs they call in their own repo, and nowhere else. Reviewer model pins live only in `../fleet/docs/skills/multi-cli-review.md`. Runtime model calls are allowed and paid for; make per-item calls one-shot, not agent sessions. [R28, R29]
<!-- FLEET-CANON:END -->

## Gates

Toolchain: Node 24, pinned in `.nvmrc`.

Authoritative commands live in `package.json`. For non-trivial work, run the smallest relevant checks while iterating, obtain adversarial review, fix its findings, then run one final `npm run verify` (build · test · typecheck · lint · compatibility · public-API · core-only / mesh-worker / three package checks · supply-chain · browser) before declaring implementation complete. Any later code change requires another full `npm run verify`; a later doc-only change requires the applicable doc checks. Doc-only work must at least pass diff review, link/path checks, Markdown-fence and whitespace checks, and literal intent/forbidden-content searches for user-steered wording; consolidate one coherent doc-only correction before pushing. Never invent a successful command result.

Renderer changes verify to the risk: deterministic unit/property tests (storage, meshing, bounds, seams, revisions, picking); browser tests against the served app (resize, input, capture, context loss, teardown); fixed camera/viewport/DPR reference scenes with before/after screenshots; structured render metrics (draw calls, triangles, GPU resource counts, dropped stale jobs); repeated rebuild/teardown showing stable resource counts; measured performance on named scenes with hardware/browser recorded.

Visual work is never complete until the rendered result has been visually inspected at the intended camera, viewport, and device scale, plus at least one adversarial angle or state appropriate to the risk. Automated pixel comparisons preserve known output but do not replace first-hand inspection; record what was inspected and fix visible discrepancies before declaring completion. (Established 2026-07-26.)

A local green run is not evidence about CI. Read the remote run's result rather than assuming it matches the local one.

What CI runs on each Node, and how each browser test's budget is sized and watched, are in [docs/policies/gates.md](docs/policies/gates.md).

## Invariants & boundaries

The rest of each rule whose detail moved, with its evidence and how it is enforced, is in [docs/policies/invariants.md](docs/policies/invariants.md).

- The game simulation is authoritative; renderer state, scenes, meshes, materials, textures, acceleration structures, captures, and metrics are disposable derived artifacts.
- Public render inputs are bounded, structured-clone-safe data — opaque never-reused render keys or explicit local-ID generations, plus schema/epoch/revision — with no callbacks, DOM objects, Three.js objects, or consumer world types.
- Portable core, voxel storage, meshing, and voxel/heightfield ray-query code must not import Three.js or touch the DOM. The Three.js adapter owns all GPU and browser integration (`THREE.Raycaster` included).
- Consumer adapters translate game snapshots/deltas into engine inputs; roads, zones, AoE units, Townscaper facades, and production simulation components stay in their game repositories. Bounded explicit consumer fixtures may live here as evidence, but never become renderer/core authority.
- Promote scene-enabling mechanisms into Voxel only as bounded, game-neutral capabilities reusable by downstream games; keep each scene's choreography, scripted trajectories, physics or simulation, causal event rules, and game semantics in Studio or consumer fixtures or game-owned adapters, with the renderer observing versioned plain-data state it is handed each frame.
- Scenes simulate live (owner rule, 2026-07-30): every scene computes its motion in real time, at frame rate, in the browser. A pre-recorded trace is never a scene's source of truth; it is at most a determinism fixture a test compares against, and it must never be what the studio plays back for the owner. No new scene may be added on the recorded lane.
- Everything solves at 60 Hz (owner rule, 2026-07-31): one lane constant, `LIVE_TIMESTEP_SECONDS_V1`, and every solver lane derives its step from it rather than spelling a literal.
- Coordinate, unit, color-space, alpha, and transform conventions are explicit at the boundary — never an implicit axis swap, scale, or color conversion.
- Input typed arrays are borrowed and copied on ordinary ingest; only an explicitly named ownership-taking API detaches adapter-owned transfer buffers, and simulation-owned memory is never transferred.
- Meshing is deterministic for identical canonical inputs; async jobs carry world epoch, resource incarnation, source revision, and dependency revisions so stale worker results never overwrite newer state.
- Accepted state is tracked separately from presented state: mesh swaps at frame boundaries, picking reads the same presented data as the canvas, capture waits for or reports incomplete presentation.
- GPU ownership is explicit — every renderer, control, listener, frame callback, geometry, material, texture, render target, cache entry, extension scope, and worker has an idempotent disposal path; context loss/restore follows an explicit state machine.
- Time is injected through the frame context; deterministic paths never read `Date.now()`/`performance.now()` directly (tests drive a manual clock).
- Physics flaws are fixed as universal law (owner rule, 2026-07-31): when a simulation behaves impossibly, the repair is a law of this voxel universe, never a patch to the scene that exposed it. Content may tune a law per material and must state the measured effect; content may never exempt itself, and a law that a body can escape by declaring nothing is not a law.
- A mechanism declares which of its parts may touch (2026-07-31, commit `be30dd8`).
- Placed things are solid (owner rule, 2026-07-30): no two placements may co-exist in the same space — recorded poses included — and no two same-facing surfaces may lie on one rendered plane, because coincident same-facing area is what fights for visibility and always means shared volume.
- Never create one scene object or draw call per voxel at production scale — cull hidden faces, mesh by chunk/region, instance repeats, and make overflow policy explicit.
- Keep `three` an optional peer (`peerDependenciesMeta`), externalized from the build, aligned to one tested release, and deduped for linked Vite consumers — verify a single runtime Three.js instance. WebGL2 via Three.js `WebGLRenderer` is the first production backend; keep the data plane portable but build no speculative backend abstraction before a measured need.
- Public API compatibility holds unless the task authorizes a versioned breaking change; schema changes require explicit versioning and migration guidance. Files stay normally under 500 lines, and no new hand-authored file may exceed 1000. Treat existing files above 500 lines as ratchets: do not materially grow them without an explicit reason and a bounded extraction plan recorded with the change.
- Do not modify a sibling repo (`../city`, `../townscaper`, `../aoe2`) unless the task explicitly includes it — consumer code is evidence for a contract, not code that belongs here.

## Conventions

- Session start: read `docs/design/spec.md` before substantial work, on top of the lessons index the canon already sends you to; inspect the relevant consumer path in `../city`, `../townscaper`, or `../aoe2` before changing a public contract intended for it. Of the spec, read its section map first, then only the sections the work needs.
- Keep `README.md` truthful about implemented status and `docs/design/spec.md` aligned with architectural contracts and delivery gates; update consumer integration notes when a public API or supported Three.js range changes.
- Keep `README.md` capability-oriented: do not add Studio scene descriptions, inventories, status, provenance, metrics, or per-scene links there.
- Record why an authored decision exists as typed graph edges, not prose: a `beneficiary` sentence cannot be traversed, so nothing can check that a chain of reasons terminates or that a stated need is served. Project a system's purpose ledger onto [the purpose graph](docs/design/purpose-graph.md) and let the kernel find orphans, justification cycles, unserved needs, and contradicted system boundaries. Keep the ledger prose as the single source of truth and add only edges and evidence. (Established 2026-07-28, after translating Windmill's prose exposed two mutually justifying contact pairs.)
- Creative model/recipe work is judged by contrast coverage, not item count: palette or seed swaps alone do not count as distinct; a promoted model must differ from its nearest catalog neighbors on at least two independent axes among topology/negative space, multi-view silhouette/massing, scale/proportion, construction/part grammar, material rhythm, or supported motion. Generate deterministic contrast batches, inspect fixed multi-view contact sheets plus structural fingerprints, reject near-duplicates, and extract a reusable part only after a second real use; keep consumer-specific art in its game repository and do not turn Voxel into an asset-evolution system. (Established 2026-07-26.)
- Record source, version, license, and redistribution requirements for imported code, shaders, textures, models, and sample assets — permission to view a sibling asset does not make it appropriate for a reusable package.
- Temporary captures, traces, benchmark output, and renderer dumps belong in ignored output directories; commit only durable fixtures, concise evidence, and documentation useful to a future maintainer.
