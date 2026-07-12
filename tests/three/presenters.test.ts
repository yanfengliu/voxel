import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';

import { GeometryPresenter } from '../../src/three/geometryPresenter.js';
import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import { ChunkPresenter } from '../../src/three/chunkPresenter.js';
import { MaterialPresenter } from '../../src/three/materialPresenter.js';
import { DensePaletteChunk } from '../../src/meshing/index.js';

function triangleResource(revision = 1) {
  return {
    key: 'geometry:triangle',
    version: `1:${String(revision)}`,
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    colors: new Uint8Array([
      128, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
    ]),
    indices: new Uint32Array([0, 1, 2]),
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 0 },
    },
    pivot: { x: 0, y: 0, z: 0 },
    groups: [{ start: 0, count: 3, materialKey: 'material:unit' }],
  } as const;
}

describe('GeometryPresenter', () => {
  it('creates indexed BufferGeometry with linear vertex colors and declared bounds', () => {
    const presenter = new GeometryPresenter();

    presenter.reconcile([triangleResource()]);

    const geometry = presenter.get('geometry:triangle');
    expect(geometry).toBeDefined();
    expect(geometry?.getAttribute('position').count).toBe(3);
    expect(geometry?.getAttribute('normal').count).toBe(3);
    expect(geometry?.getAttribute('uv').count).toBe(3);
    expect(geometry?.getAttribute('color').normalized).toBe(false);
    expect(geometry?.getAttribute('color').array[0]).toBeCloseTo(0.21586, 4);
    expect(Array.from(geometry?.getIndex()?.array ?? [])).toEqual([0, 1, 2]);
    expect(geometry?.boundingBox?.min.toArray()).toEqual([0, 0, 0]);
    expect(geometry?.boundingBox?.max.toArray()).toEqual([1, 1, 0]);
    expect(geometry?.groups).toEqual([{ start: 0, count: 3, materialIndex: 0 }]);
    expect(geometry?.userData.materialKeys).toEqual(['material:unit']);
  });

  it('places a declared pivot at the local origin without mutating source positions', () => {
    const presenter = new GeometryPresenter();
    const resource = {
      ...triangleResource(),
      key: 'geometry:pivoted',
      pivot: { x: 1, y: 2, z: 3 },
      bounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 0 },
      },
    };
    const original = resource.positions.slice();

    presenter.reconcile([resource]);

    const geometry = presenter.get('geometry:pivoted')!;
    expect(Array.from(geometry.getAttribute('position').array.slice(0, 3))).toEqual([-1, -2, -3]);
    expect(geometry.boundingBox?.min.toArray()).toEqual([-1, -2, -3]);
    expect(resource.positions).toEqual(original);
  });

  it('reuses unchanged geometry and disposes replaced or removed geometry exactly once', () => {
    const presenter = new GeometryPresenter();
    presenter.reconcile([triangleResource()]);
    const original = presenter.get('geometry:triangle')!;
    const dispose = vi.spyOn(original, 'dispose');

    presenter.reconcile([triangleResource()]);
    expect(presenter.get('geometry:triangle')).toBe(original);
    expect(dispose).not.toHaveBeenCalled();

    presenter.reconcile([triangleResource(2)]);
    expect(presenter.get('geometry:triangle')).not.toBe(original);
    expect(dispose).toHaveBeenCalledTimes(1);

    const replacement = presenter.get('geometry:triangle')!;
    const replacementDispose = vi.spyOn(replacement, 'dispose');
    presenter.reconcile([]);
    presenter.dispose();
    expect(replacementDispose).toHaveBeenCalledTimes(1);
  });
});

describe('MaterialPresenter', () => {
  it('honors standard roughness, metalness, alpha, and double-sided policy', () => {
    const presenter = new MaterialPresenter();
    presenter.reconcile([{
      key: 'material:standard',
      version: '1:1',
      shading: 'standard',
      color: { r: 128, g: 64, b: 32, a: 128 },
      vertexColors: true,
      transparent: false,
      opacity: 0.5,
      doubleSided: true,
      roughness: 0.25,
      metalness: 0.75,
    }]);

    const material = presenter.get('material:standard');
    expect(material).toBeInstanceOf(MeshStandardMaterial);
    expect(material).toMatchObject({
      roughness: 0.25,
      metalness: 0.75,
      side: DoubleSide,
      transparent: true,
    });
    expect(material?.opacity).toBeCloseTo(0.5 * (128 / 255), 8);
  });
});

