import { expect } from 'vitest';

import { RenderWorld, type InstanceBatchV1 } from '../../src/core/index.js';
import { buildOakRenderDeltaV1 } from './oak-render-adapter.js';
import type { buildOakRenderFrameV1 } from './oak-render-adapter.js';

export function oakRenderAdapterAxisLengthsV1(
  matrix: ArrayLike<number>,
): readonly number[] {
  return [
    Math.hypot(matrix[0]!, matrix[1]!, matrix[2]!),
    Math.hypot(matrix[4]!, matrix[5]!, matrix[6]!),
    Math.hypot(matrix[8]!, matrix[9]!, matrix[10]!),
  ];
}

export function oakRetainedInstanceKeyFractionV1(
  before: InstanceBatchV1,
  after: InstanceBatchV1,
): number {
  const next = new Set(after.instanceKeys);
  const retained = before.instanceKeys.filter((key) => next.has(key)).length;
  return retained / Math.max(1, before.instanceKeys.length);
}

export function expectOakAcceptedDeltaV1(
  before: ReturnType<typeof buildOakRenderFrameV1>,
  after: ReturnType<typeof buildOakRenderFrameV1>,
): void {
  const world = new RenderWorld();
  expect(world.acceptSnapshot(before.snapshot).status).toBe('accepted');
  expect(world.acceptDelta(buildOakRenderDeltaV1(before, after)).status).toBe('accepted');
  expect(world.acceptedSnapshot()).toEqual(after.snapshot);
  world.dispose();
}
