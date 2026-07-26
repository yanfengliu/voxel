import { element } from './studio-app-helpers.js';

export interface StudioLightingControlV1 {
  readonly element: HTMLButtonElement;
  sync(on: boolean, sceneLightCount: number): void;
}

/** One explicit, accessible lighting state shared by model and scene views. */
export function createStudioLightingControl(): StudioLightingControlV1 {
  const control = element('button', 'toggle');
  control.setAttribute('aria-label', 'Lighting');

  function sync(on: boolean, sceneLightCount: number): void {
    control.textContent = `lighting ${on ? 'on' : 'off'}`;
    control.setAttribute('aria-pressed', String(on));
    control.classList.toggle('on', on);
    control.title = sceneLightCount > 0
      ? on
        ? 'Scene lighting is on. Point lights illuminate models, and bright source cubes show where they are.'
        : 'Scene lighting is off. Dim source cubes remain as edit handles; scene animation controls their movement.'
      : on
        ? 'Lighting is on. Model faces shade under the Studio daylight rig.'
        : 'Lighting is off. Turn it on to shade model faces under the Studio daylight rig.';
  }

  sync(false, 0);
  return { element: control, sync };
}

export function sceneLightingStatusSuffix(lightCount: number, on: boolean): string {
  return lightCount === 0
    ? ''
    : ` · ${String(lightCount)} light${lightCount === 1 ? '' : 's'} · lighting ${on ? 'on' : 'off'}`;
}

export function sceneLightingStageHint(
  base: string,
  lightCount: number,
  on: boolean,
): string {
  if (lightCount === 0) return base;
  return base + (on
    ? ' · lighting on · edit sources in the Edit tab'
    : ' · lighting off · dim source handles do not illuminate models');
}
