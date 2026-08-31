import type { OakBrowserCommandV1 } from './oak-browser-contract.js';

export const OAK_MAX_PENDING_COMMANDS_V1 = 1;

/** Preserve one intent across presentation without allowing click backlog growth. */
export function enqueueOakPendingCommandV1(
  queue: OakBrowserCommandV1[],
  command: OakBrowserCommandV1,
): boolean {
  if (queue.length >= OAK_MAX_PENDING_COMMANDS_V1) return false;
  queue.push(command);
  return true;
}
