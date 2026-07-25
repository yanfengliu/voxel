/** The four identity-keyed collections shown in the Studio's left rail. */
export type StudioShelfItemKindV1 = 'model' | 'part' | 'recipe' | 'scene';

export type StudioShelfMovePositionV1 = 'before' | 'after';

/**
 * One mount-local shelf move.
 *
 * Models keep their catalog section, identified by its array position. The
 * other collections have one flat scope and therefore reject `sectionIndex`.
 */
export interface StudioShelfMoveV1 {
  readonly kind: StudioShelfItemKindV1;
  readonly id: string;
  readonly targetId: string;
  readonly position: StudioShelfMovePositionV1;
  readonly sectionIndex?: number;
}

export interface StudioShelfOrderWorkspaceV1 {
  /** Reconciles a stored order with the current IDs without mutating source data. */
  order(
    kind: StudioShelfItemKindV1,
    ids: readonly string[],
    sectionIndex?: number,
  ): readonly string[];
  /**
   * Moves one unique stable ID relative to another and returns the resulting
   * order. A failed publication callback rolls the order back atomically.
   */
  move(
    request: StudioShelfMoveV1,
    ids: readonly string[],
    publish?: () => void,
  ): readonly string[];
}

/**
 * Projects immutable records through an already reconciled stable-ID order.
 * Ambiguous or mismatched IDs fail closed to the source order.
 */
export function projectStudioShelfOrderV1<T>(
  records: readonly T[],
  orderedIds: readonly string[],
  idOf: (record: T) => string,
): readonly T[] {
  if (records.length !== orderedIds.length || duplicateId(orderedIds) !== null) return [...records];
  const byId = new Map<string, T>();
  for (const record of records) {
    const id = idOf(record);
    if (byId.has(id)) return [...records];
    byId.set(id, record);
  }
  const projected: T[] = [];
  for (const id of orderedIds) {
    const record = byId.get(id);
    if (record === undefined) return [...records];
    projected.push(record);
  }
  return projected;
}

const KINDS: readonly StudioShelfItemKindV1[] = ['model', 'part', 'recipe', 'scene'];

function requireKind(kind: unknown): asserts kind is StudioShelfItemKindV1 {
  if (!KINDS.some((candidate) => candidate === kind)) {
    throw new Error(
      `Shelf items cannot be rearranged for the unknown kind '${String(kind)}'; `
      + `choose one of ${KINDS.join(', ')}.`,
    );
  }
}

export function prepareStudioShelfMoveV1(value: unknown): StudioShelfMoveV1 {
  if (value === null || typeof value !== 'object') {
    throw new Error('A shelf move must be an object naming its kind, id, targetId, and position.');
  }
  const candidate = value as {
    readonly kind?: unknown;
    readonly id?: unknown;
    readonly targetId?: unknown;
    readonly position?: unknown;
    readonly sectionIndex?: unknown;
  };
  requireKind(candidate.kind);
  if (typeof candidate.id !== 'string' || typeof candidate.targetId !== 'string') {
    throw new Error('A shelf move must name its id and targetId as strings returned by shelfOrder().');
  }
  if (candidate.position !== 'before' && candidate.position !== 'after') {
    throw new Error(
      `Shelf item '${candidate.id}' cannot be rearranged with position `
      + `'${String(candidate.position)}'; choose 'before' or 'after'.`,
    );
  }
  if (candidate.sectionIndex !== undefined && typeof candidate.sectionIndex !== 'number') {
    throw new Error('A shelf move sectionIndex must be a non-negative integer from shelf().');
  }
  return {
    kind: candidate.kind,
    id: candidate.id,
    targetId: candidate.targetId,
    position: candidate.position,
    ...(candidate.sectionIndex === undefined ? {} : { sectionIndex: candidate.sectionIndex }),
  };
}

function scopeKey(kind: StudioShelfItemKindV1, sectionIndex?: number): string {
  requireKind(kind);
  if (kind === 'model') {
    if (!Number.isInteger(sectionIndex) || (sectionIndex ?? -1) < 0) {
      throw new Error(
        'Rearranging models requires a non-negative integer sectionIndex from shelf().',
      );
    }
    return `model:${String(sectionIndex)}`;
  }
  if (sectionIndex !== undefined) {
    throw new Error(
      `Rearranging ${kind}s does not accept sectionIndex; only models are grouped into sections.`,
    );
  }
  return kind;
}

function duplicateId(ids: readonly string[]): { readonly id: string; readonly count: number } | null {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) return { id, count };
  }
  return null;
}

function immutableIds(ids: readonly string[]): readonly string[] {
  return Object.freeze([...ids]);
}

function reconcile(stored: readonly string[] | undefined, ids: readonly string[]): readonly string[] {
  if (stored === undefined || duplicateId(ids) !== null) return immutableIds(ids);
  const present = new Set(ids);
  const ordered = stored.filter((id) => present.has(id));
  const seen = new Set(ordered);
  for (const id of ids) {
    if (!seen.has(id)) ordered.push(id);
  }
  return immutableIds(ordered);
}

/** Creates isolated ordering state for one mounted Studio. */
export function createStudioShelfOrderWorkspace(): StudioShelfOrderWorkspaceV1 {
  const orders = new Map<string, readonly string[]>();

  const order = (
    kind: StudioShelfItemKindV1,
    ids: readonly string[],
    sectionIndex?: number,
  ): readonly string[] => {
    const scope = scopeKey(kind, sectionIndex);
    const next = reconcile(orders.get(scope), ids);
    if (orders.has(scope)) orders.set(scope, next);
    return next;
  };
  const move = (
    unsafeRequest: unknown,
    ids: readonly string[],
    publish?: () => void,
  ): readonly string[] => {
    const request = prepareStudioShelfMoveV1(unsafeRequest);
    const scope = scopeKey(request.kind, request.sectionIndex);
    const duplicate = duplicateId(ids);
    if (duplicate !== null) {
      throw new Error(
        `Shelf ${request.kind} id '${duplicate.id}' appears ${String(duplicate.count)} times in this `
        + 'ordering scope, so its entries cannot be rearranged; give every rearrangeable item a unique stable id.',
      );
    }
    const current = reconcile(orders.get(scope), ids);
    const from = current.indexOf(request.id);
    if (from < 0) {
      throw new Error(
        `No ${request.kind} in this ordering scope has the id '${request.id}', `
        + 'so it cannot be rearranged.',
      );
    }
    const target = current.indexOf(request.targetId);
    if (target < 0) {
      throw new Error(
        `No ${request.kind} in this ordering scope has the target id '${request.targetId}', `
        + 'so the move has nowhere to land.',
      );
    }
    if (request.id === request.targetId) return current;
    const without = current.filter((id) => id !== request.id);
    const targetWithout = without.indexOf(request.targetId);
    const insertion = request.position === 'before' ? targetWithout : targetWithout + 1;
    const next = immutableIds([
      ...without.slice(0, insertion),
      request.id,
      ...without.slice(insertion),
    ]);
    const previous = orders.get(scope);
    orders.set(scope, next);
    try {
      publish?.();
    } catch (error) {
      if (previous === undefined) orders.delete(scope);
      else orders.set(scope, previous);
      throw error;
    }
    return next;
  };

  return {
    order,
    move,
  };
}
