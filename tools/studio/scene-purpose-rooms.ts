import { capturedAt, sceneNodeId } from './scene-purpose-board.js';
import {
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
  type PurposeNodeV1,
} from './purpose-graph.js';

/**
 * Purpose graphs for the furnished rooms.
 *
 * These scenes claim a place rather than a comparison, so their graphs carry
 * real relationships: a chimney vents a fireplace, a lamp stands on a
 * nightstand, a car is kept in a garage. Where a group shares one rule — a
 * room's furniture, a run of fence — it is one node, and the members whose
 * position actually matters are split out.
 */

interface RoomNodeV1 {
  readonly key: string;
  readonly label: string;
  readonly job: string;
  readonly requiredBy: readonly PurposeNodeIdV1[];
  readonly evidence: string;
  readonly honesty: string;
  readonly where: string;
}

function roomNode(system: string, node: RoomNodeV1): PurposeNodeV1 {
  return purposeNodeV1({
    id: sceneNodeId(system, 'solid', node.key),
    kind: 'solid',
    label: node.label,
    job: node.job,
    requiredBy: node.requiredBy,
    evidence: capturedAt(node.evidence, node.where),
    honestyBoundary: node.honesty,
  });
}

const FURNITURE_HONESTY =
  'A placed model. Nothing here opens, holds anything, or is used; the scene '
  + 'shows arrangement, not function.';

export function createDiningPurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:dining';
  const need = sceneNodeId(systemId, 'need', 'set-for-four');
  const table = sceneNodeId(systemId, 'solid', 'table');
  const view = 'studio:scene:dining default camera';
  return purposeGraphV1(systemId, [
    purposeNeedV1({
      id: need,
      label: 'A table set for four',
      job:
        'Show four places at one table, so the scene reads as somewhere four '
        + 'people would sit rather than as furniture in a heap.',
      rootRationale:
        'The scene exists to show that separate saved recipes compose into one '
        + 'arrangement, and four places is the smallest arrangement that has to '
        + 'get facing and spacing right on both axes.',
      evidence: capturedAt(
        'Four chairs surround the table and every one faces it.',
        view,
      ),
      honestyBoundary:
        'An arrangement only. No one sits, and nothing is laid on the table.',
    }),
    roomNode(systemId, {
      key: 'table',
      label: 'Table',
      job: 'Provide the centre the four places are arranged around.',
      requiredBy: [need],
      evidence: 'Every chair is placed and turned relative to this one model.',
      honesty: FURNITURE_HONESTY,
      where: view,
    }),
    ...['chair-n', 'chair-s', 'chair-e', 'chair-w'].map((key) => roomNode(systemId, {
      key,
      label: `Chair ${key.slice(-1).toUpperCase()}`,
      job: 'Hold one place at the table, turned so its seat faces the centre.',
      requiredBy: [table],
      evidence:
        'Its forward direction, derived from the backrest, points at the table.',
      honesty:
        'A place at the table. The chair is not occupied and does not move.',
      where: view,
    })),
  ]);
}

