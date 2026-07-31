import {
  WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1,
  createWindmillCompactCandidateV1,
  type WindmillCompactAssetKeyV1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
  type WindmillCompactSailFrameV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  createWindmillCompactPhysicalAssetsV1,
} from '../../tools/studio/windmill-compact-physical-assets.js';
import {
  deriveWindmillCompactPanelBasisV1,
  type WindmillCompactPanelBasisV1,
} from '../../tools/studio/windmill-compact-panel-basis.js';
import {
  WINDMILL_RECIPE_IDS_V1,
} from '../../tools/studio/windmill-layout.js';
import {
  WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
  WINDMILL_MATERIAL_PROFILES_V1,
  WINDMILL_OPERATIONAL_INPUTS_V1,
  type WindmillMaterialProfileNameV1,
} from './windmill-operational-inputs.js';
import {
  canonicalWindmillEvidenceJsonV1,
  windmillEvidenceSha256V1,
} from './windmill-evidence-hash.js';
import type {
  WindmillPitchedPlateFrameV1,
} from './windmill-pitched-plate-runtime.js';
import type {
  WindmillCompiledCompactCandidateV1,
  WindmillCompactWorldSailFrameV1,
} from './windmill-compact-physical-contract.js';
import {
  WINDMILL_COMPACT_PHYSICAL_EPSILON as EPSILON,
  WINDMILL_COMPACT_SHAFT_AXIS_Z as AXIS_Z,
  addCompactTriple as add,
  compactBoxCenter as centerOfBox,
  compactTriple as triple,
  compactTripleMagnitude as magnitude,
  compactTriplesClose as close,
  compactVoxelsToMeters as meters,
  dotCompactTriple as dot,
  scaleCompactTriple as scale,
  sortedCompactCells as sortedCells,
  subtractCompactTriple as subtract,
} from '../../tools/studio/windmill-compact-physical-math.js';
import {
  WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
} from './windmill-compact-evaluator-config.js';
import {
  compileWindmillCompactContactIndicesV1,
} from './windmill-compact-contact-indices.js';

export {
  deriveWindmillCompactPanelBasisV1,
  type WindmillCompactPanelBasisV1,
};
const ASSET_KEYS = Object.freeze([
  'frame',
  'rotor',
  'hammer',
  'anvil',
] as const satisfies readonly WindmillCompactAssetKeyV1[]);

export interface WindmillCompactSolverInputBindingV1 {
  readonly physicalSidecarSha256: string;
  readonly operationalInputs: typeof WINDMILL_OPERATIONAL_INPUTS_V1;
  readonly bodyWorldMeters:
    WindmillCompiledCompactCandidateV1['bodyWorldMeters'];
  readonly ports: WindmillCompactCandidateV1['ports'];
  readonly contactColliderIndices:
    WindmillCompiledCompactCandidateV1['contactColliderIndices'];
  readonly pitchedPlateFrames:
    WindmillCompiledCompactCandidateV1['pitchedPlateFrames'];
}

export function windmillCompactSolverInputSha256V1(
  binding: WindmillCompactSolverInputBindingV1,
): string {
  if (!/^[0-9a-f]{64}$/.test(binding.physicalSidecarSha256)) {
    throw new Error(
      'Cannot hash compact windmill solver input: '
      + `physicalSidecarSha256 '${binding.physicalSidecarSha256}' must be `
      + 'exactly 64 lowercase hexadecimal characters.',
    );
  }
  return windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(binding),
  ]);
}

