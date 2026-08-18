/**
 * Tone banding for the stylized resolve pass.
 *
 * Quantising brightness is what turns a lit surface into one flat tone against
 * its shadow, which is half of an ink-and-flat-colour look; the other half is
 * the contour, and that lives in `stylizedResolvePass.ts`.
 *
 * The operation is a staircase over *luminance* with the hue left alone, so a
 * banded wall keeps its colour and only loses its gradient.
 *
 * Everything here is a pure function of its arguments. Nothing reads a game's
 * palette, and no constant in this file was measured against one — the ranges
 * are parameters precisely because the right values are a property of the
 * scene being drawn, not of the technique. See `GRADIENT_TONE_SOFTNESS` for
 * the one number that carries provenance, and for why it is offered rather
 * than defaulted.
 */

/** A span of luminance, 0..1, that a set of bands is spread across. */
export interface ToneRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The whole displayable range, and the default for both lanes.
 *
 * A scene whose subjects span shadow to highlight is already spread across
 * this, so banding against it is the right operation and needs no measurement.
 * A lane that occupies only part of the range wants its own — see
 * `StylizedResolveOptions.backgroundToneRange`.
 */
export const FULL_TONE_RANGE: ToneRange = { min: 0, max: 1 };

/**
 * A softness worth trying when a lane is a smooth gradient carrying fine
 * detail, expressed as a fraction of a band either side of each edge.
 *
 * Offered, not defaulted. A hard staircase is what "flat bands" means and is
 * the honest default for the technique; softness is a remedy for one specific
 * artefact, and imposing a remedy on scenes that do not have the problem
 * throws away the look they asked for.
 *
 * The artefact: a hard edge does not leave detail that straddles it alone, it
 * amplifies it into a full band step. The sibling game `townscaper` measured
 * this on its sea at far zoom — chop moving luminance by about 0.025 (p90)
 * across a band 0.165 wide — and the frame broke into horizontal combs of
 * texture separated by flat bands, worse at six bands than at two because each
 * edge draws its own stripe. 0.22 spans 2 x 0.22 x 0.165 = 0.073 luminance,
 * wide against that 0.025, and still leaves 56% of every band perfectly flat.
 *
 * That measurement is that game's, on that palette, at that zoom. It is a
 * sound starting point for any lane with the same shape — a slow gradient with
 * fine detail riding on it, which is what sky, fog, and water usually are —
 * and it is not evidence about anything else.
 */
export const GRADIENT_TONE_SOFTNESS = 0.22;

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
 * The uniforms the banding half of the resolve shader reads.
 *
 * Exported so the pass and its tests agree on the list without either one
 * holding the authority. `tests/three/stylized-tone-bands.test.ts` asserts
 * every name here is both declared in `TONE_BAND_GLSL` and supplied by the
 * pass, which is the drift this pairing exists to catch: a uniform added on
 * one side and forgotten on the other fails silently, as a shader that
 * compiles and quietly reads zero.
 */
export const TONE_BAND_UNIFORM_NAMES = [
  'uBands',
  'uBackgroundBands',
  'uToneRange',
  'uBackgroundToneRange',
  'uToneSoftness',
  'uBackgroundToneSoftness',
] as const;

/**
 * The same two functions in GLSL.
 *
 * Hand-transliterated from the TypeScript above rather than generated from it,
 * because the shader reads uniforms where the TypeScript takes arguments and
 * there is no shared form to generate both from. The curves must match, and
 * nothing in a unit test can prove that — vitest has no GL context, so the
 * GLSL here is never executed by the node gates.
 *
 * A divergence found by hand review on 2026-08-17 and fixed: the GLSL used the
 * raw `bands` uniform where the TypeScript floors it, so a fractional count
 * pushed the range's brightest tones *past* `range.y` in the shader while the
 * exported sampler clamped them correctly. Both floor now. That one slipped
 * through precisely because the interface matched and only the bodies differed.
 *
 * What the gates enforce is only the *interface*: the uniform names above exist
 * on both sides. **Nothing currently checks the function bodies against each
 * other.** A browser-gate test rendering a known ramp through the real shader
 * and comparing it against `steppedLuminance` is the missing half, and until it
 * exists the only thing keeping these two in step is changing them together by
 * hand. Do not read the interface check as cover for a body edit.
 */
export const TONE_BAND_GLSL = /* glsl */`
uniform float uBands;
uniform float uBackgroundBands;
uniform vec2 uToneRange;
uniform vec2 uBackgroundToneRange;
uniform float uToneSoftness;
uniform float uBackgroundToneSoftness;

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
  // Ramped risers, not cut ones. A hard edge amplifies whatever detail
  // straddles it into a full band step; see GRADIENT_TONE_SOFTNESS.
  float eased = width <= 0.0
    ? step(0.5, within)
    : smoothstep(0.5 - width, 0.5 + width, within);

  return range.x + ((cell + eased) / steps) * span;
}

float gamutSafeToneScale(float luminance, float stepped, float maxChannel) {
  return min(max(stepped, 0.0) / max(luminance, 1e-4), 1.0 / max(maxChannel, 1e-4));
}
`;
