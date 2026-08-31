import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';

import { fitOakBrowserCameraV1 } from './oak-browser-camera.js';
import { projectOakBrowserVoxelsV1 } from './oak-browser-voxel-evidence.js';
import { OAK_DEFAULT_TIME_SCALE_V1 } from './oak-parameters.js';
import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1 } from './oak-soil-contact-voxels.js';

const VIEWPORT = { width: 960, height: 720, pixelRatio: 1 } as const;

describe('oak browser projected voxel evidence', () => {
  it('samples accepted plant batches and excludes soil contact from sample coordinates', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    simulation.setPaused(true);
    const frame = buildOakRenderFrameV1(simulation.projection());
    const camera = new PerspectiveCamera(34, VIEWPORT.width / VIEWPORT.height, 0.005, 25);
    fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      frame.snapshot,
      VIEWPORT,
      null,
      false,
    );

    const samples = projectOakBrowserVoxelsV1(frame.snapshot, camera, VIEWPORT);
    expect(samples.length).toBeGreaterThan(100);
    expect(new Set(samples.map(({ role }) => role))).toEqual(
      new Set(['wood', 'leaf', 'seed-bud']),
    );
    expect(samples.every(({ x, y, color }) =>
      Number.isFinite(x) && Number.isFinite(y)
      && x >= 0 && x <= VIEWPORT.width && y >= 0 && y <= VIEWPORT.height
      && color.r > 0 && color.g > 0 && color.b > 0)).toBe(true);

    const soilOnly = {
      ...frame.snapshot,
      batches: frame.snapshot.batches.filter(
        ({ key }) => key === OAK_SOIL_CONTACT_VOXEL_BATCH_KEY_V1,
      ),
    };
    expect(projectOakBrowserVoxelsV1(soilOnly, camera, VIEWPORT)).toEqual([]);
  });
});
