# Canon candidates — from voxel

Knowledge this repository paid for that has no mechanical trigger, staged for promotion into `../fleet/FLEET.md`.

Each entry is a proposed constitution rule, the voxel lesson it came from, why no gate can hold it, and the anchor — a rule promoted without its provenance is a rule nobody can check when it is doubted.

The parent promotes these and then deletes this file. Until then it is the only copy.

## Profile the parts, not the halves: timing two things and subtracting attributes every cost to whichever half you did not measure

**From:** voxel / "Timing two things and subtracting attributes every cost to whichever half you did not measure — profile the parts, not the halves."
**Why it has no gate:** it constrains how a measurement is taken, and nothing in a repository can see how a number was arrived at.
**Anchor:** 2026-07-31. A subtraction attributed 6.23 ms to a mapping loop that, timed directly, cost 1.19 ms. The entry it produced named the fluid solver as the blocker and the substep as the lever; both were wrong, and a profile taken instead of assumed took the frame from 14.21 ms to 4.32 ms with the integration untouched.

## The arithmetic is rarely the cost; allocation and repetition are — look for a pure function of immutable data called from a per-frame path

**From:** voxel / "The arithmetic is rarely the cost; allocation and repetition are. A pure function of immutable data called from a per-frame path is the shape to look for."
**Why it has no gate:** a search heuristic, not a property a test can hold.
**Anchor:** 2026-07-31. `riverfallSurfaceNeighborsV1(cells)` derived adjacency from a translation that never moves, once per frame: 103,041 distance computations and 321 intermediate arrays, larger than the fluid solver it existed to present. Two sibling costs were 92,448 throwaway arrays a frame and ~2,880 strings per neighbour-grid build. Removing the garbage, with the same operations in the same order, was the entire fix.

## A single timing run on a loaded machine will invert your conclusion: take the minimum over batches, and never compare a mean baseline against a min result

**From:** voxel / "One timing run on a loaded machine will invert your conclusion — take the minimum over batches, and never compare a mean baseline against a min result."
**Why it has no gate:** it governs a measurement procedure that leaves no artefact behind to check.
**Anchor:** 2026-07-31. The same suite took 27 s and then 44 s minutes apart; one remap change measured 9.51 ms and then 14.07 ms with nothing between the runs but machine load.

## "Already tried, no effect" is worth as much as a fix, and belongs in the record for the same reason

**From:** voxel / "'Already tried, no effect' is worth as much as a fix: it stops a good hypothesis being tested a third time."
**Why it has no gate:** it asks for something to be written down, which nothing can check the absence of.
**Anchor:** 2026-07-31. Rapier's `lengthUnit` swept at 0.25, 0.5, 1 and 2 against the playground's floor-penetration failure: none of them changed it. A textbook explanation, worth an hour of certainty, and worth more written down than repeated.

## A measurement that changes a setting between samples is measuring the setting; "the frame changed" is not "the thing I am watching changed"

**From:** voxel / "A measurement that changes a setting between samples is measuring the setting; 'the frame changed' is not 'the thing I am watching changed'."
**Why it has no gate:** it is a property of an experiment's design, not of the code under it.
**Anchor:** 2026-08-01. A motion measurement that toggled the look between reads reported a perfectly still river. With the solver paused and scene animation off, two consecutive screenshots are byte-identical, and one `setLit(false)`/`setLit(true)` round trip — ending exactly where it started — produces a different frame. Three plausible causes were each measured and excluded.

## A measurement tells you what happened; only the source tells you why — a plausible mechanism invented to explain a real measurement is still an invention

**From:** voxel / "A measurement tells you what happened; only the source tells you why. A plausible mechanism invented to explain a real measurement is still an invention."
**Why it has no gate:** the invented mechanism and the sourced one look identical in the diff.
**Anchor:** 2026-08-01. The same session correctly inferred that Rapier's soft CCD reads `rb.linvel()` only, then in the same comment asserted a 45 Hz contact natural frequency "cannot be represented" by a 1/60 s step. Rapier's `erp = dt*w / (dt*w + 2*zeta)` saturates smoothly and has no such limit; thirty seconds in `src/dynamics/integration_parameters.rs` would have said so.

## Numbers stay sane while the picture goes wrong — and then the picture lies too, so measure what you think you saw before repairing it

