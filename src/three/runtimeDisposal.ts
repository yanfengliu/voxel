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

type RuntimeOperationOutcomeInternal<Result> =
  | { readonly status: 'returned'; readonly value: Result }
  | { readonly status: 'threw'; readonly error: unknown };

/** Defers teardown requested by synchronous callbacks until their owner unwinds. */
export class RuntimeDeferredDisposalInternal {
  #actions: readonly (() => void)[] | null = null;
  #disposalInProgress = false;
  #operationDepth = 0;
  #deferred = false;

  get operationActiveInternal(): boolean {
    return this.#operationDepth > 0;
  }

  requestInternal(actions?: readonly (() => void)[]): void {
    if (actions && !this.#actions) this.#actions = actions;
    if (this.operationActiveInternal) {
      this.#deferred = true;
      return;
    }
    this.drainInternal();
  }

  runOperationInternal<Result>(operation: () => Result): Result {
    this.#operationDepth += 1;
    let outcome: RuntimeOperationOutcomeInternal<Result>;
    try {
      outcome = { status: 'returned', value: operation() };
    } catch (error) {
      outcome = { status: 'threw', error };
    }
    this.#operationDepth -= 1;

    let disposalOutcome: RuntimeOperationOutcomeInternal<void> = {
      status: 'returned', value: undefined,
    };
    if (!this.operationActiveInternal && this.#deferred) {
      this.#deferred = false;
      try {
        this.drainInternal();
      } catch (error) {
        disposalOutcome = { status: 'threw', error };
      }
    }
    if (outcome.status === 'threw') {
      if (disposalOutcome.status === 'threw') {
        throw new AggregateError(
          [outcome.error, disposalOutcome.error],
          'Frame operation and deferred runtime disposal both failed.',
          { cause: outcome.error },
        );
      }
      throw outcome.error;
    }
    if (disposalOutcome.status === 'threw') throw disposalOutcome.error;
    return outcome.value;
  }

  private drainInternal(): void {
    if (!this.#actions || this.#disposalInProgress) return;
    this.#disposalInProgress = true;
    const { remaining, firstError } = runRuntimeDisposalInternal(this.#actions);
    this.#actions = remaining.length > 0 ? remaining : null;
    this.#disposalInProgress = false;
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) throw new Error('Runtime disposal failed.', { cause: firstError });
  }
}
