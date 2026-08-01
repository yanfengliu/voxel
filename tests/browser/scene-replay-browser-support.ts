import type { Page } from '@playwright/test';

import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { ScenePoseReplayV2 } from '../../tools/studio/scene-pose-replay.js';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';
import {
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from '../../tools/studio/windmill-layout.js';

/**
 * The Studio's finite-replay transport, driven by a scene the test owns.
 *
 * Studio still accepts a V4 scene whose poses come from an immutable consumer
 * trace: a downstream game may hand one over, `requests.ts` accepts one in a
 * review snapshot, and the transport that plays it — one-shot playback, a held
 * final frame, Space, seek — is real behaviour that has to keep working.
 *
 * What no longer exists is a *shipped* scene on that lane. Every scene in this
 * catalog solves live, so this evidence supplies its own recording rather than
 * borrowing one from the shelf: it reads the committed windmill trace, which
 * survives as a determinism fixture, and hands Studio a private V4 scene built
 * around it. That keeps the consumer lane covered without a single catalog
 * scene playing back a recording.
 */

const REPLAY_ROOT_ATTRIBUTE = 'data-scene-replay-focused';
/**
 * The private scene's own id, deliberately not the windmill's.
 *
 * Sharing the mill's id also shares its live physics profile: the studio would
 * build a solver world, start a frame loop, and suspend the replay pose lane —
 * so the transport under test would be the wrong one. Borrowing the mill's
 * placements is fine; borrowing its identity is not.
 */
const PLAYBACK_SCENE_ID = 'studio:scene:replay-transport-proof';

interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

interface BrowserGeneratedReplayModule {
  readonly WINDMILL_POSE_REPLAY: ScenePoseReplayV2;
}

interface FocusedWindow extends Window {
  sceneReplayFocused?: StudioHandleV1;
}

export interface ScenePlaybackProbeV1 {
  readonly replayId: string;
  readonly sceneId: string;
  readonly durationMs: number;
  readonly frameCount: number;
  readonly trackIds: readonly string[];
  readonly contactEventTimesMs: readonly number[];
  readonly player: { readonly playing: boolean; readonly periodMs: number; readonly timeMs: number };
  readonly privateCanvases: number;
}

/**
 * Mounts a private Studio on a V4 scene the test supplies.
 *
 * The scene reuses the live windmill's placements so the replay's tracks line
 * up with real geometry, and takes its poses from the committed trace.
 */
export async function mountScenePlaybackStudio(
  page: Page,
  studioOrigin: string,
  options: { readonly extraOrbitingLightPeriodMs?: number } = {},
): Promise<ScenePlaybackProbeV1> {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  if (!response?.ok()) {
    throw new Error(
      `Cannot mount the scene-replay Studio: navigation returned ${
        response === null ? 'no response' : String(response.status())
      }.`,
    );
  }
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  return page.evaluate(async ({
    sceneId,
    playbackSceneId,
    replayId,
    extraOrbitingLightPeriodMs,
  }) => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const replayUrl =
      new URL('generated-windmill-replay.ts', window.location.href).href;
    const { mountStudio } =
      await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } =
      await import(catalogUrl) as unknown as BrowserCatalogModule;
    const { WINDMILL_POSE_REPLAY: replay } =
      await import(replayUrl) as unknown as BrowserGeneratedReplayModule;
    const catalog = createStudioCatalog();
    const source = (catalog.scenes ?? []).find(({ id }) => id === sceneId);
    if (source === undefined) {
      throw new Error(
        `Scene-replay evidence needs the placements of scene '${sceneId}'.`,
      );
    }
    const durationMs = replay.frameCount * replay.provenance.fixedTimestepMs;
    const light = extraOrbitingLightPeriodMs === null ? [] : [{
      id: 'light:scene-replay-mixed-window-proof',
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
    }];
    const scene = {
      schemaVersion: 'studio.scene/4' as const,
      id: playbackSceneId,
      label: 'Recorded trace playback',
      summary: 'A private test scene whose poses come from the committed '
        + 'windmill trace. Nothing on the shelf plays a recording; this exists '
        + 'so the consumer replay transport keeps its browser proof.',
      placements: source.placements,
      lights: light,
      poseReplay: { id: replayId, durationMs },
    };
    const mountedCatalog: StudioCatalogV1 = {
      ...catalog,
      scenes: [scene],
      // The trace names the scene it was recorded from; this private copy
      // names the private scene it poses, and nothing else about it moves.
      scenePoseReplays: { [replayId]: { ...replay, sceneId: playbackSceneId } },
    };
    const root = document.createElement('div');
    root.setAttribute('data-scene-replay-focused', '');
    root.style.cssText =
      'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog: mountedCatalog,
      publishHarness: false,
    });
    const focusedWindow = window as FocusedWindow;
    focusedWindow.sceneReplayFocused = studio;
    try {
      studio.harness.openScene(playbackSceneId);
      studio.harness.setLit(true);
      studio.harness.setDepth(true);
      studio.harness.setEdges(false);
      // The animation choice persists across mounts, so it is driven off and
      // back on rather than assumed: enabling it is what arms the transport,
      // and enabling something already enabled does nothing at all.
      studio.harness.setSceneAnimation(false);
      studio.harness.drawAt(0);
      studio.harness.setSceneAnimation(true);
      return {
        replayId,
        sceneId: playbackSceneId,
        durationMs,
        frameCount: replay.frameCount,
        trackIds: replay.tracks.map(({ placementId }) => placementId),
        contactEventTimesMs: replay.events
          .filter((event) => event.type === 'contact')
          .map((event) => event.timeMs),
        player: studio.harness.playerState(),
        privateCanvases: root.querySelectorAll('canvas').length,
      };
    } catch (error) {
      studio.dispose();
      delete focusedWindow.sceneReplayFocused;
      root.remove();
      throw error;
    }
  }, {
    sceneId: WINDMILL_SCENE_ID,
    playbackSceneId: PLAYBACK_SCENE_ID,
    replayId: WINDMILL_POSE_REPLAY_ID,
    extraOrbitingLightPeriodMs: options.extraOrbitingLightPeriodMs ?? null,
  });
}

