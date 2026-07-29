import {
  createWindmillCompactCandidateV1,
  WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1,
  type WindmillCompactCandidateV1,
  type WindmillCompactMaterialProfileV1,
} from './windmill-compact-geometry.js';

export const WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1 =
  'studio.windmill-compact-physical-declaration/1' as const;

export interface WindmillCompactMaterialDeclarationV1 {
  /** Null is permitted only on fixed bodies, where solver mass is irrelevant. */
  readonly densityKilogramsPerVoxelCube: number | null;
  readonly friction: number;
  readonly restitution: number;
}

export interface WindmillCompactDynamicBodyDeclarationV1 {
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly gravityScale: number;
  readonly continuous: boolean;
}

/**
 * The catalog sidecar owns one deeply frozen solver-neutral declaration and
 * the consumer fixture imports that exact object. This compiler has no
 * fallback material or body tuning: absent data is an authoring error, not
 * permission to guess.
 */
export interface WindmillCompactPhysicalDeclarationV1 {
  readonly schema: typeof WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1;
  readonly materialProfiles: Readonly<Record<
    WindmillCompactMaterialProfileV1,
    WindmillCompactMaterialDeclarationV1
  >>;
  readonly dynamics: {
    readonly rotor: WindmillCompactDynamicBodyDeclarationV1;
    readonly hammer: WindmillCompactDynamicBodyDeclarationV1;
  };
}

/**
 * Solver-neutral material and body constants for the selected compact
 * windmill sidecars. The browser catalog and the consumer physics fixture
 * both import this exact frozen declaration; neither owns an independent
 * proxy or box-index table.
 */
export const WINDMILL_COMPACT_MATERIAL_PROFILES_V1 = Object.freeze({
  fixedSupport: Object.freeze({
    densityKilogramsPerVoxelCube: null,
    friction: 0.9,
    restitution: 0.02,
  }),
  rotorCore: Object.freeze({
    densityKilogramsPerVoxelCube: 0.48,
    friction: 0.62,
    restitution: 0.03,
  }),
  rotorShaft: Object.freeze({
    densityKilogramsPerVoxelCube: 0.96,
    friction: 0.58,
    restitution: 0.03,
  }),
  sail: Object.freeze({
    densityKilogramsPerVoxelCube: 0.128,
    friction: 0.5,
    restitution: 0.02,
  }),
  cam: Object.freeze({
    densityKilogramsPerVoxelCube: 1.2,
    friction: 0.05,
    restitution: 0.03,
  }),
  rotorCollar: Object.freeze({
    densityKilogramsPerVoxelCube: 0.96,
    friction: 0.12,
    restitution: 0.02,
  }),
  hammerBeam: Object.freeze({
    densityKilogramsPerVoxelCube: 0.4,
    friction: 0.72,
    restitution: 0.05,
  }),
  hammerFollower: Object.freeze({
    densityKilogramsPerVoxelCube: 0.4,
    friction: 0.05,
    restitution: 0.05,
  }),
  hammerPivot: Object.freeze({
    densityKilogramsPerVoxelCube: 0.8,
    friction: 0.65,
    restitution: 0.03,
  }),
  hammerHead: Object.freeze({
    densityKilogramsPerVoxelCube: 1.92,
    friction: 0.76,
    restitution: 0.08,
  }),
  hammerCollar: Object.freeze({
    densityKilogramsPerVoxelCube: 0.96,
    friction: 0.12,
    restitution: 0.02,
  }),
  anvil: Object.freeze({
    densityKilogramsPerVoxelCube: null,
    friction: 0.86,
    restitution: 0.06,
  }),
} satisfies WindmillCompactPhysicalDeclarationV1['materialProfiles']);

export const WINDMILL_COMPACT_BODY_DYNAMICS_V1 = Object.freeze({
  rotor: Object.freeze({
    linearDamping: 0.02,
    angularDamping: 0.06,
    gravityScale: 1,
    continuous: true,
  }),
  hammer: Object.freeze({
    linearDamping: 0.03,
    angularDamping: 0.1,
    gravityScale: 1,
    continuous: true,
  }),
} satisfies WindmillCompactPhysicalDeclarationV1['dynamics']);

