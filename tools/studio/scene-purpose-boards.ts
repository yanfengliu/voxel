import {
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
  type ContrastFamilyV1,
} from './contrast-recipes.js';
import {
  capturedAt,
  comparisonBoardGraphV1,
  notYetShown,
  sceneNodeId,
} from './scene-purpose-board.js';
import {
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
} from './purpose-graph.js';

/**
 * Purpose graphs for the comparison boards and the two lighting rigs.
 *
 * These are the scenes whose whole job is to be looked at rather than to work,
 * so their graphs are short on purpose. A board that invented feeds, supports,
 * or serves relationships between unrelated specimens would be claiming exactly
 * the composition its layout is careful not to imply.
 */

const CONTRAST_SCENE_IDS: Readonly<Record<ContrastFamilyV1, string>> = {
  'arch-void': 'studio:scene:contrast-arch-void',
  'tapered-stepped': 'studio:scene:contrast-tapered-stepped',
  'frame-truss': 'studio:scene:contrast-frame-truss',
  'radial-mechanical': 'studio:scene:contrast-radial-mechanical',
  'branching-organic': 'studio:scene:contrast-branching-organic',
  'asymmetric-hybrid': 'studio:scene:contrast-asymmetric-hybrid',
};

function contrastBoardV1(family: ContrastFamilyV1): PurposeGraphV1 {
  const entries = CURATED_CONTRAST_RECIPES.filter(
    (entry) => entry.family === family,
  );
  return comparisonBoardGraphV1({
    systemId: CONTRAST_SCENE_IDS[family],
    needKey: 'compare-nearest-neighbours',
    needLabel: `Compare ${family} specimens`,
    needJob:
      'Let a reader compare silhouette, negative space and construction grammar '
      + 'within one family, with orientation, pitch and grain held constant so '
      + 'the only visible difference is the model itself.',
    rootRationale:
      'A promoted design has to be judged against its nearest neighbours, and '
      + 'its nearest neighbours are the ones sharing its construction family. '
      + 'That judgement needs them side by side under identical conditions.',
    needEvidence: capturedAt(
      'Five specimens in one row at one shared orientation, spacing and grain, '
      + 'so none can stand behind another at any camera.',
      `${CONTRAST_SCENE_IDS[family]} default camera`,
    ),
    needHonesty:
      'A contact sheet. The specimens are co-located for comparison and form '
      + 'no system; nothing here feeds, supports, or drives anything else.',
    specimenHonesty:
      'Its presence on the board claims comparison only, not that it belongs '
      + 'in a place with the others.',
    specimens: entries.map((entry) => ({
      key: entry.recipe.id.slice('studio:contrast:'.length),
      label: entry.recipe.label,
      job: entry.visualThesis,
    })),
  });
}

export function createContrastBoardPurposeGraphsV1():
readonly PurposeGraphV1[] {
  return CONTRAST_FAMILIES.map(contrastBoardV1);
}

export function createWallStudiesPurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:village';
  return comparisonBoardGraphV1({
    systemId,
    needKey: 'compare-wall-under-one-roof',
    needLabel: 'Compare two walls under one roof',
    needJob:
      'Show the same reusable roof slice capping two different wall recipes so '
      + 'the palettes can be judged against each other.',
    rootRationale:
      'The roof is shared by both models, so it is the control that makes the '
      + 'wall the only variable worth looking at.',
    needEvidence: capturedAt(
      'Both slices sit at equal offsets on one shared z with matching turns.',
      'studio:scene:village default camera',
    ),
    needHonesty:
      'A comparison board, not a street. Each model is a wall four voxels deep '
      + 'with no door and no interior.',
    specimenHonesty:
      'A wall-and-roof study. It encloses nothing and cannot be entered.',
    specimens: [
      {
        key: 'wall-brick',
        label: 'Brick wall and roof slice',
        job: 'Carry the brick palette under the shared roof.',
      },
      {
        key: 'wall-sandstone',
        label: 'Sandstone wall and roof slice',
        job: 'Carry the sandstone palette under the same roof.',
      },
    ],
    extras: [
      purposeNodeV1({
        id: sceneNodeId(systemId, 'solid', 'scale-planter'),
        kind: 'solid',
        label: 'Scale planter',
        job:
          'Give both slices a human-scale reference, so a viewer can read them '
          + 'as building-sized rather than as models of unknown size.',
        requiredBy: Object.freeze([
          sceneNodeId(systemId, 'specimen', 'wall-brick'),
          sceneNodeId(systemId, 'specimen', 'wall-sandstone'),
        ]),
        evidence: capturedAt(
          'One planter, centred, serves both slices equally; a second would '
          + 'only repeat the same reading.',
          'studio:scene:village default camera',
        ),
        honestyBoundary:
          'A size reference only. It is not planted in anything and marks no '
          + 'door, path, or boundary.',
      }),
    ],
  });
}

export function createGardenPurposeGraphV1(): PurposeGraphV1 {
  return comparisonBoardGraphV1({
    systemId: 'studio:scene:garden',
    needKey: 'compare-planter-colourways',
    needLabel: 'Compare planter colourways',
    needJob:
      'Show three planter models in three colourways so palette and silhouette '
      + 'differences are easy to see side by side.',
    rootRationale:
      'The catalog carries several near-neighbour planters, and a reader has to '
      + 'be able to tell what actually distinguishes them.',
    needEvidence: capturedAt(
      'Three rows at one shared orientation; every pot presents the same face.',
      'studio:scene:garden fixed 1280x800 front-left camera',
    ),
    needHonesty:
      'A display board. The planters are not planted in ground, arranged into '
      + 'a garden, or tended by anything.',
    specimenHonesty:
      'Repeated three times to exercise instancing; the repeats carry no '
      + 'meaning beyond showing the same model drawn as several instances.',
    specimens: [
      {
        key: 'three-flower-pot',
        label: 'Pot of three flowers',
        job: 'Carry the pink-in-terracotta colourway and its wide silhouette.',
      },
      {
        key: 'tulip-pot',
        label: 'Coral tulip in blue pot',
        job: 'Carry the tall narrow silhouette against the two wider pots.',
      },
      {
        key: 'violet-flower-pot',
        label: 'Violet flowers in teal',
        job: 'Carry the violet-in-teal colourway at the shared pot silhouette.',
      },
    ],
  });
}

