import type { VoxelStudioHarnessV1 } from './harness.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import { element } from './studio-app-helpers.js';

/**
 * The shelf on the left: the game's models in the sections it named, each a
 * foldable heading over its rows. The studio only knows a section holds
 * models; opening one goes through the harness, and lands on Build when the
 * model carries a recipe so its parts are the first thing seen.
 */

export interface StudioShelfDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly showTab: (name: ModelStudioTabId) => void;
}

export interface StudioShelfV1 {
  readonly heading: HTMLElement;
  readonly body: HTMLElement;
  /** Rebuilds the sections and marks the open model. Called on refresh. */
  rebuild(): void;
}

export function createStudioShelf(deps: StudioShelfDepsV1): StudioShelfV1 {
  const { harness, showTab } = deps;

  const heading = element('h2');
  heading.textContent = "This studio's shelf";
  const body = element('div', 'rail-body');
  const folded = new Set<string>();

  function rebuild(): void {
    body.replaceChildren();
    const currentId = harness.model().id;
    for (const section of harness.shelf()) {
      const isFolded = folded.has(section.name);
      const head = element('button', 'section-head');
      head.textContent = `${isFolded ? '▸' : '▾'} ${section.name}`;
      head.setAttribute('aria-expanded', String(!isFolded));
      head.setAttribute('aria-label', section.name);
      head.addEventListener('click', () => {
        if (folded.has(section.name)) folded.delete(section.name);
        else folded.add(section.name);
        rebuild();
      });
      body.appendChild(head);
      if (isFolded) continue;
      for (const entry of section.models) {
        const row = element('button', 'model-row');
        row.classList.toggle('active', entry.id === currentId);
        const label = element('span');
        label.textContent = entry.label;
        row.appendChild(label);
        row.addEventListener('click', () => {
          harness.openFromShelf(entry.id);
          showTab(harness.buildSteps().length > 0 ? 'build' : 'examine');
        });
        body.appendChild(row);
      }
    }
    const note = element('p', 'railnote');
    note.textContent =
      'One studio per game, each with its own shelf. This one belongs to the engine.';
    body.appendChild(note);
  }

  return { heading, body, rebuild };
}
