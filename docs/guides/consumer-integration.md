# Consumer integration guide

Status: V1 vertical-slice contract, implemented on 2026-07-11 and exercised by AoE2's sole standalone world renderer since 2026-07-13.

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

The additive `view` option now supports engine-owned isometric orthographic and perspective cameras, plus a borrowed generic Three camera:

```ts
const perspective = new ThreeRenderRuntime({
  renderer,
  rendererOwnership: 'borrowed',
  viewportOwnership: 'runtime',
  width,
  height,
  view: {
    kind: 'perspective',
    position: { x: 16, y: 12, z: 20 },
    target: { x: 0, y: 0, z: 0 },
    verticalFovDegrees: 50,
    near: 0.1,
    far: 1_000,
  },
});
```

Use `{ kind: 'borrowed-camera', camera, projectionOwnership: 'host' }` when a runtime-rendered host owns camera projection updates. `projectionOwnership: 'runtime'` permits Voxel to update a borrowed perspective aspect or borrowed orthographic bounds on `resize`. `viewportOwnership: 'host'` prevents Voxel from changing renderer size or DPR; `viewportOwnership: 'runtime'` permits those changes and transactionally restores the prior viewport if construction fails.

For a shared City-style composition root, use the embedded host policy. Voxel prepares only its owned roots and returns a single-use ticket; the host performs its one ordered draw, then reports success. Abort restores the prior Voxel presentation. Embedded mode never invokes the shared renderer's draw, resize, DPR, or capture methods and never mutates the borrowed camera or host scene policy.

```ts
const runtime = new ThreeRenderRuntime({
  host: {
    kind: 'embedded',
    renderer,
    scene,
    camera,
    drawOwnership: 'host',
    viewportOwnership: 'host',
    captureOwnership: 'host',
  },
  width,
  height,
  pixelRatio: devicePixelRatio,
});

const proposal = runtime.prepareFrame({ nowMs, deltaMs, frameIndex });
if (proposal.status === 'prepared') {
  try {
    renderer.render(scene, camera); // exactly once, in host-owned order
  } catch (error) {
    runtime.abortFrame(proposal.ticket);
    throw error;
  }
  const manifest = runtime.commitFrame(proposal.ticket);
  void manifest; // exact committed revision, viewport, frame, and camera matrices
}
```

Do not leave a ticket outstanding. If the host decides not to draw, it must call `abortFrame`. `frame()` and `capture()` reject in embedded mode because those actions are host-owned; composite capture remains the host's responsibility.

The pre-1.0 `RendererLike` contract now requires `getSize(target: Vector2)` and `getPixelRatio()` in addition to `setSize` and `setPixelRatio`. Three.js `WebGLRenderer` already supplies them. Custom adapters and test doubles must implement both getters; they are used to capture and exactly restore a borrowed runtime-owned viewport.

Ownership fields on `metrics` distinguish work from live retention. `snapshotInputTypedArrayBytes`, `snapshotCopiedTypedArrayBytes`, and `snapshotCopyOperations` are cumulative across snapshot attempts for the validation/ownership-copy stage; until F-05 lands, they do not include the later copy from validated batch arrays into fixed pages. The corresponding `deltaInputTypedArrayBytes`, `deltaCopiedTypedArrayBytes`, and `deltaCopyOperations` cover delta parsing and copy-on-write page changes. `defensiveSnapshotCopyBytes` is cumulative public `RenderWorld` export work. `retainedTypedArrayBytes` is the current canonical backing allocation and falls to zero on disposal; `peakRetainedTypedArrayBytes` is a high-water mark. `presentationStagingBytes` and its peak count only additional typed arrays owned by an uncommitted presentation, not canonical arrays referenced by it. Sparse instance presentation additionally reports cumulative matrix writes, color writes, and GPU update ranges.

Browser bundlers can start the packaged module worker from the dedicated DOM entry:

```ts
import { startBrowserMeshWorkerV1 } from 'voxel/meshing/browser-worker';

const startup = startBrowserMeshWorkerV1();
if (startup.status === 'failed') throw new Error(startup.message);

const worker = startup.handle;
try {
  // Hand the worker to the host-owned transport/scheduler and await its shutdown.
} finally {
  worker.terminate();
}
```

