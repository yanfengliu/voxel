# Local rules — voxel

Voxel's own additions to, and strengthenings of, the fleet constitution in [AGENTS.md](../../AGENTS.md).

They live here because the constitution section of AGENTS.md is a verbatim copy of `fleet/FLEET.md` that `/sync-instructions` rewrites wholesale. A local rule written into that section is deleted the next time anyone syncs the fleet — which is exactly what happened on 2026-08-01, when a routine canon propagation silently dropped every rule on this page. A repo-tracked file cannot be clobbered by a fleet sync, so this is where they belong.

These rules add concrete repository constraints consistent with the Fleet Orchestration Policy in [AGENTS.md](../../AGENTS.md).

Each line below is one rule, its section linked to the file that holds the rule in full, why it exists and its evidence; open that file when the work reaches the rule.

- [Product direction](rules/product-direction.md): The engine exists to power realistic 3D environment simulations at high performance, drawn in good-enough voxel graphics.
- [Concurrency and commits](rules/concurrency-and-commits.md):
  - Concurrent sessions each take their own `git worktree`, and only one session works in the primary checkout (owner rule, 2026-07-31).
  - When commits and pushes are authorized, use the smallest coherent units that pass their gates.
  - When sessions must share a checkout anyway, split file ownership explicitly and say so up front.
  - A whole-app gate that fails in a shared checkout has told you nothing about your diff.
- [Review](rules/review.md): Browser-local notes and disposable preferences use ordinary risk-based review unless they introduce durable/shared-data, migration, data-loss, compatibility, security, concurrency, money, supply-chain, or sibling-repo risk. Verify reviewer claims against the live codebase before acting on them; substantive findings outweigh approval votes.
- [Docs](rules/docs.md):
  - Docs are part of the change: update every affected surface in the same commit; affected surfaces do not automatically include `README.md`; never reference or mandate files that don't exist.
  - Quantified, exhaustive, and causal claims require durable executable proof at the same scope as the prose (owner rule, 2026-08-02).
- [Steering](rules/steering.md): Steering compounds: when the user accepts or repeats a direction that generalizes past the immediate task, land it in the canon in that same session — here if it is fleet-wide, else the repo's AGENTS.md or lessons file — so the next run inherits it instead of relearning it, and say what was captured and where. Do not canonize exploratory questions as accepted decisions.
- [Physics and fluid simulation](rules/physics-and-fluids.md):
  - Read the readily available resources before building or explaining simulation behaviour yourself (owner rule, 2026-08-01).
  - Check which motion a solver mechanism reads before reaching for it.
  - A result that depends on contact resolution can pass at one rate by an accident of timing while the mechanism it tests does not exist, so run it at a second rate before believing it.
  - When one knob controls outcomes that pull against each other, scope it to the phase that needs it; if no scoping helps, the knob is the wrong lever and the cost is in the model.
  - A coverage floor a statistical fix cannot lift is a geometry or flow problem wearing a sampling problem's clothes, and the tell is that the failing cells are always the same ones.
- [Performance](rules/performance.md): The arithmetic is rarely the cost here; allocation and repetition are, and the shape to look for is a pure function of immutable data called from a per-frame path.
- [Evidence and searches](rules/evidence-and-searches.md):
  - Anything a search's evidence hashes is frozen from the moment the search starts, prose fields inside declaration objects included.
  - Before trusting a threshold, ask how many populations reach it: a floor shared by two is calibrated for the tighter one and is near-noise for the other, so measure each separately.
- [Creative asset work](rules/creative-assets.md): Creative assets: before generating, curating, reviewing, promoting, or integrating actual creative procedural asset or scene content here or for a downstream game, use `create-diverse-voxel-assets`; its canonical skill is `docs/skills/create-diverse-voxel-assets/SKILL.md`.
- [Authored visible output](rules/authored-visible-output.md):
  - No orphan pixels: every authored choice that creates or changes visible output — voxel group, void, material boundary, part, recipe step, model feature, scene placement, context element, light, and motion — must trace to a named need elsewhere in the asset, scene, interaction, or consumer.
  - A displacement channel needs something to reveal it: one flat colour with no lighting variation leaves exactly one revealer, the outline, so without contrast or a light more displacement buys nothing.
