import type {
  WindmillCompactAssetKeyV1, WindmillCompactInterfaceV1,
  WindmillCompactParametersV1,
} from './windmill-compact-geometry-contract.js';
export const WINDMILL_COMPACT_INTERFACE_GRAMMAR_SCHEMA_V1 =
  'studio.windmill-compact-interface-grammar/1' as const;
type PurposeNeedIdV1 = `windmill:purpose:${string}`;
export interface WindmillCompactInterfaceNeedV1 extends WindmillCompactInterfaceV1 {
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly needId: `windmill:interface-need:${string}`;
  readonly requiredByNeedIds: readonly PurposeNeedIdV1[];
  readonly job: string;
}
export interface WindmillCompactInterfaceGrammarV1 {
  readonly schema: typeof WINDMILL_COMPACT_INTERFACE_GRAMMAR_SCHEMA_V1;
  readonly expectedBoxKeys:
    Readonly<Record<WindmillCompactAssetKeyV1, readonly string[]>>;
  readonly interfaceNeeds: readonly WindmillCompactInterfaceNeedV1[];
}
function interfaceNeed(
  assetKey: WindmillCompactAssetKeyV1,
  needKey: string,
  fromBoxKey: string,
  toBoxKey: string,
  requiredByNeedIds: readonly PurposeNeedIdV1[],
  job: string,
  minimumFaceAreaVoxels = 1,
): WindmillCompactInterfaceNeedV1 {
  return Object.freeze({
    assetKey,
    needId: `windmill:interface-need:${needKey}`,
    fromBoxKey,
    toBoxKey,
    minimumFaceAreaVoxels,
    requiredByNeedIds: Object.freeze([...requiredByNeedIds]),
    job,
  });
}
function bearingBoxKeys(prefix: string): readonly string[] {
  return Object.freeze([
    `${prefix}-left-post`,
    `${prefix}-right-post`,
    `${prefix}-cap`,
    `${prefix}-saddle`,
    `${prefix}-lower-left-liner`,
    `${prefix}-lower-right-liner`,
    `${prefix}-upper-left-liner`,
    `${prefix}-upper-right-liner`,
  ]);
}
interface BearingExternalInterfaceV1 {
  readonly needKey: string;
  readonly toBoxKey: string;
  readonly requiredByNeedIds: readonly PurposeNeedIdV1[];
  readonly job: string;
}
function bearingInterfaceNeeds(
  prefix: string, externalLeftPostInterfaces: readonly BearingExternalInterfaceV1[],
): readonly WindmillCompactInterfaceNeedV1[] {
  const supportPurpose = `windmill:purpose:${prefix}-support` as PurposeNeedIdV1;
  const box = (suffix: string) => `${prefix}-${suffix}`;
  const internal = (
    needKey: string,
    fromSuffix: string,
    toSuffix: string,
    job: string,
  ) => interfaceNeed(
    'frame',
    `${prefix}:${needKey}`,
    box(fromSuffix),
    box(toSuffix),
    [supportPurpose],
    job,
  );
  return Object.freeze([
    internal(
      'left-post-to-cap',
      'left-post',
      'cap',
      'Carry the upper-left bearing boundary into the grounded left post.',
    ),
    internal(
      'left-post-to-saddle',
      'left-post',
      'saddle',
      'Carry the lower bearing cross-member into the grounded left post.',
    ),
    internal(
      'left-post-to-lower-left-liner',
      'left-post',
      'lower-left-liner',
      'Close the lower-left journal quadrant between its post and liner.',
    ),
    internal(
      'left-post-to-upper-left-liner',
      'left-post',
      'upper-left-liner',
      'Close the upper-left journal quadrant between its post and liner.',
    ),
    ...externalLeftPostInterfaces.map((external) => interfaceNeed(
      'frame',
      external.needKey,
      box('left-post'),
      external.toBoxKey,
      [supportPurpose, ...external.requiredByNeedIds],
      external.job,
    )),
    internal(
      'right-post-to-cap',
      'right-post',
      'cap',
      'Carry the upper-right bearing boundary into the grounded right post.',
    ),
    internal(
      'right-post-to-saddle',
      'right-post',
      'saddle',
      'Carry the lower bearing cross-member into the grounded right post.',
    ),
    internal(
      'right-post-to-lower-right-liner',
      'right-post',
      'lower-right-liner',
      'Close the lower-right journal quadrant between its post and liner.',
    ),
    internal(
      'right-post-to-upper-right-liner',
      'right-post',
      'upper-right-liner',
      'Close the upper-right journal quadrant between its post and liner.',
    ),
    internal(
      'cap-to-upper-left-liner',
      'cap',
      'upper-left-liner',
      'Close the upper-left journal quadrant between its cap and liner.',
    ),
    internal(
      'cap-to-upper-right-liner',
      'cap',
      'upper-right-liner',
      'Close the upper-right journal quadrant between its cap and liner.',
    ),
    internal(
      'saddle-to-lower-left-liner',
      'saddle',
      'lower-left-liner',
      'Close the lower-left journal quadrant between its saddle and liner.',
    ),
    internal(
      'saddle-to-lower-right-liner',
      'saddle',
      'lower-right-liner',
      'Close the lower-right journal quadrant between its saddle and liner.',
    ),
  ]);
}
function frameInterfaceNeeds(): readonly WindmillCompactInterfaceNeedV1[] {
  const bearingTie =
    'windmill:purpose:rotor-bearing-ground-tie' as const;
  const machineTie =
    'windmill:purpose:rotor-hammer-ground-tie' as const;
  return Object.freeze([
    ...bearingInterfaceNeeds('rotor-front-bearing', [
      {
        needKey: 'frame:front-bearing-to-bearing-tie',
        toBoxKey: 'rotor-bearing-ground-tie',
        requiredByNeedIds: [bearingTie],
        job: 'Join the front rotor bearing left footing to the axial ground tie.',
      },
    ]),
    ...bearingInterfaceNeeds('rotor-rear-bearing', [
      {
        needKey: 'frame:rear-bearing-to-bearing-tie',
        toBoxKey: 'rotor-bearing-ground-tie',
        requiredByNeedIds: [bearingTie],
        job: 'Join the rear rotor bearing left footing to the axial ground tie.',
      },
      {
        needKey: 'frame:rear-bearing-to-machine-z-tie',
        toBoxKey: 'rotor-to-hammer-ground-z',
        requiredByNeedIds: [machineTie],
        job: 'Start the fixed rotor-to-hammer datum at the rear rotor footing.',
      },
    ]),
    ...bearingInterfaceNeeds('hammer-rear-bearing', [
      {
        needKey: 'frame:hammer-bearing-to-machine-x-tie',
        toBoxKey: 'rotor-to-hammer-ground-x',
        requiredByNeedIds: [machineTie],
        job: 'Terminate the fixed rotor-to-hammer datum at the hammer footing.',
      },
    ]),
    interfaceNeed(
      'frame',
      'frame:machine-x-tie-to-z-tie',
      'rotor-to-hammer-ground-x',
      'rotor-to-hammer-ground-z',
      [machineTie],
      'Join the orthogonal ground-tie runs into one fixed machine datum.',
    ),
  ]);
}
function rotorInterfaceNeeds(parameters: WindmillCompactParametersV1):
readonly WindmillCompactInterfaceNeedV1[] {
  const need = (
    key: string,
    from: string,
    to: string,
    purposes: readonly PurposeNeedIdV1[],
    job: string,
    area = 1,
  ) => interfaceNeed('rotor', `rotor:${key}`, from, to, purposes, job, area);
  return Object.freeze([
    need(
      'shaft-to-west-collar',
      'rotor-shaft',
      'rotor-thrust-collar-west',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:rear-thrust-shoulder',
      ],
      'Attach the west thrust-shoulder arm to the continuous shaft.',
    ),
    need(
      'shaft-to-east-collar',
      'rotor-shaft',
      'rotor-thrust-collar-east',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:rear-thrust-shoulder',
      ],
      'Attach the east thrust-shoulder arm to the continuous shaft.',
    ),
    need(
      'shaft-to-north-spar',
      'rotor-shaft',
      'north-spar',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:north-sail-load-path',
      ],
      'Transmit the north sail load from its spar into the shaft.',
    ),
    need(
      'shaft-to-south-spar',
      'rotor-shaft',
      'south-spar',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:south-sail-load-path',
      ],
      'Transmit the south sail load from its spar into the shaft.',
    ),
    need(
      'shaft-to-primary-cam-arm',
      'rotor-shaft',
      'rotor-cam-arm',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:primary-cam-torque-arm',
      ],
      'Transmit shaft torque into the primary cam arm.',
    ),
    need(
      'shaft-to-opposed-cam-arm',
      'rotor-shaft',
      'rotor-opposed-cam-arm',
      [
        'windmill:purpose:continuous-rotor-shaft',
        'windmill:purpose:opposed-cam-torque-arm',
      ],
      'Transmit shaft torque into the opposed cam arm.',
    ),
    need(
      'north-spar-to-panel',
      'north-spar',
      'north-panel-step-z0',
      [
        'windmill:purpose:north-sail-load-path',
        'windmill:purpose:north-visible-pitched-panel',
      ],
      'Attach the north stepped wind-load surface to its radial spar.',
    ),
    need(
      'south-spar-to-panel',
      'south-spar',
      'south-panel-step-z0',
      [
        'windmill:purpose:south-sail-load-path',
        'windmill:purpose:south-visible-pitched-panel',
      ],
      'Attach the south stepped wind-load surface to its radial spar.',
    ),
    need(
      'north-panel-step',
      'north-panel-step-z0',
      'north-panel-step-z1',
      ['windmill:purpose:north-visible-pitched-panel'],
      'Join both authored courses into one north equivalent plate.',
      parameters.sailRadialSpanVoxels,
    ),
    need(
      'south-panel-step',
      'south-panel-step-z0',
      'south-panel-step-z1',
      ['windmill:purpose:south-visible-pitched-panel'],
      'Join both authored courses into one south equivalent plate.',
      parameters.sailRadialSpanVoxels,
    ),
    need(
      'primary-arm-to-nose',
      'rotor-cam-arm',
      'rotor-cam-nose',
      [
        'windmill:purpose:primary-cam-torque-arm',
        'windmill:purpose:primary-cam-contact-nose',
      ],
      'Terminate the primary torque arm at its exact contact nose.',
    ),
    need(
      'opposed-arm-to-nose',
      'rotor-opposed-cam-arm',
      'rotor-opposed-cam-nose',
      [
        'windmill:purpose:opposed-cam-torque-arm',
        'windmill:purpose:opposed-cam-contact-nose',
      ],
      'Terminate the opposed torque arm at its exact contact nose.',
    ),
  ]);
}
function hammerInterfaceNeeds(parameters: WindmillCompactParametersV1):
readonly WindmillCompactInterfaceNeedV1[] {
  const journal = 'windmill:purpose:continuous-hammer-journal' as const;
  const shoulder = 'windmill:purpose:rear-hammer-shoulder' as const;
  const follower = 'windmill:purpose:follower-to-pivot-load-path' as const;
  const headPath = 'windmill:purpose:pivot-to-head-load-path' as const;
  const toe = 'windmill:purpose:hammer-impact-toe' as const;
  const mass = 'windmill:purpose:hammer-head-return-mass' as const;
  const need = (
    key: string,
    from: string,
    to: string,
    purposes: readonly PurposeNeedIdV1[],
    job: string,
  ) => interfaceNeed('hammer', `hammer:${key}`, from, to, purposes, job);
  return Object.freeze([
    need(
      'journal-to-west-collar',
      'hammer-pivot-core',
      'hammer-collar-west',
      [journal, shoulder],
      'Attach the west hammer shoulder arm to the continuous journal.',
    ),
    need(
      'journal-to-east-collar',
      'hammer-pivot-core',
      'hammer-collar-east',
      [journal, shoulder],
      'Attach the east hammer shoulder arm to the continuous journal.',
    ),
    need(
      'journal-to-follower-link',
      'hammer-pivot-core',
      'hammer-follower-lower-link',
      [journal, follower],
      'Terminate the follower-side load path at the hammer journal.',
    ),
    need(
      'journal-to-head-beam',
      'hammer-pivot-core',
      'hammer-right-beam',
      [journal, headPath],
      'Start the impact-side load path at the hammer journal.',
    ),
    need(
      'shoe-to-upper-link',
      'hammer-follower-shoe',
      'hammer-follower-upper-link',
      [
        'windmill:purpose:cam-follower-contact-participant',
        follower,
      ],
      'Transmit follower contact into the first rigid link.',
    ),
    need(
      'upper-link-to-lower-link',
      'hammer-follower-upper-link',
      'hammer-follower-lower-link',
      [follower],
      'Join both follower-link courses into one rigid pivot path.',
    ),
    ...(parameters.hammerHeadHeightVoxels === 1
      ? [
        need(
          'head-beam-to-toe',
          'hammer-right-beam',
          'hammer-impact-toe',
          [headPath, toe],
          'Terminate the H1 impact-side beam directly at its toe.',
        ),
      ]
      : [
        need(
          'head-beam-to-mass',
          'hammer-right-beam',
          'hammer-head-mass',
          [headPath, mass],
          'Terminate the impact-side beam at the added head-mass run.',
        ),
        need(
          'toe-to-head-mass',
          'hammer-impact-toe',
          'hammer-head-mass',
          [toe, mass],
          'Connect the localized impact toe to the added head-mass run.',
        ),
      ]),
  ]);
}
function anvilFaceY(parameters: WindmillCompactParametersV1): number {
  return parameters.rotorRadiusVoxels
    + parameters.groundClearanceVoxels
    - parameters.hammerHeadHeightVoxels
    - parameters.initialHeadAnvilClearanceVoxels
    - 3;
}
export function windmillCompactInterfaceGrammarV1(
  parameters: WindmillCompactParametersV1,
): WindmillCompactInterfaceGrammarV1 {
  const hasHeadMass = parameters.hammerHeadHeightVoxels > 1;
  const hasAnvilColumn = anvilFaceY(parameters) > 0;
  const expectedBoxKeys = Object.freeze({
    frame: Object.freeze([
      ...bearingBoxKeys('rotor-front-bearing'),
      ...bearingBoxKeys('rotor-rear-bearing'),
      'rotor-bearing-ground-tie',
      ...bearingBoxKeys('hammer-rear-bearing'),
      'rotor-to-hammer-ground-x',
      'rotor-to-hammer-ground-z',
    ]),
    rotor: Object.freeze([
      'rotor-shaft',
      'rotor-thrust-collar-west',
      'rotor-thrust-collar-east',
      'north-spar',
      'south-spar',
      'north-panel-step-z0',
      'north-panel-step-z1',
      'south-panel-step-z0',
      'south-panel-step-z1',
      'rotor-cam-arm',
      'rotor-cam-nose',
      'rotor-opposed-cam-arm',
      'rotor-opposed-cam-nose',
    ]),
    hammer: Object.freeze([
      'hammer-pivot-core',
      'hammer-collar-west',
      'hammer-collar-east',
      'hammer-follower-shoe',
      'hammer-follower-upper-link',
      'hammer-follower-lower-link',
      'hammer-right-beam',
      'hammer-impact-toe',
      ...(hasHeadMass ? ['hammer-head-mass'] : []),
    ]),
    anvil: Object.freeze([
      ...(hasAnvilColumn ? ['anvil-column'] : []),
      'anvil-impact-cap',
    ]),
  });
  const interfaceNeeds = Object.freeze([
    ...frameInterfaceNeeds(),
    ...rotorInterfaceNeeds(parameters),
    ...hammerInterfaceNeeds(parameters),
    ...(hasAnvilColumn
      ? [
        interfaceNeed(
          'anvil',
          'anvil:column-to-impact-cap',
          'anvil-column',
          'anvil-impact-cap',
          [
            'windmill:purpose:direct-ground-impact-reaction',
            'windmill:purpose:hammer-contact-witness-face',
          ],
          'Carry the fixed impact cap directly into its ground column.',
        ),
      ]
      : []),
  ]);
  return Object.freeze({
    schema: WINDMILL_COMPACT_INTERFACE_GRAMMAR_SCHEMA_V1,
    expectedBoxKeys,
    interfaceNeeds,
  });
}
