import RAPIER from '@dimforge/rapier3d-compat';

import {
  CHAIN_REPLAY_PUSH_STEPS,
  CHAIN_REPLAY_SETTLE_STEPS,
  CHAIN_REPLAY_START_DIP,
} from '../../tools/studio/chain-replay-binding.js';
import { CHAIN_RECORDED_START_POSES_V1 } from './chain-start-poses.js';
import {
  chainLinkPlaneV1,
  CHAIN_INNER_RADIUS_V1,
  CHAIN_LINK_COUNT_V1,
  CHAIN_LINK_PITCH_V1,
  CHAIN_OUTER_RADIUS_V1,
  CHAIN_RING_DEPTH_V1,
} from '../../tools/studio/chain-layout.js';
import { chainRingPart } from '../../tools/studio/chain-link-part.js';
import { decomposeVoxelsV1 } from '../../tools/studio/voxel-colliders.js';

/**
 * The hanging chain, solved.
 *
 * Every collider here comes from the same voxel decomposition the Studio model
 * uses, so the shape that is simulated is exactly the shape that is drawn —
 * there is no second, hand-fitted proxy geometry to drift from it.
 *
 * There are no joints. The run reports `jointCount: 0`, and it is meant to: the
 * whole claim is that the links stay together because each is a solid ring
 * whose neighbour's material lies inside its hole. A joint anywhere in this
 * world would make that claim untestable.
 */

export const CHAIN_GRAIN_V1 = 0.25;
export const CHAIN_TIMESTEP_V1 = 1 / 240;
export const CHAIN_GRAVITY_V1 = -9.81;

/**
 * Anchor separation as a fraction of the chain's own length. At 1 the chain is
 * pulled straight and barely sags; below about 0.9 it drapes. It must not be
 * approached by moving anchors inward after the fact — a chain carries no
 * compression, so an already-straight chain buckles upward instead of draping.
 * The links therefore start on the catenary they will settle onto.
 */
export const CHAIN_SLACK_V1 = 0.75;

export interface ChainRunOptionsV1 {
  /** Steps before any measurement, so the drape settles. */
  readonly settleSteps?: number;
  /** Zero disables gravity, which is the no-sag ablation. */
  readonly gravityScale?: number;
  /** Link index to leave out entirely, which is the broken-chain ablation. */
  readonly omitLink?: number;
  /** Sideways impulse applied to the middle link after settling. */
  readonly pushImpulse?: number;
  /** Steps after the push, over which the swing is measured. */
  readonly pushSteps?: number;
  /**
   * Shallows the starting curve so gravity has visible work to do. At 1 the
   * chain begins at equilibrium and barely moves, which proves the solver
   * agrees with the analytic curve but shows a viewer nothing. Below 1 the
   * chain starts held up and falls into its drape.
   */
  readonly startDipScale?: number;
  /** Capture a pose per recorded frame, for replay. */
  readonly recordEveryNthStep?: number;
}

export interface ChainRecordedFrameV1 {
  readonly translations: readonly (readonly [number, number, number])[];
  readonly quaternions: readonly (readonly [number, number, number, number])[];
  readonly linearVelocities: readonly (readonly [number, number, number])[];
  readonly angularVelocities: readonly (readonly [number, number, number])[];
}

