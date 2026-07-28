import {
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_EXPOSED_COGS_V1,
} from './machine-works-conveyor.js';
import type { PartSettingsV1 } from './recipe.js';

/**
 * Creator-local design intent for Machine Works. This is not a renderer or
 * solver contract: it records why each visible placement exists, where it must
 * meet the rest of the machine, and what truth would be lost by removing it.
 */

export const MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID = 'assembly-press-bridge';
export const MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID = 'studio:machine-works:press-bridge';
export const MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID = 'assembly-output-dock';
export const MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID = 'studio:machine-works:output-dock';

export type MachineWorksRelationshipVerbV1 =
  | 'supports'
  | 'anchors'
  | 'anchored-by'
  | 'aligns'
  | 'aligned-by'
  | 'engages'
  | 'guides'
  | 'guided-by'
  | 'carries'
  | 'turns'
  | 'wraps'
  | 'contacts'
  | 'locates'
  | 'holds'
  | 'mates'
  | 'bounds'
  | 'routes-service-to'
  | 'tips-into'
  | 'receives'
  | 'witnesses';

export interface MachineWorksMechanicalRelationshipV1 {
  readonly verb: MachineWorksRelationshipVerbV1;
  readonly object: string;
  readonly evidence: string;
}

export interface MachineWorksLocationDatumV1 {
  readonly frame: 'scene-world' | 'conveyor-path' | 'named-ports';
  readonly anchor: string;
  readonly reason: string;
}

export interface MachineWorksPurposeEntryV1 {
  readonly category: string;
  readonly placementIds: readonly string[];
  readonly recipeId: string;
  readonly purpose: string;
  readonly locationDatum: MachineWorksLocationDatumV1;
  readonly removalConsequence: string;
  readonly mechanicalRelationships: readonly MachineWorksMechanicalRelationshipV1[];
}

const entry = (value: MachineWorksPurposeEntryV1): MachineWorksPurposeEntryV1 =>
  Object.freeze({
    ...value,
    placementIds: Object.freeze([...value.placementIds]),
    locationDatum: Object.freeze({ ...value.locationDatum }),
    mechanicalRelationships: Object.freeze(value.mechanicalRelationships.map(
      (relationship) => Object.freeze({ ...relationship }),
    )),
  });

export type MachineWorksFeaturePurposeIdV1 = `machine-works:feature-purpose:${string}`;
export interface MachineWorksPurposeStepV1 {
  readonly kind: 'part';
  readonly part: string; readonly at: readonly [number, number, number];
  readonly settings: PartSettingsV1;
}
export interface MachineWorksFeaturePurposeV1 {
  readonly id: MachineWorksFeaturePurposeIdV1; readonly recipeId: string;
  readonly steps: readonly MachineWorksPurposeStepV1[];
  readonly purpose: string; readonly removalConsequence: string;
  readonly mechanicalRelationship: MachineWorksMechanicalRelationshipV1;
}
const boxPurposeStep = (
  at: readonly [number, number, number],
  size: readonly [number, number, number], role: string,
): MachineWorksPurposeStepV1 => Object.freeze({
  kind: 'part',
  part: 'box',
  at: Object.freeze([at[0], at[1], at[2]] as const),
  settings: Object.freeze({ sizeX: size[0], sizeY: size[1], sizeZ: size[2], role }),
});

const featurePurpose = (value: MachineWorksFeaturePurposeV1): MachineWorksFeaturePurposeV1 => Object.freeze({
  ...value,
  steps: Object.freeze([...value.steps]),
  mechanicalRelationship: Object.freeze({ ...value.mechanicalRelationship }),
});

