import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[core-only-package]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_BYTES = 350_000;
const MAX_UNPACKED_BYTES = 1_700_000;
const TYPESCRIPT_CLI_PATH = join(
  PROJECT_ROOT,
  'node_modules',
  'typescript',
  'bin',
  'tsc',
);
const OFFLINE_NPM_ENVIRONMENT = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_ignore_scripts: 'true',
  npm_config_offline: 'true',
  npm_config_update_notifier: 'false',
};

function formatCommand(command, args) {
  return [command, ...args].map((part) => JSON.stringify(part)).join(' ');
}

async function runCommand(command, args, cwd, environment = OFFLINE_NPM_ENVIRONMENT) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, stderr, stdout });
    });
  });

  if (result.code !== 0) {
    const termination =
      result.code === null
        ? `terminated by signal ${result.signal ?? 'unknown'}`
        : `exited with code ${result.code}`;
    const output = [result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n');
    throw new Error(
      `${formatCommand(command, args)} ${termination}${output ? `:\n${output}` : ''}`,
    );
  }

  return result;
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

async function findNpmCliOnPath() {
  if (process.platform !== 'win32') {
    return undefined;
  }

  for (const rawDirectory of (process.env.PATH ?? '').split(delimiter)) {
    const directory = rawDirectory.replace(/^"|"$/g, '');
    if (!directory) {
      continue;
    }
    const candidate = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (await isFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function runNpm(args, cwd, environment) {
  const npmExecutable = process.env.npm_execpath;
  if (npmExecutable) {
    return runCommand(process.execPath, [npmExecutable, ...args], cwd, environment);
  }

  const npmCli = await findNpmCliOnPath();
  if (npmCli) {
    return runCommand(process.execPath, [npmCli, ...args], cwd, environment);
  }

  return runCommand('npm', args, cwd, environment);
}

async function assertFile(path, description) {
  let file;
  try {
    file = await stat(path);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error(`${description} is missing at ${path}. Run npm run build first.`, {
        cause: error,
      });
    }
    throw error;
  }

  if (!file.isFile()) {
    throw new Error(`${description} is not a file: ${path}`);
  }
}

async function assertPathMissing(path, description) {
  try {
    await stat(path);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  throw new Error(`${description} unexpectedly exists at ${path}`);
}

async function assertNoDanglingSourceMapDirectives(root) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (!entry.isFile() || (!entry.name.endsWith('.js') && !entry.name.endsWith('.d.ts'))) {
        continue;
      }
      const contents = await readFile(path, 'utf8');
      if (/^\/[/*]# sourceMappingURL=/mu.test(contents)) {
        throw new Error(`packed artifact contains a dangling source-map directive: ${path}`);
      }
    }
  }
}

function parsePackedTarball(stdout, packDirectory) {
  let manifest;
  try {
    manifest = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON:\n${stdout}`, { cause: error });
  }

  if (
    !Array.isArray(manifest) ||
    manifest.length !== 1 ||
    typeof manifest[0]?.filename !== 'string'
  ) {
    throw new Error(`npm pack returned an unexpected manifest:\n${stdout}`);
  }

  const packed = manifest[0];
  const tarballPath = resolvePath(packDirectory, packed.filename);
  if (dirname(tarballPath) !== resolvePath(packDirectory)) {
    throw new Error(`npm pack returned an unsafe tarball path: ${packed.filename}`);
  }
  return Object.freeze({ packed, tarballPath });
}

function assertPackedArtifactPolicy(packed) {
  if (
    !Array.isArray(packed.files)
    || !Number.isSafeInteger(packed.size)
    || !Number.isSafeInteger(packed.unpackedSize)
  ) {
    throw new Error('npm pack omitted the file list or package byte counts.');
  }
  const sourceMaps = packed.files
    .map((file) => file?.path)
    .filter((path) => typeof path === 'string' && path.endsWith('.map'));
  if (sourceMaps.length > 0) {
    throw new Error(
      `packed artifact contains ${sourceMaps.length} source maps; first: ${sourceMaps[0]}`,
    );
  }
  if (packed.size > MAX_PACKED_BYTES) {
    throw new Error(
      `packed artifact is ${packed.size} bytes; maximum is ${MAX_PACKED_BYTES}.`,
    );
  }
  if (packed.unpackedSize > MAX_UNPACKED_BYTES) {
    throw new Error(
      `unpacked artifact is ${packed.unpackedSize} bytes; maximum is ${MAX_UNPACKED_BYTES}.`,
    );
  }
}

async function verifyCoreOnlyPackage(temporaryRoot) {
  const packDirectory = join(temporaryRoot, 'pack');
  const consumerDirectory = join(temporaryRoot, 'consumer');
  const npmCacheDirectory = join(temporaryRoot, 'npm-cache');
  const npmEnvironment = {
    ...OFFLINE_NPM_ENVIRONMENT,
    npm_config_cache: npmCacheDirectory,
  };
  await mkdir(packDirectory);
  await mkdir(consumerDirectory);
  await mkdir(npmCacheDirectory);

  const packResult = await runNpm(
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--pack-destination',
      packDirectory,
    ],
    PROJECT_ROOT,
    npmEnvironment,
  );
  const { packed, tarballPath } = parsePackedTarball(packResult.stdout, packDirectory);
  assertPackedArtifactPolicy(packed);
  await assertFile(tarballPath, 'packed voxel tarball');

  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'voxel-core-only-consumer-fixture',
        private: true,
        type: 'module',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  await runNpm(
    [
      'install',
      tarballPath,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--omit=optional',
      '--package-lock=false',
      '--no-save',
    ],
    consumerDirectory,
    npmEnvironment,
  );

  await assertNoDanglingSourceMapDirectives(
    join(consumerDirectory, 'node_modules', 'voxel', 'dist'),
  );

  await assertPathMissing(
    join(consumerDirectory, 'node_modules', 'three'),
    'Three.js runtime',
  );
  await assertPathMissing(
    join(consumerDirectory, 'node_modules', '@types', 'three'),
    'Three.js declarations',
  );
  await assertPathMissing(
    join(consumerDirectory, 'node_modules', 'typescript'),
    'temporary-consumer TypeScript installation',
  );

  const importFixturePath = join(consumerDirectory, 'verify-import.mjs');
  await writeFile(
    importFixturePath,
    `let threeResolution;\n` +
      `try {\n` +
      `  threeResolution = import.meta.resolve('three');\n` +
      `} catch (error) {\n` +
      `  if (!error || typeof error !== 'object' || error.code !== 'ERR_MODULE_NOT_FOUND') {\n` +
      `    throw error;\n` +
      `  }\n` +
      `}\n` +
      `if (threeResolution !== undefined) {\n` +
      `  throw new Error(\`Three.js unexpectedly resolves to \${threeResolution}\`);\n` +
      `}\n` +
      `const expectedEntries = new Map([\n` +
      `  ['voxel/core', '/node_modules/voxel/dist/core/index.js'],\n` +
      `  ['voxel/meshing', '/node_modules/voxel/dist/meshing/index.js'],\n` +
      `  ['voxel/testing', '/node_modules/voxel/dist/testing/index.js'],\n` +
      `]);\n` +
      `for (const [specifier, expectedSuffix] of expectedEntries) {\n` +
      `  const resolved = import.meta.resolve(specifier);\n` +
      `  if (!resolved.endsWith(expectedSuffix)) {\n` +
      `    throw new Error(\`\${specifier} resolved outside the installed tarball: \${resolved}\`);\n` +
      `  }\n` +
      `}\n` +
      `const core = await import('voxel/core');\n` +
      `const meshing = await import('voxel/meshing');\n` +
      `const testing = await import('voxel/testing');\n` +
      `if (core.WORLD_SCHEMA_V1 !== 'voxel.world/1') {\n` +
      `  throw new Error('voxel/core imported without its expected V1 contract');\n` +
      `}\n` +
      `if (typeof meshing.DensePaletteChunk !== 'function' || typeof meshing.raycastDensePaletteChunks !== 'function') {\n` +
      `  throw new Error('voxel/meshing imported without its expected portable contracts');\n` +
      `}\n` +
      `if (typeof testing.createRendererLifecycleReferenceSnapshot !== 'function') {\n` +
      `  throw new Error('voxel/testing imported without its expected portable contract');\n` +
      `}\n`,
    'utf8',
  );
  await runCommand(process.execPath, [importFixturePath], consumerDirectory);

  const typeFixturePath = join(consumerDirectory, 'verify-declarations.ts');
  const typeConfigPath = join(consumerDirectory, 'tsconfig.json');
  await writeFile(
    typeFixturePath,
    `import { WORLD_SCHEMA_V1, type RenderSnapshotV1 } from 'voxel/core';\n` +
      `import { DensePaletteChunk, raycastDensePaletteChunks, type DensePaletteRaycastHit } from 'voxel/meshing';\n` +
      `import { createRendererLifecycleReferenceSnapshot } from 'voxel/testing';\n` +
      `const chunk = new DensePaletteChunk({\n` +
      `  origin: { x: 0, y: 0, z: 0 },\n` +
      `  size: { x: 1, y: 1, z: 1 },\n` +
      `});\n` +
      `const hit: DensePaletteRaycastHit | null = raycastDensePaletteChunks({\n` +
      `  origin: { x: -1, y: 0.5, z: 0.5 },\n` +
      `  direction: { x: 1, y: 0, z: 0 },\n` +
      `  maxDistance: 2,\n` +
      `  chunkSize: chunk.size,\n` +
      `  getChunk: (x, y, z) => x === 0 && y === 0 && z === 0 ? chunk : undefined,\n` +
      `});\n` +
      `const snapshot: RenderSnapshotV1 = createRendererLifecycleReferenceSnapshot({ revision: 1 });\n` +
      `void [WORLD_SCHEMA_V1, hit, snapshot];\n`,
    'utf8',
  );
  await writeFile(
    typeConfigPath,
    `${JSON.stringify(
      {
        compilerOptions: {
          exactOptionalPropertyTypes: true,
          lib: ['ES2022'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          noUncheckedIndexedAccess: true,
          skipLibCheck: false,
          strict: true,
          target: 'ES2022',
          types: [],
        },
        files: ['./verify-declarations.ts'],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  await runCommand(
    process.execPath,
    [TYPESCRIPT_CLI_PATH, '--project', typeConfigPath, '--pretty', 'false'],
    consumerDirectory,
  );

  await assertPathMissing(
    join(consumerDirectory, 'node_modules', 'typescript'),
    'temporary-consumer TypeScript installation',
  );
}

async function main() {
  await assertFile(
    join(PROJECT_ROOT, 'dist', 'core', 'index.js'),
    'built voxel/core entry point',
  );
  await assertFile(TYPESCRIPT_CLI_PATH, 'repository TypeScript CLI');

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'voxel-core-only-'));
  try {
    await verifyCoreOnlyPackage(temporaryRoot);
  } finally {
    await rm(temporaryRoot, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }

  console.log(
    `${LOG_PREFIX} enforced package budgets and imported/typechecked portable entries without Three.js`,
  );
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} verification failed`);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
