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
  readonly pickingLanes: readonly [];
  readonly workerMeshing: false;
  readonly revisionAwareCapture: false;
  readonly contextLoss: Readonly<{
    fenced: true;
    restoration: 'event-resize-only';
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
  // Worker meshing and committed picking are implemented and proven in a real
  // browser, but they are reachable only through the package-internal voxel
  // worker option. No public configuration can obtain them, so advertising
  // them would promise support a consumer cannot enable. Both flip together
  // when that option becomes public; every gate that blocked it now holds
  // (embedded host frame tickets, the V-09/V-10 selection and culling
  // evidence, and the E-04 edit-storm endurance baseline), so publishing the
  // option is the only remaining step.
  pickingLanes: Object.freeze([] as const),
  workerMeshing: false,
  revisionAwareCapture: false,
  contextLoss: Object.freeze({
    fenced: true,
    restoration: 'event-resize-only',
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
