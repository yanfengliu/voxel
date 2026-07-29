import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  validatePhysicalAssetV1,
  type PhysicalAssetV1,
  type PhysicalColliderV1,
} from './physical-asset.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';
import {
  type WindmillCompactCandidateV1,
  type WindmillCompactTripleV1,
} from './windmill-compact-geometry.js';
import {
  WINDMILL_RECIPE_IDS_V1,
} from './windmill-layout.js';
import {
  WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1,
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
  createWindmillCompactPhysicalAssetBookV1,
  createWindmillCompactPhysicalAssetsV1,
  type WindmillCompactPhysicalDeclarationV1,
} from './windmill-compact-physical-assets.js';

const ASSET_KEYS = ['frame', 'rotor', 'hammer', 'anvil'] as const;
const ACCEPTED = enumerateWindmillCompactGeometryV1().attempts
  .filter((attempt) => attempt.outcome === 'candidate');

const MATERIAL_PROFILES = Object.freeze(Object.fromEntries(
  WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1.map((profile, index) => [
    profile,
    Object.freeze({
      densityKilogramsPerVoxelCube:
        profile === 'fixedSupport' || profile === 'anvil'
          ? null
          : (index + 1) / 100,
      friction: (index + 1) / 20,
      restitution: (index % 5) / 10,
    }),
  ]),
)) as WindmillCompactPhysicalDeclarationV1['materialProfiles'];

const DECLARATION: WindmillCompactPhysicalDeclarationV1 = Object.freeze({
  schema: WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
  materialProfiles: MATERIAL_PROFILES,
  dynamics: Object.freeze({
    rotor: Object.freeze({
      linearDamping: 0.02,
      angularDamping: 0.06,
      gravityScale: 1,
      continuous: true,
    }),
    hammer: Object.freeze({
      linearDamping: 0.03,
      angularDamping: 0.1,
      gravityScale: 0.9,
      continuous: false,
    }),
  }),
});

function sorted(values: readonly string[]): readonly string[] {
  return [...values].sort();
}

function boxVolume(collider: PhysicalColliderV1): number {
  if (collider.shape.kind !== 'box') {
    throw new Error('Compact windmill colliders must remain exact boxes.');
  }
  return collider.shape.halfExtents.reduce(
    (volume, halfExtent) => volume * halfExtent * 2,
    1,
  );
}

function colliderCells(
  asset: PhysicalAssetV1,
  bodyOrigin: WindmillCompactTripleV1,
): readonly string[] {
  return asset.colliders.flatMap((collider) => {
    if (collider.shape.kind !== 'box') {
      throw new Error(
        `Physical asset '${asset.recipeId}' contains a non-box collider.`,
      );
    }
    const halfExtents = collider.shape.halfExtents;
    const minimum = (
      collider.pose.position.map((value, axis) =>
        value - halfExtents[axis]! + bodyOrigin[axis]!)
    ) as [number, number, number];
    const maximum = (
      collider.pose.position.map((value, axis) =>
        value + halfExtents[axis]! + bodyOrigin[axis]!)
    ) as [number, number, number];
    [...minimum, ...maximum].forEach((value) =>
      expect(Number.isSafeInteger(value), asset.recipeId).toBe(true));
    const cells: string[] = [];
    for (let z = minimum[2]; z < maximum[2]; z += 1) {
      for (let y = minimum[1]; y < maximum[1]; y += 1) {
        for (let x = minimum[0]; x < maximum[0]; x += 1) {
          cells.push(`${String(x)},${String(y)},${String(z)}`);
        }
      }
    }
    return cells;
  });
}

function rotatedPositiveZ(
  rotation: readonly [number, number, number, number],
): WindmillCompactTripleV1 {
  const [x, y, z, w] = rotation;
  return [
    2 * (x * z + w * y),
    2 * (y * z - w * x),
    1 - 2 * (x * x + y * y),
  ];
}

