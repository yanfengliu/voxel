import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { StudioHandleV1, StudioMountOptionsV1 } from '../../tools/studio/studio-app.js';

/**
 * Editing a scene through the real UI: the behaviours the owner drives by hand —
 * selecting one model then another and having the Edit controls follow, moving
 * the selected model, undo/redo, snap-to-grid, and the tabs a scene hides. Unit
 * tests pin the picking and placement maths; this pins the wiring around them,
 * because a feature that only typechecks is not one that works.
 *
 * It mounts its own studio on the shared example catalog (which carries scenes)
 * rather than the page's, so nothing here depends on the default mount, and
 * drives it through the same `window.voxelStudio` surface an agent would.
 */

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}
interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
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

test('scene editing: selection follows the pick, moves/undo/redo, snap, and hidden tabs', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  const evidence = await page.evaluate(async () => {
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;

    const root = document.createElement('div');
    document.body.append(root);
    const studio = mountStudio({ root, catalog: createStudioCatalog(), publishHarness: false });
    const harness = studio.harness;
    try {
      const selectedRows = (): HTMLElement[] =>
        Array.from(root.querySelectorAll<HTMLElement>('.scene-editor .placement.selected'));
      const rows = (): HTMLElement[] =>
        Array.from(root.querySelectorAll<HTMLElement>('.scene-editor .placement'));
      const tabHidden = (tab: string): boolean | null =>
        root.querySelector<HTMLElement>(`[data-studio-tab="${tab}"]`)?.hidden ?? null;
      const snapButton = (): HTMLButtonElement | null =>
        Array.from(root.querySelectorAll<HTMLButtonElement>('.toggles .toggle'))
          .find((button) => button.textContent.includes('snap to grid')) ?? null;
      const atX = (id: string): number =>
        harness.sceneState()?.placements.find((placement) => placement.id === id)?.at[0] ?? NaN;
      // A row carries its placement's coordinates in its text, so a scene with
      // models at distinct spots is addressable without hard-coding a label.
      const rowText = (row: HTMLElement | undefined): string => row?.textContent ?? '';

      // Model mode first: the snap toggle belongs to scenes, so it is hidden.
      const snapHiddenInModelMode = snapButton()?.hidden ?? null;

      harness.openScene('studio:scene:dining');
      const sceneMode = harness.sceneMode();
      const placementCount = harness.sceneState()?.placements.length ?? 0;

      // A scene hides the model-only tabs and reveals the snap toggle.
      const tabs = {
        examine: tabHidden('examine'),
        edit: tabHidden('edit'),
        build: tabHidden('build'),
        motion: tabHidden('motion'),
        notes: tabHidden('notes'),
      };
      const snapShownInSceneMode = snapButton()?.hidden === false;
      const stageHint = root.querySelector('.stagehint')?.textContent ?? '';

      // Select the table: exactly its row opens its controls.
      harness.selectPlacement('table');
      const afterTable = {
        selected: harness.selectedPlacement(),
        selectedCount: selectedRows().length,
        selectedText: rowText(selectedRows()[0]),
        hasControls: selectedRows()[0]?.querySelector('.placement-controls') !== null,
      };

      // Select a second model: the controls must move to it and leave the table.
      // This is the reported bug — the Edit tab staying tied to the first pick.
      harness.selectPlacement('chair-e');
      const afterChair = {
        selected: harness.selectedPlacement(),
        selectedCount: selectedRows().length,
        selectedText: rowText(selectedRows()[0]),
        tableStillSelected: selectedRows().some((row) => rowText(row).includes('(0, 0, 0)')),
        hasControls: selectedRows()[0]?.querySelector('.placement-controls') !== null,
      };

      // The move control in the selected row must move the selected model
      // (chair-e at x=10), not the previously selected one (table at x=0).
      const moveRight = selectedRows()[0]
        ?.querySelector<HTMLButtonElement>('.placement-controls button[title="Move right"]');
      moveRight?.click();
      const afterMove = { chairX: atX('chair-e'), tableX: atX('table') };

      // Clicking a row's name selects it too — the editor routes through the
      // same one selection the stage uses.
      const tableRow = rows().find((row) => rowText(row).includes('(0, 0, 0)'));
      tableRow?.querySelector<HTMLButtonElement>('.placement-name')?.click();
      const afterRowClick = {
        selected: harness.selectedPlacement(),
        domSelectedIsTable: rowText(selectedRows()[0]).includes('(0, 0, 0)'),
      };

      // Undo/redo by keyboard: Ctrl+Z steps the move back, Ctrl+Shift+Z forward.
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      const chairXAfterUndo = atX('chair-e');
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      const chairXAfterRedo = atX('chair-e');

      // editScene adds a placement through the same commit the editor uses;
      // undo drops it. One drag/edit is one step.
      const base = harness.sceneState();
      if (base === null) throw new Error('no scene open to edit');
      harness.editScene({
        ...base,
        placements: [...base.placements, { id: 'extra-chair', model: 'studio:chair', at: [20, 0, 20] }],
      });
      const countAfterAdd = harness.sceneState()?.placements.length ?? 0;
      harness.undoScene();
      const countAfterAddUndo = harness.sceneState()?.placements.length ?? 0;

      // The snap toggle flips the flag the drag reads.
      const snapBefore = harness.snapToGrid();
      snapButton()?.click();
      const snapAfter = harness.snapToGrid();

      return {
        snapHiddenInModelMode,
        sceneMode,
        placementCount,
        tabs,
        snapShownInSceneMode,
        stageHint,
        afterTable,
        afterChair,
        afterMove,
        afterRowClick,
        chairXAfterUndo,
        chairXAfterRedo,
        countAfterAdd,
        countAfterAddUndo,
        snapBefore,
        snapAfter,
      };
    } finally {
      studio.dispose();
      root.remove();
    }
  });

  // The snap toggle is a scene tool, absent in model mode and present in a scene.
  expect(evidence.snapHiddenInModelMode).toBe(true);
  expect(evidence.sceneMode).toBe(true);
  expect(evidence.placementCount).toBe(5);
  expect(evidence.snapShownInSceneMode).toBe(true);
  // The stage hint speaks to arranging a scene, not pinning a note to a model.
  expect(evidence.stageHint).toContain('drag it to move');
  expect(evidence.stageHint).not.toContain('pin a note');

  // Examine and Edit stay; Build, Motion, and Notes are hidden while a scene shows.
  expect(evidence.tabs).toEqual({
    examine: false,
    edit: false,
    build: true,
    motion: true,
    notes: true,
  });

  // Selecting the table opens exactly its controls.
  expect(evidence.afterTable.selected).toBe('table');
  expect(evidence.afterTable.selectedCount).toBe(1);
  expect(evidence.afterTable.selectedText).toContain('(0, 0, 0)');
  expect(evidence.afterTable.hasControls).toBe(true);

  // Selecting a second model moves the controls to it — the reported bug.
  expect(evidence.afterChair.selected).toBe('chair-e');
  expect(evidence.afterChair.selectedCount).toBe(1);
  expect(evidence.afterChair.selectedText).toContain('(10, 0, 0)');
  expect(evidence.afterChair.tableStillSelected).toBe(false);
  expect(evidence.afterChair.hasControls).toBe(true);

  // The move acted on the selected model, not the first-selected one.
  expect(evidence.afterMove.chairX).toBe(11);
  expect(evidence.afterMove.tableX).toBe(0);

  // A row click selects through the same single selection.
  expect(evidence.afterRowClick.selected).toBe('table');
  expect(evidence.afterRowClick.domSelectedIsTable).toBe(true);

  // Undo returns the moved model; redo advances it again.
  expect(evidence.chairXAfterUndo).toBe(10);
  expect(evidence.chairXAfterRedo).toBe(11);

  // editScene adds through the shared commit, and undo drops it.
  expect(evidence.countAfterAdd).toBe(6);
  expect(evidence.countAfterAddUndo).toBe(5);

  // The snap toggle flips the flag.
  expect(evidence.snapBefore).toBe(false);
  expect(evidence.snapAfter).toBe(true);
});

