import {
  resolvePartSettingsV1,
  type PartDefinitionV1,
  type PartSettingSpecV1,
} from './part-definition.js';
import type { PartFragmentV1 } from './recipe.js';

/**
 * One closed ring, the single part a chain is built from.
 *
 * A chain link's plane must contain the chain's own axis, and neighbouring
 * links sit at ninety degrees to each other. Quarter-turns in a scene only
 * rotate about the up axis, so the plane is a setting here rather than
 * something a placement can supply: a chain running along x needs rings whose
 * normal is z and rings whose normal is y, and only the part can build both.
 *
 * Nothing joins the links. They stay together because a ring is a solid body
 * with a hole, and a neighbour's material lies inside that hole.
 */

export const CHAIN_RING_PLANES_V1 = Object.freeze(['xy', 'xz'] as const);

export type ChainRingPlaneV1 = typeof CHAIN_RING_PLANES_V1[number];

const CHAIN_RING_SETTINGS: readonly PartSettingSpecV1[] = [
  {
    key: 'outerRadius',
    label: 'Outer radius',
    kind: 'int',
    default: 5,
    summary: 'Cells from the centre to the outside of the ring.',
  },
  {
    key: 'innerRadius',
    label: 'Inner radius',
    kind: 'int',
    default: 3,
    summary: 'Cells from the centre to the hole. The gap a neighbour passes through.',
  },
  {
    key: 'depth',
    label: 'Depth',
    kind: 'int',
    default: 2,
    summary: 'How thick the ring is along its own normal.',
  },
  {
    key: 'plane',
    label: 'Plane',
    kind: 'name',
    default: 'xy',
    summary: "Which plane the ring lies in: 'xy' stands upright, 'xz' lies crossed.",
  },
  { key: 'role', label: 'Role', kind: 'name', default: 'steel' },
];

/**
 * A cell belongs to the ring when its centre falls inside the annulus. Two
 * cells of radial thickness is the minimum that stays face-connected all the
 * way round; at one cell the ring breaks into arcs on the diagonals, which is
 * a broken ring rather than a thin one.
 */
function ringCell(
  across: number,
  up: number,
  outerRadius: number,
  innerRadius: number,
): boolean {
  const distance = Math.hypot(across - outerRadius, up - outerRadius);
  return distance >= innerRadius && distance <= outerRadius;
}

export function chainRingSizeV1(
  outerRadius: number,
  depth: number,
  plane: ChainRingPlaneV1,
): readonly [number, number, number] {
  const span = outerRadius * 2 + 1;
  return plane === 'xy' ? [span, span, depth] : [span, depth, span];
}

export const chainRingPart: PartDefinitionV1 = {
  title: 'Chain ring',
  summary:
    'One closed ring with a hole through it, in either the upright or the '
    + 'crossed plane, so alternating links can thread each other.',
  category: 'mechanism',
  tags: ['chain', 'ring', 'link', 'steel'],
  settings: CHAIN_RING_SETTINGS,
  presets: [
    { name: 'Upright link', summary: 'Stands in the hanging plane.', settings: { plane: 'xy' } },
    { name: 'Crossed link', summary: 'Turned ninety degrees to its neighbours.', settings: { plane: 'xz' } },
  ],
  build(settings): PartFragmentV1 {
    const resolved = resolvePartSettingsV1(CHAIN_RING_SETTINGS, settings);
    const outerRadius = resolved.outerRadius as number;
    const innerRadius = resolved.innerRadius as number;
    const depth = resolved.depth as number;
    const plane = resolved.plane as string;
    const role = resolved.role as string;

    if (innerRadius >= outerRadius) {
      throw new Error(
        `Cannot build a chain ring with inner radius ${String(innerRadius)} and `
        + `outer radius ${String(outerRadius)}: the hole must be smaller than `
        + 'the ring. Give the inner radius a value below the outer one.',
      );
    }
    if (outerRadius - innerRadius < 2) {
      throw new Error(
        `Cannot build a chain ring only ${String(outerRadius - innerRadius)} `
        + 'cell(s) thick: at less than two the ring breaks into arcs on the '
        + 'diagonals and is no longer closed. Widen the gap between the radii.',
      );
    }
    if (plane !== 'xy' && plane !== 'xz') {
      throw new Error(
        `Cannot build a chain ring in plane '${plane}'. A link's plane must `
        + "contain the chain axis, so it is either 'xy' (upright) or 'xz' "
        + '(crossed).',
      );
    }

    const size = chainRingSizeV1(outerRadius, depth, plane);
    const [sx, sy, sz] = size;
    const voxels = new Array<number>(sx * sy * sz).fill(0);
    for (let z = 0; z < sz; z += 1) {
      for (let y = 0; y < sy; y += 1) {
        for (let x = 0; x < sx; x += 1) {
          const inRing = plane === 'xy'
            ? ringCell(x, y, outerRadius, innerRadius)
            : ringCell(x, z, outerRadius, innerRadius);
          if (inRing) voxels[x + sx * (y + sy * z)] = 1;
        }
      }
    }

    return { size, roles: ['empty', role], voxels };
  },
};
