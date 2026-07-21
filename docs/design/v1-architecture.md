# Voxel 1.0 target architecture

Status: Version 1.0 architecture record, originally authored as the target design on 2026-07-13 and frozen with the release on 2026-07-18. It does not claim that unmarked target sketches became public APIs. The current executable surface is described by the README, [the completed implementation ledger](../plans/v1-implementation.md), the package exports, and tests; where a delivered API's final shape differs from a sketch here, the delivered shape is noted in place.

The design is deliberately evolutionary. Existing 0.1 snapshot consumers remained source-compatible while opt-in contracts were added and proven before the 1.0 freeze.

## Architectural outcome

The authoritative game simulation publishes bounded render transactions. Voxel owns a canonical CPU render state, derives meshes and spatial indexes, and commits one complete target revision to the displayed frame. Three.js and every GPU object remain disposable projections. Consumer adapters own game meaning.

The data and presentation flow is:

    consumer simulation
      -> consumer-owned adapter
      -> snapshot or delta validation and one-copy ownership
      -> canonical accepted state
      -> synchronous lane preparation plus asynchronous voxel jobs
      -> validated whole-revision staging
      -> one frame-boundary scene and presented-store commit
      -> render
      -> presented revision, picking, capture, and metrics

Accepted state may be newer than displayed state. Picking and capture never read accepted state directly.

## Non-negotiable invariants

1. The simulation is authoritative; renderer state is replaceable derived data.
2. Portable inputs contain only bounded structured-clone-safe data. DOM, Three.js, callbacks, and consumer types stay out of core contracts.
3. Ordinary ingest borrows caller memory for the duration of the call and copies each newly retained typed-array byte exactly once.
4. A transaction either commits a valid final graph or leaves canonical state byte-for-byte unchanged.
5. World descriptor fields are immutable within an epoch. Changing coordinates, chunk profile, color encoding, capabilities, or limits requires a replacement snapshot with a new epoch. Likewise, the payload identified by one `{key, incarnation, revision}` tuple is immutable: a later full snapshot may repeat identical content at the same item revision, but changed content must advance the item revision and an item revision may never regress within its incarnation.
6. Async identity always includes world, epoch, resource key, incarnation, source revision, dependency revisions, policy version, and pipeline generation.
7. No worker transfers simulation-owned or canonical render-state buffers. Job-specific copies and completed result buffers may transfer ownership.
8. A displayed revision is global. Workers may prepare independent groups, but 1.0 never labels or exposes a frame as revision R until every visual effect of R is ready and the render succeeds.
9. Scene objects and the presented occupancy, transforms, bounds, and pick indexes change in the same frame-boundary transaction.
10. Every owned renderer, scene attachment, listener, worker, timer/frame subscription, geometry, material, texture, render target, cache lease, staging buffer, and waiter has idempotent cleanup.

## Package and module boundaries

The public subpaths are:

- voxel/core: schemas, validation, render-world state, revisions, deltas, readiness, and plain data types.
- voxel/meshing: chunk storage/indexing, oracle and production mesher contracts, portable ray queries, dependency signatures, and worker protocol types.
- voxel/meshing/browser-worker: the browser-only static module-worker launcher used by bundlers; importing it requires DOM worker globals.
- voxel/three: WebGL2 runtime, presenters, scheduler, camera strategies, picking, capture, metrics, and owned worker integration.
- voxel/testing: deterministic fixtures, model/race harnesses, lifecycle scenes, and budget reporters.

Non-binding responsibility map, not a required directory layout:

- Core transactions own snapshot/delta validation, budgets, reduction, canonical state, fixed-page batches, and the presentation ledger.
- Meshing owns profiles, checked coordinates, chunk indexes, invalidation, mesher contracts, dependency signatures, worker protocols, and worker entry points.
- The Three adapter owns compatibility checks, scheduling integration, revision-atomic presentation, committed presented stores, picking, capture, and GPU lifecycle.
- Testing owns deterministic fixtures, reference models, race/lifecycle harnesses, and evidence reporters.

The current flat modules may continue to carry these responsibilities. Reorganize files only when it improves an implemented seam; the architecture does not require duplicate replacements for working modules such as `canonical-store.ts`, `presentation-ledger.ts`, `mesh-worker-entry.ts`, or `revisionAtomicStaging.ts`.

