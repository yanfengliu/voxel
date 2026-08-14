import { solverTicksForSecondsV1 } from '../../tools/studio/solver-rate.js';
import { expect } from 'vitest';
import {
  evaluatePlaygroundScenarioV1,
  type PlaygroundFrameV1,
  type PlaygroundScenarioResultV1,
} from '../../tools/studio/physics-playground-checks.js';
import type {
  PlaygroundActionV1,
  PlaygroundScenarioV1,
  PlaygroundStationV1,
} from '../../tools/studio/physics-playground-stations.js';
import {
  initPlaygroundRapierV1,
  PlaygroundWorldV1,
} from './playground-world.js';

/**
 * The deterministic scenario runner.
 *
 * One scenario is one fresh world advanced for a declared span of seconds,
 * with its case's scripted actions applied at their declared seconds. Frames
 * are sampled at a fixed interval in time and judged by the shared checks, so
 * two runs of the same scenario see the same world at the same instants — wall
 * clocks never influence the simulation, only the timing report.
 */

/**
 * How often the runner looks at the world, in seconds.
 *
 * In seconds rather than ticks, and the distinction is not pedantry. This was
 * a stride of 8 ticks, described as "30 Hz sampling of a 240 Hz world" — true
 * only at 240 Hz. Moving the lane to 60 Hz turned it into 7.5 Hz sampling
 * without a line changing, and the checks went on reporting as though nothing
 * had. It made a resting body look 25 times more buried than it is (a sampled
 * instant of a landing, 0.05 m, against a true resting depth of 0.0013 m), it
 * made a touch-down comparison quantise to 11% steps against a 4% gate, and it
 * hid a real fivefold rise in solver energy injection behind gaps wide enough
 * to swallow it.
 *
 * A sampler that changes what it measures when the rate moves is not a
 * sampler, it is a second variable.
 */
export const PLAYGROUND_SNAPSHOT_INTERVAL_SECONDS_V1 = 1 / 30;

/** Whole ticks between snapshots at the one shared rate. */
export const PLAYGROUND_SNAPSHOT_STRIDE_V1 = Math.max(
  1,
  solverTicksForSecondsV1(PLAYGROUND_SNAPSHOT_INTERVAL_SECONDS_V1),
);

export interface PlaygroundRunOptionsV1 {
  /** Wall-clock sampler for the timing report; injectable for tests. */
  readonly now?: () => number;
}

function stationScenario(
  station: PlaygroundStationV1,
  scenarioId: string,
): PlaygroundScenarioV1 {
  const scenario = station.scenarios.find((entry) => entry.id === scenarioId);
  if (!scenario) {
    throw new Error(
      `Station '${station.sceneId}' has no scenario '${scenarioId}'. Its `
      + `scenarios are: ${station.scenarios.map((entry) => entry.id).join(', ')}.`,
    );
  }
  return scenario;
}

function scenarioActions(
  station: PlaygroundStationV1,
  scenario: PlaygroundScenarioV1,
): readonly PlaygroundActionV1[] {
  if (scenario.caseId === undefined) return [];
  const found = station.cases.find((entry) => entry.id === scenario.caseId);
  if (!found) {
    throw new Error(
      `Scenario '${scenario.id}' names case '${scenario.caseId}', but `
      + `station '${station.sceneId}' declares no such case.`,
    );
  }
  return found.actions;
}

function applyAction(world: PlaygroundWorldV1, action: PlaygroundActionV1): void {
  switch (action.kind) {
    case 'spawn':
      world.spawn(action.placementId, {
        centre: action.centre,
        ...(action.velocity ? { velocity: action.velocity } : {}),
        ...(action.ccd ? { ccd: true } : {}),
      });
      return;
    case 'remove':
      world.remove(action.placementId);
      return;
    case 'impulse':
      world.impulse(action.placementId, action.impulse);
      return;
    case 'detach-joint':
      world.detachJoint(action.jointId);
      return;
    default: {
      const never: never = action;
      throw new Error(`Unknown playground action: ${JSON.stringify(never)}`);
    }
  }
}

