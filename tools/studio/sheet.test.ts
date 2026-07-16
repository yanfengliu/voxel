import { describe, expect, it } from 'vitest';

import type { StudioFrameV1 } from './session.js';
import { planSpriteSheet, SPRITE_SHEET_COLUMNS } from './sheet.js';

const frame = (nowMs: number): StudioFrameV1 => ({
  nowMs,
  image: `img:${String(nowMs)}`,
  drawCalls: 1,
  triangles: 12,
  presentedRevision: 1,
});

describe('sprite sheet layout', () => {
  it('orders cells by time, never by the order frames arrived', () => {
    // Frames can be produced or resolved in any order; a sheet whose cells
    // moved between runs could not be compared against an earlier one, and
    // comparing is most of what a sheet is for.
    const shuffled = [frame(250), frame(0), frame(750), frame(500)];
    const plan = planSpriteSheet(shuffled, 40, 30);

    expect(plan.cells.map((cell) => cell.nowMs)).toEqual([0, 250, 500, 750]);
  });

  it('reads left to right and top to bottom, the way the animation runs', () => {
    const frames = Array.from({ length: 8 }, (_, index) => frame(index * 100));
    const plan = planSpriteSheet(frames, 40, 30, 4);

    expect(plan.cells.slice(0, 4).map((cell) => cell.row)).toEqual([0, 0, 0, 0]);
    expect(plan.cells.slice(0, 4).map((cell) => cell.column)).toEqual([0, 1, 2, 3]);
    expect(plan.cells[4]).toMatchObject({ nowMs: 400, row: 1, column: 0 });
    // Time increases along x, then wraps down, so a later frame is never above
    // an earlier one.
    const positions = plan.cells.map((cell) => cell.y * 10_000 + cell.x);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('is the same sheet for the same frames, every time', () => {
    const frames = Array.from({ length: 24 }, (_, index) => frame(index * 42));
    // Determinism is the whole basis of comparing two sheets: if the layout
    // drifted, a diff would report motion that was only ever re-tiling.
    expect(planSpriteSheet(frames, 40, 30)).toEqual(planSpriteSheet(frames, 40, 30));
  });

  it('sizes the sheet to hold every frame with room for its label', () => {
    const frames = Array.from({ length: 24 }, (_, index) => frame(index * 42));
    const plan = planSpriteSheet(frames, 40, 30);

    expect(plan.layout.columns).toBe(SPRITE_SHEET_COLUMNS);
    expect(plan.layout.rows).toBe(4);
    const last = plan.cells.at(-1);
    if (!last) throw new Error('expected cells');
    expect(last.x + plan.layout.cellWidth).toBeLessThanOrEqual(plan.width);
    expect(last.y + plan.layout.labelHeight + plan.layout.cellHeight)
      .toBeLessThanOrEqual(plan.height);
  });

  it('handles a still model, which is one frame rather than no sheet', () => {
    const plan = planSpriteSheet([frame(0)], 40, 30);
    expect(plan.cells).toHaveLength(1);
    expect(plan.layout.rows).toBe(1);
  });
});
