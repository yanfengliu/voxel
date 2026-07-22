import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { StudioHandleV1, StudioMountOptionsV1 } from '../../tools/studio/studio-app.js';

/**
 * mountStudio's app-level lifecycle: what a mount owns, what a failed mount
 * must give back, and what an omitted capability may not advertise. The
 * shared shell's own render/connect contract lives in
 * `model-studio-shell.spec.ts`; these tests drive the studio app around it.
 */

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

const STUDIO_ROOT = resolve('tools/studio');

let server: ViteDevServer | undefined;
let studioOrigin = '';

test.beforeAll(async () => {
  server = await createServer({
    root: STUDIO_ROOT,
    configFile: false,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { include: [] },
  });
  await server.listen();
  studioOrigin = server.resolvedUrls?.local[0] ?? '';
  if (!studioOrigin) throw new Error('the shared Studio test server reported no local address');
});

test.afterAll(async () => {
  const ownedServer = server;
  server = undefined;
  studioOrigin = '';
  await ownedServer?.close();
});

test('a failed V2 mount validates before the session exists and rolls back', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const evidence = await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const pageHarness = window.voxelStudio;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the saved original is applied with an explicit receiver and restored verbatim.
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let contextsCreated = 0;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<HTMLCanvasElement['getContext']>
    ) {
      if (args[0] === 'webgl' || args[0] === 'webgl2') contextsCreated += 1;
      return originalGetContext.apply(this, args);
    } as HTMLCanvasElement['getContext'];
    try {
      // An invalid descriptor must be refused before any GPU session exists,
      // before the global harness moves, and before any listener registers.
      const invalidRoot = document.createElement('div');
      document.body.append(invalidRoot);
      let invalidProfileError = '';
      try {
        mountStudio({
          root: invalidRoot,
          catalog: { sections: [] },
          shellProfileV2: { instanceId: 'not safe' },
        });
      } catch (error) {
        invalidProfileError = String(error);
      }
      const invalidProfile = {
        error: invalidProfileError,
        contexts: contextsCreated,
        residueChildren: invalidRoot.childElementCount,
        harnessKept: window.voxelStudio === pageHarness,
      };
      invalidRoot.remove();

      // A duplicate instanceId is only discoverable against the live
      // document, so its session is acquired and must be rolled back.
      const firstRoot = document.createElement('div');
      const secondRoot = document.createElement('div');
      document.body.append(firstRoot, secondRoot);
      const first = mountStudio({
        root: firstRoot,
        catalog: { sections: [] },
        publishHarness: false,
        shellProfileV2: { instanceId: 'rollback-studio', coreTabs: ['examine'] },
      });
      contextsCreated = 0;
      let duplicateError = '';
      try {
        mountStudio({
          root: secondRoot,
          catalog: { sections: [] },
          shellProfileV2: { instanceId: 'rollback-studio', coreTabs: ['examine'] },
        });
      } catch (error) {
        duplicateError = String(error);
      }
      const duplicate = {
        error: duplicateError,
        contexts: contextsCreated,
        residueChildren: secondRoot.childElementCount,
        harnessKept: window.voxelStudio === pageHarness,
        instances: document.querySelectorAll('[data-studio-shell-instance="rollback-studio"]').length,
        firstStillConnected: firstRoot.querySelector('[data-model-studio-shell]')
          ?.getAttribute('data-studio-shell-connected') === 'true',
      };
      // The failed root is clean enough to host a corrected mount.
      const retry = mountStudio({
        root: secondRoot,
        catalog: { sections: [] },
        publishHarness: false,
        shellProfileV2: { instanceId: 'rollback-studio-retry', coreTabs: ['examine'] },
      });
      const retryMounted = secondRoot.querySelector(
        '[data-studio-shell-instance="rollback-studio-retry"]',
      ) !== null;
      retry.dispose();
      first.dispose();
      firstRoot.remove();
      secondRoot.remove();
      return {
        invalidProfile,
        duplicate,
        retryMounted,
        pageHarnessKept: window.voxelStudio === pageHarness,
      };
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(evidence.invalidProfile.error).toContain('instanceId');
  expect(evidence.invalidProfile.contexts).toBe(0);
  expect(evidence.invalidProfile.residueChildren).toBe(0);
  expect(evidence.invalidProfile.harnessKept).toBe(true);
  expect(evidence.duplicate.error).toContain('not unique');
  expect(evidence.duplicate.contexts).toBe(1);
  expect(evidence.duplicate.residueChildren).toBe(0);
  expect(evidence.duplicate.harnessKept).toBe(true);
  expect(evidence.duplicate.instances).toBe(1);
  expect(evidence.duplicate.firstStillConnected).toBe(true);
  expect(evidence.retryMounted).toBe(true);
  expect(evidence.pageHarnessKept).toBe(true);
});