function compileSailFrame(
  candidate: WindmillCompactCandidateV1,
  declaration: WindmillCompactSailFrameV1,
): {
  readonly pitched: WindmillPitchedPlateFrameV1;
  readonly world: WindmillCompactWorldSailFrameV1;
} {
  const rotor = candidate.assets.rotor;
  const boxes = declaration.panelBoxKeys.map((key) => {
    const box = rotor.boxes.find((entry) => entry.key === key);
    if (box === undefined) {
      throw new Error(
        `Cannot compile compact windmill sail '${declaration.key}': panel `
        + `box '${key}' is absent from the exact rotor union.`,
      );
    }
    if (box.materialProfile !== 'sail') {
      throw new Error(
        `Cannot compile compact windmill sail '${declaration.key}': box `
        + `'${key}' uses '${box.materialProfile}', expected 'sail'.`,
      );
    }
    return box;
  });
  const basis = deriveWindmillCompactPanelBasisV1(
    boxes,
    rotor.bodyOriginVoxels,
    declaration.localShaftPointVoxels,
  );
  const {
    panelCells,
    centroid,
    radial,
    chord,
    normal,
    endpoints,
    radialSpan,
    chordSpan,
    equivalentAreaVoxels,
  } = basis;
  if (canonicalWindmillEvidenceJsonV1(panelCells)
    !== canonicalWindmillEvidenceJsonV1(
      sortedCells(declaration.panelOccupiedCells),
    )) {
    throw new Error(
      `Cannot compile compact windmill sail '${declaration.key}': declared `
      + 'panel occupied cells do not equal the exact panel-box union.',
    );
  }
  const shaft = declaration.localShaftPointVoxels;
  const shaftWorldVoxels = add(rotor.bodyWorldVoxels, shaft);
  const centroidWorldVoxels = add(rotor.bodyWorldVoxels, centroid);
  const endpointsWorldVoxels = [
    add(rotor.bodyWorldVoxels, endpoints[0]),
    add(rotor.bodyWorldVoxels, endpoints[1]),
  ] as const;
  const mismatches = [
    !close(centroid, declaration.localCentroidVoxels) && 'centroid',
    !close(radial, declaration.localRadialUnit) && 'radial',
    !close(chord, declaration.localChordUnit) && 'chord',
    !close(normal, declaration.localNormalUnit) && 'normal',
    !close(endpoints[0], declaration.localStepEndpointsVoxels[0])
      && 'low-step-endpoint',
    !close(endpoints[1], declaration.localStepEndpointsVoxels[1])
      && 'high-step-endpoint',
    !close(shaftWorldVoxels, declaration.worldShaftPointVoxels)
      && 'world-shaft-point',
    !close(centroidWorldVoxels, declaration.worldCentroidVoxels)
      && 'world-centroid',
    !close(endpointsWorldVoxels[0],
      declaration.worldStepEndpointsVoxels[0]) && 'world-low-step-endpoint',
    !close(endpointsWorldVoxels[1],
      declaration.worldStepEndpointsVoxels[1]) && 'world-high-step-endpoint',
    Math.abs(radialSpan - declaration.radialSpanVoxels) > EPSILON
      && 'radial-span',
    Math.abs(chordSpan - declaration.chordSpanVoxels) > EPSILON
      && 'chord-span',
    Math.abs(equivalentAreaVoxels
      - declaration.equivalentPlateAreaSquareVoxels) > EPSILON
      && 'equivalent-fitted-area',
  ].filter(Boolean);
  if (mismatches.length > 0) {
    throw new Error(
      `Cannot compile compact windmill sail '${declaration.key}': generator `
      + `frame fields [${mismatches.join(', ')}] do not rederive from the `
      + 'exact visible stepped occupied union.',
    );
  }
  const grain = candidate.grainMeters;
  const bodyWorld = meters(rotor.bodyWorldVoxels, grain);
  const panelMass = panelCells.length
    * WINDMILL_MATERIAL_PROFILES_V1.sail.densityKilogramsPerVoxelCube;
  const pitched: WindmillPitchedPlateFrameV1 = Object.freeze({
    key: declaration.key,
    localShaftPointMeters: meters(shaft, grain),
    localShaftAxisUnit: AXIS_Z,
    localCentroidMeters: meters(centroid, grain),
    localRadialUnit: radial,
    localChordUnit: chord,
    localNormalUnit: normal,
    radialSpanMeters: radialSpan * grain,
    chordSpanMeters: chordSpan * grain,
    equivalentPlateAreaSquareMeters:
      equivalentAreaVoxels * grain ** 2,
    massKilograms: panelMass,
  });
  return {
    pitched,
    world: Object.freeze({
      key: declaration.key,
      shaftPointWorldMeters: add(bodyWorld, pitched.localShaftPointMeters),
      centroidWorldMeters: add(bodyWorld, pitched.localCentroidMeters),
      stepEndpointsWorldMeters: Object.freeze([
        meters(endpointsWorldVoxels[0], grain),
        meters(endpointsWorldVoxels[1], grain),
      ] as const),
      radialUnitWorld: radial,
      chordUnitWorld: chord,
      normalUnitWorld: normal,
    }),
  };
}

