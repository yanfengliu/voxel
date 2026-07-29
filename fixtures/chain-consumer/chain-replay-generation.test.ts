import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { chainReplaySourceV1 } from './chain-replay-codegen.js';

/**
 * The committed trace has to be the one this fixture actually produces.
 *
 * Regenerate with CHAIN_REPLAY_UPDATE=1. Without it, a drifted solver, a
 * changed ring section, or an undeclared input shows up here as a diff rather
 * than as a scene that quietly plays a stale recording.
 */

const GENERATED = resolve('tools/studio/generated-chain-replay.ts');

describe('the committed chain replay', () => {
  it('matches what the fixture generates now', async () => {
    const { source, frameCount } = await chainReplaySourceV1();

    expect(frameCount).toBeGreaterThan(120);

    if (process.env.CHAIN_REPLAY_UPDATE === '1') {
      writeFileSync(GENERATED, source, 'utf8');
    }

    const committed = readFileSync(GENERATED, 'utf8');
    expect(
      committed === source,
      'the committed chain replay is stale; regenerate with CHAIN_REPLAY_UPDATE=1',
    ).toBe(true);
  }, 180_000);
});
