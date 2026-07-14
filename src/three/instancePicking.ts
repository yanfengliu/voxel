import {
  Matrix3,
  Matrix4,
  Raycaster,
  Vector3,
  type InstancedMesh,
} from 'three';

import type { Vec3V1 } from '../core/index.js';

export interface InstancePickSourceInternal {
  readonly batchKey: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly materialKeys?: readonly string[];
  readonly worldMatrixMode?: 'live' | 'captured';
  readonly mesh: InstancedMesh;
}

export interface PresentedInstanceHitInternal {
  readonly batchKey: string;
  readonly geometryKey: string;
  readonly batchMaterialKey: string;
  readonly materialKey: string;
  readonly instanceKey: string;
  readonly instanceSlot: number;
  readonly distance: number;
  readonly point: Vec3V1;
  readonly normal: Vec3V1;
}

export type PresentedInstanceRaycastResultInternal =
  | {
      readonly status: 'hits';
      readonly hits: readonly PresentedInstanceHitInternal[];
      readonly instanceCandidates: number;
      readonly instancePrimitiveTests: number;
    }
  | {
      readonly status: 'budget-exceeded';
      readonly exhausted: 'instance-candidates' | 'instance-primitive-tests';
      readonly instanceCandidates: number;
      readonly instancePrimitiveTests: number;
    };

const instanceMatrix = new Matrix4();
const instanceWorldMatrix = new Matrix4();
const normalMatrix = new Matrix3();

function finiteVector(name: string, value: Vec3V1): Vector3 {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new RangeError(`${name} must contain finite coordinates.`);
  }
  return new Vector3(value.x, value.y, value.z);
}

function normalizeFiniteVector(name: string, value: Vector3): Vector3 {
  const scale = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z));
  if (!Number.isFinite(scale) || scale === 0) {
    throw new RangeError(`${name} must be finite and nonzero.`);
  }
  value.set(value.x / scale, value.y / scale, value.z / scale);
  const length = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(length) || length === 0) {
    throw new RangeError(`${name} cannot be normalized safely.`);
  }
  return value.multiplyScalar(1 / length);
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

function positiveInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainVector(value: Vector3): Vec3V1 {
  return {
    x: Object.is(value.x, -0) ? 0 : value.x,
    y: Object.is(value.y, -0) ? 0 : value.y,
    z: Object.is(value.z, -0) ? 0 : value.z,
  };
}

function instanceCount(source: InstancePickSourceInternal): number {
  const count = source.mesh.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Presented instance count must be a nonnegative safe integer.');
  }
  return count;
}

function primitiveCountPerInstance(source: InstancePickSourceInternal): number {
  const geometry = source.mesh.geometry;
  const elementCount = geometry.index?.count ?? geometry.getAttribute('position').count;
  if (
    !Number.isSafeInteger(elementCount)
    || elementCount < 0
    || elementCount % 3 !== 0
  ) {
    throw new RangeError('Presented triangle geometry must declare a complete safe triangle count.');
  }
  return elementCount / 3;
}

function requiredPrimitiveTests(
  sources: readonly InstancePickSourceInternal[],
  maximum: number,
): number {
  let total = 0;
  for (const source of sources) {
    const instances = instanceCount(source);
    const primitives = primitiveCountPerInstance(source);
    if (instances === 0 || primitives === 0) continue;
    const remaining = maximum - total;
    if (remaining < 0 || instances > Math.floor(remaining / primitives)) {
      return maximum + 1;
    }
    total += instances * primitives;
  }
  return total;
}

function hitMaterialKey(
  source: InstancePickSourceInternal,
  materialIndex: number | undefined,
): string {
  if (!Array.isArray(source.mesh.material)) return source.materialKey;
  const keys: unknown = source.materialKeys ?? source.mesh.geometry.userData.materialKeys;
  if (
    !Array.isArray(keys)
    || keys.length !== source.mesh.material.length
    || !keys.every((key: unknown) => typeof key === 'string')
  ) {
    throw new Error('Presented geometry material keys do not match its material array.');
  }
  const index = materialIndex;
  if (
    index === undefined
    || !Number.isSafeInteger(index)
    || index < 0
    || index >= keys.length
  ) {
    throw new Error('Three returned an invalid presented geometry material index.');
  }
  return keys[index]!;
}

