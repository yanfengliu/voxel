import { describe, expect, it } from 'vitest';
import {
  Camera,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from 'three';

import {
  borrowedCameraRollbackInternal,
  createLegacyIsometricStrategyInternal,
  createThreeViewStrategyInternal,
  projectWorldToViewportV1,
  tryProjectWorldToViewportV1,
  tryViewportPointToRayV1,
  viewportPointToRayV1,
} from '../../src/three/cameraStrategy.js';
import { configureIsometricOrthographicView } from '../../src/three/orthographicView.js';

describe('Three camera strategies', () => {
  it('creates and resizes an owned perspective camera deterministically', () => {
    const strategy = createThreeViewStrategyInternal({
      kind: 'perspective',
      position: { x: 10, y: 8, z: 6 },
      target: { x: 1, y: 2, z: 3 },
      up: { x: 0, y: 1, z: 0 },
      verticalFovDegrees: 55,
      near: 0.25,
      far: 2_000,
    }, 800, 400);

    expect(strategy.camera).toBeInstanceOf(PerspectiveCamera);
    const camera = strategy.camera as PerspectiveCamera;
    expect(camera.aspect).toBe(2);
    expect(camera.fov).toBe(55);
    expect(camera.position.toArray()).toEqual([10, 8, 6]);
    expect(strategy.focus).toEqual({ x: 1, y: 2, z: 3 });
    strategy.resize(300, 600);
    expect(camera.aspect).toBe(0.5);
  });

  it('never mutates a host-projected borrowed camera', () => {
    const camera = new PerspectiveCamera(47, 1.25, 0.5, 900);
    camera.position.set(7, 6, 5);
    camera.updateProjectionMatrix();
    const projection = camera.projectionMatrix.toArray();
    const strategy = createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera,
      projectionOwnership: 'host',
    }, 900, 300);

    strategy.resize(200, 800);
    expect(strategy.camera).toBe(camera);
    expect(strategy.ownership).toBe('borrowed');
    expect(camera.aspect).toBe(1.25);
    expect(camera.position.toArray()).toEqual([7, 6, 5]);
    expect(camera.projectionMatrix.toArray()).toEqual(projection);
  });

  it('updates only known projection fields for runtime-projected borrowed cameras', () => {
    const perspective = new PerspectiveCamera(60, 1, 0.1, 1_000);
    const perspectiveStrategy = createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: perspective,
      projectionOwnership: 'runtime',
    }, 640, 320);
    expect(perspective.aspect).toBe(2);
    perspectiveStrategy.resize(320, 640);
    expect(perspective.aspect).toBe(0.5);

    const orthographic = new OrthographicCamera(-2, 2, 3, -3, 0.1, 100);
    const orthographicStrategy = createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: orthographic,
      projectionOwnership: 'runtime',
    }, 600, 300);
    expect([orthographic.left, orthographic.right, orthographic.top, orthographic.bottom])
      .toEqual([-6, 6, 3, -3]);
    orthographicStrategy.resize(300, 600);
    expect([orthographic.left, orthographic.right]).toEqual([-1.5, 1.5]);

    expect(() => createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: new Camera(),
      projectionOwnership: 'runtime',
    }, 100, 100)).toThrow(/known orthographic or perspective/);
  });

  it('rejects unknown camera-policy discriminants and malformed runtime projection ownership', () => {
    expect(() => createThreeViewStrategyInternal({
      kind: 'panoramic',
    } as never, 100, 100)).toThrow(/view\.kind/);
    expect(() => createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: new PerspectiveCamera(),
      projectionOwnership: 'shared',
    } as never, 100, 100)).toThrow(/projectionOwnership/);
    expect(() => createThreeViewStrategyInternal(null as never, 100, 100))
      .toThrow(/must be an object/);
  });

  it('validates every retained field used by runtime-owned borrowed projections', () => {
    const perspective = new PerspectiveCamera();
    perspective.fov = Number.NaN;
    expect(() => createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: perspective,
      projectionOwnership: 'runtime',
    }, 100, 100)).toThrow(/perspective fov/);

    const orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    orthographic.left = Number.NaN;
    expect(() => createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: orthographic,
      projectionOwnership: 'runtime',
    }, 100, 100)).toThrow(/orthographic left/);

    const invalidView = new PerspectiveCamera();
    invalidView.setViewOffset(100, 100, 0, 0, 50, 50);
    invalidView.view!.fullWidth = 0;
    expect(() => createThreeViewStrategyInternal({
      kind: 'borrowed-camera',
      camera: invalidView,
      projectionOwnership: 'runtime',
    }, 100, 100)).toThrow(/view\.fullWidth/);
  });

  it('restores borrowed camera projection and transforms without replacing host metadata', () => {
    const camera = new OrthographicCamera(-3, 5, 7, -2, 0.25, 800);
    camera.position.set(4, 5, 6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const userData = camera.userData;
    const expected = {
      bounds: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far],
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projection: camera.projectionMatrix.toArray(),
    };
    const rollback = borrowedCameraRollbackInternal(camera);

    createLegacyIsometricStrategyInternal({
      camera,
      width: 800,
      height: 600,
      center: { x: 10, y: 2, z: -4 },
      zoom: 2,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    });
    rollback();

    expect([camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far])
      .toEqual(expected.bounds);
    expect(camera.position.toArray()).toEqual(expected.position);
    expect(camera.quaternion.toArray()).toEqual(expected.quaternion);
    expect(camera.projectionMatrix.toArray()).toEqual(expected.projection);
    expect(camera.userData).toBe(userData);
  });

  it('restores cached legacy isometric defaults as part of borrowed-camera rollback', () => {
    const camera = new OrthographicCamera();
    const baseView = {
      viewportWidth: 400,
      viewportHeight: 200,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
      tileWidthPixels: 80,
      tileHeightPixels: 20,
      distance: 500,
      near: 2,
      far: 800,
    };
    configureIsometricOrthographicView(camera, baseView);
    const expectedPosition = camera.position.toArray();
    const expectedProjection = camera.projectionMatrix.toArray();
    const rollback = borrowedCameraRollbackInternal(camera);
    createLegacyIsometricStrategyInternal({
      camera,
      width: 100,
      height: 100,
      center: { x: 3, y: 2, z: 1 },
      zoom: 2,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    });

    rollback();
    configureIsometricOrthographicView(camera, {
      viewportWidth: baseView.viewportWidth,
      viewportHeight: baseView.viewportHeight,
      center: baseView.center,
      zoom: baseView.zoom,
    });
    expect(camera.position.toArray()).toEqual(expectedPosition);
    expect(camera.projectionMatrix.toArray()).toEqual(expectedProjection);
    expect([camera.near, camera.far]).toEqual([2, 800]);
  });

  it('preserves legacy isometric camera normalization', () => {
    const borrowed = new OrthographicCamera();
    const strategy = createLegacyIsometricStrategyInternal({
      camera: borrowed,
      width: 800,
      height: 600,
      center: { x: 4, y: 2, z: -3 },
      zoom: 2,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    });
    expect(strategy.camera).toBe(borrowed);
    expect(strategy.ownership).toBe('borrowed');
    expect(strategy.focus).toEqual({ x: 4, y: 2, z: -3 });
    const before = borrowed.projectionMatrix.toArray();
    strategy.resize(400, 300);
    expect(borrowed.projectionMatrix.toArray()).not.toEqual(before);
    strategy.setLegacyIsometricView({ x: 0, y: 1, z: 0 }, 1.5);
    expect(strategy.focus).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('projects plain points and returns a normalized plain viewport ray', () => {
    const camera = new PerspectiveCamera(60, 2, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const projected = projectWorldToViewportV1(
      camera,
      { x: 0, y: 0, z: 0 },
      { width: 800, height: 400 },
    );
    expect(projected.x).toBe(400);
    expect(projected.y).toBe(200);
    expect(Number.isFinite(projected.depth)).toBe(true);
    const ray = viewportPointToRayV1(camera, { x: 400, y: 200 }, { width: 800, height: 400 });
    expect(ray.origin).toEqual({ x: 0, y: 0, z: 10 });
    expect(new Vector3(ray.direction.x, ray.direction.y, ray.direction.z).length()).toBeCloseTo(1);
    expect(ray.direction.z).toBeLessThan(-0.99);
  });

  it('returns typed unprojectable outcomes and never leaks non-finite helper values', () => {
    const camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(tryProjectWorldToViewportV1(
      camera,
      { x: 0, y: 0, z: 10 },
      { width: 100, height: 100 },
    )).toEqual({ status: 'unprojectable', reason: 'non-finite-projection' });
    expect(() => projectWorldToViewportV1(
      camera,
      { x: 0, y: 0, z: 10 },
      { width: 100, height: 100 },
    )).toThrow(/non-finite viewport projection/);

    camera.projectionMatrixInverse.elements[0] = Number.NaN;
    expect(tryViewportPointToRayV1(camera, { x: 50, y: 50 }, { width: 100, height: 100 }))
      .toEqual({ status: 'unprojectable', reason: 'non-finite-ray' });
    expect(() => viewportPointToRayV1(camera, { x: 50, y: 50 }, { width: 100, height: 100 }))
      .toThrow(/non-finite viewport ray/);
  });

  it('rejects non-finite and degenerate camera policy before allocation', () => {
    expect(() => createThreeViewStrategyInternal({
      kind: 'perspective',
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      verticalFovDegrees: 60,
      near: 0.1,
      far: 100,
    }, 100, 100)).toThrow(/position and target/);
    expect(() => createThreeViewStrategyInternal({
      kind: 'isometric-orthographic',
      center: { x: 0, y: 0, z: 0 },
      zoom: Number.NaN,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    }, 100, 100)).toThrow(/zoom/);
    expect(() => createThreeViewStrategyInternal({
      kind: 'perspective',
      position: { x: 0, y: 5, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      verticalFovDegrees: 60,
      near: 0.1,
      far: 100,
    }, 100, 100)).toThrow(/collinear/);
    expect(() => createThreeViewStrategyInternal({
      kind: 'perspective',
      position: { x: 0, y: 0, z: 5 },
      target: { x: 0, y: 0, z: 0 },
      verticalFovDegrees: 60,
      near: 0.1,
      far: 100,
    }, Number.MIN_VALUE, Number.MAX_VALUE)).toThrow(/aspect ratio/);
    expect(() => createLegacyIsometricStrategyInternal({
      camera: new PerspectiveCamera() as never,
      width: 100,
      height: 100,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    })).toThrow(/OrthographicCamera/);
  });
});
