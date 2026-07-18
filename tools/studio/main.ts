import { createStudioCatalog } from './catalog.js';
import { mountStudio } from './studio-app.js';

/**
 * The engine's own studio page. It is the first caller of `mountStudio` and
 * has no privileges a game's studio lacks: it passes a catalog, and the
 * catalog it passes happens to hold the engine's test models.
 *
 * A game's page is this file with its own catalog. See
 * `docs/guides/model-studio.md`.
 */
mountStudio({ catalog: createStudioCatalog() });
