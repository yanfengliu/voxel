import { describe, expect, it } from 'vitest';

import {
  chainInterlockIssuesV1,
  chainLinkCellsV1,
  chainLinkCentreV1,
  chainLinkHoleCellsV1,
  chainLinkPlaneV1,
  CHAIN_ANCHOR_INDICES_V1,
  CHAIN_INNER_RADIUS_V1,
  CHAIN_LINK_COUNT_V1,
  CHAIN_LINK_PITCH_V1,
  CHAIN_OUTER_RADIUS_V1,
  CHAIN_RING_DEPTH_V1,
} from './chain-layout.js';
import { chainRingPart } from './chain-link-part.js';
import { decomposeVoxelsV1, voxelDecompositionIssuesV1 } from './voxel-colliders.js';

/**
 * The chain's one claim is that its links are held together by solid geometry
 * and nothing else. That is a structural claim, so it is proved structurally:
 * every ring is closed, no two rings share space, every neighbouring pair is
 * threaded, and no distant pair is.
 */

function fragmentOf(plane: 'xy' | 'xz') {
  return chainRingPart.build({
    outerRadius: CHAIN_OUTER_RADIUS_V1,
    innerRadius: CHAIN_INNER_RADIUS_V1,
    depth: CHAIN_RING_DEPTH_V1,
    plane,
    role: 'steel',
  }, 0);
}

/** Face-connected components of a fragment's solid cells. */
function componentCount(fragment: ReturnType<typeof fragmentOf>): number {
  const [sx, sy, sz] = fragment.size;
  const at = (x: number, y: number, z: number) => x + sx * (y + sy * z);
  const solid = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz
    && fragment.voxels[at(x, y, z)] !== 0;

  const seen = new Set<number>();
  let components = 0;
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (!solid(x, y, z) || seen.has(at(x, y, z))) continue;
        components += 1;
        const stack = [[x, y, z] as const];
        while (stack.length > 0) {
          const [cx, cy, cz] = stack.pop()!;
          if (!solid(cx, cy, cz) || seen.has(at(cx, cy, cz))) continue;
          seen.add(at(cx, cy, cz));
          stack.push(
            [cx + 1, cy, cz], [cx - 1, cy, cz],
            [cx, cy + 1, cz], [cx, cy - 1, cz],
            [cx, cy, cz + 1], [cx, cy, cz - 1],
          );
        }
      }
    }
  }
  return components;
}

describe('one chain ring', () => {
  it('closes into a single connected loop', () => {
    for (const plane of ['xy', 'xz'] as const) {
      expect(componentCount(fragmentOf(plane)), `the ${plane} ring is one piece`)
        .toBe(1);
    }
  });

  it('keeps a hole all the way through', () => {
    const fragment = fragmentOf('xy');
    const [sx, sy] = fragment.size;
    const centre = CHAIN_OUTER_RADIUS_V1;

    expect(fragment.voxels[centre + sx * (centre + sy * 0)]).toBe(0);
    expect(fragment.size).toEqual([
      CHAIN_OUTER_RADIUS_V1 * 2 + 1,
      CHAIN_OUTER_RADIUS_V1 * 2 + 1,
      CHAIN_RING_DEPTH_V1,
    ]);
  });

  it('refuses a section too thin to stay closed', () => {
    expect(() => chainRingPart.build({
      outerRadius: 5, innerRadius: 4, depth: 2, plane: 'xy', role: 'steel',
    }, 0)).toThrow(/breaks into arcs/);
  });

  it('refuses a hole larger than the ring', () => {
    expect(() => chainRingPart.build({
      outerRadius: 3, innerRadius: 5, depth: 2, plane: 'xy', role: 'steel',
    }, 0)).toThrow(/hole must be smaller/);
  });

  it('refuses a plane that does not contain the chain axis', () => {
    expect(() => chainRingPart.build({
      outerRadius: 5, innerRadius: 3, depth: 2, plane: 'yz', role: 'steel',
    }, 0)).toThrow(/contain the chain axis/);
  });

  it('decomposes exactly into convex boxes, hole intact', () => {
    const fragment = fragmentOf('xy');
    const occupancy = {
      size: fragment.size,
      filled: (x: number, y: number, z: number) => {
        const [sx, sy] = fragment.size;
        return fragment.voxels[x + sx * (y + sy * z)] !== 0;
      },
    };

    const decomposition = decomposeVoxelsV1(occupancy);

    expect(voxelDecompositionIssuesV1(occupancy, decomposition)).toEqual([]);
    expect(decomposition.boxes.length).toBeGreaterThan(0);
    expect(decomposition.boxes.length).toBeLessThan(decomposition.cells);
  });
});

