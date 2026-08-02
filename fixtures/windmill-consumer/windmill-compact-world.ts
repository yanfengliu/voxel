import RAPIER, {
  type Collider,
  type RevoluteImpulseJoint,
  type Vector,
  type World,
} from '@dimforge/rapier3d-compat';

import {
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1,
  type WindmillCompactCamNoseKeyV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  applyLivePhysicsNumericalProfileV1,
} from '../../tools/studio/live-physics-numerical-profile.js';
import {
  createPhysicalAssetBodyV1,
  scaledPhysicalPortV1,
  type RapierPhysicalInstanceV1,
} from '../physical-asset-rapier-adapter.js';
import {
  assertWindmillNumericalProfileV1,
  WINDMILL_BODY_DYNAMICS_V1,
  WINDMILL_CONTACT_COMBINE_RULES,
  WINDMILL_GRAVITY,
  WINDMILL_JOINT_MODEL_V1,
  WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1,
  type WindmillNumericalProfileV1,
} from './windmill-operational-inputs.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';

export interface WindmillCompactWorldV1 {
  readonly world: World;
  readonly frame: RapierPhysicalInstanceV1;
  readonly rotor: RapierPhysicalInstanceV1;
  readonly hammer: RapierPhysicalInstanceV1;
  readonly anvil: RapierPhysicalInstanceV1;
  readonly rotorJoint: RevoluteImpulseJoint;
  readonly hammerJoint: RevoluteImpulseJoint;
  readonly camColliders: readonly Collider[];
  readonly camNoseColliders: Readonly<Record<
    WindmillCompactCamNoseKeyV1,
    Collider
  >>;
  readonly followerColliders: readonly Collider[];
  readonly headColliders: readonly Collider[];
  readonly anvilFaceColliders: readonly Collider[];
  readonly rotorFrameAnchor: Vector;
  readonly rotorBodyAnchor: Vector;
  readonly hammerFrameAnchor: Vector;
  readonly hammerBodyAnchor: Vector;
  readonly setAnvilContactEnabled: (enabled: boolean) => void;
}

export interface WindmillCompactWorldOptionsV1 {
  readonly gravityMultiplier?: number;
  readonly camContactEnabled?: boolean;
  readonly disabledCamNoseKey?: WindmillCompactCamNoseKeyV1;
  readonly anvilContactEnabled?: boolean;
  readonly numericalProfile?: WindmillNumericalProfileV1;
}

let rapierReady: Promise<void> | null = null;

function initializeRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

function vector(values: readonly [number, number, number]): Vector {
  return { x: values[0], y: values[1], z: values[2] };
}

function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

const GROUPS = Object.freeze({
  inert: interactionGroups(0, 0),
  cam: interactionGroups(0x0001, 0x0002),
  follower: interactionGroups(0x0002, 0x0001),
  head: interactionGroups(0x0004, 0x0008),
  anvil: interactionGroups(0x0008, 0x0004),
});

function collidersAt(
  instance: RapierPhysicalInstanceV1,
  indices: readonly number[],
  label: string,
): readonly Collider[] {
  return Object.freeze(indices.map((index) => {
    const collider = instance.solidColliders[index];
    if (collider === undefined) {
      throw new Error(
        `Cannot create compact windmill world: ${label} collider index `
        + `${String(index)} is absent from the compiled exact sidecar.`,
      );
    }
    return collider;
  }));
}

function applyContactCoefficients(
  instances: readonly RapierPhysicalInstanceV1[],
): void {
  if (WINDMILL_CONTACT_COMBINE_RULES.friction !== 'average'
    || WINDMILL_CONTACT_COMBINE_RULES.restitution !== 'average') {
    throw new Error(
      'Cannot create compact windmill world: only the declared average '
      + 'friction/restitution combine rule is implemented.',
    );
  }
  const average = RAPIER.CoefficientCombineRule.Average;
  instances.flatMap(({ solidColliders }) => solidColliders)
    .forEach((collider) => {
      collider.setFrictionCombineRule(average);
      collider.setRestitutionCombineRule(average);
      collider.setCollisionGroups(GROUPS.inert);
    });
}

function requireContact(
  compiled: WindmillCompiledCompactCandidateV1,
  key: 'cam-follower' | 'head-anvil',
) {
  const group = compiled.contactColliderIndices.find((entry) =>
    entry.key === key);
  if (group === undefined) {
    throw new Error(
      `Cannot create compact windmill world: compiled contact group `
      + `'${key}' is absent.`,
    );
  }
  return group;
}

