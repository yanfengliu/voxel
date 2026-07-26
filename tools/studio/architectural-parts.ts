import {
  resolvePartSettingsV1,
  type PartDefinitionV1,
  type PartSettingSpecV1,
} from './part-definition.js';
import type { PartFragmentV1 } from './recipe.js';

function fragment(
  size: readonly [number, number, number],
  role: string,
  paint: (x: number, y: number, z: number) => boolean,
): PartFragmentV1 {
  const [sx, sy, sz] = size;
  const voxels = new Array<number>(sx * sy * sz).fill(0);
  for (let z = 0; z < sz; z += 1) {
    for (let y = 0; y < sy; y += 1) {
      for (let x = 0; x < sx; x += 1) {
        if (paint(x, y, z)) voxels[x + sx * (y + sy * z)] = 1;
      }
    }
  }
  return { size, roles: ['empty', role], voxels };
}

const ARCH_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'width', label: 'Width', kind: 'int', min: 5, default: 9 },
  { key: 'height', label: 'Height', kind: 'int', min: 4, default: 7 },
  { key: 'depth', label: 'Depth', kind: 'int', default: 2 },
  { key: 'thickness', label: 'Arch thickness', kind: 'int', max: 16, default: 1 },
  { key: 'role', label: 'Role', kind: 'name', default: 'stone' },
];

export const archSpanPart: PartDefinitionV1 = {
  title: 'Arch span',
  summary: 'Connected piers carrying a curved ring around an open passage.',
  category: 'structure',
  tags: ['arch', 'portal', 'bridge', 'negative-space'],
  settings: ARCH_SETTINGS,
  presets: [
    { name: 'Gateway', summary: 'A compact single portal.', settings: {} },
    {
      name: 'Arcade',
      summary: 'A broad, weighty span.',
      settings: { width: 13, height: 8, depth: 2, thickness: 2 },
    },
  ],
  build(settings): PartFragmentV1 {
    const values = resolvePartSettingsV1(ARCH_SETTINGS, settings);
    const width = values.width as number;
    const height = values.height as number;
    const depth = values.depth as number;
    const role = values.role as string;
    const thickness = Math.min(
      values.thickness as number,
      Math.max(1, Math.floor((width - 2) / 2)),
      Math.max(1, height - 2),
    );
    const springY = Math.min(height - 2, Math.max(thickness, Math.floor(height * 0.42)));
    const centerX = (width - 1) / 2;
    const outerX = Math.max(1, (width - 1) / 2);
    const outerY = Math.max(1, height - 1 - springY);
    const plane = new Array<number>(width * height).fill(0);
    const set = (x: number, y: number): void => {
      if (x >= 0 && x < width && y >= 0 && y < height) plane[x + width * y] = 1;
    };
    for (let y = 0; y <= springY; y += 1) {
      for (let offset = 0; offset < thickness; offset += 1) {
        set(offset, y);
        set(width - 1 - offset, y);
      }
    }
    let previousY = springY;
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const curveY = springY + Math.round(outerY * Math.sqrt(Math.max(0, 1 - (dx * dx) / (outerX * outerX))));
      const low = Math.min(previousY, curveY);
      const high = Math.max(previousY, curveY);
      for (let pathY = low; pathY <= high; pathY += 1) {
        for (let band = 0; band < thickness; band += 1) set(x, pathY - band);
      }
      previousY = curveY;
    }
    const voxels: number[] = [];
    for (let z = 0; z < depth; z += 1) voxels.push(...plane);
    return { size: [width, height, depth], roles: ['empty', role], voxels };
  },
};

const TAPER_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'width', label: 'Base width', kind: 'int', default: 7 },
  { key: 'height', label: 'Height', kind: 'int', min: 2, default: 8 },
  { key: 'depth', label: 'Base depth', kind: 'int', default: 7 },
  { key: 'topWidth', label: 'Top width', kind: 'int', default: 3 },
  { key: 'topDepth', label: 'Top depth', kind: 'int', default: 3 },
  { key: 'role', label: 'Role', kind: 'name', default: 'mass' },
];

