import type { VoxelStudioHarnessV1 } from './harness.js';
import type { RecipePartV1 } from './recipe.js';

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
let constructionPanelSerial = 0;

export interface ConstructionPanelV1 {
  readonly element: HTMLElement;
  /** Rebuilds the step list; call when the open model changes. */
  refresh(): void;
  /**
   * Re-marks the selected part row from the harness, without rebuilding the
   * list. Called when a highlight changes, so clicking a part with children
   * lights it without the list rebuilding out from under the expand toggle.
   */
  syncHighlight(): void;
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
  const panelId = String(constructionPanelSerial += 1);

  const pane = element('div', 'pane');
  const partsIntro = element('p', 'hint');
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
  const componentsHeading = element('h3', 'grouphead');
  componentsHeading.id = `studio-parts-heading-${panelId}`;
  componentsHeading.textContent = 'Parts list';
  const componentsHint = element('p', 'hint component-hint');
  const componentsList = element('ul', 'components');
  componentsList.setAttribute('aria-labelledby', componentsHeading.id);
  const stepsHeading = element('h3', 'grouphead');
  stepsHeading.id = `studio-construction-heading-${panelId}`;
  stepsHeading.textContent = 'Construction stages';
  const list = element('ol', 'steps');
  list.setAttribute('aria-labelledby', stepsHeading.id);
  pane.append(
    partsIntro,
    componentsHeading,
    componentsHint,
    componentsList,
    stepsHeading,
    intro,
    transport,
    list,
  );

  let playTimer = 0;
  let disposed = false;
  let componentModelId = '';
  const expandedComponents = new Set<string>();

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

  function countLeafParts(parts: readonly RecipePartV1[]): number {
    return parts.reduce(
      (total, part) => total + (part.children.length === 0
        ? part.count
        : countLeafParts(part.children)),
      0,
    );
  }

  function partDetail(part: RecipePartV1): string {
    switch (part.kind) {
      case 'recipe':
        return [part.recipeId ?? '', `${String(part.count)} placement${part.count === 1 ? '' : 's'}`]
          .filter(Boolean).join(' · ');
      case 'part': {
        const settings = Object.entries(part.settings ?? {})
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(' · ');
        return [`${String(part.count)} piece${part.count === 1 ? '' : 's'}`, settings]
          .filter(Boolean).join(' · ');
      }
      case 'voxels':
        return [
          `${String(part.voxelCount ?? 0)} cubes`,
          `${String(part.count)} layer${part.count === 1 ? '' : 's'}`,
          part.size.join('×'),
        ].filter(Boolean).join(' · ');
    }
  }

  function renderPart(
    part: RecipePartV1,
    shelfIds: ReadonlySet<string>,
    path: readonly number[],
  ): HTMLLIElement {
    const item = element('li', 'component-row');
    const hasChildren = part.children.length > 0;
    const branch = hasChildren ? element('details', 'component-branch') : null;
    const pathLabel = path.join('.');
    const line = hasChildren
      ? element('summary', 'component-line')
      : element('div', 'component-line');
    const badge = element('span', `component-kind kind-${part.kind}`);
    badge.textContent = part.kind;
    const copy = element('span', 'component-copy');
    const name = element('strong', 'component-name');
    name.textContent = `${part.name} ×${String(part.count)}`;
    const purpose = element('span', 'component-purpose');
    purpose.textContent = part.summary;
    const detail = element('span', 'component-detail');
    detail.textContent = partDetail(part);
    copy.append(name, purpose, detail);
    line.append(badge, copy);

    if (part.recipeId && shelfIds.has(part.recipeId)) {
      const open = element('button', 'component-open');
      open.textContent = 'Open';
      open.title = `Open ${part.name} on its own`;
      open.dataset.modelId = part.recipeId;
      open.setAttribute('aria-label', `Open ${part.name}, part ${pathLabel}`);
      open.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        stopPlaying();
        harness.openFromShelf(part.recipeId ?? '');
        onChanged();
        refresh();
      });
      line.appendChild(open);
    }

    // Only top-level parts are locatable: a nested child lives in its own
    // sub-grid, which the model's cells do not address. Clicking the row lights
    // the part up in the picture and marks it here; clicking it again clears it.
    // The Open button and a details toggle keep their own jobs.
    if (path.length === 1) {
      const topIndex = (path[0] ?? 1) - 1;
      line.classList.add('selectable');
      line.dataset.partIndex = String(topIndex);
      line.title = 'Click to light this part up in the model';
      if (harness.highlightedPart() === topIndex) line.classList.add('selected');
      line.addEventListener('click', (event) => {
        if (event.target instanceof HTMLButtonElement) return;
        harness.highlightPart(harness.highlightedPart() === topIndex ? null : topIndex);
      });
    }

    if (branch) {
      branch.open = expandedComponents.has(pathLabel);
      branch.addEventListener('toggle', () => {
        if (branch.open) expandedComponents.add(pathLabel);
        else expandedComponents.delete(pathLabel);
      });
      branch.appendChild(line);
      const children = element('ul', 'component-children');
      part.children.forEach((child, index) => {
        children.appendChild(renderPart(child, shelfIds, [...path, index + 1]));
      });
      branch.appendChild(children);
      item.appendChild(branch);
    } else {
      item.appendChild(line);
    }
    return item;
  }

  function refresh(): void {
    const steps = harness.buildSteps();
    const parts = harness.buildParts();
    const shown = harness.shownBuildStep();
    const hasRecipe = steps.length > 0;
    const openModelId = harness.model().id;
    if (openModelId !== componentModelId) {
      componentModelId = openModelId;
      expandedComponents.clear();
    }

    intro.textContent = hasRecipe
      ? `This model is made in ${String(steps.length - 1)} steps. `
        + 'Play it, or click a step to see the model as it stood then.'
      : 'No catalog recipe is open. Every shelf model must provide one.';
    partsIntro.textContent = hasRecipe
      ? 'Contributing assemblies and their saved recipe parts. Counts account '
        + 'for overwrites and mirrors at each recipe level; expand or open a reusable recipe.'
      : 'No catalog recipe is open, so there is no parts list to inspect.';
    for (const control of [stepBack, playButton, stepForward, finishedButton]) {
      control.toggleAttribute('disabled', !hasRecipe);
    }
    finishedButton.toggleAttribute('disabled', !hasRecipe || shown === null);

    const topLevelCount = parts.reduce((total, part) => total + part.count, 0);
    const leafCount = countLeafParts(parts);
    componentsHint.textContent = `${String(parts.length)} top-level line item${parts.length === 1 ? '' : 's'} `
      + `· ${String(topLevelCount)} occurrence${topLevelCount === 1 ? '' : 's'} `
      + `· ${String(leafCount)} recipe leaf pieces. `
      + 'Mirrors are construction steps, not parts.';
    for (const node of [componentsHeading, componentsHint, componentsList]) {
      node.hidden = !hasRecipe;
    }
    stepsHeading.hidden = !hasRecipe;

    componentsList.replaceChildren();
    const shelfIds = new Set(
      harness.shelf().flatMap((section) => section.models.map((model) => model.id)),
    );
    parts.forEach((part, index) => {
      componentsList.appendChild(renderPart(part, shelfIds, [index + 1]));
    });

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

  function syncHighlight(): void {
    const selected = harness.highlightedPart();
    for (const line of Array.from(componentsList.querySelectorAll<HTMLElement>('.component-line.selectable'))) {
      line.classList.toggle('selected', Number(line.dataset.partIndex) === selected);
    }
  }

  refresh();

  return {
    element: pane,
    refresh,
    syncHighlight,
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
