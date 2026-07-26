import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

function sha256Bytes(body) {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Owns source identity and immutable-worktree handling for repository-local
 * browser benchmarks. Clean runs come from the captured commit, while dirty
 * no-write trials get a one-time working-copy snapshot.
 */
export function createBenchmarkSourceSeal({ projectRoot, sourceFiles }) {
  function runGit(args, encoding, extraEnvironment = {}) {
    const result = spawnSync(
      'git',
      ['-c', `safe.directory=${projectRoot.replaceAll('\\', '/')}`, ...args],
      {
        cwd: projectRoot,
        encoding,
        env: { ...process.env, ...extraEnvironment },
        maxBuffer: 64 * 1_024 * 1_024,
      },
    );
    if (result.status !== 0) {
      const stderr = Buffer.isBuffer(result.stderr)
        ? result.stderr.toString('utf8').trim()
        : String(result.stderr ?? '').trim();
      throw new Error(
        `Benchmark source sealing could not run 'git ${args.join(' ')}' `
        + `(exit ${String(result.status)}). ${stderr || 'Git returned no diagnostic.'}`,
      );
    }
    return result.stdout;
  }

  function gitText(args) {
    return String(runGit(args, 'utf8')).trim();
  }

  function gitBytes(args) {
    const stdout = runGit(args, 'buffer');
    if (!Buffer.isBuffer(stdout)) {
      throw new Error(`Git returned non-binary output for 'git ${args.join(' ')}'.`);
    }
    return stdout;
  }

  async function sha256(relativePath, root = projectRoot) {
    return sha256Bytes(await readFile(join(root, relativePath)));
  }

  function nullSeparatedGitList(args) {
    return gitBytes(args)
      .toString('utf8')
      .split('\0')
      .filter((entry) => entry.length > 0);
  }

  function assertRepositoryRelativePath(relativePath) {
    const normalized = relativePath.replaceAll('\\', '/');
    if (normalized.startsWith('/')
      || /^[A-Za-z]:\//.test(normalized)
      || normalized.split('/').includes('..')) {
      throw new Error(
        `Benchmark source sealing refused unsafe repository path '${relativePath}'.`,
      );
    }
  }

  async function capture() {
    const status = gitBytes(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const patch = gitBytes(['diff', '--binary', 'HEAD', '--']);
    const untrackedList = nullSeparatedGitList([
      'ls-files',
      '--others',
      '--exclude-standard',
      '-z',
    ]).sort();
    const [sourceEntries, untrackedEntries] = await Promise.all([
      Promise.all(
        Object.entries(sourceFiles).map(async ([name, relativePath]) => [
          name,
          await sha256(relativePath),
        ]),
      ),
      Promise.all(
        untrackedList.map(async (relativePath) => [relativePath, await sha256(relativePath)]),
      ),
    ]);
    return Object.freeze({
      commit: gitText(['rev-parse', 'HEAD']),
      commitTree: gitText(['rev-parse', 'HEAD^{tree}']),
      worktreeClean: status.length === 0,
      worktreeStatusSha256: sha256Bytes(status),
      worktreePatchSha256: sha256Bytes(patch),
      untrackedFileSha256: Object.freeze(Object.fromEntries(untrackedEntries)),
      sourceSha256: Object.freeze(Object.fromEntries(sourceEntries)),
    });
  }

  function assertUnchanged(initial, final) {
    if (JSON.stringify(final) === JSON.stringify(initial)) return;
    const changed = [];
    if (final.commit !== initial.commit) changed.push('HEAD');
    if (final.commitTree !== initial.commitTree) changed.push('HEAD tree');
    if (final.worktreeStatusSha256 !== initial.worktreeStatusSha256) {
      changed.push('worktree paths/status');
    }
    if (final.worktreePatchSha256 !== initial.worktreePatchSha256) {
      changed.push('tracked file contents');
    }
    if (JSON.stringify(final.untrackedFileSha256)
      !== JSON.stringify(initial.untrackedFileSha256)) {
      changed.push('untracked file contents');
    }
    if (JSON.stringify(final.sourceSha256) !== JSON.stringify(initial.sourceSha256)) {
      changed.push('benchmark source files');
    }
    throw new Error(
      `Benchmark source identity changed during measurement (${changed.join(', ') || 'unknown drift'}). `
      + 'Discard this run and retry without concurrent edits or commits.',
    );
  }

  async function verifySnapshotSources(snapshotRoot, sourceIdentity) {
    const entries = await Promise.all(
      Object.entries(sourceFiles).map(async ([name, relativePath]) => [
        name,
        await sha256(relativePath, snapshotRoot),
      ]),
    );
    const snapshotHashes = Object.fromEntries(entries);
    if (JSON.stringify(snapshotHashes) === JSON.stringify(sourceIdentity.sourceSha256)) return;
    const changed = Object.keys(sourceFiles).filter(
      (name) => snapshotHashes[name] !== sourceIdentity.sourceSha256[name],
    );
    throw new Error(
      `The sealed benchmark snapshot did not match the captured source identity for `
      + `${changed.join(', ') || 'an unknown source file'}. Discard this run and retry without `
      + 'concurrent source changes.',
    );
  }

  async function seal(sourceIdentity) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'voxel-benchmark-source-'));
    const snapshotRoot = join(temporaryRoot, 'source');
    await mkdir(snapshotRoot, { recursive: true });
    try {
      let kind;
      if (sourceIdentity.worktreeClean) {
        const isolatedIndex = join(temporaryRoot, 'git-index');
        const environment = { GIT_INDEX_FILE: isolatedIndex };
        runGit(['read-tree', sourceIdentity.commit], 'utf8', environment);
        const prefix = `${snapshotRoot.replaceAll('\\', '/')}/`;
        runGit(
          ['checkout-index', '--all', '--force', `--prefix=${prefix}`],
          'utf8',
          environment,
        );
        kind = 'sealed-commit-checkout';
      } else {
        const paths = [
          ...nullSeparatedGitList(['ls-files', '-z']),
          ...nullSeparatedGitList(['ls-files', '--others', '--exclude-standard', '-z']),
        ];
        for (const relativePath of new Set(paths)) {
          assertRepositoryRelativePath(relativePath);
          const source = join(projectRoot, relativePath);
          const destination = join(snapshotRoot, relativePath);
          try {
            await mkdir(dirname(destination), { recursive: true });
            await copyFile(source, destination);
          } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
              continue;
            }
            throw error;
          }
        }
        kind = 'sealed-dirty-working-copy';
      }
      await verifySnapshotSources(snapshotRoot, sourceIdentity);
      return Object.freeze({ kind, root: snapshotRoot, temporaryRoot });
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw new Error('Benchmark could not create and verify its sealed source snapshot.', {
        cause: error,
      });
    }
  }

  return Object.freeze({ capture, assertUnchanged, seal });
}
