import type { Page } from '@playwright/test';

import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type {
  WindmillPurposeEntryV1,
} from '../../tools/studio/windmill-purpose.js';
import {
  WINDMILL_POSE_REPLAY_ID,
  WINDMILL_SCENE_ID,
} from '../../tools/studio/windmill-layout.js';

interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

interface BrowserPhysicalModule {
  readonly WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1:
    Readonly<Record<string, Readonly<Record<string, number>>>>;
}

interface BrowserPurposeModule {
  readonly WINDMILL_PURPOSE_LEDGER_V1:
    readonly WindmillPurposeEntryV1[];
}

interface BrowserSystemPurposeModule {
  readonly WINDMILL_SYSTEM_PURPOSE_LEDGER_V1: readonly {
    readonly id: string;
    readonly beneficiary: string;
    readonly job: string;
    readonly locationDatum: string;
    readonly removalFailure: string;
    readonly relocationFailure: string;
    readonly smallestAdequateForm: string;
    readonly evidence: string;
    readonly honestyBoundary: string;
    readonly selectedDynamicProof: unknown;
  }[];
  readonly WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1: {
    readonly candidateParameterKey: string;
    readonly nominalEvaluationSha256: string;
    readonly proofSha256: string;
    readonly selectionSha256: string;
    readonly establishes: readonly string[];
    readonly honestyBoundary: string;
  };
}

interface BrowserProductionPurposeModule {
  readonly WINDMILL_PRODUCTION_HONESTY_V1: string;
  readonly WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1: readonly {
    readonly id: string;
    readonly needId: string;
    readonly boxKey: string;
    readonly recipeId: string;
    readonly beneficiary: string;
    readonly job: string;
    readonly locationDatum: string;
    readonly removalFailure: string;
    readonly relocationFailure: string;
    readonly smallestAdequateForm: string;
    readonly evidence: string;
    readonly honestyBoundary: string;
    readonly boxes: readonly { readonly boxKey: string }[];
  }[];
  readonly WINDMILL_PRODUCTION_VOID_PURPOSES_V1: readonly {
    readonly id: string;
    readonly voidKey: string;
    readonly recipeId: string;
    readonly job: string;
    readonly fillFailure: string;
    readonly honestyBoundary: string;
  }[];
  readonly WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1: readonly {
    readonly id: string;
    readonly kind: string;
    readonly subjectIds: readonly string[];
    readonly honestyBoundary: string;
  }[];
}

interface BrowserGeneratedReplayModule {
  readonly WINDMILL_POSE_REPLAY_ID: string;
  readonly WINDMILL_POSE_REPLAY: {
    readonly events: readonly {
      readonly id: string;
      readonly type: string;
      readonly timeMs: number;
      readonly placementId: string;
      readonly otherPlacementId: string;
      readonly point: readonly [number, number, number];
      readonly normal: readonly [number, number, number];
      readonly normalImpulse: number;
    }[];
  };
}

interface BrowserProductionLayoutModule {
  readonly WINDMILL_PRODUCTION_PLACEMENT_IDS_V1: {
    readonly building: string;
    readonly flourBin: string;
    readonly wheatSacks: readonly string[];
    readonly flourHeap: string;
  };
  readonly WINDMILL_PRODUCTION_ASSETS_V1: readonly {
    readonly recipeId: string;
    readonly boxes: readonly { readonly boxKey: string }[];
  }[];
}

