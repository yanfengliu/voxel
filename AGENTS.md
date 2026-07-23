# AGENTS.md — voxel

## What this is

A browser-first, voxel-first 3D graphics and rendering toolkit for the owner's strategy and building games — voxel chunks, low-poly procedural geometry, imported assets, instanced entities, overlays, effects, and orthographic or perspective views. Stack: strict TypeScript, a Three.js WebGL2 runtime, Vitest + Playwright.

Non-goals: not a simulation engine, ECS, game-rules library, UI framework, persistence layer, asset-evolution studio, or a general-purpose Three.js replacement. A useful renderer shared by two games beats a universal abstraction that serves none well. AoE2 is the standalone sole-renderer host; City is the embedded borrowed-renderer lane; Townscaper adoption and imported-asset/extension APIs remain future work. **Do not claim a package, command, backend, benchmark, shader, mesher, adapter, or test exists until live files and executable behavior prove it.**

## Fleet constitution

- Work headlessly by default; go non-headless only when nothing else can complete or verify the task, and say why.
- These rules are strong defaults, not law: when one would make the work worse, deviate and say why.
- Scale the approach to the task: trivial changes directly; substantial work as explore → plan → implement → verify, with subagents when work is genuinely parallel.
- Delivery boundary: each minimal coherent verified unit is reviewed, staged (scoped files only), and committed promptly — never commit failing or partial work as a checkpoint. Commit to `main`; push at the end of every task.
- Concurrent sessions share one worktree and one index: commit by explicit pathspec (`git commit -- <files>`), never `git commit -a`, `git add -A`, or `git add .` — a sweeping commit captures whatever another session has staged. (Evidence: voxel c024b33, 2026-07-17.)
- The repo's gates must pass before every commit that touches code; doc-only changes need a self-reviewed diff.
- Review: self-review trivial changes; adversarially review non-trivial ones — independent agents that try to refute the change against the live code. High-risk work (persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos) escalates to the multi-cli-review skill. Reviewers must read the live code; verify reviewer claims against the codebase before acting on them; substantive findings outweigh approval votes.
- Dependency changes: re-resolve the lockfile, run the repo's audit gate (a new HIGH/CRITICAL is a blocker), and note the audit result in the commit message.
- Docs are part of the change: update every affected surface in the same commit; write prose one line per paragraph (no hard wrapping); never reference or mandate files that don't exist.
- Bias to continue: work through the whole accepted plan without mid-plan check-ins; context management is the harness's job, never a reason to stop. Stop only for a genuine blocker, a direction-changing decision, or an explicit stop. (Established 2026-05-01; reinforced 2026-07-05.)
- Error messages are a product surface: whenever code rejects, fails, or throws, say what happened, which specific input caused it, and what would satisfy it — never a bare `Validation failed`, `invalid input`, or a silent boolean false. A diagnostic that forces a human or an agent to read the source to learn why is itself a defect; fix the message in the same change as the bug. Applies equally to validators, CLI output, and assertion text. (Established 2026-07-18, after city's `placeService` answered five rejected placements with only "Validation failed".)
- Steering compounds: when the user gives a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. (Established 2026-07-18.)
- Reviewer model pins live only in `../loop-ops/docs/skills/multi-cli-review.md`, and loop-work model directives in `../loop-ops/DIRECTIVES.md` — never hardcode model IDs anywhere else.
- Lessons files (`docs/learning/lessons.md` where present) require evidence anchors — source, fix commit, test id, behavior delta; unanchored lessons are folklore.
- Recursive loop: before running or driving a pass, read `../loop-ops/docs/skills/recursive-playtest.md`; before building loop machinery, read `../loop-ops/docs/skills/building-recursive-loop.md`.

## Gates

Authoritative commands live in `package.json`. Run the smallest relevant check while iterating and **`npm run verify`** (test · typecheck · lint · build · compatibility · public-API · core-only / mesh-worker / three package checks · supply-chain · browser) before declaring implementation complete. Doc-only work must at least pass diff review, link/path checks, and Markdown-fence and whitespace checks. Never invent a successful command result.

Renderer changes verify to the risk: deterministic unit/property tests (storage, meshing, bounds, seams, revisions, picking); browser tests against the served app (resize, input, capture, context loss, teardown); fixed camera/viewport/DPR reference scenes with before/after screenshots; structured render metrics (draw calls, triangles, GPU resource counts, dropped stale jobs); repeated rebuild/teardown showing stable resource counts; measured performance on named scenes with hardware/browser recorded.

## Invariants & boundaries

- The game simulation is authoritative; renderer state, scenes, meshes, materials, textures, acceleration structures, captures, and metrics are disposable derived artifacts.
- Public render inputs are bounded, structured-clone-safe data — opaque never-reused render keys or explicit local-ID generations, plus schema/epoch/revision — with no callbacks, DOM objects, Three.js objects, or consumer world types.
- Portable core, voxel storage, meshing, and voxel/heightfield ray-query code must not import Three.js or touch the DOM. The Three.js adapter owns all GPU and browser integration (`THREE.Raycaster` included).
- Consumer adapters translate game snapshots/deltas into engine inputs; roads, zones, AoE units, Townscaper facades, and simulation components stay in their game repositories.
- Coordinate, unit, color-space, alpha, and transform conventions are explicit at the boundary — never an implicit axis swap, scale, or color conversion.
- Input typed arrays are borrowed and copied on ordinary ingest; only an explicitly named ownership-taking API detaches adapter-owned transfer buffers, and simulation-owned memory is never transferred.
- Meshing is deterministic for identical canonical inputs; async jobs carry world epoch, resource incarnation, source revision, and dependency revisions so stale worker results never overwrite newer state.
- Accepted state is tracked separately from presented state: mesh swaps at frame boundaries, picking reads the same presented data as the canvas, capture waits for or reports incomplete presentation. Committed `pickPresented` requires a world whose descriptor carries `chunkProfile` and whose runtime enables `voxelWorkers`; other paths report typed unavailable outcomes (`no-presented-frame`, lost/restoring/failed/disposed).
- GPU ownership is explicit — every renderer, control, listener, frame callback, geometry, material, texture, render target, cache entry, extension scope, and worker has an idempotent disposal path; context loss/restore follows an explicit state machine.
- Time is injected through the frame context; deterministic paths never read `Date.now()`/`performance.now()` directly (tests drive a manual clock).
- Never create one scene object or draw call per voxel at production scale — cull hidden faces, mesh by chunk/region, instance repeats, and make overflow policy explicit.
- Keep `three` an optional peer (`peerDependenciesMeta`), externalized from the build, aligned to one tested release, and deduped for linked Vite consumers — verify a single runtime Three.js instance. WebGL2 via Three.js `WebGLRenderer` is the first production backend; keep the data plane portable but build no speculative backend abstraction before a measured need.
- Public API compatibility holds unless the task authorizes a versioned breaking change; schema changes require explicit versioning and migration guidance. Files stay normally under 500 lines; 1000 is a hard ceiling requiring an explicit reason.
- Do not modify a sibling repo (`../city`, `../townscaper`, `../aoe2`) unless the task explicitly includes it — consumer code is evidence for a contract, not code that belongs here.

## Known traps

- Do not approve visual behavior from source inspection alone, structural correctness from a pleasing screenshot alone, or performance from a single unrepeatable frame-time number — the three classic renderer false-positives. (The concurrent-index commit trap that bit this repo — c024b33, 2026-07-17 — is now in the constitution above.)

## Conventions

- Session start: read `README.md` and `docs/design/spec.md` before substantial work; inspect the relevant consumer path in `../city`, `../townscaper`, or `../aoe2` before changing a public contract intended for it.
- Keep `README.md` truthful about implemented status and `docs/design/spec.md` aligned with architectural contracts and delivery gates; update consumer integration notes when a public API or supported Three.js range changes. Add heavier devlog/decision/progress docs only when recurring work makes them useful.
- Record source, version, license, and redistribution requirements for imported code, shaders, textures, models, and sample assets — permission to view a sibling asset does not make it appropriate for a reusable package.
- Temporary captures, traces, benchmark output, and renderer dumps belong in ignored output directories; commit only durable fixtures, concise evidence, and documentation useful to a future maintainer.
