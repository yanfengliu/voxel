import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  simulateRiverfallFluidEvidenceV1,
} from './riverfall-fluid-evidence.js';
import { riverfallFluidReplaySourceV1 } from './riverfall-replay-codegen.js';
import {
  reconstructRiverfallFluidSurfaceV1,
} from './riverfall-fluid-surface.js';

const OUTPUT_URL = new URL(
  '../../tools/studio/generated-riverfall-fluid-replay.ts',
  import.meta.url,
);
const UPDATE = process.env.UPDATE_RIVERFALL_FLUID_REPLAY === '1';
const OUTPUT_EXISTS = existsSync(fileURLToPath(OUTPUT_URL));

describe('Riverfall committed fluid replay', () => {
  it(
    'is byte-for-byte generated from the deterministic fluid trace',
    () => {
      // A missing generated file fails here rather than skipping: a pin that
      // turns itself off reports green for the exact loss it exists to catch.
      // Its three sibling generation suites fail the same way.
      expect(
        OUTPUT_EXISTS || UPDATE,
        `${fileURLToPath(OUTPUT_URL)} is missing, so this determinism pin has nothing to `
        + 'compare against. Regenerate it with UPDATE_RIVERFALL_FLUID_REPLAY=1.',
      ).toBe(true);
      const generated = riverfallFluidReplaySourceV1(
        reconstructRiverfallFluidSurfaceV1(
          simulateRiverfallFluidEvidenceV1(),
        ),
      );
      if (UPDATE) writeFileSync(fileURLToPath(OUTPUT_URL), generated);
      expect(readFileSync(OUTPUT_URL, 'utf8')).toBe(generated);
    },
    60_000,
  );
});
