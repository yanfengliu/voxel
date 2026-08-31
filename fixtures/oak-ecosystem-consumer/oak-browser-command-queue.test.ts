import { describe, expect, it } from 'vitest';
import {
  enqueueOakPendingCommandV1,
  OAK_MAX_PENDING_COMMANDS_V1,
} from './oak-browser-command-queue.js';
import type { OakBrowserCommandV1 } from './oak-browser-contract.js';

describe('oak browser pending command queue', () => {
  it('retains the first crossed intent and rejects an unbounded backlog', () => {
    const queue: OakBrowserCommandV1[] = [];
    expect(OAK_MAX_PENDING_COMMANDS_V1).toBe(1);
    expect(enqueueOakPendingCommandV1(queue, 'root-cutaway')).toBe(true);
    expect(enqueueOakPendingCommandV1(queue, 'reset')).toBe(false);
    expect(queue).toEqual(['root-cutaway']);
    expect(queue.shift()).toBe('root-cutaway');
    expect(enqueueOakPendingCommandV1(queue, 'reset')).toBe(true);
  });
});
