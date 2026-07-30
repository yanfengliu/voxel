import { describe, expect, it, vi } from 'vitest';
import {
  BoxGeometry,
  EqualDepth,
  Group,
  InstancedMesh,
  LessEqualDepth,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Material,
} from 'three';

import { InstanceBatchPresenter } from '../../src/three/instanceBatchPresenter.js';
import {
  createSingleLayerDepthPrepassInternal,
  isSingleLayerTransparencyMarkedInternal,
  markSingleLayerTransparencyInternal,
} from '../../src/three/singleLayerTransparencyInternal.js';

function translucent(): MeshBasicMaterial {
  return new MeshBasicMaterial({ transparent: true, opacity: 0.62, vertexColors: true });
}

function batchOf(count: number, version = '1:1') {
  const matrices = new Float32Array(count * 16);
  for (let slot = 0; slot < count; slot += 1) {
    new Matrix4().makeTranslation(slot * 2, 0, 0).toArray(matrices, slot * 16);
  }
  return {
    key: 'batch:film',
    version,
    geometryKey: 'geometry:cell',
    materialKey: 'material:water',
    instanceKeys: Array.from({ length: count }, (_, slot) => `cell-${String(slot)}`),
    matrices,
  };
}

describe('single-layer transparency mark', () => {
  it('sets the colour pass to blend once against the prepass depth', () => {
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    expect(isSingleLayerTransparencyMarkedInternal(material)).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthFunc).toBe(EqualDepth);
    material.dispose();
  });

  it('refuses an opaque material and says what would satisfy it', () => {
    const material = new MeshBasicMaterial({ name: 'landscape' });
    expect(() => markSingleLayerTransparencyInternal(material)).toThrow(
      /'landscape' cannot present single-layer transparency: it is opaque at opacity 1\. Mark only materials whose presentation declares transparent with an opacity strictly between 0 and 1/u,
    );
    expect(isSingleLayerTransparencyMarkedInternal(material)).toBe(false);
    material.dispose();
  });

  it('refuses invisible and fully solid transparent materials by the same rule', () => {
    const invisible = new MeshBasicMaterial({ name: 'wireframe-veil', transparent: true, opacity: 0 });
    expect(() => markSingleLayerTransparencyInternal(invisible)).toThrow(
      /'wireframe-veil' cannot present single-layer transparency: it is transparent at opacity 0/u,
    );
    const solid = new MeshBasicMaterial({ name: 'painted-glass', transparent: true, opacity: 1 });
    expect(() => markSingleLayerTransparencyInternal(solid)).toThrow(
      /'painted-glass' cannot present single-layer transparency: it is transparent at opacity 1/u,
    );
    expect(isSingleLayerTransparencyMarkedInternal(invisible)).toBe(false);
    expect(isSingleLayerTransparencyMarkedInternal(solid)).toBe(false);
    invisible.dispose();
    solid.dispose();
  });

  it('leaves unmarked materials without a prepass companion', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    const mesh = new InstancedMesh(
      geometry,
      material,
      1,
    );
    expect(createSingleLayerDepthPrepassInternal(mesh, material, 'batch:film')).toBeNull();
    geometry.dispose();
    material.dispose();
  });
});

