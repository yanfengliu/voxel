import {
  TONE_BAND_FUNCTIONS_GLSL,
  type ToneRange,
} from '../rendering/tone-bands/index.js';

export {
  gamutSafeToneScale,
  steppedLuminance,
  type ToneRange,
} from '../rendering/tone-bands/index.js';

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


/** Runtime-owned uniforms over the shared renderer-independent functions. */
export const TONE_BAND_GLSL = /* glsl */`
uniform float uBands;
uniform float uBackgroundBands;
uniform vec2 uToneRange;
uniform vec2 uBackgroundToneRange;
uniform float uToneSoftness;
uniform float uBackgroundToneSoftness;
${TONE_BAND_FUNCTIONS_GLSL}`;