test('dragging a model on the scene canvas moves only it, as one undo step', async ({ page }) => {
  await page.goto(studioOrigin, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');

  // The page's own studio carries the example scenes; drive its real canvas so
  // the pointer path — capture, drag threshold, grab offset, history, refresh —
  // runs with genuine pointer events, which synthetic dispatch cannot (capture
  // needs a live pointer).
  await page.evaluate(() => { window.voxelStudio!.openScene('studio:scene:dining'); });
  expect(await page.evaluate(() => window.voxelStudio!.sceneMode())).toBe(true);

  const box = await page.locator('.canvas-wrap').boundingBox();
  if (!box) throw new Error('the scene stage has no on-screen box to drag over');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Press near the middle, where the centred scene puts a model, and read back
  // what the ray picked. A few nearby points make the press robust to framing
  // without hard-coding which model sits dead centre.
  let picked: string | null = null;
  let startX = cx;
  let startY = cy;
  for (const [ox, oy] of [[0, 0], [0, -40], [40, 0], [-40, 0], [0, 40]] as const) {
    await page.mouse.move(cx + ox, cy + oy);
    await page.mouse.down();
    picked = await page.evaluate(() => window.voxelStudio!.selectedPlacement());
    if (picked !== null) { startX = cx + ox; startY = cy + oy; break; }
    await page.mouse.up();
  }
  expect(picked).not.toBeNull();

  const before = await page.evaluate(() => window.voxelStudio!.sceneState());
  // Well past the drag threshold, so the gesture commits a move.
  await page.mouse.move(startX + 90, startY + 45, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.voxelStudio!.sceneState());

  const at = (scene: typeof before, id: string): readonly number[] =>
    scene?.placements.find((placement) => placement.id === id)?.at ?? [];
  // The picked model moved; every other model held still.
  expect(at(after, picked!)).not.toEqual(at(before, picked!));
  for (const placement of before?.placements ?? []) {
    if (placement.id === picked) continue;
    expect(at(after, placement.id)).toEqual(placement.at);
  }

  // The whole drag is one undo step, restoring the scene exactly.
  await page.evaluate(() => { window.voxelStudio!.undoScene(); });
  const undone = await page.evaluate(() => window.voxelStudio!.sceneState());
  expect(undone).toEqual(before);
});
