import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import type { OakVec3V1 } from './oak-types.js';

const UNION_SOURCE_KEY =
  /^oak:(organ:[0-9]+:[0-9]+):union-voxel:(-?\d+):(-?\d+):(-?\d+)$/u;

interface OakUnionSourceIdentityV1 {
  readonly ownerOrganKey: string;
  readonly cell: readonly [x: number, y: number, z: number];
}

function unionSourceIdentity(key: string): OakUnionSourceIdentityV1 | null {
  const match = UNION_SOURCE_KEY.exec(key);
  return match === null ? null : {
    ownerOrganKey: match[1]!,
    cell: [Number(match[2]), Number(match[3]), Number(match[4])],
  };
}

function cellKey(cell: readonly [number, number, number]): string {
  return `${String(cell[0])}:${String(cell[1])}:${String(cell[2])}`;
}

/**
 * Select one already-materialized parent surface cube nearest the leaf base.
 * The returned record is a reference to existing structural tissue: callers
 * may recolor it as a wound, but must never append a second cube or move leaf
 * pools onto the parent because abscission occurs at the petiole base.
 */
export function oakNearestParentAbscissionWoundV1(
  parentKey: string,
  attachmentM: OakVec3V1,
  searchRadiusM: number,
  records: readonly OakRenderInstanceRecordV1[],
  excludedRecordKeys: ReadonlySet<string> = new Set(),
): OakRenderInstanceRecordV1 {
  if (!Number.isFinite(searchRadiusM) || searchRadiusM <= 0) {
    throw new Error(
      `Oak abscission wound search radius ${String(searchRadiusM)} must be finite and positive.`,
    );
  }
  const searchRadiusSquaredM2 = searchRadiusM * searchRadiusM;
  const occupied = new Set<string>();
  for (const record of records) {
    const source = unionSourceIdentity(record.key);
    if (source !== null) occupied.add(cellKey(source.cell));
  }
  const candidates = records.flatMap((record) => {
    const source = unionSourceIdentity(record.key);
    if (source === null || source.ownerOrganKey !== parentKey
      || excludedRecordKeys.has(record.key)) return [];
    const [x, y, z] = source.cell;
    const surface = [
      [x + 1, y, z], [x - 1, y, z],
      [x, y + 1, z], [x, y - 1, z],
      [x, y, z + 1], [x, y, z - 1],
    ].some((neighbor) => !occupied.has(cellKey(neighbor as [number, number, number])));
    if (!surface) return [];
    const dx = record.matrix[12]! - attachmentM.x;
    const dy = record.matrix[13]! - attachmentM.y;
    const dz = record.matrix[14]! - attachmentM.z;
    const distanceSquaredM2 = dx * dx + dy * dy + dz * dz;
    return distanceSquaredM2 <= searchRadiusSquaredM2
      ? [{ record, distanceSquaredM2 }]
      : [];
  }).sort((left, right) => left.distanceSquaredM2 - right.distanceSquaredM2
    || left.record.key.localeCompare(right.record.key));
  const nearest = candidates[0]?.record;
  if (nearest === undefined) {
    throw new Error(
      `Oak abscission wound for parent '${parentKey}' requires an unclaimed `
      + `existing parent union surface cell within ${String(searchRadiusM)} m `
      + 'of the leaf attachment.',
    );
  }
  return nearest;
}
