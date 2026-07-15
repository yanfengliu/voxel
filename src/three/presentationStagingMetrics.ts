import type { ThreePresentationSnapshot } from './runtimeTypes.js';

export interface PresentationStagingMetricsSnapshotInternal {
  readonly currentBytes: number;
  readonly peakBytes: number;
}

export interface PresentationStagingHoldInternal {
  releaseInternal(): void;
}

type CommittedPresentationProviderInternal =
  () => readonly (ThreePresentationSnapshot | null | undefined)[];

function addProfiledMeshBuffersInternal(
  presentation: ThreePresentationSnapshot,
  buffers: Set<ArrayBufferLike>,
): void {
  for (const chunk of presentation.chunks) {
    const mesh = chunk.precomputedMesh;
    if (!mesh) continue;
    buffers.add(mesh.positions.buffer);
    buffers.add(mesh.normals.buffer);
    buffers.add(mesh.paletteIndices.buffer);
    if (mesh.materialIndices) buffers.add(mesh.materialIndices.buffer);
    buffers.add(mesh.indices.buffer);
  }
}

function checkedBufferBytesInternal(
  buffers: ReadonlySet<ArrayBufferLike>,
  excluded: ReadonlySet<ArrayBufferLike>,
): number {
  let bytes = 0;
  for (const buffer of buffers) {
    if (excluded.has(buffer)) continue;
    bytes += buffer.byteLength;
    if (!Number.isSafeInteger(bytes)) {
      throw new RangeError('Presentation staging bytes exceed safe-integer range.');
    }
  }
  return bytes;
}

/**
 * Tracks profiled mesh allocations while their presentation is provisional,
 * accepted-but-pending, or retained by an active frame ticket. Committed
 * presentations are remembered so reentrant frame settlement cannot make an
 * older displayed allocation appear staged again.
 */
export class PresentationStagingTrackerInternal {
  readonly #committed = new WeakSet<ThreePresentationSnapshot>();
  readonly #holds = new Map<object, ThreePresentationSnapshot>();
  readonly #committedPresentations: CommittedPresentationProviderInternal;
  #currentBytes = 0;
  #peakBytes = 0;
  #disposed = false;

  constructor(committedPresentations: CommittedPresentationProviderInternal) {
    this.#committedPresentations = committedPresentations;
  }

  retainInternal(presentation: ThreePresentationSnapshot): PresentationStagingHoldInternal {
    if (this.#disposed) throw new Error('Presentation staging tracker is disposed.');
    const token = {};
    this.#holds.set(token, presentation);
    this.#refresh();
    let released = false;
    return Object.freeze({
      releaseInternal: (): void => {
        if (released) return;
        released = true;
        this.#holds.delete(token);
        this.#refresh();
      },
    });
  }

  markCommittedInternal(presentation: ThreePresentationSnapshot): void {
    if (this.#disposed) return;
    this.#committed.add(presentation);
    this.#refresh();
  }

  metricsInternal(): PresentationStagingMetricsSnapshotInternal {
    if (!this.#disposed) this.#refresh();
    return Object.freeze({
      currentBytes: this.#currentBytes,
      peakBytes: this.#peakBytes,
    });
  }

  disposeInternal(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#holds.clear();
    this.#currentBytes = 0;
  }

  #refresh(): void {
    if (this.#disposed) return;
    const liveCommitted = new Set<ThreePresentationSnapshot>();
    for (const presentation of this.#committedPresentations()) {
      if (!presentation) continue;
      liveCommitted.add(presentation);
      this.#committed.add(presentation);
    }

    const committedBuffers = new Set<ArrayBufferLike>();
    for (const presentation of liveCommitted) {
      addProfiledMeshBuffersInternal(presentation, committedBuffers);
    }
    const stagingBuffers = new Set<ArrayBufferLike>();
    for (const presentation of this.#holds.values()) {
      if (this.#committed.has(presentation)) {
        addProfiledMeshBuffersInternal(presentation, committedBuffers);
      } else {
        addProfiledMeshBuffersInternal(presentation, stagingBuffers);
      }
    }
    this.#currentBytes = checkedBufferBytesInternal(stagingBuffers, committedBuffers);
    this.#peakBytes = Math.max(this.#peakBytes, this.#currentBytes);
  }
}
