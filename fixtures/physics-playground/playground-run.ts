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
 * One scenario is one fresh world advanced a fixed number of 1/240 s ticks
 * with its case's scripted actions applied at their declared ticks. Frames
 * are sampled on a fixed stride and judged by the shared checks, so two
 * runs of the same scenario see the same world at the same ticks — wall
 * clocks never influence the simulation, only the timing report.
 */

/** Snapshot every eighth tick: 30 Hz sampling of a 240 Hz world. */
export const PLAYGROUND_SNAPSHOT_STRIDE_V1 = 8;

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
    for (let tick = 0; tick < scenario.ticks; tick += 1) {
      for (const action of actions) {
        if (action.atTick === tick) applyAction(world, action);
      }
      const before = now();
      world.step();
      const elapsed = now() - before;
      if (elapsed > maxStepMs) maxStepMs = elapsed;
      totalStepMs += elapsed;
      if (
        world.tick % PLAYGROUND_SNAPSHOT_STRIDE_V1 === 0
        || tick === scenario.ticks - 1
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
        meanStepMs: scenario.ticks > 0 ? totalStepMs / scenario.ticks : 0,
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
    + `${result.maxFloorPenetration.toFixed(4)} m`;
}