Internal modules may export symbols to other built files without exposing those files through package exports. Public classes must not leak an internal prepared-state type into declarations.

## Data plane

### Existing snapshot compatibility

RenderSnapshotV1, RenderResourceV1, VoxelChunkV1, InstanceBatchV1, ApplyResultV1, validateAndCopySnapshotV1, and RenderWorld.acceptSnapshot remain available. A snapshot is the only transaction that may create a world, replace an epoch, or change the descriptor.

Two optional descriptor fields are introduced before the 1.0 schema freeze. Their omission has defined compatibility defaults:

    interface WorldDescriptorV1 {
      // existing fields remain unchanged
      readonly chunkProfile?: UniformVoxelChunkProfileV1;
      readonly transactionLimits?: RenderTransactionLimitsV1;
    }

Unprofiled arbitrary rectangular chunks retain the bounded synchronous oracle path for compatibility. The production indexed/worker path requires an explicit uniform profile; it is never inferred.

InstanceBatchV1 also gains an optional neutral presentation policy:

    interface InstanceBatchPresentationPolicyV1 {
      readonly castShadow: boolean;
      readonly receiveShadow: boolean;
    }

    interface InstanceBatchV1 {
      // existing fields remain unchanged
      readonly presentation?: InstanceBatchPresentationPolicyV1;
    }

Omission defaults both flags to false, preserving current output. These flags only opt objects into a host's existing shadow system. Voxel does not create or configure shadow maps, lights, renderer shadow settings, cascades, or quality policy for 1.0. Batch patches cannot change this policy; use put-batch.

### Delta contract

The additive delta API is:

    const RENDER_DELTA_SCHEMA_V1 = 'voxel.render-delta/1';

    interface RenderRevisionRefV1 {
      readonly worldId: string;
      readonly epoch: string;
      readonly revision: number;
    }

    interface RenderDeltaV1 extends RenderRevisionRefV1 {
      readonly schemaVersion: typeof RENDER_DELTA_SCHEMA_V1;
      readonly baseRevision: number;
      readonly operations: readonly RenderOperationV1[];
    }

    type RenderOperationV1 =
      | { readonly op: 'put-resource'; readonly resource: RenderResourceV1 }
      | { readonly op: 'remove-resource'; readonly key: string; readonly incarnation: number }
      | { readonly op: 'put-chunk'; readonly chunk: VoxelChunkV1 }
      | { readonly op: 'remove-chunk'; readonly key: string; readonly incarnation: number }
      | { readonly op: 'put-batch'; readonly batch: InstanceBatchV1 }
      | PatchBatchInstancesV1
      | { readonly op: 'remove-batch'; readonly key: string; readonly incarnation: number };

    interface PatchBatchInstancesV1 {
      readonly op: 'patch-batch-instances';
      readonly key: string;
      readonly incarnation: number;
      readonly revision: number;
      readonly removeInstanceKeys: readonly string[];
      readonly upserts: InstanceBatchPatchPayloadV1;
    }

    interface InstanceBatchPatchPayloadV1 {
      readonly instanceKeys: readonly string[];
      readonly matrices: Float32Array;
      readonly colors?: Uint8Array;
      readonly animation?: InstanceTransformAnimationV1;
    }

    type DeltaApplyResultV1 = ApplyResultV1 | {
      readonly status: 'resync-required';
      readonly reason:
        | 'uninitialized'
        | 'world-mismatch'
        | 'epoch-mismatch'
        | 'base-revision-mismatch';
      readonly expected: RenderRevisionRefV1 | null;
      readonly received: RenderRevisionRefV1 & { readonly baseRevision: number };
    };

ApplyResultV1 is not widened, so existing exhaustive consumers do not break. RenderWorld.acceptDelta and ThreeRenderRuntime.acceptDelta return DeltaApplyResultV1.

### Delta semantics

