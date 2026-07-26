import {
  CONTRAST_DOMAINS,
  CURATED_CONTRAST_RECIPES,
  type ContrastDomainV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import { VOXEL_SCENE_SCHEMA_V1, type SceneV1 } from './scene.js';

const CELL_SPACING = 22;
const DISPLAY_GRAIN = 0.65;

const DOMAIN_PRESENTATION: Readonly<
Record<ContrastDomainV1, {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
}>
> = {
  infrastructure: {
    id: 'studio:scene:contrast-infrastructure',
    label: 'Working watershed',
    summary: 'Aqueducts, flood controls, crossings, transit structures, and survey landmarks share '
      + 'one compact waterworks field, contrasting voids, spans, stairs, frames, wheels, and hybrids.',
  },
  'civic-architectural': {
    id: 'studio:scene:contrast-civic',
    label: 'Civic forms plaza',
    summary: 'Monuments, arcades, forums, conservatories, pavilions, and kinetic public art form '
      + 'a plaza of deliberately different scales, silhouettes, openings, and construction grammars.',
  },
  'mechanical-industrial': {
    id: 'studio:scene:contrast-machines',
    label: 'Machine works',
    summary: 'Kilns, stacks, hoppers, gantries, gears, drums, and moving flywheels make a working '
      + 'yard whose animated models all obey the scene-wide persisted animation control.',
  },
  'natural-organic': {
    id: 'studio:scene:contrast-organic',
    label: 'Living edge',
    summary: 'Seed-shaped trees, roots, coral, tidal structures, and field shelters occupy one '
      + 'living boundary; the wind-driven pine makes the shared scene-animation control useful here too.',
  },
};

function placementId(entry: CuratedContrastRecipeV1): string {
  return entry.recipe.id.slice('studio:contrast:'.length);
}

function domainScene(
  domain: ContrastDomainV1,
  entries: readonly CuratedContrastRecipeV1[],
): SceneV1 {
  const presentation = DOMAIN_PRESENTATION[domain];
  const columns = Math.ceil(Math.sqrt(entries.length));
  const rows = Math.ceil(entries.length / columns);
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: presentation.id,
    label: presentation.label,
    summary: presentation.summary,
    placements: entries.map((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: placementId(entry),
        model: entry.recipe.id,
        at: [
          (column - (columns - 1) / 2) * CELL_SPACING,
          0,
          (row - (rows - 1) / 2) * CELL_SPACING,
        ],
        turns: index % 4,
        grain: DISPLAY_GRAIN,
      };
    }),
  };
}

/**
 * Four domain scenes give every promoted contrast recipe a context without
 * merging it into a new model. Three contain semantic whole-model motion, so
 * the persisted animation control proves useful beyond the lighting showcase.
 */
export function createContrastScenes(): readonly SceneV1[] {
  return CONTRAST_DOMAINS.map((domain) => domainScene(
    domain,
    CURATED_CONTRAST_RECIPES.filter((entry) => entry.domain === domain),
  ));
}
