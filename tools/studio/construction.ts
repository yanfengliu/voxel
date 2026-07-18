import type { VoxelStudioHarnessV1 } from './harness.js';

/**
 * The Build panel: watch the computer follow a recipe, one step at a time,
 * from an empty grid to the finished model.
 *
 * It exists because a recipe is a list of instructions, and a list of
 * instructions is exactly the thing you cannot judge by reading. Seeing the
 * hull appear, then the mast, then the oar mirrored across, is how you learn
 * whether the steps are the right steps -- and it is how a part's own shape
 * gets caught, since every step here is a part doing its job in isolation.
 *
 * Previewing never costs edits: the harness remembers the model that was open
 * and puts it back, and leaving the panel restores it too.
 */

/** How long each step holds while the build plays. */
const STEP_HOLD_MS = 750;

export interface ConstructionPanelV1 {
  readonly element: HTMLElement;
  /** Rebuilds the step list; call when the open model changes. */
  refresh(): void;
  /** Stops playing and restores the finished model. */
  leave(): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createConstructionPanel(options: {
  readonly harness: VoxelStudioHarnessV1;
  /** Lets the app refresh its own readouts after the picture changes. */
  readonly onChanged: () => void;
}): ConstructionPanelV1 {
  const { harness, onChanged } = options;

  const pane = element('div', 'pane');
  const intro = element('p', 'hint');
  const transport = element('div', 'row');
  const stepBack = element('button', 'step');
  stepBack.textContent = '◀';
  stepBack.title = 'One step back';
  const playButton = element('button', 'primary');
  playButton.textContent = '▶ Play build';
  const stepForward = element('button', 'step');
  stepForward.textContent = '▶';
  stepForward.title = 'One step forward';
  const finishedButton = element('button');
  finishedButton.textContent = 'Finished model';
  transport.append(stepBack, playButton, stepForward, finishedButton);
  const list = element('ol', 'steps');
  pane.append(intro, transport, list);

  let playTimer = 0;
  let disposed = false;

  const stepCount = (): number => harness.buildSteps().length;

  function stopPlaying(): void {
    if (playTimer !== 0) {
      clearTimeout(playTimer);
      playTimer = 0;
    }
    playButton.textContent = '▶ Play build';
  }

  function show(index: number): void {
    // Watching construction and watching motion at once is two animations
    // fighting over one picture, so previewing a step pauses playback.
    harness.pause();
    harness.showBuildStep(index);
    onChanged();
    refresh();
  }

  function showFinished(): void {
    stopPlaying();
    harness.showFinished();
    onChanged();
    refresh();
  }

  function playFrom(index: number): void {
    if (disposed) return;
    show(index);
    if (index >= stepCount() - 1) {
      stopPlaying();
      return;
    }
    playTimer = window.setTimeout(() => { playFrom(index + 1); }, STEP_HOLD_MS);
  }

  playButton.addEventListener('click', () => {
    if (playTimer !== 0) {
      stopPlaying();
      return;
    }
    const total = stepCount();
    if (total === 0) return;
    const shown = harness.shownBuildStep();
    // Replaying from the end starts over, so the button always shows a build
    // rather than sitting on a finished model doing nothing.
    const from = shown === null || shown >= total - 1 ? 0 : shown + 1;
    playButton.textContent = '❚❚ Pause';
    playFrom(from);
  });

  stepBack.addEventListener('click', () => {
    stopPlaying();
    const total = stepCount();
    if (total === 0) return;
    const shown = harness.shownBuildStep() ?? total - 1;
    show(Math.max(0, shown - 1));
  });

  stepForward.addEventListener('click', () => {
    stopPlaying();
    const total = stepCount();
    if (total === 0) return;
    const shown = harness.shownBuildStep();
    if (shown === null) {
      show(0);
      return;
    }
    show(Math.min(total - 1, shown + 1));
  });

  finishedButton.addEventListener('click', showFinished);

  function refresh(): void {
    const steps = harness.buildSteps();
    const shown = harness.shownBuildStep();
    const hasRecipe = steps.length > 0;

    intro.textContent = hasRecipe
      ? `This model is made in ${String(steps.length - 1)} steps. `
        + 'Play it, or click a step to see the model as it stood then.'
      : 'This model was made by hand, so there are no steps to replay. '
        + 'Models saved as a recipe show their construction here.';
    for (const control of [stepBack, playButton, stepForward, finishedButton]) {
      control.toggleAttribute('disabled', !hasRecipe);
    }
    finishedButton.toggleAttribute('disabled', !hasRecipe || shown === null);

    list.replaceChildren();
    for (const step of steps) {
      const row = element('li', 'step-row');
      row.classList.toggle('active', shown === step.index);
      const button = element('button');
      const num = element('span', 'step-num');
      num.textContent = String(step.index);
      const text = element('span', 'step-text');
      text.textContent = step.summary;
      const count = element('span', 'step-count');
      // The running total is the honest number; the change is what a step
      // actually did, and a repaint that adds nothing says so.
      count.textContent = step.index === 0
        ? '0 cubes'
        : `${step.voxelsAdded > 0 ? '+' : ''}${String(step.voxelsAdded)} · ${String(step.voxelsAfter)} cubes`;
      button.append(num, text, count);
      button.addEventListener('click', () => {
        stopPlaying();
        show(step.index);
      });
      row.appendChild(button);
      list.appendChild(row);
    }
  }

  refresh();

  return {
    element: pane,
    refresh,
    leave() {
      stopPlaying();
      if (harness.shownBuildStep() !== null) showFinished();
    },
    dispose() {
      disposed = true;
      stopPlaying();
    },
  };
}
