# Local rules — voxel

Voxel's own additions to, and strengthenings of, the fleet constitution in [AGENTS.md](../../AGENTS.md).

They live here because the constitution section of AGENTS.md is a verbatim copy of `fleet/FLEET.md` that `/sync-instructions` rewrites wholesale. A local rule written into that section is deleted the next time anyone syncs the fleet — which is exactly what happened on 2026-08-01, when a routine canon propagation silently dropped every rule on this page. A repo-tracked file cannot be clobbered by a fleet sync, so this is where they belong.

These rules add concrete repository constraints consistent with the Fleet Orchestration Policy in [AGENTS.md](../../AGENTS.md).

## Product direction

Voxel-only. Owner vision, stated 2026-08-26.

- The engine exists to power realistic 3D environment simulations at high performance, drawn in good-enough voxel graphics. When goals compete, simulation realism and measured performance outrank rendering fidelity: the voxel look is the accepted aesthetic, not a placeholder for something fancier, so effort goes to physical truth and frame budget before visual polish. Rendering work still meets the visual gates it has — "good enough" is a priority ranking, not a licence to ship visible defects.

## Concurrency and commits

Voxel refuses the shared checkout outright: a browser gate boots whatever is on disk, so two sessions in one checkout cannot honestly attribute a whole-app result.

- Concurrent sessions each take their own `git worktree`, and only one session works in the primary checkout (owner rule, 2026-07-31). Sharing one checkout means one index, one `node_modules`, and a browser gate that boots whatever is on disk, so no session can run a whole-app gate and honestly attribute the result. Two sessions sharing voxel cost one session three separate control runs — roughly thirty minutes of browser suites — purely to work out which failures were whose, and it still misread a passing tail as a clean control once. A worktree costs one `npm ci` and removes the whole class.
- When commits and pushes are authorized, use the smallest coherent units that pass their gates. Most cross-session collisions come from two large uncommitted diffs overlapping for hours; short-lived diffs barely overlap at all.
- When sessions must share a checkout anyway, split file ownership explicitly and say so up front. Collisions land on the files neither session owns — the 2026-07-31 pair collided only on `tools/studio/live-physics.ts`, which both a physics change and a windmill change had reason to touch.
- A whole-app gate that fails in a shared checkout has told you nothing about your diff. `npm run test:browser` serves whatever is on disk, so a concurrent session's half-written studio code fails specs your change never touched — the 2026-07-30 full review saw four, including a `.scene-canvas` that never became visible. Never read those as your own result, and never blame the other session without proof: add a throwaway `git worktree` at HEAD, apply only your own staged diff, `npm ci` there, and run the gate in that tree, which is what took that review green through the specs that had failed. The same reasoning covers any gate that exercises the whole app rather than your files.

## Review

For the Fleet Orchestration Policy's risk-based review, persistence means durable or shared data, cross-version migrations, or credible data-loss or compatibility risk; browser-local notes do not escalate merely because they store a disposable preference.

- Browser-local notes and disposable preferences use ordinary risk-based review unless they introduce durable/shared-data, migration, data-loss, compatibility, security, concurrency, money, supply-chain, or sibling-repo risk. Verify reviewer claims against the live codebase before acting on them; substantive findings outweigh approval votes.

## Docs

Voxel-only as of the 2026-08-05 canon cut, which kept `Write prose one line per paragraph` as house style and dropped the rest of `Docs are part of the change` as derivable. Voxel keeps the whole rule, because `README.md` is capability-oriented here and an automatic README edit works against that.

- Docs are part of the change: update every affected surface in the same commit; affected surfaces do not automatically include `README.md`; never reference or mandate files that don't exist.

- Quantified, exhaustive, and causal claims require durable executable proof at the same scope as the prose (owner rule, 2026-08-02). A reviewer assertion, a plausible mechanism, a partial sweep, or a count of candidates exceeding one threshold is not proof for “every,” “only,” “failed on this gate alone,” or an exact causal attribution. Preserve a deterministic counterexample, reviewed fixed fixture, reviewed deterministic proof input or proof generator, or the generator or command plus concise reproducible provenance that can refute the claim when it regresses, and narrow the prose to what that input or procedure actually establishes. Every retained input follows the fleet promotion and Git-blob-size rules; raw task-run measurements remain ignored local evidence and are deleted when no active task, process, reviewer, or documented local workflow needs them.

## Steering

