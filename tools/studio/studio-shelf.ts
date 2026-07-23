import type { PartInfoV1, PartSettingSpecV1 } from './part-definition.js';
import type { VoxelStudioHarnessV1 } from './harness.js';
import type { ModelStudioTabId } from './shared-ui/index.js';
import type { RecipeInfoV1 } from './studio-library.js';
import { element } from './studio-app-helpers.js';

/**
 * The library on the left: the game's whole palette to browse before building.
 * Three views share one search box — Models (the shelf, in the sections the
 * game named), Parts (every part with its settings and presets), and Recipes
 * (every reusable recipe with what it places). Opening a model or a shelf-backed
 * recipe goes through the harness; a part cannot be opened, so it expands to
 * show how to call it instead. Everything here reads the harness's own manifest,
 * so a game gets the same browser by declaring its parts and recipes.
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
  heading.append(tabs, search);

  const body = element('div', 'rail-body');

  function rebuild(): void {
    for (const [name, button] of viewButtons) button.classList.toggle('on', view === name);
    search.placeholder = view === 'models' ? 'Search models…'
      : view === 'parts' ? 'Search parts…'
        : view === 'recipes' ? 'Search recipes…' : 'Search scenes…';
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
    const currentId = harness.model().id;
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
        shown += 1;
      }
    }
    if (shown === 0) emptyNote('No models match.');
  }

  function renderParts(): void {
    const parts = harness.findParts(query);
    if (parts.length === 0) { emptyNote('No parts match.'); return; }
    for (const part of parts) body.appendChild(renderPart(part));
    emptyNote('Parts are the shapes recipes are built from. Expand one to see how to call it.');
  }

  function renderPart(part: PartInfoV1): HTMLElement {
    const key = `part:${part.name}`;
    const details = element('details', 'lib-item');
    details.open = expanded.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(key);
      else expanded.delete(key);
    });
    const summary = element('summary', 'lib-summary');
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
    details.append(detail);
    return details;
  }

  function renderRecipes(): void {
    const recipes = harness.findRecipes(query);
    if (recipes.length === 0) { emptyNote('No recipes match.'); return; }
    const shelfIds = new Set(harness.shelf().flatMap((section) => section.models.map((model) => model.id)));
    for (const recipe of recipes) body.appendChild(renderRecipe(recipe, shelfIds));
    emptyNote('Recipes are reusable arrangements a model can place. Any of these can be placed inside another.');
  }

  function renderRecipe(recipe: RecipeInfoV1, shelfIds: ReadonlySet<string>): HTMLElement {
    const key = `recipe:${recipe.id}`;
    const details = element('details', 'lib-item');
    details.open = expanded.has(key);
    details.addEventListener('toggle', () => {
      if (details.open) expanded.add(key);
      else expanded.delete(key);
    });
    const summary = element('summary', 'lib-summary');
    const title = element('span', 'lib-title');
    title.textContent = recipe.label;
    summary.append(title);
    for (const tag of recipe.tags) {
      const badge = element('span', 'lib-badge'); badge.textContent = tag; summary.append(badge);
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
    if (shelfIds.has(recipe.id)) {
      const open = element('button', 'lib-open');
      open.textContent = 'Open on the shelf';
      open.addEventListener('click', () => {
        harness.openFromShelf(recipe.id);
        showTab(harness.buildSteps().length > 0 ? 'build' : 'examine');
      });
      detail.append(open);
    }
    const usage = element('p', 'lib-code');
    usage.textContent = `use: { kind: 'recipe', recipe: '${recipe.id}', at: [x,y,z] }`;
    detail.append(usage);
    details.append(detail);
    return details;
  }

  function renderScenes(): void {
    const scenes = harness.scenes();
    const needle = query.trim().toLowerCase();
    let shown = 0;
    for (const scene of scenes) {
      if (needle !== ''
        && !`${scene.label} ${scene.id} ${scene.summary ?? ''}`.toLowerCase().includes(needle)) continue;
      const row = element('button', 'model-row');
      const label = element('span');
      label.textContent = scene.label;
      const count = element('span', 'scene-count');
      count.textContent = `${String(scene.models)} model${scene.models === 1 ? '' : 's'}`;
      row.append(label, count);
      if (scene.summary) row.title = scene.summary;
      row.addEventListener('click', () => { harness.openScene(scene.id); });
      body.appendChild(row);
      shown += 1;
    }
    if (shown === 0) { emptyNote('No scenes match.'); return; }
    emptyNote('A scene stands finished models together in one world. Open one to view it.');
  }

  function emptyNote(text: string): void {
    const note = element('p', 'railnote');
    note.textContent = text;
    body.appendChild(note);
  }

  return { heading, body, rebuild };
}
