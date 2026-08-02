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
import { riverfallFluidWarmStateSourceV1 } from './riverfall-warm-state-codegen.js';
import {
  reconstructRiverfallFluidSurfaceV1,
} from './riverfall-fluid-surface.js';

const OUTPUT_URL = new URL(
  '../../tools/studio/generated-riverfall-fluid-replay.ts',
  import.meta.url,
);
const WARM_STATE_OUTPUT_URL = new URL(
  '../../tools/studio/generated-riverfall-fluid-warm-state.ts',
  import.meta.url,
);
const UPDATE = process.env.UPDATE_RIVERFALL_FLUID_REPLAY === '1';
const OUTPUT_EXISTS = existsSync(fileURLToPath(OUTPUT_URL));
const WARM_STATE_OUTPUT_EXISTS = existsSync(fileURLToPath(WARM_STATE_OUTPUT_URL));

describe('Riverfall committed fluid replay', () => {
  it(
    'is byte-for-byte generated from the deterministic fluid trace',
    () => {
      // A missing generated file fails here rather than skipping: a pin that
      // turns itself off reports green for the exact loss it exists to catch.
      // Its three sibling generation suites fail the same way.
      const missing = [
        ...(OUTPUT_EXISTS ? [] : [fileURLToPath(OUTPUT_URL)]),
        ...(WARM_STATE_OUTPUT_EXISTS ? [] : [fileURLToPath(WARM_STATE_OUTPUT_URL)]),
      ];
      expect(
        missing.length === 0 || UPDATE,
        `${missing.join(' and ')} is missing, so this determinism pin has nothing to `
        + 'compare against. Regenerate with UPDATE_RIVERFALL_FLUID_REPLAY=1.',
      ).toBe(true);
      const evidence = simulateRiverfallFluidEvidenceV1();
      const generated = riverfallFluidReplaySourceV1(
        reconstructRiverfallFluidSurfaceV1(evidence),
      );
      const generatedWarmState = riverfallFluidWarmStateSourceV1(evidence);
      if (UPDATE) {
        writeFileSync(fileURLToPath(OUTPUT_URL), generated);
        writeFileSync(fileURLToPath(WARM_STATE_OUTPUT_URL), generatedWarmState);
      }
      expect(readFileSync(OUTPUT_URL, 'utf8')).toBe(generated);
      expect(readFileSync(WARM_STATE_OUTPUT_URL, 'utf8')).toBe(generatedWarmState);
    },
    // Sized against the work this test does, not against whatever else the
    // suite is running: it burns the fluid in for 3,200 substeps, records 240
    // frames of 576 particles through five substeps each, reconstructs 321
    // tiles per frame, and then compares a five-megabyte string. Standalone
    // that is about fifty seconds, and the old sixty-second budget expired
    // under a full run — which reads as a determinism failure and is not one.
    600_000,
  );
});