export const WINDMILL_COMPACT_PHYSICAL_DECLARATION_V1 = Object.freeze({
  schema: WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1,
  materialProfiles: WINDMILL_COMPACT_MATERIAL_PROFILES_V1,
  dynamics: WINDMILL_COMPACT_BODY_DYNAMICS_V1,
} satisfies WindmillCompactPhysicalDeclarationV1);

const MATERIAL_PROFILE_SET = Object.freeze({
  fixedSupport: true,
  rotorCore: true,
  rotorShaft: true,
  sail: true,
  cam: true,
  rotorCollar: true,
  hammerBeam: true,
  hammerFollower: true,
  hammerPivot: true,
  hammerHead: true,
  hammerCollar: true,
  anvil: true,
} satisfies Readonly<Record<WindmillCompactMaterialProfileV1, true>>);

export const WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1 = Object.freeze(
  Object.keys(MATERIAL_PROFILE_SET) as WindmillCompactMaterialProfileV1[],
);

const MATERIAL_FIELDS = Object.freeze([
  'densityKilogramsPerVoxelCube',
  'friction',
  'restitution',
] as const);
const DYNAMIC_FIELDS = Object.freeze([
  'linearDamping',
  'angularDamping',
  'gravityScale',
  'continuous',
] as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertFrozenRecord(
  value: unknown,
  path: string,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(
      `Cannot compile compact windmill physics: '${path}' must be a plain object.`,
    );
  }
  if (!Object.isFrozen(value)) {
    throw new Error(
      `Cannot compile compact windmill physics: '${path}' must be frozen so `
      + 'selected physical inputs cannot change during compilation.',
    );
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const ownKeys = Reflect.ownKeys(value);
  const symbolic = ownKeys.filter((key) => typeof key === 'symbol');
  const actual = ownKeys.filter((key): key is string =>
    typeof key === 'string');
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length > 0 || extra.length > 0 || symbolic.length > 0) {
    throw new Error(
      `Cannot compile compact windmill physics: '${path}' must contain `
      + `exactly [${expected.join(', ')}]; missing [${missing.join(', ')}], `
      + `unexpected [${extra.join(', ')}]`
      + (symbolic.length === 0 ? '.' : ', and symbol keys are not allowed.'),
    );
  }
}

function assertFiniteNumber(
  value: unknown,
  path: string,
  allowed: (entry: number) => boolean,
  requirement: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || !allowed(value)) {
    throw new Error(
      `Cannot compile compact windmill physics: '${path}' must be `
      + `${requirement}; received ${String(value)}.`,
    );
  }
}

function assertMaterial(
  value: unknown,
  path: string,
): asserts value is WindmillCompactMaterialDeclarationV1 {
  assertFrozenRecord(value, path);
  assertExactKeys(value, MATERIAL_FIELDS, path);
  if (value.densityKilogramsPerVoxelCube !== null) {
    assertFiniteNumber(
      value.densityKilogramsPerVoxelCube,
      `${path}.densityKilogramsPerVoxelCube`,
      (entry) => entry > 0,
      'null for a fixed body or a finite number above 0',
    );
  }
  assertFiniteNumber(
    value.friction,
    `${path}.friction`,
    (entry) => entry >= 0,
    'a finite number at least 0',
  );
  assertFiniteNumber(
    value.restitution,
    `${path}.restitution`,
    (entry) => entry >= 0 && entry <= 1,
    'a finite number from 0 through 1',
  );
}

function assertDynamics(
  value: unknown,
  path: string,
): asserts value is WindmillCompactDynamicBodyDeclarationV1 {
  assertFrozenRecord(value, path);
  assertExactKeys(value, DYNAMIC_FIELDS, path);
  assertFiniteNumber(
    value.linearDamping,
    `${path}.linearDamping`,
    (entry) => entry >= 0,
    'a finite number at least 0',
  );
  assertFiniteNumber(
    value.angularDamping,
    `${path}.angularDamping`,
    (entry) => entry >= 0,
    'a finite number at least 0',
  );
  assertFiniteNumber(
    value.gravityScale,
    `${path}.gravityScale`,
    (entry) => entry >= 0,
    'a finite number at least 0',
  );
  if (typeof value.continuous !== 'boolean') {
    throw new Error(
      `Cannot compile compact windmill physics: '${path}.continuous' must `
      + `be true or false; received ${String(value.continuous)}.`,
    );
  }
}

