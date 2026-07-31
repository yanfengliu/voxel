import {
  sampleValidatedRiverfallFluidDomainV1,
} from './riverfall-fluid-domain.js';
import {
  riverfallFluidReachStartDistancesV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import type {
  RiverfallFluidNeighborPairV1,
  RiverfallFluidStateV1,
  RiverfallFluidWorkspaceV1,
} from './riverfall-pbf.js';

interface FastDomainReachV1 {
  readonly start: number;
  readonly end: number;
  readonly startHalfWidth: number;
  readonly endHalfWidth: number;
  readonly halfWidthSlope: number;
  readonly id: string;
  readonly visibility: 'visible' | 'hidden';
  readonly tangent: readonly [number, number, number];
}

interface FastDomainFactsV1 {
  readonly totalLength: number;
  readonly reaches: readonly FastDomainReachV1[];
}

export interface FastRiverfallFluidSampleV1 {
  readonly totalLength: number;
  readonly reachId: string;
  readonly visibility: 'visible' | 'hidden';
  readonly halfWidth: number;
  readonly halfWidthSlope: number;
  readonly tangent: readonly [number, number, number];
}

export interface RiverfallFluidStripProjectionV1 {
  readonly longitudinal: number;
  readonly lateral: number;
  /** Total physical distance removed by orthogonal wall projection. */
  readonly penetration: number;
  /** Outward unit normal of the final contacted strip wall. */
  readonly normalS: number;
  readonly normalU: number;
}

const DOMAIN_FACTS = new WeakMap<
  RiverfallFluidConfigV1['domain'],
  FastDomainFactsV1
>();

function f32(value: number): number {
  return Math.fround(value);
}

function radicalInverseBase2(value: number): number {
  let bits = value >>> 0;
  let fraction = 0;
  let scale = 0.5;
  while (bits !== 0) {
    fraction += (bits & 1) * scale;
    bits >>>= 1;
    scale *= 0.5;
  }
  return fraction;
}

function reachLength(
  reach: RiverfallFluidConfigV1['domain']['reaches'][number],
): number {
  return Math.hypot(
    reach.end[0] - reach.start[0],
    reach.end[1] - reach.start[1],
    reach.end[2] - reach.start[2],
  );
}

function domainFacts(config: RiverfallFluidConfigV1): FastDomainFactsV1 {
  const cached = DOMAIN_FACTS.get(config.domain);
  if (cached !== undefined) return cached;
  let start = 0;
  const reaches = config.domain.reaches.map((reach): FastDomainReachV1 => {
    const length = reachLength(reach);
    const result: FastDomainReachV1 = {
      start,
      end: start + length,
      startHalfWidth: reach.halfWidths[0],
      endHalfWidth: reach.halfWidths[1],
      halfWidthSlope: (
        reach.halfWidths[1] - reach.halfWidths[0]
      ) / length,
      id: reach.id,
      visibility: reach.visibility,
      tangent: [
        (reach.end[0] - reach.start[0]) / length,
        (reach.end[1] - reach.start[1]) / length,
        (reach.end[2] - reach.start[2]) / length,
      ],
    };
    start += length;
    return result;
  });
  const hiddenReach = reaches.find(
    ({ visibility }) => visibility === 'hidden',
  );
  if (hiddenReach === undefined) {
    throw new Error(
      'Cannot index Riverfall fluid domain: expected at least one hidden pump reach.',
    );
  }
  const facts = { totalLength: start, reaches };
  DOMAIN_FACTS.set(config.domain, facts);
  return facts;
}

export function sampleFastRiverfallFluidDomainV1(
  config: RiverfallFluidConfigV1,
  longitudinal: number,
): FastRiverfallFluidSampleV1 {
  const facts = domainFacts(config);
  const remainder = longitudinal % facts.totalLength;
  const wrapped = remainder < 0 ? remainder + facts.totalLength : remainder;
  const reach = facts.reaches.find(({ end }) => wrapped < end)
    ?? facts.reaches.at(-1)!;
  const progress = (wrapped - reach.start) / (reach.end - reach.start);
  return {
    totalLength: facts.totalLength,
    reachId: reach.id,
    visibility: reach.visibility,
    halfWidth: reach.startHalfWidth
      + (reach.endHalfWidth - reach.startHalfWidth) * progress,
    halfWidthSlope: reach.halfWidthSlope,
    tangent: reach.tangent,
  };
}

function wrapLongitudinal(longitudinal: number, totalLength: number): number {
  const remainder = longitudinal % totalLength;
  return remainder < 0 ? remainder + totalLength : remainder;
}

export function riverfallFluidStripPenetrationV1(
  config: RiverfallFluidConfigV1,
  longitudinal: number,
  lateral: number,
): number {
  const sample = sampleFastRiverfallFluidDomainV1(config, longitudinal);
  const limit = Math.max(
    0,
    sample.halfWidth - config.particles.radius,
  );
  return Math.max(0, Math.abs(lateral) - limit)
    / Math.hypot(1, sample.halfWidthSlope);
}

export function projectRiverfallFluidIntoStripV1(
  config: RiverfallFluidConfigV1,
  longitudinal: number,
  lateral: number,
): RiverfallFluidStripProjectionV1 {
  const totalLength = domainFacts(config).totalLength;
  let projectedS = wrapLongitudinal(longitudinal, totalLength);
  let projectedU = lateral;
  let penetration = 0;
  let normalS = 0;
  let normalU = 0;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const sample = sampleFastRiverfallFluidDomainV1(config, projectedS);
    const limit = Math.max(
      0,
      sample.halfWidth - config.particles.radius,
    );
    const excess = Math.abs(projectedU) - limit;
    if (!(excess > 0)) break;
    const side = projectedU < 0 ? -1 : 1;
    const normalLength = Math.hypot(1, sample.halfWidthSlope);
    normalS = -sample.halfWidthSlope / normalLength;
    normalU = side / normalLength;
    const distance = excess / normalLength;
    projectedS = wrapLongitudinal(
      projectedS - distance * normalS,
      totalLength,
    );
    projectedU -= distance * normalU;
    penetration += distance;
  }
  return {
    longitudinal: projectedS,
    lateral: projectedU,
    penetration,
    normalS,
    normalU,
  };
}

