# Changelog

## 0.1.1 - 2026-07-12

- Added a typed, validated `ThreeDaylightOptions` surface for sky/ground hemisphere fill and a directional sun.
- The engine-owned light rig tracks the current view centre, so panning keeps a stable light direction across large worlds.
- Supplied scenes still receive no implicit lighting; consumers may explicitly request an engine-owned rig, which is removed during idempotent disposal.
- Kept antialiasing, palettes, fog, art recipes, shadows, and post-processing under explicit consumer or later measured policies.

## 0.1.0 - 2026-07-11

- Added bounded, copied V1 render snapshots with explicit world epochs and accepted/presented revisions.
- Added dense palette chunks and a deterministic boundary-aware visible-face mesher.
- Added a Three.js WebGL runtime for voxel chunks, arbitrary geometry resources, rigid instance batches, 2:1 orthographic views, capture, metrics, context loss, and idempotent disposal.
- Established a narrow tested Three.js peer line and exercised the first real consumer through AoE2's opt-in composed isometric voxel renderer.
- Documented the build-versus-adopt boundary, mature-library research, consumer contract, cross-game design, and phased City/Townscaper follow-ups.
