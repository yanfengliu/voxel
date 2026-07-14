export interface RuntimeDisposalResultInternal {
  readonly remaining: readonly (() => void)[];
  readonly firstError: unknown;
}

/** Runs every release and retains only failures for a later idempotent retry. */
export function runRuntimeDisposalInternal(
  actions: readonly (() => void)[],
): RuntimeDisposalResultInternal {
  const remaining: (() => void)[] = [];
  let firstError: unknown;
  for (const release of actions) {
    try {
      release();
    } catch (error) {
      firstError ??= error;
      remaining.push(release);
    }
  }
  return { remaining, firstError };
}
