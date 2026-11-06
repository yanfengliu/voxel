import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The oak HUD's vendored font is the exact file `docs/architecture/supply-chain.md`
 * records, with its licence beside it. `test:supply-chain` walks npm packages
 * only, so this is the check that holds that record's numbers.
 *
 * Bound: the bytes and the licence file. Which face Chromium draws the HUD
 * with is `tests/browser/oak-ecosystem-font.spec.ts`'s job.
 */
const FONT_DIRECTORY = resolve('fixtures/oak-ecosystem-consumer/fonts');
const FONT_FILE = 'SourceSans3VF-Upright.woff2';
/**
 * Adobe's release tag 3.052R, `WOFF2/VF/SourceSans3VF-Upright.ttf.woff2`: Git
 * blob `96cc9fd06ceb275ec3d6103ad97c5647212c88c5` there and here.
 */
const FONT_SHA256 = '5f16566f7a40d39b339ad26be151fa5a1ab1f0c2574c7a2e619765584a1acbd8';
const FONT_BYTES = 170_188;

describe('the oak HUD font', () => {
  it('is the recorded Source Sans 3 release file, unmodified', () => {
    const font = readFileSync(resolve(FONT_DIRECTORY, FONT_FILE));
    expect(font.length).toBe(FONT_BYTES);
    expect(createHash('sha256').update(font).digest('hex')).toBe(FONT_SHA256);
  });

  it('ships beside its SIL Open Font License and Adobe notice', () => {
    const licence = readFileSync(resolve(FONT_DIRECTORY, 'OFL.txt'), 'utf8');
    expect(licence).toContain(
      '© 2023 Adobe (http://www.adobe.com/), with Reserved Font Name ‘Source’.',
    );
    expect(licence).toContain('SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007');
  });

  it('is the only font in its folder', () => {
    expect(readdirSync(FONT_DIRECTORY).sort()).toEqual(['OFL.txt', FONT_FILE]);
  });
});