export function assertWindmillCompactRotorBalanceV1(
  candidate: WindmillCompactCandidateV1,
): void {
  const camDensity =
    WINDMILL_MATERIAL_PROFILES_V1.cam.densityKilogramsPerVoxelCube;
  const volume = (box: WindmillCompactBoxV1) =>
    box.size[0] * box.size[1] * box.size[2];
  const namedCam = (key: string) => candidate.assets.rotor.boxes.find(
    (box) => box.key === key,
  );
  const primaryCam = [
    namedCam('rotor-cam-arm'),
    namedCam('rotor-cam-nose'),
  ];
  const opposedCam = [
    namedCam('rotor-opposed-cam-arm'),
    namedCam('rotor-opposed-cam-nose'),
  ];
  const camBoxes = [...primaryCam, ...opposedCam];
  const primaryVolume = primaryCam.reduce(
    (sum, box) => sum + (box === undefined ? 0 : volume(box)),
    0,
  );
  const opposedVolume = opposedCam.reduce(
    (sum, box) => sum + (box === undefined ? 0 : volume(box)),
    0,
  );
  if (camBoxes.some((box) => box === undefined)
    || camBoxes.some((box) => box?.materialProfile !== 'cam')
    || primaryVolume !== opposedVolume) {
    throw new Error(
      `Cannot compile compact windmill '${candidate.parameterKey}': primary `
      + `dual-lobe cam volume ${String(primaryVolume)} and opposed volume `
      + `${String(opposedVolume)} must be equal, and all four exact named arm `
      + 'and nose boxes must use the same cam mass profile.',
    );
  }
  const rotorAxis = candidate.ports.find((port) =>
    port.key === 'rotor-axis');
  if (rotorAxis === undefined || camDensity === null) {
    throw new Error(
      `Cannot compile compact windmill '${candidate.parameterKey}': rotor `
      + 'axis port or finite cam density is missing from the operational inputs.',
    );
  }
  const balance = candidate.assets.rotor.boxes.reduce(
    (sum, box) => {
      const density = WINDMILL_MATERIAL_PROFILES_V1[
        box.materialProfile as WindmillMaterialProfileNameV1
      ].densityKilogramsPerVoxelCube;
      if (density === null) {
        throw new Error(
          `Cannot compile compact windmill '${candidate.parameterKey}': `
          + `balance box '${box.key}' has no operational density.`,
        );
      }
      const mass = volume(box) * density;
      const radius = subtract(
        centerOfBox(box, candidate.assets.rotor.bodyOriginVoxels),
        rotorAxis.positionVoxels,
      );
      const axial = dot(radius, AXIS_Z);
      const radial = subtract(radius, scale(AXIS_Z, axial));
      return {
        radialFirstMoment: add(
          sum.radialFirstMoment,
          scale(radial, mass),
        ),
        axialWeightedRadialCouple: add(
          sum.axialWeightedRadialCouple,
          scale(radial, mass * axial),
        ),
      };
    },
    {
      radialFirstMoment: triple(0, 0, 0),
      axialWeightedRadialCouple: triple(0, 0, 0),
    },
  );
  if (magnitude(balance.radialFirstMoment) > EPSILON
    || magnitude(balance.axialWeightedRadialCouple) > EPSILON) {
    throw new Error(
      `Cannot compile compact windmill '${candidate.parameterKey}': `
      + `density-weighted full-rotor radial first moment is `
      + `[${balance.radialFirstMoment.join(', ')}] kg*voxel and axial-weighted `
      + `radial couple is `
      + `[${balance.axialWeightedRadialCouple.join(', ')}] kg*voxel^2; `
      + 'expected both to be zero about the shaft axis.',
    );
  }
}

