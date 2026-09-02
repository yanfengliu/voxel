import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { REPOSITORY_SOURCE_ROOTS_V1 } from './repo-source-roots.js';
import { timeoutForMeasuredWorkMs } from './test-timeout.js';

/**
 * Every TypeScript file this repository writes must be inside the typecheck
 * program.
 *
 * `tsconfig.json` names fixture directories one at a time rather than taking
 * all of `fixtures/`, because the compatibility consumers deliberately compile
 * against a built `dist` that does not exist during an ordinary typecheck. An
 * include list is a claim about coverage that nothing checks, and this one had
 * already drifted: `fixtures/chain-consumer` — a live Rapier lane with four
 * source files — plus `fixtures/deterministic-math.test.ts` were in no program
 * at all. Vitest runs tests with types stripped and `eslint.config.js` turns
 * type-aware rules off for `fixtures/**`, so a wrong argument shape passed
 * `typecheck`, `lint`, and `test` alike. Adding them found three real
 * `Object is possibly 'undefined'` errors on the first run.
 *
 * The membership question is asked of the compiler rather than of the include
 * list, because TypeScript also pulls in whatever an included file imports —
 * an include-list check calls those files uncovered when they are not.
 *
 * This gate had a horizon of its own until 2026-09-02: it globbed `fixtures/`
 * because that is where the drift had been found, so the include list could
 * have dropped any of `src`, `tools` or `tests` and this would still have
 * reported full coverage — the same shape, one level up, as the rate scan that
 * searched one directory while claiming the repository. It now walks every
 * root in `REPOSITORY_SOURCE_ROOTS_V1`, whose own reach is re-derived from the
 * repository's shape by `repo-wide-gate-coverage.test.ts`. `scripts/` holds
 * only `.mjs` and is in no TypeScript program by construction; `npm run lint`
 * is what covers it.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Fixture paths that legitimately sit outside the ordinary typecheck.
 *
 * These compile against the packed `dist` as a consumer would, which is the
 * point of them; `npm run test:compatibility` is where they are checked.
 */
const COMPATIBILITY_ONLY_PREFIX = 'fixtures/compatibility/';

/** Measured at 1.7 s on the owner's machine; see the timeout rule. */
const TYPECHECK_PROGRAM_WORK_MS = 1_700;

function programFiles(): ReadonlySet<string> {
  // The compiler is run through `process.execPath` rather than an `npx`
  // shim: on Windows a `.cmd` shim makes `spawnSync` fail with EINVAL unless a
  // shell is spawned, and a shell is one more thing that can differ per host.
  const stdout = execFileSync(
    process.execPath,
    [
      join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
      '--noEmit', '-p', 'tsconfig.json', '--listFilesOnly',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const files = stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => relative(REPO_ROOT, resolve(REPO_ROOT, line)).split('\\').join('/'));
  if (files.length === 0) {
    throw new Error(
      'tsc --listFilesOnly produced no file list, so this gate cannot tell '
      + 'which files the typecheck covers. Check that tsconfig.json parses.',
    );
  }
  return new Set(files);
}

describe('the typecheck program covers every TypeScript file this repo writes', () => {
  it('leaves no source-root TypeScript file outside the compiler program', () => {
    const program = programFiles();
    const written = REPOSITORY_SOURCE_ROOTS_V1
      .flatMap((root) => globSync(`${root}/**/*.ts`, { cwd: REPO_ROOT }))
      .map((path) => path.split('\\').join('/'))
      .filter((path) => !path.startsWith(COMPATIBILITY_ONLY_PREFIX));

    expect(
      written.length,
      'found no TypeScript files at all, so this gate is proving nothing',
    ).toBeGreaterThan(0);
    // Non-vacuity: a file that is definitely in the program must be found, or
    // the path normalisation above has silently stopped matching anything.
    expect(program.has('src/core/contracts.ts')).toBe(true);
    // And every root has to contribute, or the walk above is reporting full
    // coverage while looking at part of the tree.
    for (const root of REPOSITORY_SOURCE_ROOTS_V1) {
      const seen = written.filter((path) => path.startsWith(`${root}/`)).length;
      if (root === 'scripts') {
        expect(seen, 'scripts/ has gained TypeScript, which is in no program')
          .toBe(0);
        continue;
      }
      expect(seen, `found no TypeScript under '${root}' to check`).toBeGreaterThan(0);
    }

    const uncovered = written.filter((path) => !program.has(path));

    expect(
      uncovered,
      'these files are in no TypeScript program: add their directory '
      + 'to tsconfig.json "include", or record them beside '
      + `${COMPATIBILITY_ONLY_PREFIX} with the reason they compile separately`,
    ).toEqual([]);
  }, timeoutForMeasuredWorkMs(TYPECHECK_PROGRAM_WORK_MS));
});
