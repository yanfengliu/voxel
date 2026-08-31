import { expect, type Page } from '@playwright/test';

import {
  oakEvidence,
  OAK_BROWSER_FIXTURE_PATH,
} from './oak-ecosystem-browser-support.js';

interface OakAnimationFrameGateV1 {
  pump(): void;
  restore(): void;
}

type OakAnimationFrameGateWindowV1 = Window & typeof globalThis & {
  __oakAnimationFrameGate: OakAnimationFrameGateV1;
};

async function pumpOakAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as OakAnimationFrameGateWindowV1).__oakAnimationFrameGate.pump();
  });
}

export async function expectOakPresentationQueueContractV1(
  page: Page,
  origin: string,
): Promise<void> {
  await page.addInitScript(() => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => { pending.delete(id); };
    (window as OakAnimationFrameGateWindowV1).__oakAnimationFrameGate = {
      pump() {
        const callbacks = [...pending.values()];
        pending.clear();
        const timestamp = performance.now();
        for (const callback of callbacks) callback(timestamp);
      },
      restore() {
        window.requestAnimationFrame = nativeRequestAnimationFrame;
        window.cancelAnimationFrame = nativeCancelAnimationFrame;
        for (const callback of pending.values()) nativeRequestAnimationFrame(callback);
        pending.clear();
      },
    };
  });
  const response = await page.goto(new URL(OAK_BROWSER_FIXTURE_PATH, origin).href, {
    waitUntil: 'load',
  });
  expect(response?.ok()).toBe(true);
  await page.waitForFunction(
    () => window.oakEcosystem !== undefined,
    undefined,
    { polling: 10 },
  );

  try {
    const gated = await oakEvidence(page);
    expect(gated.ready).toBe(false);
    expect(gated.runtime.acceptedRevision).toBe(gated.render.renderRevision);
    expect(gated.runtime.presentedRevision).not.toBe(gated.render.renderRevision);
    const controls = page.locator('[data-command], [data-view]');
    await expect(controls).toHaveCount(12);
    expect(await controls.evaluateAll((nodes) => nodes.every(
      (node) => (node as HTMLButtonElement).disabled,
    ))).toBe(true);

    await expect.poll(async () => {
      await pumpOakAnimationFrame(page);
      return (await oakEvidence(page)).ready;
    }).toBe(true);
    const initial = await oakEvidence(page);
    expect(initial.runtime.acceptedRevision).toBe(initial.render.renderRevision);
    expect(initial.runtime.presentedRevision).toBe(initial.render.renderRevision);
    expect(await controls.evaluateAll((nodes) => nodes.every(
      (node) => !(node as HTMLButtonElement).disabled,
    ))).toBe(true);

    const crossing = await page.evaluate(() => {
      const harness = window.oakEcosystem;
      if (harness === undefined) throw new Error('Oak FIFO evidence needs its harness.');
      const before = harness.evidence();
      harness.command('root-cutaway');
      const afterFirst = harness.evidence();
      harness.command('reset');
      const afterSecond = harness.evidence();
      let overflowMessage = '';
      try {
        harness.command('rain');
      } catch (error) {
        overflowMessage = error instanceof Error ? error.message : String(error);
      }
      return { before, afterFirst, afterSecond, overflowMessage };
    });
    const firstTarget = crossing.before.render.renderRevision + 1;
    const secondTarget = firstTarget + 1;
    expect(crossing.afterFirst.ready).toBe(false);
    expect(crossing.afterFirst.render.renderRevision).toBe(firstTarget);
    expect(crossing.afterFirst.simulation.environmentRegime.water).toBe('ambient');
    expect(crossing.afterFirst.rootCutaway).toBe(true);
    expect(crossing.afterSecond.ready).toBe(false);
    expect(crossing.afterSecond.render.renderRevision).toBe(firstTarget);
    expect(crossing.afterSecond.simulation.environmentRegime.water).toBe('ambient');
    expect(crossing.afterSecond.rootCutaway).toBe(true);
    expect(crossing.afterSecond.simulation.epoch).toBe(crossing.before.simulation.epoch);
    expect(crossing.overflowMessage).toContain('one pending intent slot is full');
    expect(await controls.evaluateAll((nodes) => nodes.every(
      (node) => (node as HTMLButtonElement).disabled,
    ))).toBe(true);

    await expect.poll(async () => {
      await pumpOakAnimationFrame(page);
      return (await oakEvidence(page)).render.renderRevision;
    }).toBe(secondTarget);
    const secondPending = await oakEvidence(page);
    expect(secondPending.ready).toBe(false);
    expect(secondPending.simulation.environmentRegime.water).toBe('ambient');
    expect(secondPending.rootCutaway).toBe(false);
    expect(secondPending.simulation.epoch).not.toBe(crossing.before.simulation.epoch);
    expect(secondPending.runtime.presentedRevision).toBe(firstTarget);
    expect(secondPending.runtime.acceptedRevision).toBe(secondTarget);

    await expect.poll(async () => {
      await pumpOakAnimationFrame(page);
      const evidence = await oakEvidence(page);
      return evidence.ready
        && evidence.runtime.presentedRevision === secondTarget
        && evidence.runtime.acceptedRevision === secondTarget;
    }).toBe(true);
    const final = await oakEvidence(page);
    expect(final.render.renderRevision).toBe(secondTarget);
    expect(final.simulation.environmentRegime.water).toBe('ambient');
    expect(final.rootCutaway).toBe(false);
  } finally {
    await page.evaluate(() => {
      window.oakEcosystem?.dispose();
      (window as OakAnimationFrameGateWindowV1).__oakAnimationFrameGate.restore();
    });
  }
}
