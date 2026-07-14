import type { Int3V1, Vec3V1 } from '../core/index.js';

export const PICK_LANES_V1 = ['voxel', 'instance'] as const;
export const HARD_MAX_PICK_HITS_V1 = 4_096;
export const HARD_MAX_PICK_VOXEL_STEPS_V1 = 16_777_216;
export const HARD_MAX_PICK_INSTANCE_CANDIDATES_V1 = 1_000_000;
export const HARD_MAX_PICK_INSTANCE_PRIMITIVE_TESTS_V1 = 1_000_000;

export type PickLaneV1 = (typeof PICK_LANES_V1)[number];

export interface PickWorkBudgetV1 {
  readonly voxelSteps: number;
  readonly instanceCandidates: number;
  /** Conservative upper bound on triangle tests before Three raycasting begins. */
  readonly instancePrimitiveTests: number;
}

export interface PickOrderingV1 {
  readonly mode: 'distance-first' | 'lane-first';
  readonly laneOrder: readonly PickLaneV1[];
}

export interface PickQueryV1 {
  readonly origin: Vec3V1;
  readonly direction: Vec3V1;
  readonly maxDistance: number;
  readonly maxHits: number;
  readonly maxWork: PickWorkBudgetV1;
  readonly lanes?: readonly PickLaneV1[];
  readonly ordering?: PickOrderingV1;
}

export interface PreparedPickQueryV1 {
  readonly origin: Vec3V1;
  /** Finite nonzero direction. Lane implementations normalize as required. */
  readonly direction: Vec3V1;
  readonly maxDistance: number;
  readonly maxHits: number;
  readonly maxWork: PickWorkBudgetV1;
  readonly lanes: readonly PickLaneV1[];
  readonly ordering: PickOrderingV1;
}

export type PickQueryIssueCodeV1 =
  | 'pick.query.invalid-type'
  | 'pick.query.invalid-number'
  | 'pick.query.invalid-limit'
  | 'pick.query.invalid-lane'
  | 'pick.query.duplicate-lane'
  | 'pick.query.invalid-ordering';

export type PreparePickQueryResultV1 =
  | { readonly status: 'valid'; readonly query: PreparedPickQueryV1 }
  | {
      readonly status: 'invalid';
      readonly code: PickQueryIssueCodeV1;
      readonly path: string;
      readonly message: string;
    };

type InvalidPickQueryV1 = Extract<
  PreparePickQueryResultV1,
  { readonly status: 'invalid' }
>;

export interface PresentedFrameIdentityV1 {
  readonly worldId: string;
  readonly epoch: string;
  readonly presentedRevision: number;
  readonly frameIndex: number;
  readonly frameNowMs: number;
  readonly deviceGeneration: number;
  readonly cameraGeneration: number;
}

export interface PresentedItemIdentityV1 {
  readonly key: string;
  readonly incarnation: number;
  readonly revision: number;
}

interface PickHitBaseV1 extends PresentedFrameIdentityV1 {
  readonly lane: PickLaneV1;
  readonly distance: number;
  readonly point: Vec3V1;
  readonly normal: Vec3V1;
  readonly material: PresentedItemIdentityV1;
}

export interface VoxelPickHitV1 extends PickHitBaseV1 {
  readonly lane: 'voxel';
  readonly chunk: PresentedItemIdentityV1;
  readonly palette: PresentedItemIdentityV1;
  readonly voxelCoordinate: Int3V1;
  readonly chunkLocalCoordinate: Int3V1;
  readonly paletteIndex: number;
}

export interface InstancePickHitV1 extends PickHitBaseV1 {
  readonly lane: 'instance';
  readonly batch: PresentedItemIdentityV1;
  readonly geometry: PresentedItemIdentityV1;
  readonly instanceKey: string;
}

export type PickHitV1 = VoxelPickHitV1 | InstancePickHitV1;

export interface PickWorkReportV1 {
  readonly voxelSteps: number;
  readonly instanceCandidates: number;
  /** Required primitive-test upper bound, capped at budget + 1 when exhausted. */
  readonly instancePrimitiveTests: number;
}

export type PickUnavailableReasonV1 =
  | 'no-presented-frame'
  | 'voxel-profile-required'
  | 'voxel-sealed-neighbor-policy'
  | 'voxel-coordinate-overflow'
  | 'lost'
  | 'restoring'
  | 'failed'
  | 'disposed';

