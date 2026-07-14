import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { chromium } from '@playwright/test';
import { build } from 'vite';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_PACKED_WORKER_CLOSURE_GZIP_BYTES = 120_000;
const BROWSER_MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
});
const OFFLINE_ENVIRONMENT = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_ignore_scripts: 'true',
  npm_config_offline: 'true',
  npm_config_update_notifier: 'false',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function moduleSpecifiers(source) {
  const result = [];
  const staticPattern = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
  const dynamicPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/gu;
  for (const pattern of [staticPattern, dynamicPattern]) {
    let match;
    while ((match = pattern.exec(source)) !== null) result.push(match[1]);
  }
  return result;
}

async function packedWorkerClosure(entryPath) {
  const root = resolve(dirname(entryPath), '..');
  const pending = [entryPath];
  const visited = new Map();
  while (pending.length > 0) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    const source = await readFile(path);
    visited.set(path, source);
    for (const specifier of moduleSpecifiers(source.toString('utf8'))) {
      if (!specifier.startsWith('.')) {
        throw new Error(`packed worker closure imports external module ${specifier}`);
      }
      const dependency = resolve(dirname(path), specifier);
      if (!dependency.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`)) {
        throw new Error(`packed worker closure escapes dist: ${specifier}`);
      }
      const relativeDependency = dependency.slice(root.length + 1).replaceAll('\\', '/');
      if (relativeDependency.startsWith('three/')) {
        throw new Error(`packed worker closure imports Three adapter module ${specifier}`);
      }
      if (!(await isFile(dependency))) {
        throw new Error(`packed worker dependency is missing: ${dependency}`);
      }
      pending.push(dependency);
    }
  }
  const ordered = [...visited].sort(([left], [right]) => left.localeCompare(right));
  const parts = ordered.flatMap(([path, source]) => [
    Buffer.from(`${path.slice(root.length + 1).replaceAll('\\', '/')}\0`),
    source,
  ]);
  const combined = Buffer.concat(parts);
  return Object.freeze({
    moduleCount: ordered.length,
    unpackedBytes: combined.byteLength,
    gzipBytes: gzipSync(combined, { level: 9 }).byteLength,
  });
}

function packedBrowserConsumerSource() {
  return `import {
  GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
  MESHER_INPUT_SCHEMA_V1,
  prepareMeshWorkerRequestV1,
  validateMeshWorkerResultV1,
} from 'voxel/meshing';
import { startBrowserMeshWorkerV1 } from 'voxel/meshing/browser-worker';

window.runPackedWorkerEvidence = async () => {
  const sample = new Uint16Array(27);
  sample[13] = 1;
  const input = {
    schemaVersion: MESHER_INPUT_SCHEMA_V1,
    mesherId: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.id,
    mesherVersion: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.version,
    dependencySignature: 'packed-browser:solid-one-voxel',
    source: {
      coordinate: { x: 2, y: -3, z: 4 },
      slotGeneration: 5,
      key: 'packed-browser-source',
      incarnation: 1,
      sourceRevision: 9,
      size: { x: 1, y: 1, z: 1 },
    },
    dependencies: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.dependencyOffsets.map((offset) => ({
      state: 'missing', offset, slotGeneration: 0, missingNeighbor: 'empty',
    })),
    missingNeighbor: 'empty',
    paletteEntryCount: 2,
    materialEntryCount: 0,
    sampleVolume: sample,
    outputBudget: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1.limits.output,
  };
  const prepared = prepareMeshWorkerRequestV1({
    jobId: 'packed-browser-job',
    groupId: 'packed-browser-group',
    worldId: 'packed-browser-world',
    epoch: 'packed-browser-epoch',
    targetRevision: 10,
    pipelineGeneration: 3,
    descriptor: GREEDY_OPAQUE_MESHER_DESCRIPTOR_V1,
    input,
  });
  const startup = startBrowserMeshWorkerV1();
  if (startup.status !== 'started') throw new Error(startup.message);
  const worker = startup.handle;
  try {
    const message = await new Promise((resolveMessage, rejectMessage) => {
      const timeout = setTimeout(() => rejectMessage(new Error('packed worker timed out')), 10_000);
      worker.addEventListener('message', (event) => {
        clearTimeout(timeout);
        resolveMessage(event.data);
      }, { once: true });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        clearTimeout(timeout);
        rejectMessage(new Error(event.message));
      }, { once: true });
      worker.postMessage(prepared.request, [...prepared.transfer]);
    });
    const validation = validateMeshWorkerResultV1(message, prepared.expectation);
    if (!validation.ok) throw new Error(validation.issue.message);
    if (validation.value.status !== 'completed') throw new Error(validation.value.status);
    return {
      exposedUnitFaceCount: validation.value.output.counts.exposedUnitFaceCount,
      vertexCount: validation.value.output.counts.vertexCount,
      indexCount: validation.value.output.counts.indexCount,
    };
  } finally {
    worker.terminate();
  }
};
`;
}

async function startStaticServer(root) {
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const requestPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
        .replace(/^\/+/, '');
      const filePath = resolve(root, requestPath);
      const relativePath = relative(root, filePath);
      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      try {
        const body = await readFile(filePath);
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'",
          'Content-Type': BROWSER_MIME_TYPES[extname(filePath)] ?? 'application/octet-stream',
        });
        response.end(body);
      } catch {
        response.writeHead(404).end('Not found');
      }
    })();
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not bind a port.');
  return Object.freeze({
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => error ? rejectClose(error) : resolveClose());
      });
    },
  });
}

async function verifyPackedBrowserWorker(consumerDirectory) {
  const sourceDirectory = join(consumerDirectory, 'src');
  await mkdir(sourceDirectory);
  await writeFile(join(consumerDirectory, 'index.html'),
    '<!doctype html><html><body><script type="module" src="/src/main.js"></script></body></html>\n');
  await writeFile(join(sourceDirectory, 'main.js'), packedBrowserConsumerSource());
  await build({
    root: consumerDirectory,
    logLevel: 'silent',
    build: { emptyOutDir: true, outDir: 'browser-dist' },
  });
  const server = await startStaticServer(join(consumerDirectory, 'browser-dist'));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const failures = [];
    const requestedPaths = [];
    page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
    page.on('pageerror', (error) => { failures.push(error.message); });
    page.on('requestfailed', (request) => { failures.push(request.url()); });
    page.on('request', (request) => { requestedPaths.push(new URL(request.url()).pathname); });
    const navigation = await page.goto(server.origin, { waitUntil: 'load' });
    if (!navigation?.ok()) throw new Error('Packed browser consumer failed to load.');
    await page.waitForFunction(() => typeof window.runPackedWorkerEvidence === 'function');
    const evidence = await page.evaluate(() => window.runPackedWorkerEvidence());
    if (evidence.exposedUnitFaceCount !== 6
      || evidence.vertexCount !== 24
      || evidence.indexCount !== 36) {
      throw new Error(`Bundled worker returned unexpected geometry: ${JSON.stringify(evidence)}`);
    }
    if (failures.length > 0) throw new Error(`Packed browser errors:\n${failures.join('\n')}`);
    const workerPath = requestedPaths.find((path) => /\/assets\/.*worker.*\.js$/u.test(path));
    if (!workerPath) {
      throw new Error(`Packed browser did not request a worker asset: ${requestedPaths.join(', ')}`);
    }
    return workerPath;
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function npmCommand() {
  if (process.env.npm_execpath) return [process.execPath, [process.env.npm_execpath]];
  if (process.platform === 'win32') {
    for (const rawDirectory of (process.env.PATH ?? '').split(delimiter)) {
      const directory = rawDirectory.replace(/^"|"$/g, '');
      if (!directory) continue;
      const cli = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (await isFile(cli)) return [process.execPath, [cli]];
    }
  }
  return ['npm', []];
}

async function run(command, args, cwd, environment = OFFLINE_ENVIRONMENT) {
  const result = await new Promise((resolveResult, reject) => {
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
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolveResult({ code, stderr, stdout }));
  });
  if (result.code !== 0) {
    throw new Error(
      `${JSON.stringify(command)} failed with ${String(result.code)}:\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout;
}