The static `Worker`/`new URL` reference lets supported bundlers emit the worker asset while keeping `voxel/meshing` DOM-free. The caller owns a successfully started `handle` until it explicitly hands that responsibility to a component with a disposal path; otherwise terminate it exactly once, including on setup failure. Portable or custom hosts should import `startMeshWorkerV1` from `voxel/meshing` and supply their own worker factory.

`acceptSnapshot` validates the whole transaction and copies every retained typed array. It advances accepted state only. Resources become visible after a successful runtime-owned `frame`, or after `prepareFrame` plus the host draw and `commitFrame` in embedded mode; only that acknowledgement advances presented state. A newer accepted snapshot coalesces an older unpresented one. A new epoch replaces the prior world and may restart revision numbering. Within one world/epoch pair, revisions must increase monotonically.

After one accepted snapshot, `acceptDelta` can advance the same world/epoch from its exact accepted base. A mismatch returns `resync-required`; malformed, over-budget, identity-invalid, reference-invalid, or backend-unsupported candidates return `rejected`. Neither outcome changes canonical or pending state. A delta with visual effects becomes visible only after the same successful runtime-owned frame or embedded host draw/commit acknowledgement as a snapshot. In runtime-rendered mode only, a visually empty delta whose base is already presented may advance the presented watermark immediately because the displayed scene is byte-for-byte unchanged; that synchronous advancement affects readiness, metrics, and revision manifests without changing the canvas. Embedded mode still requires the host draw/commit acknowledgement for an empty delta.

Treat the caller's arrays as borrowed and canonical runtime state as private. The runtime API does not return its scene root, meshes, materials, or instance slots. A host that supplies a borrowed `Scene` can nevertheless discover engine-owned objects by traversing that scene. Those objects are observable derived artifacts, not a supported mutation surface: do not retain or mutate them, and assume Voxel may replace or dispose them at any frame boundary. Presentation-owned BufferAttributes are isolated from canonical snapshot arrays so accidental host mutation cannot rewrite accepted state, but it can still corrupt the displayed frame until Voxel rebuilds it.

An engine-created scene installs the default daylight rig. Pass `daylight: false` for an intentionally unlit or host-lit scene. A supplied `scene` receives no implicit lights; pass a `daylight` object when the runtime should add and own the rig inside that borrowed scene. The directional light and target follow `setView`, and the runtime removes only its rig during disposal. Constructor-only renderer flags such as antialiasing remain in `rendererParameters`.

## Rigid instance animation

An `InstanceBatchV1` may include `InstanceTransformAnimationV1`: one period, phase, XYZ world-translation amplitude, XYZ local Euler-rotation amplitude, and XYZ fractional-scale amplitude per slot. Period zero keeps a slot static. The runtime samples the lane from `ThreeFrameContext.nowMs`, so a game can render idle motion without accepting a new world snapshot and a manual clock can reproduce an exact pose.

The lane is deliberately semantic-free. A consumer decides whether a part is a foot, wheel, tree branch, ornament, idle pose, or locomotion pose and submits a new batch revision when that meaning changes. The engine copies and bounds the arrays, composes offsets over affine base matrices, computes conservative motion bounds, and reports `animatedBatches`, `animatedInstances`, and cumulative `animationMatrixUpdates`.

V1 admits at most 8,192 active animated slots per snapshot and 16,384 total slots in any batch containing active motion. Sparse matrix uploads are coalesced to at most 64 ranges per animated batch and frame. Shard larger crowds by spatial or archetype policy. General skeletal clips, root motion, state graphs, and gameplay-event timing are outside this contract.

## Three independent data lanes

- `VoxelChunkV1` is for opaque palette-indexed volumes. Index zero is empty. Chunk origins are world voxel coordinates, dimensions are positive, and storage is x-major: `x + size.x * (z + size.z * y)`. V1 permits at most 16,777,216 cells per dense chunk and requires absolute chunk boundaries inside `[-16,777,216, 16,777,216]` so adjacent integer coordinates remain representable in the oracle's Float32 output.
- `GeometryResourceV1` is for deterministic arbitrary topology, including irregular Townscaper shells and consumer-authored block recipes. Positions, normals, indices, pivot, and declared bounds are explicit. Leave material groups empty to use the instance batch's one material; otherwise groups must be topology-aligned, ordered, non-overlapping, and cover the index range exactly once.
- `InstanceBatchV1` is for repeated rigid geometry and optional bounded harmonic transform playback. Every instance key must be opaque and never reused in an epoch, or encode a consumer generation such as `entityId:generation`.