export type PickPresentedResultV1 =
  | {
      readonly status: 'hits';
      readonly hits: readonly PickHitV1[];
      readonly work: PickWorkReportV1;
    }
  | {
      readonly status: 'budget-exceeded';
      readonly lane: PickLaneV1;
      readonly partialHits: readonly PickHitV1[];
      readonly work: PickWorkReportV1;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: PickUnavailableReasonV1;
    }
  | {
      readonly status: 'invalid-query';
      readonly code: PickQueryIssueCodeV1;
      readonly path: string;
      readonly message: string;
    };

function invalid(
  code: PickQueryIssueCodeV1,
  path: string,
  message: string,
): InvalidPickQueryV1 {
  return { status: 'invalid', code, path, message };
}

function finiteVector(value: unknown, path: string): Vec3V1 | InvalidPickQueryV1 {
  if (typeof value !== 'object' || value === null) {
    return invalid('pick.query.invalid-type', path, `${path} must be an object.`);
  }
  const input = value as Partial<Vec3V1>;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Number.isFinite(input[axis])) {
      return invalid(
        'pick.query.invalid-number',
        `${path}.${axis}`,
        `${path}.${axis} must be finite.`,
      );
    }
  }
  return Object.freeze({ x: input.x!, y: input.y!, z: input.z! });
}

function lanes(
  value: unknown,
  path: string,
  canonical = true,
): readonly PickLaneV1[] | InvalidPickQueryV1 {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > PICK_LANES_V1.length
  ) {
    return invalid(
      'pick.query.invalid-lane',
      path,
      `${path} must be a nonempty subset of the two supported lanes.`,
    );
  }
  const seen = new Set<PickLaneV1>();
  const ordered: PickLaneV1[] = [];
  for (let index = 0; index < value.length; index++) {
    const lane: unknown = value[index];
    if (lane !== 'voxel' && lane !== 'instance') {
      return invalid(
        'pick.query.invalid-lane',
        `${path}[${String(index)}]`,
        `${path}[${String(index)}] must be voxel or instance.`,
      );
    }
    if (seen.has(lane)) {
      return invalid(
        'pick.query.duplicate-lane',
        `${path}[${String(index)}]`,
        `${path} must not contain duplicate lanes.`,
      );
    }
    seen.add(lane);
    ordered.push(lane);
  }
  return Object.freeze(canonical
    ? PICK_LANES_V1.filter((lane) => seen.has(lane))
    : ordered);
}

function positiveBoundedInteger(
  value: unknown,
  path: string,
  maximum: number,
): number | InvalidPickQueryV1 {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    return invalid(
      'pick.query.invalid-limit',
      path,
      `${path} must be a positive safe integer no greater than ${String(maximum)}.`,
    );
  }
  return value as number;
}

function isInvalid(
  value: unknown,
): value is InvalidPickQueryV1 {
  return typeof value === 'object'
    && value !== null
    && 'status' in value
    && value.status === 'invalid';
}

