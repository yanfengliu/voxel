import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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

describe('the typecheck program covers every fixture this repo writes', () => {
  it('leaves no fixture TypeScript file outside the compiler program', () => {
    const program = programFiles();
    const fixtures = globSync('fixtures/**/*.ts', { cwd: REPO_ROOT })
      .map((path) => path.split('\\').join('/'))
      .filter((path) => !path.startsWith(COMPATIBILITY_ONLY_PREFIX));

    expect(
      fixtures.length,
      'found no fixture files at all, so this gate is proving nothing',
    ).toBeGreaterThan(0);
    // Non-vacuity: a file that is definitely in the program must be found, or
    // the path normalisation above has silently stopped matching anything.
    expect(program.has('src/core/contracts.ts')).toBe(true);

    const uncovered = fixtures.filter((path) => !program.has(path));

    expect(
      uncovered,
      'these fixture files are in no TypeScript program: add their directory '
      + 'to tsconfig.json "include", or record them beside '
      + `${COMPATIBILITY_ONLY_PREFIX} with the reason they compile separately`,
    ).toEqual([]);
  }, timeoutForMeasuredWorkMs(TYPECHECK_PROGRAM_WORK_MS));
});