- A delta applies only when worldId and epoch equal accepted state and baseRevision exactly equals acceptedRevision. Otherwise no validation candidate is committed and resync-required names expected and received state.
- revision must be a safe integer greater than baseRevision. It need not equal baseRevision + 1 because consumer revision sequences may intentionally skip values.
- At most one operation may target a lane/key pair in one delta. Operation order has no semantic effect; references are validated against the final candidate graph.
- A put creates a new key, updates the same incarnation with a strictly greater resource revision, or recreates a removed key with a strictly greater incarnation.
- Per-lane tombstones remember the greatest removed incarnation until epoch replacement. A stale add/remove cannot create an ABA identity collision.
- Remove requires an existing key and the exact live incarnation. Missing or mismatched removes reject rather than silently diverging.
- PatchBatchInstancesV1 cannot change geometry/material references or optional color/animation lane layout. Use put-batch for those changes.
- Patch removal and upsert keys are unique and disjoint. An existing key receives a complete replacement of its per-instance values; a new key is added. Batch revision must increase.
- Final candidate references, counts, overlaps, limits, and backend compatibility are validated before accepted state changes.
- Unknown object properties are accepted and discarded like snapshot validation; unknown operation discriminants reject.
- An empty delta is a valid nonvisual revision advance. An empty instance patch rejects with `batch.patch.empty`.
- Snapshot replacement within the same world/epoch retains tombstones and rejects an incarnation that does not exceed a removed or replaced identity. A new world or epoch clears tombstones.
- A live key cannot change incarnation in one delta; remove it and recreate it with a greater incarnation in a later accepted transaction. Resource kind is immutable within a live incarnation.
- Patch animation arrays correspond only to `upserts.instanceKeys`, not the complete target batch. A remove-only patch may omit colors and animation because there are no replacement tuples; any patch with upserts must match the live batch's optional lane layout.

### Transaction budgets

RenderTransactionLimitsV1 defines world-specific limits bounded by package hard maxima:

    interface RenderTransactionLimitsV1 {
      readonly maxOperations: number;
      readonly maxInstanceChanges: number;
      readonly maxInputTypedArrayBytes: number;
      readonly maxValidationElements: number;
      readonly maxTombstones: number;
      readonly maxPresentationWaiters: number;
    }

Validation maintains independent counters for input bytes, final uniquely retained bytes, operation and changed-instance counts, and deterministic work elements. A work element is charged for each inspected scalar/list entry, map/reference lookup, overlap comparison, and patch key. Declared counts and typed-array lengths are rejected before large allocation when they cannot fit a remaining budget.

The first measured defaults are now frozen for the V1 schema. AoE's declared ceiling requires 4,119 full-lane targets, 200,000 instances, and 512 MiB; the City-shaped foundation fixture is much smaller. Defaults are 8,192 operations, 262,144 instance changes, 512 MiB input typed arrays, 16,777,216 validation elements, 1,000,000 tombstones, and 1,024 presentation waiters. Hard maxima are 300,000 operations, 1,000,000 instance changes, 1 GiB input, 100,000,000 validation elements, 4,000,000 tombstones, and 16,384 waiters. A descriptor may lower or raise a default through `transactionLimits` but cannot exceed a hard maximum.

### Preparation, backend guard, and commit

The 0.2 foundation snapshot path now performs one ownership copy and uses the same prepare/guard/commit boundary that deltas enter:

1. A package-internal prepareSnapshot or prepareDelta validates input and creates an immutable canonical candidate plus a change set.
2. The Three compatibility guard checks the prepared candidate's changed and referenced resources without copying it.
3. If compatible, the canonical store atomically commits the candidate.
4. Presenters consume package-internal readonly canonical views and the change set. Public snapshot getters continue returning defensive copies.

Public RenderWorld.acceptSnapshot uses the same prepare/commit functions with the portable compatibility policy. The internal prepared token cannot be forged or imported through a package subpath.

Backend rejection is therefore atomic: an unsupported topology, alpha mode, attribute, or budget cannot advance accepted state.

### Canonical store and structural sharing

The canonical store uses immutable lane maps for resources, chunks, and batches plus tombstone maps and retained-byte accounting. Snapshot replacement may rebuild the maps. Delta candidates structurally share unchanged entries.

Instance batches use fixed-size copy-on-write pages for matrices, colors, and animation attributes plus an internal key-to-slot map. Sparse patches clone touched pages and any page affected by slot compaction; they do not copy the complete batch. Canonical export may materialize a deterministic defensive snapshot for diagnostics and compatibility.

Ordinary caller arrays are never retained directly. Post-return mutation cannot change accepted, pending, or presented state.

