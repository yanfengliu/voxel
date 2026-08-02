import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `tests/browser/**` are Playwright specs, run by their own gate.
    // `**/.claude/**` keeps the runner out of Claude Code worktrees: a
    // concurrent session's checkout lands there, and without this vitest
    // globs its duplicate unit tests and — fatally — its browser specs,
    // which throw under vitest rather than Playwright.
    // `tmp/**` is untracked scratch — probes, patches and logs left by earlier
    // sessions. Vitest globbed its `*.test.ts` files into the gate, so a stale
    // probe referencing something since deleted failed the whole suite. Scratch
    // must not be able to fail a gate.
    exclude: [
      ...configDefaults.exclude,
      'tests/browser/**',
      '**/.claude/**',
      'tmp/**',
    ],
  },
});