export function createFurnishedHousePurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:house';
  const need = sceneNodeId(systemId, 'need', 'room-in-full-view');
  const shell = sceneNodeId(systemId, 'solid', 'shell');
  const nightstand = sceneNodeId(systemId, 'solid', 'nightstand');
  const table = sceneNodeId(systemId, 'solid', 'table');
  const view = 'studio:scene:house default camera';
  return purposeGraphV1(systemId, [
    purposeNeedV1({
      id: need,
      label: 'A furnished room in full view',
      job:
        'Show shelf furniture, reused whole, standing inside a room a viewer '
        + 'can see all of at once.',
      rootRationale:
        'Furniture models are judged at room scale beside each other, and a '
        + 'closed house would hide exactly what has to be judged.',
      evidence: capturedAt(
        'The open front leaves every piece visible from one camera.',
        view,
      ),
      honestyBoundary:
        'One room with an open front. It is not a whole house and has no '
        + 'second storey, doors, or services.',
    }),
    roomNode(systemId, {
      key: 'shell',
      label: 'House shell',
      job: 'Enclose the furniture on three sides so it reads as being indoors.',
      requiredBy: [need],
      evidence: 'Every furnishing stands within the shell footprint.',
      honesty:
        'An open-fronted shell. It has no door, glazing, or interior services.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'roof',
      label: 'Roof',
      job: 'Cap the shell so the room reads as covered rather than unfinished.',
      requiredBy: [shell],
      evidence: 'The roof sits directly on the shell head height.',
      honesty: 'A cap. It is not tied down, framed, or weatherproofed.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'bed',
      label: 'Made bed',
      job: 'Anchor the sleeping side of the room at its largest footprint.',
      requiredBy: [need],
      evidence: 'It occupies the left bay with clearance to the shell walls.',
      honesty: FURNITURE_HONESTY,
      where: view,
    }),
    roomNode(systemId, {
      key: 'nightstand',
      label: 'Nightstand',
      job: 'Stand within reach of the bed head, which is what makes it one.',
      requiredBy: [sceneNodeId(systemId, 'solid', 'bed')],
      evidence: 'Its side meets the bed footprint exactly at the head end.',
      honesty:
        'Adjacency only. Nothing is stored in it and it does not open.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'lamp',
      label: 'Table lamp',
      job: 'Sit on the nightstand top, showing the two models stack correctly.',
      requiredBy: [nightstand],
      evidence: 'Its base height equals the nightstand height plus its lift.',
      honesty:
        'It rests on the surface and emits nothing. The scene has no lights.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'table',
      label: 'Table',
      job: 'Anchor the living side of the room opposite the bed.',
      requiredBy: [need],
      evidence: 'It occupies the right bay clear of the bed.',
      honesty: FURNITURE_HONESTY,
      where: view,
    }),
    roomNode(systemId, {
      key: 'chairs',
      label: 'Chairs',
      job: 'Hold two places at the table, each turned to face it.',
      requiredBy: [table],
      evidence: 'Both chairs face the table from opposite sides.',
      honesty:
        'One bounded group of two under one rule: a place at this table.',
      where: view,
    }),
  ]);
}

