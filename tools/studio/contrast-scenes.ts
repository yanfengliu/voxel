import {
  CONTRAST_DOMAINS,
  CURATED_CONTRAST_RECIPES,
  type ContrastDomainV1,
  type CuratedContrastRecipeV1,
} from './contrast-recipes.js';
import {
  VOXEL_SCENE_SCHEMA_V1,
  VOXEL_SCENE_SCHEMA_V4,
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

/** One shared pitch, so the four sheets stay comparable with each other. */
const CELL_SPACING = widestSpecimenSpanV1() + MINIMUM_CLEAR_GAP;

const DOMAIN_PRESENTATION: Readonly<
Record<ContrastDomainV1, {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
}>
> = {
  infrastructure: {
    id: 'studio:scene:contrast-infrastructure',
    label: 'Infrastructure studies',
    summary: 'Aqueducts, culverts, crossings, transit structures, and survey landmarks form '
      + 'a contact sheet for comparing voids, spans, stairs, frames, and hybrid grammar, every '
      + 'specimen facing the same way. All nine are static shapes: the handwheel, floodgate, and '
      + 'lift carry no motion and no operable mechanism, and their separation makes no claim that '
      + 'water or traffic moves between them.',
  },
  'civic-architectural': {
    id: 'studio:scene:contrast-civic',
    label: 'Civic form studies',
    summary: 'Monuments, arcades, forums, conservatories, pavilions, and one moving compass form '
      + 'a contact sheet for comparing scale, silhouette, openings, and construction grammar, every '
      + 'specimen facing the same way. Only the compass moves, and its motion is an authored swing '
      + 'and lift on a fixed period rather than a solved rotation or a reading of anything. Their '
      + 'equal-gap placement does not claim that they compose one plaza.',
  },
  'mechanical-industrial': {
    id: 'studio:scene:contrast-mechanical-studies',
    label: 'Mechanical studies',
    summary: 'Eight deliberately different industrial specimens form a comparison floor for '
      + 'silhouette, negative space, construction grammar, and scale, every specimen facing the '
      + 'same way. Two carry authored motion: the flywheel and the cable drum each rock through a '
      + 'fixed arc and return, which is a swing rather than a turning shaft, and neither transmits '
      + 'power to anything. This is a contact sheet, not a claim that the independent specimens '
      + 'form one working factory.',
  },
  'natural-organic': {
    id: 'studio:scene:contrast-organic',
    label: 'Organic form studies',
    summary: 'Seed-shaped trees, roots, coral, tidal structures, and field shelters form a contact '
      + 'sheet for comparing branching, massing, and negative space, every specimen facing the same '
      + 'way. The pine carries a small authored sway on a fixed period that exercises the shared '
      + 'scene-animation control; no wind is simulated and nothing drives it. The separated '
      + 'specimens do not form one habitat.',
  },
};

function placementId(entry: CuratedContrastRecipeV1): string {
  return entry.recipe.id.slice('studio:contrast:'.length);
}

function domainScene(
  domain: ContrastDomainV1,
  entries: readonly CuratedContrastRecipeV1[],
): SceneV1 {
  const presentation = DOMAIN_PRESENTATION[domain];
  const columns = Math.ceil(Math.sqrt(entries.length));
  const rows = Math.ceil(entries.length / columns);
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id: presentation.id,
    label: presentation.label,
    summary: presentation.summary,
    // Order is the catalog's contrast-family order, so each row group compares
    // within a construction family before the reader compares across families.
    placements: entries.map((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      // A trailing partial row centers on its own item count. Reusing the full
      // column count would push a short last row to one side, which reads as a
      // missing specimen rather than a deliberate end of the sheet.
      const itemsInRow = Math.min(columns, entries.length - row * columns);
      return {
        id: placementId(entry),
        model: entry.recipe.id,
        at: [
          (column - (itemsInRow - 1) / 2) * CELL_SPACING,
          0,
          (row - (rows - 1) / 2) * CELL_SPACING,
        ],
        // Every specimen faces the same way. The board compares silhouette and
        // massing, and a per-index quarter-turn would compare a different face
        // of each model, which is the one thing a contact sheet must not do.
        turns: 0,
        grain: DISPLAY_GRAIN,
      };
    }),
  };
}

function machineWorksScene(): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V4,
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
      + 'presents the replay while the consumer owns each bounded claim.',
    poseReplay: {
      id: 'studio:pose-replay:machine-works',
      durationMs: 30_000,
    },
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
 * Four domain contact sheets give every promoted contrast recipe one honest
 * comparison context. Machine Works is a fifth, separate process scene so its
 * assembly claim is never padded with unrelated specimens.
 */
export function createContrastScenes(): readonly SceneV1[] {
  const domainScenes = CONTRAST_DOMAINS.map((domain) => {
    const entries = CURATED_CONTRAST_RECIPES.filter((entry) => entry.domain === domain);
    return domainScene(domain, entries);
  });
  return [...domainScenes, machineWorksScene()];
}
