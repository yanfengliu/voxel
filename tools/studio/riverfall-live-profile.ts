import type { LivePhysicsProfileV1 } from './live-physics.js';
import { RIVERFALL_SCENE_ID } from './riverfall-flow.js';
import { RIVERFALL_SURFACE_CELLS_V1 } from './riverfall-surface-grid.js';

/**
 * Riverfall's live lane, which owns no rigid bodies at all.
 *
 * Every other live scene declares bodies for the solver to push around. This
 * one declares none, and that is not an oversight: the river is a
 * position-based fluid with its own solver, and the only things on screen that
 * move are 321 surface tiles posed from it. A tile is not a body — it never
 * collides, never falls, and never touches anything — so giving it one would
 * be a lie the picture could not audit.
 *
 * What the empty profile buys is the lane itself: the fixed-tick clock, the
 * pause-and-settle that lets a browser proof reach a reproducible frame, the
 * status line that says the scene is solved rather than decoded, and the
 * read-only rule that stops someone dragging a tile the fluid owns. The world
 * it builds is an empty Rapier world stepping at the shared rate, which costs
 * almost nothing and keeps this scene on exactly the same clock as the mill,
 * the machine and the chain.
 *
 * The water itself is advanced by the presentation driver in
 * `live-presentation.ts`, once per fixed tick, from that clock.
 */
export const RIVERFALL_LIVE_PROFILE_V1: LivePhysicsProfileV1 = Object.freeze({
  sceneId: RIVERFALL_SCENE_ID,
  bodies: [],
  /**
   * Every surface tile, declared as posed by this scene rather than authored.
   *
   * Nothing reads these centres — the profile builds no bodies — and that is
   * the point of listing them anyway: `poses` is how a scene says which
   * placements the authored document no longer decides. Two things follow from
   * it, and both are wanted here. The scene becomes read-only, so nobody drags
   * a tile the fluid owns and watches it snap back on the next frame. And the
   * authored-overlap check stops judging tiles for sinking into the underfill
   * they are designed to sink into: a tile embeds itself in the same-colour
   * water beneath as the reconstructed field falls, which is the look working,
   * not two models fighting for the same space.
   */
  poses: Object.fromEntries(RIVERFALL_SURFACE_CELLS_V1.map((cell) => [
    cell.id,
    { centre: cell.baseTranslation },
  ])),
});
