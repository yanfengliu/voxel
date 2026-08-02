import type {
  WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  PhysicalAssetV1,
  PhysicalColliderV1,
} from '../../tools/studio/physical-asset.js';
import {
  deepFreezeWindmillEvidenceV1,
} from './windmill-evidence-freeze.js';
import {
  compileWindmillCompactCandidateV1,
} from './windmill-compact-physical.js';
import {
  WINDMILL_GRAVITY,
  WINDMILL_INITIAL_VELOCITIES,
  WINDMILL_JOINT_MODEL_V1,
  windmillOperationalInputSha256V1,
} from './windmill-operational-inputs.js';

export interface WindmillCompactUpperHeadMassEvidenceV1 {
  readonly schema: 'fixture.windmill-compact-upper-head-static-contribution/1';
  readonly boxKey: 'hammer-head-mass';
  readonly purposeId: 'windmill:purpose:hammer-head-return-mass';
  readonly faceConnectedPath: readonly [
    {
      readonly fromBoxKey: 'hammer-right-beam';
      readonly toBoxKey: 'hammer-head-mass';
      readonly minimumFaceAreaVoxels: 1;
    },
    {
      readonly fromBoxKey: 'hammer-head-mass';
      readonly toBoxKey: 'hammer-impact-toe';
      readonly minimumFaceAreaVoxels: 1;
    },
  ];
  readonly colliderIndex: number;
  readonly occupiedVoxelCount: number;
  readonly addedStaticMassKilograms: number;
  readonly nominalHammerMassKilograms: number;
  readonly hammerMassExcludingUpperCellKilograms: number;
  readonly horizontalLeverArmMeters: number;
  readonly analyticalHeadDownGravityForceNewtons: number;
  readonly analyticalHeadDownGravityTorqueNewtonMeters: number;
  readonly isImpactContactParticipant: false;
  readonly honestyBoundary:
    'Static sidecar mass and uniform-gravity arithmetic only; no isolated upper-cell dynamics ablation was run, and H1/H2/H3 search outcomes do not prove this cell independently necessary or responsible for a cycle.';
}

export interface WindmillCompactActuationBoundaryV1 {
  readonly schema: 'fixture.windmill-compact-actuation-boundary/1';
  readonly operationalInputSha256: string;
  readonly movingBodyTypes: readonly ['dynamic', 'dynamic'];
  readonly initialRotorLinearVelocity: readonly [0, 0, 0];
  readonly initialRotorAngularVelocity: readonly [0, 0, 0];
  readonly initialHammerLinearVelocity: readonly [0, 0, 0];
  readonly initialHammerAngularVelocity: readonly [0, 0, 0];
  readonly jointKind: 'rapier-impulse-revolute';
  readonly physicalDrives: readonly [
    'fixed-world-relative-velocity-pitched-plate-load',
    'gravity',
    'passive-contact-and-joint-impulses',
  ];
  readonly prohibitedControls: readonly [
    'wind-ramp',
    'motor',
    'controller',
    'post-creation-pose-or-velocity-override',
  ];
}

function colliderMass(collider: PhysicalColliderV1): number {
  if (collider.shape.kind !== 'box' || collider.density === undefined) {
    throw new Error(
      'Cannot derive selected windmill upper-head static contribution: every dynamic '
      + 'hammer collider must be a finite-density box.',
    );
  }
  return collider.density * collider.shape.halfExtents.reduce(
    (volume, halfExtent) => volume * halfExtent * 2,
    1,
  );
}

function physicalPortX(asset: PhysicalAssetV1, key: string): number {
  const port = asset.ports.find((entry) => entry.key === key);
  if (port === undefined) {
    throw new Error(
      `Cannot derive selected windmill upper-head static contribution: physical `
      + `hammer port '${key}' is absent.`,
    );
  }
  return port.frame.position[0];
}

