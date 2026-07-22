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

  function syncPlayButton(): void {
    playButton.textContent = player.playing ? '⏸ Pause' : '▶ Play';
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

  function applyPeriod(periodMs: number): void {
    player.setPeriod(periodMs, performance.now());
    const period = player.periodMs;
    playButton.disabled = period <= 0;
    stepBack.disabled = period <= 0;
    stepForward.disabled = period <= 0;
    timeline.disabled = period <= 0;
    timeline.max = String(Math.max(period - 1, 0));
  }

  playButton.addEventListener('click', () => {
    if (player.playing) harness.pause(); else harness.play();
    syncPlayButton();
  });
  stepBack.addEventListener('click', () => { harness.step(-1); syncPlayButton(); });
  stepForward.addEventListener('click', () => { harness.step(1); syncPlayButton(); });
  speedSelect.addEventListener('change', () => { harness.setSpeed(Number(speedSelect.value)); });
  timeline.addEventListener('input', () => { harness.seek(Number(timeline.value)); });

  return { transport, timelineWrap, timeLabel, syncPlayButton, renderDots, showTime, applyPeriod };
}
