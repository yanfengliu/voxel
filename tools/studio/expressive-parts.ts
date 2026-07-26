import {
  resolvePartSettingsV1,
  type PartDefinitionV1,
  type PartSettingSpecV1,
} from './part-definition.js';
import type { PartFragmentV1 } from './recipe.js';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function paintLine(
  paint: (x: number, y: number, role: number) => void,
  from: readonly [number, number],
  to: readonly [number, number],
  role: number,
): void {
  let [x, y] = from;
  const [toX, toY] = to;
  const dx = Math.abs(toX - x);
  const dy = Math.abs(toY - y);
  const stepX = x < toX ? 1 : -1;
  const stepY = y < toY ? 1 : -1;
  let error = dx - dy;
  paint(x, y, role);
  while (x !== toX || y !== toY) {
    const twice = error * 2;
    if (twice > -dy) {
      error -= dy;
      x += stepX;
      paint(x, y, role);
    }
    if (twice < dx) {
      error += dx;
      y += stepY;
      paint(x, y, role);
    }
  }
}

const WHEEL_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'radius', label: 'Radius', kind: 'int', min: 2, max: 31, default: 6 },
  { key: 'depth', label: 'Depth', kind: 'int', default: 2 },
  { key: 'hubRadius', label: 'Hub radius', kind: 'int', max: 8, default: 1 },
  { key: 'spokes', label: 'Spokes', kind: 'int', min: 3, max: 16, default: 8 },
  { key: 'rimRole', label: 'Rim role', kind: 'name', default: 'rim' },
  { key: 'hubRole', label: 'Hub role', kind: 'name', default: 'hub' },
  { key: 'spokeRole', label: 'Spoke role', kind: 'name', default: 'spoke' },
];

export const radialWheelPart: PartDefinitionV1 = {
  title: 'Radial wheel',
  summary: 'A hollow circular rim joined to a hub by seed-rotated spokes.',
  category: 'mechanical',
  tags: ['wheel', 'radial', 'spokes', 'negative-space', 'varies'],
  settings: WHEEL_SETTINGS,
  presets: [
    { name: 'Wagon wheel', summary: 'A light eight-spoke wheel.', settings: {} },
    {
      name: 'Flywheel',
      summary: 'A broad wheel with a heavy hub.',
      settings: { radius: 9, depth: 3, hubRadius: 3, spokes: 6 },
    },
  ],
  build(settings, seed): PartFragmentV1 {
    const values = resolvePartSettingsV1(WHEEL_SETTINGS, settings);
    const radius = values.radius as number;
    const depth = values.depth as number;
    const hubRadius = Math.min(radius - 1, values.hubRadius as number);
    const spokes = values.spokes as number;
    const diameter = radius * 2 + 1;
    const plane = new Array<number>(diameter * diameter).fill(0);
    const set = (x: number, y: number, role: number): void => {
      if (x >= 0 && x < diameter && y >= 0 && y < diameter) plane[x + diameter * y] = role;
    };
    for (let y = 0; y < diameter; y += 1) {
      for (let x = 0; x < diameter; x += 1) {
        const distance = Math.hypot(x - radius, y - radius);
        if (distance >= radius - 0.9 && distance <= radius + 0.45) set(x, y, 1);
      }
    }
    const phase = (seed >>> 0) % 2 === 0 ? 0 : Math.PI / spokes;
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = phase + (spoke * Math.PI * 2) / spokes;
      const endX = radius + Math.round(Math.cos(angle) * radius);
      const endY = radius + Math.round(Math.sin(angle) * radius);
      paintLine((x, y, role) => {
        if (plane[x + diameter * y] === 0) set(x, y, role);
      }, [radius, radius], [endX, endY], 3);
    }
    for (let y = 0; y < diameter; y += 1) {
      for (let x = 0; x < diameter; x += 1) {
        if (Math.hypot(x - radius, y - radius) <= hubRadius + 0.25) set(x, y, 2);
      }
    }
    const voxels: number[] = [];
    for (let z = 0; z < depth; z += 1) voxels.push(...plane);
    return {
      size: [diameter, diameter, depth],
      roles: ['empty', values.rimRole as string, values.hubRole as string, values.spokeRole as string],
      voxels,
    };
  },
};

const BRANCH_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'height', label: 'Height', kind: 'int', min: 4, default: 12 },
  { key: 'spread', label: 'Spread', kind: 'int', min: 2, max: 15, default: 5 },
  { key: 'trunk', label: 'Trunk width', kind: 'int', max: 5, default: 1 },
  { key: 'branches', label: 'Branches', kind: 'int', max: 8, default: 5 },
  { key: 'trunkRole', label: 'Trunk role', kind: 'name', default: 'trunk' },
  { key: 'branchRole', label: 'Branch role', kind: 'name', default: 'branch' },
];

