import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';

import { fitOakBrowserCameraV1 } from './oak-browser-camera.js';
import { OAK_DEFAULT_TIME_SCALE_V1, OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

const VIEWPORT = { width: 1_280, height: 720, pixelRatio: 1 } as const;
const HUD_RIGHT_PX = 367;

describe('oak browser camera material fit', () => {
  it('remeasures breeze-deformed vertices without breathing while they remain safe', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    simulation.setPaused(true);
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const stillFrame = buildOakRenderFrameV1(simulation.projection());
    const still = fitOakBrowserCameraV1(
      camera,
      'side',
      simulation.snapshot(),
      stillFrame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
    );
    const position = camera.position.toArray();
    const quaternion = camera.quaternion.toArray();

    simulation.setTimeScale(1);
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    simulation.setPaused(false);
    simulation.advanceHostTicks(OAK_PARAMETERS_V1.mechanics.gustRampHostTicks);
    simulation.setPaused(true);
    const breezeFrame = buildOakRenderFrameV1(simulation.projection());
    const breeze = fitOakBrowserCameraV1(
      camera,
      'side',
      simulation.snapshot(),
      breezeFrame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
      true,
    );

    expect(breeze.subjectBoundsNdc).not.toEqual(still.subjectBoundsNdc);
    expect(camera.position.toArray()).toEqual(position);
    expect(camera.quaternion.toArray()).toEqual(quaternion);
    expect(Math.max(Math.abs(breeze.subjectBoundsNdc.minY), breeze.subjectBoundsNdc.maxY))
      .toBeLessThan(0.9);
    expect(breeze.fittedOrganCount).toBeLessThan(
      simulation.snapshot().diagnostics.organCount,
    );
    expect(breeze.fittedVertexCount).toBeGreaterThan(breeze.fittedOrganCount);
    expect(simulation.snapshot().diagnostics.mechanicsClampedOrganCount).toBe(0);
  });

  it('counts root geometry only in the cutaway fit', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const wholeFrame = buildOakRenderFrameV1(simulation.projection());
    const whole = fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      wholeFrame.snapshot,
      VIEWPORT,
      null,
      false,
    );
    const cutawayFrame = buildOakRenderFrameV1(simulation.projection(), {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const cutaway = fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      cutawayFrame.snapshot,
      VIEWPORT,
      null,
      true,
    );

    expect(whole.fittedOrganCount).toBeLessThan(simulation.snapshot().diagnostics.organCount);
    expect(whole.rootShaftsNdc).toEqual({ coarse: null, aggregateFine: null });
    expect(cutaway.fittedOrganCount).toBe(simulation.snapshot().diagnostics.organCount);
    expect(cutaway.fittedVertexCount).toBeGreaterThan(whole.fittedVertexCount);
    expect(cutaway.rootShaftsNdc.coarse).not.toBeNull();
    expect(cutaway.rootShaftsNdc.aggregateFine).not.toBeNull();
  });
});
