import { describe, expect, it } from 'vitest';

import { getThreeRuntimeCapabilitiesV1 } from '../../src/three/capabilities.js';
import type { ThreeRenderRuntimeOptions } from '../../src/three/runtimeTypes.js';

describe('public voxel worker option', () => {
  it('is expressible with only public option types', () => {
    // A consumer configures worker meshing without reaching for any Internal
    // type. This is the whole point of the capability being advertised.
    const options: ThreeRenderRuntimeOptions = {
      width: 320,
      height: 200,
      voxelWorkers: { workerCount: 2 },
    };
    expect(options.voxelWorkers?.workerCount).toBe(2);
  });

  it('advertises what a public configuration can actually obtain', () => {
    const capabilities = getThreeRuntimeCapabilitiesV1();
    expect(capabilities.workerMeshing).toBe(true);
    expect(capabilities.pickingLanes).toEqual(['voxel', 'instance']);
    expect(capabilities.revisionAwareCapture).toBe(true);
  });
});
