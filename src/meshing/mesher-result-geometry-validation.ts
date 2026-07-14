import type {
  MesherLocalBoundsV1,
  PureMesherInputV1,
} from './mesher-contract.js';
import {
  checkedAddMesherInternal,
  failMesherValidationInternal,
} from './mesher-validation-internal.js';

export function validateMesherVertexAttributesV1Internal(
  positions: Float32Array,
  normals: Float32Array,
  paletteIndices: Uint16Array,
  input: PureMesherInputV1,
): MesherLocalBoundsV1 | null {
  if (positions.length === 0) return null;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  const extents = [input.source.size.x, input.source.size.y, input.source.size.z];
  for (let vertex = 0; vertex < paletteIndices.length; vertex += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      const index = vertex * 3 + axis;
      const position = positions[index]!;
      if (!Number.isInteger(position) || position < 0 || position > extents[axis]!) {
        failMesherValidationInternal(
          'mesher.bounds',
          `output.positions[${String(index)}]`,
          'Positions must be integer source-local voxel boundaries.',
        );
      }
      minimum[axis] = Math.min(minimum[axis]!, position);
      maximum[axis] = Math.max(maximum[axis]!, position);
    }
    const normalOffset = vertex * 3;
    const normal = [
      normals[normalOffset]!,
      normals[normalOffset + 1]!,
      normals[normalOffset + 2]!,
    ];
    if (!normal.every(Number.isFinite)
      || Math.abs(normal[0]!) + Math.abs(normal[1]!) + Math.abs(normal[2]!) !== 1
      || !normal.every((component) => component === -1 || component === 0 || component === 1)) {
      failMesherValidationInternal(
        'mesher.attribute',
        `output.normals[${String(normalOffset)}]`,
        'Normals must be finite signed axis unit vectors.',
      );
    }
    const paletteIndex = paletteIndices[vertex]!;
    if (paletteIndex === 0 || paletteIndex >= input.paletteEntryCount) {
      failMesherValidationInternal(
        'mesher.attribute',
        `output.paletteIndices[${String(vertex)}]`,
        'Surface palette indices must name a non-empty input palette entry.',
      );
    }
  }
  return Object.freeze({
    min: Object.freeze([minimum[0]!, minimum[1]!, minimum[2]!] as const),
    max: Object.freeze([maximum[0]!, maximum[1]!, maximum[2]!] as const),
  });
}

export function validateMesherTriangleTopologyV1Internal(
  positions: Float32Array,
  normals: Float32Array,
  paletteIndices: Uint16Array,
  materialIndices: Uint16Array | undefined,
  indices: Uint32Array,
  input: PureMesherInputV1,
): number {
  let doubledArea = 0;
  const position = (vertex: number, axis: number): number => positions[vertex * 3 + axis]!;
  for (let triangle = 0; triangle < indices.length / 3; triangle += 1) {
    const first = indices[triangle * 3]!;
    const second = indices[triangle * 3 + 1]!;
    const third = indices[triangle * 3 + 2]!;
    if (first >= paletteIndices.length || second >= paletteIndices.length || third >= paletteIndices.length) {
      failMesherValidationInternal(
        'mesher.index',
        `output.indices[${String(triangle * 3)}]`,
        'Triangle index exceeds vertexCount.',
      );
    }
    if (first === second || first === third || second === third) {
      failMesherValidationInternal(
        'mesher.topology',
        `output.indices[${String(triangle * 3)}]`,
        'Triangle indices must be distinct.',
      );
    }
    const ax = position(first, 0);
    const ay = position(first, 1);
    const az = position(first, 2);
    const abx = position(second, 0) - ax;
    const aby = position(second, 1) - ay;
    const abz = position(second, 2) - az;
    const acx = position(third, 0) - ax;
    const acy = position(third, 1) - ay;
    const acz = position(third, 2) - az;
    const cross = [
      aby * acz - abz * acy,
      abz * acx - abx * acz,
      abx * acy - aby * acx,
    ];
    const nonzero = cross.filter((component) => component !== 0);
    if (nonzero.length !== 1 || !Number.isSafeInteger(nonzero[0])) {
      failMesherValidationInternal(
        'mesher.topology',
        `output.indices[${String(triangle * 3)}]`,
        'Triangles must be nondegenerate, integer, and axis-aligned.',
      );
    }
    const normal = [normals[first * 3]!, normals[first * 3 + 1]!, normals[first * 3 + 2]!];
    for (const vertex of [second, third]) {
      if (normals[vertex * 3] !== normal[0]
        || normals[vertex * 3 + 1] !== normal[1]
        || normals[vertex * 3 + 2] !== normal[2]) {
        failMesherValidationInternal(
          'mesher.attribute',
          `output.normals[${String(vertex * 3)}]`,
          'Every triangle must have one flat normal.',
        );
      }
      if (paletteIndices[vertex] !== paletteIndices[first]) {
        failMesherValidationInternal(
          'mesher.attribute',
          `output.paletteIndices[${String(vertex)}]`,
          'Every triangle must have one palette index.',
        );
      }
    }
    const winding = cross[0]! * normal[0]! + cross[1]! * normal[1]! + cross[2]! * normal[2]!;
    if (winding <= 0) {
      failMesherValidationInternal(
        'mesher.topology',
        `output.indices[${String(triangle * 3)}]`,
        'Triangle winding must point along its declared outward normal.',
      );
    }
    doubledArea = checkedAddMesherInternal(
      doubledArea,
      Math.abs(nonzero[0]!),
      'output surface area',
    );
    if (doubledArea > input.outputBudget.maxExposedUnitFaces * 2) {
      failMesherValidationInternal(
        'mesher.limit',
        'output.counts.exposedUnitFaceCount',
        'Actual surface area exceeds the exposed-unit-face budget.',
      );
    }
    if (materialIndices && materialIndices[triangle]! >= input.materialEntryCount) {
      failMesherValidationInternal(
        'mesher.attribute',
        `output.materialIndices[${String(triangle)}]`,
        'Triangle material index does not name an input material entry.',
      );
    }
  }
  if (doubledArea % 2 !== 0) {
    failMesherValidationInternal(
      'mesher.topology',
      'output.indices',
      'Total oriented surface area must be an integer count of unit faces.',
    );
  }
  return doubledArea / 2;
}

export function assertExactMesherBoundsV1Internal(
  declared: MesherLocalBoundsV1 | null,
  actual: MesherLocalBoundsV1 | null,
): void {
  if (declared === null || actual === null) {
    if (declared !== actual) {
      failMesherValidationInternal(
        'mesher.bounds',
        'output.bounds',
        'Empty geometry must have null bounds and non-empty geometry must have bounds.',
      );
    }
    return;
  }
  for (let axis = 0; axis < 3; axis += 1) {
    if (declared.min[axis] !== actual.min[axis] || declared.max[axis] !== actual.max[axis]) {
      failMesherValidationInternal(
        'mesher.bounds',
        'output.bounds',
        'Declared bounds must exactly match returned positions.',
      );
    }
    if (declared.min[axis]! > declared.max[axis]!) {
      failMesherValidationInternal(
        'mesher.bounds',
        'output.bounds',
        'Bounds minimum cannot exceed maximum.',
      );
    }
  }
}
