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

In the bounded reference study behind this helper, M07's half-unit lattice and stronger adjacent face tones produced dense contour hatching in the review. M08/M09 used a one-unit lattice projecting to about 2.37 pixels at the matched camera and quieter tones, but neither was approved as final art. These are observations from one lane, not universal thresholds. Strong alternating tones across a staircase contour can read as stripes or moiré at small projected pitches; test weaker tone separation or a coarser authored lattice against the actual render rather than adding arbitrary detail. Palette changes alone do not repair broad extruded anatomy, blocked negative space, missing articulation, or an effect with the wrong volume.

## Review the asset rather than one image

Keep a frozen matched camera for reference comparison, then inspect native-scale side, reverse, overhead and effect-end views. Fit supplementary cameras to the combined actor and effects bounds with a recorded margin; a clipped effect cannot be judged. Add a changed zoom and an adversarial angle, and inspect each image at native resolution. Bind the inspected bytes to their hashes. The two-view browser cube test covers all six palette directions and sRGB transfer through the public runtime; it does not measure art quality, silhouettes, game readability, occlusion, or performance at production scale.

The study's rejected approaches and provenance live in [work 3](../work/3_palette-face-tones/plan.md). Broader references can guide separate content decisions; this small API is not a shared art recipe and makes no claim to reproduce a reference style by itself.