### Optional transfer-owned ingest

Transfer ownership is not a 1.0 requirement unless measurements after one-copy delta ingest still justify it. If added, it is separately named and explicitly destructive:

    claimRenderTransferV1(value, transferBuffers)
    RenderWorld.takeSnapshot(input)
    RenderWorld.takeDelta(input)

If implemented, the ownership-taking path will structured-clone with a transfer list, validate the transferred clone without copying its buffers, and commit it if valid. Source buffers will detach once transfer succeeds even when later validation rejects. SharedArrayBuffer, foreign or duplicate buffers, detached buffers, unsupported aliasing, and incomplete transfer lists will reject. Simulation-owned memory must use ordinary accept APIs.

## Accepted, staged, and presented state

Accepted means a CPU transaction passed portable and backend validation and committed to canonical state. Staged means all synchronous lane changes and some or all async mesh results exist off-scene. Presented means a complete accepted target was committed to scene and presented stores at a frame boundary and rendered successfully.

The public readiness types are:

    type PresentationReadinessV1 =
      | {
          readonly status: 'ready';
          readonly target: RenderRevisionRefV1;
          readonly presentedThrough: RenderRevisionRefV1;
        }
      | {
          readonly status: 'not-ready';
          readonly reason: 'not-accepted' | 'pending' | 'context-lost' | 'restoring';
          readonly accepted: RenderRevisionRefV1 | null;
          readonly presentedThrough: RenderRevisionRefV1 | null;
        }
      | {
          readonly status: 'unavailable';
          readonly reason: 'epoch-replaced' | 'disposed' | 'failed';
          readonly target: RenderRevisionRefV1;
        };

    presentationReadiness(target: RenderRevisionRefV1): PresentationReadinessV1;

    awaitPresented(
      target: RenderRevisionRefV1,
      options?: { readonly signal?: PresentationAbortSignalV1 },
    ): Promise<PresentationReadinessV1>;

PresentationAbortSignalV1 is the DOM-free structural subset of AbortSignal used by core: aborted, reason, and abort add/removeEventListener. Native AbortSignal objects are assignable without requiring portable consumers to include lib.dom.

Core does not implement wall-clock timeouts. Callers abort through the structural signal. A target must already be accepted before it may register a waiter. Epoch replacement, failure, abort, and disposal settle affected waiters and release registrations. Pending accepted revision membership remains exact and is hard-bounded; if presentation stalls at that bound, another transaction rejects with limit.presentation-backlog instead of silently forgetting an accepted target. After a complete newer presentation, unpinned older membership may age out of the bounded recent history and then reports not-accepted, so long-lived consumers register waits when they accept the target rather than using the ledger as an unbounded archive.

Accepted revisions form an ordered chain even when numeric values skip. A revision becomes presentedThrough when every visual effect is visible, or when a later accepted effect on the same chain safely supersedes it and that later complete revision is visible. A failed upload or render never advances the watermark.

## Uniform chunk model

The production voxel path uses:

    interface UniformVoxelChunkProfileV1 {
      readonly layout: 'uniform-grid';
      readonly size: Int3V1;
      readonly gridOrigin: Int3V1;
      readonly emptyPaletteIndex: 0;
      readonly surfaceModel: 'opaque';
      readonly missingNeighbor: 'empty' | 'sealed' | 'unavailable';
    }

For integer chunk coordinate c:

    origin = gridOrigin + c * size

All arithmetic uses checked safe integers and mathematical floor division. A profiled chunk whose origin is not aligned rejects. Chunk coordinates are unique. A coordinate slot owns a monotonically increasing slot generation in addition to the chunk's key/incarnation/revision, preventing remove/add ABA races.

Missing-neighbor semantics are explicit:

- empty: the absent cell is known air and an exposed face may be emitted;
- sealed: the absent side occludes the boundary and no face is emitted;
- unavailable: the dependency is unresolved, so the affected mesh group cannot become ready.

World scale and profile changes require a new epoch.

## Chunk index and invalidation

ChunkIndex maps a canonical coordinate key to coordinate, slot generation, key, incarnation, source revision, and canonical chunk view. A six-neighbor lookup is O(1).

