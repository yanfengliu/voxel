import type { VoxelStudioHarnessV1 } from './harness.js';
import type { PartInfoV1, PartSettingSpecV1 } from './part-definition.js';
import type { SceneV1 } from './scene.js';
import type { RecipeInfoV1 } from './studio-library.js';
import { element } from './studio-app-helpers.js';

export interface StudioLibraryDetailsV1 {
  readonly element: HTMLElement;
  /** Rebuilds the details for the currently rendered library source. */
  refresh(): void;
}

function addFact(list: HTMLDListElement, label: string, value: string): void {
  const term = element('dt');
  term.textContent = label;
  const detail = element('dd');
  detail.textContent = value;
  list.append(term, detail);
}

function settingDetail(spec: PartSettingSpecV1): string {
  const bounds = spec.kind === 'int' || spec.kind === 'count'
    ? `${String(spec.min ?? (spec.kind === 'int' ? 1 : 0))}–${String(spec.max ?? 64)}`
    : null;
  return [
    spec.key,
    spec.kind,
    bounds,
    `default ${String(spec.default)}`,
  ].filter((value): value is string => value !== null).join(' · ');
}

function appendUsage(root: HTMLElement, text: string): void {
  const heading = element('h4', 'grouphead');
  heading.textContent = 'Usage';
  const code = element('code', 'library-detail-code');
  code.textContent = text;
  root.append(heading, code);
}

function appendPartDetails(
  root: HTMLElement,
  part: PartInfoV1,
  activePreset: string | null,
): void {
  const kind = element('p', 'grouphead');
  kind.textContent = 'Library source';
  const title = element('h3', 'library-detail-title');
  title.textContent = 'Part details';
  const summary = element('p', 'library-detail-summary');
  summary.textContent = part.summary || 'This bare part does not publish a description or settings schema.';
  const facts = element('dl', 'library-detail-facts');
  addFact(facts, 'Name', part.title);
  addFact(facts, 'Part key', part.name);
  if (part.category) addFact(facts, 'Category', part.category);
  if (part.tags.length > 0) addFact(facts, 'Tags', part.tags.join(', '));
  addFact(facts, 'Definition', part.selfDescribed ? 'Self-described' : 'Bare function');
  addFact(facts, 'Rendered preset', activePreset ?? 'Defaults');
  root.append(kind, title, summary, facts);

  if (part.settings.length > 0) {
    const settingsHeading = element('h4', 'grouphead');
    settingsHeading.textContent = 'Settings';
    const settings = element('ul', 'library-detail-list');
    for (const spec of part.settings) {
      const item = element('li');
      const name = element('strong');
      name.textContent = spec.label;
      const detail = element('span', 'library-detail-meta');
      detail.textContent = settingDetail(spec);
      item.append(name, detail);
      if (spec.summary) {
        const explanation = element('span', 'library-detail-description');
        explanation.textContent = spec.summary;
        item.append(explanation);
      }
      settings.append(item);
    }
    root.append(settingsHeading, settings);
  }

  if (part.presets.length > 0) {
    const presetsHeading = element('h4', 'grouphead');
    presetsHeading.textContent = 'Presets';
    const presets = element('ul', 'library-detail-list');
    for (const preset of part.presets) {
      const item = element('li');
      item.classList.toggle('active', preset.name === activePreset);
      const name = element('strong');
      name.textContent = preset.name;
      item.append(name);
      if (preset.summary) {
        const explanation = element('span', 'library-detail-description');
        explanation.textContent = preset.summary;
        item.append(explanation);
      }
      presets.append(item);
    }
    root.append(presetsHeading, presets);
  }

  appendUsage(root, `use: { kind: 'part', part: '${part.name}', at: [x,y,z], settings: {…} }`);
}

