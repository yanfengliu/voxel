import { exactMagnitudeV1 } from '../deterministic-math.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';
import type { PhysicalAssetV1 } from '../../tools/studio/physical-asset.js';
import {
  physicalAssetAxisAlignedSolidBounds,
  scaledPortPosition,
  translated,
  voxelBoxBounds,
  type AuthoredVoxelBoxV1,
  type AxisAlignedBoundsV1,
  type SupportPointV1,
} from './machine-works-support-geometry.js';

type QuaternionV1 = readonly [number, number, number, number];

const CARRIAGE_ORIGIN = [7.5, 3, 11.5] as const;
const TRUNNION_BOX = {
  atVoxels: [14, 2, 0],
  sizeVoxels: [1, 2, 23],
} as const satisfies AuthoredVoxelBoxV1;

export interface MachineWorksOutputDockSweepMeasurementV1 {
  readonly issues: readonly string[];
  readonly minimumClearance: number | null;
  readonly requiredClearance: number;
  readonly sweptRadius: number | null;
  readonly limitingDockSolid: number | null;
  readonly minimumFoundationClearance: number | null;
  readonly limitingFoundationCarrierSolid: number | null;
  readonly limitingFoundationSolid: number | null;
  readonly minimumBucketClearance: number | null;
  readonly limitingBucketCarrierSolid: number | null;
  readonly limitingBucketSolid: number | null;
}
export interface MachineWorksOutputDockSweepInputV1 {
  readonly carriage: PhysicalAssetV1;
  readonly dock: PhysicalAssetV1;
  readonly foundation: PhysicalAssetV1;
  readonly bucket: PhysicalAssetV1;
  readonly carriageGrain: number;
  readonly dockGrain: number;
  readonly foundationGrain: number;
  readonly bucketGrain: number;
  readonly carriageCenter: SupportPointV1;
  readonly dockCenter: SupportPointV1;
  readonly foundationCenter: SupportPointV1;
  readonly bucketCenter: SupportPointV1;
  readonly carriageRotation: QuaternionV1;
  readonly tipRadians: number;
  readonly maximumError: number;
}
export interface MachineWorksOutputDockHandoffEvidenceV1 {
  readonly tick: number;
  readonly pivot: SupportPointV1;
  readonly rotation: QuaternionV1;
  readonly tipRadians: number;
  readonly minimumClearance: number;
  readonly requiredClearance: number;
  readonly sweptRadius: number;
  readonly limitingDockSolid: number;
  readonly minimumFoundationClearance: number;
  readonly limitingFoundationCarrierSolid: number;
  readonly limitingFoundationSolid: number;
  readonly minimumBucketClearance: number;
  readonly limitingBucketCarrierSolid: number;
  readonly limitingBucketSolid: number;
}
function rangesHavePositiveOverlap(
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number,
  maximumError: number,
): boolean {
  return leftMin < rightMax - maximumError
    && leftMax > rightMin + maximumError;
}
function pointToBoundsDistance2d(
  point: SupportPointV1,
  bounds: AxisAlignedBoundsV1,
): number {
  const dx = point[0] < bounds.min[0]
    ? bounds.min[0] - point[0]
    : Math.max(0, point[0] - bounds.max[0]);
  const dy = point[1] < bounds.min[1]
    ? bounds.min[1] - point[1]
    : Math.max(0, point[1] - bounds.max[1]);
  return exactMagnitudeV1(dx, dy);
}
function normalizedQuaternion(rotation: QuaternionV1): QuaternionV1 | null {
  const magnitude = exactMagnitudeV1(...rotation);
  if (!Number.isFinite(magnitude) || magnitude <= Number.EPSILON) return null;
  return [
    rotation[0] / magnitude,
    rotation[1] / magnitude,
    rotation[2] / magnitude,
    rotation[3] / magnitude,
  ];
}
function rotate(
  rotation: QuaternionV1,
  point: SupportPointV1,
): SupportPointV1 {
  const [x, y, z, w] = rotation;
  const [px, py, pz] = point;
  return [
    (1 - 2 * (y * y + z * z)) * px
      + 2 * (x * y - z * w) * py
      + 2 * (x * z + y * w) * pz,
    2 * (x * y + z * w) * px
      + (1 - 2 * (x * x + z * z)) * py
      + 2 * (y * z - x * w) * pz,
    2 * (x * z - y * w) * px
      + 2 * (y * z + x * w) * py
      + (1 - 2 * (x * x + y * y)) * pz,
  ];
}
function sweptTrunnionEnvelope(
  trunnion: AxisAlignedBoundsV1,
  bodyCenter: SupportPointV1,
  pivot: SupportPointV1,
  rotation: QuaternionV1,
): { readonly radius: number; readonly minZ: number; readonly maxZ: number } {
  const swept = sweptSolidBounds(
    trunnion, bodyCenter, pivot, rotation, Math.PI * 2,
  );
  return {
    radius: Math.max(pivot[0] - swept.min[0], swept.max[0] - pivot[0]),
    minZ: swept.min[2],
    maxZ: swept.max[2],
  };
}
function intervalIncludesPeriodicAngle(
  minimum: number,
  maximum: number,
  candidate: number,
): boolean {
  const period = Math.PI * 2;
  const turns = Math.ceil((minimum - candidate) / period);
  const equivalent = candidate + turns * period;
  const tolerance = Number.EPSILON * 16
    * Math.max(1, Math.abs(minimum), Math.abs(maximum), Math.abs(candidate));
  return equivalent <= maximum + tolerance;
}
function sinusoidRange(
  cosineCoefficient: number,
  sineCoefficient: number,
  minimumAngle: number,
  maximumAngle: number,
): readonly [number, number] {
  const radius = exactMagnitudeV1(cosineCoefficient, sineCoefficient);
  if (radius === 0) return [0, 0];
  const period = Math.PI * 2;
  const tolerance = Number.EPSILON * 16
    * Math.max(1, Math.abs(minimumAngle), Math.abs(maximumAngle));
  if (maximumAngle - minimumAngle >= period - tolerance) {
    return [-radius, radius];
  }
  const values = [
    cosineCoefficient * Math.cos(minimumAngle)
      + sineCoefficient * Math.sin(minimumAngle),
    cosineCoefficient * Math.cos(maximumAngle)
      + sineCoefficient * Math.sin(maximumAngle),
  ];
  const maximumPhase = Math.atan2(sineCoefficient, cosineCoefficient);
  if (intervalIncludesPeriodicAngle(minimumAngle, maximumAngle, maximumPhase)) {
    values.push(radius);
  }
  if (intervalIncludesPeriodicAngle(
    minimumAngle, maximumAngle, maximumPhase + Math.PI,
  )) {
    values.push(-radius);
  }
  return [Math.min(...values), Math.max(...values)];
}
/** Exact bounds from transformed corners, endpoints, and every sin/cos
 * extremum; no angle sampling can miss a narrow mid-turn excursion. */