Every mesher describes its identity, version, halo width, dependency offsets, attribute policy, and output limits. The opaque 1.0 mesher declares only the six face neighbors. If a future mesher samples corners for ambient occlusion, it must declare the additional offsets and automatically expands invalidation.

For one transaction:

1. Direct dirties are created, updated, deleted, moved-from, and moved-to coordinates.
2. For each direct dirty, use both old and new indexes to add targets whose declared dependency offsets include it.
3. Do not recursively expand from derived dirties.
4. Union overlapping closures into deterministic connected components for preparation.
5. Palette color changes invalidate attributes for referencing chunks; palette opacity-class changes invalidate topology; material-only changes rebind without remeshing.

A dependency signature contains, in canonical order, world/epoch, mesher and material-policy versions, chunk profile and scale, source coordinate/slot/key/incarnation/revision, and every dependency coordinate's slot/key/incarnation/revision or explicit missing token.

## Mesher contract and bake-off

The pure mesher accepts one canonical source chunk plus a copied halo sample and output budget. It returns local-space indexed geometry, deterministic bounds, counts, dependency identity, and work metrics. It imports neither Three.js nor the DOM.

The existing visible-face mesher remains the correctness oracle. Before choosing production code, freeze a corpus and compare:

- current TypeScript visible-face output;
- a focused TypeScript greedy implementation or extraction;
- pinned Voxelize extraction;
- pinned block-mesh-rs extraction.

Correct exposed face coverage, seams, winding, normals, palette/material compatibility, bounds, indices, deterministic output, reproducible offline builds, license/notice, and packed-worker loading are hard gates. Measure cold initialization, algorithm p50/p95/max, queue-plus-transfer latency, output bytes, peak staging memory, package size, and production-shaped end-to-end presentation.

Adopt an external candidate only if it passes every correctness/supply-chain gate, improves combined named-scene presentation cost by at least 30 percent on two of three production-shaped scenes, regresses no named scene by more than 10 percent, and fits the recorded package budget. On a tie, prefer the narrower dependency. If no candidate qualifies, a maintained in-repo implementation must meet the same gates; the synchronous oracle alone is not silently relabeled production-ready.

## Worker protocol and scheduler

The built worker is shipped inside the packed artifact and resolved relative to built runtime code. Its protocol is Three-free. `voxel/meshing/browser-worker` owns the DOM-specific static `new Worker(new URL(...))` launcher required by browser bundlers; `voxel/meshing` stays DOM-free and exposes the factory-based launcher for portable or custom hosts.

A mesh request carries:

    schemaVersion: 'voxel.mesh-worker/1'
    jobId, groupId, worldId, epoch, targetRevision
    sourceToken and dependencySignature
    mesher id/version and pipelineGeneration
    chunk-plus-halo sampleVolume in a job-owned Uint16Array
    output byte/face/vertex/index limits

Results echo all identity and are completed, cancelled, or failed. Completed output includes local positions, normals, palette/material attributes, indices, bounds, counts, and metrics. The runtime validates lengths, finite values, bounds, topology, indices, identity, and byte limits before any GPU allocation.

Scheduler policy:

- one active job per worker, configurable bounded pool, and bounded queue/staging bytes;
- allocate and transfer a job-owned halo buffer only at dispatch;
- prioritize current-frustum, one-chunk view halo, then remaining work; within a class prefer newest target, distance, and canonical coordinate;
- use a deterministic dispatch-count promotion to prevent offscreen starvation without making engine decisions from wall time;
- replace queued work for a coordinate with the newest dependency signature;
- supersede an older target when a newer transaction changes any source or dependency;
- reuse a completed CPU mesh only on an exact dependency signature;
- preflight the complete target's closure, groups, queue, input, output, atomic-chunk, and simultaneous staging-lease budgets before making the first target-state mutation.

Queued cancellation removes work immediately. Running cancellation is logical and may send a cooperative message, but synchronous WASM is allowed to finish; its result is then ineligible. Worker crash receives at most one fresh-worker retry. Deterministic mesher failures are terminal. Epoch replacement and disposal terminate owned workers.

A returned result is eligible only when runtime, job registration, world/epoch, target, group, coordinate slot generation, key/incarnation/source revision, recomputed dependency signature, mesher version, and pipeline generation still match. Eligibility is checked on receipt, after group completion, and immediately before frame commit. Stale or duplicate results are disposed before GPU allocation and counted.

