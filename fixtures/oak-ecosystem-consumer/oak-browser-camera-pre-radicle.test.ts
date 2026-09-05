import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';

import { fitOakBrowserCameraV1 } from './oak-browser-camera.js';
import { OAK_DEFAULT_TIME_SCALE_V1 } from './oak-parameters.js';
import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  OAK_ROOT_VOXEL_BATCH_KEY_V1,
  OAK_SEED_BUD_VOXEL_BATCH_KEY_V1,
} from './oak-tissue-voxel-projection.js';

const VIEWPORT = { width: 1_280, height: 720, pixelRatio: 1 } as const;
const HUD_RIGHT_PX = 367;

describe('oak pre-radicle browser camera', () => {
  it('uses only accepted seed geometry before root emergence at days 0 and 2', () => {
    for (const day of [0, 2]) {
      const simulation = createOakSimulationV1({
        seed: 0x51a7_0a4b,
        timeScale: OAK_DEFAULT_TIME_SCALE_V1,
      });
      if (day > 0) {
        simulation.setPaused(false);
        simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(day));
      }
      const frame = buildOakRenderFrameV1(simulation.projection(), {
        rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
      });
      const root = frame.snapshot.batches.find(({ key }) =>
        key === OAK_ROOT_VOXEL_BATCH_KEY_V1)!;
      const seed = frame.snapshot.batches.find(({ key }) =>
        key === OAK_SEED_BUD_VOXEL_BATCH_KEY_V1)!;
      const geometry = frame.snapshot.resources.find((resource) =>
        resource.kind === 'geometry' && resource.key === seed.geometryKey);
      if (geometry?.kind !== 'geometry') {
        throw new Error('Pre-radicle focus test requires accepted seed voxel geometry.');
      }
      const measured = fitOakBrowserCameraV1(
        new PerspectiveCamera(34, 1, 0.005, 25),
        'hero',
        simulation.snapshot(),
        frame.snapshot,
        VIEWPORT,
        HUD_RIGHT_PX,
        true,
      );

      expect(root.instanceKeys, `day ${String(day)}`).toHaveLength(0);
      expect(seed.instanceKeys.length, `day ${String(day)}`).toBeGreaterThan(0);
      expect(measured.fittedRootVoxelCount, `day ${String(day)}`).toBe(0);
      expect(measured.fittedBasalContextVoxelCount, `day ${String(day)}`)
        .toBe(seed.instanceKeys.length);
      expect(measured.fittedVertexCount, `day ${String(day)}`).toBe(
        seed.instanceKeys.length * geometry.positions.length / 3,
      );
      expect(measured.rootShaftsNdc, `day ${String(day)}`)
        .toEqual({ coarse: null, aggregateFine: null });
      expect(measured.subjectClearOfHud, `day ${String(day)}`).toBe(true);
    }
  });
});
