import type { PartInfoV1, PartSettingSpecV1 } from './part-definition.js';
import type { VoxelStudioHarnessV1 } from './harness.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import type { RecipeInfoV1 } from './studio-library.js';
import { element } from './studio-app-helpers.js';
import { createStudioContextMenu } from './studio-context-menu.js';
import { createStudioModelMenu } from './studio-model-menu.js';
import { createStudioSceneMenu } from './studio-scene-menu.js';

/**
 * The library on the left: the game's whole palette to browse before building.
 * Three views share one search box — Models (the shelf, in the sections the
 * game named), Parts (every part with its settings and presets), and Recipes
 * (every reusable recipe with what it places). Opening a model or a shelf-backed
 * recipe goes through the harness; a part renders its declared defaults with a
 * neutral preview skin and also expands to show how to call it. Everything here
 * reads the harness's own manifest, so a game gets the same browser by declaring
 * its parts and recipes.
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

/** A setting spec in one readable line: what it is, its bounds, its default. */
function describeSetting(spec: PartSettingSpecV1): string {
  const bounds = spec.kind === 'int' || spec.kind === 'count'
    ? ` ${String(spec.min ?? (spec.kind === 'int' ? 1 : 0))}–${String(spec.max ?? 64)}`
    : '';
  return `${spec.label} — ${spec.kind}${bounds} · default ${String(spec.default)}`;
}

