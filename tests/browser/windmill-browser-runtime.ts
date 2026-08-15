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
import {
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1,
  WINDMILL_PRODUCTION_TRACK_IDS_V1,
} from '../../tools/studio/windmill-production-layout.js';

export const WINDMILL_REPLAY_ID = WINDMILL_POSE_REPLAY_ID;
/**
 * What moves on screen, in the order the scene poses it: the four solved
 * bodies, then the props the production driver stages over them.
 *
 * These used to be a recording's track ids. The mill is solved in the browser
 * now, so the same list is the union of what the live profile builds and what
 * the presentation driver poses — which is the honest thing to assert about a
 * live scene, and still the exact set a viewer sees move.
 */
export const WINDMILL_MOVING_PLACEMENT_IDS = Object.freeze([
  ...Object.values(WINDMILL_PLACEMENT_IDS_V1),
  ...WINDMILL_PRODUCTION_TRACK_IDS_V1,
]);
/** Scene placement order: recorded bodies, building, bin, sacks, flour. */
export const WINDMILL_PLACEMENT_IDS = Object.freeze([
  ...Object.values(WINDMILL_PLACEMENT_IDS_V1),
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.building,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourBin,
  ...WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.wheatSacks,
  WINDMILL_PRODUCTION_PLACEMENT_IDS_V1.flourHeap,
]);
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
    /**
     * Leaves the scene held still from the moment it is built, solver
     * included.
     *
     * A proof that compares this mount's pictures against a static review
     * variant needs both sides still, or it measures where the sails happened
     * to be as well as the relocation it means to see. Holding from the mount
     * rather than after it is what makes it reproducible: the live world
     * builds asynchronously, so a freeze applied a few frames later catches
     * the mill at whatever phase those frames reached.
     */
    readonly holdStill?: boolean;
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
  const mounted = await page.evaluate(async ({
    sceneId,
    expectedMovingIds,
    extraOrbitingLightPeriodMs,
    holdStill,
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
    if (catalogScene === undefined) {
      throw new Error(
        `Focused Windmill browser evidence needs scene '${sceneId}' in the live catalog.`,
      );
    }
    // The mill solves in the browser, so its scene carries no replay. Saying
    // so here rather than only in a spec means a scene that slid back onto
    // the recorded lane fails at the mount, naming itself.
    if (catalogScene.schemaVersion === 'studio.scene/4') {
      throw new Error(
        `Focused Windmill browser evidence needs the live scene '${sceneId}', but the `
        + `catalog scene plays back replay '${catalogScene.poseReplay.id}'.`,
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
          schemaVersion: 'studio.scene/3' as const,
          lights: [
            ...(catalogScene.schemaVersion === 'studio.scene/3'
              ? catalogScene.lights ?? []
              : []),
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
    const placementIds = scene.placements.map(({ id }) => id);
    const missingPlacements =
      expectedMovingIds.filter((id) => !placementIds.includes(id));
    if (missingPlacements.length > 0) {
      throw new Error(
        `Windmill scene is missing placements [${missingPlacements.join(', ')}].`,
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
      studio.harness.setSceneAnimation(!holdStill);
      return {
        scene: structuredClone(scene),
        placementIds,
        movingPlacementIds: expectedMovingIds,
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
    expectedMovingIds: WINDMILL_MOVING_PLACEMENT_IDS,
    extraOrbitingLightPeriodMs:
      options.extraOrbitingLightPeriodMs ?? null,
    holdStill: options.holdStill === true,
  });
  // The live world builds asynchronously; until it exists the stage is still
  // drawing authored poses and nothing a caller settles would mean anything.
  await page.waitForFunction(() =>
    (window as FocusedWindow).windmillFocused?.harness.livePhysics().running
      === true);
  // Pause it the instant it exists. The frame loop starts on its own, and a
  // few wall-clock ticks between here and the first settle are exactly the
  // difference between a reproducible tick count and a nearly-reproducible one.
  // `holdStill` closes the gap: the simulation switch is already off when the
  // world is built, so it opens paused at tick zero every time.
  const openingTick = await page.evaluate(() => {
    const harness = (window as FocusedWindow).windmillFocused!.harness;
    harness.settleLive(0);
    return harness.livePhysics().stepped;
  });
  return { ...mounted, openingTick };
}

/**
 * Advances the mill's own solver to an exact tick, then lets the stage present
 * that state.
 *
 * A live scene has no timeline to seek, so this is how a browser proof reaches
 * a reproducible moment: the solver is deterministic for a given step count,
 * which a wall-clock frame count is not.
 *
 * The target is absolute rather than a delta, and the arithmetic happens in
 * the page. The frame loop is still running when the first settle arrives, so
 * a delta computed out here would be stale by however many ticks ran during
 * the round trip — which is exactly how a hammer phase drifts off its cycle.
 */
export async function settleWindmillTo(
  page: Page,
  targetTick: number,
): Promise<void> {
  await page.evaluate(async (target) => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot settle the Windmill: the focused Studio mount is absent.',
      );
    }
    const stepped = harness.livePhysics().stepped;
    if (stepped > target) {
      throw new Error(
        `Cannot settle the Windmill back to tick ${String(target)}: its live `
        + `world has already stepped ${String(stepped)} times, and a solver `
        + 'runs forward only. Settle to a later tick or remount the scene.',
      );
    }
    harness.settleLive(target - stepped);
    await new Promise<void>((settle) => {
      requestAnimationFrame(() => requestAnimationFrame(() => { settle(); }));
    });
  }, targetTick);
}

/** The mill's live world, for assertions about what is solved rather than posed. */
export async function windmillLiveState(page: Page) {
  return page.evaluate(() => {
    const harness = (window as FocusedWindow).windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot read the Windmill live world: the focused Studio mount is absent.',
      );
    }
    const live = harness.livePhysics();
    return {
      available: live.available,
      running: live.running,
      bodies: live.bodies,
      joints: live.joints,
      stepped: live.stepped,
      positions: live.positions,
      hasReplay: harness.drawAt(0).scenePoseReplay !== null,
    };
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
