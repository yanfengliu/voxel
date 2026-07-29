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
  minimumForegroundPixels: 50,
  minimumFootprintWidthFraction: 0.05,
  minimumFootprintHeightFraction: 0.05,
  minimumChangedPixelFraction: 0.0001,
  minimumChangedChannelDelta: 4,
  establishes: Object.freeze([
    'Each selected recipe occupies a measurable canvas footprint from front and side.',
    'Removing every exact selected box is detectably different from its canonical recipe in at least one fixed quarter view.',
    'Every selected whole-placement relocation is detectably different from the canonical composed scene in at least one fixed quarter view.',
  ]),
  honestyBoundary:
    'This browser binding proves selected fixed-camera legibility and visible subtraction or relocation only. It does not prove physical necessity, bearing contact, force transfer, stress, depth-independent visibility, or every possible camera.',
});
