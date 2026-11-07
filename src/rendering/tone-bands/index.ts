/**
 * Renderer-independent tone banding shared by Voxel and its consumers.
 * Callers own ranges, softness, shader uniforms and art-style presets. This
 * source package has no Three.js, browser or renderer-version dependency.
 */

/** A span of luminance, 0..1, that a set of bands is spread across. */
export interface ToneRange {
  readonly min: number;
  readonly max: number;
}

function usableRange(range: ToneRange): ToneRange | null {
  const span = range.max - range.min;

  return Number.isFinite(span) && span > 1e-6 ? range : null;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
}

/**
 * One luminance, snapped to the nearest flat tone of its range.
 *
 * `bands` steps across the range gives `bands + 1` tones counting both ends —
 * two bands means the floor, the midpoint and the ceiling.
 *
 * Risers are ramped over `softness` of a band either side of each edge. At
 * softness 0 this is a plain staircase; the tone values and edge positions are
 * identical either way, only the crossing changes.
 *
 * Luminance outside the range is returned unbanded, which is what keeps a
 * lane's bands from reaching pixels that lane does not describe: a sky sitting
 * above every water tone is not dragged down into the water's ceiling. It also
 * costs nothing, since a value outside the range has no band to snap to.
 *
 * Input is clamped into 0..1 first, so an out-of-gamut argument comes back as
 * its clamp rather than as itself. The shader has no such clamp and needs none
 * — its colour target is unsigned-byte, so post-encode luminance is already in
 * range — but a caller using this to *predict* the shader should pass it values
 * from that same range.
 */
export function steppedLuminance(
  luminance: number,
  bands: number,
  range: ToneRange,
  softness: number,
): number {
  if (!Number.isFinite(luminance)) return 0;

  const clamped = Math.min(1, Math.max(0, luminance));
  const usable = usableRange(range);

  if (!usable || !Number.isFinite(bands) || bands < 1) return clamped;
  if (clamped < usable.min || clamped > usable.max) return clamped;

  const span = usable.max - usable.min;
  const steps = Math.max(1, Math.floor(bands));
  const position = (clamped - usable.min) / span;
  const scaled = position * steps;
  const cell = Math.floor(scaled);
  const within = scaled - cell;
  const width = Number.isFinite(softness) ? Math.min(0.5, Math.max(0, softness)) : 0;
  const eased = width <= 0
    ? (within < 0.5 ? 0 : 1)
    : smoothstep(0.5 - width, 0.5 + width, within);

  return usable.min + ((cell + eased) / steps) * span;
}

/**
 * How far to scale a colour to land it on its banded tone without leaving the
 * display's gamut.
 *
 * Scaling all three channels by `stepped / luminance` is what holds the hue
 * exactly, and that is the whole intent — a banded surface should change tone,
 * not colour. Unbounded, though, it does not hold a hue at all: a channel
 * already near 1.0 clips while the others keep climbing, and the ratios the
 * scale was preserving are destroyed one channel at a time by the framebuffer.
 * `townscaper` hit this on its brightest sea pixels — scale 1.333 with blue at
 * 0.94 — and got a washed cyan its palette cannot produce.
 *
 * Capping the scale where the brightest channel reaches white keeps the ratios
 * intact. The pixel lands short of its band rather than landing on it in the
 * wrong colour, which is the better of the two failures.
 */
export function gamutSafeToneScale(
  luminance: number,
  stepped: number,
  maxChannel: number,
): number {
  if (!Number.isFinite(luminance) || !Number.isFinite(stepped) || !Number.isFinite(maxChannel)) {
    return 1;
  }

  const scale = Math.max(0, stepped) / Math.max(luminance, 1e-4);

  return Math.min(scale, 1 / Math.max(maxChannel, 1e-4));
}

/**
 * The same operations in GLSL, without caller-specific uniform declarations.
 *
 * These are hand-transliterated functions, not generated from TypeScript.
 * Node tests cannot execute them. A real GPU ramp compared with the CPU
 * functions is required to verify numerical parity, including fractional
 * band counts: an unfloored GLSL count previously pushed the brightest tone
 * beyond the range even though the CPU sampler stayed inside it.
 */
export const TONE_BAND_FUNCTIONS_GLSL = /* glsl */`
float steppedLuminance(float luminance, float bands, vec2 range, float softness) {
  float span = range.y - range.x;

  if (span <= 1e-6 || bands < 1.0) return luminance;
  if (luminance < range.x || luminance > range.y) return luminance;

  // Floored, exactly as the TypeScript does. A fractional band count leaves a
  // partial cell at the top of the range whose upper tone lands *outside* it:
  // at bands = 2.5 the ceiling resolves to (2 + 1) / 2.5 = 1.2 of the span, so
  // the brightest pixels are pushed past range.y instead of onto it.
  float steps = max(1.0, floor(bands));
  float position = (luminance - range.x) / span;
  float scaled = position * steps;
  float cell = floor(scaled);
  float within = scaled - cell;
  float width = clamp(softness, 0.0, 0.5);
  // Ramped risers keep fine detail at an edge from becoming a full band step.
  float eased = width <= 0.0
    ? step(0.5, within)
    : smoothstep(0.5 - width, 0.5 + width, within);

  return range.x + ((cell + eased) / steps) * span;
}

float gamutSafeToneScale(float luminance, float stepped, float maxChannel) {
  return min(max(stepped, 0.0) / max(luminance, 1e-4), 1.0 / max(maxChannel, 1e-4));
}
`;