For portable occupancy queries, `voxel/meshing` exports `raycastDensePaletteChunks(options)`. It robustly normalizes a finite nonzero direction and traverses caller-supplied, uniformly sized and aligned `DensePaletteChunk` grids up to an inclusive `maxDistance`. Missing chunks are empty; `maxSteps` defaults to `DEFAULT_MAX_VOXEL_RAY_STEPS` (65,536) and may not exceed `HARD_MAX_VOXEL_RAY_STEPS`; budget exhaustion throws rather than returning a false miss. Hits include the world cell, palette index, distance, point, entry normal, chunk coordinate, and local coordinate. Exact boundary starts and simultaneous crossings have documented deterministic rules. This helper is data-only: it is not bound to `ThreeRenderRuntime` accepted/presented state and does not compose geometry or instance hits, so a consumer remains responsible for querying occupancy that matches its displayed frame.

Use a new resource incarnation when a logical key is destroyed and later recreated. Use a higher resource revision when the same incarnation changes. Keep consumer semantics out of resource keys and shared payload fields when identity alone suffices.

## Consumer-owned responsibilities

Every game keeps ownership of:

- projection from simulation/editor state and renderer epoch changes;
- palette and material policy, art recipes, animation meaning, and asset selection;
- fog, selection, commands, hit priority, UI, save/replay, and interpolation semantics;
- capacity/sharding policy that depends on gameplay density;
- composite capture when another canvas or DOM overlay participates in the final frame.

AoE2 currently uses chunks for terrain and consumer-authored geometry plus rigid instance batches for entities and feedback. Its AoE-owned `AoeVoxelGameView` is the sole world-renderer host: it owns camera/input orchestration and projects fog, selection, placement, health, hit, and death feedback into the same Three/`voxel` presentation. The DOM HUD and minimap remain separate product UI; there is no Phaser source, dependency, renderer selector, fallback, or second world canvas. City should begin with one existing building or vehicle instance batch in embedded mode while retaining its terrain and composition root. Townscaper should first align to the tested Three release, then pass its locally generated connected shell through geometry resources; its massing and facade rules stay local.

## Current constraints

- V1 voxel chunks require opaque palettes; transparent chunks are rejected rather than rendered incorrectly.
- Per-instance alpha is rejected by the current `InstancedMesh` path. Use opaque instance colors or a consumer-owned extension until a deliberate transparent-batch contract exists.
- The visible-face mesher remains the correctness oracle. The corpus-proven in-repo greedy candidate is installed in the packaged worker and has a provisional selection ADR; it is not production-complete until revision-atomic runtime integration and final end-to-end evidence pass.
- Each synchronous oracle job caps output at 262,144 exposed faces. Unprofiled arbitrary-chunk compatibility remains capped at 512 chunks per snapshot; explicitly profiled worlds instead use the descriptor's chunk count, copied-halo byte, and deterministic-work budgets with indexed neighbor lookup. These remain safety bounds, not production streaming targets.
- Whole snapshots, additive atomic deltas, the packaged worker, and the bounded stale-safe scheduler are implemented. Revision-atomic async runtime staging, committed-store picking exposure, assets, and spatial sharding remain later contracts and must preserve accepted/presented revision semantics. Internal voxel/instance query paths do not yet make a public runtime picking claim, and the portable dense-chunk ray query remains independent of runtime state.
- Browser page capture is distinct from `ThreeRenderRuntime.capture()` when other canvases or DOM overlays are part of the product image.

## Promotion checklist

Before a new game expands its slice:

1. Verify the dependency graph, browser constructor identity, and package tarball contents (`dist` declarations and ESM).
2. Test invalid transactions, borrowed-array mutation, epoch reset, monotonic revisions, identity reuse, resize, context loss, and idempotent disposal.
3. Record structural metrics and a fixed-size before/after visual capture.
4. Run both runtime-only and complete dependency audits.
5. Keep game concepts out of `voxel` declarations and document every deliberate extension boundary.