export async function runPlaygroundScenarioV1(
  station: PlaygroundStationV1,
  scenarioOrId: PlaygroundScenarioV1 | string,
  options: PlaygroundRunOptionsV1 = {},
): Promise<PlaygroundScenarioResultV1> {
  const scenario = typeof scenarioOrId === 'string'
    ? stationScenario(station, scenarioOrId)
    : scenarioOrId;
  const now = options.now ?? (() => performance.now());
  await initPlaygroundRapierV1();
  const world = PlaygroundWorldV1.create(station, {
    ...(scenario.omit !== undefined ? { omit: scenario.omit } : {}),
    ...(scenario.angleDegrees !== undefined
      ? { rampAngleDegrees: scenario.angleDegrees }
      : station.defaultRampAngleDegrees !== undefined
        ? { rampAngleDegrees: station.defaultRampAngleDegrees }
        : {}),
  });
  try {
    const actions = scenarioActions(station, scenario);
    const frames: PlaygroundFrameV1[] = [world.snapshot()];
    let maxStepMs = 0;
    let totalStepMs = 0;
    for (let tick = 0; tick < solverTicksForSecondsV1(scenario.seconds); tick += 1) {
      for (const action of actions) {
        if (solverTicksForSecondsV1(action.atSeconds) === tick) applyAction(world, action);
      }
      const before = now();
      world.step();
      const elapsed = now() - before;
      if (elapsed > maxStepMs) maxStepMs = elapsed;
      totalStepMs += elapsed;
      if (
        world.tick % PLAYGROUND_SNAPSHOT_STRIDE_V1 === 0
        || tick === solverTicksForSecondsV1(scenario.seconds) - 1
      ) {
        frames.push(world.snapshot());
      }
    }
    return evaluatePlaygroundScenarioV1(
      station,
      scenario,
      world.specs,
      frames,
      {
        maxStepMs,
        meanStepMs: solverTicksForSecondsV1(scenario.seconds) > 0 ? totalStepMs / solverTicksForSecondsV1(scenario.seconds) : 0,
      },
    );
  } finally {
    world.free();
  }
}

/** One line per scenario: id, verdict, and the timing that matters. */
export function playgroundResultLineV1(
  result: PlaygroundScenarioResultV1,
): string {
  const failed = result.checks.filter((check) => check.status === 'fail');
  const headline = failed.length > 0
    ? `${String(failed.length)} failed check${failed.length === 1 ? '' : 's'}`
    : 'all checks passed';
  return `${result.status.toUpperCase().padEnd(4)} ${result.scenarioId} — `
    + `${headline}; max step ${result.maxStepMs.toFixed(2)} ms, mean `
    + `${result.meanStepMs.toFixed(3)} ms, deepest floor dip `
    + `${result.maxFloorPenetration.toFixed(4)} m`
    + `, deepest impact burial ${result.maxImpactBurial.toFixed(4)} m`;
}

/**
 * Asserts a scenario is physically correct: every check passed.
 *
 * Equivalent to `status === 'pass'` now that the verdict is a pure function
 * of the checks, and still preferable: it names the check that failed instead
 * of reporting a bare status.
 *
 * It exists because the verdict used to fold in wall-clock timing — a loaded
 * full-gate host measured a 62 ms step and turned an all-checks-passed
 * trebuchet run into a failure. That is fixed at the source; timing is
 * reported in `maxStepMs`, `meanStepMs` and `timingNote`, where the preset
 * tests assert on it because there it is the point rather than a side effect
 * of how busy the machine was.
 */
export function expectScenarioCorrectV1(
  result: PlaygroundScenarioResultV1,
): void {
  const failed = result.checks.filter((check) => check.status === 'fail');
  expect(failed.map((check) => check.detail).join(' :: '), playgroundResultLineV1(result))
    .toBe('');
}
