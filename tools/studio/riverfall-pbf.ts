import {
  mapValidatedRiverfallFluidCoordinateV1,
} from './riverfall-fluid-domain.js';
import {
  riverfallFluidReachStartDistancesV1,
  type RiverfallFluidConfigV1,
} from './riverfall-fluid-config.js';
import {
  isRiverfallFluidParticleVisibleV1,
  projectRiverfallFluidIntoStripV1,
  reflectRiverfallFluidWallVelocityV1,
  riverfallFluidStripPenetrationV1,
  sampleFastRiverfallFluidDomainV1,
} from './riverfall-pbf-support.js';
import {
  buildRiverfallFluidNeighborsV1,
  createRiverfallFluidNeighborScratchV1,
  type RiverfallFluidNeighborScratchV1,
  type RiverfallFluidNeighborsV1,
} from './riverfall-neighbor-grid.js';
export {
  buildBruteForceRiverfallFluidNeighborPairsV1,
  buildStableRiverfallFluidNeighborPairsV1,
  cloneRiverfallFluidStateV1,
  createInitialRiverfallFluidStateV1,
  createRiverfallFluidWorkspaceV1,
  projectRiverfallFluidIntoStripV1,
  reflectRiverfallFluidWallVelocityV1,
  riverfallFluidStripPenetrationV1,
} from './riverfall-pbf-support.js';
export interface RiverfallFluidStateV1 {
  readonly longitudinal: Float32Array;
  readonly lateral: Float32Array;
  readonly longitudinalVelocity: Float32Array;
  readonly lateralVelocity: Float32Array;
}
export interface RiverfallFluidNeighborPairV1 {
  readonly left: number;
  readonly right: number;
  readonly distance: number;
}
export interface RiverfallFluidStepDiagnosticsV1 {
  readonly visibleParticles: number;
  readonly hiddenParticles: number;
  readonly neighborPairs: number;
  readonly minimumNeighbors: number;
  readonly maximumDensityError: number;
  readonly p95DensityError: number;
  readonly maximumSpeed: number;
  readonly maximumFallSpeed: number;
  /** Largest attempted wall projection before the constrained state was accepted. */
  readonly maximumBoundaryCorrection: number;
  /** Actual physical wall overlap remaining after Float32 state storage. */
  readonly maximumResidualPenetration: number;
  readonly meanNeighborRelativeSpeed: number;
  readonly lipAttachmentCount: number;
  readonly lipAttachmentImpulse: number;
  readonly impactCount: number;
  readonly impactImpulse: number;
  readonly outflowCrossings: number;
  readonly recycleCount: number;
}
export interface RiverfallFluidWorkspaceV1 {
  readonly oldS: Float32Array;
  readonly oldU: Float32Array;
  readonly predictedS: Float32Array;
  readonly predictedU: Float32Array;
  readonly density: Float32Array;
  readonly lambda: Float32Array;
  readonly correctionS: Float32Array;
  readonly correctionU: Float32Array;
  readonly gradientS: Float32Array;
  readonly gradientU: Float32Array;
  readonly denominator: Float32Array;
  readonly viscosityS: Float32Array;
  readonly viscosityU: Float32Array;
  readonly boundaryCorrection: Float32Array;
  readonly boundaryNormalS: Float32Array;
  readonly boundaryNormalU: Float32Array;
}
/**
 * One neighbour scratch per workspace, created on first use.
 *
 * It lives here rather than in the workspace constructor because the grid
 * module needs the domain helpers the workspace constructor lives beside,
 * and a workspace that built its own grid would make those two modules
 * import each other. A WeakMap keyed by workspace keeps two fluids — the
 * headless twin and the live scene — on separate scratch.
 */
const NEIGHBOR_SCRATCH =
  new WeakMap<RiverfallFluidWorkspaceV1, RiverfallFluidNeighborScratchV1>();

function neighborScratchFor(
  workspace: RiverfallFluidWorkspaceV1,
  count: number,
): RiverfallFluidNeighborScratchV1 {
  const existing = NEIGHBOR_SCRATCH.get(workspace);
  if (existing !== undefined) return existing;
  const created = createRiverfallFluidNeighborScratchV1(count);
  NEIGHBOR_SCRATCH.set(workspace, created);
  return created;
}