describe('the hanging chain', () => {
  it('alternates each link ninety degrees from its neighbours', () => {
    for (let index = 1; index < CHAIN_LINK_COUNT_V1; index += 1) {
      expect(chainLinkPlaneV1(index)).not.toBe(chainLinkPlaneV1(index - 1));
    }
  });

  it('spaces centres one outer radius apart along the chain', () => {
    for (let index = 1; index < CHAIN_LINK_COUNT_V1; index += 1) {
      const previous = chainLinkCentreV1(index - 1);
      const current = chainLinkCentreV1(index);
      expect(current[0] - previous[0]).toBe(CHAIN_LINK_PITCH_V1);
      expect(current[1]).toBe(previous[1]);
      expect(current[2]).toBe(previous[2]);
    }
  });

  it('is threaded, not merely adjacent', () => {
    expect(chainInterlockIssuesV1()).toEqual([]);
  });

  it('puts neighbouring material inside each hole', () => {
    for (let index = 1; index < CHAIN_LINK_COUNT_V1; index += 1) {
      const hole = chainLinkHoleCellsV1(index - 1);
      const neighbour = chainLinkCellsV1(index);
      const through = [...neighbour].filter((cell) => hole.has(cell));

      expect(
        through.length,
        `link ${String(index)} passes through link ${String(index - 1)}`,
      ).toBeGreaterThan(0);
    }
  });

  it('never lets two links share a cell', () => {
    const all = new Map<string, number>();
    for (let index = 0; index < CHAIN_LINK_COUNT_V1; index += 1) {
      for (const cell of chainLinkCellsV1(index)) {
        const owner = all.get(cell);
        expect(owner, `${cell} is claimed by links ${String(owner)} and ${String(index)}`)
          .toBeUndefined();
        all.set(cell, index);
      }
    }
  });

  it('holds only its two ends, so the middle is free to hang', () => {
    expect(CHAIN_ANCHOR_INDICES_V1).toEqual([0, CHAIN_LINK_COUNT_V1 - 1]);
    expect(CHAIN_LINK_COUNT_V1 - CHAIN_ANCHOR_INDICES_V1.length)
      .toBeGreaterThan(4);
  });
});

describe('the interlock check itself', () => {
  it('catches a chain pulled too far apart to stay linked', () => {
    // Widening the pitch past the outer radius is the negative control: the
    // rings stop reaching through each other and the chain falls apart.
    const cells = (index: number, pitch: number) => {
      const shifted = new Set<string>();
      for (const cell of chainLinkCellsV1(index)) {
        const [x, y, z] = cell.split(',').map(Number) as [number, number, number];
        shifted.add(`${String(x + index * (pitch - CHAIN_LINK_PITCH_V1))},${String(y)},${String(z)}`);
      }
      return shifted;
    };
    const hole = new Set<string>();
    for (const cell of chainLinkHoleCellsV1(0)) hole.add(cell);
    const stretched = cells(1, CHAIN_OUTER_RADIUS_V1 * 2 + 2);

    const threaded = [...stretched].some((cell) => hole.has(cell));
    expect(threaded, 'a stretched pair must not read as threaded').toBe(false);
  });

  it('catches links that share space', () => {
    const issues = chainInterlockIssuesV1(2);
    expect(issues).toEqual([]);
  });
});
