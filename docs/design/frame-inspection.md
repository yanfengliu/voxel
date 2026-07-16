# Frame inspection and the model studio

Status: design accepted 2026-07-15. Not yet implemented.

## Why this exists

The owner wants to inspect every frame of an animation to confirm it is correct
and looks good, and wants the same tool to serve as a model studio. The insight
driving the design is the owner's: **whatever can be animated must first be a
model**, so a model is an animation sampled at one time. That is one tool with a
time axis, not two tools.

Both an agent and a human must be able to use it. That is the constraint that
shapes everything below: a human needs pixels to scrub, an agent needs
structured data to diff. A tool that only renders is unusable by an agent; a
tool that only reports numbers is unusable by a human. So the core emits both
for the same frame, and the UI is a view over that core rather than a separate
path to it.

## The boundary

`AGENTS.md` names "asset evolution studio" as a non-goal of this repository, and
that line is correct. It splits cleanly:

- **Inspecting** a frame is rendering. Given a model, an animation, and a time,
  produce the frame and say exactly what was drawn. That is this engine's job.
- **Editing** a model, by hand or by prompt, is asset evolution. That belongs to
  the studio application and to each game's own catalog and semantics.

So this repository gains a frame inspection contract, not a studio. The studio
UI, the model catalog, and prompt-driven editing live outside it. This is the
same split that keeps roads, zones, and unit types in their game repositories.

What makes the shared contract worth having is stable semantics rather than
similar-looking code: "sample this animation at this time and report exactly
what was drawn" means the same thing for City, AoE2, and Townscaper. Per
`AGENTS.md`, that is the bar for sharing.

## The primitives already exist

This is deliberately not new architecture. The properties an inspector needs
were already committed to and proven:

- **Injected time.** `frame({ nowMs, deltaMs, frameIndex })` is the only clock.
  Deterministic paths never read `Date.now()` or `performance.now()`, so any
  time can be requested rather than waited for.
- **Determinism at a time.** The spec already requires that "the same snapshot
  and frame time produce the same matrices after rebuild or context
  restoration", and that the sampler "never advances hidden time". Frame 400 of
  an animation is therefore reproducible without replaying frames 0 to 399.
- **The animation itself.** The harmonic lane is implemented:
  `InstanceTransformAnimationV1` carries `periodsMs` and `phasesRadians`, and
  `instanceBatchPresenter` samples `sin(2*pi*nowMs/periodMs + phase)`.
- **Revision-aware capture.** H-04's `captureWhenPresented` resolves only once a
  revision has actually been drawn, so a capture cannot describe a frame the
  canvas never showed.
- **Fixed camera, viewport, and DPR.** Already required for reference scenes.

An inspector is these composed. If building it needs new engine architecture,
that is a signal the design is wrong.

## Shape

A headless core, and a UI over that core. Not two implementations.

**Core.** Given a scene, an animation, and a set of sample times, produce for
each time: a capture fenced to the presented revision, and structured data --
draw calls, triangles, resource counts, and the sampled transforms. It sweeps
the time axis rather than replaying it, because determinism at a time is what
makes frame 400 addressable directly.

It must prove its own determinism rather than assume it: re-sample a time
already sampled and compare. A tool whose whole value is "this frame is correct"
is worthless if the frame is not reproducible, and that is checkable rather than
assertable.

**UI.** Scrub the time axis, step frame by frame, compare against a baseline.
Reads the core's output; never its own render path. If the UI can show a frame
the core cannot report, they have diverged and the tool is lying.

## This delivers E-03

E-03 asks for visual regression with fixed camera, viewport, DPR, injected
clock, and a controlled Chromium lane, keeping structural geometry assertions
authoritative and using documented tolerances for raster evidence.

That is the same machinery: sample deterministic frames, capture them, assert
structure, compare pixels within tolerance. The studio scrubs those frames for a
human; E-03 diffs them against a baseline in CI. Building the studio core
delivers E-03 rather than competing with it, which is why it comes first.

The structural-assertions-are-authoritative rule carries over unchanged. A
screenshot that looks right proves nothing about topology, and topology that is
right proves nothing about what a human sees; the tool reports both because
neither substitutes for the other.

## Open

- Sample-time selection for a multi-instance batch with different periods. The
  honest unit is one period of the instance under inspection, not a fixed frame
  count.
- Baseline storage and tolerance policy for E-03.
- Whether the UI ships from this repository at all, or only the core plus a
  fixture. The non-goal argues for the latter.
