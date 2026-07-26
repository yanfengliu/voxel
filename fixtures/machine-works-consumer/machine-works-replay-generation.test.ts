import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { MACHINE_WORKS_POSE_REPLAY } from '../../tools/studio/generated-machine-works-replay.js';
import { sampleValidatedScenePoseReplayV1 } from '../../tools/studio/scene-pose-replay.js';
import { machineWorksReplaySourceV1 } from './machine-works-replay-codegen.js';
import { simulateMachineWorksV1 } from './machine-works-simulation.js';

const OUTPUT_URL = new URL(
  '../../tools/studio/generated-machine-works-replay.ts',
  import.meta.url,
);

function nextRepresentableNumberBelow(value: number): number {
  const float = new Float64Array([value]);
  const bits = new BigUint64Array(float.buffer);
  bits[0] = bits[0]! - 1n;
  return float[0]!;
}

describe('Machine Works committed replay', () => {
  it('is byte-for-byte generated from the deterministic consumer trace', async () => {
    const generated = machineWorksReplaySourceV1(await simulateMachineWorksV1());
    if (process.env.UPDATE_MACHINE_WORKS_REPLAY === '1') {
      writeFileSync(fileURLToPath(OUTPUT_URL), generated);
    }
    expect(readFileSync(OUTPUT_URL, 'utf8')).toBe(generated);
  });

  it.skipIf(process.env.UPDATE_MACHINE_WORKS_REPLAY === '1')(
    'presents every event at its natural fixed-tick boundary and not one number before',
    async () => {
      const trace = await simulateMachineWorksV1();
      const naturalEventTimes = trace.events.map((event) => event.tick * trace.fixedStepMs);
      expect(MACHINE_WORKS_POSE_REPLAY.events.map((event) => event.timeMs))
        .toEqual(naturalEventTimes);

      trace.events.forEach((sourceEvent, index) => {
        const event = MACHINE_WORKS_POSE_REPLAY.events[index]!;
        const naturalTimeMs = naturalEventTimes[index]!;
        const atBoundary = sampleValidatedScenePoseReplayV1(
          MACHINE_WORKS_POSE_REPLAY,
          naturalTimeMs,
        );
        const immediatelyBefore = sampleValidatedScenePoseReplayV1(
          MACHINE_WORKS_POSE_REPLAY,
          nextRepresentableNumberBelow(naturalTimeMs),
        );

        expect(atBoundary.frameA).toBe(sourceEvent.tick);
        expect(atBoundary.eventsThroughTime.at(-1)).toBe(event);
        expect(immediatelyBefore.eventsThroughTime).not.toContain(event);
      });
    },
  );
});
