import type { RecipeBookV1 } from './recipe.js';
import {
  MAX_SCENE_LIGHT_INTENSITY,
  MAX_SCENE_LIGHT_RANGE,
  MAX_SCENE_LIGHTS,
  VOXEL_SCENE_SCHEMA_V2,
  VOXEL_SCENE_SCHEMA_V3,
  type ScenePlacementV1,
  type ScenePointLightOrbitMotionV1,
  type ScenePointLightV1,
  type ScenePointLightV3,
  type SceneV1,
} from './scene.js';
import { element } from './studio-app-helpers.js';

/**
 * The Edit tab, for a scene. Models and point lights are both immutable scene
 * edits: every control hands a new SceneV1 to the app, whose existing history
 * records it as one undo step.
 *
 * Model selection is owned by the app because the stage outline and drag share
 * it. Light selection stays inside this panel: lights have no stage drag in this
 * first slice, while their visible renderer handles and controls still update
 * from the same scene data.
 */
export interface SceneEditorV1 {
  readonly element: HTMLElement;
  /** Draws the lists, opening controls for the selected model or point light. */
  render(scene: SceneV1, selectedId: string | null): void;
  /** Clears the panel-local light selection when the app clears scene selection. */
  clearLightSelection(): void;
}

export type SceneEditorMutationResultV1<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  if (typeof error === 'string' && error.trim() !== '') return error;
  return 'The scene change was rejected without an explanation; no changes were applied. '
    + 'Try a different edit or reload the Studio before continuing.';
}

/**
 * Runs one editor mutation and restores its panel-local state if the owning app
 * rejects it. The app remains authoritative: a failed renderer or workspace
 * transaction must never leak the editor's speculative selection.
 */
export function attemptSceneEditorMutationV1<T>(
  apply: () => T,
  rollback: () => void,
): SceneEditorMutationResultV1<T> {
  try {
    return { ok: true, value: apply() };
  } catch (error) {
    const message = mutationErrorMessage(error);
    try {
      rollback();
      return { ok: false, message };
    } catch (rollbackError) {
      return {
        ok: false,
        message: `${message} The editor also could not restore its prior controls: `
          + mutationErrorMessage(rollbackError),
      };
    }
  }
}

/** A stable id for a newly added placement, never colliding with an existing one. */
function freshId(model: string, taken: ReadonlySet<string>): string {
  const base = model.split(':').pop() ?? 'model';
  let n = 1;
  while (taken.has(`${base}-${String(n)}`)) n += 1;
  return `${base}-${String(n)}`;
}

function freshLightId(taken: ReadonlySet<string>): string {
  let n = 1;
  while (taken.has(`light-${String(n)}`)) n += 1;
  return `light-${String(n)}`;
}

function hasOrbitMotion(
  light: ScenePointLightV1,
): light is ScenePointLightV3 & { readonly motion: ScenePointLightOrbitMotionV1 } {
  return 'motion' in light && light.motion !== undefined;
}

function clonePointLight<T extends ScenePointLightV1>(light: T): T {
  return {
    ...light,
    at: [...light.at],
    color: { ...light.color },
    ...(hasOrbitMotion(light)
      ? { motion: { ...light.motion, center: [...light.motion.center] } }
      : {}),
  };
}

function editedLightSchema(scene: SceneV1): typeof VOXEL_SCENE_SCHEMA_V2 | typeof VOXEL_SCENE_SCHEMA_V3 {
  return scene.schemaVersion === VOXEL_SCENE_SCHEMA_V3
    ? VOXEL_SCENE_SCHEMA_V3
    : VOXEL_SCENE_SCHEMA_V2;
}

