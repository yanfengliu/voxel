# Local rules — voxel

Voxel's own additions to, and strengthenings of, the fleet constitution in [AGENTS.md](../../AGENTS.md).

They live here because the constitution section of AGENTS.md is a verbatim copy of `fleet/FLEET.md` that `/sync-instructions` rewrites wholesale. A local rule written into that section is deleted the next time anyone syncs the fleet — which is exactly what happened on 2026-08-01, when a routine canon propagation silently dropped every rule on this page. A repo-tracked file cannot be clobbered by a fleet sync, so this is where they belong.

These rules bind alongside the constitution and may only make it stricter. Where one restates a canon rule, the version here wins for this repository.

## Product direction

Voxel-only. Owner vision, stated 2026-08-26.

- The engine exists to power realistic 3D environment simulations at high performance, drawn in good-enough voxel graphics. When goals compete, simulation realism and measured performance outrank rendering fidelity: the voxel look is the accepted aesthetic, not a placeholder for something fancier, so effort goes to physical truth and frame budget before visual polish. Rendering work still meets the visual gates it has — "good enough" is a priority ranking, not a licence to ship visible defects.

## Concurrency and commits

Voxel refuses the shared checkout outright: a browser gate boots whatever is on disk, so two sessions in one checkout cannot honestly attribute a whole-app result.

- Concurrent sessions each take their own `git worktree`, and only one session works in the primary checkout (owner rule, 2026-07-31). Sharing one checkout means one index, one `node_modules`, and a browser gate that boots whatever is on disk, so no session can run a whole-app gate and honestly attribute the result. Two sessions sharing voxel cost one session three separate control runs — roughly thirty minutes of browser suites — purely to work out which failures were whose, and it still misread a passing tail as a clean control once. A worktree costs one `npm ci` and removes the whole class.
- Commit and push in small units, and prefer the smallest coherent one that passes its gates. Most cross-session collisions come from two large uncommitted diffs overlapping for hours; short-lived diffs barely overlap at all.
- When sessions must share a checkout anyway, split file ownership explicitly and say so up front. Collisions land on the files neither session owns — the 2026-07-31 pair collided only on `tools/studio/live-physics.ts`, which both a physics change and a windmill change had reason to touch.
- A whole-app gate that fails in a shared checkout has told you nothing about your diff. `npm run test:browser` serves whatever is on disk, so a concurrent session's half-written studio code fails specs your change never touched — the 2026-07-30 full review saw four, including a `.scene-canvas` that never became visible. Never read those as your own result, and never blame the other session without proof: add a throwaway `git worktree` at HEAD, apply only your own staged diff, `npm ci` there, and run the gate in that tree, which is what took that review green through the specs that had failed. The same reasoning covers any gate that exercises the whole app rather than your files.

## Review

Strengthens the canon line `High-risk work — persistence/migrations, security/auth, concurrency, money, supply chain, edits that reach sibling repos — escalates to the multi-cli-review skill`, narrowing what counts as high-risk persistence so browser-local notes do not escalate by accident.

- Review: self-review trivial changes; adversarially review non-trivial ones — independent agents that try to refute the change against the live code. High-risk work (persistence involving durable or shared data, cross-version migrations, or credible data-loss or compatibility risk; security/auth; concurrency; money; supply chain; edits that reach sibling repos) escalates to the multi-cli-review skill. Browser-local notes and disposable preferences use ordinary risk-based review unless they introduce one of those risks. Reviewers must read the live code; verify reviewer claims against the codebase before acting on them; substantive findings outweigh approval votes.

## Docs

Voxel-only as of the 2026-08-05 canon cut, which kept `Write prose one line per paragraph` as house style and dropped the rest of `Docs are part of the change` as derivable. Voxel keeps the whole rule, because `README.md` is capability-oriented here and an automatic README edit works against that.

