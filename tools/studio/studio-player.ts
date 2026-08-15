import { describePoseAt } from './describe.js';
import type { VoxelStudioHarnessV1 } from './harness.js';
import type { NoteStore } from './notes.js';
import type { StudioPlayer } from './player.js';
import { element } from './studio-app-helpers.js';

/**
 * The player bar docked under the stage: step, play, speed, the scrubber, and
 * the moment dots pinned along it. Every control calls the harness, never the
 * session, so the agent drives playback the same way a person does.
 */

export interface StudioPlayerBarDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  /** The clock the bar reads for playing state and period; the harness moves it. */
  readonly player: StudioPlayer;
  /** Read to place a dot per moment note along the scrubber. */
  readonly noteStore: NoteStore;
  /**
   * Whether a live scene's solver is advancing right now.
   *
   * Play/Pause on such a scene is the simulation switch, and the switch is
   * the only thing that knows: the scene clock behind `player.playing` is
   * parked at zero on a scene with no authored motion, so reading it labelled
   * a running machine "Play" and disabled the button that would have stopped
   * it.
   */
  readonly liveRunning: () => boolean;
}

export interface StudioPlayerBarV1 {
  readonly transport: HTMLElement;
  readonly timelineWrap: HTMLElement;
  readonly timeLabel: HTMLElement;
  /** Matches the play/pause label to the clock. Called from every controller. */
  syncPlayButton(): void;
  /** Rebuilds the moment dots; call when the notes change or the model opens. */
  renderDots(): void;
  /** Writes the frame/time readout and moves the scrubber, unless it has focus. */
  showTime(timeMs: number): void;
  /** Writes scene time without describing the hidden model's pose. */
  showSceneTime(timeMs: number): void;
  /** Scene playback has no single model frame or model notes, so those controls stay out of the way. */
  setSceneMode(on: boolean, hasMotion?: boolean): void;
  /**
   * Hides the scrubber for a scene that only a solver moves.
   *
   * A timeline offers a position in a recording, and a live scene has no
   * recording to hold a position in: the water is wherever its own solver has
   * reached, and dragging a slider cannot take it anywhere else. The bar shows
   * the solver's step count instead, which is the one number that does say
   * where such a scene is — and is what its browser proofs settle against.
   */
  setLiveOnly(on: boolean): void;
  /** Writes the live readout: solver steps rather than a position in a period. */
  showLiveSteps(stepped: number): void;
  /** Applies a model's period: enables the controls and sizes the scrubber. */
  applyPeriod(periodMs: number): void;
}

