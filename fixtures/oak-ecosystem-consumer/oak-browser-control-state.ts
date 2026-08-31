import type {
  OakBrowserCameraV1,
  OakBrowserCommandV1,
  OakBrowserInspectionModeV1,
} from './oak-browser-contract.js';
import type { OakSimulationControllerV1 } from './oak-simulation.js';
import type { OakEnvironmentRegimeV1 } from './oak-types.js';

export interface OakBrowserControlPresentationV1 {
  inspectionMode: OakBrowserInspectionModeV1;
  rootCutaway: boolean;
  camera: OakBrowserCameraV1;
}

export interface OakBrowserControlSimulationStateV1 {
  readonly paused: boolean;
  readonly environmentRegime: OakEnvironmentRegimeV1;
}

export interface OakBrowserControlElementV1 {
  readonly dataset: Readonly<{ command?: string; view?: string }>;
  textContent: string | null;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
}

function commandPressed(
  command: OakBrowserCommandV1 | undefined,
  state: OakBrowserControlSimulationStateV1,
  presentation: OakBrowserControlPresentationV1,
): boolean {
  if (command === 'toggle-pause') return state.paused;
  if (command === 'growth-mode') return presentation.inspectionMode === 'growth';
  if (command === 'wind-mode') return presentation.inspectionMode === 'wind';
  if (command === 'root-cutaway') return presentation.rootCutaway;
  if (command === 'low-water') return state.environmentRegime.water === 'low';
  if (command === 'low-n') return state.environmentRegime.nitrogen === 'low';
  if (command === 'low-p') return state.environmentRegime.phosphorus === 'low';
  return false;
}

export function syncOakBrowserControlsV1(
  controls: readonly OakBrowserControlElementV1[],
  viewControls: readonly OakBrowserControlElementV1[],
  state: OakBrowserControlSimulationStateV1,
  presentation: OakBrowserControlPresentationV1,
  navigationFree: boolean,
): void {
  for (const control of controls) {
    const command = control.dataset.command as OakBrowserCommandV1 | undefined;
    if (control.hasAttribute('aria-pressed')) {
      control.setAttribute('aria-pressed', String(commandPressed(command, state, presentation)));
    }
    if (command === 'toggle-pause') control.textContent = state.paused ? 'Resume' : 'Pause';
  }
  for (const control of viewControls) {
    control.setAttribute('aria-pressed', String(
      !navigationFree && control.dataset.view === presentation.camera,
    ));
  }
}

export type OakBrowserEnvironmentCommandV1 = Extract<
  OakBrowserCommandV1,
  'low-water' | 'low-n' | 'low-p'
>;

export function isOakBrowserEnvironmentCommandV1(
  command: OakBrowserCommandV1,
): command is OakBrowserEnvironmentCommandV1 {
  return command === 'low-water' || command === 'low-n' || command === 'low-p';
}

export function toggleOakBrowserEnvironmentV1(
  simulation: Pick<OakSimulationControllerV1, 'snapshot' | 'applyCommand'>,
  command: OakBrowserEnvironmentCommandV1,
): string {
  const resource = command === 'low-water'
    ? 'water'
    : command === 'low-n'
      ? 'nitrogen'
      : 'phosphorus';
  const current = simulation.snapshot().environmentRegime;
  const next: OakEnvironmentRegimeV1 = {
    ...current,
    [resource]: current[resource] === 'low' ? 'ambient' : 'low',
  };
  simulation.applyCommand({ kind: 'set-environment-regime', ...next });
  if (resource === 'water') {
    return 'Water boundary regime changed; stored water was not deleted.';
  }
  if (resource === 'nitrogen') {
    return 'Nitrogen accessibility regime changed; stored nitrogen was not deleted.';
  }
  return 'Phosphorus accessibility regime changed; stored phosphorus was not deleted.';
}
