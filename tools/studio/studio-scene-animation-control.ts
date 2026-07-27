import { element } from './studio-app-helpers.js';

export interface StudioSceneAnimationControlV1 {
  readonly element: HTMLButtonElement;
  sync(on: boolean): void;
}

/** One explicit, persisted scene-animation choice shared by every scene. */
export function createStudioSceneAnimationControl(): StudioSceneAnimationControlV1 {
  const control = element('button', 'toggle');
  control.setAttribute('aria-label', 'Scene animation');

  function sync(on: boolean): void {
    control.textContent = `animation ${on ? 'enabled' : 'disabled'}`;
    control.setAttribute('aria-pressed', String(on));
    control.classList.toggle('on', on);
    control.title = on
      ? 'Automatic scene animation is enabled independently of lighting. Play/Pause or bare Space reports whether it is currently advancing; exact inspection may pause it transiently.'
      : 'Automatic scene animation is disabled. Animated models and moving light sources stay at the currently presented time.';
  }

  sync(true);
  return { element: control, sync };
}

export function sceneAnimationStatusSuffix(hasMotion: boolean, on: boolean): string {
  return hasMotion ? ` · animation ${on ? 'enabled' : 'disabled'}` : '';
}

export function sceneAnimationStageHint(
  base: string,
  hasMotion: boolean,
  on: boolean,
): string {
  if (!hasMotion) return base;
  return base + (on
    ? ' · animation enabled · Space toggles Play/Pause'
    : ' · animation disabled · scene held at the current time · Space toggles Play/Pause');
}
