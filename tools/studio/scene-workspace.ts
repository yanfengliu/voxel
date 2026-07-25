import type { SceneV1 } from './scene.js';

/**
 * The mutable, mount-local scene collection behind the Studio.
 *
 * A game's catalog is readonly input. Editing, renaming, and deleting scenes
 * must therefore happen against an owned copy, both so the shelf and open
 * scene read one source of truth and so Studio never mutates consumer data.
 */
export interface SceneWorkspaceV1 {
  scenes(): readonly SceneV1[];
  find(id: string): SceneV1 | undefined;
  replace(id: string, next: SceneV1): SceneV1;
  /** Validates a rename and returns its immutable candidate without publishing it. */
  prepareRename(id: string, label: string): SceneV1;
  rename(id: string, label: string): SceneV1;
  delete(id: string): SceneV1;
}

export function createSceneWorkspace(scenes: readonly SceneV1[]): SceneWorkspaceV1 {
  // Copy the collection, not the readonly scene objects themselves. Every
  // Studio mutation replaces an entry with a new object, so the consumer's
  // array and its scenes remain untouched without changing which V1 catalogs
  // are accepted at mount time.
  let entries = [...scenes];

  const find = (id: string): SceneV1 | undefined =>
    entries.find((scene) => scene.id === id);

  const requireScene = (
    id: string,
    action: string,
    requireUnique = false,
  ): { readonly scene: SceneV1; readonly index: number } => {
    const indexes: number[] = [];
    entries.forEach((scene, index) => {
      if (scene.id === id) indexes.push(index);
    });
    if (indexes.length === 0) {
      throw new Error(`No scene in this studio has the id '${id}', so it cannot be ${action}.`);
    }
    if (requireUnique && indexes.length > 1) {
      throw new Error(
        `Scene id '${id}' appears ${String(indexes.length)} times, so it cannot be ${action}; `
        + 'give every manageable scene a unique id.',
      );
    }
    const index = indexes[0]!;
    return { scene: entries[index]!, index };
  };

  const prepareRename = (id: string, label: string): SceneV1 => {
    const { scene } = requireScene(id, 'renamed', true);
    if (typeof label !== 'string') {
      throw new Error(
        `Scene '${id}' cannot be renamed because its new name must be a string; `
        + `received ${typeof label}.`,
      );
    }
    const trimmed = label.trim();
    if (trimmed === '') {
      throw new Error(
        `Scene '${id}' cannot be renamed to an empty name; `
        + 'enter at least one non-whitespace character.',
      );
    }
    return { ...scene, label: trimmed };
  };
  const replace = (id: string, next: SceneV1): SceneV1 => {
    const { index } = requireScene(id, 'updated');
    if (next.id !== id) {
      throw new Error(
        `Refusing to replace scene '${id}' with '${next.id}': scene ids are stable; `
        + 'change its label instead.',
      );
    }
    entries = entries.map((scene, entryIndex) => (entryIndex === index ? next : scene));
    return next;
  };

  return {
    scenes: () => entries,
    find,
    replace,
    prepareRename,
    rename(id, label) {
      const renamed = prepareRename(id, label);
      return replace(id, renamed);
    },
    delete(id) {
      const { scene, index } = requireScene(id, 'deleted', true);
      entries = entries.filter((_entry, entryIndex) => entryIndex !== index);
      return scene;
    },
  };
}
