# Lessons

The one-line form of every lesson this repo has paid for. Read this file at session start; it is short by construction.

Each rule links into [lessons-evidence.md](lessons-evidence.md), which holds the war story and the anchor. Open that only when a rule is in doubt, or the work is in that area — it is not session-start reading.

A new lesson is an entry there plus one line here. `tests/testing/lessons-pairing.test.ts` keeps the two in step: a rule always has an entry, and an entry always has a rule.

When a lesson becomes a gate — a test, a lint rule, a fixed command — delete both halves. The machine enforces it, so nobody needs to read it.

## Method

- Timing two things and subtracting attributes every cost to whichever half you did not measure — profile the parts, not the halves. ([evidence](lessons-evidence.md#a-live-riverfall-costs-almost-a-whole-frame-and-the-solver-is-most-of-it))
- The arithmetic is rarely the cost; allocation and repetition are. A pure function of immutable data called from a per-frame path is the shape to look for. ([evidence](lessons-evidence.md#the-riverfall-frame-was-three-quarters-waste-and-none-of-it-was-where-subtraction-said))
- One timing run on a loaded machine will invert your conclusion — take the minimum over batches, and never compare a mean baseline against a min result. ([evidence](lessons-evidence.md#the-riverfall-frame-was-three-quarters-waste-and-none-of-it-was-where-subtraction-said))
- "Already tried, no effect" is worth as much as a fix: it stops a good hypothesis being tested a third time. ([evidence](lessons-evidence.md#test-the-obvious-suspect-before-recording-it-as-unexplored))
- A measurement that changes a setting between samples is measuring the setting; "the frame changed" is not "the thing I am watching changed". ([evidence](lessons-evidence.md#a-look-toggle-moves-a-paused-live-scene-and-three-plausible-causes-were-not-it))
- A measurement tells you what happened; only the source tells you why. A plausible mechanism invented to explain a real measurement is still an invention. ([evidence](lessons-evidence.md#soft-ccd-does-nothing-for-a-rotating-contact-and-the-prediction-distance-does-it-all))
- A bound checked on one property is not a bound on how the value is read: a guard on `length` binds nothing if the copy consults an iterator. ([evidence](lessons-evidence.md#a-bound-checked-on-one-property-is-not-a-bound-on-how-the-value-is-read))
- Numbers stay sane while the picture goes wrong — and then the picture lies too, so measure what you think you saw before repairing it. ([evidence](lessons-evidence.md#the-mills-flour-climbed-out-through-the-roof-with-953-tests-green))

## Gates and exemptions

- A rule that is only prose drifts inside the session that wrote it — a gate reads every line and no reviewer does. ([evidence](lessons-evidence.md#a-rule-that-is-only-prose-drifts-inside-the-session-that-wrote-it))
- An exemption records a diagnosis, and a diagnosis can be wrong; nothing about writing it down makes it true. Write it to fail when its lane is fixed. ([evidence](lessons-evidence.md#the-exemption-outlived-the-problem-and-hid-three-lanes-while-it-did))
- A gate that enforces a rule over part of the codebase reads, in every summary, as one that enforces the rule. ([evidence](lessons-evidence.md#the-exemption-outlived-the-problem-and-hid-three-lanes-while-it-did))
- An include list is a claim about coverage that nothing checks. ([evidence](lessons-evidence.md#a-whole-consumer-fixture-sat-outside-the-typecheck-and-nothing-said-so))
- A test that builds its own world tests its own world; construct through the path the product uses, or it is fiction. ([evidence](lessons-evidence.md#moving-to-60-hz-found-two-tests-that-had-been-passing-for-the-wrong-reason))
- A test written to a reviewer's claim rather than to observed behaviour can pass without its fix; neutralize the fix and watch it fail, or you have a story. ([evidence](lessons-evidence.md#two-tests-written-to-a-reviewers-finding-passed-with-and-without-their-fix))
- Size a timeout against the work the test itself does, not the suite's current load. One that fires on a diff which cannot have caused it is the defect reporting itself, not noise to rerun past. ([evidence](lessons-evidence.md#a-timeout-sized-against-the-suites-current-load-is-a-time-bomb))
- A frame-loop bug needs the frame loop's own sequence: run two frames, and let the first leave the state the second starts from. ([evidence](lessons-evidence.md#a-frame-loop-bug-needs-the-frame-loops-own-sequence-to-reproduce))
- Finding which two lanes differ is the easy half; proving which is right is the work — a parity fix that assumes an answer can break the lane that was correct. ([evidence](lessons-evidence.md#finding-which-two-lanes-differ-is-the-easy-half-proving-which-one-is-right-is-the-work))
- A comment saying "not yet, because Y" is a standing instruction; delete it the session Y stops being true. ([evidence](lessons-evidence.md#a-stale-comment-can-be-a-standing-instruction-not-to-fix-something))
- A floor shared by two populations is calibrated for the tighter one and near-noise for the other; measure each separately. ([evidence](lessons-evidence.md#a-floor-shared-by-two-populations-is-calibrated-for-one-and-meaningless-for-the-other))
- A counter-run that stops discriminating is not a smaller problem than a scenario that fails. ([evidence](lessons-evidence.md#the-trebuchet-worked-at-240-hz-and-not-at-60-hz-and-only-the-browser-ran-it-at-60))
- Anything a search's evidence hashes is frozen from the moment the search starts — prose fields inside declaration objects included. ([evidence](lessons-evidence.md#freeze-the-declaration-before-the-search-not-after))
- A deferral list is a decision: for each entry name the missing number or call, and if you cannot, it is a fix you have not done yet. ([evidence](lessons-evidence.md#a-deferral-list-is-a-decision-and-deserves-the-same-scrutiny-as-the-fixes))
- A rule inside the generated canon block is loaded right up until a sync silently drops it, and a line number into AGENTS.md is stale within days — quote the rule instead. ([evidence](lessons-evidence.md#lessons-nobody-reads-are-not-lessons))

## Solver rate and contacts

- Anything expressed in ticks is expressed in the rate, and silently means something else the moment the rate moves. ([evidence](lessons-evidence.md#a-sampler-denominated-in-ticks-is-a-second-variable))
- A quantity denominated per second can still be a per-step quantity wearing a per-second name; the tell is a threshold that starts rejecting the outcome it exists to protect. ([evidence](lessons-evidence.md#a-rate-gate-can-reject-a-working-machine-without-becoming-an-output-proxy))
- Two lanes at different solver rates are two worlds, and geometry tuned in ticks on one will not survive the other. ([evidence](lessons-evidence.md#the-trebuchet-worked-at-240-hz-and-not-at-60-hz-and-only-the-browser-ran-it-at-60))
- A result that depends on contact resolution can pass at one rate by an accident of timing while the mechanism it tests does not exist — run it at a second rate before believing it. ([evidence](lessons-evidence.md#moving-to-60-hz-found-two-tests-that-had-been-passing-for-the-wrong-reason))
- A body sinking into the floor is usually about *when* the contact is found, not how well the solver converges. A fix that improves the measurement without changing the thing measured is the shape to distrust. ([evidence](lessons-evidence.md#a-contact-fix-is-geometry-before-it-is-numerics))
- A fast rotating part is not a fast moving body — soft CCD reads linear velocity only, so it is inert for a cam whose centre barely moves. Check which motion the mechanism reads before reaching for it. ([evidence](lessons-evidence.md#soft-ccd-does-nothing-for-a-rotating-contact-and-the-prediction-distance-does-it-all))
- Impact penetration at a fixed step is temporal resolution, not tuning: across eleven configurations the number wandered without trending, and the damping that cleared it falsified the scene's own gravity claim. ([evidence](lessons-evidence.md#the-machine-works-landing-dent-resists-every-cheap-fix-and-the-cheap-fixes-are-not-equally-wrong))
- When one knob controls outcomes that pull against each other, scope it to the phase that needs it; if no scoping helps, the knob is the wrong lever and the cost is in the model. ([evidence](lessons-evidence.md#corollary-one-parameter-two-opposed-outcomes))

## Live scenes

- A live scene has no end, so a recorded lane's finite trace cannot cover the state it reaches after a minute of play. ([evidence](lessons-evidence.md#the-live-riverfall-runs-out-of-surface-coverage-before-it-runs-out-of-budget))
- A coverage floor that a statistical fix cannot lift is a geometry or flow problem wearing a sampling problem's clothes — the tell is that the failing cells are always the same ones. ([evidence](lessons-evidence.md#doubling-the-water-does-not-fix-a-river-that-bunches))
- A synchronous burn-in plus per-tick presentation of a batched catch-up reads as a freeze while nothing is actually frozen. ([evidence](lessons-evidence.md#riverfalls-apparent-freeze-was-a-startup-stall-followed-by-a-catch-up-spiral))
- A presentation keyed to a measured event inherits that event's cadence, and a cadence is not a constant. ([evidence](lessons-evidence.md#a-presentation-rule-that-held-by-luck-reads-as-a-rule-until-the-numbers-change))
