import { createHash } from 'node:crypto';

import {
  CHAIN_REPLAY_FRAME_COUNT,
  CHAIN_REPLAY_PUSH_IMPULSE,
  CHAIN_REPLAY_PUSH_STEPS,
  CHAIN_REPLAY_SETTLE_STEPS,
  CHAIN_REPLAY_START_DIP,
  CHAIN_REPLAY_STEP_STRIDE,
} from '../../tools/studio/chain-replay-binding.js';
import {
  runChainSimulationV1,
  CHAIN_GRAIN_V1,
  CHAIN_GRAVITY_V1,
  CHAIN_SLACK_V1,
  CHAIN_TIMESTEP_V1,
} from './chain-simulation.js';

/**
 * Records the solved chain as a pose trace Studio can present.
 *
 * The Studio scene shows a straight row because a placement carries no tilt.
 * This is how the hang and the swing get on screen without Studio simulating
 * anything: the consumer solves, records, and hands over plain poses, and the
 * renderer only plays them back.
 *
 * The run starts the free links at half their equilibrium dip so gravity has
 * visible work to do. Starting at equilibrium proves the solver agrees with the
 * analytic catenary but shows a viewer a chain that never moves.
 */

export const CHAIN_REPLAY_SCENE_ID = 'studio:scene:chain-links';
export const CHAIN_REPLAY_ID = 'studio:pose-replay:chain-hang';

// Studio owns these, because the scene has to place the chain without pulling
// a solver into the browser bundle. Importing them here is what keeps the
// recorded trace and the scene reference from drifting apart.
export {
  CHAIN_REPLAY_FRAME_COUNT,
  CHAIN_REPLAY_PUSH_IMPULSE,
  CHAIN_REPLAY_PUSH_STEPS,
  CHAIN_REPLAY_SETTLE_STEPS,
  CHAIN_REPLAY_START_DIP,
  CHAIN_REPLAY_STEP_STRIDE,
} from '../../tools/studio/chain-replay-binding.js';

export function chainPlacementIdV1(index: number): string {
  return `link-${String(index).padStart(2, '0')}`;
}

function encodeFloat32(values: readonly number[]): string {
  const array = Float32Array.from(values);
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return Buffer.from(binary, 'binary').toString('base64');
}

export interface ChainReplaySourceV1 {
  readonly source: string;
  readonly frameCount: number;
  readonly inputHash: string;
  readonly finalHash: string;
}

export async function chainReplaySourceV1(): Promise<ChainReplaySourceV1> {
  const run = await runChainSimulationV1({
    settleSteps: CHAIN_REPLAY_SETTLE_STEPS,
    pushSteps: CHAIN_REPLAY_PUSH_STEPS,
    pushImpulse: CHAIN_REPLAY_PUSH_IMPULSE,
    startDipScale: CHAIN_REPLAY_START_DIP,
    recordEveryNthStep: CHAIN_REPLAY_STEP_STRIDE,
  });

  const placementIds = run.recordedLinkIndices.map(chainPlacementIdV1);
  const translations: number[] = [];
  const quaternions: number[] = [];
  const linearVelocities: number[] = [];
  const angularVelocities: number[] = [];
  for (const frame of run.frames) {
    for (const value of frame.translations) translations.push(...value);
    for (const value of frame.quaternions) quaternions.push(...value);
    for (const value of frame.linearVelocities) linearVelocities.push(...value);
    for (const value of frame.angularVelocities) angularVelocities.push(...value);
  }

  // The inputs that fully determine the run. Anything absent here that changes
  // the trace would be an undeclared input, which is the failure this guards.
  const canonicalInput = JSON.stringify({
    grain: CHAIN_GRAIN_V1,
    gravity: CHAIN_GRAVITY_V1,
    slack: CHAIN_SLACK_V1,
    timestep: CHAIN_TIMESTEP_V1,
    settleSteps: CHAIN_REPLAY_SETTLE_STEPS,
    pushSteps: CHAIN_REPLAY_PUSH_STEPS,
    pushImpulse: CHAIN_REPLAY_PUSH_IMPULSE,
    startDip: CHAIN_REPLAY_START_DIP,
    stride: CHAIN_REPLAY_STEP_STRIDE,
    placementIds,
    colliderCount: run.colliderCount,
    jointCount: run.jointCount,
  });
  const inputHash = `sha256:${createHash('sha256').update(canonicalInput).digest('hex')}`;
  const finalHash = `sha256:${createHash('sha256')
    .update(Buffer.from(Float32Array.from(translations).buffer))
    .update(Buffer.from(Float32Array.from(quaternions).buffer))
    .digest('hex')}`;

  const encoded = {
    sceneId: CHAIN_REPLAY_SCENE_ID,
    frameCount: run.frames.length,
    placementIds,
    provenance: {
      solver: {
        name: '@dimforge/rapier3d-compat',
        version: '0.19.3',
      },
      fixedTimestepMs: CHAIN_TIMESTEP_V1 * CHAIN_REPLAY_STEP_STRIDE * 1_000,
      gravity: [0, CHAIN_GRAVITY_V1, 0] as const,
      inputHash,
      finalHash,
      lawLabels: [
        'gravity.uniform',
        'contact.rigid-nonpenetration',
        'contact.coulomb-friction',
        'inertia.rigid-body',
      ],
      capabilityLabels: [
        'chain.jointless-interlock',
        'chain.catenary-drape',
        'chain.pendulum-swing',
      ],
    },
    translationsBase64: encodeFloat32(translations),
    quaternionsBase64: encodeFloat32(quaternions),
    linearVelocitiesBase64: encodeFloat32(linearVelocities),
    angularVelocitiesBase64: encodeFloat32(angularVelocities),
    events: [],
    playback: 'once' as const,
  };

  const source = [
    '// Generated by fixtures/chain-consumer/chain-replay-generation.test.ts.',
    '// Exact body-origin observations from the jointless chain run. The links',
    '// are held together by solid interlock alone; the world contains no joint.',
    "import { decodeInterleavedScenePoseReplayV2 } from './scene-pose-replay-codec.js';",
    '',
    `export const CHAIN_POSE_REPLAY_ID = ${JSON.stringify(CHAIN_REPLAY_ID)};`,
    `export const CHAIN_POSE_REPLAY = decodeInterleavedScenePoseReplayV2(${JSON.stringify(encoded)});`,
    '',
  ].join('\n');

  if (run.frames.length !== CHAIN_REPLAY_FRAME_COUNT) {
    throw new Error(
      `The chain run recorded ${String(run.frames.length)} frames but Studio's `
      + `binding declares ${String(CHAIN_REPLAY_FRAME_COUNT)}. The scene's `
      + 'replay duration is derived from that count, so they must agree.',
    );
  }

  return {
    source,
    frameCount: run.frames.length,
    inputHash,
    finalHash,
  };
}
