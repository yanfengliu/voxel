import { stableMergeSortInternal } from './bounded-sort.js';
import type { VoxelChunkV1 } from './contracts.js';

/**
 * The one bounded chunk-overlap check, shared by snapshot ingest and the delta
 * final graph.
 *
 * It used to be the same thirty-five lines maintained twice — including the
 * budget literal — which is how two copies drift on the next edit.
 */

/**
 * Pair comparisons the sweep may make before giving up.
 *
 * A bound is still required: overlap is a pairwise question, and a caller can
 * always construct a layout that defeats any sweep order. What changed is that
 * an *ordinary* layout no longer reaches it — see the axis choice below.
 */
const MAX_CHUNK_OVERLAP_COMPARISONS_V1 = 1_000_000;

export interface ChunkOverlapFindingV1Internal {
  readonly kind: 'overlap' | 'budget';
  /** Index of the chunk that overlaps an earlier one; -1 for a budget stop. */
  readonly index: number;
  /** Index of the earlier chunk it overlaps; -1 for a budget stop. */
  readonly otherIndex: number;
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * The axis whose origins are most spread out.
 *
 * The sweep sorts on one axis and stops scanning forward as soon as a chunk
 * starts past the current chunk's end on that axis. Sorting on `x`
 * unconditionally meant a world that is *thin in x* — a wall, a tower, a
 * corridor, anything one chunk deep — never triggered that break and paid
 * n²/2 comparisons, so a perfectly valid 1,415-chunk wall was rejected with
 * `limit.chunk-overlap-comparisons` while 1,400 was accepted. Correctness
 * never depended on which axis is chosen; only the cost does. Picking the axis
 * the chunks actually spread along gives the break something to bite on.
 */
function sweepAxisInternal(chunks: readonly VoxelChunkV1[]): 'x' | 'y' | 'z' {
  let best: 'x' | 'y' | 'z' = 'x';
  let bestSpread = -1;
  for (const axis of AXES) {
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const chunk of chunks) {
      const origin = chunk.origin[axis];
      if (origin < minimum) minimum = origin;
      if (origin > maximum) maximum = origin;
    }
    const spread = maximum - minimum;
    if (spread > bestSpread) {
      bestSpread = spread;
      best = axis;
    }
  }
  return best;
}

/**
 * The first overlapping pair, a budget stop, or null when the layout is sound.
 *
 * Callers that have already proven non-overlap another way should not call
 * this at all: a uniform chunk profile pins equal sizes, grid alignment, and
 * distinct grid coordinates, which is a partition — the chunks cannot
 * intersect, and sweeping them again is charged work that proves nothing.
 */
export function findChunkOverlapV1Internal(
  chunks: readonly VoxelChunkV1[],
): ChunkOverlapFindingV1Internal | null {
  const axis = sweepAxisInternal(chunks);
  const [other1, other2] = axis === 'x'
    ? (['y', 'z'] as const)
    : axis === 'y'
      ? (['x', 'z'] as const)
      : (['x', 'y'] as const);
  const indexed = stableMergeSortInternal(
    chunks.map((chunk, index) => ({ chunk, index })),
    (left, right) => left.chunk.origin[axis] - right.chunk.origin[axis]
      || left.index - right.index,
  );
  let comparisons = 0;
  for (let leftIndex = 0; leftIndex < indexed.length; leftIndex += 1) {
    const left = indexed[leftIndex]!;
    const leftEnd = left.chunk.origin[axis] + left.chunk.size[axis];
    for (let rightIndex = leftIndex + 1; rightIndex < indexed.length; rightIndex += 1) {
      const right = indexed[rightIndex]!;
      if (right.chunk.origin[axis] >= leftEnd) break;
      comparisons += 1;
      if (comparisons > MAX_CHUNK_OVERLAP_COMPARISONS_V1) {
        return { kind: 'budget', index: -1, otherIndex: -1 };
      }
      const overlaps1 = left.chunk.origin[other1] < right.chunk.origin[other1] + right.chunk.size[other1]
        && right.chunk.origin[other1] < left.chunk.origin[other1] + left.chunk.size[other1];
      if (!overlaps1) continue;
      const overlaps2 = left.chunk.origin[other2] < right.chunk.origin[other2] + right.chunk.size[other2]
        && right.chunk.origin[other2] < left.chunk.origin[other2] + left.chunk.size[other2];
      if (overlaps2) {
        return { kind: 'overlap', index: right.index, otherIndex: left.index };
      }
    }
  }
  return null;
}

export { MAX_CHUNK_OVERLAP_COMPARISONS_V1 };