export function createLightingLabPurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:lighting-lab';
  const need = sceneNodeId(systemId, 'need', 'edit-lights-live');
  return purposeGraphV1(systemId, [
    purposeNeedV1({
      id: need,
      label: 'Edit lights and see the result',
      job:
        'Let a user add, move, recolour, brighten, dim, or remove a point light '
        + 'and watch the change land on real surfaces immediately.',
      rootRationale:
        'Lighting controls cannot be judged from numbers. The scene exists so '
        + 'an edit has something to fall on.',
      evidence: capturedAt(
        'Warm and cool lights wash across the fixtures and the backdrop, and a '
        + 'moved light changes the raster.',
        'studio:scene:lighting-lab baseline and moved-light baseline',
      ),
      honestyBoundary:
        'A lighting workbench. The fixtures are not plumbed, installed, or '
        + 'arranged as a room.',
    }),
    purposeNodeV1({
      id: sceneNodeId(systemId, 'solid', 'backdrop'),
      kind: 'solid',
      label: 'Sandstone backdrop',
      job:
        'Give the lights one large pale surface where falloff and colour mixing '
        + 'are readable across a broad area rather than on small curved props.',
      requiredBy: Object.freeze([need]),
      evidence: capturedAt(
        'The wash across the wall is the clearest read of light colour.',
        'studio:scene:lighting-lab baseline',
      ),
      honestyBoundary:
        'A light-catching surface, not a wall of any building.',
    }),
    purposeNodeV1({
      id: sceneNodeId(systemId, 'solid', 'fixtures'),
      kind: 'solid',
      label: 'Pale fixtures',
      job:
        'Give the lights curved and boxy pale shapes so shadow shape and '
        + 'falloff on geometry are visible, not only on a flat plane.',
      requiredBy: Object.freeze([need]),
      evidence: capturedAt(
        'Every fixture lies inside the range of at least one light.',
        'studio:scene:lighting-lab reach test and baseline',
      ),
      honestyBoundary:
        'One bounded group under one rule: each is a pale light-catching solid. '
        + 'That they are bathroom models carries no meaning here.',
    }),
  ]);
}

export function createLighting1000PurposeGraphV1(): PurposeGraphV1 {
  const systemId = 'studio:scene:lighting-1000';
  const need = sceneNodeId(systemId, 'need', 'prove-clustered-throughput');
  return purposeGraphV1(systemId, [
    purposeNeedV1({
      id: need,
      label: 'Prove clustered lighting at scale',
      job:
        'Show a thousand moving point lights actually illuminating geometry '
        + 'while staying inside the cluster budget.',
      rootRationale:
        'Clustered lighting is a throughput claim, and a throughput claim that '
        + 'is never driven to its declared limit is untested.',
      evidence: capturedAt(
        'A sweep over four viewports, two cameras, twenty-four yaws, eleven '
        + 'pitches and four sample times keeps the busiest cluster at or below '
        + 'thirty of the thirty-two-light budget.',
        'lighting-1000 headroom sweep and baseline',
      ),
      honestyBoundary:
        'A throughput and correctness rig. It is not a place and composes '
        + 'nothing; the arrangement exists to spread lights across depth bands.',
    }),
    purposeNodeV1({
      id: sceneNodeId(systemId, 'solid', 'receiver-field'),
      kind: 'solid',
      label: 'Receiver field',
      job:
        'Give every light exactly one pale Lambert receiver, so a raster change '
        + 'proves illumination rather than only marker movement or texture '
        + 'upload.',
      requiredBy: Object.freeze([need]),
      evidence: capturedAt(
        'Placement count equals light count and all share one model.',
        'lighting-1000 one-receiver-per-light test',
      ),
      honestyBoundary:
        'One bounded group under one rule, with no exceptions. A receiver has '
        + 'no meaning beyond being a surface for its own light.',
    }),
    purposeNodeV1({
      id: sceneNodeId(systemId, 'motion', 'orbits'),
      kind: 'motion-rule',
      label: 'Per-light orbits',
      job:
        'Move every light on its own axis, radius, period and phase so cluster '
        + 'assignment keeps changing instead of settling into one fixed split.',
      requiredBy: Object.freeze([need]),
      evidence: capturedAt(
        'Axes cover x, y and z; periods and phases vary per light.',
        'lighting-1000 motion test',
      ),
      honestyBoundary:
        'Authored deterministic motion. Nothing drives these lights and they '
        + 'orbit nothing physical.',
    }),
    purposeNodeV1({
      id: sceneNodeId(systemId, 'motion', 'depth-bands'),
      kind: 'motion-rule',
      label: 'Scrambled depth bands',
      job:
        'Spread the field across twenty-five depth bands so the sweep exercises '
        + 'depth slicing rather than one flat plane of lights.',
      requiredBy: Object.freeze([need]),
      evidence: notYetShown(
        'The band assignment is checked for coverage, but no test compares '
        + 'cluster occupancy against an unbanded arrangement.',
        'A run with all lights in one depth band, showing the busiest cluster '
        + 'rise.',
      ),
      honestyBoundary:
        'A distribution rule for the test rig, not a spatial arrangement with '
        + 'any meaning of its own.',
    }),
  ]);
}
