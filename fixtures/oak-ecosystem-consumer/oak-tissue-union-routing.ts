import type { OakOrganSnapshotV1 } from './oak-types.js';
import {
  assertOakTissueFaceNeighborRangeV1,
  findOakTissuePathV1,
  OAK_TISSUE_FACE_NEIGHBOR_ID_OFFSETS_V1,
  OAK_TISSUE_FACE_NEIGHBORS_V1,
} from './oak-tissue-path-search.js';
import {
  groupOakTissueSourcesByOwnerV1,
  isOakTissueProximalChildSourceV1,
  retainedOakTissueAnchorSourceKeysV1,
} from './oak-tissue-union-ownership.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
  oakTissueCellKeyV1,
  roundOakTissueCellV1,
  type OakTissueLatticeCellV1,
  type OakTissueMaterialCellV1,
  type OakTissuePortWitnessV1,
  type OakTissueSourceAssignmentV1,
  type OakTissueSourceCellV1,
  type OakTissueUnionRoutingV1,
} from './oak-tissue-lattice.js';

export {
  oakTissueCellCenterM_V1,
  oakTissueCellIdV1,
  oakTissueCellKeyV1,
  roundOakTissueCellV1,
} from './oak-tissue-lattice.js';
export type {
  OakTissueLatticeCellV1,
  OakTissueMaterialCellV1,
  OakTissuePortWitnessV1,
  OakTissueSourceAssignmentV1,
  OakTissueSourceCellV1,
  OakTissueUnionRoutingV1,
} from './oak-tissue-lattice.js';
const AXIS_ORDERS = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]] as const;
const ALLOCATION_SHELLS = Array.from({ length: 17 }, (_, radius) => {
  const offsets: OakTissueLatticeCellV1[] = [];
  for (let x = -radius; x <= radius; x += 1) {
    for (let y = -radius; y <= radius; y += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === radius) offsets.push([x, y, z]);
      }
    }
  }
  return offsets;
});

export function buildOakTissueUnionRoutingV1(
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  sources: readonly OakTissueSourceCellV1[],
): OakTissueUnionRoutingV1 {
  const materialCells = new Map<number, OakTissueMaterialCellV1>();
  const ports = reservePorts(organs, materialCells);
  const sourceAssignments = allocateSources(sources, materialCells);
  const sourcesByOwner = groupOakTissueSourcesByOwnerV1(sourceAssignments);
  const detachedOwners = new Set([...organs.values()]
    .filter((organ) => organ.stage === 'detached').map((organ) => organ.key));
  const retainedSourceKeys = retainedOakTissueAnchorSourceKeysV1(sourceAssignments, ports);
  for (const port of ports) {
    const parentAnchor = nearestAnchor(
      port.parentCell,
      (sourcesByOwner.get(port.parentOrganKey) ?? []).filter((cell) =>
        materialCells.get(oakTissueCellIdV1(cell))?.ownerOrganKey === port.parentOrganKey),
    );
    const childAnchor = nearestAnchor(port.childCell, sourcesByOwner.get(port.childOrganKey) ?? []);
    port.parentPath = addOwnedPath(
      materialCells,
      port.parentCell,
      parentAnchor,
      port.parentOrganKey,
      organs,
      sourceAssignments,
      retainedSourceKeys,
    );
    port.childPath = addUnionPath(
      materialCells,
      port.childCell,
      childAnchor,
      port.childOrganKey,
      stableHash(port.childOrganKey),
      port.childOrganKey,
      false,
      detachedOwners,
    );
  }
  addSourceScaffold(detachedOwners, sources, sourceAssignments, materialCells);
  return { materialCells, sourceAssignments, ports };
}

