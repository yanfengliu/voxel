import type { VoxelStudioHarnessV1 } from './harness.js';
import type { StudioModelV1 } from './model.js';
import { AMPLITUDES, element, labelled } from './studio-app-helpers.js';

/**
 * The Motion tab: how the model moves. Style and timing on top, then one
 * slider per animated amount grouped into Turn, Slide, and Stretch. Every
 * slider writes through the harness, so the movement the panel sets is the
 * movement the agent can read back.
 */

export interface StudioMotionPanelDepsV1 {
  readonly harness: VoxelStudioHarnessV1;
}

export interface StudioMotionPanelV1 {
  readonly pane: HTMLElement;
  /** Moves every control to match the open model. Called on refresh. */
  syncFromModel(model: StudioModelV1): void;
}

export function createStudioMotionPanel(deps: StudioMotionPanelDepsV1): StudioMotionPanelV1 {
  const { harness } = deps;

  const styleSelect = element('select', 'speed');
  for (const [value, label] of [
    ['swing', 'Swings back and forth'],
    ['turn', 'Turns all the way around'],
  ] as const) {
    const option = element('option');
    option.value = value;
    option.textContent = label;
    styleSelect.appendChild(option);
  }
  const periodInput = element('input', 'slider');
  periodInput.type = 'range';
  periodInput.min = '0';
  periodInput.max = '4000';
  periodInput.step = '50';
  const phaseInput = element('input', 'slider');
  phaseInput.type = 'range';
  phaseInput.min = '-180';
  phaseInput.max = '180';

  const amplitudeInputs = AMPLITUDES.map((spec) => {
    const input = element('input', 'slider');
    input.type = 'range';
    input.min = String(-spec.max);
    input.max = String(spec.max);
    input.addEventListener('input', () => {
      const motion = harness.model().motion;
      const next: [number, number, number] = [...motion[spec.kind]];
      next[spec.axis] = Number(input.value) * spec.scale;
      harness.animate({ [spec.kind]: next });
    });
    return { spec, input };
  });

  styleSelect.addEventListener('change', () => {
    harness.animate({ rotationStyle: styleSelect.value === 'turn' ? 'turn' : 'swing' });
  });
  periodInput.addEventListener('input', () => { harness.animate({ periodMs: Number(periodInput.value) }); });
  phaseInput.addEventListener('input', () => {
    harness.animate({ phaseRadians: (Number(phaseInput.value) * Math.PI) / 180 });
  });

  const pane = element('div', 'pane');
  pane.append(
    labelled('Movement style', styleSelect,
      'Swinging goes out and comes back; turning goes all the way around, using the Turn amounts as how far.'),
    labelled('Period', periodInput, 'How long one full round trip takes. Zero is still.'),
    labelled('Phase', phaseInput, 'Where in the cycle time zero starts.'),
  );
  let currentGroup = '';
  for (const { spec, input } of amplitudeInputs) {
    if (spec.group !== currentGroup) {
      currentGroup = spec.group;
      const head = element('p', 'grouphead');
      head.textContent = spec.group;
      pane.appendChild(head);
    }
    pane.append(labelled(`${spec.label} (${spec.unit})`, input));
  }

  function syncFromModel(model: StudioModelV1): void {
    styleSelect.value = model.motion.rotationStyle === 'turn' ? 'turn' : 'swing';
    periodInput.value = String(model.motion.periodMs);
    phaseInput.value = String(Math.round((model.motion.phaseRadians * 180) / Math.PI));
    for (const { spec, input } of amplitudeInputs) {
      input.value = String(Math.round(model.motion[spec.kind][spec.axis] / spec.scale));
    }
  }

  return { pane, syncFromModel };
}