**From:** voxel / "Numbers stay sane while the picture goes wrong — and then the picture lies too, so measure what you think you saw before repairing it."
**Why it has no gate:** the canon already requires looking; this is the second half, that what you saw is a hypothesis.
**Anchor:** 2026-07-31, commit `eb1260e`. A mill's flour level climbed out through its roof with 953 tests green — every number involved finite and plausible. In the same visual check, a sack appeared to be sitting on the roof; it was the far sail against the roofline, and a side elevation showed nothing above the ridge.

## A test that builds its own world tests its own world: construct through the path the product uses, or it is fiction

**From:** voxel / "A test that builds its own world tests its own world; construct through the path the product uses, or it is fiction."
**Why it has no gate:** no scan can tell a legitimate fixture from a parallel construction of the product's own state.
**Anchor:** 2026-07-31, commit `73f9bbc`. A run test built bodies from the scene's authored placements while the studio builds them from the live profile's opening poses, so a belt's slats started on the grid instead of on their path. It had been green for weeks against a world the studio never builds.

## Finding which two lanes differ is the easy half; proving which one is right is the work — a parity fix that assumes an answer can break the lane that was correct

**From:** voxel / "Finding which two lanes differ is the easy half; proving which is right is the work — a parity fix that assumes an answer can break the lane that was correct."
**Why it has no gate:** which lane is right is a judgement about the domain, not a property of either lane.
**Anchor:** 2026-08-13. Declaring a disputed solver setting in the shared profile builder — "make lane A match lane B" — took the live trebuchet from 23 bricks knocked past a quarter metre to zero. The headless twin's 19 scenarios stayed green throughout, because none of them assert the wall coming down at all.

## A comment saying "not yet, because Y" is a standing instruction; delete it the session Y stops being true

**From:** voxel / "A comment saying 'not yet, because Y' is a standing instruction; delete it the session Y stops being true."
**Why it has no gate:** a rate scan strips comments by design, and a scan that read them would fail on every historical note.
**Anchor:** 2026-08-13. Twenty lines above `PLAYGROUND_TIMESTEP_S_V1` a block said the playground had not reached the shared rate, that deriving the constant had been tried three times and backed out, and that thresholds needed re-measuring "before this constant can move". The next line was `export const PLAYGROUND_TIMESTEP_S_V1 = SOLVER_TIMESTEP_SECONDS_V1;`.

## Before trusting a threshold, ask how many populations reach it; a shared floor is calibrated for the tightest and is near-noise for the rest

**From:** voxel / "A floor shared by two populations is calibrated for the tighter one and near-noise for the other; measure each separately."
**Why it has no gate:** how many populations a constant serves is a fact about the world, not about the constant.
**Anchor:** 2026-08-13. `minimumChangedPixelFraction` at 0.0001 served exact-box removals (98 variants, smallest real detection 0.000359) and whole-placement relocations (8 cases, tightest 0.024441) — a third of the smallest removal, and 244x below the tightest relocation. Raising it broke four removal proofs, and that breakage was the diagnosis rather than a setback.

## A counter-run that stops discriminating is not a smaller problem than a scenario that fails

**From:** voxel / "A counter-run that stops discriminating is not a smaller problem than a scenario that fails."
**Why it has no gate:** a counter-run that has stopped discriminating passes, which is indistinguishable from working.
**Anchor:** 2026-08-01. Moving the playground to the shared rate failed 10 checks, and the worst of them was a pass: the counter-run proving bearing friction is load-bearing — "without bearing friction the machine never stops swinging" — succeeded at 60 Hz, so the law lost its demonstrated failure.

## A deferral list is a decision: for each entry name the missing number or call, and if you cannot, it is a fix you have not done yet

**From:** voxel / "A deferral list is a decision: for each entry name the missing number or call, and if you cannot, it is a fix you have not done yet."
**Why it has no gate:** it is a rule about reading a list back before publishing it.
**Anchor:** 2026-08-13. Eight findings deferred at the end of a full-codebase review; read back cold, five were fatigue in the shape of judgement and were fixed the same session — including `limit.chunk-overlap-comparisons` rejecting a valid 1,415-chunk world that 1,400 chunks passed, at the public boundary, which is the class the pass had spent the day fixing.

## A result that depends on contact resolution can pass at one rate by an accident of timing while the mechanism it tests does not exist — run it at a second rate before believing it