test('a catalog whose data throws by design rolls the whole mount back', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  // The engine module vite serves to the studio itself, so the spy patches
  // the very class whose disposal the rollback must run.
  const runtimePath = `/@fs/${resolve('src/three/index.ts').replaceAll('\\', '/')}`;
  const evidence = await page.evaluate(async (runtimeModulePath) => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const runtimeModule = await import(new URL(runtimeModulePath, window.location.href).href) as {
      ThreeRenderRuntime: { prototype: { dispose(this: unknown): void } };
    };
    const pageHarness = window.voxelStudio;
    const runtimePrototype = runtimeModule.ThreeRenderRuntime.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- the saved original is applied with an explicit receiver and restored verbatim.
    const originalDispose = runtimePrototype.dispose;
    let runtimeDisposals = 0;
    runtimePrototype.dispose = function (this: unknown) {
      runtimeDisposals += 1;
      originalDispose.call(this);
    };
    try {
      // Control: an ordinary mount-and-dispose must reach the spy, or none
      // of the leak evidence below could be trusted.
      const controlRoot = document.createElement('div');
      document.body.append(controlRoot);
      const control = mountStudio({
        root: controlRoot,
        catalog: { sections: [] },
        publishHarness: false,
      });
      control.dispose();
      controlRoot.remove();
      const spySawControl = runtimeDisposals === 1;

      const tinyModel = (id: string) => ({
        schemaVersion: 'studio.voxel-model/1' as const,
        id,
        label: 'Tiny',
        seed: 1,
        size: [2, 2, 2] as [number, number, number],
        palette: [{ r: 0, g: 0, b: 0 }, { r: 100, g: 120, b: 140 }],
        voxels: [1, 0, 0, 1, 0, 1, 1, 0],
        motion: {
          periodMs: 0,
          phaseRadians: 0,
          translation: [0, 0, 0] as [number, number, number],
          rotationRadians: [0, 0, 0] as [number, number, number],
          scale: [0, 0, 0] as [number, number, number],
        },
      });

      // A) howItsMade() throws while the construction panel is being made,
      // before the shell has rendered: the session must still be released,
      // and the host's own placeholder content must survive a mount that
      // never wrote the root.
      runtimeDisposals = 0;
      const recipeRoot = document.createElement('div');
      const hostPlaceholder = document.createElement('p');
      hostPlaceholder.textContent = 'loading the studio…';
      recipeRoot.append(hostPlaceholder);
      document.body.append(recipeRoot);
      let recipeError = '';
      try {
        mountStudio({
          root: recipeRoot,
          catalog: {
            sections: [{
              name: 'Broken',
              models: [{
                id: 'broken:recipe',
                label: 'Broken recipe',
                load: () => tinyModel('broken:recipe'),
                howItsMade: () => { throw new Error('this recipe is broken by design'); },
              }],
            }],
          },
        });
      } catch (error) {
        recipeError = String(error);
      }
      const brokenRecipe = {
        error: recipeError,
        runtimeDisposals,
        hostChildren: recipeRoot.childElementCount,
        placeholderKept: hostPlaceholder.isConnected,
        harnessKept: window.voxelStudio === pageHarness,
      };
      const recipeRetry = mountStudio({
        root: recipeRoot,
        catalog: { sections: [] },
        publishHarness: false,
      });
      const recipeRetryMounted = recipeRoot.querySelector('[data-model-studio-shell]') !== null;
      recipeRetry.dispose();
      recipeRoot.remove();

      // B) a physical sidecar that fails compilation throws after the shell
      // connected: the shell, panels, and session must all be taken back.
      runtimeDisposals = 0;
      const sidecarRoot = document.createElement('div');
      document.body.append(sidecarRoot);
      let sidecarError = '';
      try {
        mountStudio({
          root: sidecarRoot,
          catalog: {
            sections: [{
              name: 'Broken',
              models: [{
                id: 'broken:sidecar',
                label: 'Broken sidecar',
                load: () => tinyModel('broken:sidecar'),
                howItsMade: () => ({
                  recipe: {
                    schemaVersion: 'studio.voxel-recipe/1' as const,
                    id: 'broken:sidecar',
                    label: 'Broken sidecar',
                    seed: 1,
                    size: [2, 2, 2] as [number, number, number],
                    roles: ['empty', 'body'],
                    palette: [{ r: 0, g: 0, b: 0 }, { r: 100, g: 120, b: 140 }],
                    steps: [{
                      kind: 'voxels' as const,
                      at: [0, 0, 0] as [number, number, number],
                      size: [2, 1, 2] as [number, number, number],
                      voxels: [1, 1, 1, 1],
                    }],
                    motion: {
                      periodMs: 0,
                      phaseRadians: 0,
                      translation: [0, 0, 0] as [number, number, number],
                      rotationRadians: [0, 0, 0] as [number, number, number],
                      scale: [0, 0, 0] as [number, number, number],
                    },
                  },
                  parts: {},
                  physical: {
                    'broken:sidecar': {} as never,
                  },
                }),
              }],
            }],
          },
          shellProfileV2: { instanceId: 'sidecar-studio', coreTabs: ['examine', 'build'] },
        });
      } catch (error) {
        sidecarError = String(error);
      }
      const brokenSidecar = {
        error: sidecarError,
        runtimeDisposals,
        residueChildren: sidecarRoot.childElementCount,
        // The page's own studio is a V1 shell, which never carries the V2
        // connected marker, so a clean document counts zero here.
        connectedResidue: document.querySelectorAll('[data-studio-shell-connected]').length,
        harnessKept: window.voxelStudio === pageHarness,
      };
      // The strongest rollback proof: the same instanceId mounts again on
      // the same root, which a leftover connected shell would refuse.
      const sidecarRetry = mountStudio({
        root: sidecarRoot,
        catalog: { sections: [] },
        publishHarness: false,
        shellProfileV2: { instanceId: 'sidecar-studio', coreTabs: ['examine'] },
      });
      const sidecarRetryMounted = sidecarRoot.querySelector(
        '[data-studio-shell-instance="sidecar-studio"]',
      ) !== null;
      sidecarRetry.dispose();
      sidecarRoot.remove();

      // C) the engine rejects the opening model inside the session
      // constructor: the just-created runtime must be released right there.
      runtimeDisposals = 0;
      const rejectedRoot = document.createElement('div');
      document.body.append(rejectedRoot);
      let rejectedError = '';
      try {
        mountStudio({
          root: rejectedRoot,
          catalog: {
            sections: [{
              name: 'Broken',
              models: [{
                id: 'broken:model',
                label: 'Broken model',
                load: () => ({ ...tinyModel('broken:model'), voxels: [1] }),
                howItsMade: () => { throw new Error('never reached: the session refuses first'); },
              }],
            }],
          },
        });
      } catch (error) {
        rejectedError = String(error);
      }
      const rejectedModel = {
        error: rejectedError,
        runtimeDisposals,
        residueChildren: rejectedRoot.childElementCount,
        harnessKept: window.voxelStudio === pageHarness,
      };
      rejectedRoot.remove();

      return {
        spySawControl,
        brokenRecipe,
        recipeRetryMounted,
        brokenSidecar,
        sidecarRetryMounted,
        rejectedModel,
        pageHarnessKept: window.voxelStudio === pageHarness,
      };
    } finally {
      runtimePrototype.dispose = originalDispose;
    }
  }, runtimePath);

  expect(evidence.spySawControl).toBe(true);
  expect(evidence.brokenRecipe.error).toContain('broken by design');
  expect(evidence.brokenRecipe.runtimeDisposals).toBe(1);
  expect(evidence.brokenRecipe.hostChildren).toBe(1);
  expect(evidence.brokenRecipe.placeholderKept).toBe(true);
  expect(evidence.brokenRecipe.harnessKept).toBe(true);
  expect(evidence.recipeRetryMounted).toBe(true);
  expect(evidence.brokenSidecar.error).toContain('physical');
  expect(evidence.brokenSidecar.runtimeDisposals).toBe(1);
  expect(evidence.brokenSidecar.residueChildren).toBe(0);
  expect(evidence.brokenSidecar.connectedResidue).toBe(0);
  expect(evidence.brokenSidecar.harnessKept).toBe(true);
  expect(evidence.sidecarRetryMounted).toBe(true);
  expect(evidence.rejectedModel.error).toContain('Model cannot build');
  expect(evidence.rejectedModel.runtimeDisposals).toBe(1);
  expect(evidence.rejectedModel.residueChildren).toBe(0);
  expect(evidence.rejectedModel.harnessKept).toBe(true);
  expect(evidence.pageHarnessKept).toBe(true);
});