function sweptSolidBounds(
  bounds: AxisAlignedBoundsV1,
  bodyCenter: SupportPointV1,
  pivot: SupportPointV1,
  rotation: QuaternionV1,
  tipRadians: number,
): AxisAlignedBoundsV1 {
  const minimumAngle = Math.min(0, tipRadians);
  const maximumAngle = Math.max(0, tipRadians);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let corner = 0; corner < 8; corner += 1) {
    const rotated = rotate(rotation, [
      bounds[corner & 1 ? 'max' : 'min'][0] - bodyCenter[0],
      bounds[corner & 2 ? 'max' : 'min'][1] - bodyCenter[1],
      bounds[corner & 4 ? 'max' : 'min'][2] - bodyCenter[2],
    ]);
    const world: SupportPointV1 = [
      bodyCenter[0] + rotated[0],
      bodyCenter[1] + rotated[1],
      bodyCenter[2] + rotated[2],
    ];
    const relativeX = world[0] - pivot[0];
    const relativeY = world[1] - pivot[1];
    const xRange = sinusoidRange(relativeX, -relativeY, minimumAngle, maximumAngle);
    const yRange = sinusoidRange(relativeY, relativeX, minimumAngle, maximumAngle);
    minX = Math.min(minX, pivot[0] + xRange[0]);
    maxX = Math.max(maxX, pivot[0] + xRange[1]);
    minY = Math.min(minY, pivot[1] + yRange[0]);
    maxY = Math.max(maxY, pivot[1] + yRange[1]);
    minZ = Math.min(minZ, world[2]);
    maxZ = Math.max(maxZ, world[2]);
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}
interface StaticSweepMeasurementV1 {
  readonly clearance: number | null;
  readonly carrierSolid: number | null;
  readonly fixedSolid: number | null;
}
function staticSweepMeasurement(
  sweptCarrierSolids: readonly AxisAlignedBoundsV1[],
  fixedSolids: readonly AxisAlignedBoundsV1[],
): StaticSweepMeasurementV1 {
  let clearance = Number.POSITIVE_INFINITY;
  let carrierSolid = -1;
  let fixedSolid = -1;
  for (let carrierIndex = 0; carrierIndex < sweptCarrierSolids.length; carrierIndex += 1) {
    for (let fixedIndex = 0; fixedIndex < fixedSolids.length; fixedIndex += 1) {
      const swept = sweptCarrierSolids[carrierIndex]!;
      const fixed = fixedSolids[fixedIndex]!;
      let candidate = Number.NEGATIVE_INFINITY;
      for (let axis = 0; axis < 3; axis += 1) {
        candidate = Math.max(
          candidate, fixed.min[axis]! - swept.max[axis]!,
          swept.min[axis]! - fixed.max[axis]!,
        );
      }
      if (candidate < clearance) {
        clearance = candidate;
        carrierSolid = carrierIndex;
        fixedSolid = fixedIndex;
      }
    }
  }
  return {
    clearance: Number.isFinite(clearance) ? clearance : null,
    carrierSolid: carrierSolid >= 0 ? carrierSolid : null,
    fixedSolid: fixedSolid >= 0 ? fixedSolid : null,
  };
}
function environmentSweepIssue(
  label: 'foundation' | 'bucket',
  measurement: StaticSweepMeasurementV1,
  maximumError: number,
): string | null {
  if (measurement.clearance === null
    || measurement.carrierSolid === null
    || measurement.fixedSolid === null) {
    return `continuous carrier-versus-${label} proof requires at least one solid `
      + `in both the carrier and ${label} sidecars`;
  }
  if (measurement.clearance >= -maximumError) return null;
  return `cannot prove continuous carrier-versus-${label} nonoverlap through the full `
    + `prescribed rotation: analytic swept AABB for carrier solid `
    + `${String(measurement.carrierSolid)} positively overlaps ${label} solid `
    + `${String(measurement.fixedSolid)} with signed separating-axis clearance `
    + `${measurement.clearance.toFixed(6)}; move the solids until the full-interval `
    + 'envelopes are axis-separated';
}
function unsupportedSweepMeasurement(
  issues: readonly string[],
  requiredClearance: number,
): MachineWorksOutputDockSweepMeasurementV1 {
  return {
    issues,
    minimumClearance: null,
    requiredClearance,
    sweptRadius: null,
    limitingDockSolid: null,
    minimumFoundationClearance: null,
    limitingFoundationCarrierSolid: null,
    limitingFoundationSolid: null,
    minimumBucketClearance: null,
    limitingBucketCarrierSolid: null,
    limitingBucketSolid: null,
  };
}
export function machineWorksOutputDockSweepMeasurementV1(
  input: MachineWorksOutputDockSweepInputV1,
): MachineWorksOutputDockSweepMeasurementV1 {
  const i = input;
  const issues: string[] = [];
  const rotation = normalizedQuaternion(i.carriageRotation);
  const requiredClearance = MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.minimumSweptClearance;
  if (rotation === null) {
    return unsupportedSweepMeasurement(
      ['carrier output handoff rotation must be a finite nonzero quaternion'],
      requiredClearance,
    );
  }
  if (!Number.isFinite(i.tipRadians)) {
    return unsupportedSweepMeasurement(
      [`carrier output handoff tip angle must be finite; received ${String(i.tipRadians)}`],
      requiredClearance,
    );
  }
  if (!Number.isFinite(i.maximumError) || i.maximumError < 0) {
    return unsupportedSweepMeasurement(
      [`output sweep maximum error must be a finite nonnegative number; received `
        + `${String(i.maximumError)}`],
      requiredClearance,
    );
  }
  const invalidGrain = ([
    ['carrier', i.carriageGrain], ['dock', i.dockGrain],
    ['foundation', i.foundationGrain], ['bucket', i.bucketGrain],
  ] as const).find(([, grain]) => !Number.isFinite(grain) || grain <= 0);
  if (invalidGrain !== undefined) {
    return unsupportedSweepMeasurement(
      [`output sweep ${invalidGrain[0]} grain must be finite and strictly positive; `
        + `received ${String(invalidGrain[1])}`],
      requiredClearance,
    );
  }
  const trunnion = voxelBoxBounds(
    TRUNNION_BOX, CARRIAGE_ORIGIN, i.carriageGrain, i.carriageCenter,
  );
  const pivot = translated(
    scaledPortPosition(i.carriage, 'tip-pivot-axis', i.carriageGrain),
    i.carriageCenter,
  );
  const carrierSolids = physicalAssetAxisAlignedSolidBounds(
    i.carriage, i.carriageGrain, i.carriageCenter,
  );
  const dockSolids = physicalAssetAxisAlignedSolidBounds(
    i.dock, i.dockGrain, i.dockCenter,
  );
  const foundationSolids = physicalAssetAxisAlignedSolidBounds(
    i.foundation, i.foundationGrain, i.foundationCenter,
  );
  const bucketSolids = physicalAssetAxisAlignedSolidBounds(
    i.bucket, i.bucketGrain, i.bucketCenter,
  );
  if (carrierSolids === null || dockSolids === null
    || foundationSolids === null || bucketSolids === null) {
    return unsupportedSweepMeasurement(
      [
        'output sweep proof requires axis-aligned box solids in the carrier, dock, '
        + 'foundation, and bucket sidecars',
      ],
      requiredClearance,
    );
  }
  const sweptCarrierSolids = carrierSolids.map((solid) =>
    sweptSolidBounds(solid, i.carriageCenter, pivot, rotation, i.tipRadians));
  const trunnionIndex = carrierSolids.findIndex((bounds) =>
    bounds.min.every((value, axis) =>
      Math.abs(value - trunnion.min[axis]!) <= i.maximumError
        && Math.abs(bounds.max[axis]! - trunnion.max[axis]!) <= i.maximumError));
  if (trunnionIndex < 0) {
    issues.push('carrier sidecar has no exact full-depth trunnion axle box');
  }
  const envelope = sweptTrunnionEnvelope(
    trunnion, i.carriageCenter, pivot, rotation,
  );
  let minimumClearance = Number.POSITIVE_INFINITY;
  let limitingDockSolid = -1;
  for (let dockIndex = 0; dockIndex < dockSolids.length; dockIndex += 1) {
    const dockSolid = dockSolids[dockIndex]!;
    if (!rangesHavePositiveOverlap(
      dockSolid.min[2], dockSolid.max[2],
      envelope.minZ, envelope.maxZ,
      i.maximumError,
    )) continue;
    const clearance = pointToBoundsDistance2d(pivot, dockSolid) - envelope.radius;
    if (clearance < minimumClearance) {
      minimumClearance = clearance;
      limitingDockSolid = dockIndex;
    }
  }
  for (let carrierIndex = 0; carrierIndex < carrierSolids.length; carrierIndex += 1) {
    if (carrierIndex === trunnionIndex) continue;
    const sweptCarrier = sweptCarrierSolids[carrierIndex]!;
    for (let dockIndex = 0; dockIndex < dockSolids.length; dockIndex += 1) {
      const dockSolid = dockSolids[dockIndex]!;
      if (!rangesHavePositiveOverlap(
        sweptCarrier.min[2], sweptCarrier.max[2],
        dockSolid.min[2], dockSolid.max[2],
        i.maximumError,
      )) continue;
      issues.push(
        `non-trunnion carrier solid ${String(carrierIndex)} has swept z=[`
        + `${sweptCarrier.min[2].toFixed(3)}, ${sweptCarrier.max[2].toFixed(3)}], `
        + 'which enters '
        + `dock solid ${String(dockIndex)} z=[${dockSolid.min[2].toFixed(3)}, `
        + `${dockSolid.max[2].toFixed(3)}]; separate the outboard bearing structure `
        + 'axially before prescribing rotation',
      );
    }
  }
  if (!Number.isFinite(minimumClearance)) {
    issues.push(
      'output dock has no solid spanning the trunnion axial interval, '
      + `so its required ${requiredClearance.toFixed(3)}-unit sweep clearance is unsupported`,
    );
  } else if (minimumClearance < requiredClearance - i.maximumError) {
    issues.push(
      'output dock does not clear the carrier trunnion through its full prescribed rotation: '
      + `limiting solid ${String(limitingDockSolid)} leaves `
      + `${minimumClearance.toFixed(6)} world units around the `
      + `radius-${envelope.radius.toFixed(6)} live swept envelope; `
      + `at least ${requiredClearance.toFixed(3)} is required`,
    );
  }
  const foundationMeasurement = staticSweepMeasurement(
    sweptCarrierSolids, foundationSolids,
  );
  const bucketMeasurement = staticSweepMeasurement(
    sweptCarrierSolids, bucketSolids,
  );
  const foundationIssue = environmentSweepIssue(
    'foundation', foundationMeasurement, i.maximumError,
  );
  if (foundationIssue !== null) issues.push(foundationIssue);
  const bucketIssue = environmentSweepIssue(
    'bucket', bucketMeasurement, i.maximumError,
  );
  if (bucketIssue !== null) issues.push(bucketIssue);
  return {
    issues,
    minimumClearance: Number.isFinite(minimumClearance) ? minimumClearance : null,
    requiredClearance,
    sweptRadius: envelope.radius,
    limitingDockSolid: limitingDockSolid >= 0 ? limitingDockSolid : null,
    minimumFoundationClearance: foundationMeasurement.clearance,
    limitingFoundationCarrierSolid: foundationMeasurement.carrierSolid,
    limitingFoundationSolid: foundationMeasurement.fixedSolid,
    minimumBucketClearance: bucketMeasurement.clearance,
    limitingBucketCarrierSolid: bucketMeasurement.carrierSolid,
    limitingBucketSolid: bucketMeasurement.fixedSolid,
  };
}
export interface MachineWorksOutputDockLiveHandoffInputV1
  extends MachineWorksOutputDockSweepInputV1 {
  readonly tick: number;
}
export function assertMachineWorksOutputDockLiveHandoffV1(
  input: MachineWorksOutputDockLiveHandoffInputV1,
): MachineWorksOutputDockHandoffEvidenceV1 {
  const measurement = machineWorksOutputDockSweepMeasurementV1(input);
  if (measurement.issues.length > 0
    || measurement.minimumClearance === null
    || measurement.sweptRadius === null
    || measurement.limitingDockSolid === null
    || measurement.minimumFoundationClearance === null
    || measurement.limitingFoundationCarrierSolid === null
    || measurement.limitingFoundationSolid === null
    || measurement.minimumBucketClearance === null
    || measurement.limitingBucketCarrierSolid === null
    || measurement.limitingBucketSolid === null) {
    throw new Error(
      `Cannot engage the Machine Works output servo at fixed tick ${String(input.tick)}: `
      + `the accepted live carrier pose fails the continuous output sweep proof: `
      + `${measurement.issues.join('; ')
        || 'no finite limiting dock, foundation, or bucket solid was measured'}. `
      + 'Tighten the belt handoff or move the dock and environment solids; the fixture '
      + 'will not hide a collision with a canonical snap.',
    );
  }
  return Object.freeze({
    tick: input.tick,
    pivot: Object.freeze(translated(
      scaledPortPosition(input.carriage, 'tip-pivot-axis', input.carriageGrain),
      input.carriageCenter,
    )),
    rotation: Object.freeze([...input.carriageRotation] as QuaternionV1),
    tipRadians: input.tipRadians,
    minimumClearance: measurement.minimumClearance,
    requiredClearance: measurement.requiredClearance,
    sweptRadius: measurement.sweptRadius,
    limitingDockSolid: measurement.limitingDockSolid,
    minimumFoundationClearance: measurement.minimumFoundationClearance,
    limitingFoundationCarrierSolid: measurement.limitingFoundationCarrierSolid,
    limitingFoundationSolid: measurement.limitingFoundationSolid,
    minimumBucketClearance: measurement.minimumBucketClearance,
    limitingBucketCarrierSolid: measurement.limitingBucketCarrierSolid,
    limitingBucketSolid: measurement.limitingBucketSolid,
  });
}
export function requireMachineWorksOutputDockEvidenceV1(
  evidence: MachineWorksOutputDockHandoffEvidenceV1 | null,
): MachineWorksOutputDockHandoffEvidenceV1 {
  if (evidence !== null) return evidence;
  throw new Error(
    'Machine Works reached final hashing without live output-dock evidence; '
    + 'the release tick must validate the accepted pose before servo engagement.',
  );
}
