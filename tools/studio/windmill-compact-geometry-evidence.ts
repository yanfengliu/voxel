import {
  WINDMILL_COMPACT_GRAIN_METERS,
  WINDMILL_COMPACT_PARAMETER_RANGES_V1,
  type WindmillCompactAssetV1,
  type WindmillCompactInterfaceV1,
  type WindmillCompactParametersV1,
  type WindmillCompactSailFrameV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry-contract.js';
import {
  crossWindmillCompactTripleV1 as cross,
  normalizeWindmillCompactTripleV1 as normalize,
  subtractWindmillCompactTripleV1 as subtract,
  windmillCompactTripleV1 as triple,
} from './windmill-compact-geometry-math.js';
import { windmillCompactInterfaceGrammarV1 } from './windmill-compact-interface-grammar.js';

function overlapLength(
  firstAt: WindmillCompactTripleV1,
  firstSize: WindmillCompactTripleV1,
  secondAt: WindmillCompactTripleV1,
  secondSize: WindmillCompactTripleV1,
  axis: number,
): number {
  return Math.max(0, Math.min(
    firstAt[axis]! + firstSize[axis]!,
    secondAt[axis]! + secondSize[axis]!,
  ) - Math.max(firstAt[axis]!, secondAt[axis]!));
}

function sharedFaceArea(
  first: WindmillCompactAssetV1['boxes'][number],
  second: WindmillCompactAssetV1['boxes'][number],
): number {
  let maximum = 0;
  for (let normal = 0; normal < 3; normal += 1) {
    const firstEnd = first.at[normal]! + first.size[normal]!;
    const secondEnd = second.at[normal]! + second.size[normal]!;
    const touches = firstEnd === second.at[normal]
      || secondEnd === first.at[normal];
    if (!touches) continue;
    const tangents = [0, 1, 2].filter((axis) => axis !== normal);
    maximum = Math.max(maximum, tangents.reduce((area, axis) =>
      area * overlapLength(
        first.at,
        first.size,
        second.at,
        second.size,
        axis,
      ), 1));
  }
  return maximum;
}

function interfacePairKey(firstKey: string, secondKey: string): string {
  return firstKey < secondKey
    ? `${firstKey}\u0000${secondKey}`
    : `${secondKey}\u0000${firstKey}`;
}

export function windmillCompactRequiredInterfacesV1(
  parameters: WindmillCompactParametersV1,
  assets: Readonly<Record<string, WindmillCompactAssetV1>>,
): readonly WindmillCompactInterfaceV1[] {
  const grammar = windmillCompactInterfaceGrammarV1(parameters);
  const globallyOwnedKeys = new Map<string, string>();
  const suppliedAssetKeys = new Set<string>();
  Object.entries(assets).forEach(([recordKey, asset]) => {
    if (recordKey !== asset.key) {
      throw new Error(
        `Cannot verify compact windmill interfaces: asset record key `
        + `'${recordKey}' contains '${asset.key}'. Use the body key as the `
        + 'record key so authored interface needs resolve unambiguously.',
      );
    }
    if (suppliedAssetKeys.has(asset.key)) {
      throw new Error(
        `Cannot verify compact windmill interfaces: asset '${asset.key}' is `
        + 'supplied more than once. Each rigid body needs one exact record.',
      );
    }
    suppliedAssetKeys.add(asset.key);
    const expectedKeys = (
      grammar.expectedBoxKeys as Readonly<Record<string, readonly string[]>>
    )[asset.key];
    if (expectedKeys === undefined) {
      throw new Error(
        `Cannot verify compact windmill interfaces: asset '${asset.key}' is `
        + `not one of the authored bodies [`
        + `${Object.keys(grammar.expectedBoxKeys).join(', ')}].`,
      );
    }
    const expectedKeySet = new Set(expectedKeys);
    if (expectedKeySet.size !== expectedKeys.length) {
      throw new Error(
        `Cannot verify compact windmill '${asset.key}' interfaces: its `
        + 'exact-box grammar repeats a box key. Give every authored solid '
        + 'one identity before checking geometry.',
      );
    }
    const boxesByKey = new Map(asset.boxes.map((box) => [box.key, box]));
    const missingBoxKeys = expectedKeys.filter((key) => !boxesByKey.has(key));
    if (missingBoxKeys.length > 0) {
      throw new Error(
        `Cannot verify compact windmill '${asset.key}' interfaces: required `
        + `box(es) ${missingBoxKeys.map((key) => `'${key}'`).join(', ')} are `
        + 'missing. Restore the need-led solids or revise the authored '
        + 'interface grammar and its purpose evidence.',
      );
    }
    const unexpectedBoxKeys = asset.boxes
      .map((box) => box.key)
      .filter((key) => !expectedKeySet.has(key));
    if (unexpectedBoxKeys.length > 0) {
      throw new Error(
        `Cannot verify compact windmill '${asset.key}' interfaces: box(es) `
        + `${unexpectedBoxKeys.map((key) => `'${key}'`).join(', ')} have no `
        + 'authored need in the exact-box grammar. Remove them or author '
        + 'their dependency before adding geometry.',
      );
    }
    const adjacency = new Map(
      asset.boxes.map((box) => [box.key, new Set<string>()]),
    );
    const observedInterfaces = new Map<string, number>();
    asset.boxes.forEach((first, index) => {
      const existingOwner = globallyOwnedKeys.get(first.key);
      if (existingOwner !== undefined) {
        throw new Error(
          `Cannot author compact windmill interface evidence: box key `
          + `'${first.key}' is reused by '${existingOwner}' and `
          + `'${asset.key}'. Box keys must identify one exact visible solid.`,
        );
      }
      globallyOwnedKeys.set(first.key, asset.key);
      asset.boxes.slice(index + 1).forEach((second) => {
        const area = sharedFaceArea(first, second);
        if (area <= 0) return;
        adjacency.get(first.key)!.add(second.key);
        adjacency.get(second.key)!.add(first.key);
        observedInterfaces.set(interfacePairKey(first.key, second.key), area);
      });
    });
    const requiredNeeds = grammar.interfaceNeeds.filter(
      (need) => need.assetKey === asset.key,
    );
    const requiredPairs = new Map<string, typeof requiredNeeds[number]>();
    requiredNeeds.forEach((need) => {
      const pairKey = interfacePairKey(need.fromBoxKey, need.toBoxKey);
      const existingNeed = requiredPairs.get(pairKey);
      if (existingNeed !== undefined) {
        throw new Error(
          `Cannot verify compact windmill interface grammar: `
          + `'${existingNeed.needId}' and '${need.needId}' both claim the `
          + `same exact face pair '${need.fromBoxKey}' <-> `
          + `'${need.toBoxKey}'. Merge or distinguish the authored needs.`,
        );
      }
      requiredPairs.set(pairKey, need);
      if (!expectedKeySet.has(need.fromBoxKey)
          || !expectedKeySet.has(need.toBoxKey)) {
        throw new Error(
          `Cannot verify compact windmill interface need '${need.needId}': `
          + `endpoint '${need.fromBoxKey}' or '${need.toBoxKey}' is absent `
          + `from the authored '${asset.key}' exact-box grammar.`,
        );
      }
      const actualArea = observedInterfaces.get(
        interfacePairKey(need.fromBoxKey, need.toBoxKey),
      ) ?? 0;
      if (actualArea < need.minimumFaceAreaVoxels) {
        throw new Error(
          `Cannot verify compact windmill interface need '${need.needId}': `
          + `'${need.fromBoxKey}' and '${need.toBoxKey}' share `
          + `${String(actualArea)} face voxel(s), but the authored load path `
          + `requires at least ${String(need.minimumFaceAreaVoxels)}. `
          + `Restore that exact face contact; ${need.job}`,
        );
      }
    });
    observedInterfaces.forEach((_area, pairKey) => {
      if (requiredPairs.has(pairKey)) return;
      const delimiter = pairKey.indexOf('\u0000');
      const firstKey = pairKey.slice(0, delimiter);
      const secondKey = pairKey.slice(delimiter + 1);
      throw new Error(
        `Cannot verify compact windmill '${asset.key}': unexpected same-body `
        + `face interface '${firstKey}' <-> '${secondKey}' has no authored `
        + 'need. Separate the solids or add independent purpose evidence '
        + 'before authoring the contact.',
      );
    });
    if (asset.boxes.length <= 1) return;
    const firstKey = asset.boxes[0]!.key;
    const visited = new Set<string>([firstKey]);
    const pending = [firstKey];
    while (pending.length > 0) {
      const current = pending.pop()!;
      adjacency.get(current)!.forEach((neighbor) => {
        if (visited.has(neighbor)) return;
        visited.add(neighbor);
        pending.push(neighbor);
      });
    }
    if (visited.size !== asset.boxes.length) {
      const disconnected = asset.boxes
        .filter((box) => !visited.has(box.key))
        .map(({ key }) => `'${key}'`);
      throw new Error(
        `Cannot verify compact windmill '${asset.key}' interface grammar: `
        + `box(es) `
        + `${disconnected.join(', ')} are outside the face-connected `
        + `authored load-path component containing '${firstKey}'. Add an `
        + 'independently justified interface need or remove the orphan solid.',
      );
    }
  });
  return Object.freeze(grammar.interfaceNeeds
    .filter((need) => suppliedAssetKeys.has(need.assetKey))
    .map((need) => Object.freeze({
      fromBoxKey: need.fromBoxKey,
      toBoxKey: need.toBoxKey,
      minimumFaceAreaVoxels: need.minimumFaceAreaVoxels,
    })));
}

export function windmillCompactProjectedCellSpanV1(
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
      'Cannot derive compact windmill plate span from an empty or flat occupied union.',
    );
  }
  return maximum - minimum;
}