function reservePorts(
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  cells: Map<number, OakTissueMaterialCellV1>,
): OakTissuePortWitnessV1[] {
  const children = [...organs.values()]
    .filter((organ) => organ.parentKey !== null)
    .sort((left, right) => left.key.localeCompare(right.key));
  const parentByCell = new Map<number, string>();
  for (const child of children) {
    if (!organs.has(child.parentKey!)) {
      throw new Error(`Living oak organ '${child.key}' has no presented parent '${child.parentKey!}'.`);
    }
    const cell = roundOakTissueCellV1([child.positionM.x, child.positionM.y, child.positionM.z]);
    const id = oakTissueCellIdV1(cell);
    const existing = parentByCell.get(id);
    if (existing !== undefined && existing !== child.parentKey) {
      throw new Error(
        `Oak port cell '${oakTissueCellKeyV1(cell)}' for child '${child.key}' has conflicting `
        + `parents '${existing}' and '${child.parentKey!}'.`,
      );
    }
    parentByCell.set(id, child.parentKey!);
    putReserved(cells, cell, child.parentKey!, 'parent-port');
  }

  const usedConnectors = new Map<number, OakTissueLatticeCellV1[]>();
  return children.map((child) => {
    const parentCell = roundOakTissueCellV1([
      child.positionM.x,
      child.positionM.y,
      child.positionM.z,
    ]);
    const groupId = oakTissueCellIdV1(parentCell);
    const used = usedConnectors.get(groupId) ?? [];
    const direction = [child.direction.x, child.direction.y, child.direction.z] as const;
    const candidates = [...OAK_TISSUE_FACE_NEIGHBORS_V1].sort((left, right) => {
      const separation = (candidate: OakTissueLatticeCellV1): number => used.length === 0
        ? 0
        : Math.min(...used.map((prior) => chebyshev(add(parentCell, candidate), prior)));
      const separated = separation(right) - separation(left);
      if (separated !== 0) return separated;
      const aligned = dot(right, direction) - dot(left, direction);
      return aligned !== 0 ? aligned : oakTissueCellIdV1(left) - oakTissueCellIdV1(right);
    });
    const delta = candidates.find((candidate) => {
      const next = add(parentCell, candidate);
      const id = oakTissueCellIdV1(next);
      return !cells.has(id) && !used.some((prior) => oakTissueCellIdV1(prior) === id);
    });
    if (!delta) throw new Error(`Oak port '${child.key}' has no distinct child connector cell.`);
    const childCell = add(parentCell, delta);
    putReserved(cells, childCell, child.key, 'child-port');
    used.push(childCell);
    usedConnectors.set(groupId, used);
    return {
      parentOrganKey: child.parentKey!,
      childOrganKey: child.key,
      portM: [child.positionM.x, child.positionM.y, child.positionM.z],
      parentCell,
      childCell,
      parentPath: [],
      childPath: [],
    };
  });
}

function allocateSources(
  sources: readonly OakTissueSourceCellV1[],
  cells: Map<number, OakTissueMaterialCellV1>,
): Map<string, OakTissueSourceAssignmentV1> {
  const assignments = new Map<string, OakTissueSourceAssignmentV1>();
  for (const source of sources) {
    const rounded = roundOakTissueCellV1(source.centerM);
    let chosen: OakTissueLatticeCellV1 | null = null;
    let chosenId = Infinity;
    let chosenDistanceSquared = Infinity;
    for (let radius = 0; radius < ALLOCATION_SHELLS.length && chosen === null; radius += 1) {
      for (const offset of ALLOCATION_SHELLS[radius]!) {
        const candidate = add(rounded, offset);
        const id = oakTissueCellIdV1(candidate);
        if (cells.has(id)) continue;
        const center = oakTissueCellCenterM_V1(candidate);
        const distanceSquared = squaredDistance(source.centerM, center);
        if (distanceSquared < chosenDistanceSquared
          || (distanceSquared === chosenDistanceSquared && id < chosenId)) {
          chosen = candidate;
          chosenId = id;
          chosenDistanceSquared = distanceSquared;
        }
      }
    }
    if (chosen === null) {
      throw new Error(`Oak source '${source.key}' has no unique tissue cell within 16 pitches.`);
    }
    cells.set(chosenId, {
      cell: chosen,
      ownerOrganKey: source.ownerOrganKey,
      role: 'source',
      sourceKey: source.key,
    });
    assignments.set(source.key, {
      sourceKey: source.key,
      ownerOrganKey: source.ownerOrganKey,
      sourceLocalCell: source.localCell,
      sourceCenterM: source.centerM,
      cell: chosen,
    });
  }
  return assignments;
}


