import { buildRecipe, type PartShelfV1, type RecipeBookV1 } from './recipe.js';
import { modelVoxelSizeV1 } from './model.js';
import {
  LivePhysicsSessionV1,
  type LivePhysicsProfileV1,
  type LivePlacementSourceV1,
} from './live-physics.js';
import { LIVE_PHYSICS_PROFILES_V1 } from './live-physics-profiles.js';
import type { ValidatedScenePlacementPoseMapV1 } from './scene-pose-delta.js';
import type { RayV1 } from './scene-pick.js';
import {
  sampleValidatedScenePoseReplayV1OrV2,
} from './scene-pose-replay-sampling.js';
import type {
  SampledScenePosePlacementV1,
  ScenePoseReplayV1OrV2,
} from './scene-pose-replay.js';
import type { SceneV1 } from './scene.js';

/**
 * The Adjust / Interact mode controller for the Studio stage.
 *
 * Adjust is the editing pointer: left-drag selects and moves placements.
 * Interact hands the pointer to a live solver instead: left-drag grabs a
 * point on a dynamic body and pulls it against a spring, and on scenes with a
 * spawner a clean click releases the next ball at the clicked point.
 *
 * A scene with a live profile opens in Interact, because testing the physics
 * by hand is what such a scene is for; editing stays one button away. Scenes
 * without a profile never show the buttons and keep today's behaviour.
 */

export type StudioStageModeV1 = 'adjust' | 'interact';

export interface StudioLiveInteractHooksV1 {
  /** Applies live poses to the open scene session. */
  readonly acceptPoses: (poses: ValidatedScenePlacementPoseMapV1) => void;
  /** Suspends (true) or restores (false) the scene's replay pose lane. */
  readonly setLivePoseMode: (on: boolean) => void;
  /** Redraws the stage after poses land. */
  readonly redraw: () => void;
  /** Reports a user-visible live-mode failure. */
  readonly report: (message: string) => void;
  /**
   * The pointer's meaning changed — a mode switch, a scene open, or the live
   * world coming up — so anything teaching what the pointer does can catch up.
   */
  readonly modeChanged?: () => void;
}

export interface StudioLiveInteractStateV1 {
  readonly available: boolean;
  readonly mode: StudioStageModeV1;
  readonly running: boolean;
  readonly bodies: number;
  readonly colliders: number;
  readonly joints: number;
  readonly spawned: number;
  readonly grabbed: string | null;
  readonly stepped: number;
  /**
   * Live body centres by placement id. This is solver truth for assertions;
   * the scene's authored placements never move in Interact, which is the
   * sandbox boundary working as intended.
   */
  readonly positions: Readonly<Record<string, readonly [number, number, number]>>;
}

function livePlacementSourcesV1(
  scene: SceneV1,
  profile: LivePhysicsProfileV1,
  recipes: RecipeBookV1,
  parts: PartShelfV1,
  poseReplay: ScenePoseReplayV1OrV2 | null,
): readonly LivePlacementSourceV1[] {
  const planned = new Set(profile.bodies.map((plan) => plan.placementId));
  // On a replay scene the recorded opening poses are the truth about where
  // the bodies stand and how they lie — the chain's links thread only when
  // each lies tilted along its catenary tangent, which a placement cannot
  // express. The live world therefore starts exactly where the recording
  // started, and the sandbox re-lives the recorded story from its opening.
  const opening = new Map<string, SampledScenePosePlacementV1>(
    poseReplay === null
      ? []
      : sampleValidatedScenePoseReplayV1OrV2(poseReplay, 0)
        .placements.map((pose) => [pose.placementId, pose]),
  );
  return scene.placements
    .filter((placement) => planned.has(placement.id))
    .map((placement) => {
      const recipe = recipes[placement.model];
      if (recipe === undefined) {
        throw new Error(
          `Live physics for '${scene.id}' cannot build '${placement.id}': its `
          + `model '${placement.model}' is not in the recipe book.`,
        );
      }
      const model = buildRecipe(recipe, parts, recipes).model;
      const grain = placement.grain ?? modelVoxelSizeV1(model);
      // Scene geometry pivots at the model centre and placements anchor the
      // base at `at.y`, so the body centre sits half the model height above.
      const halfHeight = (model.size[1] * grain) / 2;
      const recorded = opening.get(placement.id);
      return {
        placementId: placement.id,
        model,
        grain,
        centre: recorded?.translation ?? [
          placement.at[0],
          placement.at[1] + halfHeight,
          placement.at[2],
        ] as const,
        ...(recorded === undefined ? {} : {
          rotation: recorded.quaternion,
          linearVelocity: recorded.linearVelocity,
          angularVelocity: recorded.angularVelocity,
        }),
      };
    });
}