export const MACHINE_WORKS_PURPOSE_MAP_V1: readonly MachineWorksPurposeEntryV1[] =
  Object.freeze([
    entry({
      category: 'conveyor-foundation',
      placementIds: ['assembly-foundation'],
      recipeId: 'studio:machine-works:rail-foundation',
      purpose: 'Carries the stationary machine loads, bounds the moving belt return, and provides the common support plane that makes the conveyor and press stations one machine.',
      locationDatum: {
        frame: 'scene-world',
        anchor: 'foundation.at with its top face meeting the press-bridge feet and its belt-entry and belt-exit ports enclosing both drum turns',
        reason: 'The visible support chain must terminate at one grounded datum instead of leaving machinery floating.',
      },
      removalConsequence: 'The belt, drums, carrier, and press bridge lose their visible load path and common alignment datum; the remaining scene reads as disconnected floating machinery.',
      mechanicalRelationships: [
        {
          verb: 'supports',
          object: MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
          evidence: 'Four named bridge-foot ports terminate on four occupied foundation mounting-pad top faces.',
        },
        {
          verb: 'anchors',
          object: 'belt-drive-west, belt-drive-east, and the closed slat path',
          evidence: 'The authored belt entry and exit datums bound both drum turns and the return run.',
        },
        {
          verb: 'supports',
          object: MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
          evidence: 'Two broad dock plinths terminate on the output end of the common foundation datum.',
        },
      ],
    }),
    entry({
      category: 'conveyor-drive-drums',
      placementIds: ['belt-drive-west', 'belt-drive-east'],
      recipeId: 'studio:machine-works:drive-drum',
      purpose: 'Turns the articulated slat path around two exact axle datums while exposing the shared controller phase at both ends of the conveyor.',
      locationDatum: {
        frame: 'conveyor-path',
        anchor: 'leftAxleX or rightAxleX at axleY, centered across the slat contact width',
        reason: 'The drum pitch datum must meet the slat underside and close the upper and return runs without a hidden reversal.',
      },
      removalConsequence: 'The belt no longer has a visible closed path or a credible end turn, so carrier motion appears prescribed in open space even though the replay can still move it.',
      mechanicalRelationships: [
        {
          verb: 'turns',
          object: 'conveyor-slats',
          evidence: 'Drum and slat poses share one hashed drive phase and exact pitch geometry; this is not a torque-transmission claim.',
        },
        {
          verb: 'witnesses',
          object: 'belt controller phase',
          evidence: 'Off-axis face keys make rotation visible at both axle datums.',
        },
      ],
    }),
    entry({
      category: 'exposed-drive-phase-flags',
      placementIds: MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id),
      recipeId: 'studio:machine-works:drive-cog',
      purpose: 'Makes each otherwise partly hidden drum angle readable from the exterior with one minimal non-interacting radial phase flag.',
      locationDatum: {
        frame: 'conveyor-path',
        anchor: 'the matching west or east solved-drum axle, at the authored near or far exterior z plane',
        reason: 'A phase witness is meaningful only when it is coaxial with the drum pose it copies.',
      },
      removalConsequence: 'The solver outcome and belt transport remain unchanged, but exterior confirmation that both drum ends share the recorded phase is lost.',
      mechanicalRelationships: [
        {
          verb: 'witnesses',
          object: 'belt-drive-west or belt-drive-east',
          evidence: 'Each hub-and-radial-flag indicator copies its matching solved-drum pose outside Rapier and never transmits contact or torque.',
        },
      ],
    }),
    entry({
      category: 'conveyor-slats',
      placementIds: MACHINE_WORKS_CONVEYOR_SLAT_IDS,
      recipeId: 'studio:machine-works:conveyor-slat',
      purpose: 'Forms the continuous moving friction surface that supports and transports the transfer carriage around the closed conveyor path.',
      locationDatum: {
        frame: 'conveyor-path',
        anchor: 'closed centerline distance equal to drive travel plus slat index multiplied by the canonical slat pitch',
        reason: 'Closely pitched bodies must preserve the top contact plane and bounded straight and turn gaps throughout the replay.',
      },
      removalConsequence: 'A missing slat opens the visible and physical transport surface, invalidating the continuous carrier-contact explanation and its causal friction evidence.',
      mechanicalRelationships: [
        {
          verb: 'contacts',
          object: 'assembly-carriage',
          evidence: 'Rapier contact and friction between slat colliders and the carrier runners produce the retained transport trace.',
        },
        {
          verb: 'wraps',
          object: 'belt-drive-west and belt-drive-east',
          evidence: 'Each slat follows the same closed phase around the two authored drum pitch datums.',
        },
      ],
    }),
    entry({
      category: 'assembly-press-bridge',
      placementIds: [MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID],
      recipeId: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
      purpose: 'Presents a bounded kinematic actuation study for both insertion tools through four foundation feet, two towers, one load beam, and fixed stator spines inside disjoint moving C-yokes; its cabinet and face-connected bus identify the external service source.',
      locationDatum: {
        frame: 'scene-world',
        anchor: 'four named feet on occupied foundation pads, with stator spines and alignment faces centered at coreStationX and capStationX behind the carrier centerline',
        reason: 'The commanded head strokes need a continuous visible reaction path to the machine base and fixed stations that agree with their mating axes.',
      },
      removalConsequence: 'Both heads lose the visible stator engagement and intended grounded reaction path for insertion; the consumer could still replay their kinematic poses, but the machine would no longer explain those poses.',
      mechanicalRelationships: [
        {
          verb: 'anchored-by',
          object: 'assembly-foundation',
          evidence: 'Each of four sidecar foot ports meets the top face of a distinct occupied foundation mounting pad.',
        },
        {
          verb: 'engages',
          object: 'core-head and cap-head kinematic yokes',
          evidence: 'The towers and beam carry two fixed stator spines through empty three-sided yoke cavities; exact swept bounds prove the occupied stator and yoke bars never overlap, but no captive constraint is claimed.',
        },
        {
          verb: 'aligns',
          object: 'core-head and cap-head',
          evidence: 'Named rear pads remain tangent to their corresponding straight visual datum faces throughout each swept pose; no captive constraint is claimed.',
        },
        {
          verb: 'routes-service-to',
          object: 'core-servo-housing and cap-servo-housing',
          evidence: 'Exact face contacts join the cabinet, straight overhead bus, both fixed servo housings, load beam, and stator spines; the route ends at the stator/yoke coupling and claims no electrical simulation.',
        },
      ],
    }),
    entry({
      category: 'output-trunnion-dock',
      placementIds: [MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID],
      recipeId: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
      purpose: 'Carries the widened carrier trunnion in two foundation-contacting C-shaped bearing cradles outside the moving belt and exposes the face-coupled position-servo housing and service conduit that explain the prescribed tipping axis.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'near/far bearing bores on the trunnion ports plus coincident servo-drive-face and servo-output at the bucket-boundary pivot',
        reason: 'The rotary axis needs visible support beyond both belt edges, occupied foundation contact, and an unbroken actuation path before the carrier may tip.',
      },
      removalConsequence: 'The carrier again appears to rotate in free space with no visible bearings, grounded reaction path, or actuation source.',
      mechanicalRelationships: [
        {
          verb: 'anchored-by',
          object: 'assembly-foundation',
          evidence: 'Both outboard bearing beds and the servo foot terminate on occupied foundation guard top faces, stay at least 0.5 world units outside the belt sweep, and remain disjoint from the bucket.',
        },
        {
          verb: 'engages',
          object: 'assembly-carriage',
          evidence: 'The widened axle is the only carrier solid sharing the bearing axial slabs; a continuous live-pose envelope proves at least 0.14 world units of clearance through the full prescribed quarter-turn.',
        },
        {
          verb: 'routes-service-to',
          object: 'outboard rotary position servo',
          evidence: 'The external conduit reaches a grounded servo housing whose safety-colored output coupler face-contacts the carrier trunnion end.',
        },
      ],
    }),
    entry({
      category: 'collection-bucket',
      placementIds: ['collection-bucket'],
      recipeId: 'studio:machine-works:collection-bucket',
      purpose: 'Contains the released assembled product after the output carrier tips it under gravity.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'bucket interior sensor immediately beyond the output-dock trunnion axis and below the released product trajectory',
        reason: 'The receiver must begin at the output boundary and contain the product rather than merely sit nearby.',
      },
      removalConsequence: 'The assembly has no terminal receiver or containment evidence, so the process ends in an unexplained fall.',
      mechanicalRelationships: [
        {
          verb: 'receives',
          object: 'product-base compound assembly',
          evidence: 'Collection is recorded only after the settled product remains inside the declared bucket sensor tolerance.',
        },
      ],
    }),
    entry({
      category: 'transfer-carriage',
      placementIds: ['assembly-carriage'],
      recipeId: 'studio:machine-works:transfer-carriage',
      purpose: 'Couples belt friction to the workpiece, locates the base under both insertion stations, and carries a chassis-backed transverse trunnion axle beyond both belt edges into the controlled output dock.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'runner undersides on the slat top plane, load port under the product-base mount, and near/far trunnion ports on the output-dock bearing axis',
        reason: 'Transport, assembly alignment, and release must share one retained carrier body without a hidden positional handoff.',
      },
      removalConsequence: 'The belt cannot carry or station the workpiece and the output loses its prescribed tipping motion, breaking the process between source and bucket.',
      mechanicalRelationships: [
        {
          verb: 'carries',
          object: 'product-base compound assembly',
          evidence: 'A validated fixed joint holds the base at the carrier load port until the release event.',
        },
        {
          verb: 'contacts',
          object: 'conveyor-slats',
          evidence: 'Its broad runners receive the simulated frictional transport force.',
        },
        {
          verb: 'tips-into',
          object: 'collection-bucket',
          evidence: 'The output servo begins only after the live trunnion clears both dock bearings and its end face meets the visible coupler, then prescribes rotation about that common axis; no revolute constraint or actuator torque is claimed.',
        },
      ],
    }),
    entry({
      category: 'insertion-heads',
      placementIds: ['core-head', 'cap-head'],
      recipeId: 'studio:machine-works:insertion-head',
      purpose: 'Carries one preloaded component on a contacting energized magnetic pickup face supplied by a precharged head-local buffer, uses orange moving C-yoke faces to expose the pinch boundary around the cream fixed stator spine, follows a prescribed vertical stroke to the keyed insertion datum, and retracts after release.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'coreStationX or capStationX with the pickup face aligned to the component datum, actuator yoke around the matching stator spine, and rear pads on the matching alignment faces',
        reason: 'The tooling, carried part, product socket, support spine, and alignment datums must remain on one insertion axis.',
      },
      removalConsequence: 'Core or cap delivery loses its visible tool and insertion stroke; the attachment event would become an unexplained state change on the carrier.',
      mechanicalRelationships: [
        {
          verb: 'engages',
          object: MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
          evidence: 'The cream fixed-stator cross-section remains inside an empty swept C-yoke cavity while the two orange side cheeks and orange rear bar remain outside the stator volume and identify the moving pinch boundary.',
        },
        {
          verb: 'aligned-by',
          object: 'the two straight rear datum faces',
          evidence: 'The named rear pads remain tangent to the matching bridge faces as visual alignment evidence, not as a solved captive constraint.',
        },
        {
          verb: 'holds',
          object: 'product-core or product-cap',
          evidence: 'The trace starts with each component outer face touching and fixed to the magnetic pickup plate; a face-connected local buffer and ram conduit explain the preloaded hold without simulating charging, current, magnetic force, or jaw closure.',
        },
        {
          verb: 'carries',
          object: 'the preloaded product-core or product-cap to the product-base compound assembly',
          evidence: 'Release occurs only after named mating frames satisfy position, orientation, speed, and dwell requirements and the two-voxel key enters empty socket clearance.',
        },
      ],
    }),
    entry({
      category: 'product-base',
      placementIds: ['product-base'],
      recipeId: 'studio:machine-works:product-base',
      purpose: 'Provides the carrier-mounted receiver and named socket that establish the coordinate frame for the two-stage product assembly.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'carriage load port at entry, with the core socket centered on the two insertion-station axes in sequence',
        reason: 'Every later component and the final released compound must inherit one continuous base pose.',
      },
      removalConsequence: 'There is no workpiece receiver, no common compound body, and no object that can pass through assembly, release, contact, and collection.',
      mechanicalRelationships: [
        {
          verb: 'locates',
          object: 'product-core',
          evidence: 'Its core socket provides empty clearance for the two-voxel core stem before the consumer creates the compound weld.',
        },
        {
          verb: 'carries',
          object: 'product-core and product-cap after attachment',
          evidence: 'After validated keyed insertion, component colliders are merged onto the retained base body as an explicit software compound weld.',
        },
      ],
    }),
    entry({
      category: 'product-core',
      placementIds: ['product-core'],
      recipeId: 'studio:machine-works:product-core',
      purpose: 'Forms the middle structural component, inserts its two-voxel stem into the base, and leaves two vertical insertion layers plus lateral assembly clearance and a top seating plane for the cap.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'preloaded core-head pickup face at rest, then base core-socket at the first station',
        reason: 'The same component pose must transition from head-held to base-carried without an unvalidated alignment snap.',
      },
      removalConsequence: 'The first station performs no assembly and the cap loses its declared receiving socket, so the three-piece product cannot exist.',
      mechanicalRelationships: [
        {
          verb: 'mates',
          object: 'product-base',
          evidence: 'The core stem occupies two empty base-socket layers without overlapping the base before its colliders join the compound.',
        },
        {
          verb: 'locates',
          object: 'product-cap',
          evidence: 'Its shortened center leaves two empty insertion layers; the commanded head supplies lateral alignment through one-voxel clearance and the cap crown meets the core top plane as the vertical stop.',
        },
      ],
    }),
    entry({
      category: 'product-cap',
      placementIds: ['product-cap'],
      recipeId: 'studio:machine-works:product-cap',
      purpose: 'Completes the assembly by inserting its two-voxel underside key through deliberate lateral clearance until its crown seats on the core, then remaining part of the software-welded compound through collection.',
      locationDatum: {
        frame: 'named-ports',
        anchor: 'preloaded cap-head pickup face at rest, then core cap-socket at the second station',
        reason: 'The final component must visibly terminate the assembly sequence before the carrier advances to output.',
      },
      removalConsequence: 'The second station has no operation and the assembled event no longer represents the declared three-piece product.',
      mechanicalRelationships: [
        {
          verb: 'mates',
          object: 'product-core',
          evidence: 'The cap key occupies core layers seven and eight without overlap, and its crown underside meets the occupied core top face at layer nine before the colliders join the base compound.',
        },
      ],
    }),
  ]);

