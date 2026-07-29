import type { Page } from '@playwright/test';

import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';
import {
  WINDMILL_PLACEMENT_IDS_V1,
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from '../../tools/studio/windmill-layout.js';

export const WINDMILL_REPLAY_ID = WINDMILL_POSE_REPLAY_ID;
export const WINDMILL_TRACK_IDS = Object.freeze(
  Object.values(WINDMILL_PLACEMENT_IDS_V1),
);
export { WINDMILL_SCENE_ID };

export interface WindmillCameraV1 {
  readonly center: readonly [number, number, number];
  readonly view: {
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly viewHeight: number;
  };
}

interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

interface FocusedWindow extends Window {
  windmillFocused?: StudioHandleV1;
}

export async function mountWindmillStudio(
  page: Page,
  studioOrigin: string,
  options: {
    readonly extraOrbitingLightPeriodMs?: number;
  } = {},
) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  if (!response?.ok()) {
    throw new Error(
      `Cannot mount focused Windmill Studio: navigation returned ${
        response === null ? 'no response' : String(response.status())
      }.`,
    );
  }
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  return page.evaluate(async ({
    sceneId,
    replayId,
    expectedTrackIds,
    extraOrbitingLightPeriodMs,
  }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } =
      await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } =
      await import(catalogUrl) as unknown as BrowserCatalogModule;
    const catalog = createStudioCatalog();
    const catalogScenes = catalog.scenes;
    if (catalogScenes === undefined) {
      throw new Error(
        `Focused Windmill browser evidence needs scene '${sceneId}', but the `
        + 'live catalog has no scene collection.',
      );
    }
    const catalogScene = catalogScenes.find(({ id }) => id === sceneId);
    if (catalogScene?.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        `Focused Windmill browser evidence needs V4 scene '${sceneId}' in the live catalog.`,
      );
    }
    if (extraOrbitingLightPeriodMs !== null
      && (!Number.isFinite(extraOrbitingLightPeriodMs)
        || extraOrbitingLightPeriodMs <= 0)) {
      throw new Error(
        `Focused Windmill mixed-motion evidence needs a positive finite light `
        + `period; received ${String(extraOrbitingLightPeriodMs)}.`,
      );
    }
    const scene = extraOrbitingLightPeriodMs === null
      ? catalogScene
      : {
          ...catalogScene,
          lights: [
            ...(catalogScene.lights ?? []),
            {
              id: 'light:windmill-mixed-window-proof',
              kind: 'point' as const,
              at: [0, 12, 0] as const,
              color: { r: 255, g: 220, b: 160 },
              intensity: 8,
              range: 24,
              motion: {
                kind: 'orbit' as const,
                center: [0, 12, 0] as const,
                axis: 'y' as const,
                periodMs: extraOrbitingLightPeriodMs,
                phaseRadians: 0,
              },
            },
          ],
        };
    const mountedCatalog: StudioCatalogV1 =
      extraOrbitingLightPeriodMs === null
        ? catalog
        : {
            ...catalog,
            scenes: catalogScenes.map((entry) =>
              entry.id === sceneId ? scene : entry),
          };
    if (scene.poseReplay.id !== replayId) {
      throw new Error(
        `Windmill scene '${sceneId}' references replay '${scene.poseReplay.id}', expected '${replayId}'.`,
      );
    }
    const replay = catalog.scenePoseReplays?.[replayId];
    if (replay === undefined) {
      throw new Error(
        `Focused Windmill browser evidence needs generated replay '${replayId}' in the live catalog.`,
      );
    }
    const placementIds = scene.placements.map(({ id }) => id);
    const trackIds = replay.tracks.map(({ placementId }) => placementId);
    const missingPlacements =
      expectedTrackIds.filter((id) => !placementIds.includes(id));
    const missingTracks =
      expectedTrackIds.filter((id) => !trackIds.includes(id));
    if (missingPlacements.length > 0 || missingTracks.length > 0) {
      throw new Error(
        `Windmill scene/replay is missing placements [${missingPlacements.join(', ')}] `
        + `and tracks [${missingTracks.join(', ')}].`,
      );
    }

    const root = document.createElement('div');
    root.dataset.windmillFocused = '';
    root.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog: mountedCatalog,
      publishHarness: false,
    });
    const focusedWindow = window as FocusedWindow;
    focusedWindow.windmillFocused = studio;
    try {
      studio.harness.openScene(sceneId);
      studio.harness.setLit(true);
      studio.harness.setDepth(true);
      studio.harness.setEdges(false);
      studio.harness.setSceneAnimation(false);
      const initial = studio.harness.drawAt(0);
      const defaultCamera = {
        center: studio.harness.viewCenter(),
        view: studio.harness.viewState(),
      };
      studio.harness.setSceneAnimation(true);
      return {
        scene: structuredClone(scene),
        placementIds,
        trackIds,
        defaultCamera,
        initial,
        player: studio.harness.playerState(),
        privateCanvases: root.querySelectorAll('canvas').length,
      };
    } catch (error) {
      studio.dispose();
      delete focusedWindow.windmillFocused;
      root.remove();
      throw error;
    }
  }, {
    sceneId: WINDMILL_SCENE_ID,
    replayId: WINDMILL_REPLAY_ID,
    expectedTrackIds: WINDMILL_TRACK_IDS,
    extraOrbitingLightPeriodMs:
      options.extraOrbitingLightPeriodMs ?? null,
  });
}