function upperHeadFaceConnectedPath(
  candidate: WindmillCompactCandidateV1,
): WindmillCompactUpperHeadMassEvidenceV1['faceConnectedPath'] {
  const interfaces = candidate.requiredInterfaces.filter(({ fromBoxKey, toBoxKey }) =>
    fromBoxKey === 'hammer-head-mass' || toBoxKey === 'hammer-head-mass');
  const requireInterface = (
    firstKey: string,
    secondKey: string,
  ) => interfaces.find(({ fromBoxKey, toBoxKey }) =>
    (fromBoxKey === firstKey && toBoxKey === secondKey)
      || (fromBoxKey === secondKey && toBoxKey === firstKey));
  const beamInterface = requireInterface(
    'hammer-right-beam',
    'hammer-head-mass',
  );
  const toeInterface = requireInterface(
    'hammer-head-mass',
    'hammer-impact-toe',
  );
  const neighborKeys = interfaces.map(({ fromBoxKey, toBoxKey }) =>
    fromBoxKey === 'hammer-head-mass' ? toBoxKey : fromBoxKey).sort();
  if (interfaces.length !== 2
    || JSON.stringify(neighborKeys)
      !== JSON.stringify(['hammer-impact-toe', 'hammer-right-beam'])
    || beamInterface?.minimumFaceAreaVoxels !== 1
    || toeInterface?.minimumFaceAreaVoxels !== 1) {
    throw new Error(
      'Cannot derive selected windmill upper-head static contribution: '
      + "'hammer-head-mass' must have exactly one voxel-face interface with "
      + "'hammer-right-beam' and exactly one with 'hammer-impact-toe', with "
      + `no other face neighbors; found [${neighborKeys.join(', ')}].`,
    );
  }
  return Object.freeze([
    Object.freeze({
      fromBoxKey: 'hammer-right-beam' as const,
      toBoxKey: 'hammer-head-mass' as const,
      minimumFaceAreaVoxels: 1 as const,
    }),
    Object.freeze({
      fromBoxKey: 'hammer-head-mass' as const,
      toBoxKey: 'hammer-impact-toe' as const,
      minimumFaceAreaVoxels: 1 as const,
    }),
  ]);
}