export async function disposeScenePlaybackStudio(page: Page) {
  return page.evaluate((attribute) => {
    const focusedWindow = window as FocusedWindow;
    const root = document.querySelector<HTMLElement>(`[${attribute}]`);
    const hadHandle = focusedWindow.sceneReplayFocused !== undefined;
    focusedWindow.sceneReplayFocused?.dispose();
    delete focusedWindow.sceneReplayFocused;
    root?.remove();
    return {
      hadHandle,
      remainingRoots: document.querySelectorAll(`[${attribute}]`).length,
    };
  }, REPLAY_ROOT_ATTRIBUTE);
}

export async function scenePlaybackPlayerState(page: Page) {
  return page.evaluate(() => {
    const harness = (window as FocusedWindow).sceneReplayFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot read the scene-replay player: the private Studio mount is absent.',
      );
    }
    return harness.playerState();
  });
}

export async function drawScenePlaybackAt(page: Page, timeMs: number) {
  return page.evaluate((sampleTimeMs) => {
    const harness = (window as FocusedWindow).sceneReplayFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot draw scene-replay evidence: the private Studio mount is absent.',
      );
    }
    return harness.drawAt(sampleTimeMs);
  }, timeMs);
}

export async function seekAndPlayScenePlayback(page: Page, timeMs: number) {
  return page.evaluate((nextTimeMs) => {
    const harness = (window as FocusedWindow).sceneReplayFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot seek the scene-replay transport: the private Studio mount is absent.',
      );
    }
    harness.seek(nextTimeMs);
    return harness.play();
  }, timeMs);
}

export async function probeScenePlaybackMixedMotionWindow(
  page: Page,
  replayDurationMs: number,
) {
  return page.evaluate((durationMs) => {
    const harness = (window as FocusedWindow).sceneReplayFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot probe mixed motion: the private Studio mount is absent.',
      );
    }
    const scene = harness.sceneState();
    if (scene?.schemaVersion !== 'studio.scene/4') {
      throw new Error(
        'Cannot probe mixed replay motion: the private scene is not V4.',
      );
    }
    const requestedTimeMs = durationMs + 1_000;
    const draw = harness.drawAt(requestedTimeMs);
    return {
      requestedTimeMs,
      player: harness.playerState(),
      replayTimeMs: draw.scenePoseReplay?.sample?.playbackTimeMs ?? null,
    };
  }, replayDurationMs);
}

export async function deleteScenePlaybackAndProbeModelLoop(page: Page) {
  return page.evaluate((sceneId) => {
    const harness = (window as FocusedWindow).sceneReplayFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        'Cannot probe replay-scene deletion: the private Studio mount is absent.',
      );
    }
    const removed = harness.deleteScene(sceneId);
    if (removed.id !== sceneId) {
      throw new Error(
        `Cannot probe replay-scene deletion: removing '${sceneId}' returned `
        + `'${removed.id}'.`,
      );
    }
    const periodMs = harness.model().motion.periodMs;
    return {
      periodMs,
      sceneMode: harness.sceneMode(),
      terminalSeek: harness.seek(periodMs),
    };
  }, PLAYBACK_SCENE_ID);
}