export const taperedMassPart: PartDefinitionV1 = {
  title: 'Tapered mass',
  summary: 'A centered solid whose horizontal profile narrows toward its crown.',
  category: 'massing',
  tags: ['taper', 'pyramid', 'buttress', 'massing'],
  settings: TAPER_SETTINGS,
  presets: [
    { name: 'Pyramid', summary: 'Narrows to a single-cell crown.', settings: { topWidth: 1, topDepth: 1 } },
    {
      name: 'Buttress',
      summary: 'A tall wedge-like support.',
      settings: { width: 5, height: 10, depth: 7, topWidth: 3, topDepth: 2 },
    },
  ],
  build(settings): PartFragmentV1 {
    const values = resolvePartSettingsV1(TAPER_SETTINGS, settings);
    const width = values.width as number;
    const height = values.height as number;
    const depth = values.depth as number;
    const topWidth = Math.min(width, values.topWidth as number);
    const topDepth = Math.min(depth, values.topDepth as number);
    const role = values.role as string;
    return fragment([width, height, depth], role, (x, y, z) => {
      const progress = y / (height - 1);
      const layerWidth = Math.max(1, Math.round(width + (topWidth - width) * progress));
      const layerDepth = Math.max(1, Math.round(depth + (topDepth - depth) * progress));
      const startX = Math.floor((width - layerWidth) / 2);
      const startZ = Math.floor((depth - layerDepth) / 2);
      return x >= startX && x < startX + layerWidth && z >= startZ && z < startZ + layerDepth;
    });
  },
};

const FRAME_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'width', label: 'Width', kind: 'int', min: 3, default: 8 },
  { key: 'height', label: 'Height', kind: 'int', min: 3, default: 7 },
  { key: 'depth', label: 'Depth', kind: 'int', default: 5 },
  { key: 'thickness', label: 'Member thickness', kind: 'int', max: 8, default: 1 },
  { key: 'role', label: 'Role', kind: 'name', default: 'frame' },
];

export const openFramePart: PartDefinitionV1 = {
  title: 'Open frame',
  summary: 'The edge members of a cuboid, leaving its faces and center open.',
  category: 'structure',
  tags: ['frame', 'cage', 'skeleton', 'negative-space'],
  settings: FRAME_SETTINGS,
  presets: [
    { name: 'Cube cage', summary: 'An equally proportioned open cage.', settings: { width: 7, height: 7, depth: 7 } },
    {
      name: 'Portal frame',
      summary: 'A broad, shallow structural frame.',
      settings: { width: 9, height: 8, depth: 3, thickness: 1 },
    },
  ],
  build(settings): PartFragmentV1 {
    const values = resolvePartSettingsV1(FRAME_SETTINGS, settings);
    const width = values.width as number;
    const height = values.height as number;
    const depth = values.depth as number;
    const thickness = Math.min(
      values.thickness as number,
      Math.max(1, Math.ceil(Math.min(width, height, depth) / 2)),
    );
    const role = values.role as string;
    return fragment([width, height, depth], role, (x, y, z) => {
      const xEdge = x < thickness || x >= width - thickness;
      const yEdge = y < thickness || y >= height - thickness;
      const zEdge = z < thickness || z >= depth - thickness;
      return Number(xEdge) + Number(yEdge) + Number(zEdge) >= 2;
    });
  },
};

const STAIR_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'steps', label: 'Steps', kind: 'int', max: 16, default: 6 },
  { key: 'width', label: 'Width', kind: 'int', default: 5 },
  { key: 'rise', label: 'Step rise', kind: 'int', max: 4, default: 1 },
  { key: 'run', label: 'Step run', kind: 'int', max: 4, default: 2 },
  { key: 'role', label: 'Role', kind: 'name', default: 'stair' },
];

export const stairRunPart: PartDefinitionV1 = {
  title: 'Stair run',
  summary: 'A connected solid run of repeated risers and treads.',
  category: 'circulation',
  tags: ['stairs', 'steps', 'terrace', 'slope'],
  settings: STAIR_SETTINGS,
  presets: [
    { name: 'Stoop', summary: 'Four broad entrance steps.', settings: { steps: 4, width: 7, rise: 1, run: 2 } },
    {
      name: 'Monumental',
      summary: 'A long ceremonial stair.',
      settings: { steps: 8, width: 11, rise: 1, run: 2 },
    },
  ],
  build(settings): PartFragmentV1 {
    const values = resolvePartSettingsV1(STAIR_SETTINGS, settings);
    const steps = values.steps as number;
    const width = values.width as number;
    const rise = values.rise as number;
    const run = values.run as number;
    const role = values.role as string;
    return fragment([width, steps * rise, steps * run], role, (_x, y, z) => {
      const step = Math.floor(z / run);
      return y < (step + 1) * rise;
    });
  },
};
