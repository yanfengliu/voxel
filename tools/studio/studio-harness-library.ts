import type { PartInfoV1 } from './part-definition.js';
import type { ModelLabelSectionV1 } from './model-label-workspace.js';
import type { SceneV1 } from './scene.js';
import type { RecipeInfoV1 } from './studio-library.js';
import {
  prepareStudioShelfMoveV1,
  projectStudioShelfOrderV1,
  type StudioShelfItemKindV1,
  type StudioShelfMoveV1,
} from './studio-shelf-order.js';

/** A scene reduced to what browsing needs, before it is opened. */
export interface SceneInfoV1 {
  readonly id: string;
  readonly label: string;
  readonly summary?: string;
  /** How many model placements the scene holds. */
  readonly models: number;
}

export interface StudioHarnessLibraryHostV1 {
  readonly modelSections: () => readonly ModelLabelSectionV1[];
  readonly parts: () => readonly PartInfoV1[];
  readonly recipes: () => readonly RecipeInfoV1[];
  readonly scenes: () => readonly SceneV1[];
  readonly order: (
    kind: StudioShelfItemKindV1,
    ids: readonly string[],
    sectionIndex?: number,
  ) => readonly string[];
  readonly move: (request: StudioShelfMoveV1, ids: readonly string[]) => readonly string[];
}

export interface StudioHarnessLibraryV1 {
  readonly shelf: () => readonly ModelLabelSectionV1[];
  readonly parts: () => readonly PartInfoV1[];
  readonly recipes: () => readonly RecipeInfoV1[];
  readonly scenes: () => readonly SceneInfoV1[];
  readonly order: (kind: StudioShelfItemKindV1, sectionIndex?: number) => readonly string[];
  readonly move: (request: StudioShelfMoveV1) => readonly string[];
}

/** Applies mount-local display order while every catalog object and stable ID stays untouched. */
export function createStudioHarnessLibrary(
  host: StudioHarnessLibraryHostV1,
): StudioHarnessLibraryV1 {
  const modelSection = (sectionIndex?: number): ModelLabelSectionV1 => {
    const sections = host.modelSections();
    if (!Number.isInteger(sectionIndex) || (sectionIndex ?? -1) < 0 || sectionIndex! >= sections.length) {
      const range = sections.length === 0 ? 'the shelf has no model sections' : `choose 0–${String(sections.length - 1)}`;
      throw new Error(
        `Model sectionIndex '${String(sectionIndex)}' does not identify a section in shelf(); ${range}.`,
      );
    }
    return sections[sectionIndex!]!;
  };
  const modelIds = (sectionIndex?: number): readonly string[] => {
    const section = modelSection(sectionIndex);
    const counts = new Map<string, number>();
    for (const candidate of host.modelSections()) {
      for (const model of candidate.models) {
        counts.set(model.id, (counts.get(model.id) ?? 0) + 1);
      }
    }
    for (const model of section.models) {
      const count = counts.get(model.id) ?? 0;
      if (count > 1) {
        throw new Error(
          `Model id '${model.id}' appears ${String(count)} times on this Studio's shelf, `
          + 'so its section cannot be rearranged; give every shelf model a unique id.',
        );
      }
    }
    return section.models.map((model) => model.id);
  };
  const ids = (kind: StudioShelfItemKindV1, sectionIndex?: number): readonly string[] => {
    if (kind === 'model') return modelIds(sectionIndex);
    if (kind === 'part') return host.parts().map((part) => part.name);
    if (kind === 'recipe') return host.recipes().map((recipe) => recipe.id);
    return host.scenes().map((scene) => scene.id);
  };
  const ordered = <T>(
    kind: StudioShelfItemKindV1,
    records: readonly T[],
    idOf: (record: T) => string,
    sectionIndex?: number,
  ): readonly T[] => projectStudioShelfOrderV1(
    records,
    host.order(kind, records.map(idOf), sectionIndex),
    idOf,
  );

  return {
    shelf: () => host.modelSections().map((section, sectionIndex) => ({
      ...section,
      models: ordered('model', section.models, (model) => model.id, sectionIndex),
    })),
    parts: () => ordered('part', host.parts(), (part) => part.name),
    recipes: () => ordered('recipe', host.recipes(), (recipe) => recipe.id),
    scenes: () => ordered('scene', host.scenes(), (scene) => scene.id).map((scene) => ({
      id: scene.id,
      label: scene.label,
      ...(scene.summary === undefined ? {} : { summary: scene.summary }),
      models: scene.placements.length,
    })),
    order: (kind, sectionIndex) => host.order(kind, ids(kind, sectionIndex), sectionIndex),
    move: (unsafeRequest: unknown) => {
      const request = prepareStudioShelfMoveV1(unsafeRequest);
      return host.move(request, ids(request.kind, request.sectionIndex));
    },
  };
}