Strengthens the canon line `Steering compounds`: an exploratory question is not an accepted decision.

- Steering compounds: when the user accepts or repeats a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. Do not canonize exploratory questions as accepted decisions. (Established 2026-07-18.)

## Physics and fluid simulation

Voxel-only as of the 2026-08-05 canon cut. The line it strengthened — `Research before you reason`, renamed `Citations are part of the deliverable` in `8923ae5` — was cut as a bar a capable model already holds. Voxel keeps it for the one area of this repository where the temptation to derive is strongest, and where it demonstrably failed once (below).

- Read the readily available resources before building or explaining simulation behaviour yourself (owner rule, 2026-08-01). Physics and fluid dynamics are old, well-documented fields, and the solver in this repository is an open-source engine whose source is one fetch away. Search the literature and the engine's own docs and code for the method, the parameter, and the failure mode before writing a solver, a stability argument, or a tuning sweep. Do not reinvent a scheme that has a name, and do not explain a measured result with a mechanism you have not checked. Evidence: the same session measured that Rapier's per-body soft CCD was inert for a rotating cam and correctly guessed why, then in the same comment asserted that a 45 Hz contact natural frequency "cannot be represented" by a 1/60 s step — Rapier's own `erp = dt*w / (dt*w + 2*zeta)` saturates smoothly and has no such limit, and thirty seconds in `src/dynamics/integration_parameters.rs` would have said so. Cite the file or paper in the comment, so the next reader can check the claim instead of re-deriving it.

- Check which motion a solver mechanism reads before reaching for it. A fast rotating part is not a fast moving body: Rapier drives soft continuous prediction from `rb.linvel()` alone, clamped to `soft_ccd_prediction / dt` (`src/geometry/narrow_phase.rs`), so it is inert for a cam whose body origin sits on the shaft while its nose sweeps about 7 m/s. Measured 2026-08-01: 0.10, 0.25 and 0.50 m produced byte-identical runs, and raising `maxCcdSubsteps` from 1 to 8 changed nothing bit for bit. What worked was the world's contact prediction distance sized at one step of the nose's own travel — penetration 0.0711 m to 0.00129 m — and it is non-monotone (0.05 gave 0.00452, 0.25 gave 0.00606), so sweep it rather than reasoning about it. Moved here from `docs/learning/lessons.md` on 2026-09-02: it is an engine fact this repository depends on, and no test can hold "reach for the right lever".

- A result that depends on contact resolution can pass at one rate by an accident of timing while the mechanism it tests does not exist, so run it at a second rate before believing it. This repository deliberately has exactly one solver rate and every lane derives from it, so there is no second rate to run at: building one is a piece of work, not a gate, which is why this is a rule rather than a test. Evidence: 2026-07-31, commit `73f9bbc`. A carrier's tip "about its bucket-boundary edge" was never implemented; at 240 Hz the product left the carrier anyway by an accident of contact timing, and at 60 Hz it simply sat there. The rate change did not break the scene, it stopped the scene getting away with a missing mechanism. (Moved here from `docs/learning/canon-candidates.md` on 2026-09-02.)

- When one knob controls outcomes that pull against each other, scope it to the phase that needs it; if no scoping helps, the knob is the wrong lever and the cost is in the model. Evidence: 2026-07-30. Release damping had to be strong enough to soften a landing, weak enough to let the product settle inside a fixed trace, and weak enough to keep the fall gravity-driven; the window for the first two constraints was 4 to 6 and the third excluded all of it. It is a design move made before any code exists to check. (Moved here from `docs/learning/canon-candidates.md` on 2026-09-02.)

- A coverage floor a statistical fix cannot lift is a geometry or flow problem wearing a sampling problem's clothes, and the tell is that the failing cells are always the same ones. Evidence: 2026-08-01. Per-cell support counted over 3,600 frames at 288, 576 and 1,152 particles: the worst cell is `surface-river-00-00` in every case and its floor is zero in every case, because it sits upstream of the simulated domain and is drawn over water that is not simulated, so no particle count reaches it. Raising the sample count is the fix that cannot work. (Moved here from `docs/learning/canon-candidates.md` on 2026-09-02.)

## Performance

Voxel-only. No canon equivalent. Moved here from `docs/learning/canon-candidates.md` on 2026-09-02: it is a search heuristic for this repository's per-frame paths rather than a property a test can hold.