- Docs are part of the change: update every affected surface in the same commit; affected surfaces do not automatically include `README.md`; write prose one line per paragraph (no hard wrapping); never reference or mandate files that don't exist.

- Quantified, exhaustive, and causal claims require durable executable proof at the same scope as the prose (owner rule, 2026-08-02). A reviewer assertion, a plausible mechanism, a partial sweep, or a count of candidates exceeding one threshold is not proof for “every,” “only,” “failed on this gate alone,” or an exact causal attribution. Preserve a deterministic counterexample, reviewed fixed fixture, reviewed deterministic proof input or proof generator, or the generator or command plus concise reproducible provenance that can refute the claim when it regresses, and narrow the prose to what that input or procedure actually establishes. Every retained input follows the fleet promotion and Git-blob-size rules; raw task-run measurements remain ignored local evidence and are deleted when no active task, process, reviewer, or documented local workflow needs them.

## Steering

Strengthens the canon line `Steering compounds`: an exploratory question is not an accepted decision.

- Steering compounds: when the user accepts or repeats a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. Do not canonize exploratory questions as accepted decisions. (Established 2026-07-18.)

## Physics and fluid simulation

Voxel-only as of the 2026-08-05 canon cut. The line it strengthened — `Research before you reason`, renamed `Citations are part of the deliverable` in `8923ae5` — was cut as a bar a capable model already holds. Voxel keeps it for the one area of this repository where the temptation to derive is strongest, and where it demonstrably failed once (below).

- Read the readily available resources before building or explaining simulation behaviour yourself (owner rule, 2026-08-01). Physics and fluid dynamics are old, well-documented fields, and the solver in this repository is an open-source engine whose source is one fetch away. Search the literature and the engine's own docs and code for the method, the parameter, and the failure mode before writing a solver, a stability argument, or a tuning sweep. Do not reinvent a scheme that has a name, and do not explain a measured result with a mechanism you have not checked. Evidence: the same session measured that Rapier's per-body soft CCD was inert for a rotating cam and correctly guessed why, then in the same comment asserted that a 45 Hz contact natural frequency "cannot be represented" by a 1/60 s step — Rapier's own `erp = dt*w / (dt*w + 2*zeta)` saturates smoothly and has no such limit, and thirty seconds in `src/dynamics/integration_parameters.rs` would have said so. Cite the file or paper in the comment, so the next reader can check the claim instead of re-deriving it.

## Creative asset work

Voxel-only. No canon equivalent.

- Creative assets: before generating, curating, reviewing, promoting, or integrating actual creative procedural asset or scene content here or for a downstream game, use `create-diverse-voxel-assets`; its canonical skill is `docs/skills/create-diverse-voxel-assets/SKILL.md`. Do not invoke it for Studio UI, notes or annotations, scene storage/schema/migrations, general occupancy or physics architecture, or documentation cleanup unless the task also authors or reviews creative asset content. A contact sheet proves comparison, not scene coherence.

## Authored visible output

Voxel-only. No canon equivalent.

- No orphan pixels: every authored choice that creates or changes visible output — voxel group, void, material boundary, part, recipe step, model feature, scene placement, context element, light, and motion — must trace to a named need elsewhere in the asset, scene, interaction, or consumer. Record who or what requires it, the job it performs, why it occupies this datum, what fails if it is removed or relocated, and evidence that the claimed consequence is real; a purpose sentence alone is not proof. Audit repeated procedural output by the authored rule and its bounds, with every exception justified separately. Delete, relocate, or redesign anything supported only by “looks cool,” symmetry, surface breakup, genre convention, detail density, or a plausible story. Readability counts only when it communicates a named state, boundary, affordance, hierarchy, orientation, or relationship at the intended camera and scale. Visible mechanisms must make support, attachment, actuation or power transmission, motion constraints, and pickup, release, or other handoffs legible and honest, or be labeled as a study. Creative promotion fails closed while any authored decision lacks this dependency chain.
