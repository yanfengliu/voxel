/** Monotonic logical time and non-reentrant mutation guard for one coordinator. */
export class RevisionAtomicTargetCoordinatorGuardInternal {
  #logicalTick = 0;
  #operationInProgress = false;

  nextTickInternal(): number {
    if (this.#logicalTick >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError('Revision-atomic coordinator logical tick is exhausted.');
    }
    this.#logicalTick += 1;
    return this.#logicalTick;
  }

  operateInternal<Result>(operation: () => Result): Result {
    if (this.#operationInProgress) {
      throw new Error('Revision-atomic target coordinator does not permit reentrant mutations.');
    }
    this.#operationInProgress = true;
    try {
      return operation();
    } finally {
      this.#operationInProgress = false;
    }
  }
}