- The arithmetic is rarely the cost here; allocation and repetition are, and the shape to look for is a pure function of immutable data called from a per-frame path. Evidence: 2026-07-31. `riverfallSurfaceNeighborsV1(cells)` derived adjacency from a translation that never moves, once per frame — 103,041 distance computations and 321 intermediate arrays, larger than the fluid solver it existed to present. Two sibling costs were 92,448 throwaway arrays a frame and about 2,880 strings per neighbour-grid build. Removing the garbage, with the same operations in the same order, was the entire fix.

## Evidence and searches

Voxel-only. No canon equivalent. Moved here from `docs/learning/lessons.md` on 2026-09-02 because it is a contract of this repository's evidence chain rather than a rule a machine can check: the freeze is a fact about when a search was started, and nothing in the tree records that.

- Anything a search's evidence hashes is frozen from the moment the search starts, prose fields inside declaration objects included. For the windmill fixture that is the evaluator declaration, the numerical profile, and the geometry generator; comments and docstrings are safe, and every declared value is not. Evidence: the 144-candidate search was run three times at 60 Hz — nine minutes each — for one result, because one string in `ablationExpectations` was reworded after the second run. That string is inside `WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1`, which is hashed into `evaluatorDeclarationSha256`, which is hashed into every candidate's `combinedEvaluationSha256`. The physics was identical and every measured number matched to the last decimal; only the hashes moved, and the whole chain had to be regenerated anyway. (2026-08-01.)

- Before trusting a threshold, ask how many populations reach it: a floor shared by two is calibrated for the tighter one and is near-noise for the other, so measure each separately. Evidence: 2026-08-13. `minimumChangedPixelFraction` at 0.0001 served both exact-box removals (98 variants, smallest real detection 0.000359) and whole-placement relocations (8 cases, tightest 0.024441) — a third of the smallest removal, and 244x below the tightest relocation. Raising it broke four removal proofs, and that breakage was the diagnosis rather than a setback. How many populations a constant serves is a fact about the world rather than about the constant, so nothing can assert it. (Moved here from `docs/learning/canon-candidates.md` on 2026-09-02.)

## Creative asset work

Voxel-only. No canon equivalent.

- Creative assets: before generating, curating, reviewing, promoting, or integrating actual creative procedural asset or scene content here or for a downstream game, use `create-diverse-voxel-assets`; its canonical skill is `docs/skills/create-diverse-voxel-assets/SKILL.md`. Do not invoke it for Studio UI, notes or annotations, scene storage/schema/migrations, general occupancy or physics architecture, or documentation cleanup unless the task also authors or reviews creative asset content. A contact sheet proves comparison, not scene coherence.

## Authored visible output

Voxel-only. No canon equivalent.

- No orphan pixels: every authored choice that creates or changes visible output — voxel group, void, material boundary, part, recipe step, model feature, scene placement, context element, light, and motion — must trace to a named need elsewhere in the asset, scene, interaction, or consumer. Record who or what requires it, the job it performs, why it occupies this datum, what fails if it is removed or relocated, and evidence that the claimed consequence is real; a purpose sentence alone is not proof. Audit repeated procedural output by the authored rule and its bounds, with every exception justified separately. Delete, relocate, or redesign anything supported only by “looks cool,” symmetry, surface breakup, genre convention, detail density, or a plausible story. Readability counts only when it communicates a named state, boundary, affordance, hierarchy, orientation, or relationship at the intended camera and scale. Visible mechanisms must make support, attachment, actuation or power transmission, motion constraints, and pickup, release, or other handoffs legible and honest, or be labeled as a study. Creative promotion fails closed while any authored decision lacks this dependency chain.

- A displacement channel needs something to reveal it: one flat colour with no lighting variation leaves exactly one revealer, the outline, so without contrast or a light more displacement buys nothing. Evidence: 2026-08-14. Raising normal excursion from `[0.03, 0.44]` to `[0.03, 1.8]`, tilt gain 8 to 26 and wavelength 20 to 6 moved the measurement from 0.75–1.6% of pixels per 200 ms to 1.8–2.7%: the upstream river visibly bulged past its bank, a silhouette against green grass, while the waterfall curtain — 20 cells of one flat colour at 0.62 opacity facing the camera — stayed a flat slab. "Visible" is a claim about a human looking, and the pixel measurement that stands in for it cannot say why a frame did not change. (Moved here from `docs/learning/canon-candidates.md` on 2026-09-02.)
