import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';

import {
  configureIsometricOrthographicView,
  createIsometricOrthographicCamera,
  projectWorldToViewport,
} from '../../src/three/orthographicView.js';

describe('isometric orthographic view', () => {
  it('projects a world-cell basis to a parameterized 2:1 diamond', () => {
    const camera = createIsometricOrthographicCamera({
      viewportWidth: 800,
      viewportHeight: 600,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
      tileWidthPixels: 64,
      tileHeightPixels: 32,
    });

    const origin = projectWorldToViewport(camera, new Vector3(0, 0, 0), 800, 600);
    const alongX = projectWorldToViewport(camera, new Vector3(1, 0, 0), 800, 600);
    const alongZ = projectWorldToViewport(camera, new Vector3(0, 0, 1), 800, 600);

    expect(origin).toEqual({ x: 400, y: 300 });
    expect(alongX.x - origin.x).toBeCloseTo(32, 6);
    expect(alongX.y - origin.y).toBeCloseTo(16, 6);
    expect(alongZ.x - origin.x).toBeCloseTo(-32, 6);
    expect(alongZ.y - origin.y).toBeCloseTo(16, 6);
  });

  it('updates center, zoom, and viewport without replacing the camera', () => {
    const camera = createIsometricOrthographicCamera({
      viewportWidth: 400,
      viewportHeight: 300,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
    });

    const result = configureIsometricOrthographicView(camera, {
      viewportWidth: 1000,
      viewportHeight: 500,
      center: { x: 12, y: 0, z: 7 },
      zoom: 2,
    });

    expect(result).toBe(camera);
    expect(camera.right - camera.left).toBeCloseTo(1000 / (64 / Math.SQRT2 * 2), 8);
    expect(camera.top - camera.bottom).toBeCloseTo(500 / (64 / Math.SQRT2 * 2), 8);
    expect(projectWorldToViewport(camera, new Vector3(12, 0, 7), 1000, 500)).toEqual({
      x: 500,
      y: 250,
    });
  });

  it('rejects invalid view parameters instead of producing a corrupt camera', () => {
    expect(() => createIsometricOrthographicCamera({
      viewportWidth: 0,
      viewportHeight: 600,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
    })).toThrow(/viewportWidth/);

    expect(() => createIsometricOrthographicCamera({
      viewportWidth: 800,
      viewportHeight: 600,
      center: { x: 0, y: 0, z: 0 },
      zoom: 1,
      tileWidthPixels: 32,
      tileHeightPixels: 64,
    })).toThrow(/tileHeightPixels/);

    expect(() => createIsometricOrthographicCamera({
      viewportWidth: 800,
      viewportHeight: 600,
      center: {} as never,
      zoom: 1,
    })).toThrow(/center\.x/);

    expect(() => createIsometricOrthographicCamera({
      viewportWidth: 800,
      viewportHeight: 600,
      center: { x: 0, y: 0, z: 0, irrelevant: Number.NaN } as never,
      zoom: 1,
    })).not.toThrow();
  });
});
