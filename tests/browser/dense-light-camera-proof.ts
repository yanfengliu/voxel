import type { Page } from '@playwright/test';

/**
 * Exercises exact dense-light camera acceptance and transactional rejection.
 * Safe views keep the coordinates the owner requested; an unsafe candidate
 * reports why it failed and leaves the last rendered camera intact.
 */
export async function measureDenseLightCameraEnvelope(page: Page) {
  return page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.resizeStage(1280, 720);
    const perspectiveRequest = harness.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: 85,
      viewHeight: 100,
    });
    harness.setViewCenter([20, 0, -20]);
    const perspectiveCenter = harness.viewCenter();
    const perspectiveFrame = harness.drawAt(0);
    harness.setLit(false);
    const unlitRequest = harness.viewState();
    harness.drawAt(0);
    harness.setLit(true);
    const relit = harness.viewState();
    const relitCenter = harness.viewCenter();
    const relitFrame = harness.drawAt(0);
    harness.setDepth(false);
    harness.setViewCenter([-20, 0, 20]);
    const flatRequest = harness.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: -85,
      viewHeight: 100,
    });
    const flatFrame = harness.drawAt(0);
    harness.setDepth(true);
    const restoredPerspective = harness.viewState();
    const restoredCenter = harness.viewCenter();
    const restoredPerspectiveFrame = harness.drawAt(0);
    const beforeRejected = {
      view: harness.viewState(),
      center: harness.viewCenter(),
    };
    let rejection = '';
    try {
      harness.setViewAngles({
        yawDegrees: 45,
        pitchDegrees: 30,
        viewHeight: 256,
      });
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }
    const afterRejected = {
      view: harness.viewState(),
      center: harness.viewCenter(),
    };
    harness.play();
    return {
      perspectiveRequest,
      perspectiveCenter,
      perspectiveLighting: perspectiveFrame.sceneLighting,
      unlitRequest,
      relit,
      relitCenter,
      relitLighting: relitFrame.sceneLighting,
      flatRequest,
      flatLighting: flatFrame.sceneLighting,
      restoredPerspective,
      restoredCenter,
      restoredPerspectiveLighting: restoredPerspectiveFrame.sceneLighting,
      beforeRejected,
      rejection,
      afterRejected,
    };
  });
}