function f32(value: number): number {
  return Math.fround(value);
}
function kernel(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const squared = radius * radius - distance * distance;
  return 4 / (Math.PI * radius ** 8) * squared ** 3;
}
function kernelGradientScale(distance: number, radius: number): number {
  if (!(distance > 1e-9) || distance >= radius) return 0;
  const squared = radius * radius - distance * distance;
  return -24 / (Math.PI * radius ** 8) * squared ** 2;
}
function calculateDensities(
  neighbors: RiverfallFluidNeighborsV1,
  config: RiverfallFluidConfigV1,
  workspace: RiverfallFluidWorkspaceV1,
): void {
  const selfDensity = config.particles.mass * kernel(
    0,
    config.density.smoothingRadius,
  );
  workspace.density.fill(f32(selfDensity));
  const { left, right, distance, count } = neighbors;
  for (let pair = 0; pair < count; pair += 1) {
    const contribution = config.particles.mass * kernel(
      distance[pair]!,
      config.density.smoothingRadius,
    );
    workspace.density[left[pair]!]! += f32(contribution);
    workspace.density[right[pair]!]! += f32(contribution);
  }
}
function solveDensityIteration(
  neighbors: RiverfallFluidNeighborsV1,
  config: RiverfallFluidConfigV1,
  workspace: RiverfallFluidWorkspaceV1,
): number {
  calculateDensities(neighbors, config, workspace);
  const pairLeft = neighbors.left;
  const pairRight = neighbors.right;
  const pairDistance = neighbors.distance;
  const pairCount = neighbors.count;
  workspace.gradientS.fill(0);
  workspace.gradientU.fill(0);
  workspace.denominator.fill(0);
  const rest = config.density.restAreaDensity;
  for (let pair = 0; pair < pairCount; pair += 1) {
    const leftIndex = pairLeft[pair]!;
    const rightIndex = pairRight[pair]!;
    const ds = workspace.predictedS[leftIndex]!
      - workspace.predictedS[rightIndex]!;
    const du = workspace.predictedU[leftIndex]!
      - workspace.predictedU[rightIndex]!;
    const scale = config.particles.mass
      * kernelGradientScale(pairDistance[pair]!, config.density.smoothingRadius)
      / rest;
    const gs = scale * ds;
    const gu = scale * du;
    workspace.gradientS[leftIndex]! += f32(gs);
    workspace.gradientU[leftIndex]! += f32(gu);
    workspace.gradientS[rightIndex]! -= f32(gs);
    workspace.gradientU[rightIndex]! -= f32(gu);
    const squared = gs * gs + gu * gu;
    workspace.denominator[leftIndex]! += f32(squared);
    workspace.denominator[rightIndex]! += f32(squared);
  }
  for (let index = 0; index < workspace.lambda.length; index += 1) {
    const sumGradient = workspace.gradientS[index]! ** 2
      + workspace.gradientU[index]! ** 2;
    const compression = Math.max(
      0,
      workspace.density[index]! / rest - 1,
    );
    workspace.lambda[index] = f32(
      -compression / (
        workspace.denominator[index]!
        + sumGradient
        + config.density.lambdaEpsilon
      ),
    );
  }
  workspace.correctionS.fill(0);
  workspace.correctionU.fill(0);
  for (let pair = 0; pair < pairCount; pair += 1) {
    const leftIndex = pairLeft[pair]!;
    const rightIndex = pairRight[pair]!;
    const ds = workspace.predictedS[leftIndex]!
      - workspace.predictedS[rightIndex]!;
    const du = workspace.predictedU[leftIndex]!
      - workspace.predictedU[rightIndex]!;
    const scale = (
      workspace.lambda[leftIndex]! + workspace.lambda[rightIndex]!
    ) * config.particles.mass
      * kernelGradientScale(pairDistance[pair]!, config.density.smoothingRadius)
      / rest;
    workspace.correctionS[leftIndex]! += f32(scale * ds);
    workspace.correctionU[leftIndex]! += f32(scale * du);
    workspace.correctionS[rightIndex]! -= f32(scale * ds);
    workspace.correctionU[rightIndex]! -= f32(scale * du);
  }
  let maximumCorrection = 0;
  for (let index = 0; index < workspace.predictedS.length; index += 1) {
    if (!isRiverfallFluidParticleVisibleV1(
      config,
      workspace.predictedS[index]!,
    )) continue;
    const correctionLength = Math.hypot(
      workspace.correctionS[index]!,
      workspace.correctionU[index]!,
    );
    const clamp = correctionLength > config.density.maximumCorrection
      ? config.density.maximumCorrection / correctionLength
      : 1;
    workspace.predictedS[index] = f32(Math.max(
      0,
      workspace.predictedS[index]! + workspace.correctionS[index]! * clamp,
    ));
    const constrained = projectRiverfallFluidIntoStripV1(
      config,
      workspace.predictedS[index]!,
      workspace.predictedU[index]! + workspace.correctionU[index]! * clamp,
    );
    workspace.predictedS[index] = f32(constrained.longitudinal);
    workspace.predictedU[index] = f32(constrained.lateral);
    if (constrained.penetration > 0) {
      workspace.boundaryCorrection[index] = Math.max(
        workspace.boundaryCorrection[index]!,
        constrained.penetration,
      );
      workspace.boundaryNormalS[index] = f32(constrained.normalS);
      workspace.boundaryNormalU[index] = f32(constrained.normalU);
    }
    maximumCorrection = Math.max(maximumCorrection, constrained.penetration);
  }
  return maximumCorrection;
}
function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

