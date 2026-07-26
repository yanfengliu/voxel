import type { Page } from '@playwright/test';

export interface ReceiverLightingProof {
  readonly totalPixels: number;
  readonly changedPixels: number;
  readonly chromaticPixels: number;
  readonly warmPixels: number;
  readonly coolPixels: number;
  readonly greenPixels: number;
  readonly movingContributionPixels: number;
  readonly changedRatio: number;
  readonly chromaticRatio: number;
  readonly movingContributionRatio: number;
  readonly programsBefore: number;
  readonly programsAfter: number;
}

/**
 * Measures point-light contribution with marker and daylight pixels held
 * constant: setting intensity to zero changes neither marker geometry/color
 * nor the daylight rig, so every changed pixel belongs to lit scene geometry.
 */
export async function measureReceiverLightingProof(
  page: Page,
): Promise<ReceiverLightingProof> {
  return page.evaluate(() => {
    const harness = window.voxelStudio!;
    const original = structuredClone(harness.sceneState()!);
    if (!original.lights) {
      throw new Error('The receiver-lighting proof needs a scene with point lights.');
    }
    const programCount = (): number =>
      (window as typeof window & { readonly __voxelCreatedPrograms: number })
        .__voxelCreatedPrograms;
    const readScenePixels = (): Uint8Array => {
      const sceneCanvas = document.querySelector<HTMLCanvasElement>('.scene-canvas');
      const gl = sceneCanvas?.getContext('webgl2');
      if (!sceneCanvas || !gl) {
        throw new Error('The receiver-lighting proof could not read the scene WebGL2 canvas.');
      }
      const pixels = new Uint8Array(sceneCanvas.width * sceneCanvas.height * 4);
      gl.finish();
      gl.readPixels(
        0,
        0,
        sceneCanvas.width,
        sceneCanvas.height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels,
      );
      return pixels;
    };

    const zeroIntensityScene = {
      ...original,
      lights: original.lights.map((light) => ({ ...light, intensity: 0 })),
    };
    const captureContribution = (nowMs: number): Int16Array => {
      harness.editScene(original);
      harness.drawAt(nowMs);
      const litPixels = readScenePixels();
      harness.editScene(zeroIntensityScene);
      harness.drawAt(nowMs);
      const zeroIntensityPixels = readScenePixels();
      const contribution = new Int16Array(litPixels.length / 4 * 3);
      for (let pixel = 0, channel = 0; pixel < litPixels.length; pixel += 4, channel += 3) {
        contribution[channel] = litPixels[pixel]! - zeroIntensityPixels[pixel]!;
        contribution[channel + 1] = litPixels[pixel + 1]! - zeroIntensityPixels[pixel + 1]!;
        contribution[channel + 2] = litPixels[pixel + 2]! - zeroIntensityPixels[pixel + 2]!;
      }
      return contribution;
    };

    const programsBefore = programCount();
    let startContribution: Int16Array;
    let laterContribution: Int16Array;
    try {
      startContribution = captureContribution(0);
      laterContribution = captureContribution(1_000);
    } finally {
      harness.editScene(original);
      harness.drawAt(0);
    }

    let changedPixels = 0;
    let chromaticPixels = 0;
    let warmPixels = 0;
    let coolPixels = 0;
    let greenPixels = 0;
    let movingContributionPixels = 0;
    for (let index = 0; index < startContribution.length; index += 3) {
      const redDelta = startContribution[index]!;
      const greenDelta = startContribution[index + 1]!;
      const blueDelta = startContribution[index + 2]!;
      const startMagnitude = Math.max(
        Math.abs(redDelta),
        Math.abs(greenDelta),
        Math.abs(blueDelta),
      );
      const laterMagnitude = Math.max(
        Math.abs(laterContribution[index]!),
        Math.abs(laterContribution[index + 1]!),
        Math.abs(laterContribution[index + 2]!),
      );
      if (startMagnitude >= 8 && laterMagnitude >= 8 && Math.max(
        Math.abs(redDelta - laterContribution[index]!),
        Math.abs(greenDelta - laterContribution[index + 1]!),
        Math.abs(blueDelta - laterContribution[index + 2]!),
      ) >= 8) {
        // Requiring a local-light contribution at both times excludes the
        // moving unlit marker wherever it occludes a receiver in either frame.
        movingContributionPixels += 1;
      }
      if (startMagnitude < 8) continue;
      changedPixels += 1;
      if (
        Math.max(redDelta, greenDelta, blueDelta)
          - Math.min(redDelta, greenDelta, blueDelta)
        >= 6
      ) {
        chromaticPixels += 1;
      }
      if (redDelta - blueDelta >= 8 && redDelta - greenDelta >= 4) warmPixels += 1;
      if (blueDelta - redDelta >= 8 && blueDelta - greenDelta >= 4) coolPixels += 1;
      if (greenDelta - redDelta >= 8 && greenDelta - blueDelta >= 4) greenPixels += 1;
    }
    const totalPixels = startContribution.length / 3;
    return {
      totalPixels,
      changedPixels,
      chromaticPixels,
      warmPixels,
      coolPixels,
      greenPixels,
      movingContributionPixels,
      changedRatio: changedPixels / totalPixels,
      chromaticRatio: chromaticPixels / Math.max(1, changedPixels),
      movingContributionRatio: movingContributionPixels / totalPixels,
      programsBefore,
      programsAfter: programCount(),
    };
  });
}
