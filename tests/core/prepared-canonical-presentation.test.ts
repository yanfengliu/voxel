import { describe, expect, it, vi } from 'vitest';

import {
  createPreparedCanonicalPresentationInternal,
  finalizePreparedCanonicalPresentationInternal,
  publishPreparedCanonicalPresentationInternal,
} from '../../src/core/prepared-canonical-presentation.js';

describe('prepared canonical presentation ticket lifecycle', () => {
  it('runs rollback before consuming a ticket whose publication throws', () => {
    let tentative = false;
    const abort = vi.fn(() => { tentative = false; });
    const ticket = createPreparedCanonicalPresentationInternal({
      publish: () => {
        tentative = true;
        throw new Error('synthetic publication failure');
      },
      abort,
      finalize: () => false,
    });

    expect(() => publishPreparedCanonicalPresentationInternal(ticket)).toThrow(
      /synthetic publication failure/,
    );
    expect(abort).toHaveBeenCalledOnce();
    expect(tentative).toBe(false);
    expect(publishPreparedCanonicalPresentationInternal(ticket)).toBe(false);
  });

  it('runs cleanup before consuming a ticket whose finalization throws', () => {
    let tentative = false;
    const abort = vi.fn(() => { tentative = false; });
    const ticket = createPreparedCanonicalPresentationInternal({
      publish: () => {
        tentative = true;
        return true;
      },
      abort,
      finalize: () => { throw new Error('synthetic finalization failure'); },
    });
    expect(publishPreparedCanonicalPresentationInternal(ticket)).toBe(true);

    expect(() => finalizePreparedCanonicalPresentationInternal(ticket)).toThrow(
      /synthetic finalization failure/,
    );
    expect(abort).toHaveBeenCalledOnce();
    expect(tentative).toBe(false);
    expect(finalizePreparedCanonicalPresentationInternal(ticket)).toBe(false);
  });
});
