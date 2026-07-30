/**
 * Authored world layout shared by the Machine Works scene and its consumer
 * fixture, in two frames. MACHINE_WORKS_PROCESS_LAYOUT_V1 is the recorded
 * process's own frame: the consumer fixture simulates and validates there, so
 * the committed trace and its hashes never depend on how the scene presents.
 * MACHINE_WORKS_SCENE_LAYOUT_V1 is what the scene draws: the same layout with
 * the still machinery settled just below the recorded process.
 */
import {
  MACHINE_WORKS_CONVEYOR_V1,
  machineWorksDrumSceneFloorV1,
} from './machine-works-conveyor.js';

/**
 * How far the drawn still machinery sits below the recorded process, in world
 * units.
 *
 * The recorded conveyor slats top out at exactly y = 9, and the foundation's
 * bridge-pad tops used to land on that same plane — two same-facing surfaces
 * on one plane, so the picture flickered between them at both tower feet (the
 * owner's pinned request 2026-07-30T00-21-35-915Z-002, "I see these weird
 * surfaces where different models compete for visibility again"). The drawn
 * foundation and press bridge settle by this amount together, so every
 * still-on-still landing stays exactly flush
 * while no still face can share a plane with the recorded process: 0.02 is
 * off every recorded grain lattice (0.25, 0.3, 0.4, 0.5), two hundred times
 * the float32 depth-collapse distance the surface-fight check guards (1e-4),
 * and under a pixel at the scene's viewing sizes. The output dock cannot
 * settle — its bearing bores hold the recorded carrier's trunnion axis — so
 * it keeps the process height and stands the settle above the drawn guards.
 * sceneSurfaceFightsV1 pins that no coincidence comes back.
 */
export const MACHINE_WORKS_STILL_SETTLE_V1 = 0.02;

export const MACHINE_WORKS_PROCESS_LAYOUT_V1 = Object.freeze({
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

/**
 * What the scene draws: the process layout with the still foundation and
 * press bridge settled together just below the recorded process, so their
 * exact flush landing on each other survives while no still face shares a
 * rendered plane with a recorded one. The output dock stays at the process
 * height because its bearing bores hold the recorded carrier's trunnion axis;
 * it stands the settle above the drawn guards. Replay-driven placements keep
 * their process positions — the recorded tracks pose them anyway.
 */
export const MACHINE_WORKS_SCENE_LAYOUT_V1 = Object.freeze({
  ...MACHINE_WORKS_PROCESS_LAYOUT_V1,
  foundation: Object.freeze({
    ...MACHINE_WORKS_PROCESS_LAYOUT_V1.foundation,
    at: Object.freeze([
      MACHINE_WORKS_PROCESS_LAYOUT_V1.foundation.at[0],
      MACHINE_WORKS_PROCESS_LAYOUT_V1.foundation.at[1] - MACHINE_WORKS_STILL_SETTLE_V1,
      MACHINE_WORKS_PROCESS_LAYOUT_V1.foundation.at[2],
    ] as const),
  }),
  pressBridge: Object.freeze({
    ...MACHINE_WORKS_PROCESS_LAYOUT_V1.pressBridge,
    at: Object.freeze([
      MACHINE_WORKS_PROCESS_LAYOUT_V1.pressBridge.at[0],
      MACHINE_WORKS_PROCESS_LAYOUT_V1.pressBridge.at[1] - MACHINE_WORKS_STILL_SETTLE_V1,
      MACHINE_WORKS_PROCESS_LAYOUT_V1.pressBridge.at[2],
    ] as const),
  }),
});
