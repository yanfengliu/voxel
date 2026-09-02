# Lessons — evidence

The war story and the anchor behind each queued line in [lessons.md](lessons.md). Open an entry when its rule is in doubt, or when the work is in that area.

Every entry carries an anchor — a measurement, a commit, a test id, or a behavior delta — per the fleet constitution; an entry without one is folklore and does not belong here. An entry leaves this file in the commit that lands its rule's gate, and a superseded entry is corrected in place with its correction dated rather than silently deleted.

On 2026-09-02 this file held 36 entries for 42 rules. The entries whose rules became gates left with them; what the gates now enforce, and the mutation each was proved against, is in [gate-proofs.md](gate-proofs.md), and the knowledge that had no mechanical trigger is in [canon-candidates.md](canon-candidates.md) and [../policies/local-rules.md](../policies/local-rules.md).

## A sampler denominated in ticks is a second variable

**Anchor:** 2026-08-01. `PLAYGROUND_SNAPSHOT_STRIDE_V1 = 8`, commented "30 Hz sampling of a 240 Hz world". At 60 Hz it became 7.5 Hz sampling, and the checks reading its frames went on reporting as though nothing had changed.

Three separate failures, all one cause, and none of them looked like sampling:

**A landing read as a resting body.** The floor check reported 0.0342 m where the true per-tick peak was 0.16427 m and the resting depth was 0.00133 m. The reported number was neither — it was whatever instant the stride happened to land on, six ticks past the deepest. Restoring the sampling density made the reported number four times *worse*, which is the proof it had been under-sampling rather than the fix making anything worse.

**A gate became arithmetically unreachable.** A touch-down comparison allowed 4% and read strided frames, so its measurable values were 0, 11.1%, 20%, 25% — nothing between 0 and 11.1%. Its own comment says the tolerance was chosen because "one sample is ~3%" over a ~260-tick fall; at the new rate the fall is ~66 ticks. The 240 Hz pass was also a 5-in-8 draw on grid phase rather than a physical result.

**A real regression was hidden.** Solver energy injection during a violent whip is five times higher at the coarser step, over its budget. The wider sampling gaps let dissipation swamp it and the check reported green. Restoring honest sampling is what surfaced it.

The general rule: **anything expressed in ticks is expressed in the rate**, and will silently mean something else the moment the rate moves. This repo had 58 authored scenario windows in ticks, a settle window, and this sampler. The one that mattered most was the sampler, because it changed what every other check could see.

## The tile pitch is the ceiling on the wavelength, and it had none to spare

Riverfall's advected surface wave ran at a 20-unit wavelength across a 10-unit-wide fall, so the whole curtain rose and fell as one — a tide, not a river. Shortening it looked like free improvement, and `riverfall-flow.test.ts` said otherwise: the p95 adjacent-cell height delta across every canonical frame is gated at 0.08, because tiles sit two units apart and a wave has to span several of them or neighbours disagree and the sheet reads as noise.

Measured across four regenerations of the byte-pinned fixture: **0.1178 at wavelength 8, 0.0989 at 13, 0.0874 at 16**, against roughly 0.077 at the 20 already in place. Every shortening failed the gate. Wavelength 8 additionally dropped two reaches below the 0.15 per-cell full-cycle amplitude floor, because the spatial smoothing that keeps the sheet coherent attenuates short wavelengths — the two gates pull in opposite directions and pin the wavelength between them.

The general form: when a field is sampled on a fixed lattice, the lattice sets the finest pattern it can carry, and a "make it more detailed" tuning that ignores that is spending its budget on aliasing. The lever that had no such limit was the phase speed — 5 to 12, so crests cross a reach in a third of the time — which is also the half of the effect that reads as travel. Anchor: `riverfall-fluid-config.ts`, 2026-08-14, gates in `riverfall-flow.test.ts`.

## A visual gate measured the sails, and four variants agreed to four decimals

The windmill's eight composed-scene relocation proofs mount the canonical scene, capture two fixed quarter views, mount a static variant with one placement moved, capture the same two, and require a measurable difference. Both mounts called `setSceneAnimation(false)`, which before 2026-08-14 stopped only the scene clock — so both mills kept turning, at unrelated phases, and a large part of every measured "relocation" was the sails having moved.

The tell was in the numbers all along: with the mills running, the rear view returned **0.0244 to 0.0273 for every variant**, including ones whose relocated part is not visible from behind at all. A per-variant proof returning the same number for every variant is measuring what the variants share.

Held still at tick zero, four of the eight returned exactly **0** from the rear and 0.000171 to 0.011677 from the front, against a floor of 0.012 that was itself derived as half of 0.024441 — one of the sail numbers. The gate had been calibrated on its own artifact.

The repair was two-sided: hold both mounts still from the moment they are built (a freeze applied later catches an asynchronous world at an arbitrary phase, which is why the fixed comparison is byte-identical across runs and the old one was not), and judge each relocation from a camera that frames the move, worth 2-9x the detection of a whole-mill view. The floor is now 0.00074, half the anvil's real 0.0014812.

**Anchor:** 2026-08-14, `windmill-intended-view-proof.ts` `minimumRelocationChangedPixelFraction`, `mountWindmillStudio({ holdStill })`, and `model-studio-windmill-assets.spec.ts` "is visible where it moved". Confirmed to bite by zeroing a relocation delta.