/**
 * Raycasts the exact instance matrices currently held by InstancedMesh. The
 * candidate preflight happens before Three can scan any instance.
 */
export function raycastPresentedInstancesInternal(
  sources: readonly InstancePickSourceInternal[],
  origin: Vec3V1,
  direction: Vec3V1,
  maxDistance: number,
  maxCandidates: number,
  maxPrimitiveTests: number,
  maxHits: number,
): PresentedInstanceRaycastResultInternal {
  positiveFinite('maxDistance', maxDistance);
  positiveInteger('maxCandidates', maxCandidates);
  positiveInteger('maxPrimitiveTests', maxPrimitiveTests);
  positiveInteger('maxHits', maxHits);
  const rayOrigin = finiteVector('origin', origin);
  const rayDirection = normalizeFiniteVector('direction', finiteVector('direction', direction));

  let instanceCandidates = 0;
  const sourceByMesh = new Map<InstancedMesh, InstancePickSourceInternal>();
  for (const source of sources) {
    instanceCandidates += instanceCount(source);
    if (!Number.isSafeInteger(instanceCandidates)) {
      throw new RangeError('Presented instance candidate count exceeds safe integer range.');
    }
    sourceByMesh.set(source.mesh, source);
  }
  if (instanceCandidates > maxCandidates) {
    return {
      status: 'budget-exceeded',
      exhausted: 'instance-candidates',
      instanceCandidates,
      instancePrimitiveTests: 0,
    };
  }
  const instancePrimitiveTests = requiredPrimitiveTests(sources, maxPrimitiveTests);
  if (instancePrimitiveTests > maxPrimitiveTests) {
    return {
      status: 'budget-exceeded',
      exhausted: 'instance-primitive-tests',
      instanceCandidates,
      instancePrimitiveTests,
    };
  }

  const raycaster = new Raycaster(rayOrigin, rayDirection, 0, maxDistance);
  const meshes = sources.map((source) => {
    if (source.worldMatrixMode !== 'captured') {
      source.mesh.updateWorldMatrix(true, false);
    }
    return source.mesh;
  });
  const intersections = raycaster.intersectObjects(meshes, false);
  const nearest = new Map<string, PresentedInstanceHitInternal>();
  for (const intersection of intersections) {
    const source = sourceByMesh.get(intersection.object as InstancedMesh);
    const slot = intersection.instanceId;
    if (!source || !Number.isSafeInteger(slot) || slot! < 0 || slot! >= source.mesh.count) {
      throw new Error('Three returned an invalid presented instance intersection identity.');
    }
    const instanceKeys: unknown = source.mesh.userData.instanceKeys;
    if (!Array.isArray(instanceKeys) || typeof instanceKeys[slot!] !== 'string') {
      throw new Error('Presented instance key table does not match the uploaded mesh.');
    }
    const localNormal = intersection.normal ?? intersection.face?.normal;
    if (!localNormal) throw new Error('Presented triangle intersection is missing a normal.');
    source.mesh.getMatrixAt(slot!, instanceMatrix);
    instanceWorldMatrix.multiplyMatrices(source.mesh.matrixWorld, instanceMatrix);
    normalMatrix.getNormalMatrix(instanceWorldMatrix);
    const worldNormal = normalizeFiniteVector(
      'Presented instance normal',
      localNormal.clone().applyMatrix3(normalMatrix),
    );
    const hit: PresentedInstanceHitInternal = {
      batchKey: source.batchKey,
      geometryKey: source.geometryKey,
      batchMaterialKey: source.materialKey,
      materialKey: hitMaterialKey(source, intersection.face?.materialIndex),
      instanceKey: instanceKeys[slot!] as string,
      instanceSlot: slot!,
      distance: intersection.distance,
      point: plainVector(intersection.point),
      normal: plainVector(worldNormal),
    };
    const identity = `${source.batchKey}\u0000${String(slot)}`;
    const previous = nearest.get(identity);
    if (!previous || hit.distance < previous.distance) nearest.set(identity, hit);
  }
  const hits = [...nearest.values()].sort((left, right) => (
    left.distance - right.distance
    || compareText(left.batchKey, right.batchKey)
    || compareText(left.instanceKey, right.instanceKey)
  )).slice(0, maxHits);
  return { status: 'hits', hits, instanceCandidates, instancePrimitiveTests };
}
