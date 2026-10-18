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

The mesher emits voxel-grid coordinates. Realize the chosen world pitch by scaling geometry positions, bounds and pivot together, or by applying the corresponding instance scale and world-space origin translation. A geometry resource uses its authored coordinates and instance matrices; the descriptor's `worldUnitsPerVoxel` does not automatically rescale this geometry lane. The palette helper itself performs no coordinate conversion.

Directions belong to the mesh's authored coordinate system. Rotating an instance rotates its baked tones with it; this is not a moving world-space light. For physically lit geometry, omit the post-pass or deliberately account for the additional material lighting rather than expecting it to preserve the authored colors. Local occupancy occlusion, if a game chooses it, remains a separate consumer mechanism with its own neighbor, invalidation and boundary checks.

## Choose scale and contrast together

Keep a stable world-space voxel pitch within an asset family, then inspect how it projects at the game's intended camera, viewport and DPR. For an orthographic camera, an edge aligned with camera vertical projects to `worldPitch × viewportHeight / viewHeight` pixels; world-axis edges are foreshortened by the camera orientation. Perspective pitch also varies with distance. A fine world lattice is not automatically legible at the final scale.

In the bounded reference study behind this helper, M07 used a half-unit lattice and stronger adjacent face tones; its review described dense contour hatching. M08/M09 used quieter tones and a one-unit lattice whose world-Y edges project to about 2.37 pixels at the matched camera (419-pixel height, vertical span 165); neither was approved as final art. M12 consumed this engine helper, and independent review accepted the material cleanup as progress while withholding faithful reference approval. These are observations from one lane, not universal thresholds or isolated causal ablations. Strong alternating tones across a staircase contour can read as stripes or moiré at small projected pitches; test weaker tone separation or a coarser authored lattice against the actual render rather than adding arbitrary detail. Palette changes alone do not repair broad extruded anatomy, blocked negative space, missing articulation, or an effect with the wrong volume.

A later single M13 content pass was reported as improving some anatomy and layered armor, but independent native review rejected it as a whole replacement: the flame lost its prominent white core and block-lobe rhythm, and a narrower pad lost the reference's mottled material rhythm. The owner subsequently corrected the subject to a dragon head emerging continuously from the ground, with no humanoid limbs. That correction supersedes the humanoid interpretation behind the earlier anatomy claims; M12/M13 remain historical rejected candidates. M12's bounded engine-control evidence remains unchanged. Adding unequal volume primitives does not guarantee a broken rendered contour or readable core. Preserve material rhythm while changing shape and judge the combined result at native scale.

## Review the asset rather than one image

Before detail work, freeze a one-sentence subject interpretation and its disqualifying structures. Have a fresh reviewer identify the depicted subject from native multi-angle views without relying on authored part labels; record uncertainty and stop detail work when the subject fails. Connectivity, geometry counts, hashes and multiple camera files establish structural evidence, not semantic correctness. The later M14 rough and M16 study passed independent subject review; final reference fidelity remained rejected. M16's eleven native views still showed broad slab-like head and flame/value structure: correct subject identity and angular source cells did not establish the reference's mass hierarchy or material rhythm. Before detail or purpose metadata, render the actual major forms at native scale from matched and adversarial angles and judge relative mass, negative space and value groups; projected bounds alone did not reject M16's box-like skull. These static studies prove no animation, physical emergence or game behavior. [Work 4](../work/4_palette-ci-followup/plan.md) records these bounds and external evidence; no completed art recipe is approved.

Before blockout, inventory visible bodies, joints, surface roles and uncertain occlusions. Count bodies separately from plates, bright patches and source control stations; map each to actual occupied volume and protected air. Inspect the final union at diagnostic angles because component IDs, connectivity and counts cannot certify visible articulation. The corrected reference study requires four visible neck sections and separate head masses; those are subject-specific observations, not a universal recipe or a passed later candidate. A global envelope or backing volume can absorb individually named parts into a continuous roof or stem.

Keep a frozen matched camera for reference comparison, then inspect native-scale side, reverse, overhead and effect-end views. Fit supplementary cameras to the combined actor and effects bounds with a recorded margin; a clipped effect cannot be judged. Add a changed zoom and an adversarial angle, and inspect each image at native resolution. Bind the inspected bytes to their hashes. The two-view browser cube test covers all six palette directions and sRGB transfer through the public runtime; it does not measure art quality, silhouettes, game readability, occlusion, or performance at production scale.

Preflight capture names as nonempty and unique, then audit a distinct PNG path with its recorded hash for each requested angle. The study once lost its angle names and wrote to one `undefined.png` path nine times; it retained the failure log, added preflight checks and recaptured before independent review. Freeze the built engine artifact, camera, material, lighting and resolve settings for comparison; rebuilding a live `dist` tree during capture can remove modules underneath the browser. These are capture-authoring checks, not fixes to the renderer. The study's later nine fitted views included a measured 7% bounds margin; that is a recorded setting rather than a universal fit threshold.

After a native verification command in PowerShell, explicitly check `$LASTEXITCODE` and throw on nonzero before a dependent commit, push or publication. A native exit 1 does not stop later statements. Retain a failed comparison's verdict when a separate pixel control passes; the checks cover different bounds.

## Keep the reference family explicit

The broader inspected references also differed: Teardown's courtyard used coherent material regions with fine cubic geometry and direct light/contact shadow, Town to City's aerial view subordinated voxel grain to town/route/water masses, Voxels.ca's Settlers Keep character used exaggerated part proportions and open limb gaps, and the Sir Carma general environment image separated cliff/castle/water masses from clustered foliage and small accents. These are family-specific observations recorded with source links and image hashes in [work 3](../work/3_palette-face-tones/plan.md). Geometry construction and image finishing are separate decisions: a reference assembled from offline renders and postproduction does not demonstrate runtime lighting or frame performance. The specific Latica Cliffs pixels remained inaccessible and were not used to infer settings.

The study's rejected approaches and provenance live in [work 3](../work/3_palette-face-tones/plan.md). Several reference families were inspected, but only one subject has an authored 3D proof. Broader references can guide separate content decisions; transfer requires evidence on structurally different subjects. This small API transports caller-owned palette choices and makes no claim to supply a universal style or reproduce a reference by itself.
