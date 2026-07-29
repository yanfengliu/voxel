import {
  chainRingPart,
  chainRingSizeV1,
  type ChainRingPlaneV1,
} from './chain-link-part.js';

/**
 * Where each link of the hanging chain sits, and the geometry that proves the
 * links are actually threaded rather than merely near each other.
 *
 * A chain running along x needs each link's plane to contain x, and each link
 * turned ninety degrees from its neighbours, so the planes alternate between
 * xy and xz. Neighbouring centres sit one outer radius apart, which puts each
 * link's material squarely inside the next link's hole.
 *
 * This is the whole mechanism. There is no joint, no constraint, and no
 * attachment anywhere in it: two rings stay together because one is solid and
 * passes through the hole in the other, and a solid body cannot leave a hole
 * it does not fit through.
 */

/**
 * The section is sized by the two conditions a chain has to satisfy at once.
 * Writing the centreline radius as Rc and the tube radius as t:
 *
 * - a link must reach through its neighbour's hole with clearance, which needs
 *   the centre spacing d < 2·Rc − 2·t;
 * - links two apart share a plane and must not touch, which needs d > Rc + t.
 *
 * A 5/7 ring has Rc = 6 and t = 1, so d falls between 7 and 10. A 3/5 ring has
 * Rc = 4 and t = 1, which leaves 5 < d < 6 and no whole number to land on —
 * which is why the first attempt at this had links 0 and 2 sharing cells.
 */
export const CHAIN_OUTER_RADIUS_V1 = 7;
export const CHAIN_INNER_RADIUS_V1 = 5;
export const CHAIN_RING_DEPTH_V1 = 2;

/** Nine sits inside the 7 < d < 10 window with clearance on both conditions. */
export const CHAIN_LINK_PITCH_V1 = 9;

/** Links in the hanging chain, both ends included. */
export const CHAIN_LINK_COUNT_V1 = 11;

export function chainLinkPlaneV1(index: number): ChainRingPlaneV1 {
  return index % 2 === 0 ? 'xy' : 'xz';
}

/**
 * The world centre of link `index`, with the chain running along x and the
 * whole run centred on the origin so the default camera frames it rather than
 * looking at one end while the rest leaves the picture.
 */
export function chainLinkCentreV1(
  index: number,
): readonly [number, number, number] {
  const middle = (CHAIN_LINK_COUNT_V1 - 1) / 2;
  return [(index - middle) * CHAIN_LINK_PITCH_V1, 0, 0];
}

export type CellKeyV1 = `${number},${number},${number}`;

const key = (x: number, y: number, z: number): CellKeyV1 =>
  `${String(x)},${String(y)},${String(z)}` as CellKeyV1;

/**
 * The world cells one link fills. The part builds the ring centred inside its
 * own grid, so placing it is a matter of shifting that grid centre onto the
 * link's world centre.
 */
export function chainLinkCellsV1(index: number): ReadonlySet<CellKeyV1> {
  const plane = chainLinkPlaneV1(index);
  const fragment = chainRingPart.build({
    outerRadius: CHAIN_OUTER_RADIUS_V1,
    innerRadius: CHAIN_INNER_RADIUS_V1,
    depth: CHAIN_RING_DEPTH_V1,
    plane,
    role: 'steel',
  }, 0);

  const [sx, sy, sz] = fragment.size;
  const [cx, cy, cz] = chainLinkCentreV1(index);
  const halfDepth = Math.floor(CHAIN_RING_DEPTH_V1 / 2);
  const originX = cx - CHAIN_OUTER_RADIUS_V1;
  const originY = plane === 'xy' ? cy - CHAIN_OUTER_RADIUS_V1 : cy - halfDepth;
  const originZ = plane === 'xy' ? cz - halfDepth : cz - CHAIN_OUTER_RADIUS_V1;

  const cells = new Set<CellKeyV1>();
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (fragment.voxels[x + sx * (y + sy * z)] === 0) continue;
        cells.add(key(originX + x, originY + y, originZ + z));
      }
    }
  }
  return cells;
}

/**
 * The open cells inside a link's hole — the space a neighbour must occupy for
 * the two to be threaded. It is bounded by the inner radius in the link's own
 * plane and by the link's depth along its normal.
 */
