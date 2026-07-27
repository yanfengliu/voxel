export function closeRiverfallSurfaceSignalLoopV1(
  signals: Float32Array,
  frameCount: number,
  cellCount: number,
  transitionFrames: number,
): Float32Array {
  if (!Number.isInteger(transitionFrames)
    || transitionFrames < 2
    || transitionFrames >= frameCount - 1) {
    throw new Error(
      `Cannot close the Riverfall surface loop with ${String(transitionFrames)} `
      + `transition frames across ${String(frameCount)} recorded frames; expected `
      + 'an integer from 2 through frameCount - 2.',
    );
  }
  const closed = new Float32Array((frameCount + 1) * cellCount);
  closed.set(signals);
  const bridgeStart = frameCount - transitionFrames;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const start = signals[bridgeStart * cellCount + cell]!;
    const startSlope = start
      - signals[(bridgeStart - 1) * cellCount + cell]!;
    const end = signals[cell]!;
    const endSlope = signals[cellCount + cell]! - end;
    for (let frame = bridgeStart; frame <= frameCount; frame += 1) {
      const t = (frame - bridgeStart) / transitionFrames;
      const t2 = t * t;
      const t3 = t2 * t;
      const value = (2 * t3 - 3 * t2 + 1) * start
        + (t3 - 2 * t2 + t) * startSlope * transitionFrames
        + (-2 * t3 + 3 * t2) * end
        + (t3 - t2) * endSlope * transitionFrames;
      closed[frame * cellCount + cell] = Math.fround(
        Math.max(0, Math.min(1, value)),
      );
    }
    closed[frameCount * cellCount + cell] = closed[cell]!;
  }
  return closed;
}

export function writeRiverfallSurfaceVelocitiesV1(
  translations: Float32Array,
  velocities: Float32Array,
  frameCount: number,
  cellCount: number,
  timestepMs: number,
): void {
  const inverseDt = 1_000 / timestepMs;
  for (let frame = 0; frame < frameCount - 1; frame += 1) {
    for (let cell = 0; cell < cellCount; cell += 1) {
      const offset = (frame * cellCount + cell) * 3;
      const nextOffset = offset + cellCount * 3;
      velocities[offset] = Math.fround(
        (translations[nextOffset]! - translations[offset]!) * inverseDt,
      );
      velocities[offset + 1] = Math.fround(
        (translations[nextOffset + 1]! - translations[offset + 1]!) * inverseDt,
      );
      velocities[offset + 2] = Math.fround(
        (translations[nextOffset + 2]! - translations[offset + 2]!) * inverseDt,
      );
    }
  }
  const closingFrame = frameCount - 1;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const sourceOffset = cell * 3;
    const closingOffset = (closingFrame * cellCount + cell) * 3;
    velocities.set(
      velocities.subarray(sourceOffset, sourceOffset + 3),
      closingOffset,
    );
  }
}