export function createStudioShelf(deps: StudioShelfDepsV1): StudioShelfV1 {
  const { harness, showTab } = deps;

  let view: LibraryView = 'models';
  let query = '';
  const folded = new Set<string>();
  const expanded = new Set<string>();

  // ---- heading: the view switcher and the search box ----
  const heading = element('div', 'rail-head');
  const tabs = element('div', 'lib-switch');
  const viewButtons = new Map<LibraryView, HTMLButtonElement>();
  // Scenes only appear when the game ships some, so a studio with none shows the
  // three lanes it had before rather than an empty tab.
  const views: readonly LibraryView[] = harness.scenes().length > 0
    ? ['models', 'parts', 'recipes', 'scenes']
    : ['models', 'parts', 'recipes'];
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
  };
  const reportActionError = (message: string): void => {
    actionStatus.textContent = message;
    actionStatus.hidden = false;
  };
  const focusLibraryItem = (
    kind: 'model' | 'part' | 'recipe' | 'scene',
    key: string | null,
  ): void => {
    queueMicrotask(() => {
      const items = Array.from(body.querySelectorAll<HTMLElement>('[data-library-kind]'));
      const target = key === null ? undefined : items.find(
        (item) => item.dataset.libraryKind === kind && item.dataset.libraryKey === key,
      );
      (target ?? search).focus({ preventScroll: true });
    });
  };
  const focusScene = (id: string | null): void => { focusLibraryItem('scene', id); };
  const focusPart = (name: string): void => { focusLibraryItem('part', name); };
  const focusModel = (id: string): void => { focusLibraryItem('model', id); };
  const focusRecipe = (id: string): void => { focusLibraryItem('recipe', id); };
  const overflowButton = (kind: string, label: string): HTMLButtonElement => {
    const button = element('button', 'library-more');
    button.type = 'button';
    button.textContent = '⋯';
    button.title = `${kind} actions`;
    button.setAttribute('aria-label', `${kind} actions for ${label}`);
    return button;
  };
  const contextMenu = createStudioContextMenu();
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
    for (const section of harness.shelf()) {
      const models = section.models.filter((entry) => matchesModel(entry.label, entry.id));
      if (models.length === 0) continue;
      const isFolded = folded.has(section.name) && query.trim() === '';
      const head = element('button', 'section-head');
      head.textContent = `${isFolded ? '▸' : '▾'} ${section.name}`;
      head.setAttribute('aria-expanded', String(!isFolded));
      head.addEventListener('click', () => {
        if (folded.has(section.name)) folded.delete(section.name);
        else folded.add(section.name);
        rebuild();
      });
      body.appendChild(head);
      if (isFolded) { shown += models.length; continue; }
      for (const entry of models) {
        const wrap = element('div', 'library-row-wrap');
        const row = element('button', 'model-row');
        row.dataset.libraryKind = 'model';
        row.dataset.libraryKey = entry.id;
        row.classList.toggle('active', entry.id === currentId);
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
        modelMenu.connect(row, entry, more);
        wrap.append(row, more);
        body.appendChild(wrap);
        shown += 1;
      }
    }
    if (shown === 0) emptyNote('No models match.');
    else emptyNote('Open a model directly, or use ⋯ / right-click / Shift+F10 for more actions.');
  }

  function renderParts(): void {
    const parts = harness.findParts(query);
    if (parts.length === 0) { emptyNote('No parts match.'); return; }
    for (const part of parts) body.appendChild(renderPart(part));
    emptyNote('Click for defaults; use ⋯ / right-click / Shift+F10 to render a named preset.');
  }

  function renderPart(part: PartInfoV1): HTMLElement {
    const key = `part:${part.name}`;
    const active = harness.activePart() === part.name;
    const activePreset = active ? harness.activePartPreset() : null;
    const wrap = element('div', 'lib-item-wrap');
    const details = element('details', 'lib-item');
    details.classList.toggle('active', active);
    details.open = expanded.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(key);
      else expanded.delete(key);
    });
    const summary = element('summary', 'lib-summary');
    summary.dataset.partName = part.name;
    summary.dataset.libraryKind = 'part';
    summary.dataset.libraryKey = part.name;
    summary.title = part.selfDescribed
      ? `Render ${part.title} using its declared defaults`
      : `Render ${part.title} using empty settings`;
    if (active) summary.setAttribute('aria-current', 'true');
    const title = element('span', 'lib-title');
    title.textContent = part.title;
    summary.append(title);
    if (part.category) {
      const badge = element('span', 'lib-badge');
      badge.textContent = part.category;
      summary.append(badge);
    }
    if (!part.selfDescribed) {
      const badge = element('span', 'lib-badge lib-bare');
      badge.textContent = 'undescribed';
      badge.title = 'A bare function with no published schema. Promote it to a definition to describe it.';
      summary.append(badge);
    }
    if (active && activePreset !== null) {
      const badge = element('span', 'lib-badge lib-active-variant');
      badge.textContent = activePreset;
      badge.title = `Rendering the ${activePreset} preset`;
      summary.append(badge);
    }
    details.append(summary);
    const detail = element('div', 'lib-detail');
    if (part.summary) { const p = element('p', 'lib-text'); p.textContent = part.summary; detail.append(p); }
    if (part.settings.length > 0) {
      const head = element('p', 'lib-subhead'); head.textContent = 'Settings'; detail.append(head);
      const list = element('ul', 'lib-list');
      for (const spec of part.settings) {
        const item = element('li'); item.textContent = describeSetting(spec);
        if (spec.summary) item.title = spec.summary;
        list.append(item);
      }
      detail.append(list);
    }
    if (part.presets.length > 0) {
      const head = element('p', 'lib-subhead'); head.textContent = 'Presets'; detail.append(head);
      const list = element('ul', 'lib-list');
      for (const preset of part.presets) {
        const item = element('li');
        item.textContent = preset.summary ? `${preset.name} — ${preset.summary}` : preset.name;
        list.append(item);
      }
      detail.append(list);
    }
    const usage = element('p', 'lib-code');
    usage.textContent = `use: { kind: 'part', part: '${part.name}', at: [x,y,z], settings: {…} }`;
    detail.append(usage);
    const actionError = element('p', 'lib-error');
    actionError.hidden = true;
    actionError.setAttribute('role', 'alert');
    detail.append(actionError);
    details.append(detail);
    const renderVariant = (preset: string | null): void => {
      actionError.hidden = true;
      actionError.textContent = '';
      clearActionStatus();
      try {
        harness.openPart(part.name, preset === null ? undefined : { preset });
        showTab('examine');
        focusPart(part.name);
      } catch (error) {
        expanded.add(key);
        details.open = true;
        actionError.textContent = `Could not render ${part.title}${
          preset === null ? '' : ` with the “${preset}” preset`
        }: ${error instanceof Error ? error.message : String(error)}`;
        actionError.hidden = false;
        focusPart(part.name);
      }
    };
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const nextOpen = !details.open;
      if (nextOpen) expanded.add(key);
      else expanded.delete(key);
      details.open = nextOpen;
      actionError.hidden = true;
      actionError.textContent = '';

      if (active && activePreset === null) {
        showTab('examine');
        return;
      }
      renderVariant(null);
    });
    const more = overflowButton('Part', part.title);
    contextMenu.connect(summary, {
      ariaLabel: `Part actions for ${part.title}`,
      restoreFocus: () => { focusPart(part.name); },
      actions: [
        { label: 'Render defaults', run: () => { renderVariant(null); } },
        ...part.presets.map((preset) => ({
          label: `Render “${preset.name}”`,
          run: () => { renderVariant(preset.name); },
        })),
      ],
    }, more);
    wrap.append(details, more);
    return wrap;
  }

  function renderRecipes(): void {
    const recipes = harness.findRecipes(query);
    if (recipes.length === 0) { emptyNote('No recipes match.'); return; }
    const shelfIds = new Set(harness.shelf().flatMap((section) => section.models.map((model) => model.id)));
    for (const recipe of recipes) body.appendChild(renderRecipeEntry(recipe, shelfIds));
    emptyNote('Render the current recipe, or open its shelf model when one exists. More actions: ⋯ / right-click / Shift+F10.');
  }

  function renderRecipeEntry(recipe: RecipeInfoV1, shelfIds: ReadonlySet<string>): HTMLElement {
    const key = `recipe:${recipe.id}`;
    const fresh = harness.activeRecipe() === recipe.id;
    const shelf = harness.activeShelfModel() === recipe.recipeId;
    const active = fresh || shelf;
    const wrap = element('div', 'lib-item-wrap');
    const details = element('details', 'lib-item');
    details.classList.toggle('active', active);
    details.open = expanded.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(key);
      else expanded.delete(key);
    });
    const summary = element('summary', 'lib-summary');
    summary.dataset.libraryKind = 'recipe';
    summary.dataset.libraryKey = recipe.id;
    if (active) summary.setAttribute('aria-current', 'true');
    const title = element('span', 'lib-title');
    title.textContent = recipe.label;
    summary.append(title);
    for (const tag of recipe.tags) {
      const badge = element('span', 'lib-badge'); badge.textContent = tag; summary.append(badge);
    }
    if (active) {
      const badge = element('span', 'lib-badge lib-active-variant');
      badge.textContent = fresh ? 'fresh build' : 'shelf model';
      summary.append(badge);
    }
    details.append(summary);
    const detail = element('div', 'lib-detail');
    if (recipe.summary) { const p = element('p', 'lib-text'); p.textContent = recipe.summary; detail.append(p); }
    const facts = element('p', 'lib-facts');
    facts.textContent = `${recipe.size.join('×')} grid · ${String(recipe.voxelSize)} units/voxel`;
    detail.append(facts);
    if (recipe.parts.length > 0) {
      const p = element('p', 'lib-text'); p.textContent = `Places parts: ${recipe.parts.join(', ')}`; detail.append(p);
    }
    if (recipe.recipes.length > 0) {
      const p = element('p', 'lib-text'); p.textContent = `Places recipes: ${recipe.recipes.join(', ')}`; detail.append(p);
    }
    const actionError = element('p', 'lib-error');
    actionError.hidden = true;
    actionError.setAttribute('role', 'alert');
    const runRecipeAction = (source: 'fresh' | 'shelf'): void => {
      actionError.hidden = true;
      actionError.textContent = '';
      clearActionStatus();
      try {
        if (source === 'fresh') harness.openRecipe(recipe.id);
        else harness.openFromShelf(recipe.recipeId);
        showTab(harness.buildSteps().length > 0 ? 'build' : 'examine');
        focusRecipe(recipe.id);
      } catch (error) {
        expanded.add(key);
        details.open = true;
        actionError.textContent = `${source === 'fresh' ? 'Rendering the current recipe' : 'Opening the shelf model'} `
          + `for ${recipe.label} failed: ${error instanceof Error ? error.message : String(error)}`;
        actionError.hidden = false;
        focusRecipe(recipe.id);
      }
    };
    const actions = element('div', 'lib-actions-row');
    const render = element('button', 'lib-open');
    render.textContent = 'Render current recipe';
    render.addEventListener('click', () => { runRecipeAction('fresh'); });
    actions.append(render);
    if (shelfIds.has(recipe.recipeId)) {
      const open = element('button', 'lib-open');
      open.textContent = 'Open shelf model';
      open.addEventListener('click', () => { runRecipeAction('shelf'); });
      actions.append(open);
    }
    detail.append(actions, actionError);
    const usage = element('p', 'lib-code');
    usage.textContent = `use: { kind: 'recipe', recipe: '${recipe.id}', at: [x,y,z] }`;
    detail.append(usage);
    details.append(detail);
    const more = overflowButton('Recipe', recipe.label);
    contextMenu.connect(summary, {
      ariaLabel: `Recipe actions for ${recipe.label}`,
      restoreFocus: () => { focusRecipe(recipe.id); },
      actions: [
        { label: 'Render current recipe', run: () => { runRecipeAction('fresh'); } },
        ...(shelfIds.has(recipe.recipeId) ? [{
          label: 'Open shelf model',
          run: () => { runRecipeAction('shelf'); },
        }] : []),
      ],
    }, more);
    wrap.append(details, more);
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
      const label = element('span');
      label.textContent = scene.label;
      const count = element('span', 'scene-count');
      count.textContent = `${String(scene.models)} model${scene.models === 1 ? '' : 's'}`;
      row.append(label, count);
      if (scene.summary) row.title = scene.summary;
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
      sceneMenu.connect(row, scene, more);
      wrap.append(row, more);
      body.appendChild(wrap);
      shown += 1;
    }
    if (shown === 0) {
      emptyNote(scenes.length === 0 && needle === ''
        ? 'No scenes remain in this Studio session.'
        : 'No scenes match.');
      return;
    }
    emptyNote('Open a scene directly, or use ⋯ / right-click / Shift+F10 to rename or delete it.');
  }

  function emptyNote(text: string): void {
    const note = element('p', 'railnote');
    note.textContent = text;
    body.appendChild(note);
  }
  return { heading, body, rebuild, dispose: () => {
    modelMenu.dispose(); sceneMenu.dispose(); contextMenu.dispose(); } };
}
