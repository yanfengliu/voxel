import { describe, expect, it } from 'vitest';

import { getThreeRuntimeCapabilitiesV1 } from '../../src/three/index.js';

describe('Three runtime capabilities', () => {
  it('reports the implemented 0.1 backend surface without implying planned features', () => {
    const capabilities = getThreeRuntimeCapabilitiesV1();

    expect(capabilities).toEqual({
      schemaVersion: 'voxel.three-capabilities/1',
      renderSnapshotSchemas: ['voxel.render-snapshot/1'],
      renderDeltaSchemas: ['voxel.render-delta/1'],
      geometryTopologies: ['triangles'],
      voxelSurfaceModels: ['opaque-visible-face-oracle'],
      cameraModes: ['isometric-orthographic', 'perspective', 'borrowed-camera'],
      hostModes: ['runtime-rendered', 'embedded'],
      rendererOwnership: ['owned', 'borrowed'],
      sceneOwnership: ['owned', 'borrowed'],
      viewportOwnership: ['runtime', 'host'],
      captureOwnership: ['runtime', 'host'],
      pickingLanes: ['voxel', 'instance'],
      workerMeshing: true,
      revisionAwareCapture: true,
      contextLoss: {
        fenced: true,
        restoration: 'full-reconstruction',
      },
      alpha: {
        voxelChunks: 'opaque-only',
        instanceColors: 'opaque-only',
        geometryMaterials: 'material-transparent-supported',
      },
      testedThree: {
        runtime: '>=0.185.1 <0.186.0',
        types: '>=0.185.0 <0.186.0',
      },
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(Object.isFrozen(capabilities.contextLoss)).toBe(true);
    expect(Object.isFrozen(capabilities.geometryTopologies)).toBe(true);
  });

  it('returns one immutable process-wide description', () => {
    expect(getThreeRuntimeCapabilitiesV1()).toBe(getThreeRuntimeCapabilitiesV1());
  });
});
