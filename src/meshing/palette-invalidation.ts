import type { PaletteResourceV1 } from '../core/contracts.js';

import type {
  ChunkInvalidationClassV1,
  PaletteResourceChangeV1,
} from './chunk-dirty-closure.js';

function opacityClass(alpha: number): 'empty' | 'translucent' | 'opaque' {
  if (alpha === 0) return 'empty';
  return alpha === 255 ? 'opaque' : 'translucent';
}

export function classifyPaletteChangeInternal(
  change: PaletteResourceChangeV1,
): ChunkInvalidationClassV1 | undefined {
  const before: PaletteResourceV1 | undefined = change.before;
  const after: PaletteResourceV1 | undefined = change.after;
  if (!before && !after) throw new RangeError(`Palette change ${change.key} has no state.`);
  if (before && before.key !== change.key) {
    throw new RangeError(`Palette change ${change.key} has a mismatched before resource.`);
  }
  if (after && after.key !== change.key) {
    throw new RangeError(`Palette change ${change.key} has a mismatched after resource.`);
  }
  const entryCount = Math.max(before?.entries.length ?? 0, after?.entries.length ?? 0);
  let changed: ChunkInvalidationClassV1 | undefined;
  // Palette index zero is defined as empty space; its stored color is never baked.
  for (let index = 1; index < entryCount; index += 1) {
    const oldColor = before?.entries[index]?.color;
    const newColor = after?.entries[index]?.color;
    if (!oldColor || !newColor) return 'topology';
    if (opacityClass(oldColor.a) !== opacityClass(newColor.a)) return 'topology';
    if (oldColor.r !== newColor.r
      || oldColor.g !== newColor.g
      || oldColor.b !== newColor.b
      || oldColor.a !== newColor.a) {
      changed = 'attributes';
    }
  }
  return changed;
}
