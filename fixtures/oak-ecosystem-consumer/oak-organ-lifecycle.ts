import type {
  OakOrganDevelopmentPhaseV1,
  OakOrganKindV1,
  OakOrganStageV1,
} from './oak-types.js';

interface OakLifecycleOrganV1 {
  readonly kind: OakOrganKindV1;
  readonly stage: OakOrganStageV1;
  readonly healthFraction: number;
  readonly developmentPhase?: OakOrganDevelopmentPhaseV1;
  readonly development?: {
    readonly phase: OakOrganDevelopmentPhaseV1;
  };
}

function developmentPhase(
  organ: OakLifecycleOrganV1,
): OakOrganDevelopmentPhaseV1 | undefined {
  return organ.developmentPhase ?? organ.development?.phase;
}

/** True when an organ has emerged into the spatially placed plant. */
export function isOakPlacedOrganV1(organ: OakLifecycleOrganV1): boolean {
  return organ.stage !== 'abscised'
    && developmentPhase(organ) !== 'preformed'
    && organ.healthFraction > 0;
}

/** True for attached tissue that still participates in plant metabolism. */
export function isOakAttachedLivingOrganV1(
  organ: OakLifecycleOrganV1,
): boolean {
  return organ.stage !== 'abscised'
    && organ.stage !== 'detached'
    && organ.healthFraction > 0;
}

/** True only for an emerged, attached leaf exchanging with the atmosphere. */
export function isOakExposedAttachedLeafV1(
  organ: OakLifecycleOrganV1,
): boolean {
  return organ.kind === 'leaf'
    && organ.stage !== 'detached'
    && isOakPlacedOrganV1(organ);
}

/** True only for emerged, attached absorptive-root support. */
export function isOakExposedAttachedFineRootV1(
  organ: OakLifecycleOrganV1,
): boolean {
  return organ.kind === 'fine-root-cohort'
    && isOakPlacedOrganV1(organ)
    && isOakAttachedLivingOrganV1(organ);
}