export function assertWindmillCompactPhysicalDeclarationV1(
  declaration: WindmillCompactPhysicalDeclarationV1,
): void {
  assertFrozenRecord(declaration, 'declaration');
  assertExactKeys(
    declaration,
    ['schema', 'materialProfiles', 'dynamics'],
    'declaration',
  );
  const receivedSchema: unknown =
    (declaration as { readonly schema?: unknown }).schema;
  if (receivedSchema !== WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1) {
    throw new Error(
      `Cannot compile compact windmill physics declaration schema `
      + `'${String(receivedSchema)}'; expected `
      + `'${WINDMILL_COMPACT_PHYSICAL_DECLARATION_SCHEMA_V1}'.`,
    );
  }
  assertFrozenRecord(
    declaration.materialProfiles,
    'declaration.materialProfiles',
  );
  assertExactKeys(
    declaration.materialProfiles,
    WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1,
    'declaration.materialProfiles',
  );
  WINDMILL_COMPACT_MATERIAL_PROFILE_KEYS_V1.forEach((profile) => {
    assertMaterial(
      declaration.materialProfiles[profile],
      `declaration.materialProfiles.${profile}`,
    );
  });
  assertFrozenRecord(declaration.dynamics, 'declaration.dynamics');
  assertExactKeys(
    declaration.dynamics,
    ['rotor', 'hammer'],
    'declaration.dynamics',
  );
  assertDynamics(declaration.dynamics.rotor, 'declaration.dynamics.rotor');
  assertDynamics(declaration.dynamics.hammer, 'declaration.dynamics.hammer');
}

function firstDifference(
  received: unknown,
  expected: unknown,
  path = '$',
): string | undefined {
  if (Object.is(received, expected)) return undefined;
  const arrays = Array.isArray(received) && Array.isArray(expected);
  if (arrays && received.length !== expected.length) return `${path}.length`;
  if (arrays || (isRecord(received) && isRecord(expected))) {
    const receivedObject = received as object;
    const expectedObject = expected as object;
    const receivedKeys = Reflect.ownKeys(receivedObject);
    const expectedKeys = Reflect.ownKeys(expectedObject);
    const key = expectedKeys.find((entry) => !receivedKeys.includes(entry))
      ?? receivedKeys.find((entry) => !expectedKeys.includes(entry));
    if (key !== undefined) return `${path}.${String(key)}`;
    for (const entry of expectedKeys) {
      const receivedDescriptor =
        Object.getOwnPropertyDescriptor(receivedObject, entry);
      const expectedDescriptor =
        Object.getOwnPropertyDescriptor(expectedObject, entry);
      if (receivedDescriptor === undefined
        || expectedDescriptor === undefined
        || !('value' in receivedDescriptor)
        || !('value' in expectedDescriptor)) {
        return `${path}.${String(entry)}`;
      }
      const childPath = arrays && entry !== 'length'
        ? `${path}[${String(entry)}]`
        : `${path}.${String(entry)}`;
      const difference = firstDifference(
        receivedDescriptor.value,
        expectedDescriptor.value,
        childPath,
      );
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  return path;
}

export function assertWindmillCompactCanonicalCandidateV1(
  candidate: WindmillCompactCandidateV1,
): void {
  if (!isRecord(candidate)) {
    throw new Error(
      'Cannot compile compact windmill physics: candidate must be a plain object.',
    );
  }
  const receivedSchema: unknown =
    (candidate as { readonly schema?: unknown }).schema;
  if (receivedSchema !== WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1) {
    throw new Error(
      `Cannot compile compact windmill physics schema `
      + `'${String(receivedSchema)}'; expected `
      + `'${WINDMILL_COMPACT_GEOMETRY_SCHEMA_V1}'.`,
    );
  }
  let canonical: WindmillCompactCandidateV1;
  try {
    canonical = createWindmillCompactCandidateV1(candidate.parameters);
  } catch (error) {
    throw new Error(
      `Cannot compile compact windmill physics candidate parameters: `
      + (error instanceof Error ? error.message : String(error)),
      { cause: error },
    );
  }
  const difference = firstDifference(candidate, canonical);
  if (difference !== undefined) {
    throw new Error(
      `Cannot compile compact windmill physics '${candidate.parameterKey}': `
      + `candidate differs from its canonical generator at '${difference}'. `
      + 'Regenerate the candidate before deriving physical sidecars.',
    );
  }
}