export function stepRiverfallFluidV1(
  state: RiverfallFluidStateV1,
  config: RiverfallFluidConfigV1,
  workspace: RiverfallFluidWorkspaceV1,
): RiverfallFluidStepDiagnosticsV1 {
  const count = config.particles.count;
  const dt = config.recording.substepMs / 1_000;
  const starts = riverfallFluidReachStartDistancesV1(config.domain);
  const fallStart = starts.fall!;
  const impactS = starts['pond-expansion']!;
  const hiddenStart = starts.sink!;
  const totalLength = sampleFastRiverfallFluidDomainV1(
    config,
    0,
  ).totalLength;
  workspace.oldS.set(state.longitudinal);
  workspace.oldU.set(state.lateral);
  workspace.boundaryCorrection.fill(0);
  workspace.boundaryNormalS.fill(0);
  workspace.boundaryNormalU.fill(0);
  let maximumBoundaryCorrection = 0;
  for (let index = 0; index < count; index += 1) {
    const s = state.longitudinal[index]!;
    const sample = sampleFastRiverfallFluidDomainV1(config, s);
    let velocityS = state.longitudinalVelocity[index]!;
    let velocityU = state.lateralVelocity[index]!;
    if (sample.visibility === 'hidden') {
      velocityS = config.forcing.hiddenPumpSpeed
        * config.forcing.hiddenPumpScale;
      velocityU *= 0.9;
    } else {
      const projectedGravity = (
        config.forcing.gravity[0] * sample.tangent[0]
        + config.forcing.gravity[1] * sample.tangent[1]
        + config.forcing.gravity[2] * sample.tangent[2]
      ) * config.forcing.gravityScale;
      velocityS += projectedGravity * dt;
    }
    let predictedS = s + velocityS * dt;
    if (sample.visibility === 'visible' && predictedS < 0) predictedS = 0;
    if (predictedS >= totalLength) {
      predictedS %= totalLength;
      velocityS = config.forcing.inletSpeed;
    }
    const constrained = projectRiverfallFluidIntoStripV1(
      config,
      predictedS,
      state.lateral[index]! + velocityU * dt,
    );
    workspace.predictedS[index] = f32(constrained.longitudinal);
    workspace.predictedU[index] = f32(constrained.lateral);
    workspace.boundaryCorrection[index] = constrained.penetration;
    workspace.boundaryNormalS[index] = f32(constrained.normalS);
    workspace.boundaryNormalU[index] = f32(constrained.normalU);
    maximumBoundaryCorrection = Math.max(
      maximumBoundaryCorrection,
      constrained.penetration,
    );
    state.longitudinalVelocity[index] = f32(velocityS);
    state.lateralVelocity[index] = f32(velocityU);
  }

  const scratch = neighborScratchFor(workspace, count);
  const neighbors = scratch.neighbors;
  for (let iteration = 0; iteration < config.density.iterations; iteration += 1) {
    buildRiverfallFluidNeighborsV1(
      workspace.predictedS,
      workspace.predictedU,
      config,
      scratch,
    );
    maximumBoundaryCorrection = Math.max(
      maximumBoundaryCorrection,
      solveDensityIteration(neighbors, config, workspace),
    );
  }
  buildRiverfallFluidNeighborsV1(
    workspace.predictedS,
    workspace.predictedU,
    config,
    scratch,
  );
  calculateDensities(neighbors, config, workspace);
  const pairLeft = neighbors.left;
  const pairRight = neighbors.right;
  const pairDistance = neighbors.distance;
  const pairCount = neighbors.count;
  let impactCount = 0;
  let impactImpulse = 0;
  let lipAttachmentCount = 0;
  let lipAttachmentImpulse = 0;
  let outflowCrossings = 0;
  let recycleCount = 0;
  let maximumSpeed = 0;
  let maximumFallSpeed = 0;
  let maximumResidualPenetration = 0;
  for (let index = 0; index < count; index += 1) {
    let velocityS = (
      workspace.predictedS[index]! - workspace.oldS[index]!
    ) / dt;
    let velocityU = (
      workspace.predictedU[index]! - workspace.oldU[index]!
    ) / dt;
    const recycled = workspace.oldS[index]! > workspace.predictedS[index]!
      && workspace.oldS[index]! >= hiddenStart;
    if (recycled) {
      velocityS = config.forcing.inletSpeed;
      velocityU = 0;
      recycleCount += 1;
    }
    if (workspace.oldS[index]! < fallStart
      && workspace.predictedS[index]! >= fallStart) {
      const incoming = Math.max(0, velocityS);
      lipAttachmentImpulse += config.particles.mass * Math.hypot(
        incoming,
        config.boundaries.lipAttachmentDownwardSpeed,
      );
      velocityS = config.boundaries.lipAttachmentDownwardSpeed;
      lipAttachmentCount += 1;
    }
    if (workspace.oldS[index]! < impactS
      && workspace.predictedS[index]! >= impactS) {
      const incoming = Math.max(0, velocityS);
      const outgoing = incoming * config.boundaries.fallToPondRestitution;
      impactImpulse += config.particles.mass * Math.hypot(incoming, outgoing);
      velocityS = outgoing;
      impactCount += 1;
    }
    if (workspace.oldS[index]! < hiddenStart
      && workspace.predictedS[index]! >= hiddenStart) {
      outflowCrossings += 1;
    }
    if (workspace.boundaryCorrection[index]! > 0) {
      [velocityS, velocityU] = reflectRiverfallFluidWallVelocityV1(
        velocityS,
        velocityU,
        workspace.boundaryNormalS[index]!,
        workspace.boundaryNormalU[index]!,
        config.boundaries.lateralRestitution,
      );
    }
    maximumResidualPenetration = Math.max(
      maximumResidualPenetration,
      riverfallFluidStripPenetrationV1(
        config,
        workspace.predictedS[index]!,
        workspace.predictedU[index]!,
      ),
    );
    const speed = Math.hypot(velocityS, velocityU);
    if (speed > config.particles.maximumSpeed) {
      const scale = config.particles.maximumSpeed / speed;
      velocityS *= scale;
      velocityU *= scale;
    }
    state.longitudinal[index] = workspace.predictedS[index]!;
    state.lateral[index] = workspace.predictedU[index]!;
    state.longitudinalVelocity[index] = f32(velocityS);
    state.lateralVelocity[index] = f32(velocityU);
  }

  workspace.viscosityS.fill(0);
  workspace.viscosityU.fill(0);
  for (let pair = 0; pair < pairCount; pair += 1) {
    const leftIndex = pairLeft[pair]!;
    const rightIndex = pairRight[pair]!;
    const deltaS = state.longitudinalVelocity[rightIndex]!
      - state.longitudinalVelocity[leftIndex]!;
    const deltaU = state.lateralVelocity[rightIndex]!
      - state.lateralVelocity[leftIndex]!;
    const inverseDensity = 0.5 * (
      1 / Math.max(workspace.density[leftIndex]!, 1e-6)
      + 1 / Math.max(workspace.density[rightIndex]!, 1e-6)
    );
    const weight = config.viscosity.xsphCoefficient
      * config.particles.mass
      * kernel(pairDistance[pair]!, config.density.smoothingRadius)
      * inverseDensity;
    workspace.viscosityS[leftIndex]! += f32(deltaS * weight);
    workspace.viscosityU[leftIndex]! += f32(deltaU * weight);
    workspace.viscosityS[rightIndex]! -= f32(deltaS * weight);
    workspace.viscosityU[rightIndex]! -= f32(deltaU * weight);
  }
  for (let index = 0; index < count; index += 1) {
    const visible = isRiverfallFluidParticleVisibleV1(
      config,
      state.longitudinal[index]!,
    );
    let velocityS = state.longitudinalVelocity[index]!;
    let velocityU = state.lateralVelocity[index]!;
    if (visible) {
      velocityS += workspace.viscosityS[index]!;
      velocityU += workspace.viscosityU[index]!;
    }
    const speed = Math.hypot(velocityS, velocityU);
    if (speed > config.particles.maximumSpeed) {
      const scale = config.particles.maximumSpeed / speed;
      velocityS *= scale;
      velocityU *= scale;
    }
    state.longitudinalVelocity[index] = f32(velocityS);
    state.lateralVelocity[index] = f32(velocityU);
    const storedSpeed = Math.hypot(
      state.longitudinalVelocity[index]!,
      state.lateralVelocity[index]!,
    );
    maximumSpeed = Math.max(maximumSpeed, storedSpeed);
    if (sampleFastRiverfallFluidDomainV1(
      config,
      state.longitudinal[index]!,
    ).reachId === 'fall') {
      maximumFallSpeed = Math.max(
        maximumFallSpeed,
        Math.abs(state.longitudinalVelocity[index]!),
      );
    }
  }
  let relativeSpeedSum = 0;
  for (let pair = 0; pair < pairCount; pair += 1) {
    relativeSpeedSum += Math.hypot(
      state.longitudinalVelocity[pairRight[pair]!]!
        - state.longitudinalVelocity[pairLeft[pair]!]!,
      state.lateralVelocity[pairRight[pair]!]!
        - state.lateralVelocity[pairLeft[pair]!]!,
    );
  }

  const neighborCounts = new Uint16Array(count);
  for (let pair = 0; pair < pairCount; pair += 1) {
    neighborCounts[pairLeft[pair]!]! += 1;
    neighborCounts[pairRight[pair]!]! += 1;
  }
  const densityErrors: number[] = [];
  let visibleParticles = 0;
  let hiddenParticles = 0;
  let minimumNeighbors = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    if (isRiverfallFluidParticleVisibleV1(
      config,
      state.longitudinal[index]!,
    )) {
      visibleParticles += 1;
      minimumNeighbors = Math.min(minimumNeighbors, neighborCounts[index]!);
      densityErrors.push(Math.max(
        0,
        workspace.density[index]! / config.density.restAreaDensity - 1,
      ));
    } else hiddenParticles += 1;
  }
  return {
    visibleParticles,
    hiddenParticles,
    neighborPairs: pairCount,
    minimumNeighbors: Number.isFinite(minimumNeighbors) ? minimumNeighbors : 0,
    maximumDensityError: Math.max(0, ...densityErrors),
    p95DensityError: percentile95(densityErrors),
    maximumSpeed,
    maximumFallSpeed,
    maximumBoundaryCorrection,
    maximumResidualPenetration,
    meanNeighborRelativeSpeed:
      pairCount === 0 ? 0 : relativeSpeedSum / pairCount,
    lipAttachmentCount,
    lipAttachmentImpulse,
    impactCount,
    impactImpulse,
    outflowCrossings,
    recycleCount,
  };
}

export function mapRiverfallFluidParticleToWorldV1(
  state: RiverfallFluidStateV1,
  index: number,
  config: RiverfallFluidConfigV1,
): {
  readonly position: readonly [number, number, number];
  readonly velocity: readonly [number, number, number];
  readonly visibility: 'visible' | 'hidden';
} {
  const mapped = mapValidatedRiverfallFluidCoordinateV1(
    config.domain,
    state.longitudinal[index]!,
    state.lateral[index]!,
  );
  return {
    position: mapped.position,
    velocity: [
      mapped.tangent[0] * state.longitudinalVelocity[index]!
        + mapped.lateralAxis[0] * state.lateralVelocity[index]!,
      mapped.tangent[1] * state.longitudinalVelocity[index]!
        + mapped.lateralAxis[1] * state.lateralVelocity[index]!,
      mapped.tangent[2] * state.longitudinalVelocity[index]!
        + mapped.lateralAxis[2] * state.lateralVelocity[index]!,
    ],
    visibility: mapped.visibility,
  };
}
