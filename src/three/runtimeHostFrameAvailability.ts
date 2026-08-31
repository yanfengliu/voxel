import {
  ThreeRuntimeProtocolError,
  type ThreePrepareFrameResult,
} from './hostFrameProtocol.js';
import type { ThreeRuntimeLifecycleV1 } from './runtimeTypes.js';

export function unavailableHostFrameResultInternal(
  lifecycle: ThreeRuntimeLifecycleV1,
  deviceGeneration: number,
): ThreePrepareFrameResult {
  if (lifecycle !== 'lost' && lifecycle !== 'restoring') {
    throw new Error(`A frame became unavailable while ${lifecycle}.`);
  }
  return Object.freeze({
    status: 'unavailable',
    reason: lifecycle === 'lost' ? 'context-lost' : 'restoring',
    deviceGeneration,
  });
}

export function assertEmbeddedHostProtocolInternal(
  hostKind: 'runtime-rendered' | 'embedded',
): void {
  if (hostKind === 'embedded') return;
  throw new ThreeRuntimeProtocolError(
    'three.host.embedded-only',
    'Host-managed frame tickets are available only in embedded host mode.',
  );
}
