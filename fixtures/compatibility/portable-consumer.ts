import {
  DELTA_ISSUE_CODES_V1,
  RenderWorld,
  RENDER_DELTA_SCHEMA_V1,
  WORLD_SCHEMA_V1,
  type DeltaApplyResultV1,
  type PresentationAbortSignalV1,
  type PresentationReadinessV1,
  type RenderDeltaV1,
  type RenderSnapshotV1,
} from 'voxel/core';
import {
  DensePaletteChunk,
  raycastDensePaletteChunks,
  type DensePaletteRaycastHit,
} from 'voxel/meshing';
import {
  createRendererLifecycleReferenceSnapshot,
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
} from 'voxel/testing';

const chunk = new DensePaletteChunk({
  origin: { x: 0, y: 0, z: 0 },
  size: { x: 1, y: 1, z: 1 },
});
const hit: DensePaletteRaycastHit | null = raycastDensePaletteChunks({
  origin: { x: -1, y: 0.5, z: 0.5 },
  direction: { x: 1, y: 0, z: 0 },
  maxDistance: 2,
  chunkSize: chunk.size,
  getChunk: (x, y, z) => x === 0 && y === 0 && z === 0 ? chunk : undefined,
});
const snapshot: RenderSnapshotV1 = createRendererLifecycleReferenceSnapshot({ revision: 1 });
const world = new RenderWorld();
world.acceptSnapshot(snapshot);
const portableSignal: PresentationAbortSignalV1 = {
  aborted: false,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};
const readiness: PresentationReadinessV1 = world.presentationReadiness({
  worldId: snapshot.descriptor.worldId,
  epoch: snapshot.descriptor.epoch,
  revision: snapshot.revision,
});
const presentationWait = world.awaitPresented({
  worldId: snapshot.descriptor.worldId,
  epoch: snapshot.descriptor.epoch,
  revision: snapshot.revision,
}, { signal: portableSignal });
const ownership = readRenderWorldOwnershipMetricsForTesting(world);
resetRenderWorldOwnershipMetricsForTesting(world);

const delta: RenderDeltaV1 = {
  schemaVersion: RENDER_DELTA_SCHEMA_V1,
  worldId: snapshot.descriptor.worldId,
  epoch: snapshot.descriptor.epoch,
  baseRevision: 1,
  revision: 2,
  operations: [],
};

function classifyDeltaResult(result: DeltaApplyResultV1): string {
  switch (result.status) {
    case 'accepted':
      return `${result.epoch}:${String(result.revision)}`;
    case 'rejected':
      return `${result.code}:${result.path}`;
    case 'resync-required':
      return `${result.reason}:${String(result.expected?.revision ?? 'none')}`;
    default: {
      const exhaustive: never = result;
      return String(exhaustive);
    }
  }
}

void [
  WORLD_SCHEMA_V1,
  hit,
  ownership,
  readiness,
  presentationWait,
  delta,
  classifyDeltaResult,
  DELTA_ISSUE_CODES_V1.REVISION_ORDER,
];
