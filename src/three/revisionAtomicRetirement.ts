import type { ThreeRevisionPresentationBundleInternal } from './revisionAtomicBundle.js';

export function retireRevisionAtomicBundleInternal(
  bundle: ThreeRevisionPresentationBundleInternal | null,
  pending: Set<ThreeRevisionPresentationBundleInternal>,
): 'complete' | 'pending' {
  if (!bundle) return 'complete';
  try {
    bundle.dispose();
    return 'complete';
  } catch {
    pending.add(bundle);
    return 'pending';
  }
}

export function retryRevisionAtomicRetirementsInternal(
  pending: Set<ThreeRevisionPresentationBundleInternal>,
): unknown[] {
  const errors: unknown[] = [];
  for (const bundle of [...pending]) {
    try {
      bundle.dispose();
      pending.delete(bundle);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}
