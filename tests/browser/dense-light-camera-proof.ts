import type { Page } from '@playwright/test';

/**
 * Exercises the 1,000-light camera envelope through both exemptions and both
 * reactivation paths. Each reactivation must clamp before its first draw.
 */
export async function measureDenseLightCameraEnvelope(page: Page) {
  return page.evaluate(() => {
    const harness = window.voxelStudio!;
    harness.resizeStage(240, 692);
    const perspectiveRequest = harness.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: 85,
      viewHeight: 3,
    });
    const perspectiveFrame = harness.drawAt(0);
    harness.setLit(false);
    const unlitRequest = harness.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: 85,
      viewHeight: 3,
    });
    harness.drawAt(0);
    harness.setLit(true);
    const relit = harness.viewState();
    const relitFrame = harness.drawAt(0);
    harness.setDepth(false);
    const flatRequest = harness.setViewAngles({
      yawDegrees: 0,
      pitchDegrees: -85,
      viewHeight: 3,
    });
    const flatFrame = harness.drawAt(0);
    harness.setDepth(true);
    const restoredPerspective = harness.viewState();
    const restoredPerspectiveFrame = harness.drawAt(0);
    harness.resizeStage(1280, 720);
    harness.setViewAngles({ yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 });
    harness.drawAt(0);
    harness.play();
    return {
      perspectiveRequest,
      perspectiveLighting: perspectiveFrame.sceneLighting,
      unlitRequest,
      relit,
      relitLighting: relitFrame.sceneLighting,
      flatRequest,
      flatLighting: flatFrame.sceneLighting,
      restoredPerspective,
      restoredPerspectiveLighting: restoredPerspectiveFrame.sceneLighting,
    };
  });
}