## Revision-atomic presentation

For target revision R:

1. Synchronous material, geometry, batch, and optional proxy changes prepare against canonical R.
2. Worker closures prepare independently into R's CPU staging area.
3. When every group is valid, replacement GPU resources and scene objects are built off-scene.
4. Any preparation failure disposes all staging for R and leaves the displayed revision untouched.
5. At one frame boundary, swap all scene lanes and presented stores in a guarded critical section.
6. Render the frame.
7. Only after successful render mark R presented and dispose replaced GPU resources.

If swap or render fails, rollback or reconstruct the previously presented scene before another presentation attempt; never report R as visible. This is intentionally global revision atomicity. Per-region streaming versions are a future protocol and must not overload presentedRevision.

Context loss may retain validated CPU staging within budget, but no target presents while lost. Restoration reconstructs the last committed displayed state first, then may present the newest complete target.

## Three.js runtime, hosts, and cameras

The 1.0 runtime remains externally framed. It never starts an implicit requestAnimationFrame loop. ThreeFrameContext supplies finite monotonic nowMs, non-negative clamped deltaMs, and a non-negative frameIndex.

Renderer ownership is not sufficient to describe embedding. Draw, viewport, camera projection, and capture ownership are separate:

    type ThreeRuntimeHostV1 =
      | {
          readonly kind: 'runtime-rendered';
          readonly viewportOwnership: 'runtime' | 'host';
        }
      | {
          readonly kind: 'embedded';
          readonly renderer: RendererLike;
          readonly scene: import('three').Scene;
          readonly camera: import('three').Camera;
          readonly drawOwnership: 'host';
          readonly viewportOwnership: 'host';
          readonly captureOwnership: 'host';
        };

Runtime-rendered is the compatibility default. Embedded mode is genuinely host-managed: Voxel does not call renderer.render, setSize, setPixelRatio, setAnimationLoop, mutate host shadow/color policy, or mutate a host-owned camera. It attaches one owned root and prepares that root for the host's existing draw order. A host-owned viewport update records width, height, and DPR for manifests and picking but does not resize the shared renderer.

The target view options are a discriminated union:

    type ThreeViewOptionsV1 =
      | {
          readonly kind: 'isometric-orthographic';
          readonly center: Vec3V1;
          readonly zoom: number;
          readonly tileWidthPixels: number;
          readonly tileHeightPixels: number;
          readonly near?: number;
          readonly far?: number;
        }
      | {
          readonly kind: 'perspective';
          readonly position: Vec3V1;
          readonly target: Vec3V1;
          readonly up?: Vec3V1;
          readonly verticalFovDegrees: number;
          readonly near: number;
          readonly far: number;
        }
      | {
          readonly kind: 'borrowed-camera';
          readonly camera: import('three').Camera;
          readonly projectionOwnership: 'host' | 'runtime';
        };

Owned strategies create and update their camera. A borrowed camera is never disposed. With host projection ownership, Voxel only records viewport metadata and the host updates projection. With runtime projection ownership, only known orthographic/perspective projection fields are updated. Existing camera, center, zoom, and tile-size options normalize to the isometric compatibility path and remain supported through 1.x.

### Two-phase frame ticket

Host rendering creates an acknowledgement boundary. The additive API is:

    prepareFrame(context: ThreeFrameContext): ThreePrepareFrameResult;
    commitFrame(ticket: ThreePreparedFrameTicket): ThreePresentedManifestV1;
    abortFrame(ticket: ThreePreparedFrameTicket): void;

prepareFrame applies deterministic animation for the proposed frame, prepares any complete target revision, snapshots the proposed scene/pick/camera state, and returns an opaque single-use ticket. It does not advance presented state. The host draws its scene and then calls commitFrame only after that draw succeeds. A draw failure, context loss, or disposal calls abortFrame, which restores the previous displayed scene and disposes uncommitted resources.

Only one ticket may be outstanding. A duplicate, foreign, stale-device, already-used, or late ticket rejects with a stable code. State accepted while a ticket is outstanding remains the next target and cannot be folded into that ticket.

