import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[three-package]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const THREE_PACKAGE_ROOT = join(PROJECT_ROOT, 'node_modules', 'three');
const THREE_TYPES_PACKAGE_ROOT = join(PROJECT_ROOT, 'node_modules', '@types', 'three');
const TYPESCRIPT_CLI = join(PROJECT_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const EXPECTED_THREE_VERSION = '0.185.1';
const EXPECTED_THREE_TYPES_VERSION = '0.185.0';
const THREE_TYPES_DEPENDENCY_ROOTS = Object.freeze([
  ['@dimforge/rapier3d-compat', join(PROJECT_ROOT, 'node_modules', '@dimforge', 'rapier3d-compat')],
  ['@tweenjs/tween.js', join(PROJECT_ROOT, 'node_modules', '@tweenjs', 'tween.js')],
  ['@types/stats.js', join(PROJECT_ROOT, 'node_modules', '@types', 'stats.js')],
  ['@types/webxr', join(PROJECT_ROOT, 'node_modules', '@types', 'webxr')],
  ['fflate', join(PROJECT_ROOT, 'node_modules', 'fflate')],
  ['meshoptimizer', join(PROJECT_ROOT, 'node_modules', 'meshoptimizer')],
]);
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
  if (!(await isFile(path))) {
    throw new Error(`${description} is missing at ${path}. Run npm run build first.`);
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

function parsePackedTarball(stdout, packDirectory, description) {
  let manifest;
  try {
    manifest = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${description} npm pack returned invalid JSON:\n${stdout}`, {
      cause: error,
    });
  }

  if (
    !Array.isArray(manifest) ||
    manifest.length !== 1 ||
    typeof manifest[0]?.filename !== 'string'
  ) {
    throw new Error(`${description} npm pack returned an unexpected manifest:\n${stdout}`);
  }

  const tarballPath = resolvePath(packDirectory, manifest[0].filename);
  if (dirname(tarballPath) !== resolvePath(packDirectory)) {
    throw new Error(`${description} npm pack returned an unsafe path: ${manifest[0].filename}`);
  }
  return tarballPath;
}

function parseDependencyTree(stdout) {
  let tree;
  try {
    tree = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`npm ls returned invalid JSON:\n${stdout}`, { cause: error });
  }

  const three = tree?.dependencies?.three;
  const voxel = tree?.dependencies?.voxel;
  if (three?.version !== EXPECTED_THREE_VERSION || typeof voxel?.version !== 'string') {
    throw new Error(`npm ls did not report the expected voxel and Three.js roots:\n${stdout}`);
  }
  if (Array.isArray(tree.problems) && tree.problems.length > 0) {
    throw new Error(`npm ls reported dependency problems:\n${tree.problems.join('\n')}`);
  }
}

async function packPackage(packageRoot, packDirectory, npmEnvironment, description) {
  const result = await runNpm(
    [
      'pack',
      packageRoot,
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
  const tarballPath = parsePackedTarball(result.stdout, packDirectory, description);
  await assertFile(tarballPath, `packed ${description} tarball`);
  return tarballPath;
}

async function verifyThreePackage(temporaryRoot) {
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

  const voxelTarballPath = await packPackage(
    PROJECT_ROOT,
    packDirectory,
    npmEnvironment,
    'voxel',
  );
  const threeTarballPath = await packPackage(
    THREE_PACKAGE_ROOT,
    packDirectory,
    npmEnvironment,
    'Three.js',
  );
  const threeTypesTarballPath = await packPackage(
    THREE_TYPES_PACKAGE_ROOT,
    packDirectory,
    npmEnvironment,
    'Three.js declarations',
  );
  const threeTypesDependencyTarballs = [];
  for (const [description, packageRoot] of THREE_TYPES_DEPENDENCY_ROOTS) {
    threeTypesDependencyTarballs.push(await packPackage(
      packageRoot,
      packDirectory,
      npmEnvironment,
      description,
    ));
  }

  await writeFile(
    join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'voxel-three-consumer-fixture',
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
      voxelTarballPath,
      threeTarballPath,
      threeTypesTarballPath,
      ...threeTypesDependencyTarballs,
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
    ],
    consumerDirectory,
    npmEnvironment,
  );

  await assertPathMissing(
    join(consumerDirectory, 'node_modules', 'voxel', 'node_modules', 'three'),
    'nested Three.js runtime',
  );

  const packageProbePath = join(
    consumerDirectory,
    'node_modules',
    'voxel',
    'dist',
    'three',
    'verify-three-resolution.mjs',
  );
  await writeFile(
    packageProbePath,
    `import * as packageRelativeThree from 'three';\n` +
      `export { packageRelativeThree };\n` +
      `export const packageRelativeResolution = import.meta.resolve('three');\n`,
    'utf8',
  );

  const importFixturePath = join(consumerDirectory, 'verify-import.mjs');
  await writeFile(
    importFixturePath,
    `import { realpath } from 'node:fs/promises';\n` +
      `import { fileURLToPath, pathToFileURL } from 'node:url';\n` +
      `import * as consumerThree from 'three';\n` +
      `import { createIsometricOrthographicCamera, getThreeRuntimeCapabilitiesV1 } from 'voxel/three';\n` +
      `const consumerResolution = import.meta.resolve('three');\n` +
      `const packageProbe = await import(pathToFileURL(${JSON.stringify(packageProbePath)}));\n` +
      `const consumerCanonicalPath = await realpath(fileURLToPath(consumerResolution));\n` +
      `const packageCanonicalPath = await realpath(fileURLToPath(packageProbe.packageRelativeResolution));\n` +
      `if (consumerCanonicalPath !== packageCanonicalPath) {\n` +
      `  throw new Error(\`Three.js resolves to two files: \${consumerCanonicalPath} and \${packageCanonicalPath}\`);\n` +
      `}\n` +
      `if (packageProbe.packageRelativeThree !== consumerThree) {\n` +
      `  throw new Error('consumer and voxel package loaded distinct Three.js module namespaces');\n` +
      `}\n` +
      `const camera = createIsometricOrthographicCamera({\n` +
      `  viewportWidth: 640,\n` +
      `  viewportHeight: 360,\n` +
      `  center: { x: 0, y: 0, z: 0 },\n` +
      `  zoom: 1,\n` +
      `});\n` +
      `if (!(camera instanceof consumerThree.OrthographicCamera)) {\n` +
      `  throw new Error('voxel/three constructed a camera from a distinct Three.js runtime');\n` +
      `}\n` +
      `const capabilities = getThreeRuntimeCapabilitiesV1();\n` +
      `if (capabilities.testedThree.runtime !== '>=0.185.1 <0.186.0') {\n` +
      `  throw new Error('voxel/three reported an unexpected tested Three.js range');\n` +
      `}\n`,
    'utf8',
  );
  await runCommand(process.execPath, [importFixturePath], consumerDirectory);

  const typeFixturePath = join(consumerDirectory, 'verify-types.ts');
  await writeFile(
    typeFixturePath,
    `import { PerspectiveCamera } from 'three';\n` +
      `import { createIsometricOrthographicCamera, type ThreeRenderRuntimeOptions } from 'voxel/three';\n` +
      `const perspective: PerspectiveCamera = new PerspectiveCamera();\n` +
      `const orthographic = createIsometricOrthographicCamera({\n` +
      `  viewportWidth: 640, viewportHeight: 360, center: { x: 0, y: 0, z: 0 }, zoom: 1,\n` +
      `});\n` +
      `const options: ThreeRenderRuntimeOptions | undefined = undefined;\n` +
      `void perspective; void orthographic; void options;\n`,
    'utf8',
  );
  const typeConfigPath = join(consumerDirectory, 'tsconfig.json');
  await writeFile(
    typeConfigPath,
    `${JSON.stringify({
      compilerOptions: {
        lib: ['ES2022', 'DOM'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        skipLibCheck: false,
        strict: true,
        target: 'ES2022',
      },
      files: ['./verify-types.ts'],
    }, null, 2)}\n`,
    'utf8',
  );
  await runCommand(process.execPath, [TYPESCRIPT_CLI, '--project', typeConfigPath], consumerDirectory);

  const dependencyTree = await runNpm(
    ['ls', 'voxel', 'three', '--all', '--json'],
    consumerDirectory,
    npmEnvironment,
  );
  parseDependencyTree(dependencyTree.stdout);
}

async function main() {
  await assertFile(
    join(PROJECT_ROOT, 'dist', 'three', 'index.js'),
    'built voxel/three entry point',
  );
  await assertFile(join(THREE_PACKAGE_ROOT, 'package.json'), 'local Three.js package');
  await assertFile(
    join(THREE_TYPES_PACKAGE_ROOT, 'package.json'),
    'local Three.js declarations package',
  );
  await assertFile(TYPESCRIPT_CLI, 'local TypeScript compiler');

  const threeManifest = JSON.parse(
    await readFile(join(THREE_PACKAGE_ROOT, 'package.json'), 'utf8'),
  );
  if (threeManifest.name !== 'three' || threeManifest.version !== EXPECTED_THREE_VERSION) {
    throw new Error(
      `expected local three@${EXPECTED_THREE_VERSION}, found ${String(threeManifest.name)}@${String(threeManifest.version)}`,
    );
  }
  const threeTypesManifest = JSON.parse(
    await readFile(join(THREE_TYPES_PACKAGE_ROOT, 'package.json'), 'utf8'),
  );
  if (threeTypesManifest.name !== '@types/three'
    || threeTypesManifest.version !== EXPECTED_THREE_TYPES_VERSION) {
    throw new Error(
      `expected local @types/three@${EXPECTED_THREE_TYPES_VERSION}, found `
      + `${String(threeTypesManifest.name)}@${String(threeTypesManifest.version)}`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'voxel-three-package-'));
  try {
    await verifyThreePackage(temporaryRoot);
  } finally {
    await rm(temporaryRoot, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }

  console.log(
    `${LOG_PREFIX} packed voxel/three, three@${EXPECTED_THREE_VERSION}, and `
    + `@types/three@${EXPECTED_THREE_TYPES_VERSION} resolve and typecheck in one consumer`,
  );
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} verification failed`);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
