import { voxelIndex, type StudioModelV1 } from './model.js';

/**
 * Exact convex decomposition of a voxel model.
 *
 * A solver's narrow phase needs convex shapes, which is usually where a model
 * gets approximated by hand-picked capsules and hulls. Voxel content needs no
 * approximation at all: any occupied set is exactly the union of axis-aligned
 * boxes, and every box is already convex. A ring, a hollow shell, and a torus
 * all decompose exactly, and no cell is treated as more important than another.
 *
 * What the convex restriction actually costs is box count, not accuracy, so the
 * work here is merging runs of occupied cells into maximal boxes — the same
 * idea the mesher already uses for faces, applied to volume.
 */

export const VOXEL_COLLIDER_SCHEMA_V1 = 'studio.voxel-colliders/1' as const;

export interface VoxelBoxV1 {
  /** Minimum corner in voxel coordinates. */
  readonly at: readonly [number, number, number];
  /** Extent in voxels; every component is at least one. */
  readonly size: readonly [number, number, number];
}

export interface VoxelDecompositionV1 {
  readonly schema: typeof VOXEL_COLLIDER_SCHEMA_V1;
  readonly boxes: readonly VoxelBoxV1[];
  /** Occupied cells the boxes cover, which is every occupied cell. */
  readonly cells: number;
}

export interface VoxelOccupancyV1 {
  readonly size: readonly [number, number, number];
  /** True where a cell is solid. */
  readonly filled: (x: number, y: number, z: number) => boolean;
}

/** Reads a built Studio model as occupancy: any nonzero palette slot is solid. */
export function modelOccupancyV1(model: StudioModelV1): VoxelOccupancyV1 {
  return {
    size: model.size,
    filled: (x, y, z) => {
      const index = voxelIndex(model, x, y, z);
      return index >= 0 && model.voxels[index] !== 0;
    },
  };
}

/**
 * Greedy maximal-box decomposition.
 *
 * Cells are visited in z, then y, then x. The first unclaimed solid cell grows
 * as far as it can along x, then sweeps that run along y, then sweeps the
 * resulting slab along z, taking only cells that are solid and unclaimed. The
 * result covers every solid cell exactly once and never includes an empty one,
 * so it is a faithful decomposition rather than a fitted approximation.
 *
 * The visit order is fixed, so the same occupancy always yields the same boxes
 * in the same order — which is what lets a replay trace stay comparable.
 */
export function decomposeVoxelsV1(
  occupancy: VoxelOccupancyV1,
): VoxelDecompositionV1 {
  const [sx, sy, sz] = occupancy.size;
  if (sx <= 0 || sy <= 0 || sz <= 0) {
    return Object.freeze({
      schema: VOXEL_COLLIDER_SCHEMA_V1,
      boxes: Object.freeze([]),
      cells: 0,
    });
  }

  const claimed = new Uint8Array(sx * sy * sz);
  const at = (x: number, y: number, z: number) => x + sx * (y + sy * z);
  const open = (x: number, y: number, z: number) =>
    occupancy.filled(x, y, z) && claimed[at(x, y, z)] === 0;

  const boxes: VoxelBoxV1[] = [];
  let cells = 0;

  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (!open(x, y, z)) continue;

        let width = 1;
        while (x + width < sx && open(x + width, y, z)) width += 1;

        let height = 1;
        while (y + height < sy) {
          let wholeRow = true;
          for (let step = 0; step < width; step += 1) {
            if (!open(x + step, y + height, z)) {
              wholeRow = false;
              break;
            }
          }
          if (!wholeRow) break;
          height += 1;
        }

        let depth = 1;
        while (z + depth < sz) {
          let wholeSlab = true;
          for (let row = 0; row < height && wholeSlab; row += 1) {
            for (let step = 0; step < width; step += 1) {
              if (!open(x + step, y + row, z + depth)) {
                wholeSlab = false;
                break;
              }
            }
          }
          if (!wholeSlab) break;
          depth += 1;
        }

        for (let dz = 0; dz < depth; dz += 1) {
          for (let dy = 0; dy < height; dy += 1) {
            for (let dx = 0; dx < width; dx += 1) {
              claimed[at(x + dx, y + dy, z + dz)] = 1;
            }
          }
        }
        cells += width * height * depth;
        boxes.push(Object.freeze({
          at: Object.freeze([x, y, z] as const),
          size: Object.freeze([width, height, depth] as const),
        }));
      }
    }
  }

  return Object.freeze({
    schema: VOXEL_COLLIDER_SCHEMA_V1,
    boxes: Object.freeze(boxes),
    cells,
  });
}

/** Every cell a decomposition covers, as `x,y,z` keys. Used to prove exactness. */
export function coveredCellsV1(
  decomposition: VoxelDecompositionV1,
): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const box of decomposition.boxes) {
    for (let dz = 0; dz < box.size[2]; dz += 1) {
      for (let dy = 0; dy < box.size[1]; dy += 1) {
        for (let dx = 0; dx < box.size[0]; dx += 1) {
          covered.add(
            `${String(box.at[0] + dx)},${String(box.at[1] + dy)},${String(box.at[2] + dz)}`,
          );
        }
      }
    }
  }
  return covered;
}

export interface VoxelDecompositionIssueV1 {
  readonly kind: 'missing-cell' | 'extra-cell' | 'overlapping-box';
  readonly message: string;
}

/**
 * Checks a decomposition against the occupancy it came from. A collider set
 * that misses a solid cell lets things pass through it; one that covers an
 * empty cell blocks space nothing occupies. Both are silent until something
 * tunnels or sticks, so they are worth proving rather than assuming.
 */
export function voxelDecompositionIssuesV1(
  occupancy: VoxelOccupancyV1,
  decomposition: VoxelDecompositionV1,
): readonly VoxelDecompositionIssueV1[] {
  const [sx, sy, sz] = occupancy.size;
  const issues: VoxelDecompositionIssueV1[] = [];
  const seen = new Map<string, number>();

  for (const [index, box] of decomposition.boxes.entries()) {
    for (let dz = 0; dz < box.size[2]; dz += 1) {
      for (let dy = 0; dy < box.size[1]; dy += 1) {
        for (let dx = 0; dx < box.size[0]; dx += 1) {
          const x = box.at[0] + dx;
          const y = box.at[1] + dy;
          const z = box.at[2] + dz;
          const key = `${String(x)},${String(y)},${String(z)}`;
          const owner = seen.get(key);
          if (owner !== undefined) {
            issues.push({
              kind: 'overlapping-box',
              message:
                `Boxes ${String(owner)} and ${String(index)} both cover cell `
                + `(${key}). A decomposition must partition the solid cells, or `
                + 'the solver counts the same mass twice.',
            });
            continue;
          }
          seen.set(key, index);
          if (!occupancy.filled(x, y, z)) {
            issues.push({
              kind: 'extra-cell',
              message:
                `Box ${String(index)} covers empty cell (${key}). A collider `
                + 'that fills empty space blocks room nothing occupies.',
            });
          }
        }
      }
    }
  }

  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (!occupancy.filled(x, y, z)) continue;
        const key = `${String(x)},${String(y)},${String(z)}`;
        if (seen.has(key)) continue;
        issues.push({
          kind: 'missing-cell',
          message:
            `Solid cell (${key}) is covered by no box. A collider set that `
            + 'misses solid cells lets other bodies pass through them.',
        });
      }
    }
  }

  return Object.freeze(issues);
}
