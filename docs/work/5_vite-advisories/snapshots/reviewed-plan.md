# Clear the five vite advisories that block verify

Status: active
Owner: vitebump (worker of the met coordinator)
Created: 2026-10-31
Updated: 2026-10-31

## Problem and outcome

`npm run verify` fails on origin/main 7a93bae at `test:supply-chain` with "full audit reports blocking findings: vite (high)". The tree did not change: five advisories published on 2026-10-20 and 2026-10-21 cover `vite` 8.0.0 to 8.1.5, and voxel pins `vite` exactly at 8.1.4. They are GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm (high), GHSA-9jrq-w75r-8gcw and GHSA-rq7h-c2jc-7f22. Every voxel commit's gate is blocked until this is fixed.

The outcome: `vite` pinned exactly at the lowest release that clears all five, both audits free of high and critical findings, and `npm run verify` green.

## Scope

In scope: the `vite` pin in `package.json`, its `package-lock.json` entry, the `vite` row and an audit note in [the supply-chain record](../../architecture/supply-chain.md), this work unit and a devlog line. The two consumers that link voxel by `file:../voxel`, aoe2 and city, are checked read-only: a detached worktree of each from origin/main, linked to this voxel, runs its build and unit tests, and nothing is committed there.

Out of scope: the 13 moderate full-audit findings, which do not block (GHSA-82fw-gwwq-j7x9 and GHSA-qxg6-89mg-rqv8 against `@vitest/mocker`, GHSA-g3hv-75wg-m249 against `minimatch`); the consumers' own `vite` pins (aoe2 `^6.4.3`, city `^8.1.2`), which are named in the outcome and not changed; `vite` 8.2 and 8.3.

## Approach

Each advisory's GitHub record lists 8.1.6 as the first patched release for the range `>= 8.0.0, <= 8.1.5`. The later lines are patched in 8.2.4 and 8.3.3. So 8.1.6 is the lowest release that clears all five, and it is a patch release on the line voxel already uses. `npm audit fix --force` would install 8.3.5, the newest release, which is two minor versions past what the fix needs.

`vite` 8.1.6 was published on 2026-10-06, 24 days before this change. It asks for `postcss` `^8.5.17` and `rolldown` `~1.1.5` instead of `^8.5.16` and `~1.1.4`. The lockfile already holds `postcss` 8.5.23 and `rolldown` 1.1.5, so only the `vite` entry changes. Its Node range, `^20.19.0 || >=22.12.0`, is the same as 8.1.4's.

voxel's `build` script is `tsc -p tsconfig.build.json`, and voxel has no runtime dependencies. `vite` runs only as voxel's development server (Studio, the oak fixture, the servers the browser specs start) and inside `vitest`. The consumers bundle voxel's `dist` with their own `vite`.

## Acceptance criteria

- `package.json` pins `vite` exactly at 8.1.6. The lockfile diff changes only the `vite` entry and the root's `vite` line (git diff).
- `npm ci` from the new lockfile installs `vite` 8.1.6, deduped under `vitest` (`npm ls vite`).
- `npm audit --omit=dev --audit-level=high` and `npm audit --audit-level=high` both exit 0, with no high or critical finding, and `npm run test:supply-chain` passes.
- `npm run verify` passes in this worktree.
- aoe2 and city, each from origin/main and linked to this voxel, pass their build and unit tests, and commit nothing.
- One review round with both lanes of the fleet runbook, its blocking and should-fix findings resolved.
- The change lands on main as its own commit, a fast-forward push, and remote CI is followed to completion.

## Implementation steps

- Reproduce the failing gate and record both audits before the bump.
- Read each advisory's patched range and pick the lowest release that clears all five.
- Bump with `npm install --save-exact vite@8.1.6`, reinstall with `npm ci`, rerun both audits and `npm run verify`.
- Check aoe2 and city from origin/main, linked to this voxel, read-only.
- Run one review round with both lanes and resolve its findings.
- Merge origin/main, rerun `npm run verify`, push as a fast-forward, follow CI, fast-forward the primary checkout only if it is clean on main, and remove the worktrees and the branch.

## Outcome

Pending.