export function reflectRiverfallFluidWallVelocityV1(
  longitudinalVelocity: number,
  lateralVelocity: number,
  normalS: number,
  normalU: number,
  restitution: number,
): readonly [number, number] {
  const normalVelocity = longitudinalVelocity * normalS
    + lateralVelocity * normalU;
  if (!(normalVelocity > 0)) {
    return [longitudinalVelocity, lateralVelocity];
  }
  const impulse = (1 + restitution) * normalVelocity;
  return [
    longitudinalVelocity - impulse * normalS,
    lateralVelocity - impulse * normalU,
  ];
}

function visibleArea(
  reach: RiverfallFluidConfigV1['domain']['reaches'][number],
): number {
  return reach.visibility === 'visible'
    ? reachLength(reach) * (reach.halfWidths[0] + reach.halfWidths[1])
    : 0;
}

function localDistanceForArea(
  reach: RiverfallFluidConfigV1['domain']['reaches'][number],
  targetArea: number,
): number {
  const length = reachLength(reach);
  let low = 0;
  let high = length;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) * 0.5;
    const widthDelta = reach.halfWidths[1] - reach.halfWidths[0];
    const area = 2 * (
      reach.halfWidths[0] * middle
      + 0.5 * widthDelta * middle * middle / length
    );
    if (area < targetArea) low = middle;
    else high = middle;
  }
  return (low + high) * 0.5;
}

export function createInitialRiverfallFluidStateV1(
  config: RiverfallFluidConfigV1,
): RiverfallFluidStateV1 {
  const count = config.particles.count;
  const state: RiverfallFluidStateV1 = {
    longitudinal: new Float32Array(count),
    lateral: new Float32Array(count),
    longitudinalVelocity: new Float32Array(count),
    lateralVelocity: new Float32Array(count),
  };
  const areas = config.domain.reaches.map(visibleArea);
  const totalArea = areas.reduce((sum, area) => sum + area, 0);
  let reachStart = 0;
  let reachIndex = 0;
  let areaStart = 0;
  for (let particle = 0; particle < count; particle += 1) {
    const targetArea = (particle + 0.5) / count * totalArea;
    while (reachIndex < areas.length - 1
      && areaStart + areas[reachIndex]! <= targetArea) {
      areaStart += areas[reachIndex]!;
      reachStart += reachLength(config.domain.reaches[reachIndex]!);
      reachIndex += 1;
    }
    const reach = config.domain.reaches[reachIndex]!;
    const local = localDistanceForArea(reach, targetArea - areaStart);
    const s = reachStart + local;
    const sample = sampleValidatedRiverfallFluidDomainV1(config.domain, s);
    const sequence = radicalInverseBase2(
      (particle ^ config.particles.seed) >>> 0,
    );
    const usableHalfWidth = Math.max(
      0,
      sample.halfWidth - config.particles.radius,
    );
    state.longitudinal[particle] = f32(s);
    state.lateral[particle] = f32((sequence * 2 - 1) * usableHalfWidth);
    state.longitudinalVelocity[particle] = f32(
      config.forcing.inletSpeed,
    );
  }
  return state;
}

