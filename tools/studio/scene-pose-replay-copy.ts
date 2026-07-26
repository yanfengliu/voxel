import {
  type ScenePoseReplayEventV1,
  type ScenePoseReplayV1,
} from './scene-pose-replay.js';

export function copyScenePoseReplayEventV1(
  event: ScenePoseReplayEventV1,
): ScenePoseReplayEventV1 {
  switch (event.type) {
    case 'assembled':
      return {
        ...event,
        memberPlacementIds: [...event.memberPlacementIds],
      };
    case 'released':
      return {
        ...event,
        remainingMemberPlacementIds: [...event.remainingMemberPlacementIds],
      };
    case 'contact':
      return {
        ...event,
        point: [...event.point],
        normal: [...event.normal],
      };
    case 'collected':
      return { ...event };
  }
}

/**
 * Takes private ownership of a replay after its public validation boundary.
 *
 * TypeScript readonly annotations do not make typed arrays or nested arrays
 * immutable at runtime. A live session must therefore never retain catalog
 * storage that another caller can mutate after acceptance.
 */
export function copyScenePoseReplayV1(replay: ScenePoseReplayV1): ScenePoseReplayV1 {
  return {
    schemaVersion: replay.schemaVersion,
    sceneId: replay.sceneId,
    frameCount: replay.frameCount,
    provenance: {
      solver: { ...replay.provenance.solver },
      fixedTimestepMs: replay.provenance.fixedTimestepMs,
      gravity: [...replay.provenance.gravity],
      inputHash: replay.provenance.inputHash,
      finalHash: replay.provenance.finalHash,
      lawLabels: [...replay.provenance.lawLabels],
      capabilityLabels: [...replay.provenance.capabilityLabels],
    },
    tracks: replay.tracks.map((track) => ({
      placementId: track.placementId,
      translations: new Float32Array(track.translations),
      quaternions: new Float32Array(track.quaternions),
      linearVelocities: new Float32Array(track.linearVelocities),
      angularVelocities: new Float32Array(track.angularVelocities),
    })),
    events: replay.events.map(copyScenePoseReplayEventV1),
  };
}
