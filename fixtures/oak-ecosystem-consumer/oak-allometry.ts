import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import {
  isOakAttachedLivingOrganV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import type { MutableOakOrganV1, MutableOakStateV1 } from './oak-state.js';
import type { OakOrganKindV1 } from './oak-types.js';
import {
  OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1,
  oakPhysicalWoodRadiusMForFreshMassV1,
  oakPhysicalWoodVolumeM3V1,
} from './oak-physical-wood.js';

type OakMassPoolFieldsV1 = Pick<MutableOakOrganV1,
  | 'structuralCarbonKg'
  | 'waterLiters'>;

type OakWoodAllometryFieldsV1 = OakMassPoolFieldsV1 & Pick<MutableOakOrganV1,
  | 'kind'
  | 'lengthM'
  | 'radiusM'>;

type OakActiveSegmentV1 = MutableOakOrganV1 & {
  kind: 'stem' | 'branch' | 'coarse-root' | 'fine-root-cohort';
};

export type OakDimensionedWoodKindV1 = 'stem' | 'branch' | 'coarse-root';

export interface OakWoodMassVolumeDiagnosticV1 {
  readonly ownedFreshMassKg: number;
  readonly geometryImpliedGreenMassKg: number;
  readonly ownedToGeometryMassRatio: number;
  readonly taperRatio: number;
  readonly shaftVolumeM3: number;
}

export interface OakWoodOrganMassVolumeDiagnosticV1
  extends OakWoodMassVolumeDiagnosticV1 {
  readonly organKey: string;
}

export function isOakDimensionedWoodKindV1(
  kind: OakOrganKindV1,
): kind is OakDimensionedWoodKindV1 {
  switch (kind) {
    case 'stem':
    case 'branch':
    case 'coarse-root':
      return true;
    case 'fine-root-cohort':
      // The bounded cohort is an aggregate uptake/topology surrogate, not a
      // dimensioned inventory of every absorptive root cylinder.
      return false;
    case 'bud':
      // A bud is living meristematic tissue, not green wood.
      return false;
    case 'acorn':
    case 'leaf':
      return false;
  }
}

function isActiveSegment(organ: MutableOakOrganV1): organ is OakActiveSegmentV1 {
  return isOakPlacedOrganV1(organ)
    && isOakAttachedLivingOrganV1(organ)
    && (organ.kind === 'stem'
      || organ.kind === 'branch'
      || organ.kind === 'coarse-root'
      || organ.kind === 'fine-root-cohort');
}

/** Biology-owned fresh mass; this is shared by allometry and self-weight. */
export function oakOrganFreshMassKgV1(organ: OakMassPoolFieldsV1): number {
  return organ.structuralCarbonKg
      / OAK_PARAMETERS_V1.growth.structuralCarbonFractionOfDryMass
    + organ.waterLiters * OAK_PARAMETERS_V1.mechanics.waterDensityKgPerLiter;
}

function diagnosticFromShape(
  organ: OakMassPoolFieldsV1,
  shaftVolumeM3: number,
): OakWoodMassVolumeDiagnosticV1 {
  const ownedFreshMassKg = oakOrganFreshMassKgV1(organ);
  const geometryImpliedGreenMassKg = shaftVolumeM3
    * OAK_PARAMETERS_V1.mechanics.greenWoodDensityKgPerM3;
  return {
    ownedFreshMassKg,
    geometryImpliedGreenMassKg,
    ownedToGeometryMassRatio: geometryImpliedGreenMassKg > 0
      ? ownedFreshMassKg / geometryImpliedGreenMassKg
      : 0,
    taperRatio: OAK_PHYSICAL_WOOD_TIP_RADIUS_RATIO_V1,
    shaftVolumeM3,
  };
}

/** Renderer-free diagnostic over the physical circular tapered shaft. */
export function oakWoodMassVolumeDiagnosticV1(
  organ: OakWoodAllometryFieldsV1,
): OakWoodMassVolumeDiagnosticV1 | null {
  if (!isOakDimensionedWoodKindV1(organ.kind)) return null;
  const volume = oakPhysicalWoodVolumeM3V1(organ.lengthM, organ.radiusM);
  if (volume === null) return null;
  return diagnosticFromShape(organ, volume);
}

/** Exact terminal-shaft solve used by the isolated counter/control. */
export function oakAllometricWoodRadiusMForOrganV1(
  organ: OakWoodAllometryFieldsV1,
): number | null {
  if (!isOakDimensionedWoodKindV1(organ.kind)) return null;
  if (!(organ.lengthM > 0) || !Number.isFinite(organ.lengthM)) {
    throw new Error(
      `Cannot solve isolated oak wood allometry for ${organ.kind} length `
      + `${String(organ.lengthM)} m; expected a finite positive length.`,
    );
  }
  const freshMassKg = oakOrganFreshMassKgV1(organ);
  if (!(freshMassKg > 0) || !Number.isFinite(freshMassKg)) {
    throw new Error(
      `Cannot solve isolated oak wood allometry for ${organ.kind} fresh mass `
      + `${String(freshMassKg)} kg; expected a finite positive mass.`,
    );
  }
  return oakPhysicalWoodRadiusMForFreshMassV1(organ.lengthM, freshMassKg);
}

function activeSegmentGraph(state: MutableOakStateV1): Readonly<{
  segments: readonly OakActiveSegmentV1[];
  byKey: ReadonlyMap<string, OakActiveSegmentV1>;
  childrenByKey: ReadonlyMap<string, readonly OakActiveSegmentV1[]>;
}> {
  const segments = state.organs.filter(isActiveSegment);
  const byKey = new Map(segments.map((organ) => [organ.key, organ]));
  const mutableChildren = new Map<string, OakActiveSegmentV1[]>();
  for (const organ of segments) {
    if (organ.parentKey === null) continue;
    const children = mutableChildren.get(organ.parentKey) ?? [];
    children.push(organ);
    mutableChildren.set(organ.parentKey, children);
  }
  return { segments, byKey, childrenByKey: mutableChildren };
}

/** Reconciles derived geometry only; resource pools and ledgers are untouched. */
export function reconcileOakWoodAllometryV1(state: MutableOakStateV1): void {
  const graph = activeSegmentGraph(state);
  for (const organ of graph.segments) {
    const radiusM = oakAllometricWoodRadiusMForOrganV1(organ);
    if (radiusM !== null) organ.radiusM = radiusM;
  }
}

export function oakWoodMassVolumeDiagnosticsForStateV1(
  state: MutableOakStateV1,
): readonly OakWoodOrganMassVolumeDiagnosticV1[] {
  const graph = activeSegmentGraph(state);
  const diagnostics: OakWoodOrganMassVolumeDiagnosticV1[] = [];
  for (const organ of graph.segments) {
    const diagnostic = oakWoodMassVolumeDiagnosticV1(organ);
    if (diagnostic !== null) diagnostics.push({
      organKey: organ.key,
      ...diagnostic,
    });
  }
  return diagnostics;
}
