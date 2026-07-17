# Model studio redesign — player first

Status: accepted 2026-07-16. Decisions below marked "owner" were answered
directly; the layout choice follows the owner's standing direction to keep
working and is reversible — alternatives are recorded.

## Why redesign

The owner said the UI is not intuitive, and the diagnosis is structural: the
page grew by accretion — every complaint added a widget — so controls are
grouped by what they are made of (a card of sliders, a card of grids) rather
than by what a person is doing. The owner also named three missing abilities:
replaying an animation, examining it closely, and revising it by writing
requests and pinning notes. And they corrected how I work: drive the real page
in the visible browser, not blind screenshot scripts; redesign instead of
patching symptoms; look before trusting checks.

## The shape: a player you can edit

The studio's resting state is watching. The picture is big. Under it: play,
pause, speed, and a timeline spanning one period of the motion. Everything else
serves that:

- **Replay.** Play loops the period continuously. Pause freezes time. Speed
  is a multiplier. The timeline is also the scrubber; while paused you can
  step frame by frame. Time comes from one injectable clock so tests can drive
  it by hand — playback must stay reproducible, since reproducibility is what
  the sweep guards certify.
- **Examination.** The plain-words motion sentence stays. The readout speaks
  plainly (no "revision", no "state: running"). The sprite sheet (every frame,
  time order) opens from the player. The floors stack stays — it is how the
  gold-cap question was settled.
- **Annotation (owner decision).** Notes anchor to a *moment* (pause, click
  the picture, the note keeps the time and the spot) or to a *place* (click a
  floor square, the note keeps the voxel). The timeline shows a dot at each
  moment-note. A Notes panel lists them; notes can be removed. Whole-motion
  notes were declined; a moment note with no mark covers the need in practice.
- **Revision by request (owner decision).** A request box bundles the owner's
  words plus every pinned note plus the current model into a small JSON file.
  The page cannot write files, so the studio dev server accepts a POST and
  writes `tools/studio/requests/<stamp>.json`. A live agent watches that
  folder, applies the request through the same harness the buttons use, and
  the page updates. No API key in the page; requests queue when no agent is
  running; every request is durable evidence of what was asked.
- **Editing.** The existing editors — palette, floors, one-floor grid, the
  nine motion sliders, period and phase, open/copy/new model — move into a
  panel that opens when wanted and stays out of the way while judging.

## Alternatives considered

- **Rooms (Watch / Edit / Discuss screens).** Rejected: pausing on a flaw and
  marking it is one act; rooms force a screen change mid-thought.
- **Keep the layout, add strips.** Rejected: it is the patch-one-more-symptom
  habit the owner explicitly ended.

## Rules carried forward

- **Harness parity.** Every new ability — play, pause, speed, seek, add and
  remove notes, send a request — exists on `window.voxelStudio` first and the
  buttons call it. Nothing the page can do is invisible to the agent.
- **Plain words** everywhere on screen.
- **Look at the result.** Verification of this build includes driving the real
  page in the visible browser pane and looking at it, not only gates.

## Pieces

- `player.ts` — the playback clock: play/pause/speed/seek over one period,
  fed by an injected time source; pure and unit-tested.
- `notes.ts` — the note store: add moment/place notes, remove, list,
  serialize into a request payload; unit-tested.
- `requests.ts` — builds the request JSON and posts it to the dev server.
- `vite.config.ts` — gains a tiny middleware: POST `/studio/requests` writes
  the file under `tools/studio/requests/` (gitignored).
- `main.ts` + `index.html` — rebuilt around the player.
- `harness.ts` — extended for parity.
- `scripts/studio.mjs` — keeps check/edit/sheet/shot against the new page.

## Out of scope, tracked elsewhere

Black face edges (task 14, engine), full turns (task 15, engine), clicking the
3D picture to select a voxel (engine picking exists; wiring it into the studio
is a later step — floor squares give exact anchoring today).

## Risks

- The dev server gains file-writing; it must refuse paths outside the requests
  folder and cap size, or a bad request could write anywhere.
- Playback adds a second consumer of the frame clock; the sweep must keep
  sampling times directly so its determinism claim is untouched by playback
  state.