export function createFamilyHomePurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:home';
  const rooms = sceneNodeId(systemId, 'need', 'every-room-in-view');
  const grounded = sceneNodeId(systemId, 'need', 'nothing-floats');
  const fireplace = sceneNodeId(systemId, 'solid', 'fireplace');
  const garage = sceneNodeId(systemId, 'solid', 'garage');
  const nightstand = sceneNodeId(systemId, 'solid', 'bedroom-nightstand');
  const view = 'studio:scene:home default camera';
  return purposeGraphV1(systemId, [
    purposeNeedV1({
      id: rooms,
      label: 'Every room furnished and in view',
      job:
        'Show four differently furnished rooms at once, so a reader can see the '
        + 'catalog covers a whole home rather than one set piece.',
      rootRationale:
        'The household catalog is judged on breadth, and breadth is only '
        + 'visible when the rooms sit together at one scale.',
      evidence: capturedAt(
        'Living room, kitchen, bedroom and bathroom are each visible with '
        + 'their own furnishings from the opening camera.',
        view,
      ),
      honestyBoundary:
        'An arrangement at room scale. Nothing opens, runs, plumbs, or is used, '
        + 'and there is no interior wall between the rooms.',
    }),
    purposeNeedV1({
      id: grounded,
      label: 'Nothing floats',
      job: 'Every mass shows a visible path to the ground it stands on.',
      rootRationale:
        'Objects fall unless something holds them up, so an unsupported mass '
        + 'is the first thing that reads as wrong.',
      evidence: capturedAt(
        'Every placement rests on the shell floor or on the ground plane.',
        view,
      ),
      honestyBoundary:
        'Visible support only. No load, bearing, or structure is solved.',
    }),
    roomNode(systemId, {
      key: 'shell',
      label: 'Home shell',
      job: 'Hold the four room bays and the floor they all stand on.',
      requiredBy: [rooms, grounded],
      evidence: 'Every interior furnishing stands inside its footprint.',
      honesty:
        'An open shell with its front and roof off. It has no interior walls, '
        + 'so the rooms are read from their furniture rather than from division.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'fireplace',
      label: 'Fireplace',
      job: 'Give the living room its focal wall feature.',
      requiredBy: [rooms],
      evidence: 'It sits on the far living-room wall with the sofa facing it.',
      honesty: 'Nothing burns. There is no fire, fuel, or heat.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'chimney',
      label: 'Chimney',
      job:
        'Continue the fireplace upward, which is the one thing that makes a '
        + 'fireplace read as vented rather than as a niche.',
      requiredBy: [fireplace],
      evidence: 'It stands directly above the fireplace on the same footprint.',
      honesty:
        'Alignment only. No flue, draught, or smoke path is modelled.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'living-room-furniture',
      label: 'Living room furniture',
      job:
        'Seat the living room facing its focal wall, with a low table within '
        + 'reach of the sofa.',
      requiredBy: [rooms],
      evidence:
        'The sofa faces the fireplace wall with the coffee table between them.',
      honesty:
        'One bounded group under one rule: living-room furnishing. Nothing is '
        + 'sat on or used.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'kitchen-run',
      label: 'Kitchen run',
      job:
        'Put counter, stove and cold store along the working walls of the '
        + 'kitchen bay so it reads as a kitchen and not as a store room.',
      requiredBy: [rooms],
      evidence: 'All three stand along the kitchen bay walls.',
      honesty:
        'One bounded group under one rule. Nothing cooks, cools, or connects '
        + 'to any service.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'bedroom-bed',
      label: 'Bed',
      job: 'Anchor the bedroom bay at its largest footprint.',
      requiredBy: [rooms],
      evidence: 'It occupies the bedroom bay against the left wall.',
      honesty: FURNITURE_HONESTY,
      where: view,
    }),
    roomNode(systemId, {
      key: 'bedroom-nightstand',
      label: 'Nightstand',
      job: 'Stand within reach of the bed, which is what makes it a nightstand.',
      requiredBy: [sceneNodeId(systemId, 'solid', 'bedroom-bed')],
      evidence: 'It sits beside the bed within the same bay.',
      honesty: 'Adjacency only. It does not open and stores nothing.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'bedroom-lamp',
      label: 'Table lamp',
      job: 'Sit on the nightstand top, proving the two models stack.',
      requiredBy: [nightstand],
      evidence: 'Its base height equals the nightstand height plus its lift.',
      honesty: 'It emits nothing; this scene carries no lights.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'wardrobe',
      label: 'Wardrobe',
      job:
        'Give the bedroom its one tall mass, so the bay is not read entirely '
        + 'from low furniture.',
      requiredBy: [rooms],
      evidence: 'It is the tallest furnishing in the bedroom bay.',
      honesty: 'It does not open and holds nothing.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'bathroom-fittings',
      label: 'Bathroom fittings',
      job:
        'Put bath, basin and toilet in one bay so it reads as a bathroom, the '
        + 'only room identified purely by its fittings.',
      requiredBy: [rooms],
      evidence: 'All three stand within the bathroom bay.',
      honesty:
        'One bounded group under one rule. Nothing is plumbed and no water '
        + 'exists anywhere in this scene.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'garage',
      label: 'Garage',
      job: 'Give the car somewhere to be kept, clear of the house itself.',
      requiredBy: [rooms],
      evidence: 'It stands clear of the shell with its opening to the front.',
      honesty: 'The door does not open and nothing closes it.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'car',
      label: 'Car',
      job:
        'Occupy the garage, which is what makes the garage read as a garage '
        + 'rather than an empty outbuilding.',
      requiredBy: [garage],
      evidence: 'It stands inside the garage footprint.',
      honesty: 'It does not move, and nothing drives it.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'yard-trees',
      label: 'Yard trees',
      job:
        'Mark the front and back yards as outside ground rather than as empty '
        + 'plane, each carrying its own seed so they are not clones.',
      requiredBy: [rooms],
      evidence:
        'One stands in each yard, clear of the open front and the fence line.',
      honesty:
        'One bounded group under one rule. They shade nothing and grow in no '
        + 'soil.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'back-fence',
      label: 'Back fence',
      job:
        'Close the rear boundary across the full width of the shell, so the '
        + 'back yard has an edge rather than trailing off.',
      requiredBy: [rooms],
      evidence:
        'Four contiguous runs span forty-eight units against a forty-three-unit '
        + 'shell, with no gap between runs.',
      honesty:
        'One bounded group under one rule. It encloses only the rear; the sides '
        + 'and front are open, and nothing is kept in or out.',
      where: view,
    }),
    roomNode(systemId, {
      key: 'back-planter',
      label: 'Back planter',
      job: 'Give the back yard one tended detail against the fence line.',
      requiredBy: [sceneNodeId(systemId, 'solid', 'back-fence')],
      evidence: 'It stands inside the fenced rear boundary.',
      honesty:
        'A single planter. It is not a bed, is not planted in ground, and is '
        + 'not tended.',
      where: view,
    }),
  ]);
}
