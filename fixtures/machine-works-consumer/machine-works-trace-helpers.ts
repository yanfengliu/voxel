import { createHash } from 'node:crypto';

import RAPIER, { type Vector } from '@dimforge/rapier3d-compat';

import {
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_TICKS,
  MACHINE_WORKS_TRACK_IDS,
} from './machine-works-fixture-config.js';
import type { RapierPoseV1 } from './machine-works-rapier-adapter.js';
import {
  IDENTITY_ROTATION,
  type RecordedRigidPoseV1,
} from './machine-works-simulation-geometry.js';

let rapierReady: Promise<void> | null = null;

export function initializeRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export function sha256(parts: readonly (string | ArrayBufferView)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    if (typeof part === 'string') hash.update(part);
    else hash.update(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
  }
  return hash.digest('hex');
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, alpha));
}

function smoothstep(alpha: number): number {
  const bounded = Math.min(1, Math.max(0, alpha));
  return bounded * bounded * (3 - 2 * bounded);
}

export function carriageTipPose(tick: number, start: RapierPoseV1): RapierPoseV1 {
  const alpha = smoothstep(
    (tick - MACHINE_WORKS_TICKS.released)
      / (MACHINE_WORKS_TICKS.tipComplete - MACHINE_WORKS_TICKS.released),
  );
  const angle = MACHINE_WORKS_LAYOUT.carriageTipRadians * alpha;
  const startRotation = start.rotation ?? IDENTITY_ROTATION;
  const sine = Math.sin(angle / 2);
  const cosine = Math.cos(angle / 2);
  const pivotX = start.position.x
    + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX;
  const pivotY = start.position.y
    + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY;
  const centerFromPivotX = -MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX;
  const centerFromPivotY = -MACHINE_WORKS_LAYOUT.carriageTipPivotLocalY;
  return {
    position: {
      x: pivotX
        + Math.cos(angle) * centerFromPivotX - Math.sin(angle) * centerFromPivotY,
      y: pivotY
        + Math.sin(angle) * centerFromPivotX + Math.cos(angle) * centerFromPivotY,
      z: start.position.z,
    },
    rotation: {
      x: cosine * startRotation.x - sine * startRotation.y,
      y: cosine * startRotation.y + sine * startRotation.x,
      z: cosine * startRotation.z + sine * startRotation.w,
      w: cosine * startRotation.w - sine * startRotation.z,
    },
  };
}

export function descendingPartY(
  tick: number,
  start: number,
  end: number,
  restY: number,
  attachedY: number,
): number {
  if (tick < start) return restY;
  if (tick < end) {
    return lerp(restY, attachedY, (tick - start) / (end - start));
  }
  return attachedY;
}

export function returningHeadY(
  tick: number,
  attachTick: number,
  attachedY: number,
  restY: number,
): number {
  if (tick < attachTick) return attachedY;
  if (tick < attachTick + 60) return lerp(attachedY, restY, (tick - attachTick) / 60);
  return restY;
}

export function recordPose(
  frame: number,
  slot: number,
  pose: RecordedRigidPoseV1,
  translations: Float32Array,
  rotations: Float32Array,
  linearVelocities: Float32Array,
  angularVelocities: Float32Array,
): void {
  const translationOffset = (frame * MACHINE_WORKS_TRACK_IDS.length + slot) * 3;
  const rotationOffset = (frame * MACHINE_WORKS_TRACK_IDS.length + slot) * 4;
  translations.set([pose.translation.x, pose.translation.y, pose.translation.z], translationOffset);
  rotations.set([pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w], rotationOffset);
  linearVelocities.set(
    [pose.linearVelocity.x, pose.linearVelocity.y, pose.linearVelocity.z],
    translationOffset,
  );
  angularVelocities.set(
    [pose.angularVelocity.x, pose.angularVelocity.y, pose.angularVelocity.z],
    translationOffset,
  );
}

export function combinedLocalAnchor(offset: Vector, anchor: RapierPoseV1): RapierPoseV1 {
  return {
    position: {
      x: offset.x + anchor.position.x,
      y: offset.y + anchor.position.y,
      z: offset.z + anchor.position.z,
    },
    ...(anchor.rotation === undefined ? {} : { rotation: anchor.rotation }),
  };
}
