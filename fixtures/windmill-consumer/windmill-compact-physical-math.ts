import type {
  WindmillCompactBoxV1,
  WindmillCompactTripleV1,
} from '../../tools/studio/windmill-compact-geometry.js';

export const WINDMILL_COMPACT_PHYSICAL_EPSILON = 1e-9;
export const WINDMILL_COMPACT_SHAFT_AXIS_Z = Object.freeze(
  [0, 0, 1] as const,
);

export function compactTriple(x: number, y: number, z: number):
WindmillCompactTripleV1 {
  return Object.freeze([x, y, z]);
}

export function addCompactTriple(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return compactTriple(
    left[0] + right[0],
    left[1] + right[1],
    left[2] + right[2],
  );
}

export function subtractCompactTriple(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return compactTriple(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

export function scaleCompactTriple(
  value: WindmillCompactTripleV1,
  factor: number,
): WindmillCompactTripleV1 {
  return compactTriple(value[0] * factor, value[1] * factor, value[2] * factor);
}

export function dotCompactTriple(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function crossCompactTriple(
  left: WindmillCompactTripleV1,
  right: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return compactTriple(
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  );
}

export function compactTripleMagnitude(
  value: WindmillCompactTripleV1,
): number {
  return Math.hypot(...value);
}

export function normalizeCompactTriple(
  value: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  const length = compactTripleMagnitude(value);
  if (length <= Number.EPSILON) {
    throw new Error(
      'Cannot compile compact windmill: geometry produced a zero-length fitted-plate datum.',
    );
  }
  return scaleCompactTriple(value, 1 / length);
}

export function compactVoxelsToMeters(
  value: WindmillCompactTripleV1,
  grain: number,
): WindmillCompactTripleV1 {
  return scaleCompactTriple(value, grain);
}

export function compactTriplesClose(
  actual: WindmillCompactTripleV1,
  expected: WindmillCompactTripleV1,
): boolean {
  return compactTripleMagnitude(subtractCompactTriple(actual, expected))
    <= WINDMILL_COMPACT_PHYSICAL_EPSILON;
}

export function compactBoxCells(
  box: WindmillCompactBoxV1,
): WindmillCompactTripleV1[] {
  const cells: WindmillCompactTripleV1[] = [];
  for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
    for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
      for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
        cells.push(compactTriple(x, y, z));
      }
    }
  }
  return cells;
}

export function sortedCompactCells(
  cells: readonly WindmillCompactTripleV1[],
): readonly WindmillCompactTripleV1[] {
  return [...cells].sort((left, right) =>
    left[2] - right[2] || left[1] - right[1] || left[0] - right[0]);
}

export function compactBoxCenter(
  box: WindmillCompactBoxV1,
  bodyOrigin: WindmillCompactTripleV1,
): WindmillCompactTripleV1 {
  return compactTriple(
    box.at[0] + box.size[0] / 2 - bodyOrigin[0],
    box.at[1] + box.size[1] / 2 - bodyOrigin[1],
    box.at[2] + box.size[2] / 2 - bodyOrigin[2],
  );
}

export function projectedCompactCellCornerSpan(
  cells: readonly WindmillCompactTripleV1[],
  unitAxis: WindmillCompactTripleV1,
): number {
  let minimum = Infinity;
  let maximum = -Infinity;
  cells.forEach((cell) => {
    for (const dx of [0, 1]) {
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const projection = (cell[0] + dx) * unitAxis[0]
            + (cell[1] + dy) * unitAxis[1]
            + (cell[2] + dz) * unitAxis[2];
          minimum = Math.min(minimum, projection);
          maximum = Math.max(maximum, projection);
        }
      }
    }
  });
  if (!Number.isFinite(minimum) || maximum <= minimum) {
    throw new Error(
      'Cannot compile compact windmill: exact occupied-cell corners do not define a positive projected span.',
    );
  }
  return maximum - minimum;
}