/** Adds one deterministic point light without changing any placement or model reference. */
export function addScenePointLightV1(
  scene: SceneV1,
): { readonly scene: SceneV1; readonly light: ScenePointLightV1 } {
  const current = scene.lights ?? [];
  if (current.length >= MAX_SCENE_LIGHTS) {
    throw new Error(
      `Scene '${scene.id}' already has the maximum of ${String(MAX_SCENE_LIGHTS)} point lights; `
      + 'remove one before adding another.',
    );
  }
  const light: ScenePointLightV1 = {
    id: freshLightId(new Set(current.map((entry) => entry.id))),
    kind: 'point',
    at: [0, 8, 0],
    color: { r: 255, g: 214, b: 160 },
    intensity: 1_200,
    range: 30,
  };
  return {
    scene: {
      ...scene,
      schemaVersion: editedLightSchema(scene),
      lights: [...current, light],
    },
    light,
  };
}

/** Replaces one light by stable id while preserving the scene's placement array. */
export function replaceScenePointLightV1(
  scene: SceneV1,
  id: string,
  next: ScenePointLightV1,
): SceneV1 {
  const current = scene.lights ?? [];
  if (!current.some((light) => light.id === id)) {
    throw new Error(`No point light in scene '${scene.id}' has the id '${id}', so it cannot be changed.`);
  }
  if (next.id !== id) {
    throw new Error(
      `Point light '${id}' cannot be replaced with '${next.id}': light ids are stable; `
      + 'change its editable values instead.',
    );
  }
  return {
    ...scene,
    schemaVersion: editedLightSchema(scene),
    lights: current.map((light) => (light.id === id ? clonePointLight(next) : light)),
  };
}

/** Removes one light by stable id without touching any model placement. */
export function removeScenePointLightV1(scene: SceneV1, id: string): SceneV1 {
  const current = scene.lights ?? [];
  if (!current.some((light) => light.id === id)) {
    throw new Error(`No point light in scene '${scene.id}' has the id '${id}', so it cannot be removed.`);
  }
  return {
    ...scene,
    schemaVersion: editedLightSchema(scene),
    lights: current.filter((light) => light.id !== id),
  };
}

/** Resolves a scene's authoritative recipe-book key to the model id that owns its display alias. */
export function sceneModelAliasIdV1(recipes: RecipeBookV1, bookKey: string): string {
  return Object.hasOwn(recipes, bookKey) ? recipes[bookKey]!.id : bookKey;
}

