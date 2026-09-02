import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REPOSITORY_NON_SOURCE_DIRECTORIES_V1,
  REPOSITORY_ROOT_V1,
  REPOSITORY_SOURCE_ROOTS_V1,
  repositorySourceFilesV1,
  topLevelDirectoriesHoldingSourceV1,
} from './repo-source-roots.js';

/**
 * What bounds a gate is what decides whether it can see the defect.
 *
 * Every gate has a horizon — a directory list, an include list, an exemption, a
 * tick window, a solver rate, a frame count. Inside it the gate is honest;
 * outside it the gate is silent, and no summary can tell the two apart. Three
 * of this repository's own outages lived exactly there: a rate scan that
 * searched one directory while claiming the repository, a `tsconfig` include
 * list that named three consumer fixtures and not the fourth, and an exemption
 * whose stated blocker had stopped being true long before anyone re-measured
 * it.
 *
 * The gates below watch the horizons themselves. Each asks a question a
 * reviewer cannot ask by reading: does the scan still reach everything it
 * claims to, and does each exemption still describe something real?
 *
 * They are cheap on purpose — file reads, no solver, no browser — so they run
 * in every `npm run test` rather than becoming the slow thing someone skips.
 */

const REPOSITORY_ROOT = REPOSITORY_ROOT_V1;

function packageScript(name: string): string {
  const manifest = JSON.parse(
    readFileSync(join(REPOSITORY_ROOT, 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> };
  const script = manifest.scripts[name];
  if (script === undefined) {
    throw new Error(
      `package.json declares no '${name}' script, so this gate cannot read what `
      + 'that command covers. The authoritative commands live there.',
    );
  }
  return script;
}

interface ScannedFileV1 {
  readonly path: string;
  readonly text: string;
}

/** Every tracked Markdown file under `docs`, plus the two at the root. */
function proseFiles(): readonly ScannedFileV1[] {
  const found: ScannedFileV1[] = [];
  const walk = (relative: string): void => {
    const full = join(REPOSITORY_ROOT, relative);
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full)) {
      if (entry.startsWith('.')) continue;
      const child = `${relative}/${entry}`;
      const childFull = join(REPOSITORY_ROOT, child);
      if (statSync(childFull).isDirectory()) {
        walk(child);
        continue;
      }
      if (!entry.endsWith('.md')) continue;
      found.push({ path: child, text: readFileSync(childFull, 'utf8') });
    }
  };
  walk('docs');
  for (const name of ['AGENTS.md', 'README.md']) {
    const full = join(REPOSITORY_ROOT, name);
    if (existsSync(full)) found.push({ path: name, text: readFileSync(full, 'utf8') });
  }
  return found;
}

