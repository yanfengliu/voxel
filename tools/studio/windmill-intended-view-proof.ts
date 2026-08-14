export interface WindmillIntendedViewCameraV1 {
  readonly id: string;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly viewHeightRule: string;
}

export interface WindmillIntendedViewProofBindingV1 {
  readonly schema: 'studio.windmill-intended-view-proof-binding/1';
  readonly scope: 'selected-catalog-recipes-and-scene';
  readonly browserTestFile: string;
  readonly canonicalModelViews: readonly WindmillIntendedViewCameraV1[];
  readonly purposeReviewViews: readonly WindmillIntendedViewCameraV1[];
  readonly sceneReviewViews: readonly WindmillIntendedViewCameraV1[];
  readonly minimumForegroundPixels: number;
  readonly minimumFootprintWidthFraction: number;
  readonly minimumFootprintHeightFraction: number;
  readonly minimumChangedPixelFraction: number;
  readonly minimumRelocationChangedPixelFraction: number;
  readonly minimumChangedChannelDelta: number;
  readonly establishes: readonly string[];
  readonly honestyBoundary: string;
}

export const WINDMILL_INTENDED_VIEW_PROOF_V1:
WindmillIntendedViewProofBindingV1 = Object.freeze({
  schema: 'studio.windmill-intended-view-proof-binding/1',
  scope: 'selected-catalog-recipes-and-scene',
  browserTestFile:
    'tests/browser/model-studio-windmill-assets.spec.ts',
  canonicalModelViews: Object.freeze([
    Object.freeze({
      id: 'model-front',
      yawDegrees: 0,
      pitchDegrees: 30,
      viewHeightRule:
        'max(0.75, occupied model diagonal in world units times 1.15)',
    }),
    Object.freeze({
      id: 'model-side',
      yawDegrees: 90,
      pitchDegrees: 30,
      viewHeightRule:
        'max(0.75, occupied model diagonal in world units times 1.15)',
    }),
  ]),
  purposeReviewViews: Object.freeze([
    Object.freeze({
      id: 'purpose-front-quarter',
      yawDegrees: 45,
      pitchDegrees: 30,
      viewHeightRule:
        'max(0.75, occupied model diagonal in world units times 1.15)',
    }),
    Object.freeze({
      id: 'purpose-rear-quarter',
      yawDegrees: 225,
      pitchDegrees: 30,
      viewHeightRule:
        'max(0.75, occupied model diagonal in world units times 1.15)',
    }),
  ]),
  sceneReviewViews: Object.freeze([
    Object.freeze({
      id: 'scene-front-quarter',
      yawDegrees: 45,
      pitchDegrees: 30,
      viewHeightRule: 'min(exact occupied scene opening fit, 8 world units)',
    }),
    Object.freeze({
      id: 'scene-rear-quarter',
      yawDegrees: 225,
      pitchDegrees: 30,
      viewHeightRule: 'min(exact occupied scene opening fit, 8 world units)',
    }),
  ]),
  // Floors measured from the canonical renders on 2026-08-13, each set at
  // half the smallest value the shipped assets actually produce, so a real
  // asset has 2x headroom and a regression to a sliver cannot pass.
  //
  // They were near-noise before, which is what the review caught: 50 pixels
  // and a 5% box satisfied "remains legible", and 0.01% of changed pixels
  // satisfied "is visible in the composed scene". Across 138 footprint
  // samples the smallest real asset covers 5,734 pixels, and across the 8
  // relocation cases the tightest one moves 2.44% of pixels in its best
  // camera — so the change floor sat 244x below the smallest true detection.
  /** Half of the measured minimum, 5,734 px. */
  minimumForegroundPixels: 2_800,
  /** Half of the measured minimum, 0.1079. */
  minimumFootprintWidthFraction: 0.05,
  /** Half of the measured minimum, 0.1301. */
  minimumFootprintHeightFraction: 0.065,
  /**
   * Removing one exact box. Half the measured minimum best-camera detection
   * across 98 removal variants, 0.000359 — a single small box legitimately
   * changes well under one percent of the frame, so this floor is near the
   * noise and has to be.
   */
  minimumChangedPixelFraction: 0.00018,
  /**
   * Relocating a whole placement, a much larger visual event: half the
   * measured minimum best-camera detection across the 8 relocation cases,
   * 0.024441.
   *
   * This used to borrow the removal floor above, which is why "is visible in
   * the composed scene" was satisfied by 0.01% of changed pixels — 244x below
   * the tightest real relocation. One constant was serving two populations
   * whose true magnitudes differ by two orders of magnitude.
   */
  minimumRelocationChangedPixelFraction: 0.012,
  minimumChangedChannelDelta: 4,
  establishes: Object.freeze([
    'Each selected recipe occupies a measurable canvas footprint from front and side.',
    'Removing every exact selected box is detectably different from its canonical recipe in at least one fixed quarter view.',
    'Every selected whole-placement relocation is detectably different from the canonical composed scene in at least one fixed quarter view.',
  ]),
  honestyBoundary:
    'This browser binding proves selected fixed-camera legibility and visible subtraction or relocation only. It does not prove physical necessity, bearing contact, force transfer, stress, depth-independent visibility, or every possible camera.',
});
