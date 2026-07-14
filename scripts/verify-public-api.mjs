import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const LOG_PREFIX = '[public-api]';
const FORMAT_VERSION = 1;
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = join(PROJECT_ROOT, 'dist');
const PACKAGE_PATH = join(PROJECT_ROOT, 'package.json');
const SNAPSHOT_PATH = join(PROJECT_ROOT, 'api', 'public-api.json');

function toPosixPath(path) {
  return path.replaceAll('\\', '/');
}

function projectPath(path) {
  return toPosixPath(relative(PROJECT_ROOT, path));
}

function isInside(parent, child) {
  const childPath = relative(parent, child);
  return childPath !== '..' && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath);
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readJson(path, description) {
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`${description} is missing at ${path}`, { cause: error });
    }
    throw error;
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${description} is not valid JSON: ${path}`, { cause: error });
  }
}

function declarationCandidates(importerPath, specifier) {
  const target = resolve(dirname(importerPath), specifier);
  if (/\.d\.(?:cts|mts|ts)$/u.test(target)) {
    return [target];
  }

  switch (extname(target)) {
    case '.cjs':
      return [target.slice(0, -4) + '.d.cts'];
    case '.mjs':
      return [target.slice(0, -4) + '.d.mts'];
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
      return [target.replace(/\.[^.]+$/u, '.d.ts')];
    default:
      return [`${target}.d.ts`, join(target, 'index.d.ts')];
  }
}

async function resolveDeclaration(importerPath, specifier) {
  const candidates = declarationCandidates(importerPath, specifier);
  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      const canonicalPath = await realpath(candidate);
      if (!isInside(DIST_ROOT, canonicalPath)) {
        throw new Error(
          `${projectPath(importerPath)} references ${JSON.stringify(specifier)}, which resolves outside dist: ${canonicalPath}`,
        );
      }
      return canonicalPath;
    }
  }

  throw new Error(
    `${projectPath(importerPath)} references ${JSON.stringify(specifier)}, but no built declaration was found. Tried:\n${candidates
      .map((candidate) => `  - ${projectPath(candidate)}`)
      .join('\n')}`,
  );
}

function relativeDeclarationReferences(source) {
  const preprocessed = ts.preProcessFile(source, true, true);
  const references = [
    ...preprocessed.importedFiles,
    ...preprocessed.referencedFiles,
    ...preprocessed.typeReferenceDirectives,
  ]
    .map(({ fileName }) => fileName)
    .filter((fileName) => fileName.startsWith('.'));

  return [...new Set(references)].sort((left, right) => left.localeCompare(right));
}

function normalizeDeclaration(source) {
  return source.replace(/\r\n?/gu, '\n');
}

async function inspectDeclaration(path, cache) {
  const cached = cache.get(path);
  if (cached) {
    return cached;
  }

  const normalizedSource = normalizeDeclaration(await readFile(path, 'utf8'));
  const dependencies = [];
  for (const specifier of relativeDeclarationReferences(normalizedSource)) {
    dependencies.push(await resolveDeclaration(path, specifier));
  }
  dependencies.sort((left, right) => projectPath(left).localeCompare(projectPath(right)));

  const declaration = {
    dependencies,
    sha256: createHash('sha256').update(normalizedSource, 'utf8').digest('hex'),
  };
  cache.set(path, declaration);
  return declaration;
}

function exportedTypeEntries(packageJson) {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new Error('package.json must contain an object');
  }
  if (!packageJson.exports || typeof packageJson.exports !== 'object' || Array.isArray(packageJson.exports)) {
    throw new Error('package.json exports must contain an object');
  }

  const entries = [];
  for (const [entrypoint, conditions] of Object.entries(packageJson.exports)) {
    if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) {
      continue;
    }
    if (typeof conditions.types === 'string') {
      entries.push([entrypoint, conditions.types]);
    }
  }

  entries.sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    throw new Error('package.json exports do not define any types entry points');
  }
  return entries;
}

async function resolveEntrypoint(entrypoint, target) {
  if (!target.startsWith('./')) {
    throw new Error(`${entrypoint} types target must be package-relative, received ${JSON.stringify(target)}`);
  }
  const absolutePath = resolve(PROJECT_ROOT, target);
  if (!(await isFile(absolutePath))) {
    throw new Error(
      `${entrypoint} built types entry is missing at ${projectPath(absolutePath)}. Run npm run build first.`,
    );
  }

  const canonicalPath = await realpath(absolutePath);
  if (!isInside(DIST_ROOT, canonicalPath)) {
    throw new Error(`${entrypoint} types target resolves outside dist: ${canonicalPath}`);
  }
  return canonicalPath;
}

async function createSnapshot() {
  const packageJson = await readJson(PACKAGE_PATH, 'package manifest');
  const entrypointTargets = exportedTypeEntries(packageJson);
  const declarationCache = new Map();
  const reachability = new Map();
  const entrypoints = {};

  for (const [entrypoint, target] of entrypointTargets) {
    const entryPath = await resolveEntrypoint(entrypoint, target);
    entrypoints[entrypoint] = projectPath(entryPath);

    const pending = [entryPath];
    const visited = new Set();
    while (pending.length > 0) {
      const declarationPath = pending.shift();
      if (visited.has(declarationPath)) {
        continue;
      }
      visited.add(declarationPath);

      const existingEntrypoints = reachability.get(declarationPath) ?? [];
      existingEntrypoints.push(entrypoint);
      reachability.set(declarationPath, existingEntrypoints);

      const declaration = await inspectDeclaration(declarationPath, declarationCache);
      pending.push(...declaration.dependencies);
    }
  }

  const files = {};
  const declarationPaths = [...reachability.keys()].sort((left, right) =>
    projectPath(left).localeCompare(projectPath(right)),
  );
  for (const declarationPath of declarationPaths) {
    const declaration = await inspectDeclaration(declarationPath, declarationCache);
    files[projectPath(declarationPath)] = {
      sha256: declaration.sha256,
      reachableFrom: [...new Set(reachability.get(declarationPath))].sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  return {
    formatVersion: FORMAT_VERSION,
    packageName: packageJson.name,
    entrypoints,
    files,
  };
}

function sortedKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compareSnapshots(expected, current) {
  const diagnostics = [];
  if (expected.formatVersion !== current.formatVersion) {
    diagnostics.push(
      `Snapshot format changed: expected ${JSON.stringify(expected.formatVersion)}, current ${JSON.stringify(current.formatVersion)}`,
    );
  }
  if (expected.packageName !== current.packageName) {
    diagnostics.push(
      `Package name changed: expected ${JSON.stringify(expected.packageName)}, current ${JSON.stringify(current.packageName)}`,
    );
  }

  const expectedEntrypoints = new Set(sortedKeys(expected.entrypoints));
  const currentEntrypoints = new Set(sortedKeys(current.entrypoints));
  for (const entrypoint of expectedEntrypoints) {
    if (!currentEntrypoints.has(entrypoint)) {
      diagnostics.push(`Missing types entry point: ${entrypoint}`);
    } else if (expected.entrypoints[entrypoint] !== current.entrypoints[entrypoint]) {
      diagnostics.push(
        `Changed types entry point ${entrypoint}: expected ${expected.entrypoints[entrypoint]}, current ${current.entrypoints[entrypoint]}`,
      );
    }
  }
  for (const entrypoint of currentEntrypoints) {
    if (!expectedEntrypoints.has(entrypoint)) {
      diagnostics.push(`Extra types entry point: ${entrypoint} -> ${current.entrypoints[entrypoint]}`);
    }
  }

  const expectedFiles = new Set(sortedKeys(expected.files));
  const currentFiles = new Set(sortedKeys(current.files));
  for (const path of expectedFiles) {
    if (!currentFiles.has(path)) {
      diagnostics.push(`Missing declaration (no longer reachable): ${path}`);
      continue;
    }

    const expectedFile = expected.files[path];
    const currentFile = current.files[path];
    if (expectedFile?.sha256 !== currentFile?.sha256) {
      diagnostics.push(
        `Changed declaration: ${path}\n    expected sha256 ${expectedFile?.sha256 ?? '<missing>'}\n    current  sha256 ${currentFile?.sha256 ?? '<missing>'}`,
      );
    }
    if (!sameStringArray(expectedFile?.reachableFrom, currentFile?.reachableFrom)) {
      diagnostics.push(
        `Changed entry-point reachability: ${path}\n    expected ${JSON.stringify(expectedFile?.reachableFrom)}\n    current  ${JSON.stringify(currentFile?.reachableFrom)}`,
      );
    }
  }
  for (const path of currentFiles) {
    if (!expectedFiles.has(path)) {
      diagnostics.push(
        `Extra declaration (newly reachable): ${path} from ${current.files[path].reachableFrom.join(', ')}`,
      );
    }
  }

  return diagnostics;
}

function serializeSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

function runSelfTest() {
  const expected = {
    formatVersion: FORMAT_VERSION,
    packageName: 'voxel-self-test',
    entrypoints: {
      './core': 'dist/core/index.d.ts',
    },
    files: {
      'dist/core/changed.d.ts': {
        sha256: 'expected-changed-hash',
        reachableFrom: ['./core'],
      },
      'dist/core/missing.d.ts': {
        sha256: 'expected-missing-hash',
        reachableFrom: ['./core'],
      },
      'dist/core/reachability.d.ts': {
        sha256: 'unchanged-hash',
        reachableFrom: ['./core'],
      },
    },
  };
  const current = {
    formatVersion: FORMAT_VERSION,
    packageName: 'voxel-self-test',
    entrypoints: {
      './core': 'dist/core/index.d.ts',
    },
    files: {
      'dist/core/changed.d.ts': {
        sha256: 'current-changed-hash',
        reachableFrom: ['./core'],
      },
      'dist/core/extra.d.ts': {
        sha256: 'current-extra-hash',
        reachableFrom: ['./core'],
      },
      'dist/core/reachability.d.ts': {
        sha256: 'unchanged-hash',
        reachableFrom: ['./core', './testing'],
      },
    },
  };

  const diagnostics = compareSnapshots(expected, current);
  const expectedDiagnostics = [
    'Changed declaration: dist/core/changed.d.ts',
    'Missing declaration (no longer reachable): dist/core/missing.d.ts',
    'Extra declaration (newly reachable): dist/core/extra.d.ts',
    'Changed entry-point reachability: dist/core/reachability.d.ts',
  ];
  const missingDiagnostics = expectedDiagnostics.filter(
    (expectedDiagnostic) =>
      !diagnostics.some((diagnostic) => diagnostic.includes(expectedDiagnostic)),
  );
  if (diagnostics.length !== expectedDiagnostics.length || missingDiagnostics.length > 0) {
    throw new Error(
      `self-test expected exactly these declaration diagnostics:\n${expectedDiagnostics
        .map((diagnostic) => `  - ${diagnostic}`)
        .join('\n')}\nreceived:\n${diagnostics.map((diagnostic) => `  - ${diagnostic}`).join('\n')}`,
    );
  }

  console.log(
    `${LOG_PREFIX} self-test diagnosed changed, missing, extra, and reachability declarations by file name`,
  );
}

async function updateSnapshot(snapshot) {
  await mkdir(dirname(SNAPSHOT_PATH), { recursive: true });
  await writeFile(SNAPSHOT_PATH, serializeSnapshot(snapshot), 'utf8');
  console.log(
    `${LOG_PREFIX} updated ${projectPath(SNAPSHOT_PATH)} (${Object.keys(snapshot.files).length} declarations from ${Object.keys(snapshot.entrypoints).length} entry points)`,
  );
}

async function verifySnapshot(current) {
  let expected;
  try {
    expected = await readJson(SNAPSHOT_PATH, 'public API snapshot');
  } catch (error) {
    if (error instanceof Error && error.cause?.code === 'ENOENT') {
      throw new Error(
        `${error.message}. Run npm run api:update after reviewing the built public API.`,
        { cause: error },
      );
    }
    throw error;
  }

  const diagnostics = compareSnapshots(expected, current);
  if (diagnostics.length > 0) {
    throw new Error(
      `public declarations differ from ${projectPath(SNAPSHOT_PATH)}:\n\n${diagnostics
        .map((diagnostic) => `- ${diagnostic}`)
        .join('\n')}\n\nIf the changes are intentional and compatible, review them and run npm run api:update.`,
    );
  }

  console.log(
    `${LOG_PREFIX} verified ${Object.keys(current.files).length} declarations reachable from ${Object.keys(current.entrypoints).length} entry points`,
  );
}

function parseArguments(args) {
  if (args.length === 0) {
    return { selfTest: false, update: false };
  }
  if (args.length === 1 && args[0] === '--update') {
    return { selfTest: false, update: true };
  }
  if (args.length === 1 && args[0] === '--self-test') {
    return { selfTest: true, update: false };
  }
  throw new Error('Usage: node scripts/verify-public-api.mjs [--update | --self-test]');
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }

  const snapshot = await createSnapshot();
  if (options.update) {
    await updateSnapshot(snapshot);
  } else {
    await verifySnapshot(snapshot);
  }
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} verification failed`);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
