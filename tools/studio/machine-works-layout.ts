/**
 * Authored world layout shared by the Machine Works scene and its consumer
 * fixture. These are presentation positions, not a simulation API: the
 * consumer still derives and validates physical body and port coordinates
 * from the exact sidecars before it advances Rapier.
 */
import {
  MACHINE_WORKS_CONVEYOR_V1,
  machineWorksDrumSceneFloorV1,
} from './machine-works-conveyor.js';

export const MACHINE_WORKS_SCENE_LAYOUT_V1 = Object.freeze({
  foundation: Object.freeze({
    at: Object.freeze([-2.9, 0, 0] as const),
    grain: 1.8,
    sizeVoxels: Object.freeze([31, 5, 11] as const),
  }),
  pressBridge: Object.freeze({
    at: Object.freeze([0, 9, 5.8] as const),
    grain: 1.2,
    sizeVoxels: Object.freeze([25, 20, 6] as const),
    guideTowers: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([0, 0, 0] as const),
        sizeVoxels: Object.freeze([5, 15, 6] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([20, 0, 0] as const),
        sizeVoxels: Object.freeze([5, 15, 6] as const),
      }),
    }),
    guideRails: Object.freeze({
      coreWest: Object.freeze({
        atVoxels: Object.freeze([4, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      coreEast: Object.freeze({
        atVoxels: Object.freeze([7, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      capWest: Object.freeze({
        atVoxels: Object.freeze([17, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      capEast: Object.freeze({
        atVoxels: Object.freeze([20, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
    }),
    loadBeam: Object.freeze({
      atVoxels: Object.freeze([4, 15, 0] as const),
      sizeVoxels: Object.freeze([17, 2, 3] as const),
    }),
    actuatorSpines: Object.freeze({
      core: Object.freeze({
        atVoxels: Object.freeze([5, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      cap: Object.freeze({
        atVoxels: Object.freeze([19, 0, 0] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
    }),
    servoHousings: Object.freeze({
      core: Object.freeze({
        atVoxels: Object.freeze([4, 17, 0] as const),
        sizeVoxels: Object.freeze([4, 3, 4] as const),
      }),
      cap: Object.freeze({
        atVoxels: Object.freeze([17, 17, 0] as const),
        sizeVoxels: Object.freeze([4, 3, 4] as const),
      }),
    }),
    powerBus: Object.freeze({
      atVoxels: Object.freeze([8, 19, 3] as const),
      sizeVoxels: Object.freeze([9, 1, 1] as const),
    }),
    staticNonColliding: true,
  }),
  bucket: Object.freeze({
    at: Object.freeze([32.5, 0, 0] as const),
    grain: 1,
    sizeVoxels: Object.freeze([15, 10, 13] as const),
  }),
  outputDock: Object.freeze({
    at: Object.freeze([
      MACHINE_WORKS_CONVEYOR_V1.rightAxleX + 2.8,
      9,
      0,
    ] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([9, 9, 31] as const),
    minimumBeltAxialClearance: 0.5,
    minimumSweptClearance: 0.14,
  }),
  carriage: Object.freeze({
    at: Object.freeze([-20, 9, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([15, 6, 23] as const),
  }),
  conveyor: Object.freeze({
    slat: Object.freeze({
      grain: MACHINE_WORKS_CONVEYOR_V1.slatGrain,
      sizeVoxels: MACHINE_WORKS_CONVEYOR_V1.slatSizeVoxels,
    }),
    westDrum: Object.freeze({
      at: machineWorksDrumSceneFloorV1('west'),
      grain: MACHINE_WORKS_CONVEYOR_V1.drumGrain,
      sizeVoxels: MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels,
    }),
    eastDrum: Object.freeze({
      at: machineWorksDrumSceneFloorV1('east'),
      grain: MACHINE_WORKS_CONVEYOR_V1.drumGrain,
      sizeVoxels: MACHINE_WORKS_CONVEYOR_V1.drumSizeVoxels,
    }),
  }),
  coreHead: Object.freeze({
    at: Object.freeze([-8.2, 19, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([13, 18, 21] as const),
  }),
  capHead: Object.freeze({
    at: Object.freeze([8.2, 19.3, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([13, 18, 21] as const),
  }),
  headAlignmentPads: Object.freeze({
    west: Object.freeze({
      atVoxels: Object.freeze([1, 8, 15] as const),
      sizeVoxels: Object.freeze([1, 2, 1] as const),
    }),
    east: Object.freeze({
      atVoxels: Object.freeze([11, 8, 15] as const),
      sizeVoxels: Object.freeze([1, 2, 1] as const),
    }),
  }),
  headActuatorYoke: Object.freeze({
    cavity: Object.freeze({
      atVoxels: Object.freeze([3, 8, 15] as const),
      sizeVoxels: Object.freeze([7, 2, 5] as const),
    }),
    minimumRunningClearance: 0.4,
    bars: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([2, 8, 15] as const),
        sizeVoxels: Object.freeze([1, 2, 6] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([10, 8, 15] as const),
        sizeVoxels: Object.freeze([1, 2, 6] as const),
      }),
      rear: Object.freeze({
        atVoxels: Object.freeze([3, 8, 20] as const),
        sizeVoxels: Object.freeze([7, 2, 1] as const),
      }),
    }),
  }),
  base: Object.freeze({
    at: Object.freeze([-20, 11.4, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 4, 11] as const),
  }),
  core: Object.freeze({
    at: Object.freeze([-8.2, 16.3, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([7, 10, 7] as const),
  }),
  cap: Object.freeze({
    at: Object.freeze([8.2, 17.8, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 5, 11] as const),
  }),
});
