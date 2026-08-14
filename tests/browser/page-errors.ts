import { expect, test, type Page } from '@playwright/test';

/**
 * Collects uncaught page errors and console errors for one test.
 *
 * This repo already treats a page error as a first-class assertion — the
 * visual-baseline, renderer-lifecycle, atomic-runtime and mesh-worker specs
 * all collect and assert an empty list. Eight studio specs did not, including
 * the Interact-lane one that drives real pointer input against the whole app,
 * which is exactly where an incidental exception is most likely and least
 * visible: an overlay, HUD, annotation or teardown path can throw without
 * disturbing the poses a test reads or the region it screenshots, and the
 * test stays green.
 *
 * Wire it as the first statement of a test and assert before the test ends:
 *
 * ```ts
 * const errors = watchPageErrors(page);
 * // ... drive the app ...
 * errors.expectNone();
 * ```
 */
export interface PageErrorWatchV1 {
  /** Everything seen so far, for a test that wants to inspect rather than assert. */
  readonly seen: readonly string[];
  /** Fails with the collected messages when anything was thrown or logged as an error. */
  expectNone(context?: string): void;
}

export function watchPageErrors(page: Page): PageErrorWatchV1 {
  const seen: string[] = [];
  page.on('pageerror', (error) => seen.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(`console.error: ${message.text()}`);
  });
  return {
    seen,
    expectNone(context?: string): void {
      expect(
        seen,
        context === undefined
          ? 'the page threw or logged an error while this test ran'
          : `${context}: the page threw or logged an error`,
      ).toEqual([]);
    },
  };
}

/**
 * Installs the watch for every test in the calling file.
 *
 * Call once at module scope. The assertion is skipped when the test already
 * failed, so a page error never masks the failure a reader actually needs to
 * see — it only turns an otherwise-green test red.
 */
export function guardPageErrors(): void {
  const watches = new Map<Page, PageErrorWatchV1>();
  test.beforeEach(({ page }) => {
    watches.set(page, watchPageErrors(page));
  });
  test.afterEach(({ page }, testInfo) => {
    const watch = watches.get(page);
    watches.delete(page);
    if (testInfo.status !== testInfo.expectedStatus) return;
    watch?.expectNone(testInfo.title);
  });
}