function expectPortAxis(
  rotation: readonly [number, number, number, number] | undefined,
  axis: WindmillCompactTripleV1 | undefined,
): void {
  if (axis === undefined) {
    expect(rotation).toBeUndefined();
    return;
  }
  if (rotation === undefined) {
    throw new Error(`Missing rotation for candidate axis [${axis.join(',')}].`);
  }
  const actual = rotatedPositiveZ(rotation);
  actual.forEach((entry, index) =>
    expect(entry).toBeCloseTo(axis[index]!, 12));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value as Record<string, unknown>).forEach((entry) => {
      deepFreeze(entry);
    });
    Object.freeze(value);
  }
  return value;
}

function expectDeepFrozen(value: unknown, path = '$'): void {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value), path).toBe(true);
  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && 'value' in descriptor) {
      const child: unknown = descriptor.value;
      expectDeepFrozen(child, `${path}.${String(key)}`);
    }
  });
}

function mutableDeclaration(): Record<string, unknown> {
  return structuredClone(DECLARATION) as unknown as Record<string, unknown>;
}

function compileInvalidDeclaration(
  candidate: WindmillCompactCandidateV1,
  value: Record<string, unknown>,
): () => unknown {
  deepFreeze(value);
  return () => createWindmillCompactPhysicalAssetsV1(
    candidate,
    value as unknown as WindmillCompactPhysicalDeclarationV1,
  );
}

