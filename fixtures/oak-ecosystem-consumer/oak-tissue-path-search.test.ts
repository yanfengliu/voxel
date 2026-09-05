import { describe, expect, it } from 'vitest';

import {
  findOakTissuePathV1,
  OAK_TISSUE_FACE_NEIGHBORS_V1,
} from './oak-tissue-path-search.js';
import {
  oakTissueCellFromIdV1,
  oakTissueCellIdV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-lattice.js';

describe('oak tissue path search', () => {
  it('matches the legacy stable Manhattan sort across deterministic detours', () => {
    const blocked = new Set<number>();
    for (let x = -4; x <= 4; x += 1) {
      for (let y = -4; y <= 4; y += 1) {
        for (let z = -4; z <= 4; z += 1) {
          if (Math.abs(x * 17 + y * 31 + z * 43) % 7 === 0) {
            blocked.add(oakTissueCellIdV1([x, y, z]));
          }
        }
      }
    }
    const start = [0, 0, 0] as const;
    blocked.delete(oakTissueCellIdV1(start));
    for (let x = -3; x <= 3; x += 1) {
      for (let y = -3; y <= 3; y += 1) {
        for (let z = -3; z <= 3; z += 1) {
          const goal = [x, y, z] as const;
          if (goal.every((value) => value === 0)) continue;
          blocked.delete(oakTissueCellIdV1(goal));
          const open = (cell: OakTissueLatticeCellV1): boolean =>
            !blocked.has(oakTissueCellIdV1(cell));
          expect(findOakTissuePathV1(start, goal, open)).toEqual(legacyFindPath(start, goal, open));
        }
      }
    }
  });
});

function legacyFindPath(
  start: OakTissueLatticeCellV1,
  goal: OakTissueLatticeCellV1,
  open: (cell: OakTissueLatticeCellV1) => boolean,
): readonly OakTissueLatticeCellV1[] {
  for (const margin of [2, 4, 8, 16, 32]) {
    const minimum = start.map((value, axis) => Math.min(value, goal[axis]!) - margin);
    const maximum = start.map((value, axis) => Math.max(value, goal[axis]!) + margin);
    const queue: OakTissueLatticeCellV1[] = [start];
    const previous = new Map<number, number | null>([[oakTissueCellIdV1(start), null]]);
    for (const current of queue) {
      const currentId = oakTissueCellIdV1(current);
      if (currentId === oakTissueCellIdV1(goal)) return rebuild(previous, current);
      const ordered = [...OAK_TISSUE_FACE_NEIGHBORS_V1].sort((left, right) =>
        manhattan(add(current, left), goal) - manhattan(add(current, right), goal));
      for (const delta of ordered) {
        const next = add(current, delta);
        if (next.some((value, axis) => value < minimum[axis]! || value > maximum[axis]!)) continue;
        const id = oakTissueCellIdV1(next);
        if (previous.has(id) || !open(next)) continue;
        previous.set(id, currentId);
        queue.push(next);
      }
    }
  }
  throw new Error('Reference path not found.');
}

function rebuild(
  previous: ReadonlyMap<number, number | null>,
  goal: OakTissueLatticeCellV1,
): readonly OakTissueLatticeCellV1[] {
  const reverse: OakTissueLatticeCellV1[] = [];
  let cell = goal;
  let id: number | null = oakTissueCellIdV1(goal);
  while (id !== null) {
    reverse.push(cell);
    const prior: number | null = previous.get(id) ?? null;
    if (prior !== null) cell = oakTissueCellFromIdV1(prior);
    id = prior;
  }
  return reverse.reverse();
}

function add(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): OakTissueLatticeCellV1 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function manhattan(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): number {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}
