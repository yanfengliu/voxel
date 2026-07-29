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

/**
 * Forward-difference angular velocities from per-frame pose quaternions, in
 * the same frame pairing as the linear velocities: frame f carries the rate
 * from f to f + 1, and the closing frame repeats frame zero's rate so the
 * loop wrap reports the same motion it plays. A frame pair that does not
 * rotate writes zero rather than a numerically noisy axis.
 */
export function writeRiverfallSurfaceAngularVelocitiesV1(
  rotations: Float32Array,
  velocities: Float32Array,
  frameCount: number,
  cellCount: number,
  timestepMs: number,
): void {
  const inverseDt = 1_000 / timestepMs;
  for (let frame = 0; frame < frameCount - 1; frame += 1) {
    for (let cell = 0; cell < cellCount; cell += 1) {
      const at = (frame * cellCount + cell) * 4;
      const next = at + cellCount * 4;
      const [cx, cy, cz, cw] = [
        rotations[at]!, rotations[at + 1]!, rotations[at + 2]!, rotations[at + 3]!,
      ];
      const [nx, ny, nz, nw] = [
        rotations[next]!, rotations[next + 1]!, rotations[next + 2]!, rotations[next + 3]!,
      ];
      // delta = next ⊗ conjugate(current), the world-frame step rotation.
      let dx = nw * -cx + cw * nx + ny * -cz - nz * -cy;
      let dy = nw * -cy + cw * ny + nz * -cx - nx * -cz;
      let dz = nw * -cz + cw * nz + nx * -cy - ny * -cx;
      let dw = nw * cw - nx * -cx - ny * -cy - nz * -cz;
      if (dw < 0) { dx = -dx; dy = -dy; dz = -dz; dw = -dw; }
      const sine = Math.hypot(dx, dy, dz);
      const offset = (frame * cellCount + cell) * 3;
      if (sine < 1e-12) {
        velocities[offset] = 0;
        velocities[offset + 1] = 0;
        velocities[offset + 2] = 0;
        continue;
      }
      const angle = 2 * Math.atan2(sine, dw);
      const scale = (angle / sine) * inverseDt;
      velocities[offset] = Math.fround(dx * scale);
      velocities[offset + 1] = Math.fround(dy * scale);
      velocities[offset + 2] = Math.fround(dz * scale);
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
