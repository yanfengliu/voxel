/**
 * Authored world layout shared by the Machine Works scene and its consumer
 * fixture. These are presentation positions, not a simulation API: the
 * consumer still derives and validates physical body and port coordinates
 * from the exact sidecars before it advances Rapier.
 *
 * The scene draws exactly the frame the fixture simulates and validates.
 * An earlier revision drew the still machinery settled 0.02 below the
 * recorded process (`MACHINE_WORKS_STILL_SETTLE_V1`) because the foundation's
 * bridge pads topped out on the recorded slat plane and fought for
 * visibility (the owner's pinned request 2026-07-30T00-21-35-915Z-002). This
 * layout removes that coincidence at its source — no still solid now stands
 * inside the moving belt band — so the settle and the two-frame split it
 * required are gone, and sceneSurfaceFightsV1 pins the scene at zero
 * coincident same-facing planes across its sampled recorded poses.
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
  /**
   * The bridge stands behind the belt band: its rail-front plane at z = 5.8
   * keeps the whole front tower row (z 5.8..7.0) clear of the slat band
   * (|z| <= 3.25) and of the carrier's widest part (|z| <= 4.6), while the
   * rear tower row (z 8.2..9.4) still lands on the foundation. The stator
   * blades hang from the load beam one voxel in front of that plane, over
   * the head stroke only, so the moving C-yokes wrap them without ever
   * entering the rail columns or the carrier lane below.
   */
  pressBridge: Object.freeze({
    at: Object.freeze([0, 9, 7] as const),
    grain: 1.2,
    sizeVoxels: Object.freeze([25, 20, 6] as const),
    guideTowers: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([0, 0, 2] as const),
        sizeVoxels: Object.freeze([5, 15, 3] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([20, 0, 2] as const),
        sizeVoxels: Object.freeze([5, 15, 3] as const),
      }),
    }),
    guideRails: Object.freeze({
      coreWest: Object.freeze({
        atVoxels: Object.freeze([4, 0, 2] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      coreEast: Object.freeze({
        atVoxels: Object.freeze([7, 0, 2] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      capWest: Object.freeze({
        atVoxels: Object.freeze([17, 0, 2] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
      capEast: Object.freeze({
        atVoxels: Object.freeze([20, 0, 2] as const),
        sizeVoxels: Object.freeze([1, 15, 1] as const),
      }),
    }),
    loadBeam: Object.freeze({
      atVoxels: Object.freeze([4, 15, 0] as const),
      sizeVoxels: Object.freeze([17, 2, 3] as const),
    }),
    actuatorSpines: Object.freeze({
      core: Object.freeze({
        atVoxels: Object.freeze([5, 7, 0] as const),
        sizeVoxels: Object.freeze([1, 8, 1] as const),
      }),
      cap: Object.freeze({
        atVoxels: Object.freeze([19, 7, 0] as const),
        sizeVoxels: Object.freeze([1, 8, 1] as const),
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
  /**
   * The docked carrier's east face stops exactly this far west of the
   * bucket's painted west face; the tip sweep carries the product across
   * that declared approach gap into the open mouth.
   */
  bucket: Object.freeze({
    at: Object.freeze([32.5, 0, 0] as const),
    grain: 1,
    sizeVoxels: Object.freeze([13, 10, 13] as const),
    carrierApproachGap: 1,
  }),
  /**
   * `at` places the painted content: its center sits 0.4 west of the
   * bearing-bore axis and 0.6 south of the bore midpoint, so the pivot-axis
   * port lands exactly on the carrier trunnion line (24.8, 10.2) while the
   * drawn east face stops at 25.8 — 0.2 clear of the bucket's painted west
   * face at 26.0.
   */
  outputDock: Object.freeze({
    at: Object.freeze([
      MACHINE_WORKS_CONVEYOR_V1.rightAxleX + 2.4,
      9,
      0.6,
    ] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([7, 6, 28] as const),
    minimumBeltAxialClearance: 0.5,
    minimumSweptClearance: 0.14,
  }),
  carriage: Object.freeze({
    at: Object.freeze([-20, 9, 0] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([15, 5, 23] as const),
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
  /**
   * The heads stand at z = 2.2 so their pickup plates (the front seven voxel
   * layers) stay centered over the product line at z = 0 while their rear
   * alignment pads reach back to the bridge's rail-front plane at z = 5.8
   * and their C-yokes wrap the stator blades hanging in front of it.
   */
  coreHead: Object.freeze({
    at: Object.freeze([-8.2, 19, 2.2] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([11, 18, 18] as const),
  }),
  capHead: Object.freeze({
    at: Object.freeze([8.2, 19.3, 2.2] as const),
    grain: 0.4,
    sizeVoxels: Object.freeze([11, 18, 18] as const),
  }),
  headAlignmentPads: Object.freeze({
    west: Object.freeze({
      atVoxels: Object.freeze([0, 8, 16] as const),
      sizeVoxels: Object.freeze([1, 2, 2] as const),
    }),
    east: Object.freeze({
      atVoxels: Object.freeze([10, 8, 16] as const),
      sizeVoxels: Object.freeze([1, 2, 2] as const),
    }),
  }),
  headActuatorYoke: Object.freeze({
    cavity: Object.freeze({
      atVoxels: Object.freeze([2, 8, 11] as const),
      sizeVoxels: Object.freeze([7, 2, 5] as const),
    }),
    minimumRunningClearance: 0.4,
    bars: Object.freeze({
      west: Object.freeze({
        atVoxels: Object.freeze([1, 8, 11] as const),
        sizeVoxels: Object.freeze([1, 2, 6] as const),
      }),
      east: Object.freeze({
        atVoxels: Object.freeze([9, 8, 11] as const),
        sizeVoxels: Object.freeze([1, 2, 6] as const),
      }),
      rear: Object.freeze({
        atVoxels: Object.freeze([2, 8, 16] as const),
        sizeVoxels: Object.freeze([7, 2, 1] as const),
      }),
    }),
  }),
  /** The base rests directly on the carrier deck: bottom face at y = 11.0. */
  base: Object.freeze({
    at: Object.freeze([-20, 11, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 4, 11] as const),
  }),
  core: Object.freeze({
    at: Object.freeze([-8.2, 16.3, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([7, 9, 7] as const),
  }),
  cap: Object.freeze({
    at: Object.freeze([8.2, 17.8, 0] as const),
    grain: 0.3,
    sizeVoxels: Object.freeze([11, 5, 11] as const),
  }),
});
