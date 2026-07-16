import type { StudioFrameV1 } from './session.js';

/**
 * Composing a sweep into one sprite sheet.
 *
 * This is part of the animation surface rather than a script's private trick,
 * because looking at every frame is the only thing that judges quality: the
 * sweep guards prove an animation is reproducible, moving, and periodic, and a
 * model can satisfy all three while looking wrong. Twenty-four separate images
 * is too expensive to open routinely, so it does not happen; one sheet costs a
 * single look, so it does.
 */

export interface SpriteSheetLayoutV1 {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly padding: number;
  readonly labelHeight: number;
}

export interface SpriteSheetCellV1 {
  readonly nowMs: number;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
}

export interface SpriteSheetPlanV1 {
  readonly layout: SpriteSheetLayoutV1;
  readonly width: number;
  readonly height: number;
  readonly cells: readonly SpriteSheetCellV1[];
}

export const SPRITE_SHEET_COLUMNS = 6;
const PADDING = 4;
const LABEL_HEIGHT = 14;

/**
 * Lays frames out in ascending time, left to right and top to bottom, so the
 * eye follows the motion the way the animation runs.
 *
 * The order is the sweep's own ascending sample times, never the order frames
 * happened to be produced or resolved in: a sheet whose cells moved between
 * runs could not be compared against an earlier one, and comparing is most of
 * what a sheet is for.
 */
export function planSpriteSheet(
  frames: readonly StudioFrameV1[],
  cellWidth: number,
  cellHeight: number,
  columns = SPRITE_SHEET_COLUMNS,
): SpriteSheetPlanV1 {
  const ordered = [...frames].sort((a, b) => a.nowMs - b.nowMs);
  const cols = Math.max(1, Math.min(12, Math.floor(columns)));
  const rows = Math.max(1, Math.ceil(ordered.length / cols));
  const layout: SpriteSheetLayoutV1 = {
    columns: cols,
    rows,
    cellWidth,
    cellHeight,
    padding: PADDING,
    labelHeight: LABEL_HEIGHT,
  };
  const cells = ordered.map((frame, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    return {
      nowMs: frame.nowMs,
      column,
      row,
      x: PADDING + column * (cellWidth + PADDING),
      y: PADDING + row * (cellHeight + LABEL_HEIGHT + PADDING),
    };
  });
  return {
    layout,
    width: cols * cellWidth + (cols + 1) * PADDING,
    height: rows * (cellHeight + LABEL_HEIGHT) + (rows + 1) * PADDING,
    cells,
  };
}

/** Draws the planned sheet. The ground is opaque: these frames carry alpha,
 * and tiling them onto transparency makes every silhouette unreadable. */
export async function composeSpriteSheet(
  frames: readonly StudioFrameV1[],
  options: { readonly ground?: string; readonly columns?: number } = {},
): Promise<{ readonly dataUrl: string; readonly plan: SpriteSheetPlanV1 }> {
  const ordered = [...frames].sort((a, b) => a.nowMs - b.nowMs);
  const bitmaps = await Promise.all(ordered.map(async (frame) =>
    createImageBitmap(await (await fetch(frame.image)).blob())));
  const first = bitmaps[0];
  if (!first) throw new Error('A sprite sheet needs at least one frame.');

  const plan = planSpriteSheet(ordered, first.width, first.height, options.columns);
  const canvas = new OffscreenCanvas(plan.width, plan.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The sprite sheet needs a 2d context.');
  context.fillStyle = options.ground ?? '#14171a';
  context.fillRect(0, 0, plan.width, plan.height);
  context.font = '10px monospace';
  context.textBaseline = 'top';

  plan.cells.forEach((cell, index) => {
    const bitmap = bitmaps[index];
    if (!bitmap) return;
    context.fillStyle = '#8b98a5';
    context.fillText(`${String(cell.nowMs)}ms`, cell.x, cell.y);
    context.drawImage(bitmap, cell.x, cell.y + plan.layout.labelHeight);
    bitmap.close();
  });

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // readAsDataURL yields a string, but the type admits an ArrayBuffer and
      // stringifying one would quietly produce "[object ArrayBuffer]" -- a
      // sheet that fails as a broken image rather than as an error.
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('The sprite sheet did not encode to a data URL.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => { reject(new Error('The sprite sheet could not be read.')); };
    reader.readAsDataURL(blob);
  });
  return { dataUrl, plan };
}
