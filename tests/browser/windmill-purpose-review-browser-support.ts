import type { Page } from '@playwright/test';

import type { StudioCatalogV1 } from '../../tools/studio/catalog.js';
import type { StudioModelV1 } from '../../tools/studio/model.js';
import type {
  PartShelfV1,
  RecipeBookV1,
  RecipeV1,
} from '../../tools/studio/recipe.js';
import type { SceneV1 } from '../../tools/studio/scene.js';
import type {
  StudioHandleV1,
  StudioMountOptionsV1,
} from '../../tools/studio/studio-app.js';
import type { WindmillCameraV1 } from './windmill-browser-support.js';

interface BrowserPurposeReviewModule {
  readonly createWindmillPurposeReviewVariantsV1: () => readonly {
    readonly artifact: 'recipe' | 'scene';
    readonly id: string;
    readonly label: string;
    readonly reviewKind: 'relocation' | 'simplification';
    readonly sourceRecipeId?: string;
    readonly purposeIds: readonly string[];
    readonly expectedFailure: string;
    readonly recipe?: RecipeV1;
    readonly scene?: SceneV1;
  }[];
}

interface BrowserRecipeModule {
  readonly buildRecipe: (
    recipe: RecipeV1,
    parts: PartShelfV1,
    book: RecipeBookV1,
  ) => { readonly model: StudioModelV1 };
}

interface BrowserPartsModule {
  readonly createStudioParts: () => PartShelfV1;
}

interface BrowserRecipesModule {
  readonly createStudioRecipeBook: () => RecipeBookV1;
}

interface BrowserCatalogModule {
  readonly createStudioCatalog: () => StudioCatalogV1;
}

interface BrowserStudioModule {
  readonly mountStudio: (options: StudioMountOptionsV1) => StudioHandleV1;
}

export async function loadWindmillRecipeReviewVariant(
  page: Page,
  variantId: string,
  camera: WindmillCameraV1,
) {
  return page.evaluate(async ({ requestedVariantId, requestedCamera }) => {
    const focused = window as Window & {
      windmillFocused?: {
        readonly harness: NonNullable<Window['voxelStudio']>;
      };
    };
    const harness = focused.windmillFocused?.harness;
    if (harness === undefined) {
      throw new Error(
        `Cannot load Windmill purpose review '${requestedVariantId}': the focused mount is absent.`,
      );
    }
    const purposeUrl = new URL('windmill-purpose-review.ts', window.location.href).href;
    const recipeUrl = new URL('recipe.ts', window.location.href).href;
    const partsUrl = new URL('parts.ts', window.location.href).href;
    const recipesUrl = new URL('recipes.ts', window.location.href).href;
    const purpose = await import(purposeUrl) as unknown as BrowserPurposeReviewModule;
    const recipe = await import(recipeUrl) as unknown as BrowserRecipeModule;
    const parts = await import(partsUrl) as unknown as BrowserPartsModule;
    const recipes = await import(recipesUrl) as unknown as BrowserRecipesModule;
    const variant = purpose.createWindmillPurposeReviewVariantsV1()
      .find(({ id }) => id === requestedVariantId);
    if (variant === undefined) {
      throw new Error(`Windmill purpose review '${requestedVariantId}' does not exist.`);
    }
    if (variant.artifact !== 'recipe' || variant.recipe === undefined) {
      throw new Error(
        `Windmill purpose review '${requestedVariantId}' is a scene, not a recipe model.`,
      );
    }
    const built = recipe.buildRecipe(
      variant.recipe,
      parts.createStudioParts(),
      recipes.createStudioRecipeBook(),
    ).model;
    harness.load(built);
    harness.setViewCenter(requestedCamera.center);
    harness.setViewAngles(requestedCamera.view);
    return {
      id: variant.id,
      label: variant.label,
      reviewKind: variant.reviewKind,
      sourceRecipeId: variant.sourceRecipeId,
      purposeIds: variant.purposeIds,
      expectedFailure: variant.expectedFailure,
      occupiedVoxels: built.voxels.filter((slot) => slot !== 0).length,
      camera: {
        center: harness.viewCenter(),
        view: harness.viewState(),
      },
    };
  }, {
    requestedVariantId: variantId,
    requestedCamera: camera,
  });
}

export async function mountWindmillSceneReviewVariant(
  page: Page,
  studioOrigin: string,
  variantId: string,
) {
  await page.setViewportSize({ width: 1280, height: 800 });
  const response = await page.goto(studioOrigin, { waitUntil: 'load' });
  if (!response?.ok()) {
    throw new Error(
      `Cannot mount Windmill scene review '${variantId}': navigation returned ${
        response === null ? 'no response' : String(response.status())
      }.`,
    );
  }
  await page.waitForFunction(() => typeof window.voxelStudio === 'object');
  return page.evaluate(async ({ requestedVariantId }) => {
    const purposeUrl = new URL('windmill-purpose-review.ts', window.location.href).href;
    const studioUrl = new URL('studio-app.ts', window.location.href).href;
    const catalogUrl = new URL('catalog.ts', window.location.href).href;
    const purpose = await import(purposeUrl) as unknown as BrowserPurposeReviewModule;
    const { mountStudio } = await import(studioUrl) as unknown as BrowserStudioModule;
    const { createStudioCatalog } = await import(catalogUrl) as unknown as BrowserCatalogModule;
    const variant = purpose.createWindmillPurposeReviewVariantsV1()
      .find(({ id }) => id === requestedVariantId);
    if (variant === undefined) {
      throw new Error(`Windmill purpose review '${requestedVariantId}' does not exist.`);
    }
    if (variant.artifact !== 'scene' || variant.scene?.schemaVersion !== 'studio.scene/3') {
      throw new Error(
        `Windmill purpose review '${requestedVariantId}' is not an explicit static V3 relocation.`,
      );
    }
    const staticScene: SceneV1 = variant.scene;
    const canonicalCatalog = createStudioCatalog();
    const reviewCatalog: StudioCatalogV1 = {
      ...canonicalCatalog,
      scenes: [
        ...(canonicalCatalog.scenes ?? []).filter(({ id }) => id !== staticScene.id),
        staticScene,
      ],
    };
    const root = document.createElement('div');
    root.dataset.windmillFocused = '';
    root.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#10161a';
    document.body.append(root);
    const studio = mountStudio({
      root,
      catalog: reviewCatalog,
      publishHarness: false,
    });
    const focusedWindow = window as Window & { windmillFocused?: StudioHandleV1 };
    focusedWindow.windmillFocused = studio;
    try {
      studio.harness.openScene(staticScene.id);
      studio.harness.setLit(true);
      studio.harness.setDepth(true);
      studio.harness.setEdges(false);
      studio.harness.setSceneAnimation(false);
      studio.harness.drawAt(0);
      return {
        id: variant.id,
        label: variant.label,
        purposeIds: variant.purposeIds,
        expectedFailure: variant.expectedFailure,
        sceneId: staticScene.id,
        placements: staticScene.placements.map(({ id, at }) => ({ id, at })),
        defaultCamera: {
          center: studio.harness.viewCenter(),
          view: studio.harness.viewState(),
        },
        privateCanvases: root.querySelectorAll('canvas').length,
      };
    } catch (error) {
      studio.dispose();
      delete focusedWindow.windmillFocused;
      root.remove();
      throw error;
    }
  }, { requestedVariantId: variantId });
}