export interface ChainPoseV1 {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ChainRunResultV1 {
  readonly linkCount: number;
  readonly colliderCount: number;
  readonly jointCount: number;
  readonly settled: readonly ChainPoseV1[];
  /** How far the middle link ends up below the anchors. */
  readonly middleSag: number;
  /** Largest centre-to-centre gap between neighbours at rest. */
  readonly widestNeighbourGap: number;
  /**
   * How far the furthest link ends up from the catenary it started on. The
   * whole chain barely moves, because the analytic curve is the equilibrium
   * the solver independently sustains. A chain missing a link does move, and
   * that difference is what the break ablation measures.
   */
  readonly maxDisplacementFromStart: number;
  /** Largest sideways travel of the middle link after the push. */
  readonly swingAmplitude: number;
  /** Sideways offset once the swing has decayed. */
  readonly swingRest: number;
  /** True when every link stayed within the world bounds a chain must keep. */
  readonly allLinksHeld: boolean;
  /** Ordered link indices the recorded frames follow. */
  readonly recordedLinkIndices: readonly number[];
  /** One entry per recorded frame, when recording was asked for. */
  readonly frames: readonly ChainRecordedFrameV1[];
}

interface CatenaryV1 {
  readonly a: number;
  readonly halfSpan: number;
  readonly halfLength: number;
}

/**
 * The curve a uniform chain of this length takes between anchors that far
 * apart. Solved by bisection on halfLength = a·sinh(halfSpan / a), which has no
 * closed form.
 */
export function chainCatenaryV1(
  linkCount: number = CHAIN_LINK_COUNT_V1,
  slack: number = CHAIN_SLACK_V1,
): CatenaryV1 {
  const pitch = CHAIN_LINK_PITCH_V1 * CHAIN_GRAIN_V1;
  const halfLength = ((linkCount - 1) * pitch) / 2;
  const halfSpan = halfLength * slack;
  let low = 1e-6;
  let high = 1e6;
  for (let step = 0; step < 300; step += 1) {
    const middle = (low + high) / 2;
    if (middle * Math.sinh(halfSpan / middle) > halfLength) low = middle;
    else high = middle;
  }
  return { a: (low + high) / 2, halfSpan, halfLength };
}

/** Where link `index` starts, and how far it is tilted to follow the curve. */
export function chainCatenaryPoseV1(
  index: number,
  linkCount: number = CHAIN_LINK_COUNT_V1,
  slack: number = CHAIN_SLACK_V1,
): { readonly x: number; readonly y: number; readonly angle: number } {
  const { a, halfSpan } = chainCatenaryV1(linkCount, slack);
  const pitch = CHAIN_LINK_PITCH_V1 * CHAIN_GRAIN_V1;
  const arc = (index - (linkCount - 1) / 2) * pitch;
  const x = a * Math.asinh(arc / a);
  const anchorRise = a * Math.cosh(halfSpan / a) - a;
  return {
    x,
    y: a * Math.cosh(x / a) - a - anchorRise,
    // A link lies along the local tangent, or it stops being threaded as soon
    // as the curve bends away from it.
    angle: Math.atan(Math.sinh(x / a)),
  };
}

export interface ChainColliderBoxV1 {
  readonly half: readonly [number, number, number];
  readonly at: readonly [number, number, number];
}

/** One link's colliders, straight from the voxel decomposition of its ring. */
export function chainLinkColliderBoxesV1(
  plane: 'xy' | 'xz',
): readonly ChainColliderBoxV1[] {
  const fragment = chainRingPart.build({
    outerRadius: CHAIN_OUTER_RADIUS_V1,
    innerRadius: CHAIN_INNER_RADIUS_V1,
    depth: CHAIN_RING_DEPTH_V1,
    plane,
    role: 'steel',
  }, 0);
  const [sx, sy] = fragment.size;
  const decomposition = decomposeVoxelsV1({
    size: fragment.size,
    filled: (x, y, z) => fragment.voxels[x + sx * (y + sy * z)] !== 0,
  });
  const centre = fragment.size.map((extent) => extent / 2);
  return decomposition.boxes.map((box) => ({
    half: [
      (box.size[0] * CHAIN_GRAIN_V1) / 2,
      (box.size[1] * CHAIN_GRAIN_V1) / 2,
      (box.size[2] * CHAIN_GRAIN_V1) / 2,
    ] as const,
    at: [
      (box.at[0] + box.size[0] / 2 - centre[0]) * CHAIN_GRAIN_V1,
      (box.at[1] + box.size[1] / 2 - centre[1]) * CHAIN_GRAIN_V1,
      (box.at[2] + box.size[2] / 2 - centre[2]) * CHAIN_GRAIN_V1,
    ] as const,
  }));
}

function neighbourGaps(poses: readonly ChainPoseV1[]): number {
  let widest = 0;
  for (let index = 1; index < poses.length; index += 1) {
    const left = poses[index - 1];
    const right = poses[index];
    if (!left || !right) continue;
    if (right.index !== left.index + 1) continue;
    widest = Math.max(widest, Math.hypot(
      right.x - left.x,
      right.y - left.y,
      right.z - left.z,
    ));
  }
  return widest;
}

export async function runChainSimulationV1(
  options: ChainRunOptionsV1 = {},
): Promise<ChainRunResultV1> {
  const settleSteps = options.settleSteps ?? CHAIN_REPLAY_SETTLE_STEPS;
  const gravityScale = options.gravityScale ?? 1;
  const pushImpulse = options.pushImpulse ?? 0;
  // Long enough for the swing to decay; a short window measures mid-swing
  // and makes a returning chain look like one that stayed pushed.
  const pushSteps = options.pushSteps ?? CHAIN_REPLAY_PUSH_STEPS;

  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: CHAIN_GRAVITY_V1 * gravityScale, z: 0 });
  world.integrationParameters.dt = CHAIN_TIMESTEP_V1;

  const bodies = new Map<number, RAPIER.RigidBody>();
  let colliderCount = 0;
  for (let index = 0; index < CHAIN_LINK_COUNT_V1; index += 1) {
    if (index === options.omitLink) continue;
    const anchored = index === 0 || index === CHAIN_LINK_COUNT_V1 - 1;
    // Anchors always sit on the true curve; only the free links start high.
    const dip = anchored ? 1 : (options.startDipScale ?? 1);
    // Rapier's determinism guarantee requires initial values to come from
    // cross-platform deterministic operations, and its docs name Math.sin and
    // Math.cos as ones that are not. The recorded configuration therefore
    // starts from frozen literals so its committed trace does not depend on one
    // engine's transcendentals. Other dips are ablations compared with
    // tolerances rather than hashed, so they may compute their own poses.
    const frozen = (options.startDipScale ?? 1) === CHAIN_REPLAY_START_DIP
      ? CHAIN_RECORDED_START_POSES_V1[index]
      : undefined;
    const pose = chainCatenaryPoseV1(index);
    const start = frozen ?? {
      x: pose.x,
      y: pose.y * dip,
      qz: Math.sin((pose.angle * dip) / 2),
      qw: Math.cos((pose.angle * dip) / 2),
    };
    const description = (anchored
      ? RAPIER.RigidBodyDesc.fixed()
      : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(start.x, start.y, 0)
      .setRotation({ x: 0, y: 0, z: start.qz, w: start.qw });
    const body = world.createRigidBody(description);
    for (const box of chainLinkColliderBoxesV1(chainLinkPlaneV1(index))) {
      world.createCollider(
        RAPIER.ColliderDesc
          .cuboid(box.half[0], box.half[1], box.half[2])
          .setTranslation(box.at[0], box.at[1], box.at[2])
          .setFriction(0.4)
          .setRestitution(0.05),
        body,
      );
      colliderCount += 1;
    }
    bodies.set(index, body);
  }

  const recordEvery = options.recordEveryNthStep ?? 0;
  const ordered = () => [...bodies].sort((a, b) => a[0] - b[0]).map(([, body]) => body);
  const frames: ChainRecordedFrameV1[] = [];
  const capture = (): void => {
    const list = ordered();
    frames.push({
      translations: list.map((body) => {
        const t = body.translation();
        return [t.x, t.y, t.z] as const;
      }),
      quaternions: list.map((body) => {
        const r = body.rotation();
        return [r.x, r.y, r.z, r.w] as const;
      }),
      linearVelocities: list.map((body) => {
        const v = body.linvel();
        return [v.x, v.y, v.z] as const;
      }),
      angularVelocities: list.map((body) => {
        const v = body.angvel();
        return [v.x, v.y, v.z] as const;
      }),
    });
  };
  if (recordEvery > 0) capture();
  for (let step = 0; step < settleSteps; step += 1) {
    world.step();
    if (recordEvery > 0 && (step + 1) % recordEvery === 0) capture();
  }

  const settled: ChainPoseV1[] = [];
  for (const [index, body] of [...bodies].sort((a, b) => a[0] - b[0])) {
    const position = body.translation();
    settled.push({ index, x: position.x, y: position.y, z: position.z });
  }

  const anchorY = chainCatenaryPoseV1(0).y;
  const middleIndex = Math.floor(CHAIN_LINK_COUNT_V1 / 2);
  const middle = bodies.get(middleIndex);
  const middleSag = middle ? anchorY - middle.translation().y : Number.NaN;

  let swingAmplitude = 0;
  let swingRest = 0;
  if (middle && pushImpulse !== 0) {
    middle.applyImpulse({ x: 0, y: 0, z: pushImpulse }, true);
    for (let step = 0; step < pushSteps; step += 1) {
      world.step();
      if (recordEvery > 0 && (step + 1) % recordEvery === 0) capture();
      swingAmplitude = Math.max(swingAmplitude, Math.abs(middle.translation().z));
    }
    swingRest = Math.abs(middle.translation().z);
  }

  // A link that came unthreaded falls forever, so a finite depth below the
  // anchors is what "still held" means here.
  const fallLimit = chainCatenaryV1().halfLength * 4;
  const allLinksHeld = [...bodies.values()].every((body) => {
    const position = body.translation();
    return Number.isFinite(position.y) && anchorY - position.y < fallLimit;
  });

  let maxDisplacementFromStart = 0;
  for (const pose of settled) {
    const start = chainCatenaryPoseV1(pose.index);
    maxDisplacementFromStart = Math.max(
      maxDisplacementFromStart,
      Math.hypot(pose.x - start.x, pose.y - start.y, pose.z),
    );
  }

  const result: ChainRunResultV1 = {
    linkCount: bodies.size,
    colliderCount,
    jointCount: world.impulseJoints.len() + world.multibodyJoints.len(),
    settled,
    middleSag,
    widestNeighbourGap: neighbourGaps(settled),
    maxDisplacementFromStart,
    swingAmplitude,
    swingRest,
    allLinksHeld,
    recordedLinkIndices: [...bodies.keys()].sort((a, b) => a - b),
    frames,
  };
  world.free();
  return result;
}
