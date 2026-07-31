import {
  CONTRAST_FAMILIES,
  CURATED_CONTRAST_RECIPES,
  type ContrastFamilyV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V3,
  type SceneV1,
} from './scene.js';
import {
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
  machineWorksExposedCogSceneFloorV1,
  machineWorksSlatSceneFloorV1,
} from './machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from './machine-works-layout.js';
import {
  MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
  MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
  MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
  MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
} from './machine-works-purpose.js';

const DISPLAY_GRAIN = 0.65;

/**
 * The widest ground span any promoted specimen occupies once the board's
 * display grain is applied. Derived from the live recipes so a wider promotion
 * widens the board instead of quietly closing the gap between neighbours.
 */
function widestSpecimenSpanV1(): number {
  return Math.max(...CURATED_CONTRAST_RECIPES.map(
    (entry) => Math.max(entry.recipe.size[0], entry.recipe.size[2]) * DISPLAY_GRAIN,
  ));
}

/**
 * Clear ground the board keeps between the two widest neighbours. Five units at
 * this grain is about a third of the widest specimen, which is enough that no
 * pair reads as one joined structure from the default camera.
 */
const MINIMUM_CLEAR_GAP = 5;

function placementId(entry: CuratedContrastRecipeV1): string {
  return entry.recipe.id.slice('studio:contrast:'.length);
}

/** One shared pitch, so every sheet stays comparable with the others. */
const CELL_SPACING = widestSpecimenSpanV1() + MINIMUM_CLEAR_GAP;

/**
 * One sheet per construction family, which is the axis these recipes actually
 * vary along and the one the shelf already groups them by.
 *
 * They used to be grouped into four invented domains - infrastructure, civic,
 * mechanical, organic - and those labels did not survive looking at them. A
 * sheet titled "Civic form studies" held a pergola, a wireframe cage, an
 * obelisk and a gear. The family names describe what is actually on screen.
 */
const FAMILY_PRESENTATION: Readonly<
Record<ContrastFamilyV1, {
  readonly id: string;
  readonly label: string;
  readonly compares: string;
}>
> = {
  'arch-void': {
    id: 'studio:scene:contrast-arch-void',
    label: 'Arches and voids',
    compares: 'how each specimen carries a span over an opening',
  },
  'tapered-stepped': {
    id: 'studio:scene:contrast-tapered-stepped',
    label: 'Tapered and stepped',
    compares: 'how mass reduces with height, by taper or by discrete step',
  },
  'frame-truss': {
    id: 'studio:scene:contrast-frame-truss',
    label: 'Frames and trusses',
    compares: 'how an open framework braces itself with the least material',
  },
  'radial-mechanical': {
    id: 'studio:scene:contrast-radial-mechanical',
    label: 'Radial mechanics',
    compares: 'how form organises around a centre or an axis',
  },
  'branching-organic': {
    id: 'studio:scene:contrast-branching-organic',
    label: 'Branching forms',
    compares: 'how one stem divides and how the divisions distribute',
  },
  'asymmetric-hybrid': {
    id: 'studio:scene:contrast-asymmetric-hybrid',
    label: 'Asymmetric hybrids',
    compares: 'how two family grammars combine without a symmetry to lean on',
  },
};

/** The family sheets, in catalog order. */
export const CONTRAST_FAMILY_SCENE_IDS_V1: readonly string[] = Object.freeze(
  CONTRAST_FAMILIES.map((family) => FAMILY_PRESENTATION[family].id),
);

/** True only when a recipe's motion actually moves it. */
function specimenMoves(entry: CuratedContrastRecipeV1): boolean {
  const motion = entry.recipe.motion;
  if (motion.periodMs <= 0) return false;
  return motion.translation.some((value) => value !== 0)
    || motion.rotationRadians.some((value) => value !== 0)
    || motion.scale.some((value) => value !== 0);
}

/**
 * What the sheet may say about movement. Most specimens are static shapes, and
 * the few that move do so on an authored period with nothing driving them, so
 * the summary states which of the two it is rather than leaving a reader to
 * assume a mechanism.
 */
function motionSentence(entries: readonly CuratedContrastRecipeV1[]): string {
  const moving = entries.filter(specimenMoves);
  if (moving.length === 0) {
    return ' Every specimen here is static: none carries motion of any kind.';
  }
  const names = moving.map((entry) => entry.recipe.label).join(' and ');
  return ` ${names} carries authored motion on a fixed period; nothing drives `
    + 'it and it transmits nothing. The rest are static.';
}