export function cloneRiverfallFluidStateV1(
  state: RiverfallFluidStateV1,
): RiverfallFluidStateV1 {
  return {
    longitudinal: new Float32Array(state.longitudinal),
    lateral: new Float32Array(state.lateral),
    longitudinalVelocity: new Float32Array(state.longitudinalVelocity),
    lateralVelocity: new Float32Array(state.lateralVelocity),
  };
}

export function createRiverfallFluidWorkspaceV1(
  particleCount: number,
): RiverfallFluidWorkspaceV1 {
  const vector = (): Float32Array => new Float32Array(particleCount);
  return {
    oldS: vector(),
    oldU: vector(),
    predictedS: vector(),
    predictedU: vector(),
    density: vector(),
    lambda: vector(),
    correctionS: vector(),
    correctionU: vector(),
    gradientS: vector(),
    gradientU: vector(),
    denominator: vector(),
    viscosityS: vector(),
    viscosityU: vector(),
    boundaryCorrection: vector(),
    boundaryNormalS: vector(),
    boundaryNormalU: vector(),
  };
}

export function isRiverfallFluidParticleVisibleV1(
  config: RiverfallFluidConfigV1,
  longitudinal: number,
): boolean {
  return sampleFastRiverfallFluidDomainV1(
    config,
    longitudinal,
  ).visibility === 'visible';
}

function crossesImpactPortal(
  leftS: number,
  rightS: number,
  impactS: number,
): boolean {
  return (leftS < impactS && rightS >= impactS)
    || (rightS < impactS && leftS >= impactS);
}

export function buildRiverfallFluidNeighborPairsInternalV1(
  longitudinal: Float32Array,
  lateral: Float32Array,
  config: RiverfallFluidConfigV1,
  bruteForce: boolean,
): RiverfallFluidNeighborPairV1[] {
  const radius = config.density.smoothingRadius;
  const impactS = riverfallFluidReachStartDistancesV1(
    config.domain,
  )['pond-expansion']!;
  const pairs: RiverfallFluidNeighborPairV1[] = [];
  const accept = (left: number, right: number): void => {
    if (!isRiverfallFluidParticleVisibleV1(config, longitudinal[left]!)
      || !isRiverfallFluidParticleVisibleV1(config, longitudinal[right]!)
      || crossesImpactPortal(
        longitudinal[left]!,
        longitudinal[right]!,
        impactS,
      )) return;
    const ds = longitudinal[left]! - longitudinal[right]!;
    const du = lateral[left]! - lateral[right]!;
    const distance = Math.hypot(ds, du);
    if (distance < radius) pairs.push({ left, right, distance });
  };
  if (bruteForce) {
    for (let left = 0; left < longitudinal.length; left += 1) {
      for (let right = left + 1; right < longitudinal.length; right += 1) {
        accept(left, right);
      }
    }
    return pairs;
  }
  const buckets = new Map<string, number[]>();
  for (let index = 0; index < longitudinal.length; index += 1) {
    if (!isRiverfallFluidParticleVisibleV1(
      config,
      longitudinal[index]!,
    )) continue;
    const cellS = Math.floor(longitudinal[index]! / radius);
    const cellU = Math.floor(lateral[index]! / radius);
    const key = `${String(cellS)},${String(cellU)}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [index]);
    else bucket.push(index);
  }
  for (let left = 0; left < longitudinal.length; left += 1) {
    if (!isRiverfallFluidParticleVisibleV1(
      config,
      longitudinal[left]!,
    )) continue;
    const cellS = Math.floor(longitudinal[left]! / radius);
    const cellU = Math.floor(lateral[left]! / radius);
    for (let offsetS = -1; offsetS <= 1; offsetS += 1) {
      for (let offsetU = -1; offsetU <= 1; offsetU += 1) {
        const bucket = buckets.get(
          `${String(cellS + offsetS)},${String(cellU + offsetU)}`,
        );
        if (bucket === undefined) continue;
        for (const right of bucket) {
          if (right > left) accept(left, right);
        }
      }
    }
  }
  pairs.sort((left, right) =>
    left.left - right.left || left.right - right.right);
  return pairs;
}

export function buildStableRiverfallFluidNeighborPairsV1(
  state: Pick<RiverfallFluidStateV1, 'longitudinal' | 'lateral'>,
  config: RiverfallFluidConfigV1,
): readonly RiverfallFluidNeighborPairV1[] {
  return buildRiverfallFluidNeighborPairsInternalV1(
    state.longitudinal,
    state.lateral,
    config,
    false,
  );
}

export function buildBruteForceRiverfallFluidNeighborPairsV1(
  state: Pick<RiverfallFluidStateV1, 'longitudinal' | 'lateral'>,
  config: RiverfallFluidConfigV1,
): readonly RiverfallFluidNeighborPairV1[] {
  return buildRiverfallFluidNeighborPairsInternalV1(
    state.longitudinal,
    state.lateral,
    config,
    true,
  );
}