export function createWindmillCompactUpperHeadMassEvidenceV1(
  candidate: WindmillCompactCandidateV1,
): WindmillCompactUpperHeadMassEvidenceV1 {
  // The return mass is whatever sits above the one-voxel impact toe, so a
  // one-voxel head has none to describe. Height is otherwise free: the
  // interface check below is what pins the shape, and the promoted head
  // grew from two voxels to three when the search was re-run at the
  // shared solver rate.
  if (candidate.parameters.hammerHeadHeightVoxels <= 1) {
    throw new Error(
      `Cannot derive selected windmill upper-head static contribution for `
      + `'${candidate.parameterKey}': head height is `
      + `${String(candidate.parameters.hammerHeadHeightVoxels)} voxel, so the `
      + 'head is the impact toe alone and carries no return mass above it. '
      + 'Expected at least 2.',
    );
  }
  const box = candidate.assets.hammer.boxes.find(({ key }) =>
    key === 'hammer-head-mass');
  if (box === undefined
    || box.purposeId !== 'windmill:purpose:hammer-head-return-mass') {
    throw new Error(
      'Cannot derive selected windmill upper-head static contribution: exact box '
      + "'hammer-head-mass' with its return-mass purpose is absent.",
    );
  }
  const faceConnectedPath = upperHeadFaceConnectedPath(candidate);
  const compiled = compileWindmillCompactCandidateV1(candidate);
  const colliderIndex = compiled.boxColliderIndices.hammer[box.key] ?? -1;
  const hammer = compiled.physicalAssets.hammer;
  const collider = hammer.colliders[colliderIndex];
  if (collider === undefined) {
    throw new Error(
      `Cannot derive selected windmill upper-head static contribution: box `
      + `'${box.key}' has no exact physical collider binding.`,
    );
  }
  const massKilograms = colliderMass(collider);
  const nominalHammerMassKilograms = hammer.colliders.reduce(
    (sum, entry) => sum + colliderMass(entry),
    0,
  );
  const horizontalLeverArmMeters = (
    collider.pose.position[0] - physicalPortX(hammer, 'hammer-axis')
  ) * candidate.grainMeters;
  const gravity = Math.abs(WINDMILL_GRAVITY[1]);
  const headAnvil = compiled.contactColliderIndices.find(({ key }) =>
    key === 'head-anvil');
  if (headAnvil === undefined) {
    throw new Error(
      'Cannot derive selected windmill upper-head static contribution: exact '
      + 'head-anvil contact index group is absent.',
    );
  }
  const occupiedVoxelCount = box.size.reduce(
    (product, value) => product * value,
    1,
  );
  if (headAnvil.firstIndices.includes(colliderIndex)) {
    throw new Error(
      `Cannot derive selected windmill upper-head static contribution: collider `
      + `${String(colliderIndex)} for '${box.key}' enlarges the exact impact `
      + 'contact instead of remaining outside the contact group.',
    );
  }
  return deepFreezeWindmillEvidenceV1({
    schema:
      'fixture.windmill-compact-upper-head-static-contribution/1' as const,
    boxKey: 'hammer-head-mass' as const,
    purposeId: 'windmill:purpose:hammer-head-return-mass' as const,
    faceConnectedPath,
    colliderIndex,
    occupiedVoxelCount,
    addedStaticMassKilograms: massKilograms,
    nominalHammerMassKilograms,
    hammerMassExcludingUpperCellKilograms:
      nominalHammerMassKilograms - massKilograms,
    horizontalLeverArmMeters,
    analyticalHeadDownGravityForceNewtons: massKilograms * gravity,
    analyticalHeadDownGravityTorqueNewtonMeters:
      massKilograms * gravity * horizontalLeverArmMeters,
    isImpactContactParticipant: false as const,
    honestyBoundary:
      'Static sidecar mass and uniform-gravity arithmetic only; no isolated upper-cell dynamics ablation was run, and H1/H2/H3 search outcomes do not prove this cell independently necessary or responsible for a cycle.' as const,
  });
}

export function createWindmillCompactActuationBoundaryV1(
  candidate: WindmillCompactCandidateV1,
): WindmillCompactActuationBoundaryV1 {
  const compiled = compileWindmillCompactCandidateV1(candidate);
  const rotorType = compiled.physicalAssets.rotor.bodies[0]?.type;
  const hammerType = compiled.physicalAssets.hammer.bodies[0]?.type;
  if (rotorType !== 'dynamic' || hammerType !== 'dynamic') {
    throw new Error(
      `Cannot prove selected windmill passive actuation: moving body types `
      + `are [${String(rotorType)}, ${String(hammerType)}], expected two `
      + 'solver-integrated dynamic bodies.',
    );
  }
  return deepFreezeWindmillEvidenceV1({
    schema: 'fixture.windmill-compact-actuation-boundary/1' as const,
    operationalInputSha256: windmillOperationalInputSha256V1(),
    movingBodyTypes: Object.freeze(['dynamic', 'dynamic'] as const),
    initialRotorLinearVelocity: WINDMILL_INITIAL_VELOCITIES.rotor.linear,
    initialRotorAngularVelocity: WINDMILL_INITIAL_VELOCITIES.rotor.angular,
    initialHammerLinearVelocity: WINDMILL_INITIAL_VELOCITIES.hammer.linear,
    initialHammerAngularVelocity: WINDMILL_INITIAL_VELOCITIES.hammer.angular,
    jointKind: WINDMILL_JOINT_MODEL_V1.kind,
    physicalDrives: Object.freeze([
      'fixed-world-relative-velocity-pitched-plate-load',
      'gravity',
      'passive-contact-and-joint-impulses',
    ] as const),
    prohibitedControls: Object.freeze([
      'wind-ramp',
      'motor',
      'controller',
      'post-creation-pose-or-velocity-override',
    ] as const),
  });
}
