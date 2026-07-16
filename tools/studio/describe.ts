import type { GenomeMotionV1 } from './genome.js';

/**
 * Saying what a motion does, in words.
 *
 * This exists because the studio could not answer "what is this model supposed
 * to do?" -- the numbers were on screen and the behaviour was not, so reading
 * the source was the only way to know. A tool for judging animation that cannot
 * state the animation's intent leaves the person judging it against a guess.
 *
 * The vocabulary is deliberately the viewer's rather than the engine's: an
 * amplitude on the y rotation axis is a rock about the vertical, and a period is
 * how long one round trip takes. Nobody watching a model thinks in radians per
 * axis index.
 */

const AXIS_NAMES = ['x', 'y', 'z'] as const;

/** How each axis reads to someone looking at the model, not indexing an array. */
const ROTATION_AXIS = ['pitching forward and back', 'rocking side to side', 'rolling left and right'];
const TRANSLATION_AXIS = ['sliding east and west', 'bobbing up and down', 'sliding north and south'];
const SCALE_AXIS = ['stretching along x', 'stretching in height', 'stretching along z'];

function round(value: number, places = 2): string {
  return String(Number(value.toFixed(places)));
}

function degrees(radians: number): string {
  return `${round((radians * 180) / Math.PI, 1)}°`;
}

function seconds(ms: number): string {
  return ms >= 1000 ? `${round(ms / 1000, 2)}s` : `${String(Math.round(ms))}ms`;
}

function nonZero(values: readonly [number, number, number]): number[] {
  return values.map((value, index) => (Math.abs(value) > 1e-6 ? index : -1)).filter((i) => i >= 0);
}

/**
 * One sentence describing what the model does over a period, or that it is
 * still. Harmonic motion oscillates and returns; it never spins, so this says
 * "rocks" rather than "rotates" and states the swing as a plus-or-minus.
 */
export function describeMotion(motion: GenomeMotionV1): string {
  if (motion.periodMs <= 0) return 'Still. Nothing moves; the model is one frame.';

  const parts: string[] = [];
  for (const axis of nonZero(motion.rotationRadians)) {
    parts.push(`${ROTATION_AXIS[axis] ?? `rotating about ${AXIS_NAMES[axis] ?? '?'}`} by `
      + `±${degrees(Math.abs(motion.rotationRadians[axis] ?? 0))}`);
  }
  for (const axis of nonZero(motion.translation)) {
    parts.push(`${TRANSLATION_AXIS[axis] ?? `moving along ${AXIS_NAMES[axis] ?? '?'}`} by `
      + `±${round(Math.abs(motion.translation[axis] ?? 0))} levels`);
  }
  for (const axis of nonZero(motion.scale)) {
    parts.push(`${SCALE_AXIS[axis] ?? `scaling on ${AXIS_NAMES[axis] ?? '?'}`} by `
      + `±${round(Math.abs(motion.scale[axis] ?? 0) * 100, 0)}%`);
  }

  if (parts.length === 0) {
    // A period with no amplitude is the trap the never-moved guard catches: the
    // model is configured to animate and cannot.
    return `Nothing moves, despite a ${seconds(motion.periodMs)} period. `
      + 'Every amplitude is zero, so the sweep will render one repeated frame.';
  }

  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1) ?? ''}`;
  const phase = Math.abs(motion.phaseRadians) > 1e-6
    ? `, starting ${degrees(motion.phaseRadians)} into the cycle`
    : '';
  return `${(list ?? '').charAt(0).toUpperCase()}${(list ?? '').slice(1)}, `
    + `once every ${seconds(motion.periodMs)}${phase}. It returns to rest at the halfway point `
    + 'and swings the other way, rather than going around.';
}

/** The pose at one time, for the readout beside a scrubbed frame. */
export function describePoseAt(motion: GenomeMotionV1, nowMs: number): string {
  if (motion.periodMs <= 0) return 'at rest';
  const wave = Math.sin((2 * Math.PI * nowMs) / motion.periodMs + motion.phaseRadians);
  if (Math.abs(wave) < 0.02) return 'at rest (crossing zero)';
  const extreme = Math.abs(Math.abs(wave) - 1) < 0.02;
  const direction = wave > 0 ? 'forward' : 'back';
  return extreme ? `fully ${direction}` : `${round(Math.abs(wave) * 100, 0)}% ${direction}`;
}