describe('single-layer depth prepass companion', () => {
  it('shares the mesh buffers and runs the very same program as the colour pass', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshLambertMaterial({
      transparent: true,
      opacity: 0.62,
      vertexColors: true,
    });
    // Stands in for the clustered-lighting decoration: whatever compile hooks
    // the colour pass carries, the depth pass must carry identically or the
    // two passes compile different programs and their depths drift.
    const onBeforeCompile = vi.fn();
    material.onBeforeCompile = onBeforeCompile;
    material.customProgramCacheKey = () => 'decorated-key';
    markSingleLayerTransparencyInternal(material);

    const presenter = new InstanceBatchPresenter(new Group());
    presenter.reconcile([batchOf(2)], { geometry: () => geometry, material: () => material });
    const mesh = presenter.get('batch:film')!;
    const companion = mesh.parent!.children.find(
      (child) => child.name === 'batch:film:single-layer-depth',
    ) as InstancedMesh | undefined;
    expect(companion).toBeDefined();
    expect(companion!.geometry).toBe(mesh.geometry);
    expect(companion!.instanceMatrix).toBe(mesh.instanceMatrix);
    expect(companion!.count).toBe(2);
    expect(companion!.renderOrder).toBe(-1);
    expect(companion!.frustumCulled).toBe(false);

    const depthMaterial = companion!.material as Material;
    expect(depthMaterial).toBeInstanceOf(MeshLambertMaterial);
    expect(depthMaterial.colorWrite).toBe(false);
    expect(depthMaterial.depthWrite).toBe(true);
    expect(depthMaterial.depthFunc).toBe(LessEqualDepth);
    expect(depthMaterial.transparent).toBe(true);
    expect(depthMaterial.vertexColors).toBe(true);
    // Identity, not equivalence: the depth pass must carry the very same hook
    // so Three's program cache key (which stringifies the hook) matches.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(depthMaterial.onBeforeCompile).toBe(onBeforeCompile);
    expect(depthMaterial.customProgramCacheKey()).toBe('decorated-key');

    presenter.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('stays out of picking so a film still picks as one surface', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    const root = new Group();
    const presenter = new InstanceBatchPresenter(root);
    presenter.reconcile([batchOf(1)], { geometry: () => geometry, material: () => material });

    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.updateMatrixWorld();
    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);
    root.updateMatrixWorld(true);
    const hits = raycaster.intersectObjects(root.children, false);
    const hitNames = new Set(hits.map((hit) => hit.object.name));
    expect(hitNames.has('batch:film')).toBe(true);
    expect(hitNames.has('batch:film:single-layer-depth')).toBe(false);

    presenter.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('mirrors the presented count on slot updates and dies with its batch', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    const root = new Group();
    const presenter = new InstanceBatchPresenter(root);
    presenter.reconcile([batchOf(2)], { geometry: () => geometry, material: () => material });
    const companion = root.children.find(
      (child) => child.name === 'batch:film:single-layer-depth',
    ) as InstancedMesh;
    expect(companion.count).toBe(2);

    presenter.reconcile([batchOf(1, '1:2')], {
      geometry: () => geometry,
      material: () => material,
    });
    expect(companion.count).toBe(1);

    const disposed = vi.fn();
    companion.addEventListener('dispose', disposed);
    presenter.reconcile([], { geometry: () => geometry, material: () => material });
    expect(root.children).toHaveLength(0);
    expect(disposed).toHaveBeenCalledTimes(1);

    presenter.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('hands the twin an instance colour buffer the mesh gained mid-life', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    const root = new Group();
    const presenter = new InstanceBatchPresenter(root);
    const empty = {
      key: 'batch:film',
      version: '1:1',
      geometryKey: 'geometry:cell',
      materialKey: 'material:water',
      instanceKeys: [] as string[],
      matrices: new Float32Array(0),
      colors: new Uint8Array(0),
    };
    presenter.reconcile([empty], { geometry: () => geometry, material: () => material });
    const mesh = presenter.get('batch:film')!;
    const companion = root.children.find(
      (child) => child.name === 'batch:film:single-layer-depth',
    ) as InstancedMesh;
    expect(mesh.instanceColor).toBeNull();
    expect(companion.instanceColor).toBeNull();

    presenter.reconcile([{
      ...empty,
      version: '1:2',
      instanceKeys: ['cell-0'],
      matrices: new Float32Array(new Matrix4().elements),
      colors: new Uint8Array([10, 20, 30, 255]),
    }], { geometry: () => geometry, material: () => material });
    // The grow stayed within capacity, so the same meshes persist; three only
    // creates the colour buffer on the first colour write, and the twin must
    // share it or the two passes stop compiling the same program.
    expect(presenter.get('batch:film')).toBe(mesh);
    expect(mesh.instanceColor).not.toBeNull();
    expect(companion.instanceColor).toBe(mesh.instanceColor);
    expect(companion.count).toBe(1);

    presenter.dispose();
    geometry.dispose();
    material.dispose();
  });

  it('disposes the derived depth material when its colour material goes', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    const mesh = new InstancedMesh(
      geometry,
      material,
      1,
    );
    const companion = createSingleLayerDepthPrepassInternal(mesh, material, 'batch:film')!;
    const depthMaterial = companion.material as Material;
    const depthDisposed = vi.fn();
    depthMaterial.addEventListener('dispose', depthDisposed);

    const again = createSingleLayerDepthPrepassInternal(mesh, material, 'batch:film')!;
    expect(again.material).toBe(depthMaterial);

    material.dispose();
    expect(depthDisposed).toHaveBeenCalledTimes(1);
    geometry.dispose();
  });

  it('refuses a batch that mixes marked and ordinary materials across groups', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const marked = translucent();
    markSingleLayerTransparencyInternal(marked);
    const ordinary = translucent();
    const mesh = new InstancedMesh(
      geometry,
      [marked, ordinary],
      1,
    );
    expect(() => createSingleLayerDepthPrepassInternal(mesh, [marked, ordinary], 'batch:mixed'))
      .toThrow(
        /Batch 'batch:mixed' mixes single-layer transparent materials with ordinary ones across its geometry groups \(0:marked, 1:unmarked\); one depth prepass cannot cover half a mesh/u,
      );
    geometry.dispose();
    marked.dispose();
    ordinary.dispose();
  });

  it('leaves the scene graph untouched when the mixed-materials refusal fires mid-reconcile', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.userData.materialKeys = ['material:water', 'material:glass'];
    const marked = translucent();
    markSingleLayerTransparencyInternal(marked);
    const ordinary = translucent();
    const materials = new Map([
      ['material:water', marked],
      ['material:glass', ordinary],
    ]);
    const root = new Group();
    const presenter = new InstanceBatchPresenter(root);
    const resolvers = {
      geometry: () => geometry,
      material: (key: string) => materials.get(key),
    };
    expect(() => presenter.reconcile([batchOf(1)], resolvers)).toThrow(
      /Batch 'batch:film' mixes single-layer transparent materials/u,
    );
    // The refusal fires before anything joins the scene graph, so no orphan
    // mesh outlives it and the presenter stays usable for the corrected batch.
    expect(root.children).toHaveLength(0);
    expect(presenter.count).toBe(0);

    geometry.userData.materialKeys = ['material:water', 'material:water'];
    presenter.reconcile([batchOf(1)], resolvers);
    expect(root.children.map((child) => child.name).sort()).toEqual([
      'batch:film',
      'batch:film:single-layer-depth',
    ]);

    presenter.dispose();
    geometry.dispose();
    marked.dispose();
    ordinary.dispose();
  });
});

