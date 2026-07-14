import type { ThreeFrameContext } from './hostFrameProtocol.js';

export function requireDimensionInternal(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function freezeFrameContextInternal(value: unknown): Readonly<ThreeFrameContext> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('frame context must be an object.');
  }
  const context = value as Partial<ThreeFrameContext>;
  if (!Number.isFinite(context.nowMs)) throw new RangeError('frame nowMs must be finite.');
  if (!Number.isFinite(context.deltaMs) || context.deltaMs! < 0) {
    throw new RangeError('frame deltaMs must be a non-negative finite number.');
  }
  if (!Number.isSafeInteger(context.frameIndex) || context.frameIndex! < 0) {
    throw new RangeError('frame frameIndex must be a non-negative safe integer.');
  }
  return Object.freeze({
    nowMs: context.nowMs!,
    deltaMs: context.deltaMs!,
    frameIndex: context.frameIndex!,
  });
}
