import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera } from 'three';

import {
  createOakBrowserCameraFitterV1,
  fitOakBrowserCameraV1,
} from './oak-browser-camera.js';
import * as focusGeometry from './oak-browser-camera-focus-geometry.js';
import { OAK_DEFAULT_TIME_SCALE_V1 } from './oak-parameters.js';
import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import type { OakBrowserCameraV1 } from './oak-browser-contract.js';

const VIEWPORT = { width: 1280, height: 720, pixelRatio: 1 };

function fixture(day: number) {
  const simulation = createOakSimulationV1({
    seed: 0x51a7_0a4b, timeScale: OAK_DEFAULT_TIME_SCALE_V1,
  });
  simulation.setPaused(false);
  simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day));
  simulation.setPaused(true);
  return {
    simulation,
    snapshot: simulation.snapshot(),
    render: buildOakRenderFrameV1(simulation.projection()).snapshot,
    cutawayRender: buildOakRenderFrameV1(simulation.projection(), {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    }).snapshot,
  };
}

afterEach(() => { vi.restoreAllMocks(); });

/**
 * Bounds: seed, mature and litter frames of the default seed; three presets,
 * retained free cameras, two viewports and both focuses. This proves exact fit
 * parity and preparation reuse, not end-to-end FPS or mutable-input caching.
 */
describe('oak camera subject reuse', () => {
  it.each([0, 100, 249])('matches uncached exact geometry at day %s across views', day => {
    const { snapshot, render, cutawayRender } = fixture(day);
    const fitter = createOakBrowserCameraFitterV1();
    for (const rootCutaway of [false, true, false]) {
      const subject = rootCutaway ? cutawayRender : render;
      for (const preset of ['hero', 'side', 'overhead'] as const) {
        for (const width of [1280, 960]) {
          const viewport = { ...VIEWPORT, width };
          const cachedCamera = new PerspectiveCamera(34, 1, 0.005, 25);
          const uncachedCamera = cachedCamera.clone();
          const cached = fitter.fit(cachedCamera, preset, snapshot, subject,
            viewport, 367, rootCutaway);
          const uncached = fitOakBrowserCameraV1(uncachedCamera, preset, snapshot,
            subject, viewport, 367, rootCutaway);
          expect(cached).toEqual(uncached);
          if (rootCutaway && day > 0) expect(cached.fittedRootVoxelCount).toBeGreaterThan(0);
          expect(cachedCamera.matrixWorld.elements).toEqual(uncachedCamera.matrixWorld.elements);
          expect(cachedCamera.projectionMatrix.elements)
            .toEqual(uncachedCamera.projectionMatrix.elements);

          // A free camera must still project new bounds without being refitted.
          cachedCamera.position.x += 0.02;
          cachedCamera.rotateY(0.12);
          cachedCamera.updateMatrixWorld();
          uncachedCamera.copy(cachedCamera);
          const before = cachedCamera.matrixWorld.elements.slice();
          expect(fitter.fit(cachedCamera, preset, snapshot, subject, viewport,
            null, rootCutaway, 'always'))
            .toEqual(fitOakBrowserCameraV1(uncachedCamera, preset, snapshot, subject,
              viewport, null, rootCutaway, 'always'));
          expect(cachedCamera.matrixWorld.elements).toEqual(before);
        }
      }
    }
    fitter.clear();
  });

  it('prepares once per frame and focus, and releases its one entry on clear', () => {
    const { snapshot, cutawayRender: render } = fixture(100);
    const prepare = vi.spyOn(focusGeometry, 'oakBrowserCameraFocusGeometryV1');
    const fitter = createOakBrowserCameraFitterV1();
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const fit = (preset: OakBrowserCameraV1, rootCutaway = false) =>
      fitter.fit(camera, preset, snapshot, render, VIEWPORT, 367, rootCutaway);
    fit('hero');
    fit('side');
    fit('overhead');
    fitter.fit(camera, 'hero', snapshot, render, { ...VIEWPORT, width: 960 },
      null, false, 'always');
    expect(prepare).toHaveBeenCalledTimes(1);
    fit('hero', true);
    expect(prepare).toHaveBeenCalledTimes(2);
    fit('hero');
    expect(prepare).toHaveBeenCalledTimes(3);
    fitter.clear();
    fitter.clear();
    fit('hero');
    expect(prepare).toHaveBeenCalledTimes(4);
  });

  it('invalidates on changed geometry and reset even when revisions are reused', () => {
    const { simulation, snapshot, render } = fixture(100);
    const fitter = createOakBrowserCameraFitterV1();
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const first = fitter.fit(camera, 'hero', snapshot, render, VIEWPORT, 367, false);
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(149));
    const litter = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: render.revision,
    }).snapshot;
    const nextSnapshot = simulation.snapshot();
    const second = fitter.fit(camera, 'hero', nextSnapshot, litter, VIEWPORT, 367, false);
    expect(second.fittedLitterVoxelCount).toBeGreaterThan(first.fittedLitterVoxelCount);
    expect(second).toEqual(fitOakBrowserCameraV1(new PerspectiveCamera(34, 1, 0.005, 25),
      'hero', nextSnapshot, litter, VIEWPORT, 367, false));
    simulation.reset();
    const reset = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: render.revision,
    }).snapshot;
    expect(reset.descriptor.epoch).not.toBe(render.descriptor.epoch);
    const resetFit = fitter.fit(camera, 'hero', simulation.snapshot(), reset,
      VIEWPORT, 367, false);
    expect(resetFit.fittedLitterVoxelCount).toBe(0);
    expect(resetFit.fittedVertexCount).not.toBe(second.fittedVertexCount);
    fitter.clear();
  });

  it('keeps the stateless fitter responsive to mutable caller matrices', () => {
    const { snapshot, render } = fixture(0);
    const input = structuredClone(render);
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const before = fitOakBrowserCameraV1(camera, 'hero', snapshot, input,
      VIEWPORT, null, false);
    const seed = input.batches.find(batch => batch.key === 'batch:oak:seed-bud-voxels');
    if (seed === undefined) throw new Error('Mutable-input camera test requires seed voxels.');
    for (let offset = 12; offset < seed.matrices.length; offset += 16) {
      seed.matrices[offset] = seed.matrices[offset]! + 0.1;
    }
    const after = fitOakBrowserCameraV1(camera, 'hero', snapshot, input,
      VIEWPORT, null, false, 'always');
    expect(after.subjectBoundsNdc).not.toEqual(before.subjectBoundsNdc);
    expect(after.fittedVertexCount).toBe(before.fittedVertexCount);
  });
});
