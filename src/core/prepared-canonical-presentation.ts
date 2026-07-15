type PreparedCanonicalPresentationPhaseInternal =
  | 'prepared'
  | 'publishing'
  | 'published'
  | 'aborting'
  | 'aborted'
  | 'finalizing'
  | 'finalized';

export interface PreparedCanonicalPresentationOperationsInternal {
  publish(): boolean;
  abort(): void;
  finalize(): boolean;
}

interface PreparedCanonicalPresentationStateInternal {
  phase: PreparedCanonicalPresentationPhaseInternal;
  operations: PreparedCanonicalPresentationOperationsInternal | null;
}

const CREATION_KEY_INTERNAL = Symbol('PreparedCanonicalPresentationInternal');
const STATES_INTERNAL = new WeakMap<
  PreparedCanonicalPresentationInternal,
  PreparedCanonicalPresentationStateInternal
>();

export class PreparedCanonicalPresentationInternal {
  readonly [Symbol.toStringTag] = 'PreparedCanonicalPresentationInternal';

  constructor(
    key: symbol,
    operations: PreparedCanonicalPresentationOperationsInternal,
  ) {
    if (key !== CREATION_KEY_INTERNAL) {
      throw new TypeError('Prepared canonical presentation tickets are package-owned.');
    }
    STATES_INTERNAL.set(this, { phase: 'prepared', operations });
    Object.freeze(this);
  }
}

function stateOf(
  ticket: PreparedCanonicalPresentationInternal,
): PreparedCanonicalPresentationStateInternal {
  const state = STATES_INTERNAL.get(ticket);
  if (!state) throw new TypeError('Invalid prepared canonical presentation ticket.');
  return state;
}

export function createPreparedCanonicalPresentationInternal(
  operations: PreparedCanonicalPresentationOperationsInternal,
): PreparedCanonicalPresentationInternal {
  return new PreparedCanonicalPresentationInternal(CREATION_KEY_INTERNAL, operations);
}

export function publishPreparedCanonicalPresentationInternal(
  ticket: PreparedCanonicalPresentationInternal,
): boolean {
  const state = stateOf(ticket);
  if (state.phase !== 'prepared') return false;
  const operations = state.operations!;
  state.phase = 'publishing';
  try {
    const published = operations.publish();
    state.phase = published ? 'published' : 'aborted';
    if (!published) state.operations = null;
    return published;
  } catch (error) {
    let cleanup: unknown;
    try { operations.abort(); } catch (caught) { cleanup = caught; }
    state.operations = null;
    state.phase = 'aborted';
    if (cleanup !== undefined) {
      throw new AggregateError(
        [error, cleanup],
        'Canonical presentation publish rollback failed.',
        { cause: error },
      );
    }
    throw error;
  }
}

export function abortPreparedCanonicalPresentationInternal(
  ticket: PreparedCanonicalPresentationInternal,
): void {
  const state = stateOf(ticket);
  if (state.phase !== 'prepared' && state.phase !== 'published') return;
  const operations = state.operations!;
  state.phase = 'aborting';
  try {
    operations.abort();
  } finally {
    state.operations = null;
    state.phase = 'aborted';
  }
}

export function finalizePreparedCanonicalPresentationInternal(
  ticket: PreparedCanonicalPresentationInternal,
): boolean {
  const state = stateOf(ticket);
  if (state.phase !== 'published') return false;
  const operations = state.operations!;
  state.phase = 'finalizing';
  try {
    const finalized = operations.finalize();
    state.operations = null;
    state.phase = finalized ? 'finalized' : 'aborted';
    return finalized;
  } catch (error) {
    let cleanup: unknown;
    try { operations.abort(); } catch (caught) { cleanup = caught; }
    state.operations = null;
    state.phase = 'aborted';
    if (cleanup !== undefined) {
      throw new AggregateError(
        [error, cleanup],
        'Canonical presentation finalization cleanup failed.',
        { cause: error },
      );
    }
    throw error;
  }
}