export function chainLinkHoleCellsV1(index: number): ReadonlySet<CellKeyV1> {
  const plane = chainLinkPlaneV1(index);
  const [cx, cy, cz] = chainLinkCentreV1(index);
  const halfDepth = Math.floor(CHAIN_RING_DEPTH_V1 / 2);
  const reach = CHAIN_INNER_RADIUS_V1;
  const cells = new Set<CellKeyV1>();

  for (let a = -reach; a <= reach; a += 1) {
    for (let b = -reach; b <= reach; b += 1) {
      if (Math.hypot(a, b) >= CHAIN_INNER_RADIUS_V1) continue;
      for (let d = 0; d < CHAIN_RING_DEPTH_V1; d += 1) {
        const along = d - halfDepth;
        if (plane === 'xy') cells.add(key(cx + a, cy + b, cz + along));
        else cells.add(key(cx + a, cy + along, cz + b));
      }
    }
  }
  return cells;
}

function intersects(
  left: ReadonlySet<CellKeyV1>,
  right: ReadonlySet<CellKeyV1>,
): number {
  let shared = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const cell of small) if (large.has(cell)) shared += 1;
  return shared;
}

export interface ChainInterlockIssueV1 {
  readonly kind: 'links-intersect' | 'neighbours-not-threaded'
    | 'distant-links-threaded';
  readonly message: string;
}

/**
 * Proves the chain is a chain.
 *
 * Two solid bodies may never share space, so any overlap is a defect. Every
 * neighbouring pair must be threaded, or the chain is a row of loose rings that
 * would simply fall apart. And links that are not neighbours must not be
 * threaded, or the "chain" is really one tangled knot and the linkage claim
 * means nothing.
 */
export function chainInterlockIssuesV1(
  linkCount: number = CHAIN_LINK_COUNT_V1,
): readonly ChainInterlockIssueV1[] {
  const issues: ChainInterlockIssueV1[] = [];
  const cells = Array.from({ length: linkCount }, (_, index) =>
    chainLinkCellsV1(index));
  const holes = Array.from({ length: linkCount }, (_, index) =>
    chainLinkHoleCellsV1(index));

  for (let left = 0; left < linkCount; left += 1) {
    for (let right = left + 1; right < linkCount; right += 1) {
      const shared = intersects(cells[left]!, cells[right]!);
      if (shared > 0) {
        issues.push({
          kind: 'links-intersect',
          message:
            `Links ${String(left)} and ${String(right)} share `
            + `${String(shared)} solid cell(s). Two rigid bodies cannot occupy `
            + 'the same space, so the pitch or the ring section is wrong.',
        });
      }

      const threaded = intersects(cells[right]!, holes[left]!) > 0
        || intersects(cells[left]!, holes[right]!) > 0;
      if (right === left + 1 && !threaded) {
        issues.push({
          kind: 'neighbours-not-threaded',
          message:
            `Links ${String(left)} and ${String(right)} are neighbours but `
            + 'neither passes through the other\'s hole, so nothing holds them '
            + 'together and the chain would come apart under its own weight.',
        });
      }
      if (right > left + 1 && threaded) {
        issues.push({
          kind: 'distant-links-threaded',
          message:
            `Links ${String(left)} and ${String(right)} are not neighbours but `
            + 'thread each other, which makes this a knot rather than a chain.',
        });
      }
    }
  }

  return Object.freeze(issues);
}

/** The two links held to the walls. Everything between them hangs. */
export const CHAIN_ANCHOR_INDICES_V1 = Object.freeze([
  0,
  CHAIN_LINK_COUNT_V1 - 1,
] as const);

export function chainSpanV1(): number {
  return (CHAIN_LINK_COUNT_V1 - 1) * CHAIN_LINK_PITCH_V1;
}

/** Height the whole chain's axis sits at, clear of the ground it stands on. */
export const CHAIN_AXIS_HEIGHT_V1 = 8;

/**
 * A scene placement's `at.y` is where a model's *base* rests, not its centre,
 * and the two ring planes are different heights: an upright ring stands its
 * full diameter tall while a crossed ring is only as tall as the section. Using
 * one y for both drops every crossed link to the floor and unthreads the chain,
 * so each plane needs its own offset from the shared axis.
 */
export function chainLinkPlacementYV1(index: number): number {
  const centreOffset = chainLinkPlaneV1(index) === 'xy'
    ? CHAIN_OUTER_RADIUS_V1
    : (CHAIN_RING_DEPTH_V1 - 1) / 2;
  return CHAIN_AXIS_HEIGHT_V1 - centreOffset;
}

export { chainRingSizeV1 };
