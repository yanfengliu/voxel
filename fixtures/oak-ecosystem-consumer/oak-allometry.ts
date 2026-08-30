import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import type { MutableOakOrganV1, MutableOakStateV1 } from './oak-state.js';
import type { OakOrganKindV1 } from './oak-types.js';
import {
  OAK_TAPER_RATIOS_V1,
  oakRenderedWoodShapeV1,
  oakRenderedWoodVolumeAtTaperV1,
  oakWoodTerminalTaperIndexV1,
  oakWoodTaperIndexV1,
} from './oak-wood-shape.js';

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
  return organ.stage !== 'abscised'
    && organ.healthFraction > 0
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
  taperIndex: number,
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
    taperRatio: OAK_TAPER_RATIOS_V1[taperIndex]!,
    shaftVolumeM3,
  };
}

/** Isolated-organ diagnostic uses the same terminal taper as projection. */
export function oakWoodMassVolumeDiagnosticV1(
  organ: OakWoodAllometryFieldsV1,
): OakWoodMassVolumeDiagnosticV1 | null {
  if (!isOakDimensionedWoodKindV1(organ.kind)) return null;
  const taperIndex = oakWoodTaperIndexV1(
    organ.radiusM,
    [],
    oakWoodTerminalTaperIndexV1(organ.kind),
  );
  const volume = oakRenderedWoodVolumeAtTaperV1({
    lengthM: organ.lengthM,
    baseRadiusM: organ.radiusM,
    taperIndex,
  });
  if (volume === null) return null;
  return diagnosticFromShape(organ, taperIndex, volume.shaftVolumeM3);
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
  const taperIndex = oakWoodTaperIndexV1(
    1,
    [],
    oakWoodTerminalTaperIndexV1(organ.kind),
  );
  const unitRadiusVolume = oakRenderedWoodVolumeAtTaperV1({
    lengthM: organ.lengthM,
    baseRadiusM: 1,
    taperIndex,
  });
  if (unitRadiusVolume === null) return null;
  return Math.sqrt(
    freshMassKg
      / (OAK_PARAMETERS_V1.mechanics.greenWoodDensityKgPerM3
        * unitRadiusVolume.shaftVolumeM3),
  );
}

function solveRadiusForContext(
  organ: MutableOakOrganV1,
  children: readonly OakActiveSegmentV1[],
): number {
  const freshMassKg = oakOrganFreshMassKgV1(organ);
  if (!(organ.lengthM > 0) || !Number.isFinite(organ.lengthM)
    || !(freshMassKg > 0) || !Number.isFinite(freshMassKg)) {
    throw new Error(
      `Cannot solve oak wood allometry for '${organ.key}'; expected a finite `
      + `positive length and fresh mass, received ${String(organ.lengthM)} m `
      + `and ${String(freshMassKg)} kg.`,
    );
  }
  const targetVolumeM3 = freshMassKg
    / OAK_PARAMETERS_V1.mechanics.greenWoodDensityKgPerM3;
  const childRadiiM = children.map((child) => child.radiusM);
  const candidates: number[] = [];
  for (const taperIndex of OAK_TAPER_RATIOS_V1.keys()) {
    const unitRadiusVolume = oakRenderedWoodVolumeAtTaperV1({
      lengthM: organ.lengthM,
      baseRadiusM: 1,
      taperIndex,
      nodeFlared: children.length > 0,
    });
    if (unitRadiusVolume === null) continue;
    const radiusM = Math.sqrt(
      targetVolumeM3 / unitRadiusVolume.shaftVolumeM3,
    );
    if (oakWoodTaperIndexV1(
      radiusM,
      childRadiiM,
      oakWoodTerminalTaperIndexV1(organ.kind),
    ) === taperIndex) {
      candidates.push(radiusM);
    }
  }
  const radiusM = candidates.sort((left, right) => left - right)[0];
  if (radiusM === undefined) {
    throw new Error(
      `Cannot solve oak wood allometry for '${organ.key}'; no shared render `
      + 'taper is self-consistent with its children and conserved fresh mass.',
    );
  }
  return radiusM;
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
  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const resolve = (organ: OakActiveSegmentV1): void => {
    if (!isOakDimensionedWoodKindV1(organ.kind) || resolved.has(organ.key)) return;
    if (visiting.has(organ.key)) {
      throw new Error(`Cannot solve cyclic oak wood graph at '${organ.key}'.`);
    }
    visiting.add(organ.key);
    const children = graph.childrenByKey.get(organ.key) ?? [];
    for (const child of children) resolve(child);
    organ.radiusM = solveRadiusForContext(organ, children);
    visiting.delete(organ.key);
    resolved.add(organ.key);
  };
  for (const organ of graph.segments) resolve(organ);
}

export function oakWoodMassVolumeDiagnosticsForStateV1(
  state: MutableOakStateV1,
): readonly OakWoodOrganMassVolumeDiagnosticV1[] {
  const graph = activeSegmentGraph(state);
  const diagnostics: OakWoodOrganMassVolumeDiagnosticV1[] = [];
  for (const organ of graph.segments) {
    if (!isOakDimensionedWoodKindV1(organ.kind)) continue;
    const shape = oakRenderedWoodShapeV1({
      organ,
      children: graph.childrenByKey.get(organ.key) ?? [],
    });
    if (shape !== null) diagnostics.push({
      organKey: organ.key,
      ...diagnosticFromShape(
        organ,
        shape.taperIndex,
        shape.shaftVolumeM3,
      ),
    });
  }
  return diagnostics;
}