export function windmillCompactStepEndpointsV1(
  cells: readonly WindmillCompactTripleV1[],
  centroidY: number,
): readonly [WindmillCompactTripleV1, WindmillCompactTripleV1] {
  const centers = [...new Map(cells.map((cell) => [
    `${String(cell[0])},${String(cell[2])}`,
    triple(cell[0] + 0.5, centroidY, cell[2] + 0.5),
  ])).values()];
  let first = centers[0];
  let second = centers[1];
  let farthest = -Infinity;
  centers.forEach((left, index) => {
    centers.slice(index + 1).forEach((right) => {
      const distance = (right[0] - left[0]) ** 2
        + (right[2] - left[2]) ** 2;
      if (distance > farthest) {
        farthest = distance;
        first = left;
        second = right;
      }
    });
  });
  if (first === undefined || second === undefined || farthest <= 0) {
    throw new Error(
      'Cannot derive compact windmill pitch: the visible panel needs two distinct step courses.',
    );
  }
  return second[2] > first[2]
      || (second[2] === first[2] && second[0] >= first[0])
    ? Object.freeze([first, second])
    : Object.freeze([second, first]);
}

export function assertNoWindmillOpeningVoxelOverlapV1(
  assets: Readonly<Record<string, WindmillCompactAssetV1>>,
): 0 {
  const owners = new Map<string, string>();
  Object.values(assets).forEach((asset) => {
    asset.occupiedCells.forEach((cell) => {
      const world = cell.map((value, axis) =>
        value + asset.worldOriginVoxels[axis]!) as [number, number, number];
      const key = world.join(',');
      const existing = owners.get(key);
      if (existing !== undefined) {
        throw new Error(
          `Cannot author compact windmill opening pose: '${existing}' and `
          + `'${asset.key}' occupy world voxel [${key}]. Separate the bodies `
          + 'or declare a face contact instead of positive-volume overlap.',
        );
      }
      owners.set(key, asset.key);
    });
  });
  return 0;
}