function familyScene(
  family: ContrastFamilyV1,
  entries: readonly CuratedContrastRecipeV1[],
): SceneV1 {
  const presentation = FAMILY_PRESENTATION[family];
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: presentation.id,
    label: presentation.label,
    summary: `Five promoted ${family} specimens in one row, all facing the same `
      + `way at one shared spacing, for comparing ${presentation.compares}. A `
      + 'single row is deliberate: these models are tall enough that a second '
      + 'row would stand behind the first at any raised camera and hide it. '
      + 'This is a contact sheet and makes no claim that the specimens belong '
      + 'together, support each other, or form a place.'
      + motionSentence(entries),
    placements: entries.map((entry, index) => ({
      id: placementId(entry),
      model: entry.recipe.id,
      at: [
        (index - (entries.length - 1) / 2) * CELL_SPACING,
        0,
        0,
      ],
      // One orientation, because the board compares silhouette and massing.
      turns: 0,
      grain: DISPLAY_GRAIN,
    })),
  };
}

function machineWorksScene(): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V3,
    id: 'studio:scene:contrast-machines',
    label: 'Machine works',
    summary: 'One consumer-generated fixed-step process drives two Rapier kinematic drums and a closed loop of '
      + 'exact belt slats from one controller phase; contact and friction move the axis-constrained dynamic carrier. '
      + 'Four press-bridge feet meet occupied foundation pads, and each narrowed cream stator keeps at least 0.4 '
      + 'world units of running clearance inside an orange moving C-yoke; rear pads and straight faces expose alignment without '
      + 'claiming captive guide constraints. A face-connected cabinet-to-bus route identifies external actuation service to the fixed servo '
      + 'housings and stators, while a head-local buffer starts precharged for pickup holding. Each slide begins with one component already contacting and retained at its energized magnetic pickup face, '
      + 'follows an externally prescribed vertical position command, then de-energizes only after a two-voxel key '
      + 'enters empty socket clearance, the cap crown reaches its core seat, and position, orientation, speed, dwell, '
      + 'and merge-penetration checks pass. The fixture '
      + 'does not simulate charging, a flexible moving cable, electricity, motor torque, or jaw motion; retention after release is an explicit '
      + 'software compound weld rather than a solved latch. A widened carrier trunnion enters two foundation-contacting '
      + 'outboard bearing cradles beyond the belt and face-meets a visible servo coupler; live swept clearance passes '
      + 'before the position command tips the still-physical carrier about that bucket-boundary axis so gravity drops the welded product into '
      + 'the collection bucket; the dock is visual alignment evidence, not a revolute constraint or torque model. Four '
      + 'minimal exterior radial flags remain non-interacting phase witnesses, not torque or tooth-engagement evidence. Voxel '
      + 'solves the machine in the browser as you watch it: the schedule says when the heads move and when each grip opens, and everything that follows -- whether the belt carries the carrier, whether the parts seat, and where the product ends up -- is the solver answering. The consumer fixture still owns each bounded claim and still records its trace as a determinism fixture.',
    placements: [
      {
        id: 'assembly-foundation',
        model: 'studio:machine-works:rail-foundation',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.foundation.grain,
      },
      {
        id: 'belt-drive-west',
        model: 'studio:machine-works:drive-drum',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.westDrum.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.westDrum.grain,
      },
      {
        id: 'belt-drive-east',
        model: 'studio:machine-works:drive-drum',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.eastDrum.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.conveyor.eastDrum.grain,
      },
      ...MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }, index) => ({
        id,
        model: 'studio:machine-works:drive-cog',
        at: machineWorksExposedCogSceneFloorV1(index),
        grain: MACHINE_WORKS_CONVEYOR_V1.drumGrain,
      })),
      ...MACHINE_WORKS_CONVEYOR_SLAT_IDS.map((id, index) => ({
        id,
        model: 'studio:machine-works:conveyor-slat',
        at: machineWorksSlatSceneFloorV1(index),
        grain: MACHINE_WORKS_CONVEYOR_V1.slatGrain,
      })),
      {
        id: MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
        model: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.pressBridge.grain,
      },
      {
        id: MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
        model: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.grain,
      },
      {
        id: 'collection-bucket',
        model: 'studio:machine-works:collection-bucket',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain,
      },
      {
        id: 'assembly-carriage',
        model: 'studio:machine-works:transfer-carriage',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.carriage.grain,
      },
      {
        id: 'core-head',
        model: 'studio:machine-works:insertion-head',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.coreHead.grain,
      },
      {
        id: 'cap-head',
        model: 'studio:machine-works:insertion-head',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.capHead.grain,
      },
      {
        id: 'product-base',
        model: 'studio:machine-works:product-base',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.base.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.base.grain,
      },
      {
        id: 'product-core',
        model: 'studio:machine-works:product-core',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.core.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.core.grain,
      },
      {
        id: 'product-cap',
        model: 'studio:machine-works:product-cap',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.cap.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.cap.grain,
      },
    ],
  };
}

/**
 * One contact sheet per construction family gives every promoted recipe a row
 * of its nearest neighbours. Machine Works is a separate process scene, so its
 * assembly claim is never padded with unrelated specimens.
 */
export function createContrastScenes(): readonly SceneV1[] {
  const familyScenes = CONTRAST_FAMILIES.map((family) => familyScene(
    family,
    CURATED_CONTRAST_RECIPES.filter((entry) => entry.family === family),
  ));
  return [...familyScenes, machineWorksScene()];
}
