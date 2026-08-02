/**
 * Solver settings whose values change the world a live scene solves.
 *
 * This is deliberately a structural browser-side contract rather than a
 * Rapier type. Studio loads Rapier dynamically, while consumer fixtures may
 * own their own world; both lanes still have to apply the same complete set
 * of integration parameters when they claim to solve the same proof.
 */
export interface LivePhysicsNumericalProfileV1 {
  readonly schema: string;
  readonly id: string;
  readonly fixedStepSeconds: number;
  readonly contactNaturalFrequency: number;
  readonly lengthUnit: number;
  readonly normalizedAllowedLinearError: number;
  readonly normalizedPredictionDistance: number;
  readonly numSolverIterations: number;
  readonly numInternalPgsIterations: number;
  readonly minIslandSize: number;
  readonly maxCcdSubsteps: number;
}

/** The writable Rapier integration-parameter surface used by both lanes. */
export interface LivePhysicsIntegrationParametersV1 {
  dt: number;
  contact_natural_frequency: number;
  lengthUnit: number;
  normalizedAllowedLinearError: number;
  normalizedPredictionDistance: number;
  numSolverIterations: number;
  numInternalPgsIterations: number;
  minIslandSize: number;
  maxCcdSubsteps: number;
}

/**
 * Application receipt with profile field names. Getter-backed values are
 * read from the world; the setter-only contact frequency records the write.
 */
export type LivePhysicsNumericalSnapshotV1 = Readonly<Omit<
  LivePhysicsNumericalProfileV1,
  'schema' | 'id'
>>;

export function assertLivePhysicsNumericalProfileV1(
  profile: LivePhysicsNumericalProfileV1,
): void {
  if (profile.schema.trim().length === 0) {
    throw new Error(
      `Cannot configure solver profile '${profile.id}': schema is `
      + 'empty; provide the versioned contract that gives these settings '
      + 'their meaning.',
    );
  }
  if (profile.id.trim().length === 0) {
    throw new Error(
      'Cannot configure a solver profile with an empty id; provide a stable '
      + 'label for convergence evidence.',
    );
  }
  const positiveFinite = [
    ['fixedStepSeconds', profile.fixedStepSeconds],
    ['contactNaturalFrequency', profile.contactNaturalFrequency],
    ['lengthUnit', profile.lengthUnit],
  ] as const;
  const invalidPositive = positiveFinite.find(([, value]) =>
    !Number.isFinite(value) || value <= 0);
  if (invalidPositive !== undefined) {
    throw new Error(
      `Cannot configure solver profile '${profile.id}': `
      + `${invalidPositive[0]} is ${String(invalidPositive[1])}; expected a `
      + 'finite positive value.',
    );
  }
  const nonnegativeFinite = [
    ['normalizedAllowedLinearError',
      profile.normalizedAllowedLinearError],
    ['normalizedPredictionDistance',
      profile.normalizedPredictionDistance],
  ] as const;
  const invalidNonnegative = nonnegativeFinite.find(([, value]) =>
    !Number.isFinite(value) || value < 0);
  if (invalidNonnegative !== undefined) {
    throw new Error(
      `Cannot configure solver profile '${profile.id}': `
      + `${invalidNonnegative[0]} is ${String(invalidNonnegative[1])}; `
      + 'expected a finite non-negative value.',
    );
  }
  const positiveIntegers = [
    ['numSolverIterations', profile.numSolverIterations],
    ['numInternalPgsIterations', profile.numInternalPgsIterations],
    ['maxCcdSubsteps', profile.maxCcdSubsteps],
  ] as const;
  const invalidPositiveInteger = positiveIntegers.find(([, value]) =>
    !Number.isSafeInteger(value) || value <= 0);
  if (invalidPositiveInteger !== undefined) {
    throw new Error(
      `Cannot configure solver profile '${profile.id}': `
      + `${invalidPositiveInteger[0]} is `
      + `${String(invalidPositiveInteger[1])}; expected a positive safe `
      + 'integer.',
    );
  }
  if (!Number.isSafeInteger(profile.minIslandSize)
    || profile.minIslandSize < 0) {
    throw new Error(
      `Cannot configure solver profile '${profile.id}': minIslandSize is `
      + `${String(profile.minIslandSize)}; expected a non-negative safe `
      + 'integer.',
    );
  }
}

export function freezeLivePhysicsNumericalProfileV1<
  Profile extends LivePhysicsNumericalProfileV1,
>(profile: Profile): Readonly<Profile> {
  assertLivePhysicsNumericalProfileV1(profile);
  return Object.freeze({ ...profile });
}

/**
 * Applies every declared setting; neither lane may inherit silent defaults.
 *
 * Rapier 0.19.3 exposes `contact_natural_frequency` as a setter with no
 * getter. The returned receipt therefore carries the value written by this
 * call for that one field and reads every other field back from the target.
 */
export function applyLivePhysicsNumericalProfileV1(
  target: LivePhysicsIntegrationParametersV1,
  profile: LivePhysicsNumericalProfileV1,
): LivePhysicsNumericalSnapshotV1 {
  assertLivePhysicsNumericalProfileV1(profile);
  target.dt = profile.fixedStepSeconds;
  target.contact_natural_frequency = profile.contactNaturalFrequency;
  target.lengthUnit = profile.lengthUnit;
  target.normalizedAllowedLinearError = profile.normalizedAllowedLinearError;
  target.normalizedPredictionDistance = profile.normalizedPredictionDistance;
  target.numSolverIterations = profile.numSolverIterations;
  target.numInternalPgsIterations = profile.numInternalPgsIterations;
  target.minIslandSize = profile.minIslandSize;
  target.maxCcdSubsteps = profile.maxCcdSubsteps;
  return Object.freeze({
    fixedStepSeconds: target.dt,
    contactNaturalFrequency: profile.contactNaturalFrequency,
    lengthUnit: target.lengthUnit,
    normalizedAllowedLinearError: target.normalizedAllowedLinearError,
    normalizedPredictionDistance: target.normalizedPredictionDistance,
    numSolverIterations: target.numSolverIterations,
    numInternalPgsIterations: target.numInternalPgsIterations,
    minIslandSize: target.minIslandSize,
    maxCcdSubsteps: target.maxCcdSubsteps,
  });
}