**From:** voxel / "A result that depends on contact resolution can pass at one rate by an accident of timing while the mechanism it tests does not exist — run it at a second rate before believing it."
**Why it has no gate here:** voxel deliberately has exactly one solver rate, and every lane derives from it, so there is no second rate to run at. Building one is a piece of work, not a gate. Stated as canon it is a rule about how a rate-sensitive result is believed, which is what it should be.
**Anchor:** 2026-07-31, commit `73f9bbc`. A carrier's tip "about its bucket-boundary edge" was never implemented; at 240 Hz the product left the carrier anyway by an accident of contact timing, and at 60 Hz it simply sat there. The rate change did not break the scene — it stopped the scene getting away with a missing mechanism.

## A fix that improves the measurement without changing the thing measured is the shape to distrust

**From:** voxel / "A body sinking into the floor is usually about *when* the contact is found, not how well the solver converges. A fix that improves the measurement without changing the thing measured is the shape to distrust."
**Why it has no gate:** the improved number looks the same whichever way it was obtained.
**Anchor:** 2026-08-01. Contact skin at 0.005 left burial bit-identical to no fix at all; it improved the reported number only by lifting bodies off the ground, and by 0.01 the hover was visible. The real lever changed *when* the contact was found: prediction distance took peak burial from 0.16427 m to 0.00342 m.

## A parameter sweep that wanders without trending is noise; do not pin a number from inside the band, and do not buy a gate with a falsified claim

**From:** voxel / "Impact penetration at a fixed step is temporal resolution, not tuning: across eleven configurations the number wandered without trending, and the damping that cleared it falsified the scene's own gravity claim."
**Why it has no gate:** whether a sweep trends is a reading of the sweep, and the sweep is not kept.
**Anchor:** 2026-07-30. Eleven full trace regenerations against `studio:scene:contrast-machines`: the dent wandered between 0.007 and 0.025 without trending, across 16 solver iterations, internal PGS passes, tolerance changes and damping. The one configuration that cleared it dropped the airborne assembly's observed gravity acceleration to 0.48 world units per second squared, against the 5-to-20 the scene asserts it demonstrates.

## When one knob controls outcomes that pull against each other, scope it to the phase that needs it; if no scoping helps, the knob is the wrong lever and the cost is in the model

**From:** voxel / "When one knob controls outcomes that pull against each other, scope it to the phase that needs it; if no scoping helps, the knob is the wrong lever and the cost is in the model."
**Why it has no gate:** it is a design move made before any code exists to check.
**Anchor:** 2026-07-30. Release damping had to be strong enough to soften a landing, weak enough to let the product settle inside a fixed trace, and weak enough to keep the fall gravity-driven. The window for the first two constraints was 4 to 6; the third excluded all of it.

## A floor a statistical fix cannot lift is a geometry or flow problem wearing a sampling problem's clothes — the tell is that the failing cases are always the same ones

**From:** voxel / "A coverage floor that a statistical fix cannot lift is a geometry or flow problem wearing a sampling problem's clothes — the tell is that the failing cells are always the same ones."
**Why it has no gate:** it is a diagnosis rule, applied to a failure that has already been gated.
**Anchor:** 2026-08-01. Per-cell support counted over 3,600 frames at 288, 576 and 1,152 particles: the worst cell is `surface-river-00-00` in every case and its floor is zero in every case. It sits upstream of the simulated domain, so it is drawn over water that is not simulated, and no particle count reaches it.

## A displacement channel needs something to reveal it: one flat colour with no lighting variation leaves exactly one revealer, the outline

**From:** voxel / "Moving geometry that is all one flat colour is visible only at its silhouette; without contrast or a light, more displacement buys nothing."
**Why it has no gate:** "visible" is a claim about a human looking, and the pixel measurement that stands in for it cannot say *why* a frame did not change.
**Anchor:** 2026-08-14. Raising normal excursion from `[0.03, 0.44]` to `[0.03, 1.8]`, tilt gain 8 to 26 and wavelength 20 to 6 moved the measurement from 0.75–1.6% of pixels per 200 ms to 1.8–2.7%. The upstream river visibly bulged past its bank — a silhouette against green grass — while the waterfall curtain, 20 cells of one flat colour at 0.62 opacity facing the camera, stayed a flat slab.
