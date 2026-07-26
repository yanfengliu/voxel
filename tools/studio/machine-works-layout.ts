/**
 * Authored world layout shared by the Machine Works scene and its consumer
 * fixture. These are presentation positions, not a simulation API: the
 * consumer still derives and validates physical body and port coordinates
 * from the exact sidecars before it advances Rapier.
 */
export const MACHINE_WORKS_SCENE_LAYOUT_V1 = Object.freeze({
  foundation: Object.freeze({
    at: Object.freeze([-2.9, 0, 0] as const),
    grain: 1.8,
    sizeVoxels: Object.freeze([31, 5, 11] as const),
  }),
  gantry: Object.freeze({
    at: Object.freeze([0, 9, 7.6] as const),
    grain: 1.2,
    sizeVoxels: Object.freeze([25, 20, 9] as const),
    guideTowers: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([0, 0, 0] as const),
        sizeVoxels: Object.freeze([5, 15, 9] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([20, 0, 0] as const),
        sizeVoxels: Object.freeze([5, 15, 9] as const),
      }),
    }),
    guideRails: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([4, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([20, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
    }),
    lowerChord: Object.freeze({
      atVoxels: Object.freeze([4, 14, 3] as const),
      sizeVoxels: Object.freeze([17, 1, 3] as const),
    }),
    staticNonColliding: true,
  }),
  bucket: Object.freeze({
    at: Object.freeze([32.5, 0, 0] as const),
    grain: 1,
    sizeVoxels: Object.freeze([15, 10, 13] as const),
  }),
  carriage: Object.freeze({
    at: Object.freeze([-20, 9, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([15, 6, 11] as const),
  }),
  coreHead: Object.freeze({
    at: Object.freeze([-8, 19.3, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([13, 18, 11] as const),
  }),
  capHead: Object.freeze({
    at: Object.freeze([8, 19.3, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([13, 18, 11] as const),
  }),
  headGuideShoes: Object.freeze({
    west: Object.freeze({
      atVoxels: Object.freeze([1, 8, 10] as const),
      sizeVoxels: Object.freeze([1, 2, 1] as const),
    }),
    east: Object.freeze({
      atVoxels: Object.freeze([11, 8, 10] as const),
      sizeVoxels: Object.freeze([1, 2, 1] as const),
    }),
  }),
  base: Object.freeze({
    at: Object.freeze([-20, 11.4, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 4, 11] as const),
  }),
  core: Object.freeze({
    at: Object.freeze([-8, 16.3, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([7, 10, 7] as const),
  }),
  cap: Object.freeze({
    at: Object.freeze([8, 17.8, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 5, 11] as const),
  }),
});