function appendRecipeDetails(root: HTMLElement, recipe: RecipeInfoV1): void {
  const kind = element('p', 'grouphead');
  kind.textContent = 'Library source';
  const title = element('h3', 'library-detail-title');
  title.textContent = 'Recipe details';
  const summary = element('p', 'library-detail-summary');
  summary.textContent = recipe.summary ?? 'This recipe does not publish a summary.';
  const facts = element('dl', 'library-detail-facts');
  addFact(facts, 'Name', recipe.label);
  addFact(facts, 'Recipe key', recipe.id);
  if (recipe.recipeId !== recipe.id) addFact(facts, 'Built model ID', recipe.recipeId);
  addFact(facts, 'Grid', recipe.size.join('×'));
  addFact(facts, 'Voxel size', `${String(recipe.voxelSize)} world units`);
  if (recipe.tags.length > 0) addFact(facts, 'Tags', recipe.tags.join(', '));
  addFact(facts, 'Rendered source', 'Current recipe book');
  root.append(kind, title, summary, facts);

  if (recipe.parts.length > 0) {
    const partsHeading = element('h4', 'grouphead');
    partsHeading.textContent = 'Direct parts';
    const parts = element('p', 'library-detail-summary');
    parts.textContent = recipe.parts.join(', ');
    root.append(partsHeading, parts);
  }
  if (recipe.recipes.length > 0) {
    const recipesHeading = element('h4', 'grouphead');
    recipesHeading.textContent = 'Direct recipes';
    const recipes = element('p', 'library-detail-summary');
    recipes.textContent = recipe.recipes.join(', ');
    root.append(recipesHeading, recipes);
  }

  appendUsage(root, `use: { kind: 'recipe', recipe: '${recipe.id}', at: [x,y,z] }`);
}

function appendSceneDetails(
  root: HTMLElement,
  scene: SceneV1,
  lightingOn: boolean,
  animationOn: boolean,
  hasMotion: boolean,
): void {
  const kind = element('p', 'grouphead');
  kind.textContent = 'Library source';
  const title = element('h3', 'library-detail-title');
  title.textContent = 'Scene details';
  const facts = element('dl', 'library-detail-facts');
  const lights = scene.lights?.length ?? 0;
  const movingLights = scene.lights
    ?.filter((light) => 'motion' in light && light.motion !== undefined).length ?? 0;
  addFact(facts, 'Name', scene.label);
  addFact(facts, 'Scene ID', scene.id);
  addFact(facts, 'Models', String(scene.placements.length));
  addFact(facts, 'Lights', movingLights === 0
    ? String(lights)
    : `${String(lights)} · ${String(movingLights)} moving source${movingLights === 1 ? '' : 's'}`);
  if (lights > 0) {
    addFact(
      facts,
      'Lighting',
      lightingOn ? 'On · sources illuminate models' : 'Off · source handles only',
    );
  }
  if (hasMotion) {
    addFact(
      facts,
      'Animation',
      animationOn
        ? 'Enabled · Play controls scene motion'
        : 'Disabled · scene held at its current time',
    );
  }
  if (scene.schemaVersion === 'studio.scene/4') {
    addFact(
      facts,
      'Replay',
      `${scene.poseReplay.id} · ${(scene.poseReplay.durationMs / 1_000).toFixed(2)} s · consumer supplied`,
    );
    addFact(
      facts,
      'Editing',
      'Read-only · change and regenerate the consumer replay at its source',
    );
  }
  addFact(facts, 'Schema', scene.schemaVersion);
  root.append(kind, title, facts);
}

/** Details follow the rendered source; the left rail owns selection only. */
export function createStudioLibraryDetails(
  harness: VoxelStudioHarnessV1,
): StudioLibraryDetailsV1 {
  const root = element('section', 'library-detail');
  root.setAttribute('aria-label', 'Library item details');
  root.hidden = true;

  function refresh(): void {
    const activePart = harness.activePart();
    const activeRecipe = harness.activeRecipe();
    root.replaceChildren();
    delete root.dataset.libraryDetailKind;
    delete root.dataset.libraryDetailKey;

    const scene = harness.sceneState();
    if (scene !== null) {
      root.hidden = false;
      root.dataset.libraryDetailKind = 'scene';
      root.dataset.libraryDetailKey = scene.id;
      appendSceneDetails(
        root,
        scene,
        harness.lit(),
        harness.sceneAnimation(),
        harness.sceneHasMotion(),
      );
      return;
    }

    if (activePart !== null) {
      const part = harness.availableParts().find((entry) => entry.name === activePart);
      root.hidden = false;
      root.dataset.libraryDetailKind = 'part';
      root.dataset.libraryDetailKey = activePart;
      if (part) {
        appendPartDetails(root, part, harness.activePartPreset());
      } else {
        root.textContent = `Details are unavailable because the rendered part '${activePart}' is no longer in this Studio.`;
      }
      return;
    }

    if (activeRecipe !== null) {
      const recipe = harness.availableRecipes().find((entry) => entry.id === activeRecipe);
      root.hidden = false;
      root.dataset.libraryDetailKind = 'recipe';
      root.dataset.libraryDetailKey = activeRecipe;
      if (recipe) {
        appendRecipeDetails(root, recipe);
      } else {
        root.textContent = `Details are unavailable because the rendered recipe '${activeRecipe}' is no longer in this Studio.`;
      }
      return;
    }

    root.hidden = true;
  }

  refresh();
  return { element: root, refresh };
}
