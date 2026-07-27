import type { VoxelStudioHarnessV1 } from './harness.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import type { RecipeInfoV1 } from './studio-library.js';
import { element } from './studio-app-helpers.js';
import { createStudioContextMenu } from './studio-context-menu.js';
import { createStudioModelMenu } from './studio-model-menu.js';
import { createStudioSceneMenu } from './studio-scene-menu.js';
import { createStudioShelfOverflowButton } from './studio-shelf-overflow.js';
import { renderStudioShelfPart } from './studio-shelf-part.js';
import {
  createStudioShelfSorter,
  type StudioShelfSortableIdentityV1,
} from './studio-shelf-sortable.js';

/**
 * The library on the left: the game's whole palette to browse before building.
 * Four flat views share one search box — Models (in the sections the game
 * named), Parts, Recipes, and Scenes when supplied. Every row opens its stable
 * identity directly; descriptive metadata belongs to the right inspector.
 * Everything here reads the harness's own manifest, so a game gets the same
 * browser by declaring its parts and recipes.
 */

type LibraryView = 'models' | 'parts' | 'recipes' | 'scenes';

const VIEW_LABELS: Readonly<Record<LibraryView, string>> = {
  models: 'Models', parts: 'Parts', recipes: 'Recipes', scenes: 'Scenes',
};

export interface StudioShelfDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
  readonly showTab: (name: ModelStudioTabId) => void;
}

export interface StudioShelfV1 {
  readonly heading: HTMLElement;
  readonly body: HTMLElement;
  /** Rebuilds the current view and marks the open model. Called on refresh. */
  rebuild(): void;
  /** Removes any body-level scene menu or dialog and its temporary listeners. */
  dispose(): void;
}

