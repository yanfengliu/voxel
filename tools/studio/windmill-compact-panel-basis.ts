import type {
  WindmillCompactBoxV1,
  WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  windmillCompactStepEndpointsV1,
} from './windmill-compact-geometry-evidence.js';
import {
  WINDMILL_COMPACT_SHAFT_AXIS_Z as AXIS_Z,
  addCompactTriple as add,
  compactBoxCells as cellsOf,
  compactTriple as triple,
  crossCompactTriple as cross,
  dotCompactTriple as dot,
  normalizeCompactTriple as normalize,
  projectedCompactCellCornerSpan,
  scaleCompactTriple as scale,
  sortedCompactCells as sortedCells,
  subtractCompactTriple as subtract,
} from './windmill-compact-physical-math.js';

/**
 * The sail panel's flat-plate basis: where it is, which way it faces, and how
 * much area the wind sees.
 *
 * A stepped sail is not a flat plate, so this reduces one to the equivalent
 * plate the wind law is entitled to assume — a centroid, a pitched unit
 * normal, and a radial-by-chord span. That reduction is the whole reason the
 * mill can be driven by a bounded law instead of a flow solver, and it is
 * stated here rather than buried in the consumer so the live scene and the
 * fixture's recorded proof read the same geometry.
 */

type Triple = WindmillCompactTripleV1;

export interface WindmillCompactPanelBasisV1 {
  readonly panelCells: readonly Triple[];
  readonly centroid: Triple;
  readonly radial: Triple;
  readonly chord: Triple;
  readonly normal: Triple;
  readonly endpoints: readonly [Triple, Triple];
  readonly radialSpan: number;
  readonly chordSpan: number;
  readonly equivalentAreaVoxels: number;
}

export function deriveWindmillCompactPanelBasisV1(
  boxes: readonly WindmillCompactBoxV1[],
  bodyOrigin: Triple,
  shaft: Triple,
): WindmillCompactPanelBasisV1 {
  const panelCells = sortedCells(boxes.flatMap(cellsOf));
  const centroid = scale(panelCells.reduce(
    (sum, cell) => add(sum, triple(
      cell[0] + 0.5 - bodyOrigin[0],
      cell[1] + 0.5 - bodyOrigin[1],
      cell[2] + 0.5 - bodyOrigin[2],
    )),
    triple(0, 0, 0),
  ), 1 / panelCells.length);
  const shaftToCentroid = subtract(centroid, shaft);
  const radial = normalize(subtract(
    shaftToCentroid,
    scale(AXIS_Z, dot(shaftToCentroid, AXIS_Z)),
  ));
  const endpoints = windmillCompactStepEndpointsV1(
    panelCells,
    centroid[1] + bodyOrigin[1],
  ).map((point) => subtract(point, bodyOrigin)) as [Triple, Triple];
  const chord = normalize(subtract(endpoints[1], endpoints[0]));
  const normal = normalize(cross(radial, chord));
  const radialSpan = projectedCompactCellCornerSpan(panelCells, radial);
  const chordSpan = projectedCompactCellCornerSpan(panelCells, chord);
  return Object.freeze({
    panelCells,
    centroid,
    radial,
    chord,
    normal,
    endpoints: Object.freeze(endpoints),
    radialSpan,
    chordSpan,
    equivalentAreaVoxels: radialSpan * chordSpan,
  });
}