async function runNpm(args, cwd, environment) {
  const [command, prefix] = await npmCommand();
  return run(command, [...prefix, ...args], cwd, environment);
}

function packedTarball(stdout, directory) {
  const manifest = JSON.parse(stdout);
  if (!Array.isArray(manifest) || manifest.length !== 1
    || typeof manifest[0]?.filename !== 'string') {
    throw new Error(`npm pack returned an unexpected manifest:\n${stdout}`);
  }
  const path = resolve(directory, manifest[0].filename);
  if (dirname(path) !== resolve(directory)) throw new Error('npm pack returned an unsafe path.');
  return path;
}

async function verify(root) {
  const packDirectory = join(root, 'pack');
  const consumerDirectory = join(root, 'consumer');
  const cacheDirectory = join(root, 'npm-cache');
  await mkdir(packDirectory);
  await mkdir(consumerDirectory);
  await mkdir(cacheDirectory);
  const environment = { ...OFFLINE_ENVIRONMENT, npm_config_cache: cacheDirectory };
  const packOutput = await runNpm([
    'pack',
    '--json',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--pack-destination',
    packDirectory,
  ], PROJECT_ROOT, environment);
  const tarball = packedTarball(packOutput, packDirectory);
  if (!(await isFile(tarball))) throw new Error('Packed voxel tarball is missing.');
  await writeFile(join(consumerDirectory, 'package.json'), `${JSON.stringify({
    name: 'voxel-mesh-worker-package-fixture',
    private: true,
    type: 'module',
  }, null, 2)}\n`);
  await runNpm([
    'install',
    tarball,
    '--offline',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--omit=optional',
    '--package-lock=false',
    '--no-save',
  ], consumerDirectory, environment);
  const probe = join(consumerDirectory, 'verify-worker.mjs');
  await writeFile(probe,
    `import { readFile, stat } from 'node:fs/promises';\n` +
    `import { fileURLToPath } from 'node:url';\n` +
    `import { resolveMeshWorkerModuleUrlV1 } from 'voxel/meshing';\n` +
    `const moduleUrl = resolveMeshWorkerModuleUrlV1();\n` +
    `if (moduleUrl.startsWith('blob:') || moduleUrl.startsWith('data:')) {\n` +
    `  throw new Error('worker resolver returned a CSP-incompatible generated URL');\n` +
    `}\n` +
    `const path = fileURLToPath(moduleUrl);\n` +
    `if (!(await stat(path)).isFile() || !path.endsWith('/dist/meshing/mesh-worker-entry.js'.replaceAll('/', process.platform === 'win32' ? '\\\\' : '/'))) {\n` +
    `  throw new Error(\`worker did not resolve inside the installed artifact: \${path}\`);\n` +
    `}\n` +
    `const entry = await import(moduleUrl);\n` +
    `if (entry.meshWorkerEntrySchemaV1 !== 'voxel.mesh-worker-entry/1') {\n` +
    `  throw new Error('packed worker entry has the wrong schema marker');\n` +
    `}\n` +
    `const manifest = JSON.parse(await readFile(new URL('../../package.json', moduleUrl), 'utf8'));\n` +
    `if (!Array.isArray(manifest.sideEffects) || !manifest.sideEffects.includes('./dist/meshing/mesh-worker-entry.js')) {\n` +
    `  throw new Error('packed worker entry is not preserved as a side-effectful module');\n` +
    `}\n`,
  );
  await run(process.execPath, [probe], consumerDirectory, environment);
  const installedEntry = resolve(
    consumerDirectory,
    'node_modules',
    'voxel',
    'dist',
    'meshing',
    'mesh-worker-entry.js',
  );
  const closure = await packedWorkerClosure(installedEntry);
  if (closure.gzipBytes > MAX_PACKED_WORKER_CLOSURE_GZIP_BYTES) {
    throw new Error(
      `packed worker closure is ${String(closure.gzipBytes)} gzip bytes; `
      + `maximum is ${String(MAX_PACKED_WORKER_CLOSURE_GZIP_BYTES)}`,
    );
  }
  const browserWorkerPath = await verifyPackedBrowserWorker(consumerDirectory);
  return Object.freeze({ ...closure, browserWorkerPath });
}

if (!(await isFile(join(PROJECT_ROOT, 'dist', 'meshing', 'mesh-worker-entry.js')))) {
  throw new Error('Built mesh worker entry is missing. Run npm run build first.');
}

const root = await mkdtemp(join(tmpdir(), 'voxel-mesh-worker-'));
try {
  const closure = await verify(root);
  console.log(
    '[mesh-worker-package] packed worker resolves and imports offline without Three.js; '
    + `${String(closure.moduleCount)} modules, ${String(closure.unpackedBytes)} bytes, `
    + `${String(closure.gzipBytes)} gzip bytes; Vite browser asset ${closure.browserWorkerPath}`,
  );
} finally {
  await rm(root, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
}