function populateWindmillCompactWorldV1(
  world: World,
  compiled: WindmillCompiledCompactCandidateV1,
  options: WindmillCompactWorldOptionsV1,
): WindmillCompactWorldV1 {
  const numericalProfile = options.numericalProfile
    ?? WINDMILL_OPERATIONAL_NUMERICAL_PROFILE_V1;
  assertWindmillNumericalProfileV1(numericalProfile);
  applyLivePhysicsNumericalProfileV1(
    world.integrationParameters,
    numericalProfile,
  );
  const grain = compiled.candidate.grainMeters;
  const frame = createPhysicalAssetBodyV1(
    world,
    compiled.physicalAssets.frame,
    { position: vector(compiled.bodyWorldMeters.frame) },
    { grain },
  );
  const rotor = createPhysicalAssetBodyV1(
    world,
    compiled.physicalAssets.rotor,
    { position: vector(compiled.bodyWorldMeters.rotor) },
    { grain, canSleep: WINDMILL_BODY_DYNAMICS_V1.rotor.canSleep },
  );
  const hammer = createPhysicalAssetBodyV1(
    world,
    compiled.physicalAssets.hammer,
    { position: vector(compiled.bodyWorldMeters.hammer) },
    { grain, canSleep: WINDMILL_BODY_DYNAMICS_V1.hammer.canSleep },
  );
  const anvil = createPhysicalAssetBodyV1(
    world,
    compiled.physicalAssets.anvil,
    { position: vector(compiled.bodyWorldMeters.anvil) },
    { grain },
  );
  const instances = { frame, rotor, hammer, anvil } as const;
  applyContactCoefficients(Object.values(instances));
  const camGroup = requireContact(compiled, 'cam-follower');
  const impactGroup = requireContact(compiled, 'head-anvil');
  const camColliders = collidersAt(
    instances[camGroup.firstAssetKey],
    camGroup.firstIndices,
    'cam',
  );
  const camNoseColliders = Object.freeze(Object.fromEntries(
    WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.map((key) => {
      const index = compiled.boxColliderIndices.rotor[key];
      const collider = index === undefined
        ? undefined
        : rotor.solidColliders[index];
      if (collider === undefined || !camGroup.firstIndices.includes(index!)) {
        throw new Error(
          `Cannot create compact windmill world: exact cam nose '${key}' `
          + 'is absent from the compiled cam-follower contact group.',
        );
      }
      return [key, collider];
    }),
  )) as Readonly<Record<WindmillCompactCamNoseKeyV1, Collider>>;
  const followerColliders = collidersAt(
    instances[camGroup.secondAssetKey],
    camGroup.secondIndices,
    'follower',
  );
  const headColliders = collidersAt(
    instances[impactGroup.firstAssetKey],
    impactGroup.firstIndices,
    'hammer head',
  );
  const anvilFaceColliders = collidersAt(
    instances[impactGroup.secondAssetKey],
    impactGroup.secondIndices,
    'anvil face',
  );
  WINDMILL_COMPACT_CAM_NOSE_KEYS_V1.forEach((key) => {
    const enabled = options.camContactEnabled !== false
      && options.disabledCamNoseKey !== key;
    camNoseColliders[key].setCollisionGroups(
      enabled ? GROUPS.cam : GROUPS.inert,
    );
  });
  followerColliders.forEach((collider) =>
    collider.setCollisionGroups(
      options.camContactEnabled === false ? GROUPS.inert : GROUPS.follower,
    ));
  headColliders.forEach((collider) => collider.setCollisionGroups(GROUPS.head));
  anvilFaceColliders.forEach((collider) =>
    collider.setCollisionGroups(
      options.anvilContactEnabled === false ? GROUPS.inert : GROUPS.anvil,
    ));
  const rotorFramePort = scaledPhysicalPortV1(
    compiled.physicalAssets.frame,
    'frame-rotor-axis',
    grain,
  );
  const rotorBodyPort = scaledPhysicalPortV1(
    compiled.physicalAssets.rotor,
    'rotor-axis',
    grain,
  );
  const hammerFramePort = scaledPhysicalPortV1(
    compiled.physicalAssets.frame,
    'frame-hammer-axis',
    grain,
  );
  const hammerBodyPort = scaledPhysicalPortV1(
    compiled.physicalAssets.hammer,
    'hammer-axis',
    grain,
  );
  const rotorJoint = world.createImpulseJoint(
    RAPIER.JointData.revolute(
      rotorFramePort.position,
      rotorBodyPort.position,
      vector(WINDMILL_JOINT_MODEL_V1.freeAxisWorld),
    ),
    frame.body,
    rotor.body,
    true,
  ) as RevoluteImpulseJoint;
  rotorJoint.setContactsEnabled(false);
  const hammerJoint = world.createImpulseJoint(
    RAPIER.JointData.revolute(
      hammerFramePort.position,
      hammerBodyPort.position,
      vector(WINDMILL_JOINT_MODEL_V1.freeAxisWorld),
    ),
    frame.body,
    hammer.body,
    true,
  ) as RevoluteImpulseJoint;
  hammerJoint.setContactsEnabled(false);
  return {
    world,
    frame,
    rotor,
    hammer,
    anvil,
    rotorJoint,
    hammerJoint,
    camColliders,
    camNoseColliders,
    followerColliders,
    headColliders,
    anvilFaceColliders,
    rotorFrameAnchor: rotorFramePort.position,
    rotorBodyAnchor: rotorBodyPort.position,
    hammerFrameAnchor: hammerFramePort.position,
    hammerBodyAnchor: hammerBodyPort.position,
    setAnvilContactEnabled(enabled): void {
      anvilFaceColliders.forEach((collider) =>
        collider.setCollisionGroups(enabled ? GROUPS.anvil : GROUPS.inert));
    },
  };
}

export async function createWindmillCompactWorldV1(
  compiled: WindmillCompiledCompactCandidateV1,
  options: WindmillCompactWorldOptionsV1 = {},
): Promise<WindmillCompactWorldV1> {
  await initializeRapier();
  const gravityMultiplier = options.gravityMultiplier ?? 1;
  if (!Number.isFinite(gravityMultiplier) || gravityMultiplier < 0) {
    throw new Error(
      `Cannot create compact windmill world with gravity multiplier `
      + `${String(gravityMultiplier)}; expected a finite non-negative value.`,
    );
  }
  const world = new RAPIER.World(vector(WINDMILL_GRAVITY.map((value) =>
    value * gravityMultiplier) as [number, number, number]));
  try {
    return populateWindmillCompactWorldV1(world, compiled, options);
  } catch (error) {
    world.free();
    throw error;
  }
}