export const branchingFormPart: PartDefinitionV1 = {
  title: 'Branching form',
  summary: 'A central trunk carrying connected, seed-varied lateral branches.',
  category: 'organic',
  tags: ['branch', 'tree', 'coral', 'network', 'varies'],
  settings: BRANCH_SETTINGS,
  presets: [
    {
      name: 'Sapling',
      summary: 'A narrow young branching form.',
      settings: { height: 9, spread: 3, trunk: 1, branches: 3 },
    },
    {
      name: 'Canopy scaffold',
      summary: 'A broad, many-branched armature.',
      settings: { height: 16, spread: 7, trunk: 3, branches: 8 },
    },
  ],
  build(settings, seed): PartFragmentV1 {
    const values = resolvePartSettingsV1(BRANCH_SETTINGS, settings);
    const height = values.height as number;
    const spread = values.spread as number;
    const trunk = Math.min(spread * 2 + 1, values.trunk as number);
    const branches = values.branches as number;
    const diameter = spread * 2 + 1;
    const center = spread;
    const voxels = new Array<number>(diameter * height * diameter).fill(0);
    const set = (x: number, y: number, z: number, role: number): void => {
      voxels[x + diameter * (y + height * z)] = role;
    };
    const trunkStart = center - Math.floor((trunk - 1) / 2);
    for (let z = trunkStart; z < trunkStart + trunk; z += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = trunkStart; x < trunkStart + trunk; x += 1) set(x, y, z, 1);
      }
    }
    const random = seededRandom(seed);
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
    for (let branch = 0; branch < branches; branch += 1) {
      const startY = 1 + Math.floor(((branch + 1) * (height - 3)) / (branches + 1));
      const [dx, dz] = directions[(branch + Math.floor(random() * directions.length)) % directions.length]!;
      const length = Math.max(2, Math.round(spread * (0.55 + random() * 0.45)));
      const lift = 1 + Math.floor(random() * Math.max(1, Math.min(3, height - 1 - startY)));
      let previousY = startY;
      for (let distance = 1; distance <= length; distance += 1) {
        const x = center + dx * distance;
        const z = center + dz * distance;
        const nextY = Math.min(height - 1, startY + Math.floor((distance * lift) / length));
        for (let y = previousY; y <= nextY; y += 1) set(x, y, z, 2);
        previousY = nextY;
      }
    }
    return {
      size: [diameter, height, diameter],
      roles: ['empty', values.trunkRole as string, values.branchRole as string],
      voxels,
    };
  },
};

const TRUSS_SETTINGS: readonly PartSettingSpecV1[] = [
  { key: 'length', label: 'Length', kind: 'int', min: 5, default: 16 },
  { key: 'height', label: 'Height', kind: 'int', min: 3, max: 32, default: 6 },
  { key: 'depth', label: 'Depth', kind: 'int', default: 1 },
  { key: 'chordRole', label: 'Chord role', kind: 'name', default: 'chord' },
  { key: 'braceRole', label: 'Brace role', kind: 'name', default: 'brace' },
];

export const trussSpanPart: PartDefinitionV1 = {
  title: 'Truss span',
  summary: 'Parallel chords joined by open, seed-oriented diagonal bracing.',
  category: 'structure',
  tags: ['truss', 'bridge', 'roof', 'lattice', 'negative-space', 'varies'],
  settings: TRUSS_SETTINGS,
  presets: [
    { name: 'Footbridge', summary: 'A light repeating span.', settings: {} },
    {
      name: 'Roof truss',
      summary: 'A compact, deeper roof armature.',
      settings: { length: 13, height: 7, depth: 2 },
    },
  ],
  build(settings, seed): PartFragmentV1 {
    const values = resolvePartSettingsV1(TRUSS_SETTINGS, settings);
    const length = values.length as number;
    const height = values.height as number;
    const depth = values.depth as number;
    const plane = new Array<number>(length * height).fill(0);
    const set = (x: number, y: number, role: number): void => { plane[x + length * y] = role; };
    for (let x = 0; x < length; x += 1) {
      set(x, 0, 1);
      set(x, height - 1, 1);
    }
    for (let y = 0; y < height; y += 1) {
      set(0, y, 1);
      set(length - 1, y, 1);
    }
    const bayWidth = height - 1;
    let bay = 0;
    for (let startX = 0; startX < length - 1; startX += bayWidth) {
      const endX = Math.min(length - 1, startX + bayWidth);
      const rising = (bay + ((seed >>> 0) % 2)) % 2 === 0;
      let previousY = rising ? 0 : height - 1;
      for (let x = startX; x <= endX; x += 1) {
        const progress = (x - startX) / (endX - startX);
        const nextY = Math.round((rising ? progress : 1 - progress) * (height - 1));
        const low = Math.min(previousY, nextY);
        const high = Math.max(previousY, nextY);
        for (let y = low; y <= high; y += 1) if (plane[x + length * y] === 0) set(x, y, 2);
        previousY = nextY;
      }
      bay += 1;
    }
    const voxels: number[] = [];
    for (let z = 0; z < depth; z += 1) voxels.push(...plane);
    return {
      size: [length, height, depth],
      roles: ['empty', values.chordRole as string, values.braceRole as string],
      voxels,
    };
  },
};