test('omitted capabilities are not advertised by the stage hint or note tooltips', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  // The engine page keeps every capability, so its hint still teaches the pin.
  await expect(page.locator('.stagehint')).toContainText('click to pin a note');

  const evidence = await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;

    const examineRoot = document.createElement('div');
    document.body.append(examineRoot);
    const examineOnly = mountStudio({
      root: examineRoot,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: { instanceId: 'hint-examine-studio', coreTabs: ['examine'] },
    });
    const examineHint = examineRoot.querySelector('.stagehint')?.textContent ?? '';
    examineOnly.dispose();
    examineRoot.remove();

    const notesRoot = document.createElement('div');
    document.body.append(notesRoot);
    const notesStudio = mountStudio({
      root: notesRoot,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: { instanceId: 'hint-notes-studio', coreTabs: ['examine', 'notes'] },
    });
    const notesHint = notesRoot.querySelector('.stagehint')?.textContent ?? '';
    notesStudio.harness.addPlaceNote({ x: 0, y: 0, z: 0 }, 'the corner looks pinched');
    const showMe = notesRoot.querySelector<HTMLButtonElement>('.note-where');
    const placeTooltip = { disabled: showMe?.disabled ?? false, title: showMe?.title ?? '' };
    notesStudio.dispose();
    notesRoot.remove();
    return { examineHint, notesHint, placeTooltip };
  });

  expect(evidence.examineHint).toContain('drag to turn');
  expect(evidence.examineHint).not.toContain('pin a note');
  expect(evidence.notesHint).toContain('click to pin a note');
  expect(evidence.placeTooltip.disabled).toBe(true);
  expect(evidence.placeTooltip.title)
    .toBe('Place notes need the Edit tools, and this Studio profile omits them.');
});

