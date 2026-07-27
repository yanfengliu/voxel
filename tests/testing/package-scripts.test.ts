import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface PackageManifest {
  readonly scripts?: Record<string, string>;
}

describe('package scripts', () => {
  it('builds before dist-consuming tests in the complete verification gate', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as PackageManifest;
    const verifyScript = manifest.scripts?.verify;

    expect(
      verifyScript,
      'package.json must define a verify script that builds before running tests',
    ).toBeTypeOf('string');

    const steps = verifyScript?.split(/\s*&&\s*/u) ?? [];
    expect(
      steps[0],
      'npm run verify must build first because the mesher benchmark harness imports dist modules',
    ).toBe('npm run build');
    expect(steps).toContain('npm run test');
  });
});
