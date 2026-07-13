# Consumer integration guide

Status: V1 vertical-slice contract, implemented and exercised by AoE2's opt-in renderer on 2026-07-11.

## Install and link

Until this private package has a registry release, sibling games consume it through a workspace or `file:` dependency and build the package from its own checkout:

```json
{
  "dependencies": {
    "three": "0.185.1",
    "voxel": "file:../voxel"
  }
}
```

Run `npm install` in `voxel` first. Its `prepare` script builds `dist`; a Vite consumer should also set `resolve.dedupe: ['three']`. `npm ls three` verifies the dependency graph, while a browser constructor-identity probe must verify that the production bundle actually uses one Three runtime. A linked development checkout can contain its own dev-only Three install even when Vite correctly deduplicates the browser bundle.

Import only the lane the consumer uses. `voxel/core` and `voxel/meshing` do not expose Three types. Importing `voxel/three` requires the tested Three peer.

## Lifecycle

The game owns an adapter from authoritative or projected game state to a complete `RenderSnapshotV1`. The reusable runtime never reads a simulation, ECS, save, UI, or game command directly.

```ts
import { ThreeRenderRuntime } from 'voxel/three';

const runtime = new ThreeRenderRuntime({
  canvas,
  width: 800,
  height: 600,
  center: { x: 0, y: 0, z: 0 },
  zoom: 1,
  daylight: {
    skyColor: 0xdcecff,
    groundColor: 0x4b3928,
    fillIntensity: 1.25,
    sunColor: 0xffedc2,
    sunIntensity: 2.35,
    sunOffset: { x: -24, y: 38, z: -18 },
  },
});

const result = runtime.acceptSnapshot(snapshot);
if (result.status === 'rejected') {
  throw new Error(`${result.code} at ${result.path}: ${result.message}`);
}

runtime.frame({ nowMs, deltaMs, frameIndex });
const metrics = runtime.metrics();

// On resize, camera change, capture, and shutdown:
runtime.resize(width, height, devicePixelRatio);
runtime.setView({ x: centerX, y: elevation, z: centerZ }, zoom);
const capture = runtime.capture();
runtime.dispose();
```

`acceptSnapshot` validates the whole transaction and copies every retained typed array. It advances accepted state only. Resources become visible on `frame`, which advances presented state. A newer accepted snapshot coalesces an older unpresented one. A new epoch replaces the prior world and may restart revision numbering. Within one world/epoch pair, revisions must increase monotonically.

Treat the caller's arrays as borrowed and the runtime's state as private. Do not mutate through Three objects: the public runtime intentionally exposes no scene root, mesh, material, or instance slot.

An engine-created scene installs the default daylight rig. Pass `daylight: false` for an intentionally unlit or host-lit scene. A supplied `scene` receives no implicit lights; pass a `daylight` object when the runtime should add and own the rig inside that borrowed scene. The directional light and target follow `setView`, and the runtime removes only its rig during disposal. Constructor-only renderer flags such as antialiasing remain in `rendererParameters`.

## Three independent data lanes

- `VoxelChunkV1` is for opaque palette-indexed volumes. Index zero is empty. Chunk origins are world voxel coordinates, dimensions are positive, and storage is x-major: `x + size.x * (z + size.z * y)`. V1 permits at most 16,777,216 cells per dense chunk and requires absolute chunk boundaries inside `[-16,777,216, 16,777,216]` so adjacent integer coordinates remain representable in the oracle's Float32 output.
- `GeometryResourceV1` is for deterministic arbitrary topology, including irregular Townscaper shells and consumer-authored block recipes. Positions, normals, indices, pivot, and declared bounds are explicit. Leave material groups empty to use the instance batch's one material; otherwise groups must be topology-aligned, ordered, non-overlapping, and cover the index range exactly once.
- `InstanceBatchV1` is for repeated rigid geometry. Every instance key must be opaque and never reused in an epoch, or encode a consumer generation such as `entityId:generation`.

Use a new resource incarnation when a logical key is destroyed and later recreated. Use a higher resource revision when the same incarnation changes. Keep consumer semantics out of resource keys and shared payload fields when identity alone suffices.

## Consumer-owned responsibilities

Every game keeps ownership of:

- projection from simulation/editor state and renderer epoch changes;
- palette and material policy, art recipes, animation meaning, and asset selection;
- fog, selection, commands, hit priority, UI, save/replay, and interpolation semantics;
- capacity/sharding policy that depends on gameplay density;
- composite capture when another canvas or DOM overlay participates in the final frame.

AoE2 currently uses chunks for terrain, one consumer-authored block geometry plus a rigid instance batch for entities, and a transparent Phaser overlay for input/fog/selection/health/UI. City should begin with one existing building or vehicle instance batch in embedded mode while retaining its terrain and composition root. Townscaper should first align to the tested Three release, then pass its locally generated connected shell through geometry resources; its massing and facade rules stay local.

## Current constraints

- V1 voxel chunks require opaque palettes; transparent chunks are rejected rather than rendered incorrectly.
- Per-instance alpha is rejected by the current `InstancedMesh` path. Use opaque instance colors or a consumer-owned extension until a deliberate transparent-batch contract exists.
- The visible-face mesher is a correctness oracle, not a greedy production mesher. Run the documented Voxelize versus `block-mesh-rs` bake-off before replacing it.
- The oracle path caps output at 262,144 faces and 512 chunks per snapshot. These are safety bounds, not production streaming targets.
- V1 is whole-snapshot ingest. Deltas, async worker jobs, picking, assets, and spatial sharding are later contracts and must preserve accepted/presented revision semantics.
- Browser page capture is distinct from `ThreeRenderRuntime.capture()` when other canvases or DOM overlays are part of the product image.

## Promotion checklist

Before a new game expands its slice:

1. Verify the dependency graph, browser constructor identity, and package tarball contents (`dist` declarations and ESM).
2. Test invalid transactions, borrowed-array mutation, epoch reset, monotonic revisions, identity reuse, resize, context loss, and idempotent disposal.
3. Record structural metrics and a fixed-size before/after visual capture.
4. Run both runtime-only and complete dependency audits.
5. Keep game concepts out of `voxel` declarations and document every deliberate extension boundary.
