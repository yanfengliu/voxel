import type { Page } from '@playwright/test';

import type { ScenePoseReplayV2 } from '../../tools/studio/scene-pose-replay.js';
import {
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from '../../tools/studio/windmill-layout.js';

export interface WindmillPhaseTimesV1 {
  readonly camContactMs: number;
  readonly liftMs: number;
  readonly releaseMs: number;
  readonly apexMs: number;
  readonly downwardMs: number;
  readonly impactMs: number;
}

interface CompactCycleRecord {
  readonly cycle: number;
  readonly camNoseKey: string;
  readonly camContactTick: number;
  readonly liftTick: number;
  readonly releaseTick: number;
  readonly apexTick: number;
  readonly downwardTick: number;
  readonly impactTick: number;
  readonly maximumLiftMeters: number;
  readonly impactImpulseNewtonSeconds: number;
}

interface BrowserGeneratedWindmillModule {
  readonly WINDMILL_POSE_REPLAY_ID: string;
  readonly WINDMILL_POSE_REPLAY: ScenePoseReplayV2;
  readonly WINDMILL_COMPACT_REPLAY_SELECTION: {
    readonly candidateParameterKey: string;
    readonly enumerationFingerprint: string;
    readonly selectionManifestSha256: string;
    readonly searchEvidenceSha256: string;
    readonly selectedSearchEvaluationSha256: string;
    readonly selectedProofNominalEvaluationSha256: string;
    readonly selectedProofSha256: string;
    readonly selectionSha256: string;
  };
  readonly WINDMILL_COMPACT_REPLAY_RECORD_PROFILE: {
    readonly solverStepSeconds: number;
    readonly recordStepSeconds: number;
    readonly solverTicksPerRecordedFrame: number;
    readonly physicalDurationSeconds: number;
    readonly presentationDurationMs: number;
    readonly frameCount: number;
  };
  readonly WINDMILL_COMPACT_CANDIDATE_RESULT: {
    readonly parameterKey: string;
    readonly diagnostics: {
      readonly output: {
        readonly failedGateIds: readonly string[];
        readonly minimumCycles: number;
        readonly qualifyingCycles: number;
      };
    };
    readonly provenance: {
      readonly combinedEvaluationSha256: string;
      readonly effectiveInputSha256: string;
    };
  };
  readonly WINDMILL_SIMULATION_EVIDENCE: {
    readonly completedCausalCycles: number;
    readonly cycleRecords: readonly CompactCycleRecord[];
    readonly effectiveRun: {
      readonly numericalProfile: {
        readonly fixedStepSeconds: number;
        readonly id: string;
      };
      readonly durationSeconds: number;
      readonly gravityMultiplier: number;
      readonly windEnabled: boolean;
      readonly camContactEnabled: boolean;
      readonly anvilContactEnabled: boolean;
    };
    readonly failedGateIds: readonly string[];
    readonly qualifiedCausalCyclesByNose: Readonly<Record<string, number>>;
    readonly maximumHeadLiftMeters: number;
    readonly maximumRotorAngularSpeedRadiansPerSecond: number;
    readonly maximumCamFollowerPenetrationMeters: number;
    readonly maximumHeadAnvilPenetrationMeters: number;
    readonly maximumUnaccountedEnergyCreationJoules: number;
  };
  readonly WINDMILL_COMPACT_REPLAY_CONTACTS: readonly {
    readonly id: string;
    readonly cycle: number;
    readonly camNoseKey: string;
    readonly kind: 'cam-contact' | 'anvil-impact';
    readonly tick: number;
    readonly primaryPlacementId: string;
    readonly otherPlacementId: string;
    readonly point: readonly [number, number, number];
    readonly normal: readonly [number, number, number];
    readonly normalImpulse: number;
    readonly penetration: number;
  }[];
}

export async function readGeneratedWindmillEvidence(page: Page) {
  return page.evaluate(async ({ expectedReplayId, expectedSceneId }) => {
    const generatedUrl =
      new URL('generated-windmill-replay.ts', window.location.href).href;
    const generated =
      await import(generatedUrl) as unknown as BrowserGeneratedWindmillModule;
    const replay = generated.WINDMILL_POSE_REPLAY;
    const evidence = generated.WINDMILL_SIMULATION_EVIDENCE;
    const profile = generated.WINDMILL_COMPACT_REPLAY_RECORD_PROFILE;
    if (generated.WINDMILL_POSE_REPLAY_ID !== expectedReplayId) {
      throw new Error(
        `Generated Windmill replay id '${generated.WINDMILL_POSE_REPLAY_ID}' `
        + `does not match '${expectedReplayId}'.`,
      );
    }
    if (replay.sceneId !== expectedSceneId) {
      throw new Error(
        `Generated Windmill replay scene '${replay.sceneId}' does not match '${expectedSceneId}'.`,
      );
    }
    if (!Number.isFinite(profile.solverStepSeconds)
      || profile.solverStepSeconds <= 0) {
      throw new Error(
        `Generated Windmill record profile has invalid solver step ${
          String(profile.solverStepSeconds)
        }.`,
      );
    }
    if (evidence.cycleRecords.length === 0) {
      throw new Error(
        'Generated Windmill evidence has no completed cam/hammer cycle.',
      );
    }
    const cycleIndex = Math.min(1, evidence.cycleRecords.length - 1);
    const cycle = evidence.cycleRecords[cycleIndex]!;
    const orderedTicks = [
      cycle.camContactTick,
      cycle.liftTick,
      cycle.releaseTick,
      cycle.apexTick,
      cycle.downwardTick,
      cycle.impactTick,
    ];
    if (orderedTicks.some((tick) => !Number.isInteger(tick) || tick < 0)
      || orderedTicks.some(
        (tick, index) => index > 0 && tick < orderedTicks[index - 1]!,
      )) {
      throw new Error(
        `Generated Windmill cycle ${String(cycle.cycle)} has unordered phase ticks `
        + `[${orderedTicks.join(', ')}].`,
      );
    }
    const solverStepMs = profile.solverStepSeconds * 1_000;
    const atMs = (tick: number): number => tick * solverStepMs;
    const phaseTimes: WindmillPhaseTimesV1 = {
      camContactMs: atMs(cycle.camContactTick),
      liftMs: atMs(cycle.liftTick),
      releaseMs: atMs(cycle.releaseTick),
      apexMs: atMs(cycle.apexTick),
      downwardMs: atMs(cycle.downwardTick),
      impactMs: atMs(cycle.impactTick),
    };
    return {
      replayId: generated.WINDMILL_POSE_REPLAY_ID,
      sceneId: replay.sceneId,
      playback: replay.playback,
      frameCount: replay.frameCount,
      durationMs: replay.frameCount * replay.provenance.fixedTimestepMs,
      trackIds: replay.tracks.map(({ placementId }) => placementId),
      provenance: replay.provenance,
      events: replay.events.map((event) => ({ ...event })),
      phaseTimes,
      cycle,
      cycleCount: evidence.cycleRecords.length,
      selection: generated.WINDMILL_COMPACT_REPLAY_SELECTION,
      recordProfile: profile,
      candidateResult: generated.WINDMILL_COMPACT_CANDIDATE_RESULT,
      evidence,
      contacts: generated.WINDMILL_COMPACT_REPLAY_CONTACTS,
    };
  }, {
    expectedReplayId: WINDMILL_POSE_REPLAY_ID,
    expectedSceneId: WINDMILL_SCENE_ID,
  });
}