The existing frame(context) method remains the runtime-rendered convenience wrapper:

    const prepared = prepareFrame(context);
    if (prepared.status === 'unavailable') return undefined;
    try {
      renderer.render(scene, camera);
    } catch (error) {
      abortFrame(prepared.ticket);
      throw error;
    }
    return commitFrame(prepared.ticket);

In embedded mode frame rejects because Voxel does not own the final draw. At commit, the presented manifest snapshots viewport/DPR, camera projection and world matrices, camera generation, device generation, frame index/time, and the globally displayed resource state. Picking and capture manifests use that immutable snapshot, not a subsequently mutated borrowed camera.

Internal runtime lifecycle is:

    initializing -> running -> lost -> restoring -> running
                       |        |          |          |
                       +--------+----------+----------+-> failed
                       +-------------------------------> disposed
    failed ---------------------------------------> disposed

Input may be accepted while lost/restoring if CPU budgets permit, but frames do not commit and readiness reports the state. On restoration, renderer-owned materials, geometries, buffers, targets, and presenters are reconstructed from the last committed presented CPU state; runtime-owned size, DPR, color policy, camera, and lights are reapplied. The prior watermark is preserved. Only after that displayed state is reconstructed may the latest accepted target enter normal preparation; an accepted-but-unready worker target never bypasses readiness during restore. A successful reconstruction and draw is required before running. A terminal restore failure settles waiters as failed and still permits disposal.

The existing ThreeRenderMetrics.state literals remain a source-compatible compatibility projection: running, lost, or disposed. lost includes the richer lost, restoring, and failed states for that legacy field. A new runtimeStatus() API reports the full discriminated lifecycle and failure detail without widening the old union before migration.

Owned/borrowed policy is explicit for renderer, scene, camera, viewport, draw, capture, daylight, controls, and extensions. Voxel removes only roots/listeners/resources it created and never disposes borrowed host objects.

## Backend capabilities and topology

Portable core currently validates triangle, line, and point geometry, while the Three instance path accepts triangles only. 1.0 resolves this truthfully with an exported immutable runtime capability report and compatibility preflight.

The report names supported schema versions, topology by lane, voxel surface model, alpha/color limitations, camera modes, worker availability, picking lanes, context restoration, maximum DPR/viewport policy, and tested Three peer line. Supporting portable line/point data does not imply that an instance backend can draw it.

The default 1.0 Three instance lane guarantees indexed triangle geometry. Lines and points are either implemented and tested before freeze or reported unsupported with atomic rejection. No documentation may imply otherwise.

## Presented-state picking

The required 1.0 lanes are voxel and rigid instance. The API uses plain vectors and opaque identities:

    interface PickQueryV1 {
      readonly origin: Vec3V1;
      readonly direction: Vec3V1;
      readonly maxDistance: number;
      readonly maxHits: number;
      readonly lanes?: readonly ('voxel' | 'instance')[];
      readonly ordering?: {
        readonly mode: 'distance-first' | 'lane-first';
        readonly laneOrder: readonly ('voxel' | 'instance')[];
      };
    }

Every hit includes worldId, epoch, presentedRevision, presented frameIndex, lane, resource key/incarnation/revision, world point, world normal, and distance. Voxel hits add chunk identity and integer voxel coordinate. Instance hits add batch, geometry, and instance keys.

Distance-first is the default. Exact-distance ties use declared lane order and then lexicographic stable identity. maxHits and traversal/candidate budgets are mandatory. Consumer selection priority and commands remain outside Voxel.

PresentedVoxelStore swaps with chunk meshes and supplies occupancy to DDA. World-distance parameterization must remain correct under anisotropic worldUnitsPerVoxel; wrapping the current normalized voxel-space query without conversion is insufficient.

Instance picking uses matrices actually uploaded for the last rendered frame, including procedural animation, and maps Three instance IDs through the presented key table. Begin with bounded Three raycasting and measured spatial shards. Add an acceleration dependency only if the named scene exceeds its p95 budget.

As delivered, ThreeRenderRuntime exposes `pickPresented(query)` for a caller-supplied world ray against the committed frame; the projection helpers on the camera policies derive rays from screen coordinates when a consumer needs them. It never reads a mutable borrowed camera after commit. Hits name the full presented identity, and exhausting a traversal/candidate budget returns a typed budget-exceeded outcome rather than a false miss. (This section originally sketched a two-method `pickPresentedRay`/`pickPresentedNdc` shape; the single-query form shipped instead.)