export async function inspectWindmillPurposeEvidence(page: Page) {
  return page.evaluate(async ({ sceneId, replayId }) => {
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const physicalUrl =
      new URL('windmill-physical-assets.ts', window.location.href).href;
    const purposeUrl =
      new URL('windmill-purpose.ts', window.location.href).href;
    const systemPurposeUrl =
      new URL('windmill-system-purpose.ts', window.location.href).href;
    const productionPurposeUrl =
      new URL('windmill-production-purpose.ts', window.location.href).href;
    const productionLayoutUrl =
      new URL('windmill-production-layout.ts', window.location.href).href;
    const { createStudioCatalog } =
      await import(catalogUrl) as unknown as BrowserCatalogModule;
    const physicalModule =
      await import(physicalUrl) as unknown as BrowserPhysicalModule;
    const purposeModule =
      await import(purposeUrl) as unknown as BrowserPurposeModule;
    const systemPurposeModule =
      await import(systemPurposeUrl) as unknown as BrowserSystemPurposeModule;
    const productionPurposeModule = await import(productionPurposeUrl) as
      unknown as BrowserProductionPurposeModule;
    const productionLayoutModule = await import(productionLayoutUrl) as
      unknown as BrowserProductionLayoutModule;
    const catalog = createStudioCatalog();
    const scene = catalog.scenes?.find(({ id }) => id === sceneId);
    if (scene === undefined) {
      throw new Error(`Cannot inspect Windmill purpose: scene '${sceneId}' is absent.`);
    }
    // The mill's contact evidence comes from the committed determinism trace,
    // imported here rather than read from the catalog: the shelf's scene
    // solves live and ships no recording, and the exhaustive-search proof this
    // ledger is bound to is a property of that trace either way.
    const replayUrl =
      new URL('generated-windmill-replay.ts', window.location.href).href;
    const { WINDMILL_POSE_REPLAY: replay, WINDMILL_POSE_REPLAY_ID: traceId } =
      await import(replayUrl) as unknown as BrowserGeneratedReplayModule;
    if (traceId !== replayId) {
      throw new Error(
        `Windmill purpose evidence expected trace '${replayId}', found '${traceId}'.`,
      );
    }
    const placement = (id: string) => {
      const found = scene.placements.find((candidate) => candidate.id === id);
      if (found === undefined) {
        throw new Error(`Windmill purpose needs placement '${id}'.`);
      }
      return found;
    };
    const shelfEntry = (modelId: string) => {
      const found = catalog.sections
        .flatMap(({ models }) => models)
        .find(({ id }) => id === modelId);
      if (found === undefined) {
        throw new Error(
          `Windmill purpose needs shelf model '${modelId}'.`,
        );
      }
      return found;
    };
    const inspect = (placementId: string) => {
      const placed = placement(placementId);
      const entry = shelfEntry(placed.model);
      const model = entry.load();
      const made = entry.howItsMade();
      const recipe = made.recipe;
      const physical = made.physical?.[recipe.id];
      if (physical === undefined) {
        throw new Error(
          `Windmill model '${recipe.id}' has no physical sidecar in its shelf entry.`,
        );
      }
      const colliderIndices =
        physicalModule.WINDMILL_COLLIDER_INDEX_BY_BOX_KEY_V1[recipe.id];
      if (colliderIndices === undefined) {
        throw new Error(
          `Windmill model '${recipe.id}' has no exact box-key collider map.`,
        );
      }
      const boxKeyByIndex = new Map(
        Object.entries(colliderIndices).map(([boxKey, index]) =>
          [index, boxKey] as const),
      );
      const roleMatches = (pattern: RegExp): boolean[] => model.voxels.map(
        (slot) => slot !== 0 && pattern.test(recipe.roles[slot] ?? ''),
      );
      const roleCount = (pattern: RegExp): number =>
        roleMatches(pattern).filter(Boolean).length;
      const componentCount = (pattern: RegExp): number => {
        const matches = roleMatches(pattern);
        const visited = new Uint8Array(matches.length);
        const [sizeX, sizeY, sizeZ] = model.size;
        const indexOf = (x: number, y: number, z: number): number =>
          x + sizeX * (y + sizeY * z);
        let components = 0;
        for (let index = 0; index < matches.length; index += 1) {
          if (!matches[index] || visited[index] === 1) continue;
          components += 1;
          const queue = [index];
          visited[index] = 1;
          while (queue.length > 0) {
            const current = queue.pop()!;
            const x = current % sizeX;
            const yz = Math.floor(current / sizeX);
            const y = yz % sizeY;
            const z = Math.floor(yz / sizeY);
            for (const [dx, dy, dz] of [
              [-1, 0, 0], [1, 0, 0], [0, -1, 0],
              [0, 1, 0], [0, 0, -1], [0, 0, 1],
            ] as const) {
              const nx = x + dx;
              const ny = y + dy;
              const nz = z + dz;
              if (nx < 0 || nx >= sizeX || ny < 0 || ny >= sizeY
                || nz < 0 || nz >= sizeZ) continue;
              const neighbor = indexOf(nx, ny, nz);
              if (!matches[neighbor] || visited[neighbor] === 1) continue;
              visited[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
        return components;
      };
      let minimumOccupiedY = Number.POSITIVE_INFINITY;
      model.voxels.forEach((slot, index) => {
        if (slot === 0) return;
        const y = Math.floor(index / model.size[0]) % model.size[1];
        minimumOccupiedY = Math.min(minimumOccupiedY, y);
      });
      const grain = placed.grain ?? model.voxelSize ?? 1;
      return {
        placement: placed,
        recipeId: recipe.id,
        label: recipe.label,
        summary: recipe.summary ?? '',
        notes: recipe.steps.map(({ note }) => note ?? ''),
        roles: recipe.roles,
        bodies: physical.bodies.map(({ key, type }) => ({ key, type })),
        ports: physical.ports.map(({ key, frame }) => ({
          key,
          position: frame.position,
        })),
        colliders: physical.colliders.map(({ body, shape }, index) => ({
          index,
          boxKey: boxKeyByIndex.get(index) ?? null,
          body,
          kind: shape.kind,
        })),
        boxKeys: Object.keys(colliderIndices),
        colliderCount: physical.colliders.length,
        minimumOccupiedWorldY: placed.at[1] + minimumOccupiedY * grain,
        sailComponents: componentCount(/^sail-panel$/i),
        sailVoxels: roleCount(/^sail-panel$/i),
        bearingVoxels: roleCount(/bearing/i),
        hammerHeadVoxels: roleCount(/impact-toe|impact-head-mass/i),
        anvilFaceVoxels: roleCount(/^impact-face$/i),
      };
    };
    const productionIds =
      productionLayoutModule.WINDMILL_PRODUCTION_PLACEMENT_IDS_V1;
    const inspectProduction = (placementId: string) => {
      const placed = placement(placementId);
      const entry = shelfEntry(placed.model);
      const made = entry.howItsMade();
      const physical = made.physical?.[made.recipe.id];
      if (physical === undefined) {
        throw new Error(
          `Windmill production model '${made.recipe.id}' has no sidecar.`,
        );
      }
      const layout = productionLayoutModule.WINDMILL_PRODUCTION_ASSETS_V1
        .find((asset) => asset.recipeId === made.recipe.id);
      if (layout === undefined) {
        throw new Error(
          `Windmill production model '${made.recipe.id}' has no layout asset.`,
        );
      }
      return {
        placement: placed,
        recipeId: made.recipe.id,
        label: made.recipe.label,
        boxKeys: layout.boxes.map(({ boxKey }) => boxKey),
        bodyTypes: physical.bodies.map(({ type }) => type),
        colliderCount: physical.colliders.length,
      };
    };
    return {
      summary: scene.summary ?? '',
      frame: inspect('windmill-frame'),
      rotor: inspect('windmill-rotor'),
      hammer: inspect('trip-hammer'),
      anvil: inspect('windmill-anvil'),
      purposeLedger: purposeModule.WINDMILL_PURPOSE_LEDGER_V1,
      systemPurposeLedger:
        systemPurposeModule.WINDMILL_SYSTEM_PURPOSE_LEDGER_V1,
      systemDynamicProofBinding:
        systemPurposeModule.WINDMILL_SYSTEM_DYNAMIC_PROOF_BINDING_V1,
      contactEvents: replay.events
        .filter(({ type }) => type === 'contact')
        .map((event) => ({ ...event })),
      production: {
        building: inspectProduction(productionIds.building),
        flourBin: inspectProduction(productionIds.flourBin),
        firstSack: inspectProduction(productionIds.wheatSacks[0]!),
        flourHeap: inspectProduction(productionIds.flourHeap),
        sackPlacementIds: productionIds.wheatSacks.map((id) =>
          placement(id).id),
        honesty: productionPurposeModule.WINDMILL_PRODUCTION_HONESTY_V1,
        ledger:
          productionPurposeModule.WINDMILL_PRODUCTION_PURPOSE_LEDGER_V1,
        voidLedger:
          productionPurposeModule.WINDMILL_PRODUCTION_VOID_PURPOSES_V1,
        systemLedger:
          productionPurposeModule.WINDMILL_PRODUCTION_SYSTEM_PURPOSES_V1,
      },
    };
  }, {
    sceneId: WINDMILL_SCENE_ID,
    replayId: WINDMILL_POSE_REPLAY_ID,
  });
}
