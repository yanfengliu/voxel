import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { MutableOakOrganV1, MutableOakStateV1 } from './oak-state.js';
import type { OakVec3V1 } from './oak-types.js';

export function normalizeOakGrowthDirectionV1(vector: OakVec3V1): OakVec3V1 {
  const length = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

export function oakRestTipV1(organ: MutableOakOrganV1): OakVec3V1 {
  return {
    x: organ.positionM.x + organ.restDirection.x * organ.lengthM,
    y: organ.positionM.y + organ.restDirection.y * organ.lengthM,
    z: organ.positionM.z + organ.restDirection.z * organ.lengthM,
  };
}

function translateRestSubtree(
  state: MutableOakStateV1,
  rootKey: string,
  delta: OakVec3V1,
): void {
  const root = state.organs.find((organ) => organ.key === rootKey);
  if (!root) return;
  root.restPositionM = {
    x: root.restPositionM.x + delta.x,
    y: root.restPositionM.y + delta.y,
    z: root.restPositionM.z + delta.z,
  };
  root.positionM = {
    x: root.positionM.x + delta.x,
    y: root.positionM.y + delta.y,
    z: root.positionM.z + delta.z,
  };
  for (const child of state.organs.filter((organ) => organ.parentKey === rootKey)) {
    translateRestSubtree(state, child.key, delta);
  }
}

export function extendOakOrganAtDistalEndV1(
  state: MutableOakStateV1,
  target: MutableOakOrganV1,
  incrementM: number,
): void {
  const oldTip = oakRestTipV1(target);
  target.lengthM += incrementM;
  const newTip = oakRestTipV1(target);
  const delta = {
    x: newTip.x - oldTip.x,
    y: newTip.y - oldTip.y,
    z: newTip.z - oldTip.z,
  };
  for (const child of state.organs.filter((organ) => {
    if (organ.parentKey !== target.key) return false;
    // Leaves use a declared lateral port on this distal node; elongation
    // translates that port without erasing its authored radial offset.
    if (organ.kind === 'leaf') return true;
    const dx = organ.restPositionM.x - oldTip.x;
    const dy = organ.restPositionM.y - oldTip.y;
    const dz = organ.restPositionM.z - oldTip.z;
    return dx * dx + dy * dy + dz * dz
      <= OAK_PARAMETERS_V1.growth.attachmentToleranceSquaredM2;
  })) {
    translateRestSubtree(state, child.key, delta);
  }
}
