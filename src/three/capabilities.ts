export const THREE_RUNTIME_CAPABILITIES_SCHEMA_V1 = 'voxel.three-capabilities/1' as const;

export interface ThreeRuntimeCapabilitiesV1 {
  readonly schemaVersion: typeof THREE_RUNTIME_CAPABILITIES_SCHEMA_V1;
  readonly renderSnapshotSchemas: readonly ['voxel.render-snapshot/1'];
  readonly renderDeltaSchemas: readonly ['voxel.render-delta/1'];
  readonly geometryTopologies: readonly ['triangles'];
  readonly voxelSurfaceModels: readonly ['opaque-visible-face-oracle'];
  readonly cameraModes: readonly [
    'isometric-orthographic',
    'perspective',
    'borrowed-camera',
  ];
  readonly hostModes: readonly ['runtime-rendered', 'embedded'];
  readonly rendererOwnership: readonly ['owned', 'borrowed'];
  readonly sceneOwnership: readonly ['owned', 'borrowed'];
  readonly viewportOwnership: readonly ['runtime', 'host'];
  readonly captureOwnership: readonly ['runtime', 'host'];
  /**
   * Lanes the committed pick path can answer. Executable only for worlds
   * presented through the worker pipeline — a descriptor with `chunkProfile`
   * on a runtime constructed with `voxelWorkers`; every other world reports
   * `no-presented-frame`. This is the backend's ceiling, not a per-instance
   * or per-world claim.
   */
  readonly pickingLanes: readonly ['voxel', 'instance'];
  /** Reachable through `ThreeRenderRuntimeOptions.voxelWorkers`; a runtime
   * constructed without it keeps the synchronous presentation path. */
  readonly workerMeshing: true;
  readonly revisionAwareCapture: true;
  readonly contextLoss: Readonly<{
    fenced: true;
    /** Restoration rebuilds renderer-owned GPU state from canonical CPU
     * state and reports running only after a successful draw acknowledges
     * the rebuilt scene, in standalone and embedded hosts alike. */
    restoration: 'full-reconstruction';
  }>;
  readonly alpha: Readonly<{
    voxelChunks: 'opaque-only';
    instanceColors: 'opaque-only';
    geometryMaterials: 'material-transparent-supported';
  }>;
  readonly testedThree: Readonly<{
    runtime: '>=0.185.1 <0.186.0';
    types: '>=0.185.0 <0.186.0';
  }>;
}

const THREE_RUNTIME_CAPABILITIES_V1: ThreeRuntimeCapabilitiesV1 = Object.freeze({
  schemaVersion: THREE_RUNTIME_CAPABILITIES_SCHEMA_V1,
  renderSnapshotSchemas: Object.freeze(['voxel.render-snapshot/1'] as const),
  renderDeltaSchemas: Object.freeze(['voxel.render-delta/1'] as const),
  geometryTopologies: Object.freeze(['triangles'] as const),
  voxelSurfaceModels: Object.freeze(['opaque-visible-face-oracle'] as const),
  cameraModes: Object.freeze([
    'isometric-orthographic',
    'perspective',
    'borrowed-camera',
  ] as const),
  hostModes: Object.freeze(['runtime-rendered', 'embedded'] as const),
  rendererOwnership: Object.freeze(['owned', 'borrowed'] as const),
  sceneOwnership: Object.freeze(['owned', 'borrowed'] as const),
  viewportOwnership: Object.freeze(['runtime', 'host'] as const),
  captureOwnership: Object.freeze(['runtime', 'host'] as const),
  // Reachable from `ThreeRenderRuntimeOptions.voxelWorkers` and proven end to
  // end in real Chromium: a packaged module worker meshes chunked worlds and a
  // WebGL2 draw commits each revision. For worlds presented through that
  // pipeline, picking reads the same presented bundle the canvas shows and
  // capture is fenced to the presented manifest, so all three describe one
  // revision rather than three different ones; worlds outside it — no
  // `chunkProfile`, or no `voxelWorkers` — report `no-presented-frame` from
  // the pick path.
  pickingLanes: Object.freeze(['voxel', 'instance'] as const),
  workerMeshing: true,
  revisionAwareCapture: true,
  contextLoss: Object.freeze({
    fenced: true,
    restoration: 'full-reconstruction',
  }),
  alpha: Object.freeze({
    voxelChunks: 'opaque-only',
    instanceColors: 'opaque-only',
    geometryMaterials: 'material-transparent-supported',
  }),
  testedThree: Object.freeze({
    runtime: '>=0.185.1 <0.186.0',
    types: '>=0.185.0 <0.186.0',
  }),
});

/** Returns the immutable capabilities actually implemented by voxel/three. */
export function getThreeRuntimeCapabilitiesV1(): ThreeRuntimeCapabilitiesV1 {
  return THREE_RUNTIME_CAPABILITIES_V1;
}
