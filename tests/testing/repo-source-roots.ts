import { globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The directories a repository-wide gate scans, named once, in one place.
 *
 * A gate that enforces a rule over part of the codebase reads, in every
 * summary and every commit message, as a gate that enforces the rule. The
 * solver-rate scan searched `tools/studio` because that is where the drift had
 * happened before; the rule was about every solver in the repository, and a
 * fixture directory it never looked at held a world stepping at a quarter of
 * the shared rate the whole time. Nothing said so, because the thing that
 * decides a scan's reach — its directory list — was private to the scan.
 *
 * So the reach is declared here, checked against the repository's actual
 * shape by `repo-wide-gate-coverage.test.ts`, and imported by every gate that
 * claims to be repository-wide. A new top-level directory of source fails that
 * check until it is either added here or recorded as deliberately unscanned.
 */
export const REPOSITORY_SOURCE_ROOTS_V1 = Object.freeze([
  'fixtures',
  'scripts',
  'src',
  'tests',
  'tools',
] as const);

/**
 * Top-level directories that hold no first-party source, and why.
 *
 * This is the other half of the same claim: a root list is only honest if
 * something re-derives it. Anything here that starts holding source, or
 * anything holding source that is named in neither list, fails the coverage
 * gate rather than being silently unscanned.
 */
export const REPOSITORY_NON_SOURCE_DIRECTORIES_V1 = Object.freeze({
  '.git': 'version control metadata',
  '.github': 'CI workflow definitions, not compiled or linted source',
  '.claude': "a concurrent session's worktree, never this checkout's source",
  'node_modules': 'dependencies, not ours to police',
  dist: 'build output of `src`',
  output: 'test and benchmark artefacts',
  tmp: 'untracked scratch; vitest excludes it so it cannot fail a gate',
  api: 'recorded public-API surface, checked by `npm run test:api`',
  benchmarks: 'recorded benchmark results, not code',
  docs: 'prose',
});

/** File extensions that carry first-party source in this repository. */
export const REPOSITORY_SOURCE_EXTENSIONS_V1 = Object.freeze(['.ts', '.mjs', '.js'] as const);

export const REPOSITORY_ROOT_V1 = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

function isSourceFile(name: string): boolean {
  return REPOSITORY_SOURCE_EXTENSIONS_V1.some((extension) => name.endsWith(extension));
}

/**
 * Every top-level directory of this checkout that actually holds source.
 *
 * Derived by looking, never by reading a list — a list checked against another
 * list agrees with itself and says nothing about the repository.
 */
export function topLevelDirectoriesHoldingSourceV1(
  repositoryRoot: string = REPOSITORY_ROOT_V1,
): readonly string[] {
  const holding: string[] = [];
  for (const entry of readdirSync(repositoryRoot)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(repositoryRoot, entry);
    if (!statSync(full).isDirectory()) continue;
    const found = globSync('**/*.{ts,mjs,js}', { cwd: full })
      .filter((path) => !path.split(/[\\/]/).includes('node_modules'));
    if (found.length > 0) holding.push(entry);
  }
  return holding.sort();
}

export interface RepositorySourceFileV1 {
  /** Repository-relative, forward-slashed, so a message reads the same on both platforms. */
  readonly path: string;
  readonly root: string;
  readonly text: string;
}

export interface RepositorySourceScanOptionsV1 {
  readonly repositoryRoot?: string;
  /** Defaults to every declared source root. */
  readonly roots?: readonly string[];
  /**
   * Recordings state the rate, the budget, or the shape they were made at as a
   * fact about themselves, not as a value anything derives now.
   */
  readonly skipGenerated?: boolean;
  /**
   * A test spells the value it checks; that is how it checks it. A scan that
   * forbids the spelling forbids proving the rule, so the rule's own tests are
   * excluded from it by name and the exemption gate proves at least one test
   * still relies on that.
   */
  readonly skipTests?: boolean;
  readonly skipPaths?: readonly string[];
}

/** Walks the declared roots and hands back the source it found, with its text. */
export function repositorySourceFilesV1(
  options: RepositorySourceScanOptionsV1 = {},
): readonly RepositorySourceFileV1[] {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT_V1;
  const roots = options.roots ?? REPOSITORY_SOURCE_ROOTS_V1;
  const skip = new Set(options.skipPaths ?? []);
  const found: RepositorySourceFileV1[] = [];
  for (const root of roots) {
    const walk = (current: string): void => {
      for (const entry of readdirSync(current)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(current, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!isSourceFile(entry)) continue;
        if (options.skipGenerated === true && basename(entry).startsWith('generated-')) continue;
        const path = full.slice(repositoryRoot.length + 1).split('\\').join('/');
        if (skip.has(path)) continue;
        if (options.skipTests === true && /\.(?:test|spec)\.[cm]?[jt]s$/.test(entry)) continue;
        found.push({ path, root, text: readFileSync(full, 'utf8') });
      }
    };
    walk(join(repositoryRoot, root));
  }
  return found;
}

/**
 * Strips comments before a scan reads a line.
 *
 * Prose about a historical value must not fail a scan, and a real literal must
 * not be able to hide behind one.
 */
export function repositoryCodeOnlyV1(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.split('//')[0] ?? '')
    .join('\n');
}
