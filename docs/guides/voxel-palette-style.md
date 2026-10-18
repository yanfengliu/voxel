# Caller-owned voxel palette style

`shadeVisibleFacePaletteV1` is an opt-in portable post-pass over the original `meshVisibleFaces` output. It selects an existing palette slot by source slot and local face direction. It supplies no colors or recommended tone strength. Existing meshing, worker output, and runtime defaults are unchanged.

```ts
import { meshVisibleFaces, shadeVisibleFacePaletteV1 } from 'voxel/meshing';

const mesh = meshVisibleFaces(chunk, { positionSpace: 'source-local' });
const faceSlots = shadeVisibleFacePaletteV1(mesh, [
  // Slots 1, 2 and 3 are the game's main, shadow and light tones.
  // Canonical order: -X, +X, -Y, +Y, -Z, +Z.
  { paletteIndex: 1, facePaletteIndices: [1, 1, 2, 3, 2, 1] },
]);
const colors = new Uint8Array(faceSlots.length * 3);
for (let vertex = 0; vertex < faceSlots.length; vertex++) {
  // paletteRGB is caller-owned straight sRGB8 data, three bytes per entry.
  colors.set(paletteRGB[faceSlots[vertex]!]!, vertex * 3);
}
// Publish mesh.positions/normals/indices and colors as a GeometryResourceV1.
// Use a white material with shading: 'unlit', vertexColors: true to preserve
// these authored sRGB tones through the runtime's normal color conversion.
```

The return value is a new `Uint16Array`, one slot per vertex. Each face uses one slot on all four vertices; unmapped source slots pass through unchanged, so an effects lane can keep its own palette. Identical six-way mappings are valid. Mapping targets are not mapped again. The helper checks six-slot tables, duplicate source mappings, slot bounds, and a flat axis-aligned normal and source slot across each face. It requires the original four-vertices-per-face layout, before outlines or other topology changes. It neither reads nor changes occupancy or palette bytes, and does not check that the caller's palette actually defines each selected slot.

Directions belong to the mesh's authored coordinate system. Rotating an instance rotates its baked tones with it; this is not a moving world-space light. For physically lit geometry, omit the post-pass or deliberately account for the additional material lighting rather than expecting it to preserve the authored colors. Local occupancy occlusion, if a game chooses it, remains a separate consumer mechanism with its own neighbor, invalidation and boundary checks.

## Choose scale and contrast together

Keep a stable world-space voxel pitch within an asset family, then inspect how it projects at the game's intended camera, viewport and DPR. For an orthographic camera, approximate vertical pitch in pixels as `worldPitch × viewportHeight / viewHeight`; face orientation changes the visible edge spacing. Perspective pitch also varies with distance. A fine world lattice is not automatically legible at the final scale.

In the bounded reference study behind this helper, M07 used a half-unit lattice and stronger adjacent face tones; its review described dense contour hatching. M08/M09 used a one-unit lattice projecting to about 2.37 pixels at the matched camera and quieter tones, but neither was approved as final art. M12 consumed this engine helper, and independent review accepted the material cleanup as progress while withholding faithful reference approval. These are observations from one lane, not universal thresholds or isolated causal ablations. Strong alternating tones across a staircase contour can read as stripes or moiré at small projected pitches; test weaker tone separation or a coarser authored lattice against the actual render rather than adding arbitrary detail. Palette changes alone do not repair broad extruded anatomy, blocked negative space, missing articulation, or an effect with the wrong volume.

## Review the asset rather than one image

Keep a frozen matched camera for reference comparison, then inspect native-scale side, reverse, overhead and effect-end views. Fit supplementary cameras to the combined actor and effects bounds with a recorded margin; a clipped effect cannot be judged. Add a changed zoom and an adversarial angle, and inspect each image at native resolution. Bind the inspected bytes to their hashes. The two-view browser cube test covers all six palette directions and sRGB transfer through the public runtime; it does not measure art quality, silhouettes, game readability, occlusion, or performance at production scale.

Preflight capture names as nonempty and unique, then audit a distinct PNG path with its recorded hash for each requested angle. The study once lost its angle names and overwrote one `undefined.png` nine times; it retained that failure, added preflight checks and recaptured before independent review. Freeze the built engine artifact, camera, material, lighting and resolve settings for comparison; rebuilding a live `dist` tree during capture can remove modules underneath the browser. These are capture-authoring checks, not fixes to the renderer. The study's later nine fitted views included a measured 7% bounds margin; that is a recorded setting rather than a universal fit threshold.

## Keep the reference family explicit

The broader inspected references also differed: Teardown's courtyard used coherent material regions with fine cubic geometry and direct light/contact shadow, Town to City's aerial view subordinated voxel grain to town/route/water masses, Voxels.ca's Settlers Keep character used exaggerated part proportions and open limb gaps, and the Sir Carma general environment image separated cliff/castle/water masses from clustered foliage and small accents. These are family-specific observations recorded with source links and image hashes in [work 3](../work/3_palette-face-tones/plan.md). Geometry construction and image finishing are separate decisions: a reference assembled from offline renders and postproduction does not demonstrate runtime lighting or frame performance. The specific Latica Cliffs pixels remained inaccessible and were not used to infer settings.

The study's rejected approaches and provenance live in [work 3](../work/3_palette-face-tones/plan.md). Broader references can guide separate content decisions; this small API is not a shared art recipe and makes no claim to reproduce a reference style by itself.
