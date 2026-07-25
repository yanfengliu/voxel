import type { ShelfSectionV1 } from './catalog.js';

/** One shelf model reduced to its mount-local display-name state. */
export interface ModelLabelInfoV1 {
  readonly id: string;
  readonly label: string;
  readonly originalLabel: string;
  readonly renamed: boolean;
}

/** One catalog section with effective model display names. */
export interface ModelLabelSectionV1 {
  readonly name: string;
  readonly models: readonly ModelLabelInfoV1[];
}

/**
 * Mount-local model display names.
 *
 * The catalog remains consumer-owned readonly input. A rename overlays its
 * label while the stable model id continues to resolve shelf recipes, build
 * steps, and scene placements.
 */
export interface ModelLabelWorkspaceV1 {
  sections(): readonly ModelLabelSectionV1[];
  /** Resolves a model's effective label, or the caller's fallback when the id is unknown or ambiguous. */
  label(id: string, fallback: string): string;
  rename(id: string, label: unknown): ModelLabelInfoV1;
  restore(id: string): ModelLabelInfoV1;
}

interface CanonicalModelV1 {
  readonly id: string;
  readonly label: string;
}

interface CanonicalSectionV1 {
  readonly name: string;
  readonly models: readonly CanonicalModelV1[];
}

export function createModelLabelWorkspace(
  sections: readonly ShelfSectionV1[],
): ModelLabelWorkspaceV1 {
  // Copy only the immutable identity and presentation data this workspace
  // needs. Catalog functions and consumer-owned section arrays stay untouched.
  const canonicalSections: readonly CanonicalSectionV1[] = sections.map((section) => ({
    name: section.name,
    models: section.models.map(({ id, label }) => ({ id, label })),
  }));
  const modelsById = new Map<string, CanonicalModelV1[]>();
  for (const section of canonicalSections) {
    for (const model of section.models) {
      const matches = modelsById.get(model.id);
      if (matches) matches.push(model);
      else modelsById.set(model.id, [model]);
    }
  }
  const overrides = new Map<string, string>();

  const requireUniqueModel = (id: string, action: string): CanonicalModelV1 => {
    const matches = modelsById.get(id) ?? [];
    if (matches.length === 0) {
      throw new Error(
        `No model in this studio has the id '${id}', so its display name cannot be ${action}. `
        + 'Choose an id returned by sections().',
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Model id '${id}' appears ${String(matches.length)} times, so its display name cannot be ${action}; `
        + 'give every manageable model a unique id.',
      );
    }
    return matches[0]!;
  };

  const effective = (model: CanonicalModelV1): ModelLabelInfoV1 => {
    const override = overrides.get(model.id);
    return {
      id: model.id,
      label: override ?? model.label,
      originalLabel: model.label,
      renamed: override !== undefined,
    };
  };

  return {
    sections: () => canonicalSections.map((section) => ({
      name: section.name,
      models: section.models.map(effective),
    })),
    label(id, fallback) {
      const override = overrides.get(id);
      if (override !== undefined) return override;
      const matches = modelsById.get(id);
      return matches?.length === 1 ? matches[0]!.label : fallback;
    },
    rename(id, label) {
      const model = requireUniqueModel(id, 'renamed');
      if (typeof label !== 'string') {
        throw new Error(
          `Model '${id}' cannot be renamed because its new display name must be a string; `
          + `received ${typeof label}.`,
        );
      }
      const trimmed = label.trim();
      if (trimmed === '') {
        throw new Error(
          `Model '${id}' cannot be renamed to an empty display name; `
          + 'enter at least one non-whitespace character.',
        );
      }
      if (trimmed === model.label.trim()) overrides.delete(id);
      else overrides.set(id, trimmed);
      return effective(model);
    },
    restore(id) {
      const model = requireUniqueModel(id, 'restored');
      overrides.delete(id);
      return effective(model);
    },
  };
}