// The shared instance buffer is the animation lane too: a matrix the presenter
// animates lands in the prepass because both meshes read one attribute.
describe('single-layer prepass under animation', () => {
  it('sees animated matrices through the shared instance attribute', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = translucent();
    markSingleLayerTransparencyInternal(material);
    const root = new Group();
    const presenter = new InstanceBatchPresenter(root);
    presenter.reconcile([{
      ...batchOf(1),
      animation: {
        schemaVersion: 'voxel.instance-transform-animation/1' as const,
        periodsMs: new Float32Array([1_000]),
        phasesRadians: new Float32Array([0]),
        translationAmplitudes: new Float32Array([0, 1, 0]),
        rotationAmplitudesRadians: new Float32Array(3),
        scaleAmplitudes: new Float32Array(3),
      },
    }], { geometry: () => geometry, material: () => material });
    presenter.animate(250);

    const companion = root.children.find(
      (child) => child.name === 'batch:film:single-layer-depth',
    ) as InstancedMesh;
    const fromCompanion = new Matrix4();
    companion.getMatrixAt(0, fromCompanion);
    const position = new Vector3();
    fromCompanion.decompose(position, new Quaternion(), new Vector3());
    expect(position.y).toBeCloseTo(1, 8);

    presenter.dispose();
    geometry.dispose();
    material.dispose();
  });
});