export const MACHINE_WORKS_FEATURE_PURPOSES_V1: readonly MachineWorksFeaturePurposeV1[] =
  Object.freeze([
    featurePurpose({ id: 'machine-works:feature-purpose:drive-radial-phase-flag',
      recipeId: 'studio:machine-works:drive-cog',
      steps: [boxPurposeStep([4, 1, 0], [3, 3, 3], 'safety')],
      purpose: 'One asymmetric radial flag makes the copied drum angle readable without false teeth.',
      removalConsequence: 'Exterior drum phase becomes unreadable when its axle end is otherwise occluded.', mechanicalRelationship: { verb: 'witnesses', object: 'matching solved drive drum', evidence: 'The flag is coaxial with and copies the drum quaternion without contact or torque.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:press-face-connected-service-bus',
      recipeId: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
      steps: [boxPurposeStep([8, 19, 3], [9, 1, 1], 'detail')],
      purpose: 'The straight bus branches cabinet service to both fixed servo housings by positive-area faces.',
      removalConsequence: 'The two servo housings become unexplained boxes with no visible shared service source.', mechanicalRelationship: { verb: 'routes-service-to', object: 'core and cap fixed servo housings', evidence: 'The exact bus face-contacts the controller and both housing side faces.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:press-fixed-stators',
      recipeId: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
      steps: [
        boxPurposeStep([5, 0, 0], [1, 15, 1], 'detail'),
        boxPurposeStep([19, 0, 0], [1, 15, 1], 'detail'),
      ],
      purpose: 'Two fixed stators expose the intended reaction side of each position-commanded linear actuator.',
      removalConsequence: 'Each moving C-yoke loses its fixed actuator datum and the vertical command becomes unexplained.', mechanicalRelationship: { verb: 'engages', object: 'core and cap moving C-yokes', evidence: 'Each stator stays inside one empty yoke cavity with hashed transverse clearance.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:head-local-pickup-service',
      recipeId: 'studio:machine-works:insertion-head',
      steps: [
        boxPurposeStep([4, 4, 7], [5, 3, 2], 'detail'),
        boxPurposeStep([6, 4, 9], [1, 14, 1], 'detail'),
      ],
      purpose: 'A precharged head-local buffer and ram conduit account for the already-energized pickup during one cycle.',
      removalConsequence: 'The magnetic hold loses its visible local supply while a flexible moving cable remains explicitly excluded.', mechanicalRelationship: { verb: 'routes-service-to', object: 'electromagnetic pickup plate', evidence: 'Exact buffer, ram, backing, and pickup boxes form a tested positive-area-face path.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:carrier-trunnion-axle',
      recipeId: 'studio:machine-works:transfer-carriage',
      steps: [boxPurposeStep([14, 2, 0], [1, 2, 23], 'safety')],
      purpose: 'The widened chassis-backed axle supplies the visible common axis for both bearings and the output command.',
      removalConsequence: 'The carriage can no longer show what supports or defines its prescribed tipping axis.', mechanicalRelationship: { verb: 'engages', object: 'near bearing, far bearing, and servo coupler', evidence: 'Named axle ports coincide with both bores and the coupler face before the swept-clearance proof.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:output-servo-coupler',
      recipeId: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
      steps: [boxPurposeStep([4, 2, 27], [1, 2, 1], 'safety')],
      purpose: 'The coupler closes the visible axial handoff from the fixed servo housing to the carrier trunnion.',
      removalConsequence: 'A visible gap breaks the declared actuation path immediately before prescribed rotation.', mechanicalRelationship: { verb: 'engages', object: 'carrier servo-drive face', evidence: 'Canonical validation requires trunnion, coupler, and housing to form one face-contacting chain.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:output-servo-service-conduit',
      recipeId: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
      steps: [
        boxPurposeStep([0, 0, 28], [2, 1, 2], 'detail'),
        boxPurposeStep([0, 1, 28], [1, 3, 2], 'detail'),
        boxPurposeStep([0, 4, 28], [2, 1, 2], 'detail'),
      ],
      purpose: 'The three-segment conduit marks one continuous external-service entry into the output servo.',
      removalConsequence: 'The output servo loses its visible external service source and becomes an unexplained motion box.', mechanicalRelationship: { verb: 'routes-service-to', object: 'outboard rotary position servo', evidence: 'All three conduit boxes face-connect from the foundation edge to the housing input face.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:base-core-keyed-mate',
      recipeId: 'studio:machine-works:product-base',
      steps: [{
        kind: 'part', part: 'open-frame', at: [3, 1, 3],
        settings: { width: 5, height: 3, depth: 5, thickness: 1, role: 'wear' },
      }],
      purpose: 'The open central socket gives the core stem real insertion clearance and a named receiving frame.',
      removalConsequence: 'The core key loses its receiving geometry and the first assembly handoff becomes unexplained.', mechanicalRelationship: { verb: 'mates', object: 'product-core lower key', evidence: 'The two-voxel stem enters empty socket layers before the bounded compound weld.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:core-base-key',
      recipeId: 'studio:machine-works:product-core',
      steps: [boxPurposeStep([2, 0, 2], [3, 2, 3], 'wear')],
      purpose: 'The two-voxel lower stem gives the core a real key for the base socket.',
      removalConsequence: 'The first insertion loses its visible mating geometry and becomes proximity-only assembly.', mechanicalRelationship: { verb: 'mates', object: 'product-base core socket', evidence: 'The exact stem occupies two empty socket layers without positive-volume overlap.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:core-cap-keyed-seat',
      recipeId: 'studio:machine-works:product-core',
      steps: [
        { kind: 'part', part: 'open-frame', at: [0, 2, 0], settings: { width: 7, height: 7, depth: 7, thickness: 1, role: 'product' } },
        boxPurposeStep([2, 2, 2], [3, 5, 3], 'detail'),
      ],
      purpose: 'The cage top supplies the cap seat while the shortened column leaves two bounded key-insertion layers.',
      removalConsequence: 'The cap loses either its receiving clearance or its occupied vertical stop.', mechanicalRelationship: { verb: 'locates', object: 'product-cap underside key and crown', evidence: 'The key enters layers seven and eight before the crown meets the occupied core top plane.' },
    }), featurePurpose({ id: 'machine-works:feature-purpose:cap-key-and-crown-seat',
      recipeId: 'studio:machine-works:product-cap',
      steps: [
        boxPurposeStep([4, 0, 4], [3, 2, 3], 'wear'),
        { kind: 'part', part: 'tapered-mass', at: [0, 2, 0], settings: { width: 11, height: 3, depth: 11, topWidth: 7, topDepth: 7, role: 'product' } },
      ],
      purpose: 'The underside key establishes lateral insertion while the crown shoulder supplies the vertical seat.',
      removalConsequence: 'The second insertion loses its keyed alignment or its unambiguous seated stop.', mechanicalRelationship: { verb: 'mates', object: 'product-core cap socket and top plane', evidence: 'The two-voxel key clears the socket before the crown underside face-contacts the core seat.' },
    }),
  ]);

export const MACHINE_WORKS_PURPOSE_BOUNDARIES_V1 = Object.freeze({
  preloadedHeads: 'Both insertion slides start the trace preloaded: the core and cap are already retained by fixed joints at named magnetic pickup faces.',
  pickupAndJaws: 'The fixture simulates no in-trace pickup and no jaw actuation; a head-local buffer begins precharged before frame zero, the visible magnetic plate begins energized, holds a preloaded ferromagnetic datum through a fixed joint, and de-energizes only after validated keyed insertion.',
  headServo: 'A consumer-owned position-based kinematic servo command prescribes each slide translation; the bridge shows the face-connected external actuation route ending at continuous fixed-stator-inside-empty-C-yoke engagement, while each pickup is supplied only by its precharged head-local buffer. The trace does not simulate a flexible moving cable, electricity, motor torque, feedback dynamics, load transfer, or energy use.',
  alignmentDatums: 'The two rear pads remain tangent to straight bridge faces as visual alignment datums only; they are not U-shaped carriages and no captive mechanical constraint is modeled.',
  exposedPhaseFlags: 'The exposed hub-and-radial-flag indicators are non-interacting phase witnesses copied from solved drum poses outside Rapier; they do not contact the belt or transmit torque.',
  attachmentHandoff: 'After validated two-voxel keyed insertion, cap shoulder contact, bounded solver penetration, and dwell, the pickup-to-part fixed joint is removed and the component colliders join the retained product-base body as a software compound weld; the key is real geometry, but retention is not a solved latch or simulated jaw release.',
  pressBridge: 'The exact press-bridge sidecar is hashed and its feet, face-connected external service route, alignment faces, stator spines, empty C-yoke cavities, and disjoint swept yoke bars are tested. The bridge is not ingested into Rapier, so it remains a kinematic actuation and intended-reaction-path study without proving a captive constraint, solver load transfer, or stress.',
  outputPivot: 'A widened carrier trunnion axle, two grounded C-shaped bearing cradles outside the belt, and a face-coupled outboard servo housing make the bucket-boundary support and actuation path visible. Their canonical axes and the complete continuous carrier sweep against the dock, foundation, and bucket are validated again at live handoff, but the output rotation remains a prescribed position command: no revolute constraint, bearing contact response, motor torque, feedback dynamics, or energy use is modeled.',
});
