# Verification record

## Producer checkpoint, 2026-11-07

The eight producer paths in review 1 retained their reviewed SHA256 hashes. The isolated branch incorporated c5be6e2's documentation-only canon update; no reviewed runtime or test source changed.

`npm run verify` exited 0 in 1,248.32 seconds. Build, unit tests, typecheck, lint, three-version consumer compatibility, public-API verification/self-tests, core-only package, mesh-worker package, Three package and supply-chain checks passed. Unit results were 2,438 passed and one skipped across 302 passed files and one skipped file. All 137 browser tests passed in 14.0 minutes. The headroom reporter's largest budget consumption was 23% (75.0 seconds of 332); Oak milestone compositions used 139.5 of 687 seconds and growth used 36.8 of 214 seconds.

The unchanged Playwright configuration used its required SwiftShader reference backend and installed Chromium 1217. The command ran headlessly under a task-owned Windows JobObject. The runner's final result recorded exit_code 0, cleanup_proof true, no errors and no members before or after cleanup. A later PID census found no retained gate process; a reused historical PID belonged to the new census shell and was not terminated.

Local raw evidence: output/shared-renderer-20261107/voxel/output/full-verify/{result.json,stdout.log,stderr.log}. This is local acceptance, not a claim about hosted CI.

Producer targeted evidence preceding the complete gate included 41 numerical/runtime tests, TypeScript 5.7.3/5.9.3/6.0.3 consumer checks, packed Three consumption and isolated source-package install/compile/bundle/execution. The source package has no dependencies or peers. No renderer speed improvement was measured or claimed.

## Consumer checkpoint

Review 2 binds the original shared-source implementation; review 4 separately binds the minimal lock prerequisite. The real GPU regression first failed against the original Townscaper shader, then passed the shared functions with 1,152 samples in nine cases; a non-finite fault control failed as intended. The initial 168-view native sweep and all 168 native image inspections completed, as did actual startup controls. Final producer pin, repaired-dependency repeat, stale-reference control, full consumer gates and integration acceptance remain pending.