A future neutral proxy lane may add bounded AABB and sphere proxies attached to world or presented instances. It is accepted for 1.0 only if real AoE/City evidence shows voxel and instance geometry cannot express the required logical hit area; otherwise it remains a 1.x schema addition.

## Capture and diagnostics

The existing synchronous capture remains a compatibility call for the currently displayed frame in runtime-rendered mode. Add:

- captureWhenPresented(target, { signal }) for an abortable readiness wait followed by explicit render/readback when Voxel owns drawing/capture;
- captureWithManifest({ detail: 'summary' | 'resources' }) for a non-blocking record of exact displayed state.

Embedded mode returns host-capture-owned with the committed manifest unless the host explicitly supplies a bounded capture lease. Voxel never invokes an extra render on a shared renderer merely to satisfy capture because that could alter host ordering and state. A host lease owns composition/readback and returns evidence tied to the supplied presented manifest.

Summary manifests include world, epoch, presentedThrough revision, frame index/time, viewport, DPR, device/camera generations, runtime state, and structural metrics. Resource detail adds lane/key/incarnation/revision entries. Lost, restoring, failed, and disposed states return typed unavailability rather than implying a complete capture.

Metrics include current and peak accepted/staged/presented bytes; copied bytes; queued/running/completed/failed/cancelled/coalesced/stale jobs; worker restarts; closure/group sizes; voxels/faces/vertices/triangles; chunk meshes created/reused/swapped/disposed; loaded/visible/drawn chunks; material/geometry/batch/instance counts; draw/GPU resource counts; pick work/hits/budget failures; context transitions; capture status; and presentation readiness.

Deterministic engine choices do not read wall time. Benchmark timing is injected by the harness and reported with environment metadata.

## Release and compatibility architecture

- Build ESM and declarations for every public subpath; externalize Three.js and keep it an optional peer.
- Package worker code and resolve it relative to built runtime modules without network access or source-tree assumptions.
- Generate a committed public API report from built declarations. CI rejects unacknowledged changes; intentional changes update the report, changelog, and migration note together.
- Verify a packed tarball in a fresh portable consumer with no Three.js, then in a Three consumer with exactly one runtime identity.
- Test portable lanes on supported Node/OS combinations and real WebGL lanes on declared browser/OS combinations.
- Run runtime-only and full dependency audits. New high/critical findings block unless an explicit expiring exception is committed.
- Keep package private through the initial 1.0 tag. The immutable Git release records tarball contents, integrity hash, source commit, Node/npm versions, Three peer line, browser build, and verification commands.

SemVer after 1.0 covers public declarations, package exports, schema literals, operation discriminants, stable diagnostic/result codes, ownership behavior, and documented lifecycle. Internal implementation, metrics additions, and opt-in performance improvements may evolve when they do not change those contracts.

## Security and resilience posture

Render input is treated as untrusted data even when produced by a sibling game. Validators bound bytes, elements, operations, comparisons, jobs, staging, worker output, picks, and waiters. Worker messages are validated on both sides. No input string becomes executable code, a URL fetch, a property path mutation, or a DOM selector. Errors expose stable codes and bounded paths/messages, not buffer contents.

Context loss, worker crash, aborted capture, rejected transaction, renderer exception, and disposal are terminally accounted outcomes. Retry is bounded and never silently changes identity or accepted state.

## Architecture acceptance tests

The architecture is implemented only when tests prove:

- one-copy borrowed ingest and atomic backend rejection;
- snapshot/delta model equivalence, tombstones, sparse batch cost, and bounded validation;
- uniform-grid arithmetic, exact dirty closures, oracle parity, worker packaging, cancellation, crash retry, stale rejection, and whole-revision commit;
- accepted-newer-than-presented capture and picking parity;
- anisotropic voxel picking and animated instance identity;
- orthographic/perspective and owned/borrowed camera behavior;
- loss during preparation, reconstruction, repeated restoration, failed restoration, and disposal;
- packed portable and Three consumers, declaration/API stability, one Three runtime, audits, browser evidence, endurance, and named performance scenes.

The ordered work and exact evidence owners are in [the implementation plan](../plans/v1-implementation.md).
