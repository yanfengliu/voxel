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
  /**
   * The same two fixed yaws, pointed at the midpoint of the relocation.
   *
   * A scene-wide quarter view is the review a person takes, and it is not
   * enough on its own: a part relocated inside the mill building is simply not
   * in it. Measured with both mills held still, four of the eight relocations
   * changed 0.000171 to 0.011677 of the frame from the front and exactly
   * nothing from the rear.
   */
  readonly relocationReviewViews: readonly WindmillIntendedViewCameraV1[];
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
  relocationReviewViews: Object.freeze([
    Object.freeze({
      id: 'relocation-front-quarter',
      yawDegrees: 45,
      pitchDegrees: 30,
      viewHeightRule:
        'fixed 5 world units, centred on the relocation midpoint raised 1.5',
    }),
    Object.freeze({
      id: 'relocation-rear-quarter',
      yawDegrees: 225,
      pitchDegrees: 30,
      viewHeightRule:
        'fixed 5 world units, centred on the relocation midpoint raised 1.5',
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
   * Half the measured minimum best-camera detection across the 8 relocation
   * cases, 0.0014812 — the anvil, whose one-grain move is the smallest visual
   * event of the eight and still covers around 780 pixels of a 526,000-pixel
   * frame.
   *
   * It was 0.012 until 2026-08-14, stated as half of a measured 0.024441, and
   * that measurement was an artifact. Both mills kept turning during the
   * comparison, at unrelated phases, so a large part of every "relocation"
   * difference was the sails having moved — the tell was that four variants
   * returned the same rear-view number to four decimal places despite
   * relocating completely different parts. Held still, those four returned
   * exactly zero from the rear and 0.000171 to 0.011677 from the front.
   *
   * A relocation is not the "much larger visual event" the old comment here
   * claimed. Moving one small part one grain is a small event, close in size
   * to removing one box, and this floor now says so.
   */
  minimumRelocationChangedPixelFraction: 0.00074,
  minimumChangedChannelDelta: 4,
  establishes: Object.freeze([
    'Each selected recipe occupies a measurable canvas footprint from front and side.',
    'Removing every exact selected box is detectably different from its canonical recipe in at least one fixed quarter view.',
    'Every selected whole-placement relocation is detectably different from the canonical composed scene in at least one fixed quarter view that frames the move.',
  ]),
  honestyBoundary:
    'This browser binding proves selected fixed-camera legibility and visible subtraction or relocation only. It does not prove physical necessity, bearing contact, force transfer, stress, depth-independent visibility, or every possible camera. A relocation is judged from the cameras that frame it: four of the eight are invisible from a whole-mill rear quarter and one changes 0.017 percent of that frame from the front, so a scene-wide review is evidence of composition rather than of misplacement.',
});