function assertCanonicalCandidate(
  candidate: WindmillCompactCandidateV1,
): void {
  const canonical = createWindmillCompactCandidateV1(candidate.parameters);
  if (canonicalWindmillEvidenceJsonV1(candidate)
    !== canonicalWindmillEvidenceJsonV1(canonical)) {
    throw new Error(
      `Cannot compile compact windmill '${candidate.parameterKey}': supplied `
      + 'candidate is not the exact canonical generator result for its '
      + `parameter tuple (canonical fingerprint `
      + `'${canonical.geometryFingerprint}', supplied `
      + `'${candidate.geometryFingerprint}'). Rebuild it from parameters; `
      + 'do not forge cells, boxes, frames, counts, interfaces, or hashes.',
    );
  }
}

export function compileWindmillCompactCandidateV1(
  candidate: WindmillCompactCandidateV1 =
    createWindmillCompactCandidateV1(),
): WindmillCompiledCompactCandidateV1 {
  if (candidate.schema !== WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1) {
    throw new Error(
      `Cannot compile compact windmill schema '${String(candidate.schema)}'; `
      + `expected '${WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1}'.`,
    );
  }
  assertCanonicalCandidate(candidate);
  assertWindmillCompactRotorBalanceV1(candidate);
  const sharedSidecars = createWindmillCompactPhysicalAssetsV1(
    candidate,
    WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1,
  );
  const physicalAssets = Object.freeze(Object.fromEntries(
    ASSET_KEYS.map((key) => [
      key,
      sharedSidecars.physicalAssetBook[WINDMILL_RECIPE_IDS_V1[key]],
    ]),
  )) as WindmillCompiledCompactCandidateV1['physicalAssets'];
  const boxColliderIndices = Object.freeze(Object.fromEntries(
    ASSET_KEYS.map((key) => [
      key,
      sharedSidecars.colliderIndexByBoxKey[WINDMILL_RECIPE_IDS_V1[key]],
    ]),
  )) as WindmillCompiledCompactCandidateV1['boxColliderIndices'];
  const bodyWorldMeters = Object.freeze(Object.fromEntries(
    ASSET_KEYS.map((key) => [
      key,
      meters(candidate.assets[key].bodyWorldVoxels, candidate.grainMeters),
    ]),
  )) as WindmillCompiledCompactCandidateV1['bodyWorldMeters'];
  const sailEntries = candidate.sails.map((sail) =>
    compileSailFrame(candidate, sail));
  const contactColliderIndices = compileWindmillCompactContactIndicesV1(
    candidate,
    boxColliderIndices,
  );
  const visibleGeometrySha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(candidate),
  ]);
  const physicalSidecarSha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1({
      physicalAssets,
      boxColliderIndices,
    }),
  ]);
  const evaluatorDeclarationSha256 = windmillEvidenceSha256V1([
    canonicalWindmillEvidenceJsonV1(
      WINDMILL_COMPACT_EVALUATOR_DECLARATION_V1,
    ),
  ]);
  const pitchedPlateFrames = Object.freeze([
    sailEntries[0]!.pitched,
    sailEntries[1]!.pitched,
  ]);
  const solverInputSha256 = windmillCompactSolverInputSha256V1({
    physicalSidecarSha256,
    operationalInputs: WINDMILL_OPERATIONAL_INPUTS_V1,
    bodyWorldMeters,
    ports: candidate.ports,
    contactColliderIndices,
    pitchedPlateFrames,
  });
  return Object.freeze({
    schema: 'fixture.windmill-compiled-compact-candidate/1',
    candidate,
    physicalAssets,
    bodyWorldMeters,
    boxColliderIndices,
    contactColliderIndices,
    pitchedPlateFrames,
    worldSailFrames: Object.freeze([
      sailEntries[0]!.world,
      sailEntries[1]!.world,
    ]),
    visibleGeometrySha256,
    physicalSidecarSha256,
    solverInputSha256,
    evaluatorDeclarationSha256,
  });
}