export async function mountWindmillModelStudio(
  page: Page,
  studioOrigin: string,
  modelId: string,
) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  if (!response?.ok()) {
    throw new Error(
      `Cannot mount focused Windmill model '${modelId}': navigation returned ${
        response === null ? 'no response' : String(response.status())
      }.`,
    );
  }
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  return page.evaluate(async ({ requestedModelId }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } =
      await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } =
      await import(catalogUrl) as unknown as BrowserCatalogModule;
    const catalog = createStudioCatalog();
    const entry = catalog.sections
      .flatMap(({ models }) => models)
      .find(({ id }) => id === requestedModelId);
    if (entry === undefined) {
      throw new Error(
        `Focused Windmill model '${requestedModelId}' is absent from the shelf.`,
      );
    }
    const made = entry.howItsMade();
    const physical = made.physical?.[made.recipe.id];
    if (physical === undefined) {
      throw new Error(
        `Focused Windmill model '${requestedModelId}' has no physical sidecar.`,
      );
    }
    const root = document.createElement('div');
    root.dataset.windmillFocused = '';
    root.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog,
      openModelId: requestedModelId,
      publishHarness: false,
    });
    const focusedWindow = window as FocusedWindow;
    focusedWindow.windmillFocused = studio;
    try {
      studio.harness.setLit(true);
      studio.harness.setDepth(true);
      studio.harness.setEdges(false);
      studio.harness.drawAt(0);
      const model = studio.harness.model();
      return {
        id: model.id,
        label: model.label,
        size: model.size,
        occupiedVoxels: model.voxels.filter((slot) => slot !== 0).length,
        recipeId: made.recipe.id,
        colliderCount: physical.colliders.length,
        bodyTypes: physical.bodies.map(({ type }) => type),
        defaultCamera: {
          center: studio.harness.viewCenter(),
          view: studio.harness.viewState(),
        },
        privateCanvases: root.querySelectorAll('canvas').length,
      };
    } catch (error) {
      studio.dispose();
      delete focusedWindow.windmillFocused;
      root.remove();
      throw error;
    }
  }, { requestedModelId: modelId });
}

export async function disposeWindmillStudio(page: Page) {
  return page.evaluate(() => {
    const focusedWindow = window as FocusedWindow;
    const root =
      document.querySelector<HTMLElement>('[data-windmill-focused]');
    const hadHandle = focusedWindow.windmillFocused !== undefined;
    const privateCanvasesBefore =
      root?.querySelectorAll('canvas').length ?? 0;
    focusedWindow.windmillFocused?.dispose();
    delete focusedWindow.windmillFocused;
    const rootChildrenAfterDispose = root?.childElementCount ?? 0;
    root?.remove();
    return {
      hadHandle,
      privateCanvasesBefore,
      rootChildrenAfterDispose,
      remainingRoots:
        document.querySelectorAll('[data-windmill-focused]').length,
    };
  });
}

export async function windmillPlayerState(page: Page) {
  return page.evaluate(() => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot read Windmill player state: the focused Studio mount is absent.',
      );
    }
    return harness.playerState();
  });
}

export async function setWindmillViewCenter(
  page: Page,
  center: readonly [number, number, number],
) {
  return page.evaluate((candidate) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot move the Windmill view center because its focused Studio is not mounted.',
      );
    }
    return harness.setViewCenter(candidate);
  }, center);
}

export async function probeWindmillMixedMotionWindow(
  page: Page,
  replayDurationMs: number,
) {
  return page.evaluate((durationMs) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot probe mixed Windmill motion: the focused Studio mount is absent.',
      );
    }
    const scene = harness.sceneState();
    if (scene?.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        'Cannot probe mixed Windmill motion: the focused scene is not V4.',
      );
    }
    const requestedTimeMs = durationMs + 1_000;
    const draw = harness.drawAt(requestedTimeMs);
    return {
      requestedTimeMs,
      player: harness.playerState(),
      replayTimeMs:
        draw.scenePoseReplay?.sample?.playbackTimeMs ?? null,
    };
  }, replayDurationMs);
}

export async function deleteWindmillAndProbeModelLoop(page: Page) {
  return page.evaluate((sceneId) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot probe Windmill deletion: the focused Studio mount is absent.',
      );
    }
    const removed = harness.deleteScene(sceneId);
    if (removed.id !== sceneId) {
      throw new Error(
        `Cannot probe Windmill deletion: removing '${sceneId}' returned `
        + `'${removed.id}'.`,
      );
    }
    const periodMs = harness.model().motion.periodMs;
    return {
      periodMs,
      sceneMode: harness.sceneMode(),
      terminalSeek: harness.seek(periodMs),
    };
  }, WINDMILL_SCENE_ID);
}

export async function seekAndPlayWindmill(page: Page, timeMs: number) {
  return page.evaluate((nextTimeMs) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot seek and play Windmill: the focused Studio mount is absent.',
      );
    }
    harness.seek(nextTimeMs);
    return harness.play();
  }, timeMs);
}

export async function drawWindmillAt(
  page: Page,
  timeMs: number,
  camera?: WindmillCameraV1,
) {
  return page.evaluate(({ sampleTimeMs, nextCamera }) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot draw Windmill evidence: the focused Studio mount is absent.',
      );
    }
    if (nextCamera !== undefined) {
      harness.setViewCenter(nextCamera.center);
      harness.setViewAngles(nextCamera.view);
    }
    return harness.drawAt(sampleTimeMs);
  }, { sampleTimeMs: timeMs, nextCamera: camera });
}

export function oppositeWindmillCamera(
  camera: WindmillCameraV1,
): WindmillCameraV1 {
  return {
    center: camera.center,
    view: {
      ...camera.view,
      yawDegrees: (camera.view.yawDegrees + 180) % 360,
    },
  };
}
