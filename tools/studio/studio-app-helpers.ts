import type { StudioCatalogV1 } from './catalog.js';
import { createEmptyModel } from './edit.js';
import type { StudioModelV1 } from './model.js';

/**
 * The app's small standalone helpers, out of `studio-app.ts` so the
 * composition root stays about composition. Nothing here holds state or
 * touches a session; each function is complete on its own.
 */

/** The first model on the shelf, or an empty one when a shelf is empty. */
export function openingModel(
  catalog: StudioCatalogV1,
  openModelId: string | undefined,
): StudioModelV1 {
  for (const section of catalog.sections) {
    for (const entry of section.models) {
      if (openModelId === undefined || entry.id === openModelId) return entry.load();
    }
  }
  if (openModelId !== undefined) {
    throw new Error(`No model on the shelf is called ${openModelId}.`);
  }
  // An empty shelf is a legitimate starting point for a game that has not
  // authored anything yet, so it opens on an empty model rather than refusing.
  return createEmptyModel({ id: 'studio:empty', label: 'Empty', size: [8, 8, 8] });
}

/**
 * The Motion tab's slider table: one row per animated amount, in the order
 * the panel shows them. Scale converts a slider's whole-number position into
 * the model's own unit for that amount.
 */
export const AMPLITUDES = [
  { kind: 'rotationRadians', axis: 0, group: 'Turn', label: 'Pitch', unit: '°', max: 180, scale: Math.PI / 180 },
  { kind: 'rotationRadians', axis: 1, group: 'Turn', label: 'Rock', unit: '°', max: 180, scale: Math.PI / 180 },
  { kind: 'rotationRadians', axis: 2, group: 'Turn', label: 'Roll', unit: '°', max: 180, scale: Math.PI / 180 },
  { kind: 'translation', axis: 0, group: 'Slide', label: 'Sideways', unit: 'levels', max: 40, scale: 0.1 },
  { kind: 'translation', axis: 1, group: 'Slide', label: 'Up and down', unit: 'levels', max: 40, scale: 0.1 },
  { kind: 'translation', axis: 2, group: 'Slide', label: 'In and out', unit: 'levels', max: 40, scale: 0.1 },
  { kind: 'scale', axis: 0, group: 'Stretch', label: 'Width', unit: '%', max: 100, scale: 0.01 },
  { kind: 'scale', axis: 1, group: 'Stretch', label: 'Height', unit: '%', max: 100, scale: 0.01 },
  { kind: 'scale', axis: 2, group: 'Stretch', label: 'Depth', unit: '%', max: 100, scale: 0.01 },
] as const;

export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function labelled(text: string, control: HTMLElement, hint?: string): HTMLLabelElement {
  const label = element('label', 'field');
  const span = element('span');
  span.textContent = text;
  label.append(span, control);
  if (hint) {
    const note = element('small', 'hint');
    note.textContent = hint;
    label.append(note);
  }
  return label;
}

export function rgbHex(color: { r: number; g: number; b: number }): string {
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}`;
}

export function hexRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}