describe('InstanceBatchPresenter', () => {
  it('presents packed transforms and stable keys without taking geometry or material ownership', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial({ vertexColors: true });
    const transforms = new Float32Array(32);
    new Matrix4().makeTranslation(1, 2, 3).toArray(transforms, 0);
    new Matrix4().makeScale(2, 3, 4).setPosition(5, 6, 7).toArray(transforms, 16);
    const presenter = new InstanceBatchPresenter(root);

    presenter.reconcile([
      {
        key: 'batch:units',
        version: '1:1',
        geometryKey: 'geometry:unit',
        materialKey: 'material:unit',
        instanceKeys: ['unit:1:0', 'unit:2:0'],
        matrices: transforms,
        colors: new Uint8Array([
          255, 0, 0, 255,
          0, 128, 255, 255,
        ]),
      },
    ], {
      geometry: () => geometry,
      material: () => material,
    });

    const mesh = presenter.get('batch:units');
    expect(mesh?.count).toBe(2);
    expect(mesh?.userData.instanceKeys).toEqual(['unit:1:0', 'unit:2:0']);
    const actual = new Matrix4();
    mesh?.getMatrixAt(1, actual);
    expect(actual.elements).toEqual(Array.from(transforms.slice(16, 32)));
    const secondColor = new Color();
    mesh?.getColorAt(1, secondColor);
    expect(secondColor.b).toBeGreaterThan(secondColor.g);
    expect(root.children).toEqual([mesh]);

    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    presenter.dispose();
    presenter.dispose();
    expect(root.children).toHaveLength(0);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
  });

  it('removes a batch that disappears from the next presentation', () => {
    const root = new Group();
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const presenter = new InstanceBatchPresenter(root);
    presenter.reconcile([
      {
        key: 'batch:one',
        version: '1:1',
        geometryKey: 'geometry:one',
        materialKey: 'material:one',
        instanceKeys: ['one'],
        matrices: new Float32Array(new Matrix4().elements),
      },
    ], { geometry: () => geometry, material: () => material });

    const mesh = presenter.get('batch:one')!;
    const dispose = vi.spyOn(mesh, 'dispose');
    presenter.reconcile([], { geometry: () => geometry, material: () => material });

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(root.children).toHaveLength(0);
    expect(presenter.count).toBe(0);
  });

  it('rebinds unchanged batch data when its resolved geometry or material is replaced', () => {
    const root = new Group();
    const firstGeometry = new BoxGeometry(1, 1, 1);
    const nextGeometry = new BoxGeometry(2, 2, 2);
    const firstMaterial = new MeshBasicMaterial({ color: 0xff0000 });
    const nextMaterial = new MeshBasicMaterial({ color: 0x00ff00 });
    const presenter = new InstanceBatchPresenter(root);
    const batch = {
      key: 'batch:replacement',
      version: '1:1',
      geometryKey: 'geometry:replacement',
      materialKey: 'material:replacement',
      instanceKeys: ['one'],
      matrices: new Float32Array(new Matrix4().elements),
    };

    presenter.reconcile([batch], {
      geometry: () => firstGeometry,
      material: () => firstMaterial,
    });
    const firstMesh = presenter.get(batch.key)!;
    const dispose = vi.spyOn(firstMesh, 'dispose');

    presenter.reconcile([batch], {
      geometry: () => nextGeometry,
      material: () => nextMaterial,
    });

    const nextMesh = presenter.get(batch.key)!;
    expect(nextMesh).not.toBe(firstMesh);
    expect(nextMesh.geometry).toBe(nextGeometry);
    expect(nextMesh.material).toBe(nextMaterial);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(root.children).toEqual([nextMesh]);

    presenter.dispose();
    firstGeometry.dispose();
    nextGeometry.dispose();
    firstMaterial.dispose();
    nextMaterial.dispose();
  });

  it('resolves geometry material groups instead of flattening consumer-authored topology', () => {
    const root = new Group();
    const geometries = new GeometryPresenter();
    geometries.reconcile([{
      ...triangleResource(),
      groups: [{ start: 0, count: 3, materialKey: 'material:group' }],
    }]);
    const fallback = new MeshBasicMaterial({ color: 0xff0000 });
    const grouped = new MeshBasicMaterial({ color: 0x00ff00 });
    const presenter = new InstanceBatchPresenter(root);

    presenter.reconcile([{
      key: 'batch:grouped',
      version: '1:1',
      geometryKey: 'geometry:triangle',
      materialKey: 'material:fallback',
      instanceKeys: ['one'],
      matrices: new Float32Array(new Matrix4().elements),
    }], {
      geometry: (key) => geometries.get(key),
      material: (key) => key === 'material:group' ? grouped : fallback,
    });

    expect(presenter.get('batch:grouped')?.material).toEqual([grouped]);
    presenter.dispose();
    geometries.dispose();
    fallback.dispose();
    grouped.dispose();
  });
});

describe('ChunkPresenter', () => {
  it('meshes a dense palette chunk and resolves palette colors without owning the material', () => {
    const root = new Group();
    const material = new MeshBasicMaterial({ vertexColors: true });
    const chunk = new DensePaletteChunk({
      origin: { x: 4, y: 0, z: -2 },
      size: { x: 1, y: 1, z: 1 },
      voxels: new Uint16Array([1]),
    });
    const presenter = new ChunkPresenter(root);

    presenter.reconcile([
      {
        key: 'chunk:4:0:-2',
        version: '1:1',
        chunk,
        palette: [
          { r: 0, g: 0, b: 0, a: 0 },
          { r: 255, g: 64, b: 32, a: 255 },
        ],
        materialKey: 'material:terrain',
        worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      },
    ], (key) => key === 'material:terrain' ? material : undefined);

    const mesh = presenter.get('chunk:4:0:-2');
    expect(mesh).toBeDefined();
    expect(mesh?.geometry.getAttribute('position').count).toBe(24);
    expect(mesh?.geometry.getAttribute('color').count).toBe(24);
    expect(mesh?.geometry.getIndex()?.count).toBe(36);
    expect(mesh?.userData.faceCount).toBe(6);
    expect(root.children).toEqual([mesh]);

    const materialDispose = vi.spyOn(material, 'dispose');
    const geometryDispose = vi.spyOn(mesh!.geometry, 'dispose');
    presenter.reconcile([], () => material);
    presenter.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
  });
});
