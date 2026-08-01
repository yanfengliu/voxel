# Local rules — voxel

Voxel's own additions to, and strengthenings of, the fleet constitution in [AGENTS.md](../../AGENTS.md).

They live here because the constitution section of AGENTS.md is a verbatim copy of `loop-ops/FLEET.md` that `/sync-instructions` rewrites wholesale. A local rule written into that section is deleted the next time anyone syncs the fleet — which is exactly what happened on 2026-08-01, when a routine canon propagation silently dropped every rule on this page. A repo-tracked file cannot be clobbered by a fleet sync, so this is where they belong.

These rules bind alongside the constitution and may only make it stricter. Where one restates a canon rule, the version here wins for this repository.

## Concurrency and commits

Strengthens the canon line `Concurrent sessions share one worktree and one index`. Voxel refuses the shared checkout outright: a browser gate boots whatever is on disk, so two sessions in one checkout cannot honestly attribute a whole-app result.

- Concurrent sessions each take their own `git worktree`, and only one session works in the primary checkout (owner rule, 2026-07-31). Sharing one checkout means one index, one `node_modules`, and a browser gate that boots whatever is on disk, so no session can run a whole-app gate and honestly attribute the result. Two sessions sharing voxel cost one session three separate control runs — roughly thirty minutes of browser suites — purely to work out which failures were whose, and it still misread a passing tail as a clean control once. A worktree costs one `npm ci` and removes the whole class.
- Commit and push in small units, and prefer the smallest coherent one that passes its gates. Most cross-session collisions come from two large uncommitted diffs overlapping for hours; short-lived diffs barely overlap at all.
- When sessions must share a checkout anyway, split file ownership explicitly and say so up front. Collisions land on the files neither session owns — the 2026-07-31 pair collided only on `tools/studio/live-physics.ts`, which both a physics change and a windmill change had reason to touch.
- Commit by explicit pathspec (`git commit -- <files>`), never `git commit -a`, `git add -A`, or `git add .` — a sweeping commit captures whatever another session has staged. This still holds inside a worktree, because a worktree removes the collision, not the habit. (Evidence: voxel c024b33, 2026-07-17.)

## Review

Strengthens the canon line `Review: self-review trivial changes`, narrowing what counts as high-risk persistence so browser-local notes do not escalate by accident.

- Review: self-review trivial changes; adversarially review non-trivial ones — independent agents that try to refute the change against the live code. High-risk work (persistence involving durable or shared data, cross-version migrations, or credible data-loss or compatibility risk; security/auth; concurrency; money; supply chain; edits that reach sibling repos) escalates to the multi-cli-review skill. Browser-local notes and disposable preferences use ordinary risk-based review unless they introduce one of those risks. Reviewers must read the live code; verify reviewer claims against the codebase before acting on them; substantive findings outweigh approval votes.

## Docs

Strengthens the canon line `Docs are part of the change`, because voxel keeps `README.md` capability-oriented and an automatic README edit works against that.

- Docs are part of the change: update every affected surface in the same commit; affected surfaces do not automatically include `README.md`; write prose one line per paragraph (no hard wrapping); never reference or mandate files that don't exist.

## Steering

Strengthens the canon line `Steering compounds`: an exploratory question is not an accepted decision.

- Steering compounds: when the user accepts or repeats a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. Do not canonize exploratory questions as accepted decisions. (Established 2026-07-18.)

## Creative asset work

Voxel-only. No canon equivalent.

- Creative assets: before generating, curating, reviewing, promoting, or integrating actual creative procedural asset or scene content here or for a downstream game, use `create-diverse-voxel-assets`; its canonical skill is `docs/skills/create-diverse-voxel-assets/SKILL.md`. Do not invoke it for Studio UI, notes or annotations, scene storage/schema/migrations, general occupancy or physics architecture, or documentation cleanup unless the task also authors or reviews creative asset content. A contact sheet proves comparison, not scene coherence.

## Authored visible output

Voxel-only. No canon equivalent.

- No orphan pixels: every authored choice that creates or changes visible output — voxel group, void, material boundary, part, recipe step, model feature, scene placement, context element, light, and motion — must trace to a named need elsewhere in the asset, scene, interaction, or consumer. Record who or what requires it, the job it performs, why it occupies this datum, what fails if it is removed or relocated, and evidence that the claimed consequence is real; a purpose sentence alone is not proof. Audit repeated procedural output by the authored rule and its bounds, with every exception justified separately. Delete, relocate, or redesign anything supported only by “looks cool,” symmetry, surface breakup, genre convention, detail density, or a plausible story. Readability counts only when it communicates a named state, boundary, affordance, hierarchy, orientation, or relationship at the intended camera and scale. Visible mechanisms must make support, attachment, actuation or power transmission, motion constraints, and pickup, release, or other handoffs legible and honest, or be labeled as a study. Creative promotion fails closed while any authored decision lacks this dependency chain.