describe('a repository-wide gate reaches the whole repository', () => {
  /**
   * A scan's directory list is a claim about its reach, and nothing but this
   * re-derives it. While `solver-rate.test.ts` searched `tools/studio` alone,
   * every summary it produced read as "the whole repository" and a fixture
   * directory ran a real Rapier world at a quarter of the shared rate for
   * weeks.
   */
  it('names every top-level directory that holds first-party source', () => {
    const holding = topLevelDirectoriesHoldingSourceV1();
    expect(
      holding.length,
      'found no top-level source directories at all, so this gate is proving nothing',
    ).toBeGreaterThan(3);

    const declared = new Set<string>(REPOSITORY_SOURCE_ROOTS_V1);
    const excused = new Set(Object.keys(REPOSITORY_NON_SOURCE_DIRECTORIES_V1));
    const unscanned = holding.filter((entry) => !declared.has(entry) && !excused.has(entry));

    expect(
      unscanned,
      'these directories hold source that no repository-wide gate scans: add them '
      + 'to REPOSITORY_SOURCE_ROOTS_V1, or record them in '
      + 'REPOSITORY_NON_SOURCE_DIRECTORIES_V1 with the reason they are not source',
    ).toEqual([]);

    // The other direction: a declared root that no longer holds source is a scan
    // walking an empty tree while reporting full coverage.
    const empty = [...declared].filter((root) => !holding.includes(root));
    expect(
      empty,
      'these roots are scanned but hold no source; a scan of nothing reports the '
      + 'same green as a scan of everything',
    ).toEqual([]);
  });

  /**
   * `npm run lint` names its paths one at a time. That is an include list, and
   * an include list is a claim about coverage that nothing checks — the same
   * shape that left `fixtures/windmill-consumer` out of the typecheck, where
   * adding it surfaced nine errors in a function no compiler had ever read.
   */
  it('lints every source root', () => {
    const lint = packageScript('lint');
    const missing = REPOSITORY_SOURCE_ROOTS_V1.filter(
      (root) => !new RegExp(`(?:^|\\s)${root}(?:\\s|$)`).test(lint),
    );
    expect(
      missing,
      `npm run lint covers only part of the repository — '${lint}' names none of `
      + `these source roots: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * An exemption records a diagnosis, and a diagnosis can be wrong; nothing about
 * writing it down makes it true. The solver-rate exemption named its lane,
 * stated its blocker and carried a case designed to fail when the lane was
 * fixed — and its blocker had been measured wrong, so every later session
 * trusted a number that was not measuring what it claimed.
 *
 * Each case below fails when its lane is fixed, and says to delete the
 * exemption rather than to restore the lane.
 */
describe('every exemption still describes something real', () => {
  it('still has a compatibility lane that compiles outside the typecheck', () => {
    // `typecheck-coverage.test.ts` excuses `fixtures/compatibility/` because
    // those consumers compile against a packed `dist` that does not exist during
    // an ordinary typecheck. If that stops being true — the directory goes, or
    // its files enter the program — the exemption is a hole with no reason left.
    const lane = join(REPOSITORY_ROOT, 'fixtures', 'compatibility');
    expect(
      existsSync(lane),
      'fixtures/compatibility no longer exists, so the typecheck exemption for it '
      + 'excuses nothing: delete COMPATIBILITY_ONLY_PREFIX from '
      + 'tests/testing/typecheck-coverage.test.ts',
    ).toBe(true);

    const compatibility = repositorySourceFilesV1({ roots: ['fixtures/compatibility'] });
    expect(
      compatibility.map((file) => file.path),
      'the compatibility lane holds no source, so the exemption excuses nothing',
    ).not.toEqual([]);

    // And the exemption's stated substitute has to be real: these files are
    // excused from the typecheck because a different command checks them.
    const compatibilityCheck = readFileSync(
      join(REPOSITORY_ROOT, 'scripts', 'verify-consumer-compatibility.mjs'),
      'utf8',
    );
    expect(
      compatibilityCheck.includes('fixtures'),
      'npm run test:compatibility no longer reads fixtures/compatibility, so the '
      + 'typecheck exemption points at a check that does not cover it',
    ).toBe(true);
  });

  it('still routes browser budgets through the margin gate that excuses them', () => {
    // `test-timeout.test.ts` excuses `tests/browser/**` from the bare-literal
    // scan because Playwright budgets come from `playwright.config.ts` and from
    // `test.setTimeout()`, which that scan cannot read. That excuse used to be
    // false: on 2026-08-28 the browser lane had neither a measured default nor a
    // margin gate, and it ran five weeks on a flat sixty seconds nothing had
    // measured. The substitute exists now; this is what keeps it existing.
    const config = readFileSync(join(REPOSITORY_ROOT, 'playwright.config.ts'), 'utf8');
    expect(
      config.includes('./tests/testing/browser-timeout-headroom.ts'),
      'playwright.config.ts no longer registers the margin reporter, so the browser '
      + 'exemption in tests/testing/test-timeout.test.ts excuses a lane nothing watches',
    ).toBe(true);
    expect(
      existsSync(join(REPOSITORY_ROOT, 'tests', 'testing', 'browser-timeout-headroom.ts')),
      'the browser margin gate is gone; the timeout exemption naming it is excusing '
      + 'an unwatched lane',
    ).toBe(true);
  });

  it('still has tests that spell the rates the source scan forbids', () => {
    // The rate scan excuses `*.test.ts` and `*.spec.ts`, because a test proves a
    // derivation by spelling the value it expects. If no test spells one any
    // more, the exemption excuses nothing and should go.
    const spelling = repositorySourceFilesV1({ roots: ['tools', 'tests'] })
      .filter((file) => /\.(?:test|spec)\.ts$/.test(file.path))
      .filter((file) => /\b1[_0-9]*\s*\/\s*(?:60|240)\b/.test(file.text));
    expect(
      spelling.length,
      'no test spells a solver rate any more, so the test exemption in the rate '
      + 'scan excuses nothing: delete it and let the scan cover tests too',
    ).toBeGreaterThan(0);
  });
});

/**
 * A rule that must be followed has to be somewhere both loaded and durable, and
 * "loaded" is only half of it. The rule requiring these anchors was written into
 * AGENTS.md — loaded by every agent — inside the generated `FLEET-CANON` block,
 * and a routine fleet sync trimmed it out of the upstream file and took it from
 * this repository with it. Nobody decided to drop it.
 *
 * The same entry cited `AGENTS.md:68` and `AGENTS.md:28` by line number; both had
 * moved within days, and line 68 by then held an unrelated trap.
 */
describe('this repository quotes its rules instead of pointing at them', () => {
  it('cites no line number into AGENTS.md', () => {
    // This file necessarily spells the citations it forbids: they are its test
    // data and its explanation. It is the scanner, not a document, and the case
    // below proves the scanner still sees a citation that hides behind prose.
    const SCANNER = 'tests/testing/repo-wide-gate-coverage.test.ts';
    const scanned: readonly ScannedFileV1[] = [
      ...repositorySourceFilesV1().map((file) => ({ path: file.path, text: file.text })),
      ...proseFiles(),
    ].filter((file) => file.path !== SCANNER);
    expect(
      scanned.length,
      'scanned no files, so this gate would pass vacuously',
    ).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of scanned) {
      file.text.split('\n').forEach((line, index) => {
        if (!/AGENTS\.md:\d+/.test(line)) return;
        offenders.push(`${file.path}:${String(index + 1)}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(
      offenders.sort(),
      'a line number into AGENTS.md is stale within days — quote the rule instead, '
      + 'so the next reader can check the claim rather than find whatever has since '
      + 'moved into that line',
    ).toEqual([]);
  });

  it('sees a citation that hides inside prose', () => {
    // The scan reads whole lines rather than code, which is the only way it can
    // catch the form the defect actually took: a line number written into a
    // sentence, in a document, where no compiler will ever look at it.
    const disguised = [
      'The rule at `AGENTS.md:68` says otherwise.',
      'AGENTS.md itself is fine to name without a line.',
      'See AGENTS.md, Invariants & boundaries.',
    ];
    expect(disguised.filter((line) => /AGENTS\.md:\d+/.test(line)))
      .toEqual(['The rule at `AGENTS.md:68` says otherwise.']);
  });

  it("keeps this repository's own rules out of the block a fleet sync rewrites", () => {
    const agents = readFileSync(join(REPOSITORY_ROOT, 'AGENTS.md'), 'utf8');
    const begin = agents.indexOf('FLEET-CANON:BEGIN');
    const end = agents.indexOf('FLEET-CANON:END');
    expect(begin, 'AGENTS.md carries no FLEET-CANON block to reason about').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);

    expect(
      existsSync(join(REPOSITORY_ROOT, 'docs', 'policies', 'local-rules.md')),
      "docs/policies/local-rules.md is gone; this repository's own rules have "
      + 'nowhere to live that a fleet sync cannot rewrite',
    ).toBe(true);

    // The pointer to it has to survive a sync, so it must sit outside the block.
    const outside = agents.slice(0, begin) + agents.slice(end);
    expect(
      outside.includes('docs/policies/local-rules.md'),
      'AGENTS.md names docs/policies/local-rules.md only inside the generated canon '
      + 'block, so the next fleet sync deletes the pointer to every rule this '
      + 'repository added — which is exactly how they were lost before',
    ).toBe(true);
  });
});
