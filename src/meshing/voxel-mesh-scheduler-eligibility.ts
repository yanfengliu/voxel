import type {
  MeshSchedulerEligibilityResolverV1,
  MeshSchedulerEligibilityV1,
} from './voxel-mesh-scheduler-contract.js';
import { meshSchedulerEligibilityMismatchV1Internal } from './voxel-mesh-scheduler-validation.js';

/** Fail closed when canonical recomputation is absent, malformed, or throws. */
export function meshSchedulerEligibilityIsCurrentV1Internal(
  expected: MeshSchedulerEligibilityV1,
  resolver: MeshSchedulerEligibilityResolverV1,
): boolean {
  try {
    const current = resolver(expected);
    return current !== null
      && meshSchedulerEligibilityMismatchV1Internal(expected, current) === null;
  } catch {
    return false;
  }
}