export class StudioLiveInteract {
  readonly #hooks: StudioLiveInteractHooksV1;
  readonly #adjustButton: HTMLButtonElement;
  readonly #interactButton: HTMLButtonElement;
  #mode: StudioStageModeV1 = 'adjust';
  #profile: LivePhysicsProfileV1 | null = null;
  #session: LivePhysicsSessionV1 | null = null;
  #opening = 0;
  #frameHandle: number | null = null;
  #lastFrameMs: number | null = null;
  #grabbing = false;
  #disposed = false;

  constructor(hooks: StudioLiveInteractHooksV1) {
    this.#hooks = hooks;
    this.#adjustButton = document.createElement('button');
    this.#adjustButton.className = 'toggle';
    this.#adjustButton.textContent = 'adjust';
    this.#adjustButton.title =
      'The editing pointer: left-drag selects and moves models in the scene.';
    this.#interactButton = document.createElement('button');
    this.#interactButton.className = 'toggle';
    this.#interactButton.textContent = 'interact';
    this.#interactButton.title =
      'The physics pointer: left-drag grabs a point on a moving part and '
      + 'pulls it against a live solver. Nothing is recorded.';
    this.#adjustButton.hidden = true;
    this.#interactButton.hidden = true;
    this.#adjustButton.addEventListener('click', () => {
      this.setMode('adjust');
    });
    this.#interactButton.addEventListener('click', () => {
      this.setMode('interact');
    });
    this.#reflectButtons();
  }

  get buttons(): readonly [HTMLButtonElement, HTMLButtonElement] {
    return [this.#adjustButton, this.#interactButton];
  }

  /** Interact is active and owns the left pointer. */
  handlesPointer(): boolean {
    return this.#mode === 'interact' && this.#session !== null;
  }

  mode(): StudioStageModeV1 {
    return this.#mode;
  }

  state(): StudioLiveInteractStateV1 {
    const session = this.#session;
    const base = {
      available: this.#profile !== null,
      mode: this.#mode,
      running: session !== null,
    };
    if (session === null) {
      return {
        ...base,
        bodies: 0,
        colliders: 0,
        joints: 0,
        spawned: 0,
        grabbed: null,
        stepped: 0,
        positions: {},
      };
    }
    return {
      ...base,
      ...session.state(),
      positions: Object.fromEntries(
        [...session.poses()].map(([placementId, pose]) =>
          [placementId, pose.translation]),
      ),
    };
  }

  /**
   * Adopts the newly opened scene. Returns immediately; the solver world
   * builds in the background and the stage keeps drawing authored poses until
   * the first live frame lands. A replay scene passes its resolved replay so
   * the live bodies start at the recording's opening poses.
   */
  openScene(
    scene: SceneV1 | null,
    recipes: RecipeBookV1,
    parts: PartShelfV1,
    poseReplay: ScenePoseReplayV1OrV2 | null = null,
  ): void {
    this.#closeSession();
    this.#profile = scene === null
      ? null
      : LIVE_PHYSICS_PROFILES_V1[scene.id] ?? null;
    // A live scene exists to be poked, so Interact is its default; the user
    // asked for Adjust to be the opt-in, not the other way around.
    this.#mode = this.#profile === null ? 'adjust' : 'interact';
    this.#reflectButtons();
    this.#hooks.modeChanged?.();
    if (scene === null || this.#profile === null) return;
    const opening = this.#opening + 1;
    this.#opening = opening;
    const profile = this.#profile;
    void (async () => {
      try {
        const sources =
          livePlacementSourcesV1(scene, profile, recipes, parts, poseReplay);
        const session = await LivePhysicsSessionV1.create(profile, sources);
        if (this.#disposed || this.#opening !== opening
          || this.#profile !== profile) {
          session.dispose();
          return;
        }
        this.#session = session;
        if (this.#mode === 'interact') {
          this.#hooks.setLivePoseMode(true);
          this.#startLoop();
        }
        this.#hooks.modeChanged?.();
      } catch (error) {
        this.#hooks.report(
          `Interact mode could not start its live world: `
          + (error instanceof Error ? error.message : String(error)),
        );
      }
    })();
  }

  setMode(mode: StudioStageModeV1): void {
    if (this.#profile === null) {
      this.#mode = 'adjust';
      this.#reflectButtons();
      return;
    }
    this.#mode = mode;
    if (mode === 'adjust') {
      // Adjust hands poses back to the replay lane; the live world pauses
      // where it is and resumes if Interact returns.
      this.#session?.release();
      this.#stopLoop();
      this.#hooks.setLivePoseMode(false);
    } else if (this.#session !== null) {
      this.#hooks.setLivePoseMode(true);
      this.#startLoop();
    }
    this.#reflectButtons();
    this.#hooks.modeChanged?.();
  }

  #stopLoop(): void {
    if (this.#frameHandle !== null) {
      cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
    this.#lastFrameMs = null;
  }

  /** Left pointer went down in Interact: grab if the ray hits a dynamic body. */
  pointerDown(ray: RayV1): boolean {
    const session = this.#session;
    if (!this.handlesPointer() || session === null) return false;
    const grab = session.grab(ray.origin, ray.direction);
    this.#grabbing = grab !== null;
    return this.#grabbing;
  }

  pointerMove(ray: RayV1): void {
    if (!this.#grabbing) return;
    this.#session?.moveGrab(ray.origin, ray.direction);
  }

  /**
   * Left pointer released. A clean click (no grab, no drag) on a spawner
   * scene releases the next ball under the rail at the clicked x.
   */
  pointerUp(ray: RayV1, wasClick: boolean): void {
    const session = this.#session;
    if (session === null) return;
    if (this.#grabbing) {
      session.release();
      this.#grabbing = false;
      return;
    }
    const spawn = this.#profile?.spawn;
    if (!wasClick || spawn === undefined || !this.handlesPointer()) return;
    // The user is pointing at the rail, which lives in the z = 0 plane — so
    // the release x is where the click ray crosses that plane. Intersecting
    // the horizontal drop-height plane instead reads several units off-axis
    // under a yawed, pitched camera and pins every release to the clamp edge.
    const oz = ray.origin[2];
    const dz = ray.direction[2];
    if (Math.abs(dz) < 1e-9) return;
    const t = -oz / dz;
    if (t <= 0) return;
    session.spawnAt(ray.origin[0] + ray.direction[0] * t);
  }

  #startLoop(): void {
    if (this.#frameHandle !== null) return;
    const frame = (nowMs: number): void => {
      this.#frameHandle = null;
      const session = this.#session;
      if (this.#disposed || session === null) return;
      const elapsed = this.#lastFrameMs === null
        ? 0
        : nowMs - this.#lastFrameMs;
      this.#lastFrameMs = nowMs;
      try {
        session.step(elapsed);
        this.#hooks.acceptPoses(session.poses());
        this.#hooks.redraw();
      } catch (error) {
        this.#hooks.report(
          `Interact mode stopped: `
          + (error instanceof Error ? error.message : String(error)),
        );
        this.#closeSession();
        return;
      }
      this.#frameHandle = requestAnimationFrame(frame);
    };
    this.#frameHandle = requestAnimationFrame(frame);
  }

  #closeSession(): void {
    this.#stopLoop();
    this.#grabbing = false;
    this.#session?.dispose();
    this.#session = null;
  }

  #reflectButtons(): void {
    const available = this.#profile !== null;
    this.#adjustButton.hidden = !available;
    this.#interactButton.hidden = !available;
    this.#adjustButton.classList.toggle('on', available && this.#mode === 'adjust');
    this.#interactButton.classList.toggle(
      'on',
      available && this.#mode === 'interact',
    );
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#closeSession();
    this.#profile = null;
  }
}
