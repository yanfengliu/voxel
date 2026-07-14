import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[consumer-compatibility]';
const PROJECT_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_ROOT = join(PROJECT_ROOT, 'fixtures', 'compatibility');
const OUTPUT_ROOT = join(PROJECT_ROOT, 'tmp', 'consumer-compatibility');
const COMPILERS = [
  { label: 'TypeScript 5.7.3', packageName: 'typescript-5-7', version: '5.7.3' },
  { label: 'TypeScript 5.9.3', packageName: 'typescript', version: '5.9.3' },
  { label: 'TypeScript 6.0.3', packageName: 'typescript-6-0', version: '6.0.3' },
];
const CONFIGS = ['tsconfig.portable.json', 'tsconfig.city.json'];

async function requireFile(path, description) {
  try {
    if ((await stat(path)).isFile()) return;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }
  throw new Error(`${description} is missing at ${path}. Run npm run build first.`);
}

async function runNode(args, cwd = PROJECT_ROOT) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
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
    child.once('close', (code, signal) => resolve({ code, signal, stderr, stdout }));
  });
  if (result.code !== 0) {
    const status = result.code === null
      ? `signal ${result.signal ?? 'unknown'}`
      : `exit code ${String(result.code)}`;
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`node ${args.map((part) => JSON.stringify(part)).join(' ')} failed with ${status}${output ? `:\n${output}` : ''}`);
  }
}

async function compilerRecord(definition) {
  const packageRoot = join(PROJECT_ROOT, 'node_modules', definition.packageName);
  const manifestPath = join(packageRoot, 'package.json');
  const cliPath = join(packageRoot, 'bin', 'tsc');
  await requireFile(manifestPath, `${definition.label} package manifest`);
  await requireFile(cliPath, `${definition.label} compiler`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.name !== 'typescript' || manifest.version !== definition.version) {
    throw new Error(
      `${definition.label} alias resolved to ${String(manifest.name)}@${String(manifest.version)}.`,
    );
  }
  return { ...definition, cliPath };
}

async function main() {
  await requireFile(
    join(PROJECT_ROOT, 'dist', 'three', 'index.d.ts'),
    'built voxel/three declarations',
  );
  const compilers = await Promise.all(COMPILERS.map(compilerRecord));
  for (const compiler of compilers) {
    for (const config of CONFIGS) {
      await runNode([
        compiler.cliPath,
        '--project',
        join(FIXTURE_ROOT, config),
        '--pretty',
        'false',
      ]);
    }
  }

  const current = compilers.find((compiler) => compiler.version === '5.9.3');
  if (!current) throw new Error('Missing current TypeScript compiler fixture.');
  await rm(OUTPUT_ROOT, { force: true, recursive: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });
  try {
    await runNode([
      current.cliPath,
      '--project',
      join(FIXTURE_ROOT, 'tsconfig.city.json'),
      '--noEmit',
      'false',
      '--outDir',
      OUTPUT_ROOT,
      '--rootDir',
      FIXTURE_ROOT,
      '--sourceMap',
      'false',
    ]);
    await runNode([join(OUTPUT_ROOT, 'city-shaped-consumer.js')]);
  } finally {
    await rm(OUTPUT_ROOT, {
      force: true,
      maxRetries: 3,
      recursive: true,
      retryDelay: 100,
    });
  }

  console.log(
    `${LOG_PREFIX} portable and City-shaped declarations passed TypeScript 5.7.3, 5.9.3, and 6.0.3; the City sparse embedded-host lane executed`,
  );
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} verification failed`);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
