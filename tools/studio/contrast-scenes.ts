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

const CELL_SPACING = 22;
const DISPLAY_GRAIN = 0.65;

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
    summary: 'Aqueducts, flood controls, crossings, transit structures, and survey landmarks form '
      + 'a contact sheet for voids, spans, stairs, frames, wheels, and hybrids. The separated models '
      + 'are comparisons, not a claim that water or traffic flows between them.',
  },
  'civic-architectural': {
    id: 'studio:scene:contrast-civic',
    label: 'Civic form studies',
    summary: 'Monuments, arcades, forums, conservatories, pavilions, and kinetic public art form '
      + 'a contact sheet for comparing scale, silhouette, openings, and construction grammar. '
      + 'Their equal-gap placement does not claim that they compose one plaza.',
  },
  'mechanical-industrial': {
    id: 'studio:scene:contrast-mechanical-studies',
    label: 'Mechanical studies',
    summary: 'Eight deliberately different industrial specimens form a comparison floor for silhouette, '
      + 'negative space, construction grammar, scale, and semantic model animation. This is a contact '
      + 'sheet, not a claim that the independent specimens form one working factory.',
  },
  'natural-organic': {
    id: 'studio:scene:contrast-organic',
    label: 'Organic form studies',
    summary: 'Seed-shaped trees, roots, coral, tidal structures, and field shelters form a contact '
      + 'sheet for comparing branching, massing, and negative space. The wind-driven pine exercises '
      + 'the shared scene-animation control, but the separated specimens do not form one habitat.',
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
    placements: entries.map((entry, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        id: placementId(entry),
        model: entry.recipe.id,
        at: [
          (column - (columns - 1) / 2) * CELL_SPACING,
          0,
          (row - (rows - 1) / 2) * CELL_SPACING,
        ],
        turns: index % 4,
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
    summary: 'One consumer-generated fixed-step process drives two Rapier kinematic drums and a closed loop of exact '
      + 'kinematic belt slats from one controller phase. Each slat follows the nominal drum pitch datum while its '
      + 'shortened ends meet the stepped cog-cheek planes without positive-volume overlap. '
      + 'Four exposed axle cogs copy the paired solved-drum poses outside Rapier as non-interacting phase witnesses. '
      + 'Solver contact and friction move an axis-constrained dynamic carrier '
      + 'through two validated insertion stations, where a three-piece signal module is assembled from '
      + 'exact physical sidecars. A visible output hinge then tips the still-colliding carrier so gravity '
      + 'drops the product into its collection bucket. The cog and belt motion visibly share one drive phase; '
      + 'this fixture claims synchronized frictional transport, not simulated gear torque or belt tension. '
      + 'Voxel presents the replay while the consumer owns the bounded physics claim.',
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
        id: 'assembly-gantry',
        model: 'studio:contrast:shipyard-gantry',
        at: MACHINE_WORKS_SCENE_LAYOUT_V1.gantry.at,
        grain: MACHINE_WORKS_SCENE_LAYOUT_V1.gantry.grain,
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