test('the grid adapter hides commands whose core capability was omitted', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const commandStates = await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const root = document.createElement('div');
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: {
        instanceId: 'fallback-studio',
        coreTabs: ['examine'],
      },
    });
    const states: Record<string, { disabled: boolean; hidden: boolean }> = {};
    for (const label of ['Open', 'Copy', 'New', 'Send request']) {
      const button = Array.from(root.querySelectorAll('button'))
        .find((candidate) => candidate.textContent.startsWith(label));
      if (!button) throw new Error(`Missing ${label} action.`);
      states[label] = { disabled: button.disabled, hidden: button.hidden };
    }
    studio.dispose();
    root.remove();

    const notesRoot = document.createElement('div');
    document.body.append(notesRoot);
    const notesStudio = mountStudio({
      root: notesRoot,
      catalog: { sections: [] },
      publishHarness: false,
      shellProfileV2: {
        instanceId: 'notes-without-edit-studio',
        coreTabs: ['examine', 'notes'],
      },
    });
    const placeButton = Array.from(notesRoot.querySelectorAll('button'))
      .find((candidate) => candidate.textContent.startsWith('Pin to a spot'));
    const requestButton = Array.from(notesRoot.querySelectorAll('button'))
      .find((candidate) => candidate.textContent.startsWith('Send request'));
    if (!placeButton || !requestButton) throw new Error('Missing Notes capability controls.');
    const notesWithoutEdit = {
      place: { disabled: placeButton.disabled, hidden: placeButton.hidden },
      request: { disabled: requestButton.disabled, hidden: requestButton.hidden },
    };
    notesStudio.dispose();
    notesRoot.remove();
    return { notesWithoutEdit, top: states };
  });

  expect(commandStates).toEqual({
    top: {
      Open: { disabled: true, hidden: true },
      Copy: { disabled: true, hidden: true },
      New: { disabled: true, hidden: true },
      'Send request': { disabled: true, hidden: true },
    },
    notesWithoutEdit: {
      place: { disabled: true, hidden: true },
      request: { disabled: false, hidden: false },
    },
  });
});

test('document shortcuts belong to one Studio and are removed on disposal', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const calls = await page.evaluate(async () => {
    const moduleUrl = new URL('studio-app.ts', window.location.href).href;
    const { mountStudio } = await import(moduleUrl) as unknown as BrowserStudioModule;
    const firstRoot = document.createElement('div');
    const secondRoot = document.createElement('div');
    document.body.append(firstRoot, secondRoot);
    const first = mountStudio({
      root: firstRoot,
      catalog: { sections: [] },
      publishHarness: false,
    });
    const second = mountStudio({
      root: secondRoot,
      catalog: { sections: [] },
      publishHarness: false,
    });
    let firstSteps = 0;
    let secondSteps = 0;
    const firstStep = first.harness.step.bind(first.harness);
    const secondStep = second.harness.step.bind(second.harness);
    first.harness.step = (direction, options) => {
      firstSteps += 1;
      return firstStep(direction, options);
    };
    second.harness.step = (direction, options) => {
      secondSteps += 1;
      return secondStep(direction, options);
    };
    const stageTags = [firstRoot, secondRoot].map((studioRoot) =>
      studioRoot.querySelector('[data-studio-region="stage"]')?.tagName);
    firstRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterFirst = { firstSteps, secondSteps };
    first.dispose();
    firstRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterDisposedFirst = { firstSteps, secondSteps };
    secondRoot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const afterSecond = { firstSteps, secondSteps };
    second.dispose();
    return { afterFirst, afterDisposedFirst, afterSecond, stageTags };
  });

  expect(calls).toEqual({
    afterFirst: { firstSteps: 1, secondSteps: 0 },
    afterDisposedFirst: { firstSteps: 1, secondSteps: 0 },
    afterSecond: { firstSteps: 1, secondSteps: 1 },
    stageTags: ['SECTION', 'SECTION'],
  });
});