function colorHex(light: ScenePointLightV1): string {
  const channel = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${channel(light.color.r)}${channel(light.color.g)}${channel(light.color.b)}`;
}

function colorFromHex(value: string): ScenePointLightV1['color'] | null {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return null;
  return {
    r: Number.parseInt(match[1]!, 16),
    g: Number.parseInt(match[2]!, 16),
    b: Number.parseInt(match[3]!, 16),
  };
}

export function createSceneEditor(options: {
  readonly recipes: RecipeBookV1;
  /** Applies mount-local model display aliases without changing recipe ids. */
  readonly modelDisplayLabel: (id: string, fallback: string) => string;
  /** Given the edited scene; the app adopts it, redraws, and renders back. */
  readonly onChange: (scene: SceneV1) => void;
  /** A model row was clicked; the app records stage-shared placement selection. */
  readonly onSelect: (id: string | null) => void;
}): SceneEditorV1 {
  const { recipes, modelDisplayLabel, onChange, onSelect } = options;
  let scene: SceneV1 | null = null;
  let selectedPlacementId: string | null = null;
  let selectedLightId: string | null = null;

  const pane = element('div', 'pane scene-editor');
  const intro = element('p', 'hint');
  intro.textContent = 'Arrange the scene: add a model or point light, then select it '
    + 'to move, turn, recolor, or remove it. Every committed change redraws.';
  const mutationError = element('p', 'lib-error scene-editor-error');
  mutationError.setAttribute('role', 'alert');
  mutationError.setAttribute('aria-live', 'assertive');
  mutationError.hidden = true;

  const addRow = element('div', 'row');
  const modelSelect = element('select', 'scene-add-model');
  for (const [id, recipe] of Object.entries(recipes).sort((a, b) => a[0].localeCompare(b[0]))) {
    const option = element('option');
    option.value = id;
    option.textContent = modelDisplayLabel(sceneModelAliasIdV1(recipes, id), recipe.label);
    option.title = id;
    modelSelect.append(option);
  }
  const addButton = element('button', 'primary');
  addButton.textContent = 'Add model';
  addRow.append(modelSelect, addButton);

  const list = element('ul', 'placements');
  const emptyHint = element('p', 'hint');
  emptyHint.textContent = 'This scene has no models yet.';

  const lightHeader = element('div', 'scene-light-header');
  const lightHeading = element('p', 'grouphead scene-light-heading');
  lightHeading.textContent = 'Light sources';
  const lightCount = element('span', 'scene-light-count');
  lightHeader.append(lightHeading, lightCount);
  const addLightButton = element('button');
  addLightButton.textContent = 'Add point light';
  const lightList = element('ul', 'lights');
  const emptyLights = element('p', 'hint');
  emptyLights.textContent = 'This scene has no editable light sources.';

  pane.append(
    intro,
    mutationError,
    addRow,
    list,
    emptyHint,
    lightHeader,
    addLightButton,
    lightList,
    emptyLights,
  );

  function clearMutationError(): void {
    mutationError.textContent = '';
    mutationError.hidden = true;
  }

  function showMutationError(message: string): void {
    mutationError.textContent = message;
    mutationError.hidden = false;
  }

  interface PendingChange {
    readonly next: SceneV1;
    readonly selection?: {
      readonly placementId: string | null;
      readonly lightId: string | null;
      readonly notifyApp: boolean;
    };
  }

  /**
   * The sole scene-mutation path for this panel. `onChange` may synchronously
   * render speculative state before rejecting it, so rollback restores both the
   * prior scene and the private light selection before showing the error.
   */
  function commitChange(prepare: () => PendingChange): boolean {
    if (scene === null) return false;
    const previousScene = scene;
    const previousPlacementId = selectedPlacementId;
    const previousLightId = selectedLightId;
    clearMutationError();
    const result = attemptSceneEditorMutationV1(
      () => {
        const pending = prepare();
        onChange(pending.next);
        return pending;
      },
      () => {
        scene = previousScene;
        selectedPlacementId = previousPlacementId;
        selectedLightId = previousLightId;
        render(previousScene, previousPlacementId);
      },
    );
    if (!result.ok) {
      showMutationError(result.message);
      return false;
    }
    const pending = result.value;
    scene = pending.next;
    if (pending.selection !== undefined) {
      // Notify first: the app clears any panel-local light selection while it
      // changes the shared stage selection. Assign the accepted light after
      // that callback so Add point light opens the new light, not no light.
      if (pending.selection.notifyApp) onSelect(pending.selection.placementId);
      selectedPlacementId = pending.selection.placementId;
      selectedLightId = pending.selection.lightId;
    }
    render(pending.next, selectedPlacementId);
    return true;
  }

  function button(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const control = element('button');
    control.textContent = text;
    control.title = title;
    control.addEventListener('click', () => {
      const restoreFocus = document.activeElement === control;
      onClick();
      if (restoreFocus && !control.isConnected) {
        const replacement = Array.from(pane.querySelectorAll<HTMLButtonElement>('button'))
          .find((candidate) => candidate.title === title && candidate.textContent === text);
        replacement?.focus();
      }
    });
    return control;
  }

  function commitPlacements(placements: readonly ScenePlacementV1[]): void {
    if (scene === null) return;
    const current = scene;
    commitChange(() => ({
      next: {
        ...current,
        placements: placements.map((placement) => ({ ...placement })),
      },
    }));
  }

  function editPlacement(
    id: string,
    change: (placement: ScenePlacementV1) => ScenePlacementV1,
  ): void {
    if (scene === null) return;
    commitPlacements(
      scene.placements.map((placement) => (placement.id === id ? change(placement) : placement)),
    );
  }

  const movePlacement = (id: string, dx: number, dy: number, dz: number): void => {
    editPlacement(id, (placement) => ({
      ...placement,
      at: [placement.at[0] + dx, placement.at[1] + dy, placement.at[2] + dz],
    }));
  };

  function editLight(
    id: string,
    change: (light: ScenePointLightV1) => ScenePointLightV1,
  ): void {
    if (scene === null) return;
    const light = scene.lights?.find((entry) => entry.id === id);
    if (!light) return;
    const current = scene;
    commitChange(() => ({
      next: replaceScenePointLightV1(current, id, change(light)),
    }));
  }

  const moveLight = (id: string, dx: number, dy: number, dz: number): void => {
    editLight(id, (light) => ({
      ...light,
      at: [light.at[0] + dx, light.at[1] + dy, light.at[2] + dz],
    }));
  };

  addButton.addEventListener('click', () => {
    if (scene === null) return;
    const current = scene;
    const model = modelSelect.value;
    if (model === '') return;
    commitChange(() => {
      const id = freshId(model, new Set(current.placements.map((placement) => placement.id)));
      return {
        next: {
          ...current,
          placements: [...current.placements, { id, model, at: [0, 0, 0] }],
        },
        selection: { placementId: id, lightId: null, notifyApp: true },
      };
    });
  });

  addLightButton.addEventListener('click', () => {
    if (scene === null) return;
    const current = scene;
    commitChange(() => {
      const added = addScenePointLightV1(current);
      return {
        next: added.scene,
        selection: { placementId: null, lightId: added.light.id, notifyApp: true },
      };
    });
  });

  function numberField(
    labelText: string,
    value: number,
    step: string,
    maximum: number,
    onCommit: (value: number) => void,
  ): HTMLLabelElement {
    const label = element('label', 'scene-light-field');
    const name = element('span');
    name.textContent = labelText;
    const input = element('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(maximum);
    input.step = step;
    input.value = String(value);
    input.setAttribute('aria-label', labelText);
    const error = element('span', 'scene-light-field-error');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const clearError = (): void => {
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      error.hidden = true;
    };
    input.addEventListener('input', clearError);
    input.addEventListener('change', () => {
      const next = input.valueAsNumber;
      if (!Number.isFinite(next) || next < 0 || next > maximum) {
        const message = `${labelText} input '${input.value}' is invalid; enter a finite number `
          + `from 0 to ${String(maximum)}.`;
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', 'true');
        error.textContent = message;
        error.hidden = false;
        input.reportValidity();
        return;
      }
      clearError();
      onCommit(next);
    });
    label.append(name, input, error);
    return label;
  }

  function renderLights(next: SceneV1): void {
    const lights = next.lights ?? [];
    if (selectedLightId !== null && !lights.some((light) => light.id === selectedLightId)) {
      selectedLightId = null;
    }
    lightCount.textContent = `${String(lights.length)}/${String(MAX_SCENE_LIGHTS)}`;
    addLightButton.disabled = lights.length >= MAX_SCENE_LIGHTS;
    addLightButton.title = addLightButton.disabled
      ? `This scene already has the maximum of ${String(MAX_SCENE_LIGHTS)} point lights.`
      : 'Add a movable colored point light';
    emptyLights.hidden = lights.length > 0;
    lightList.replaceChildren();

    for (const light of lights) {
      const selected = light.id === selectedLightId;
      const row = element('li', selected ? 'scene-light selected' : 'scene-light');
      const name = element('button', 'scene-light-name');
      name.textContent = `${light.id} · (${light.at.join(', ')})`;
      name.title = 'Select this point light';
      name.setAttribute('aria-expanded', String(selected));
      name.addEventListener('click', () => {
        onSelect(null);
        selectedLightId = light.id;
        if (scene) render(scene, null);
        lightList.querySelector<HTMLButtonElement>('.scene-light.selected .scene-light-name')?.focus();
      });
      row.append(name);

      if (selected) {
        const controls = element('div', 'scene-light-controls');
        const moves = element('div', 'placement-controls');
        moves.append(
          button('X−', 'Move light left', () => { moveLight(light.id, -1, 0, 0); }),
          button('X+', 'Move light right', () => { moveLight(light.id, 1, 0, 0); }),
          button('Z−', 'Move light back', () => { moveLight(light.id, 0, 0, -1); }),
          button('Z+', 'Move light front', () => { moveLight(light.id, 0, 0, 1); }),
          button('Y−', 'Lower light', () => { moveLight(light.id, 0, -1, 0); }),
          button('Y+', 'Raise light', () => { moveLight(light.id, 0, 1, 0); }),
        );

        const values = element('div', 'scene-light-values');
        const colorLabel = element('label', 'scene-light-field');
        const colorName = element('span');
        colorName.textContent = 'Color';
        const color = element('input');
        color.type = 'color';
        color.value = colorHex(light);
        color.setAttribute('aria-label', 'Light color');
        color.addEventListener('change', () => {
          const nextColor = colorFromHex(color.value);
          if (nextColor) editLight(light.id, (entry) => ({ ...entry, color: nextColor }));
        });
        colorLabel.append(colorName, color);
        values.append(
          colorLabel,
          numberField('Intensity', light.intensity, '50', MAX_SCENE_LIGHT_INTENSITY, (intensity) => {
            editLight(light.id, (entry) => ({ ...entry, intensity }));
          }),
          numberField('Range', light.range, '1', MAX_SCENE_LIGHT_RANGE, (range) => {
            editLight(light.id, (entry) => ({ ...entry, range }));
          }),
        );

        const remove = button('Remove', 'Remove this point light from the scene', () => {
          if (scene === null) return;
          const current = scene;
          commitChange(() => ({
            next: removeScenePointLightV1(current, light.id),
            selection: { placementId: null, lightId: null, notifyApp: false },
          }));
        });
        remove.classList.add('danger');
        controls.append(moves, values, remove);
        row.append(controls);
      }
      lightList.append(row);
    }
  }

  function render(next: SceneV1, selectedId: string | null): void {
    const changedScene = scene?.id !== next.id;
    scene = next;
    selectedPlacementId = selectedId;
    if (changedScene || selectedPlacementId !== null) selectedLightId = null;
    for (const option of Array.from(modelSelect.options)) {
      const recipe = recipes[option.value];
      option.textContent = modelDisplayLabel(
        sceneModelAliasIdV1(recipes, option.value),
        recipe?.label ?? option.value,
      );
    }
    emptyHint.hidden = next.placements.length > 0;
    list.replaceChildren();
    for (const placement of next.placements) {
      const row = element('li', placement.id === selectedId ? 'placement selected' : 'placement');
      const label = modelDisplayLabel(
        sceneModelAliasIdV1(recipes, placement.model),
        recipes[placement.model]?.label ?? placement.model,
      );
      const name = element('button', 'placement-name');
      const turned = placement.turns ? ` · turn ${String(placement.turns)}` : '';
      name.textContent = `${label} · (${placement.at.join(', ')})${turned}`;
      name.title = `Model id: ${placement.model}`;
      name.addEventListener('click', () => {
        selectedLightId = null;
        onSelect(placement.id);
      });
      row.append(name);
      if (placement.id === selectedId) {
        const controls = element('div', 'placement-controls');
        controls.append(
          button('X−', 'Move left', () => { movePlacement(placement.id, -1, 0, 0); }),
          button('X+', 'Move right', () => { movePlacement(placement.id, 1, 0, 0); }),
          button('Z−', 'Move back', () => { movePlacement(placement.id, 0, 0, -1); }),
          button('Z+', 'Move front', () => { movePlacement(placement.id, 0, 0, 1); }),
          button('Y−', 'Lower', () => { movePlacement(placement.id, 0, -1, 0); }),
          button('Y+', 'Raise', () => { movePlacement(placement.id, 0, 1, 0); }),
          button('↻', 'Turn a quarter', () => {
            editPlacement(placement.id, (entry) => ({
              ...entry,
              turns: (((entry.turns ?? 0) + 1) % 4),
            }));
          }),
          button('Remove', 'Take out of the scene', () => {
            commitPlacements(next.placements.filter((entry) => entry.id !== placement.id));
          }),
        );
        row.append(controls);
      }
      list.append(row);
    }
    renderLights(next);
  }

  function clearLightSelection(): void {
    if (selectedLightId === null) return;
    selectedLightId = null;
    if (scene !== null) render(scene, selectedPlacementId);
  }

  return { element: pane, render, clearLightSelection };
}
