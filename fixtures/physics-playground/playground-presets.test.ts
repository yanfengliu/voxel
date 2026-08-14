import { describe, expect, it } from 'vitest';

import {
  physicsPlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  playgroundResultLineV1,
  runPlaygroundScenarioV1,
} from './playground-run.js';

/**
 * The three load presets: ten, one hundred, and five hundred falling
 * blocks. The presets exist to scale body count and report honest timing,
 * so each test prints its one-line result — max and mean step cost — and
 * fails only on physics violations, never on speed. The stress preset is
 * explicitly allowed to be slow; a silent pass would defeat its purpose.
 */

function field(suffix: 'small' | 'medium' | 'stress') {
  const sceneId = `studio:scene:physics-field-${suffix}`;
  const station = physicsPlaygroundStationV1(sceneId);
  if (!station) throw new Error(`No playground station registered for '${sceneId}'.`);
  return station;
}

describe('performance presets', () => {
  it('small: ten blocks settle cleanly', async () => {
    const station = field('small');
    expect(station.bodies.length).toBe(11);
    const result = await runPlaygroundScenarioV1(station, 'field-small-settles');
    console.log(playgroundResultLineV1(result));
    expect(result.status, playgroundResultLineV1(result)).not.toBe('fail');
  }, 120_000);

  it('medium: one hundred blocks settle cleanly', async () => {
    const station = field('medium');
    expect(station.bodies.length).toBe(101);
    const result = await runPlaygroundScenarioV1(station, 'field-medium-settles');
    console.log(playgroundResultLineV1(result));
    expect(result.status, playgroundResultLineV1(result)).not.toBe('fail');
  }, 240_000);

  it('stress: five hundred blocks stay finite and report timing', async () => {
    const station = field('stress');
    expect(station.bodies.length).toBe(501);
    const result = await runPlaygroundScenarioV1(station, 'field-stress-settles');
    console.log(playgroundResultLineV1(result));
    // The stress preset's job is honest timing, not a frame rate, and the
    // verdict no longer folds timing in: a slow step is reported in
    // `maxStepMs` and `timingNote` and leaves the status alone.
    expect(result.status, playgroundResultLineV1(result)).toBe('pass');
    expect(result.maxStepMs).toBeGreaterThan(0);
  }, 600_000);
});