/** Validates, copies, and freezes a bounded pick query without retaining caller arrays. */
export function preparePickQueryV1(value: unknown): PreparePickQueryResultV1 {
  if (typeof value !== 'object' || value === null) {
    return invalid('pick.query.invalid-type', '', 'Pick query must be an object.');
  }
  const input = value as Record<string, unknown>;
  const origin = finiteVector(input.origin, 'origin');
  if (isInvalid(origin)) return origin;
  const direction = finiteVector(input.direction, 'direction');
  if (isInvalid(direction)) return direction;
  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(directionLength) || directionLength === 0) {
    return invalid(
      'pick.query.invalid-number',
      'direction',
      'direction must have finite nonzero length.',
    );
  }
  const maxDistance = input.maxDistance;
  if (!Number.isFinite(maxDistance) || (maxDistance as number) <= 0) {
    return invalid(
      'pick.query.invalid-limit',
      'maxDistance',
      'maxDistance must be a positive finite number.',
    );
  }
  const maxHits = positiveBoundedInteger(input.maxHits, 'maxHits', HARD_MAX_PICK_HITS_V1);
  if (isInvalid(maxHits)) return maxHits;
  const maxWork = input.maxWork;
  if (typeof maxWork !== 'object' || maxWork === null) {
    return invalid('pick.query.invalid-type', 'maxWork', 'maxWork must be an object.');
  }
  const maxWorkInput = maxWork as Record<string, unknown>;
  const voxelSteps = positiveBoundedInteger(
    maxWorkInput.voxelSteps,
    'maxWork.voxelSteps',
    HARD_MAX_PICK_VOXEL_STEPS_V1,
  );
  if (isInvalid(voxelSteps)) return voxelSteps;
  const instanceCandidates = positiveBoundedInteger(
    maxWorkInput.instanceCandidates,
    'maxWork.instanceCandidates',
    HARD_MAX_PICK_INSTANCE_CANDIDATES_V1,
  );
  if (isInvalid(instanceCandidates)) return instanceCandidates;
  const instancePrimitiveTests = positiveBoundedInteger(
    maxWorkInput.instancePrimitiveTests,
    'maxWork.instancePrimitiveTests',
    HARD_MAX_PICK_INSTANCE_PRIMITIVE_TESTS_V1,
  );
  if (isInvalid(instancePrimitiveTests)) return instancePrimitiveTests;
  const selectedLanes = lanes(input.lanes ?? PICK_LANES_V1, 'lanes');
  if (isInvalid(selectedLanes)) return selectedLanes;

  let ordering: PickOrderingV1;
  const requestedOrdering = input.ordering;
  if (requestedOrdering === undefined) {
    ordering = Object.freeze({
      mode: 'distance-first',
      laneOrder: Object.freeze([...selectedLanes]),
    });
  } else {
    if (typeof requestedOrdering !== 'object' || requestedOrdering === null) {
      return invalid(
        'pick.query.invalid-ordering',
        'ordering',
        'ordering must be an object.',
      );
    }
    const orderingInput = requestedOrdering as Record<string, unknown>;
    const mode = orderingInput.mode;
    if (mode !== 'distance-first' && mode !== 'lane-first') {
      return invalid(
        'pick.query.invalid-ordering',
        'ordering.mode',
        'ordering.mode must be distance-first or lane-first.',
      );
    }
    const laneOrder = lanes(orderingInput.laneOrder, 'ordering.laneOrder', false);
    if (isInvalid(laneOrder)) return laneOrder;
    if (
      laneOrder.length !== selectedLanes.length
      || laneOrder.some((lane) => !selectedLanes.includes(lane))
    ) {
      return invalid(
        'pick.query.invalid-ordering',
        'ordering.laneOrder',
        'ordering.laneOrder must contain each selected lane exactly once.',
      );
    }
    ordering = Object.freeze({
      mode,
      laneOrder,
    });
  }

  return {
    status: 'valid',
    query: Object.freeze({
      origin,
      direction,
      maxDistance: maxDistance as number,
      maxHits,
      maxWork: Object.freeze({
        voxelSteps,
        instanceCandidates,
        instancePrimitiveTests,
      }),
      lanes: selectedLanes,
      ordering,
    }),
  };
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareItem(left: PresentedItemIdentityV1, right: PresentedItemIdentityV1): number {
  return compareString(left.key, right.key)
    || compareNumber(left.incarnation, right.incarnation)
    || compareNumber(left.revision, right.revision);
}

function compareStableIdentity(left: PickHitV1, right: PickHitV1): number {
  if (left.lane === 'voxel' && right.lane === 'voxel') {
    return compareItem(left.chunk, right.chunk)
      || compareNumber(left.voxelCoordinate.x, right.voxelCoordinate.x)
      || compareNumber(left.voxelCoordinate.y, right.voxelCoordinate.y)
      || compareNumber(left.voxelCoordinate.z, right.voxelCoordinate.z)
      || compareNumber(left.paletteIndex, right.paletteIndex);
  }
  if (left.lane === 'instance' && right.lane === 'instance') {
    return compareItem(left.batch, right.batch)
      || compareItem(left.geometry, right.geometry)
      || compareString(left.instanceKey, right.instanceKey);
  }
  return compareString(left.lane, right.lane);
}

/** Comparator implementing the documented distance/lane/stable-identity order. */
export function comparePickHitsV1(
  left: PickHitV1,
  right: PickHitV1,
  ordering: PickOrderingV1,
): number {
  const leftLane = ordering.laneOrder.indexOf(left.lane);
  const rightLane = ordering.laneOrder.indexOf(right.lane);
  if (leftLane < 0 || rightLane < 0) {
    throw new RangeError('Every compared hit lane must occur in ordering.laneOrder.');
  }
  const lane = compareNumber(leftLane, rightLane);
  const distance = compareNumber(left.distance, right.distance);
  return ordering.mode === 'lane-first'
    ? lane || distance || compareStableIdentity(left, right)
    : distance || lane || compareStableIdentity(left, right);
}