function addSourceScaffold(
  detachedOwners: ReadonlySet<string>,
  sources: readonly OakTissueSourceCellV1[],
  assignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
  cells: Map<number, OakTissueMaterialCellV1>,
): void {
  let attachedCells: ReadonlyMap<number, OakTissueMaterialCellV1> = cells;
  const detachedCells = new Map<string, Map<number, OakTissueMaterialCellV1>>();
  if (detachedOwners.size > 0) {
    const attached = new Map<number, OakTissueMaterialCellV1>();
    for (const owner of detachedOwners) detachedCells.set(owner, new Map());
    for (const [id, material] of cells) {
      const detached = detachedCells.get(material.ownerOrganKey);
      (detached ?? attached).set(id, material);
    }
    attachedCells = attached;
  }
  const attachedConnectivity = new MaterialComponents(attachedCells);
  const detachedConnectivity = new Map([...detachedCells]
    .map(([owner, ownerCells]) => [owner, new MaterialComponents(ownerCells)]));
  const localByOwner = new Map<string, Map<number, OakTissueSourceCellV1>>();
  for (const source of sources) {
    const local = localByOwner.get(source.ownerOrganKey) ?? new Map();
    local.set(oakTissueCellIdV1(source.localCell), source);
    localByOwner.set(source.ownerOrganKey, local);
  }
  for (const source of sources) {
    const local = localByOwner.get(source.ownerOrganKey)!;
    for (const delta of [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const) {
      const neighbor = local.get(oakTissueCellIdV1(add(source.localCell, delta)));
      if (!neighbor) continue;
      const start = assignments.get(source.key)!.cell;
      const goal = assignments.get(neighbor.key)!.cell;
      const ownerConnectivity = detachedConnectivity.get(source.ownerOrganKey);
      if ((ownerConnectivity ?? attachedConnectivity).connected(start, goal)) continue;
      const path = addUnionPath(
        cells,
        start,
        goal,
        source.ownerOrganKey,
        stableHash(source.key + neighbor.key),
        ownerConnectivity === undefined ? undefined : source.ownerOrganKey,
        ownerConnectivity !== undefined,
        detachedOwners,
      );
      (ownerConnectivity ?? attachedConnectivity).connectPath(path, cells);
    }
  }
}
class MaterialComponents {
  readonly #componentByCell = new Map<number, number>();
  readonly #parent: number[] = [];

  constructor(cells: ReadonlyMap<number, OakTissueMaterialCellV1>) {
    for (const material of cells.values()) {
      const firstId = oakTissueCellIdV1(material.cell);
      if (this.#componentByCell.has(firstId)) continue;
      const component = this.#parent.length;
      this.#parent.push(component);
      this.#componentByCell.set(firstId, component);
      const queue = [material.cell];
      for (const current of queue) {
        const currentId = oakTissueCellIdV1(current);
        assertOakTissueFaceNeighborRangeV1(current);
        for (let index = 0; index < OAK_TISSUE_FACE_NEIGHBORS_V1.length; index += 1) {
          const id = currentId + OAK_TISSUE_FACE_NEIGHBOR_ID_OFFSETS_V1[index]!;
          if (!cells.has(id) || this.#componentByCell.has(id)) continue;
          this.#componentByCell.set(id, component);
          queue.push(add(current, OAK_TISSUE_FACE_NEIGHBORS_V1[index]!));
        }
      }
    }
  }

  connected(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): boolean {
    return this.#find(this.#component(left)) === this.#find(this.#component(right));
  }

  connectPath(
    path: readonly OakTissueLatticeCellV1[],
    cells: ReadonlyMap<number, OakTissueMaterialCellV1>,
  ): void {
    const pathComponent = this.#component(path[0]!);
    for (const cell of path) {
      const id = oakTissueCellIdV1(cell);
      assertOakTissueFaceNeighborRangeV1(cell);
      const existing = this.#componentByCell.get(id);
      if (existing === undefined) this.#componentByCell.set(id, pathComponent);
      else this.#union(pathComponent, existing);
      for (const offset of OAK_TISSUE_FACE_NEIGHBOR_ID_OFFSETS_V1) {
        const neighborId = id + offset;
        if (!cells.has(neighborId)) continue;
        const neighbor = this.#componentByCell.get(neighborId);
        if (neighbor !== undefined) this.#union(pathComponent, neighbor);
      }
    }
  }

  #component(cell: OakTissueLatticeCellV1): number {
    const component = this.#componentByCell.get(oakTissueCellIdV1(cell));
    if (component === undefined) throw new Error('Oak tissue connectivity referenced an absent cell.');
    return component;
  }

  #find(component: number): number {
    const parent = this.#parent[component]!;
    if (parent === component) return component;
    const root = this.#find(parent);
    this.#parent[component] = root;
    return root;
  }

  #union(left: number, right: number): void {
    const leftRoot = this.#find(left);
    const rightRoot = this.#find(right);
    if (leftRoot !== rightRoot) this.#parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  }
}
function addOwnedPath(
  cells: Map<number, OakTissueMaterialCellV1>,
  start: OakTissueLatticeCellV1,
  goal: OakTissueLatticeCellV1,
  owner: string,
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  assignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
  retainedSourceKeys: ReadonlySet<string>,
): readonly OakTissueLatticeCellV1[] {
  const path = findOakTissuePathV1(start, goal, (cell) => {
    const existing = cells.get(oakTissueCellIdV1(cell));
    return existing === undefined || existing.ownerOrganKey === owner
      || isOakTissueProximalChildSourceV1(
        existing,
        owner,
        organs,
        assignments,
        retainedSourceKeys,
      );
  });
  for (const cell of path) {
    const id = oakTissueCellIdV1(cell);
    const existing = cells.get(id);
    const claims = new Set(existing?.claimOrganKeys ?? []);
    if (existing?.role === 'source' && existing.ownerOrganKey !== owner) {
      claims.add(existing.ownerOrganKey);
    }
    cells.set(id, {
      cell,
      ownerOrganKey: owner,
      role: 'owner-path',
      ...(existing?.sourceKey === undefined ? {} : { sourceKey: existing.sourceKey }),
      ...(claims.size === 0 ? {} : { claimOrganKeys: [...claims].sort() }),
    });
  }
  return path;
}

function addUnionPath(
  cells: Map<number, OakTissueMaterialCellV1>,
  start: OakTissueLatticeCellV1,
  goal: OakTissueLatticeCellV1,
  owner: string,
  orderSeed: number,
  claimOwner?: string,
  exclusiveOwner = false,
  blockedOwners: ReadonlySet<string> = new Set(),
): readonly OakTissueLatticeCellV1[] {
  const path = exclusiveOwner || blockedOwners.size > 0
    ? [...findOakTissuePathV1(start, goal, (cell) => {
      const existing = cells.get(oakTissueCellIdV1(cell));
      return existing === undefined || (exclusiveOwner
        ? existing.ownerOrganKey === owner || claimOwner === owner
        : !blockedOwners.has(existing.ownerOrganKey));
    })]
    : [start];
  if (!exclusiveOwner && blockedOwners.size === 0) {
    const current = [...start] as [number, number, number];
    for (const axis of AXIS_ORDERS[orderSeed % AXIS_ORDERS.length]!) {
      while (current[axis] !== goal[axis]) {
        current[axis] = current[axis]! + Math.sign(goal[axis]! - current[axis]!);
        path.push([...current] as OakTissueLatticeCellV1);
      }
    }
  }
  for (const cell of path) {
    const id = oakTissueCellIdV1(cell);
    const existing = cells.get(id);
    if (!existing) {
      cells.set(id, {
        cell,
        ownerOrganKey: owner,
        role: 'union-path',
        ...(claimOwner === undefined ? {} : { claimOrganKeys: [claimOwner] }),
      });
    } else if (claimOwner !== undefined && !existing.claimOrganKeys?.includes(claimOwner)) {
      cells.set(id, {
        ...existing,
        claimOrganKeys: [...(existing.claimOrganKeys ?? []), claimOwner].sort(),
      });
    }
  }
  return path;
}

function putReserved(
  cells: Map<number, OakTissueMaterialCellV1>,
  cell: OakTissueLatticeCellV1,
  owner: string,
  role: OakTissueMaterialCellV1['role'],
): void {
  const id = oakTissueCellIdV1(cell);
  const prior = cells.get(id);
  if (prior && prior.ownerOrganKey !== owner) throw new Error('Oak tissue port reservations conflict.');
  if (!prior) cells.set(id, { cell, ownerOrganKey: owner, role });
}

function nearestAnchor(
  origin: OakTissueLatticeCellV1,
  candidates: readonly OakTissueLatticeCellV1[],
): OakTissueLatticeCellV1 {
  if (candidates.length === 0) throw new Error('Oak tissue port has no source anchor.');
  let best = candidates[0]!;
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const distanceDelta = manhattan(candidate, origin) - manhattan(best, origin);
    if (distanceDelta < 0
      || (distanceDelta === 0 && oakTissueCellIdV1(candidate) < oakTissueCellIdV1(best))) {
      best = candidate;
    }
  }
  return best;
}

function add(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): OakTissueLatticeCellV1 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function manhattan(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): number {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function chebyshev(left: OakTissueLatticeCellV1, right: OakTissueLatticeCellV1): number {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
}

function dot(left: readonly number[], right: readonly number[]): number {
  return left[0]! * right[0]! + left[1]! * right[1]! + left[2]! * right[2]!;
}

function squaredDistance(left: readonly number[], right: readonly number[]): number {
  return (left[0]! - right[0]!) ** 2 + (left[1]! - right[1]!) ** 2
    + (left[2]! - right[2]!) ** 2;
}

function stableHash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}
