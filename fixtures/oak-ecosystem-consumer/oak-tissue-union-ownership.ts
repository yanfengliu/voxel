import type { OakOrganSnapshotV1 } from './oak-types.js';
import type {
  OakTissueLatticeCellV1,
  OakTissueMaterialCellV1,
  OakTissuePortWitnessV1,
  OakTissueSourceAssignmentV1,
} from './oak-tissue-lattice.js';

export function groupOakTissueSourcesByOwnerV1(
  assignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
): Map<string, OakTissueLatticeCellV1[]> {
  const result = new Map<string, OakTissueLatticeCellV1[]>();
  for (const assignment of assignments.values()) {
    const values = result.get(assignment.ownerOrganKey) ?? [];
    values.push(assignment.cell);
    result.set(assignment.ownerOrganKey, values);
  }
  return result;
}

export function retainedOakTissueAnchorSourceKeysV1(
  assignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
  ports: readonly OakTissuePortWitnessV1[],
): ReadonlySet<string> {
  const parents = new Set(ports.map((port) => port.parentOrganKey));
  const retained = new Map<string, OakTissueSourceAssignmentV1>();
  for (const assignment of assignments.values()) {
    if (!parents.has(assignment.ownerOrganKey)) continue;
    const prior = retained.get(assignment.ownerOrganKey);
    if (prior === undefined || assignment.sourceLocalCell[1] > prior.sourceLocalCell[1]
      || (assignment.sourceLocalCell[1] === prior.sourceLocalCell[1]
        && assignment.sourceKey < prior.sourceKey)) retained.set(assignment.ownerOrganKey, assignment);
  }
  return new Set([...retained.values()].map((assignment) => assignment.sourceKey));
}

export function isOakTissueProximalChildSourceV1(
  material: OakTissueMaterialCellV1 | undefined,
  parentOwner: string,
  organs: ReadonlyMap<string, OakOrganSnapshotV1>,
  assignments: ReadonlyMap<string, OakTissueSourceAssignmentV1>,
  retainedSourceKeys: ReadonlySet<string>,
): boolean {
  if (material?.role !== 'source' || material.sourceKey === undefined
    || retainedSourceKeys.has(material.sourceKey)) return false;
  const assignment = assignments.get(material.sourceKey);
  const sourceOrgan = assignment === undefined ? undefined : organs.get(assignment.ownerOrganKey);
  return sourceOrgan?.parentKey === parentOwner
    && (assignment!.sourceLocalCell[1] === 0 || assignment!.sourceLocalCell[1] === 1);
}