export function createStudioPlayerBar(deps: StudioPlayerBarDepsV1): StudioPlayerBarV1 {
  const { harness, player, noteStore } = deps;

  const stepBack = element('button', 'step');
  stepBack.textContent = '◀';
  stepBack.title = 'One frame back (left arrow)';
  const playButton = element('button', 'primary play');
  playButton.textContent = '▶ Play';
  const stepForward = element('button', 'step');
  stepForward.textContent = '▶';
  stepForward.title = 'One frame forward (right arrow)';
  const speedSelect = element('select', 'speed');
  for (const speed of [0.25, 0.5, 1, 2]) {
    const option = element('option');
    option.value = String(speed);
    option.textContent = `${String(speed)}×`;
    if (speed === 1) option.selected = true;
    speedSelect.appendChild(option);
  }
  const timeline = element('input', 'timeline');
  timeline.type = 'range';
  timeline.min = '0';
  timeline.step = '1';
  timeline.value = '0';
  const dots = element('div', 'dots');
  const timelineWrap = element('div', 'timeline-wrap');
  timelineWrap.append(timeline, dots);
  const timeLabel = element('span', 'time-label');
  const transport = element('div', 'transport');
  transport.append(stepBack, playButton, stepForward, speedSelect);

  function playing(): boolean {
    return liveOnly ? deps.liveRunning() : player.playing;
  }

  function syncPlayButton(): void {
    playButton.textContent = playing() ? '⏸ Pause' : '▶ Play';
  }

  function renderDots(): void {
    dots.replaceChildren();
    const period = player.periodMs;
    if (period <= 0) return;
    for (const note of noteStore.list()) {
      if (note.kind !== 'moment') continue;
      const dot = element('button', 'dot');
      dot.title = `${String(note.timeMs)} ms — ${note.text}`;
      dot.style.left = `${String((note.timeMs / period) * 100)}%`;
      dot.addEventListener('click', () => { harness.seek(note.timeMs); syncPlayButton(); });
      dots.appendChild(dot);
    }
  }

  function showTime(timeMs: number): void {
    const period = player.periodMs;
    if (period > 0) {
      const frame = harness.frameAt();
      timeLabel.textContent =
        `frame ${String(frame.frame)} / ${String(frame.frameCount)} · `
        + `${String(Math.round(timeMs))} ms of ${String(period)} · `
        + describePoseAt(harness.model().motion, timeMs);
    } else {
      timeLabel.textContent = 'still · one frame';
    }
    if (document.activeElement !== timeline) timeline.value = String(Math.round(timeMs));
  }

  function showSceneTime(timeMs: number): void {
    if (liveOnly) return;
    const period = player.periodMs;
    const shown = period <= 0
      ? 0
      : player.playback === 'once'
        ? Math.min(period, Math.max(0, timeMs))
        : ((timeMs % period) + period) % period;
    timeLabel.textContent = period > 0
      ? `${String(Math.round(timeMs))} ms elapsed · ${String(period)} ms scrub window`
      : 'still · one scene frame';
    if (period > 0 && player.playback === 'once') {
      timeLabel.textContent = `${String(Math.round(shown))} ms of ${String(period)} ms · one shot`;
    }
    if (document.activeElement !== timeline) timeline.value = String(Math.round(shown));
  }

  let liveOnly = false;

  function setLiveOnly(on: boolean): void {
    liveOnly = on;
    timelineWrap.hidden = on;
    speedSelect.hidden = on;
    if (on) {
      timeLabel.textContent = 'live · no timeline';
      // A live scene has no period, and the period is what usually enables
      // this button. Its solver is what Play and Pause act on here.
      playButton.disabled = false;
    }
    syncPlayButton();
  }

  function showLiveSteps(stepped: number): void {
    timeLabel.textContent =
      `live · ${stepped.toLocaleString('en-US')} solver steps`;
  }

  function setSceneMode(on: boolean, hasMotion = false): void {
    stepBack.hidden = on;
    stepForward.hidden = on;
    dots.hidden = on;
    if (on && hasMotion) {
      playButton.setAttribute('aria-keyshortcuts', 'Space');
      playButton.title = 'Play or pause scene animation (Space)';
    } else {
      playButton.removeAttribute('aria-keyshortcuts');
      playButton.title = '';
    }
  }

  function applyPeriod(periodMs: number): void {
    player.setPeriod(periodMs, performance.now());
    const period = player.periodMs;
    playButton.disabled = !liveOnly && period <= 0;
    stepBack.disabled = period <= 0;
    stepForward.disabled = period <= 0;
    timeline.disabled = period <= 0;
    timeline.max = String(Math.max(
      player.playback === 'once' ? period : period - 1,
      0,
    ));
  }

  playButton.addEventListener('click', () => {
    if (playing()) harness.pause(); else harness.play();
    syncPlayButton();
  });
  stepBack.addEventListener('click', () => { harness.step(-1); syncPlayButton(); });
  stepForward.addEventListener('click', () => { harness.step(1); syncPlayButton(); });
  speedSelect.addEventListener('change', () => { harness.setSpeed(Number(speedSelect.value)); });
  timeline.addEventListener('input', () => { harness.seek(Number(timeline.value)); });

  return {
    transport,
    timelineWrap,
    timeLabel,
    syncPlayButton,
    renderDots,
    showTime,
    showSceneTime,
    setSceneMode,
    setLiveOnly,
    showLiveSteps,
    applyPeriod,
  };
}
