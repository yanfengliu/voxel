import { expect, type Page } from '@playwright/test';

import type { OakBrowserEvidenceV1 } from '../../fixtures/oak-ecosystem-consumer/oak-browser-contract.js';
import {
  advanceOakBiologicalTicks,
  clickOakCommand,
  disposeOakCaseStudy,
  dragOakCanvas,
  oakEvidence,
  openOakCaseStudy,
  setOakCamera,
  settleOakFrames,
} from './oak-ecosystem-browser-support.js';

type GroundAxisV1 = 'x' | 'z';

function expectPresentedCameraMatchesNavigation(evidence: OakBrowserEvidenceV1): void {
  const { centerM, orbit, presentedCamera } = evidence.navigation;
  const offset = {
    x: presentedCamera.positionM.x - centerM.x,
    y: presentedCamera.positionM.y - centerM.y,
    z: presentedCamera.positionM.z - centerM.z,
  };
  const distanceM = Math.hypot(offset.x, offset.y, offset.z);
  const actualYawDegrees = (
    Math.atan2(offset.x, offset.z) * 180 / Math.PI % 360 + 360
  ) % 360;
  const actualPitchDegrees = Math.asin(
    Math.min(1, Math.max(-1, offset.y / distanceM)),
  ) * 180 / Math.PI;
  const actualViewHeightM = 2 * distanceM * Math.tan(
    presentedCamera.fovDegrees * Math.PI / 360,
  );
  expect(actualYawDegrees).toBeCloseTo(orbit.yawDegrees, 8);
  expect(actualPitchDegrees).toBeCloseTo(orbit.pitchDegrees, 8);
  expect(actualViewHeightM).toBeCloseTo(orbit.viewHeightM, 8);
}

async function beginCapturedOakDrag(page: Page): Promise<number> {
  const canvas = page.locator('[data-oak-canvas]');
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error('Cannot capture the oak pointer: canvas has no bounds.');
  const pointerIdPromise = page.evaluate(() => new Promise<number>((resolvePointer) => {
    const surface = document.querySelector<HTMLCanvasElement>('[data-oak-canvas]');
    if (surface === null) throw new Error('Cannot observe oak pointer capture: canvas is absent.');
    surface.addEventListener('pointerdown', (event) => {
      resolvePointer(event.pointerId);
    }, { capture: true, once: true });
  }));
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.5);
  await page.mouse.down({ button: 'middle' });
  const pointerId = await pointerIdPromise;
  await expect.poll(() => page.evaluate((id) => {
    const surface = document.querySelector<HTMLCanvasElement>('[data-oak-canvas]');
    return surface?.hasPointerCapture(id) ?? false;
  }, pointerId)).toBe(true);
  return pointerId;
}

async function oakHasPointerCapture(page: Page, pointerId: number): Promise<boolean> {
  return page.evaluate((id) => {
    const surface = document.querySelector<HTMLCanvasElement>('[data-oak-canvas]');
    return surface?.hasPointerCapture(id) ?? false;
  }, pointerId);
}

async function interruptOakPointerCapture(page: Page): Promise<void> {
  const pointerId = await beginCapturedOakDrag(page);
  await page.evaluate((id) => {
    const surface = document.querySelector<HTMLCanvasElement>('[data-oak-canvas]');
    if (!surface?.hasPointerCapture(id)) {
      throw new Error(`Cannot interrupt oak pointer ${String(id)}: capture is absent.`);
    }
    surface.releasePointerCapture(id);
  }, pointerId);
  await page.mouse.move(20, 20);
  await page.mouse.up({ button: 'middle' });
}

function expectPoseUnchangedAcrossResize(
  before: OakBrowserEvidenceV1,
  after: OakBrowserEvidenceV1,
): void {
  expect(after.navigation.mode).toBe('free');
  expect(after.navigation.orbit).toEqual(before.navigation.orbit);
  expect(after.navigation.centerM).toEqual(before.navigation.centerM);
  expect(after.navigation.presentedCamera.positionM)
    .toEqual(before.navigation.presentedCamera.positionM);
  expect(after.navigation.presentedCamera.quaternion)
    .toEqual(before.navigation.presentedCamera.quaternion);
  expect(after.navigation.presentedCamera.projectionMatrix)
    .not.toEqual(before.navigation.presentedCamera.projectionMatrix);
}

