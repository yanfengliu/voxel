import type {
  ContextReconstructionCleanupErrorInternal,
  ContextReconstructionCleanupReportInternal,
  ContextReconstructionResourceLeaseInternal,
} from './contextReconstructionContracts.js';

function assertResourceIdInternal(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 256) {
    throw new TypeError('Reconstruction resourceIdInternal must be a non-empty bounded string.');
  }
}

function freezeCleanupErrorInternal(
  resourceId: string,
  error: unknown,
): ContextReconstructionCleanupErrorInternal {
  return Object.freeze({ resourceId, error });
}

export function emptyReconstructionCleanupInternal(): ContextReconstructionCleanupReportInternal {
  return Object.freeze({ attempted: 0, disposed: 0, pending: 0, errors: Object.freeze([]) });
}

export function combineReconstructionCleanupInternal(
  reports: readonly ContextReconstructionCleanupReportInternal[],
): ContextReconstructionCleanupReportInternal {
  if (reports.length === 0) return emptyReconstructionCleanupInternal();
  const errors = reports.flatMap((report) => report.errors);
  return Object.freeze({
    attempted: reports.reduce((total, report) => total + report.attempted, 0),
    disposed: reports.reduce((total, report) => total + report.disposed, 0),
    pending: reports.at(-1)?.pending ?? 0,
    errors: Object.freeze(errors),
  });
}

/** A bounded ownership ledger. Failed disposal remains present and is retried in insertion order. */
export class ContextReconstructionResourceSetInternal {
  readonly #leases = new Map<string, ContextReconstructionResourceLeaseInternal>();

  constructor(private readonly maxLeasesInternal: number) {}

  get sizeInternal(): number {
    return this.#leases.size;
  }

  registerInternal(lease: ContextReconstructionResourceLeaseInternal): void {
    assertResourceIdInternal(lease.resourceIdInternal);
    if (typeof lease.disposeInternal !== 'function') {
      throw new TypeError('Reconstruction resource lease must provide disposeInternal().');
    }
    const existing = this.#leases.get(lease.resourceIdInternal);
    if (existing === lease) return;
    if (existing) {
      throw new Error(`Duplicate reconstruction resource id: ${lease.resourceIdInternal}`);
    }
    if (this.#leases.size >= this.maxLeasesInternal) {
      throw new RangeError('Reconstruction resource lease budget exceeded.');
    }
    this.#leases.set(lease.resourceIdInternal, lease);
  }

  moveIntoInternal(destination: ContextReconstructionResourceSetInternal): void {
    if (destination === this || this.#leases.size === 0) return;
    destination.#assertCanAcceptTransferInternal(this.#leases);
    for (const [resourceId, lease] of this.#leases) {
      destination.#leases.set(resourceId, lease);
    }
    this.#leases.clear();
  }

  #assertCanAcceptTransferInternal(
    incoming: ReadonlyMap<string, ContextReconstructionResourceLeaseInternal>,
  ): void {
    if (this.#leases.size + incoming.size > this.maxLeasesInternal) {
      throw new RangeError('Reconstruction resource lease budget exceeded.');
    }
    for (const resourceId of incoming.keys()) {
      if (this.#leases.has(resourceId)) {
        throw new Error(`Duplicate reconstruction resource id: ${resourceId}`);
      }
    }
  }

  cleanupInternal(): ContextReconstructionCleanupReportInternal {
    const attempted = this.#leases.size;
    let disposed = 0;
    const errors: ContextReconstructionCleanupErrorInternal[] = [];
    for (const [resourceId, lease] of [...this.#leases]) {
      try {
        lease.disposeInternal();
        this.#leases.delete(resourceId);
        disposed += 1;
      } catch (error) {
        errors.push(freezeCleanupErrorInternal(resourceId, error));
      }
    }
    return Object.freeze({
      attempted,
      disposed,
      pending: this.#leases.size,
      errors: Object.freeze(errors),
    });
  }
}
