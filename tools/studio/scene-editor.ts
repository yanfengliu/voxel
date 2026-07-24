import type { RecipeBookV1 } from './recipe.js';
import type { ScenePlacementV1, SceneV1 } from './scene.js';
import { element } from './studio-app-helpers.js';

/**
 * The Edit tab, for a scene. A scene is an arrangement of models, so editing it
 * is placing them: add a model, then select it — in this list or by clicking it
 * on the stage — to move, turn, or remove it. Every change hands a new scene
 * back through `onChange`, which redraws and re-renders this list.
 *
 * Selection is owned by the app, not this panel: the app holds which placement
 * is selected (shared with the stage's outline and drag), tells this panel via
 * `render`, and hears clicks back through `onSelect`. That one source of truth
 * is why clicking a second model on the stage moves the controls here to it,
 * rather than leaving them on the first.
 */

export interface SceneEditorV1 {
  readonly element: HTMLElement;
  /** Draws the list, opening the controls under the selected placement's row. */
  render(scene: SceneV1, selectedId: string | null): void;
}

/** A stable id for a newly added placement, never colliding with an existing one. */
function freshId(model: string, taken: ReadonlySet<string>): string {
  const base = model.split(':').pop() ?? 'model';
  let n = 1;
  while (taken.has(`${base}-${String(n)}`)) n += 1;
  return `${base}-${String(n)}`;
}

export function createSceneEditor(options: {
  readonly recipes: RecipeBookV1;
  /** Given the edited scene; the app adopts it, redraws, and renders back. */
  readonly onChange: (scene: SceneV1) => void;
  /** A row was clicked; the app records the selection and renders back. */
  readonly onSelect: (id: string | null) => void;
}): SceneEditorV1 {
  const { recipes, onChange, onSelect } = options;
  let scene: SceneV1 | null = null;

  const pane = element('div', 'pane scene-editor');
  const intro = element('p', 'hint');
  intro.textContent = 'Arrange the scene: add a model, then select it here or on '
    + 'the stage to move it, turn it, or take it out. Every change redraws.';

  const addRow = element('div', 'row');
  const modelSelect = element('select', 'scene-add-model');
  for (const [id, recipe] of Object.entries(recipes).sort((a, b) => a[0].localeCompare(b[0]))) {
    const option = element('option');
    option.value = id;
    option.textContent = recipe.label;
    modelSelect.append(option);
  }
  const addButton = element('button', 'primary');
  addButton.textContent = 'Add model';
  addRow.append(modelSelect, addButton);

  const list = element('ul', 'placements');
  const emptyHint = element('p', 'hint');
  emptyHint.textContent = 'This scene has no models yet.';
  pane.append(intro, addRow, list, emptyHint);

  function commit(placements: readonly ScenePlacementV1[]): void {
    if (scene === null) return;
    onChange({ ...scene, placements: placements.map((placement) => ({ ...placement })) });
  }
  function edit(id: string, change: (placement: ScenePlacementV1) => ScenePlacementV1): void {
    if (scene === null) return;
    commit(scene.placements.map((placement) => (placement.id === id ? change(placement) : placement)));
  }
  const move = (id: string, dx: number, dy: number, dz: number): void => {
    edit(id, (placement) => ({
      ...placement,
      at: [placement.at[0] + dx, placement.at[1] + dy, placement.at[2] + dz],
    }));
  };
  const turn = (id: string): void => {
    edit(id, (placement) => ({ ...placement, turns: (((placement.turns ?? 0) + 1) % 4) }));
  };
  const remove = (id: string): void => {
    if (scene === null) return;
    // The app clears a selection whose placement no longer exists, so removing
    // the selected one leaves nothing selected.
    commit(scene.placements.filter((placement) => placement.id !== id));
  };

  addButton.addEventListener('click', () => {
    if (scene === null) return;
    const model = modelSelect.value;
    if (model === '') return;
    const id = freshId(model, new Set(scene.placements.map((placement) => placement.id)));
    onChange({ ...scene, placements: [...scene.placements, { id, model, at: [0, 0, 0] }] });
    onSelect(id);
  });

  function button(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const control = element('button');
    control.textContent = text;
    control.title = title;
    control.addEventListener('click', onClick);
    return control;
  }

  function render(next: SceneV1, selectedId: string | null): void {
    scene = next;
    emptyHint.hidden = next.placements.length > 0;
    list.replaceChildren();
    for (const placement of next.placements) {
      const row = element('li', placement.id === selectedId ? 'placement selected' : 'placement');
      const label = recipes[placement.model]?.label ?? placement.model;
      const name = element('button', 'placement-name');
      const turned = placement.turns ? ` · turn ${String(placement.turns)}` : '';
      name.textContent = `${label} · (${placement.at.join(', ')})${turned}`;
      name.addEventListener('click', () => { onSelect(placement.id); });
      row.append(name);
      if (placement.id === selectedId) {
        const controls = element('div', 'placement-controls');
        controls.append(
          button('X−', 'Move left', () => { move(placement.id, -1, 0, 0); }),
          button('X+', 'Move right', () => { move(placement.id, 1, 0, 0); }),
          button('Z−', 'Move back', () => { move(placement.id, 0, 0, -1); }),
          button('Z+', 'Move front', () => { move(placement.id, 0, 0, 1); }),
          button('Y−', 'Lower', () => { move(placement.id, 0, -1, 0); }),
          button('Y+', 'Raise', () => { move(placement.id, 0, 1, 0); }),
          button('↻', 'Turn a quarter', () => { turn(placement.id); }),
          button('Remove', 'Take out of the scene', () => { remove(placement.id); }),
        );
        row.append(controls);
      }
      list.append(row);
    }
  }

  return { element: pane, render };
}
