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
  it.skipIf(!OUTPUT_EXISTS && !UPDATE)(
    'is byte-for-byte generated from the deterministic fluid trace',
    () => {
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