export function createStudioShelf(deps: StudioShelfDepsV1): StudioShelfV1 {
  const { harness, showTab } = deps;

  let view: LibraryView = 'models';
  let query = '';

  // ---- heading: the view switcher and the search box ----
  const heading = element('div', 'rail-head');
  const tabs = element('div', 'lib-switch');
  const viewButtons = new Map<LibraryView, HTMLButtonElement>();
  // Scenes only appear when the game ships some, so a studio with none shows the
  // three lanes it had before rather than an empty tab.
  const views: readonly LibraryView[] = harness.scenes().length > 0
    ? ['models', 'parts', 'recipes', 'scenes']
    : ['models', 'parts', 'recipes'];
  tabs.classList.toggle('lib-switch-four', views.length === 4);
  for (const name of views) {
    const button = element('button');
    button.textContent = VIEW_LABELS[name];
    button.setAttribute('aria-pressed', String(view === name));
    button.addEventListener('click', () => {
      if (view === name) return;
      view = name;
      rebuild();
    });
    viewButtons.set(name, button);
    tabs.appendChild(button);
  }
  const search = element('input', 'lib-search');
  search.type = 'search';
  search.setAttribute('aria-label', 'Search the library');
  search.addEventListener('input', () => {
    query = search.value;
    rebuild();
  });
  const actionStatus = element('p', 'library-status');
  actionStatus.setAttribute('role', 'alert');
  actionStatus.hidden = true;
  heading.append(tabs, search, actionStatus);

  const body = element('div', 'rail-body');
  const clearActionStatus = (): void => {
    actionStatus.hidden = true;
    actionStatus.textContent = '';
    actionStatus.classList.remove('success');
  };
  const reportActionError = (message: string): void => {
    actionStatus.setAttribute('role', 'alert');
    actionStatus.classList.remove('success');
    actionStatus.textContent = message;
    actionStatus.hidden = false;
  };
  const reportActionSuccess = (message: string): void => {
    actionStatus.setAttribute('role', 'status');
    actionStatus.classList.add('success');
    actionStatus.textContent = message;
    actionStatus.hidden = false;
  };
  const focusLibraryItem = (
    kind: 'model' | 'part' | 'recipe' | 'scene',
    key: string | null,
    sectionIndex?: number,
  ): void => {
    queueMicrotask(() => {
      const items = Array.from(body.querySelectorAll<HTMLElement>('[data-library-kind]'));
      const target = key === null ? undefined : items.find(
        (item) => item.dataset.libraryKind === kind
          && item.dataset.libraryKey === key
          && (sectionIndex === undefined
            || item.dataset.librarySectionIndex === String(sectionIndex)),
      );
      (target ?? search).focus({ preventScroll: true });
    });
  };
  const focusScene = (id: string | null): void => { focusLibraryItem('scene', id); };
  const focusPart = (name: string): void => { focusLibraryItem('part', name); };
  const focusModel = (id: string): void => { focusLibraryItem('model', id); };
  const focusRecipe = (id: string): void => { focusLibraryItem('recipe', id); };
  const overflowButton = createStudioShelfOverflowButton;
  const contextMenu = createStudioContextMenu();
  const sorter = createStudioShelfSorter({
    order: (kind, sectionIndex) => harness.shelfOrder(kind, sectionIndex),
    move: (request) => harness.moveShelfItem(request),
    focus: focusLibraryItem,
    report: reportActionSuccess,
    reportError: reportActionError,
    closeMenu: () => { contextMenu.close(); },
    enabled: () => query.trim() === '',
  });
  const openModel = (id: string, tab: 'examine' | 'build' | 'automatic'): void => {
    clearActionStatus();
    harness.openFromShelf(id);
    const destination = tab === 'automatic'
      ? (harness.buildSteps().length > 0 ? 'build' : 'examine')
      : tab === 'build' && harness.buildSteps().length === 0
        ? 'examine'
        : tab;
    showTab(destination);
  };
  const modelMenu = createStudioModelMenu({
    openModel: (id, tab) => { openModel(id, tab); }, focusModel, reportError: reportActionError,
    renameModel: (id, label) => { harness.renameModel(id, label); },
    restoreModelName: (id) => { harness.restoreModelName(id); },
  }, contextMenu);
  const sceneMenu = createStudioSceneMenu({
    visibleSceneIds: () => Array.from(
      body.querySelectorAll<HTMLButtonElement>('[data-library-kind="scene"][data-scene-id]'),
      (row) => row.dataset.sceneId ?? '',
    ),
    sceneExists: (id) => harness.scenes().some((scene) => scene.id === id),
    renameScene: (id, label) => { harness.renameScene(id, label); },
    deleteScene: (id) => { harness.deleteScene(id); },
    rebuild: () => { rebuild(); },
    focusScene,
  }, contextMenu);

  function rebuild(): void {
    contextMenu.close();
    for (const [name, button] of viewButtons) {
      const active = view === name;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    }
    search.placeholder = view === 'models' ? 'Search models…'
      : view === 'parts' ? 'Search parts…'
        : view === 'recipes' ? 'Search recipes…' : 'Search scenes…';
    sorter.disconnectWithin(body);
    contextMenu.disconnectWithin(body);
    body.replaceChildren();
    if (view === 'models') renderModels();
    else if (view === 'parts') renderParts();
    else if (view === 'recipes') renderRecipes();
    else renderScenes();
  }
  function matchesModel(label: string, id: string): boolean {
    const needle = query.trim().toLowerCase();
    return needle === '' || label.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
  }

  function renderModels(): void {
    const currentId = harness.activeShelfModel();
    let shown = 0;
    for (const [sectionIndex, section] of harness.shelf().entries()) {
      const models = section.models.filter((entry) => matchesModel(entry.label, entry.id));
      if (models.length === 0) continue;
      const head = element('h3', 'section-head');
      head.textContent = section.name;
      body.appendChild(head);
      for (const entry of models) {
        const wrap = element('div', 'library-row-wrap');
        const row = element('button', 'model-row section-model-row');
        row.dataset.libraryKind = 'model';
        row.dataset.libraryKey = entry.id;
        row.dataset.librarySectionIndex = String(sectionIndex);
        row.classList.toggle('active', entry.id === currentId);
        if (entry.id === currentId) row.setAttribute('aria-current', 'true');
        const label = element('span');
        label.textContent = entry.label;
        row.appendChild(label);
        row.addEventListener('click', () => {
          try {
            openModel(entry.id, 'automatic');
            focusModel(entry.id);
          } catch (error) {
            reportActionError(
              `Opening “${entry.label}” failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        });
        const more = overflowButton('Model', entry.label);
        wrap.append(row, more);
        const sortable: StudioShelfSortableIdentityV1 = {
          kind: 'model', id: entry.id, label: entry.label, sectionIndex,
        };
        modelMenu.connect(row, entry, more, sorter.actions(sortable));
        sorter.connect({ ...sortable, container: wrap, trigger: row });
        body.appendChild(wrap);
        shown += 1;
      }
    }
    if (shown === 0) emptyNote('No models match.');
    else emptyNote(query.trim() === ''
      ? 'Drag to rearrange models within their section. Use ⋯ / right-click / Shift+F10 for all actions.'
      : 'Clear search to rearrange models. Open a model directly or use its actions menu.');
  }

  function renderParts(): void {
    const parts = harness.findParts(query);
    if (parts.length === 0) { emptyNote('No parts match.'); return; }
    for (const part of parts) {
      const sortable: StudioShelfSortableIdentityV1 = {
        kind: 'part', id: part.name, label: part.title,
      };
      const entry = renderStudioShelfPart(part, {
        harness,
        contextMenu,
        showExamine: () => { showTab('examine'); },
        clearActionStatus,
        reportActionError,
        focusPart,
        orderActions: sorter.actions(sortable),
      });
      sorter.connect({ ...sortable, container: entry.element, trigger: entry.trigger });
      body.appendChild(entry.element);
    }
    emptyNote(query.trim() === ''
      ? 'Click to render defaults; drag to rearrange. Shift+F10 opens presets and move commands.'
      : 'Clear search to rearrange parts. Click to render defaults or open the actions menu for presets.');
  }

  function renderRecipes(): void {
    const recipes = harness.findRecipes(query);
    if (recipes.length === 0) { emptyNote('No recipes match.'); return; }
    for (const recipe of recipes) body.appendChild(renderRecipeEntry(recipe));
    emptyNote(query.trim() === ''
      ? 'Click to render a recipe; drag to rearrange. Shift+F10 opens move commands.'
      : 'Clear search to rearrange recipes. Click a recipe to render it.');
  }

  function renderRecipeEntry(recipe: RecipeInfoV1): HTMLElement {
    const active = harness.activeRecipe() === recipe.id;
    const sortable: StudioShelfSortableIdentityV1 = {
      kind: 'recipe', id: recipe.id, label: recipe.label,
    };
    const wrap = element('div', 'library-row-wrap');
    const row = element('button', 'model-row');
    row.type = 'button';
    row.dataset.libraryKind = 'recipe';
    row.dataset.libraryKey = recipe.id;
    row.classList.toggle('active', active);
    if (active) row.setAttribute('aria-current', 'true');
    const title = element('span');
    title.textContent = recipe.label;
    row.append(title);
    row.title = `Render ${recipe.label} from the current recipe book`;
    const renderRecipe = (): void => {
      clearActionStatus();
      try {
        harness.openRecipe(recipe.id);
        showTab('examine');
        focusRecipe(recipe.id);
      } catch (error) {
        reportActionError(
          `Rendering recipe “${recipe.label}” with key '${recipe.id}' failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        focusRecipe(recipe.id);
      }
    };
    row.addEventListener('click', renderRecipe);
    const orderActions = sorter.actions(sortable);
    wrap.append(row);
    if (orderActions.length > 0) {
      const more = overflowButton('Recipe', recipe.label);
      contextMenu.connect(row, {
        ariaLabel: `Recipe actions for ${recipe.label}`,
        restoreFocus: () => { focusRecipe(recipe.id); },
        actions: orderActions,
      }, more);
      wrap.append(more);
    }
    sorter.connect({ ...sortable, container: wrap, trigger: row });
    return wrap;
  }

  function renderScenes(): void {
    const scenes = harness.scenes();
    const needle = query.trim().toLowerCase();
    let shown = 0;
    for (const scene of scenes) {
      if (needle !== ''
        && !`${scene.label} ${scene.id} ${scene.summary ?? ''}`.toLowerCase().includes(needle)) continue;
      const wrap = element('div', 'library-row-wrap');
      const row = element('button', 'model-row');
      row.dataset.libraryKind = 'scene';
      row.dataset.libraryKey = scene.id;
      row.classList.toggle('active', harness.sceneState()?.id === scene.id);
      if (harness.sceneState()?.id === scene.id) row.setAttribute('aria-current', 'true');
      const label = element('span');
      label.textContent = scene.label;
      row.append(label);
      row.addEventListener('click', () => {
        clearActionStatus();
        try {
          harness.openScene(scene.id);
          focusScene(scene.id);
        } catch (error) {
          reportActionError(
            `Opening scene “${scene.label}” failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
      const more = overflowButton('Scene', scene.label);
      wrap.append(row, more);
      const sortable: StudioShelfSortableIdentityV1 = {
        kind: 'scene', id: scene.id, label: scene.label,
      };
      sceneMenu.connect(row, scene, more, sorter.actions(sortable));
      sorter.connect({ ...sortable, container: wrap, trigger: row });
      body.appendChild(wrap);
      shown += 1;
    }
    if (shown === 0) {
      emptyNote(scenes.length === 0 && needle === ''
        ? 'No scenes remain in this Studio session.'
        : 'No scenes match.');
      return;
    }
    emptyNote(query.trim() === ''
      ? 'Drag to rearrange scenes. Use ⋯ / right-click / Shift+F10 to move, rename, or delete.'
      : 'Clear search to rearrange scenes. Open one directly or use its actions menu.');
  }

  function emptyNote(text: string): void {
    const note = element('p', 'railnote');
    note.textContent = text;
    body.appendChild(note);
  }
  return { heading, body, rebuild, dispose: () => {
    sorter.dispose(); modelMenu.dispose(); sceneMenu.dispose(); contextMenu.dispose(); } };
}
