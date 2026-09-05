import {
  oakTissueCellFromIdV1,
  oakTissueCellIdV1,
  oakTissueCellKeyV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-lattice.js';
import { OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1 } from './oak-tissue-voxel-projection.js';

export const OAK_TISSUE_FACE_NEIGHBORS_V1: readonly OakTissueLatticeCellV1[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const ORIGIN_ID = oakTissueCellIdV1([0, 0, 0]);
export const OAK_TISSUE_FACE_NEIGHBOR_ID_OFFSETS_V1 = OAK_TISSUE_FACE_NEIGHBORS_V1
  .map((delta) => oakTissueCellIdV1(delta) - ORIGIN_ID);

export function assertOakTissueFaceNeighborRangeV1(cell: OakTissueLatticeCellV1): void {
  const maximum = OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1;
  if (Math.abs(cell[0]) < maximum && Math.abs(cell[1]) < maximum
    && Math.abs(cell[2]) < maximum) return;
  for (const delta of OAK_TISSUE_FACE_NEIGHBORS_V1) oakTissueCellIdV1(add(cell, delta));
}

export function findOakTissuePathV1(
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
      if (currentId === oakTissueCellIdV1(goal)) return rebuildPath(previous, current);
      // A unit face step is either one cell nearer the goal or one cell farther away.
      // Stable distance sorting is therefore exactly two fixed-order passes.
      for (const towardGoal of [true, false]) {
        for (const delta of OAK_TISSUE_FACE_NEIGHBORS_V1) {
          const toward = delta[0] !== 0
            ? Math.sign(goal[0] - current[0]) === delta[0]
            : delta[1] !== 0
              ? Math.sign(goal[1] - current[1]) === delta[1]
              : Math.sign(goal[2] - current[2]) === delta[2];
          if (toward !== towardGoal) continue;
          const next = add(current, delta);
          if (next.some((value, axis) => value < minimum[axis]! || value > maximum[axis]!)) continue;
          const id = oakTissueCellIdV1(next);
          if (previous.has(id) || !open(next)) continue;
          previous.set(id, currentId);
          queue.push(next);
        }
      }
    }
  }
  throw new Error(`No owner-only oak tissue path connects '${oakTissueCellKeyV1(start)}' to '${oakTissueCellKeyV1(goal)}'.`);
}

function rebuildPath(
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