export async function expectOakStudioNavigationContractV1(
  page: Page,
  origin: string,
): Promise<void> {
  await openOakCaseStudy(page, origin);
  const paused = await clickOakCommand(page, 'toggle-pause');
  const canvas = page.locator('[data-oak-canvas]');
  const hint = page.locator('[data-camera-hint]');
  await expect(canvas).toHaveAttribute('tabindex', '0');
  await expect(canvas).toHaveAttribute('aria-keyshortcuts', 'W A S D');
  await expect(canvas).toHaveAttribute('aria-describedby', 'oak-camera-hint');
  await expect(hint).toHaveAttribute('id', 'oak-camera-hint');
  await expect(hint).toContainText('middle-drag to turn');

  await dragOakCanvas(page, 'left', 120, 40);
  await expect(canvas).toBeFocused();
  const afterLeft = await oakEvidence(page);
  expect(afterLeft.navigation).toEqual(paused.navigation);
  expect(afterLeft.simulation).toEqual(paused.simulation);

  await dragOakCanvas(page, 'middle', 120, -40);
  const turned = await oakEvidence(page);
  expect(turned.navigation.mode).toBe('free');
  expect(turned.navigation.orbit.yawDegrees).not.toBe(paused.navigation.orbit.yawDegrees);
  expect(turned.navigation.orbit.pitchDegrees).not.toBe(paused.navigation.orbit.pitchDegrees);
  expect(turned.navigation.orbit.viewHeightM).toBe(paused.navigation.orbit.viewHeightM);
  expect(turned.navigation.centerM).toEqual(paused.navigation.centerM);
  expectPresentedCameraMatchesNavigation(turned);
  await expect(page.locator('[data-view][aria-pressed="true"]')).toHaveCount(0);

  await dragOakCanvas(page, 'right', 80, 30);
  const panned = await oakEvidence(page);
  expect(panned.navigation.centerM).not.toEqual(turned.navigation.centerM);
  expect(panned.navigation.orbit).toEqual(turned.navigation.orbit);
  await page.mouse.wheel(0, 100);
  const zoomed = await oakEvidence(page);
  expect(zoomed.navigation.orbit.viewHeightM).toBeGreaterThan(
    panned.navigation.orbit.viewHeightM,
  );
  expect(zoomed.navigation.centerM).toEqual(panned.navigation.centerM);
  expectPresentedCameraMatchesNavigation(zoomed);

  const directions: readonly {
    readonly key: 'w' | 'a' | 's' | 'd';
    readonly axis: GroundAxisV1;
    readonly sign: -1 | 1;
  }[] = [
    { key: 'w', axis: 'z', sign: -1 },
    { key: 's', axis: 'z', sign: 1 },
    { key: 'a', axis: 'x', sign: -1 },
    { key: 'd', axis: 'x', sign: 1 },
  ];
  for (const { key, axis, sign } of directions) {
    await setOakCamera(page, 'overhead');
    await canvas.focus();
    const before = (await oakEvidence(page)).navigation.centerM;
    await page.keyboard.down(key);
    try {
      await expect.poll(async () => {
        const current = (await oakEvidence(page)).navigation.centerM;
        return sign * (current[axis] - before[axis]);
      }).toBeGreaterThan(0.0001);
      const firstMoved = (await oakEvidence(page)).navigation.centerM;
      await settleOakFrames(page);
      const later = (await oakEvidence(page)).navigation.centerM;
      expect(sign * (later[axis] - before[axis]))
        .toBeGreaterThan(sign * (firstMoved[axis] - before[axis]) + 0.0001);
    } finally {
      await page.keyboard.up(key);
    }
    await settleOakFrames(page);
    const stopped = (await oakEvidence(page)).navigation.centerM;
    await settleOakFrames(page);
    expect((await oakEvidence(page)).navigation.centerM).toEqual(stopped);
  }

  const beforeButtonKeys = (await oakEvidence(page)).navigation;
  await page.locator('[data-command="rain"]').focus();
  await page.keyboard.press('w');
  await settleOakFrames(page);
  expect((await oakEvidence(page)).navigation).toEqual(beforeButtonKeys);
  expect((await oakEvidence(page)).simulation).toEqual(paused.simulation);

  await setOakCamera(page, 'overhead');
  await dragOakCanvas(page, 'middle', 90, 25);
  const beforeBiologicalUpdate = await oakEvidence(page);
  const free = await advanceOakBiologicalTicks(page, 1);
  expect(free.navigation).toEqual(beforeBiologicalUpdate.navigation);
  const beforeResize = free;
  await page.setViewportSize({ width: 820, height: 610 });
  await expect.poll(async () => (await oakEvidence(page)).viewport.width).toBe(820);
  const afterResize = await oakEvidence(page);
  expectPoseUnchangedAcrossResize(beforeResize, afterResize);

  const resizedOverhead = await setOakCamera(page, 'overhead');
  expectPresentedCameraMatchesNavigation(resizedOverhead);
  await interruptOakPointerCapture(page);
  const beforeRecoveredDrag = await oakEvidence(page);
  await dragOakCanvas(page, 'middle', 90, 25);
  const afterRecoveredDrag = await oakEvidence(page);
  expect(afterRecoveredDrag.navigation.orbit.yawDegrees)
    .not.toBe(beforeRecoveredDrag.navigation.orbit.yawDegrees);
  await canvas.dblclick({ position: { x: 700, y: 300 } });
  const restored = await oakEvidence(page);
  expect(restored.navigation).toEqual(resizedOverhead.navigation);
  expect(restored.cameraFit).toEqual(resizedOverhead.cameraFit);
  await expect(page.locator('[data-view="overhead"]')).toHaveAttribute('aria-pressed', 'true');

  const pointerId = await beginCapturedOakDrag(page);
  await page.keyboard.down('w');
  const disposed = await disposeOakCaseStudy(page);
  expect(disposed.after.disposed).toBe(true);
  expect(await oakHasPointerCapture(page, pointerId)).toBe(false);
  const frozenNavigation = disposed.after.navigation;
  await page.mouse.move(760, 340, { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('w');
  await page.keyboard.press('d');
  await settleOakFrames(page);
  expect((await oakEvidence(page)).navigation).toEqual(frozenNavigation);
}