describe('compact windmill physical asset compiler', () => {
  it('compiles all 144 candidates into exact validated physical sidecars', () => {
    expect(ACCEPTED).toHaveLength(144);
    ACCEPTED.forEach(({ candidate }) => {
      const result = createWindmillCompactPhysicalAssetsV1(
        candidate,
        DECLARATION,
      );
      expect(result.candidateGeometryFingerprint)
        .toBe(candidate.geometryFingerprint);
      expect(result.parameterKey).toBe(candidate.parameterKey);
      expect(result.physicalAssets.map((asset) => asset.recipeId)).toEqual(
        ASSET_KEYS.map((assetKey) => WINDMILL_RECIPE_IDS_V1[assetKey]),
      );
      expect(Object.keys(result.physicalAssetBook)).toEqual(
        result.physicalAssets.map((asset) => asset.recipeId),
      );
      ASSET_KEYS.forEach((assetKey) => {
        const source = candidate.assets[assetKey];
        const recipeId = WINDMILL_RECIPE_IDS_V1[assetKey];
        const physical = result.physicalAssetBook[recipeId];
        if (physical === undefined) {
          throw new Error(`Missing physical asset '${recipeId}'.`);
        }
        expect(validatePhysicalAssetV1(physical), recipeId).toEqual([]);
        expect(physical.constraints, recipeId).toEqual([]);
        expect(physical.bodies, recipeId).toHaveLength(1);
        const body = physical.bodies[0]!;
        expect(body.key).toBe(source.bodyKey);
        expect(body.pose.position).toEqual(source.bodyOriginVoxels);
        expect(body.type).toBe(source.dynamic ? 'dynamic' : 'fixed');
        if (assetKey === 'rotor' || assetKey === 'hammer') {
          expect(body).toMatchObject(DECLARATION.dynamics[assetKey]);
        } else {
          expect(body).toEqual({
            key: source.bodyKey,
            type: 'fixed',
            pose: { position: source.bodyOriginVoxels },
          });
        }
        const mapping = result.colliderIndexByBoxKey[recipeId];
        expect(Object.keys(mapping)).toEqual(
          source.boxes.map((box) => box.key),
        );
        expect(physical.colliders, recipeId).toHaveLength(source.boxes.length);
        source.boxes.forEach((box, expectedIndex) => {
          const colliderIndex = mapping[box.key];
          expect(colliderIndex, `${recipeId}:${box.key}`).toBe(expectedIndex);
          const collider = physical.colliders[colliderIndex!];
          if (collider?.shape.kind !== 'box') {
            throw new Error(`Missing exact collider for '${box.key}'.`);
          }
          expect(collider.body).toBe(source.bodyKey);
          expect(collider.role).toBe('solid');
          expect(collider.shape.halfExtents).toEqual(
            box.size.map((value) => value / 2),
          );
          expect(collider.pose.position).toEqual(box.at.map((value, axis) =>
            value + box.size[axis]! / 2 - source.bodyOriginVoxels[axis]!));
          expect(boxVolume(collider)).toBe(
            box.size[0] * box.size[1] * box.size[2],
          );
          const profile = DECLARATION.materialProfiles[box.materialProfile];
          expect(collider.density).toBe(
            profile.densityKilogramsPerVoxelCube ?? undefined,
          );
          expect(collider.friction).toBe(profile.friction);
          expect(collider.restitution).toBe(profile.restitution);
        });
        const cells = colliderCells(physical, source.bodyOriginVoxels);
        expect(new Set(cells).size, recipeId).toBe(cells.length);
        expect(sorted(cells)).toEqual(sorted(
          source.occupiedCells.map((cell) => cell.join(',')),
        ));
        const sourcePorts = candidate.ports.filter((port) =>
          port.assetKey === assetKey);
        expect(physical.ports.map((port) => port.key)).toEqual(
          sourcePorts.map((port) => port.key),
        );
        physical.ports.forEach((port, index) => {
          const sourcePort = sourcePorts[index]!;
          expect(port.body).toBe(source.bodyKey);
          expect(port.frame.position).toEqual(sourcePort.positionVoxels);
          expectPortAxis(port.frame.rotation, sourcePort.axisUnit);
        });
      });
    });
  });

  it('is deterministic through regeneration, structured clone, and JSON', () => {
    ACCEPTED.forEach(({ candidate }) => {
      const first = createWindmillCompactPhysicalAssetsV1(
        candidate,
        DECLARATION,
      );
      expect(createWindmillCompactPhysicalAssetsV1(candidate, DECLARATION))
        .toEqual(first);
      expect(structuredClone(first)).toEqual(first);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
      expect(createWindmillCompactPhysicalAssetBookV1(candidate, DECLARATION))
        .toEqual(first.physicalAssetBook);
    });
  });

  it('recursively freezes the complete generated output graph', () => {
    expectDeepFrozen(createWindmillCompactPhysicalAssetsV1(
      ACCEPTED[0]!.candidate,
      DECLARATION,
    ));
  });

  it('rejects noncanonical duplicate or missing boxes and ports', () => {
    const candidate = ACCEPTED[0]!.candidate;
    const duplicateBox = structuredClone(candidate);
    const duplicateBoxes = (
      duplicateBox.assets.rotor.boxes
    ) as unknown as { key: string }[];
    duplicateBoxes[1]!.key = duplicateBoxes[0]!.key;
    expect(() => createWindmillCompactPhysicalAssetsV1(
      duplicateBox,
      DECLARATION,
    )).toThrow(/assets\.rotor\.boxes\[1\]\.key/);

    const missingBox = structuredClone(candidate);
    (missingBox.assets.hammer.boxes as unknown as unknown[]).splice(0, 1);
    expect(() => createWindmillCompactPhysicalAssetsV1(
      missingBox,
      DECLARATION,
    )).toThrow(/assets\.hammer\.boxes\.length/);

    const duplicatePort = structuredClone(candidate);
    const duplicatePorts = (
      duplicatePort.ports
    ) as unknown as { key: string }[];
    duplicatePorts[1]!.key = duplicatePorts[0]!.key;
    expect(() => createWindmillCompactPhysicalAssetsV1(
      duplicatePort,
      DECLARATION,
    )).toThrow(/ports\[1\]\.key/);

    const missingPort = structuredClone(candidate);
    (missingPort.ports as unknown as unknown[]).splice(0, 1);
    expect(() => createWindmillCompactPhysicalAssetsV1(
      missingPort,
      DECLARATION,
    )).toThrow(/ports\.length/);

    const hiddenExtra = structuredClone(candidate);
    Object.defineProperty(hiddenExtra.assets.frame, 'forged', {
      value: true,
      enumerable: false,
    });
    expect(() => createWindmillCompactPhysicalAssetsV1(
      hiddenExtra,
      DECLARATION,
    )).toThrow(/assets\.frame\.forged/);

    const symbolExtra = structuredClone(candidate);
    Object.defineProperty(symbolExtra.ports, Symbol('forged-port'), {
      value: true,
      enumerable: false,
    });
    expect(() => createWindmillCompactPhysicalAssetsV1(
      symbolExtra,
      DECLARATION,
    )).toThrow(/ports\.Symbol\(forged-port\)/);
  });

  it('rejects unfrozen, missing, extra, or invalid declaration inputs', () => {
    const candidate = ACCEPTED[0]!.candidate;
    expect(() => createWindmillCompactPhysicalAssetsV1(
      candidate,
      structuredClone(DECLARATION),
    )).toThrow(/declaration.*must be frozen/);

    const shallowFrozen = structuredClone(DECLARATION);
    Object.freeze(shallowFrozen);
    expect(() => createWindmillCompactPhysicalAssetsV1(
      candidate,
      shallowFrozen,
    )).toThrow(/declaration\.materialProfiles.*must be frozen/);

    const missingProfile = mutableDeclaration();
    const missingProfiles = (
      missingProfile.materialProfiles
    ) as Record<string, unknown>;
    delete missingProfiles.fixedSupport;
    expect(compileInvalidDeclaration(candidate, missingProfile))
      .toThrow(/materialProfiles.*missing \[fixedSupport\]/);

    const extraProfile = mutableDeclaration();
    (extraProfile.materialProfiles as Record<string, unknown>).mystery = {};
    expect(compileInvalidDeclaration(candidate, extraProfile))
      .toThrow(/unexpected \[mystery\]/);

    const badDensity = mutableDeclaration();
    const profiles = (
      badDensity.materialProfiles
    ) as Record<string, Record<string, unknown>>;
    profiles.cam!.densityKilogramsPerVoxelCube = 0;
    expect(compileInvalidDeclaration(candidate, badDensity))
      .toThrow(/materialProfiles\.cam\.densityKilogramsPerVoxelCube.*above 0/);

    const missingDynamics = mutableDeclaration();
    delete (missingDynamics.dynamics as Record<string, unknown>).rotor;
    expect(compileInvalidDeclaration(candidate, missingDynamics))
      .toThrow(/dynamics.*missing \[rotor\]/);

    const badDynamics = mutableDeclaration();
    const dynamics = (
      badDynamics.dynamics
    ) as Record<string, Record<string, unknown>>;
    dynamics.hammer!.angularDamping = -1;
    expect(compileInvalidDeclaration(candidate, badDynamics))
      .toThrow(/dynamics\.hammer\.angularDamping.*at least 0/);

    const negativeGravity = mutableDeclaration();
    const gravityDynamics = (
      negativeGravity.dynamics
    ) as Record<string, Record<string, unknown>>;
    gravityDynamics.rotor!.gravityScale = -0.1;
    expect(compileInvalidDeclaration(candidate, negativeGravity))
      .toThrow(/dynamics\.rotor\.gravityScale.*at least 0/);
  });

  it('omits fixed null density and rejects null density on a dynamic box', () => {
    const candidate = ACCEPTED[0]!.candidate;
    const result = createWindmillCompactPhysicalAssetsV1(
      candidate,
      DECLARATION,
    );
    for (const assetKey of ['frame', 'anvil'] as const) {
      const sidecar = result.physicalAssetBook[
        WINDMILL_RECIPE_IDS_V1[assetKey]
      ]!;
      expect(sidecar.colliders.every((collider) =>
        collider.density === undefined)).toBe(true);
    }

    const dynamicNull = mutableDeclaration();
    const dynamicProfiles = (
      dynamicNull.materialProfiles
    ) as Record<string, Record<string, unknown>>;
    dynamicProfiles.cam!.densityKilogramsPerVoxelCube = null;
    expect(compileInvalidDeclaration(candidate, dynamicNull))
      .toThrow(/dynamic.*rotor.*cam\.densityKilogramsPerVoxelCube.*above 0/i);
  });

  it('keeps the production compiler browser-safe and solver-neutral', () => {
    const source = readFileSync(
      'tools/studio/windmill-compact-physical-assets.ts',
      'utf8',
    );
    const imports = [...source.matchAll(
      /from\s+['"]([^'"]+)['"]/g,
    )].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((specifier) => specifier?.startsWith('./'))).toBe(true);
    expect(source).not.toMatch(
      /\b(?:window|document|HTMLElement|WebGLRenderingContext|Rapier)\b/,
    );
    expect(source).not.toMatch(/(?:node:|@dimforge|rapier)/i);
  });
});