export function validateWindmillCompactParametersV1(
  parameters: WindmillCompactParametersV1,
): void {
  Object.entries(WINDMILL_COMPACT_PARAMETER_RANGES_V1).forEach(
    ([name, allowed]) => {
      const value = parameters[name as keyof WindmillCompactParametersV1];
      if (!(allowed as readonly number[]).includes(value)) {
        throw new Error(
          `Cannot author compact windmill parameter '${name}' as `
          + `${String(value)}; expected one of [${allowed.join(', ')}].`,
        );
      }
    },
  );
}

export function windmillCompactSailFrameV1(
  key: WindmillCompactSailFrameV1['key'],
  rotor: WindmillCompactAssetV1,
  axisWorld: WindmillCompactTripleV1,
): WindmillCompactSailFrameV1 {
  const prefix = key === 'north-sail' ? 'north-panel-' : 'south-panel-';
  const boxes = rotor.boxes.filter((box) => box.key.startsWith(prefix));
  const worldCells = boxes.flatMap((box) => {
    const cells: WindmillCompactTripleV1[] = [];
    for (let z = box.at[2]; z < box.at[2] + box.size[2]; z += 1) {
      for (let y = box.at[1]; y < box.at[1] + box.size[1]; y += 1) {
        for (let x = box.at[0]; x < box.at[0] + box.size[0]; x += 1) {
          cells.push(triple(
            x + rotor.worldOriginVoxels[0],
            y + rotor.worldOriginVoxels[1],
            z + rotor.worldOriginVoxels[2],
          ));
        }
      }
    }
    return cells;
  });
  const centroidWorld = triple(
    worldCells.reduce((sum, cell) => sum + cell[0] + 0.5, 0)
      / worldCells.length,
    worldCells.reduce((sum, cell) => sum + cell[1] + 0.5, 0)
      / worldCells.length,
    worldCells.reduce((sum, cell) => sum + cell[2] + 0.5, 0)
      / worldCells.length,
  );
  const radial = normalize(triple(
    centroidWorld[0] - axisWorld[0],
    centroidWorld[1] - axisWorld[1],
    0,
  ));
  const endpointsWorld = windmillCompactStepEndpointsV1(
    worldCells,
    centroidWorld[1],
  );
  const chord = normalize(subtract(endpointsWorld[1], endpointsWorld[0]));
  const normal = normalize(cross(radial, chord));
  const radialSpan = windmillCompactProjectedCellSpanV1(worldCells, radial);
  const chordSpan = windmillCompactProjectedCellSpanV1(worldCells, chord);
  const local = (world: WindmillCompactTripleV1) =>
    subtract(world, rotor.bodyWorldVoxels);
  const panelOccupiedCells = Object.freeze(worldCells.map((cell) => triple(
    cell[0] - rotor.worldOriginVoxels[0],
    cell[1] - rotor.worldOriginVoxels[1],
    cell[2] - rotor.worldOriginVoxels[2],
  )).sort((left, right) =>
    left[2] - right[2] || left[1] - right[1] || left[0] - right[0]));
  const areaVoxels = radialSpan * chordSpan;
  return Object.freeze({
    key,
    assetKey: 'rotor',
    panelBoxKeys: Object.freeze(boxes.map((box) => box.key)),
    panelOccupiedCells,
    localShaftPointVoxels: local(axisWorld),
    worldShaftPointVoxels: axisWorld,
    localCentroidVoxels: local(centroidWorld),
    worldCentroidVoxels: centroidWorld,
    localRadialUnit: radial,
    localChordUnit: chord,
    localNormalUnit: normal,
    localStepEndpointsVoxels: Object.freeze([
      local(endpointsWorld[0]),
      local(endpointsWorld[1]),
    ] as const),
    worldStepEndpointsVoxels: endpointsWorld,
    radialSpanVoxels: radialSpan,
    chordSpanVoxels: chordSpan,
    equivalentPlateAreaSquareVoxels: areaVoxels,
    equivalentPlateAreaSquareMeters:
      areaVoxels * WINDMILL_COMPACT_GRAIN_METERS ** 2,
    honestyBoundary:
      'low-resolution-equivalent-flat-plate-derived-from-visible-step-endpoints',
  });
}
