import {
  BoxGeometry,
  Group,
  Matrix4,
  MeshBasicMaterial,
} from 'three';
import { describe, expect, it, vi } from 'vitest';

import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';

function matrixLane(translations: readonly { x: number; y: number; z: number }[]): Float32Array {
  const values = new Float32Array(translations.length * 16);
  translations.forEach((translation, index) => {
    new Matrix4().makeTranslation(translation.x, translation.y, translation.z)
      .toArray(values, index * 16);
  });
  return values;
}

function fixture() {
  const root = new Group();
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const presenter = new InstanceBatchPresenter(root);
  return {
    root,
    geometry,
    material,
    presenter,
    resolvers: {
      geometry: () => geometry,
      material: () => material,
    },
    dispose: () => {
      presenter.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

describe('presented instance ray picking', () => {
  it('returns nearest unique instance hits from the matrices currently uploaded', () => {
    const value = fixture();
    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['near', 'far'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }]),
    }], value.resolvers);

    const result = value.presenter.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      2,
      24,
      8,
    );
    expect(result).toMatchObject({
      status: 'hits',
      instanceCandidates: 2,
      instancePrimitiveTests: 24,
    });
    if (result.status !== 'hits') throw new Error('Expected hits.');
    expect(result.hits.map((hit) => hit.instanceKey)).toEqual(['near', 'far']);
    expect(result.hits.map((hit) => hit.distance)).toEqual([1.5, 4.5]);
    expect(result.hits[0]?.normal).toEqual({ x: -1, y: 0, z: 0 });
    value.dispose();
  });

  it('returns budget-exceeded before invoking an unbounded Three instance scan', () => {
    const value = fixture();
    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['one', 'two'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }]),
    }], value.resolvers);

    expect(value.presenter.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      1,
      24,
      8,
    )).toEqual({
      status: 'budget-exceeded',
      exhausted: 'instance-candidates',
      instanceCandidates: 2,
      instancePrimitiveTests: 0,
    });
    value.dispose();
  });

  it('preflights geometry primitive work before invoking Three raycasting', () => {
    const value = fixture();
    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['one'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }]),
    }], value.resolvers);
    const mesh = value.presenter.get('batch:boxes')!;
    const raycast = vi.spyOn(mesh, 'raycast');

    expect(value.presenter.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      1,
      11,
      8,
    )).toEqual({
      status: 'budget-exceeded',
      exhausted: 'instance-primitive-tests',
      instanceCandidates: 1,
      instancePrimitiveTests: 12,
    });
    expect(raycast).not.toHaveBeenCalled();
    value.dispose();
  });

  it('normalizes huge and subnormal finite query directions without false misses', () => {
    const value = fixture();
    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['one'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }]),
    }], value.resolvers);

    for (const magnitude of [Number.MAX_VALUE, Number.MIN_VALUE]) {
      const result = value.presenter.pickRayInternal(
        { x: 0, y: 0, z: 0 },
        { x: magnitude, y: 0, z: 0 },
        10,
        1,
        12,
        1,
      );
      expect(result.status === 'hits' ? result.hits[0]?.instanceKey : null).toBe('one');
    }
    value.dispose();
  });

  it('reports the exact rendered geometry-group material for a hit', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const first = new MeshBasicMaterial();
    const second = new MeshBasicMaterial();
    const presenter = new InstanceBatchPresenter(root);
    const materialKeys = geometry.groups.map((_, index) => `material:group-${String(index)}`);
    geometry.userData.materialKeys = materialKeys;
    presenter.reconcile([{
      key: 'batch:groups',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:default',
      instanceKeys: ['one'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }]),
    }], {
      geometry: () => geometry,
      material: (key) => Number(key.slice(-1)) % 2 === 0 ? first : second,
    });

    const result = presenter.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      1,
      12,
      1,
    );
    expect(result.status === 'hits' ? result.hits[0] : null).toMatchObject({
      batchMaterialKey: 'material:default',
      materialKey: 'material:group-1',
    });
    presenter.dispose();
    geometry.dispose();
    first.dispose();
    second.dispose();
  });

  it('picks the exact animated matrix and current key table after replacement', () => {
    const value = fixture();
    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:1',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['old'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }]),
      animation: {
        schemaVersion: 'voxel.instance-transform-animation/1',
        periodsMs: new Float32Array([1_000]),
        phasesRadians: new Float32Array([0]),
        translationAmplitudes: new Float32Array([0, 2, 0]),
        rotationAmplitudesRadians: new Float32Array(3),
        scaleAmplitudes: new Float32Array(3),
      },
    }], value.resolvers);
    value.presenter.animate(250);

    const animated = value.presenter.pickRayInternal(
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      1,
      12,
      1,
    );
    expect(animated.status === 'hits' ? animated.hits[0]?.instanceKey : null).toBe('old');

    value.presenter.reconcile([{
      key: 'batch:boxes',
      version: '1:2',
      geometryKey: 'geometry:box',
      materialKey: 'material:box',
      instanceKeys: ['new'],
      matrices: matrixLane([{ x: 2, y: 0, z: 0 }]),
    }], value.resolvers);
    const replaced = value.presenter.pickRayInternal(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      10,
      1,
      12,
      1,
    );
    expect(replaced.status === 'hits' ? replaced.hits[0]?.instanceKey : null).toBe('new');
    value.dispose();
  });
});
