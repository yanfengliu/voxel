import { OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1, OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';

export type OakTissueLatticeCellV1 = readonly [number, number, number];

export interface OakTissueSourceCellV1 {
  readonly key: string;
  readonly ownerOrganKey: string;
  readonly localCell: OakTissueLatticeCellV1;
  readonly centerM: readonly [number, number, number];
}

export interface OakTissueSourceAssignmentV1 {
  readonly sourceKey: string;
  readonly ownerOrganKey: string;
  readonly sourceLocalCell: OakTissueLatticeCellV1;
  readonly sourceCenterM: readonly [number, number, number];
  readonly cell: OakTissueLatticeCellV1;
}

export interface OakTissueMaterialCellV1 {
  readonly cell: OakTissueLatticeCellV1;
  readonly ownerOrganKey: string;
  readonly role: 'source' | 'parent-port' | 'child-port' | 'owner-path' | 'union-path';
  readonly sourceKey?: string;
  readonly claimOrganKeys?: readonly string[];
}

export interface OakTissuePortWitnessV1 {
  readonly parentOrganKey: string;
  readonly childOrganKey: string;
  readonly portM: readonly [number, number, number];
  readonly parentCell: OakTissueLatticeCellV1;
  readonly childCell: OakTissueLatticeCellV1;
  parentPath: readonly OakTissueLatticeCellV1[];
  childPath: readonly OakTissueLatticeCellV1[];
}

export interface OakTissueUnionRoutingV1 {
  readonly materialCells: ReadonlyMap<number, OakTissueMaterialCellV1>;
  readonly sourceAssignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>;
  readonly ports: readonly OakTissuePortWitnessV1[];
}

const CELL_ID_OFFSET = 16_384;
const CELL_ID_SIDE = 32_768;

export function oakTissueCellKeyV1(cell: OakTissueLatticeCellV1): string {
  return `${String(cell[0])}:${String(cell[1])}:${String(cell[2])}`;
}

export function oakTissueCellIdV1(cell: OakTissueLatticeCellV1): number {
  const [x, y, z] = cell;
  if (![x, y, z].every((value) => Number.isSafeInteger(value)
    && Math.abs(value) <= OAK_MAX_EXACT_TISSUE_CELL_COORDINATE_V1)) {
    throw new RangeError(`Oak tissue cell '${oakTissueCellKeyV1(cell)}' exceeds the exact Float32 lattice.`);
  }
  return (x + CELL_ID_OFFSET) * CELL_ID_SIDE * CELL_ID_SIDE
    + (y + CELL_ID_OFFSET) * CELL_ID_SIDE
    + z + CELL_ID_OFFSET;
}

export function oakTissueCellFromIdV1(id: number): OakTissueLatticeCellV1 {
  const x = Math.floor(id / (CELL_ID_SIDE * CELL_ID_SIDE));
  const remainder = id - x * CELL_ID_SIDE * CELL_ID_SIDE;
  const y = Math.floor(remainder / CELL_ID_SIDE);
  return [x - CELL_ID_OFFSET, y - CELL_ID_OFFSET, remainder - y * CELL_ID_SIDE - CELL_ID_OFFSET];
}

export function roundOakTissueCellV1(
  value: readonly [number, number, number],
): OakTissueLatticeCellV1 {
  const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
  return [
    Math.round(value[0] / pitch - .5),
    Math.round(value[1] / pitch - .5),
    Math.round(value[2] / pitch - .5),
  ];
}

export function oakTissueCellCenterM_V1(
  cell: OakTissueLatticeCellV1,
): readonly [number, number, number] {
  const center = (coordinate: number): number =>
    (coordinate + .5) * OAK_TISSUE_VOXEL_PITCH_M_V1;
  return [center(cell[0]), center(cell[1]), center(cell[2])];
}
