import { element } from './studio-app-helpers.js';

export interface StudioSceneAnimationControlV1 {
  readonly element: HTMLButtonElement;
  sync(on: boolean): void;
}

/**
 * One explicit, persisted choice about whether a scene advances, shared by
 * every scene.
 *
 * It says "simulation", not "animation", because nothing here is a recording:
 * a scene that moves is a scene being solved, and calling that an animation
 * invites a reader to think a file is being played. The word is the owner's.
 *
 * One switch covers every way a scene moves — authored motion, moving lights,
 * and the live solver. Two switches for one question is how Machine Works
 * ended up with none: it has no animated recipe and no light, so the switch
 * that only knew about those decided the scene could not move.
 */
export function createStudioSceneAnimationControl(): StudioSceneAnimationControlV1 {
  const control = element('button', 'toggle');
  control.setAttribute('aria-label', 'Scene simulation');

  function sync(on: boolean): void {
    control.textContent = `simulation ${on ? 'on' : 'off'}`;
    control.setAttribute('aria-pressed', String(on));
    control.classList.toggle('on', on);
    control.title = on
      ? 'The scene advances on its own, independently of lighting: authored motion, moving lights, and the live solver alike. Play/Pause or bare Space reports whether it is currently running; exact inspection may pause it transiently.'
      : 'The scene is held still. Moving models, moving light sources, and the live solver all stay where they are.';
  }

  sync(true);
  return { element: control, sync };
}

export function sceneAnimationStatusSuffix(hasMotion: boolean, on: boolean): string {
  return hasMotion ? ` · simulation ${on ? 'on' : 'off'}` : '';
}

export function sceneAnimationStageHint(
  base: string,
  hasMotion: boolean,
  on: boolean,
): string {
  if (!hasMotion) return base;
  return base + (on
    ? ' · simulation on · Space toggles Play/Pause'
    : ' · simulation off · scene held at the current time · Space toggles Play/Pause');
}
