import { describe, expect, it } from 'vitest';
import {
  isOakBrowserEnvironmentCommandV1,
  syncOakBrowserControlsV1,
  toggleOakBrowserEnvironmentV1,
  type OakBrowserControlElementV1,
} from './oak-browser-control-state.js';
import { createOakSimulationV1 } from './oak-simulation.js';

class ControlStub implements OakBrowserControlElementV1 {
  readonly attributes = new Map<string, string>();
  textContent: string | null;

  constructor(
    readonly dataset: Readonly<{ command?: string; view?: string }>,
    label = '',
    pressed = true,
  ) {
    this.textContent = label;
    if (pressed) this.attributes.set('aria-pressed', 'false');
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('oak browser control state', () => {
  it('synchronizes command, pause-label, and preset-view state without a DOM', () => {
    const pause = new ControlStub({ command: 'toggle-pause' }, 'Pause');
    const growth = new ControlStub({ command: 'growth-mode' });
    const wind = new ControlStub({ command: 'wind-mode' });
    const roots = new ControlStub({ command: 'root-cutaway' });
    const water = new ControlStub({ command: 'low-water' });
    const rain = new ControlStub({ command: 'rain' }, 'Rain', false);
    const hero = new ControlStub({ view: 'hero' });
    const side = new ControlStub({ view: 'side' });

    syncOakBrowserControlsV1(
      [pause, growth, wind, roots, water, rain],
      [hero, side],
      {
        paused: true,
        environmentRegime: { water: 'low', nitrogen: 'ambient', phosphorus: 'ambient' },
      },
      { inspectionMode: 'wind', rootCutaway: true, camera: 'side' },
      false,
    );

    expect(pause.textContent).toBe('Resume');
    expect([
      pause, growth, wind, roots, water,
    ].map((control) => control.attributes.get('aria-pressed'))).toEqual([
      'true', 'false', 'true', 'true', 'true',
    ]);
    expect(rain.attributes.has('aria-pressed')).toBe(false);
    expect(hero.attributes.get('aria-pressed')).toBe('false');
    expect(side.attributes.get('aria-pressed')).toBe('true');

    syncOakBrowserControlsV1(
      [],
      [side],
      {
        paused: false,
        environmentRegime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
      },
      { inspectionMode: 'growth', rootCutaway: false, camera: 'side' },
      true,
    );
    expect(side.attributes.get('aria-pressed')).toBe('false');
  });

  it('toggles only the selected environmental boundary resource', () => {
    expect(isOakBrowserEnvironmentCommandV1('rain')).toBe(false);
    expect(isOakBrowserEnvironmentCommandV1('low-n')).toBe(true);
    const cases = [
      ['low-water', 'water', 'Water boundary regime changed; stored water was not deleted.'],
      ['low-n', 'nitrogen', 'Nitrogen accessibility regime changed; stored nitrogen was not deleted.'],
      ['low-p', 'phosphorus', 'Phosphorus accessibility regime changed; stored phosphorus was not deleted.'],
    ] as const;

    for (const [command, resource, status] of cases) {
      const simulation = createOakSimulationV1({ seed: 0x51a7_0a4b });
      const ambient = simulation.snapshot().environmentRegime;
      expect(toggleOakBrowserEnvironmentV1(simulation, command)).toBe(status);
      expect(simulation.snapshot().environmentRegime).toEqual({
        ...ambient,
        [resource]: 'low',
      });
      toggleOakBrowserEnvironmentV1(simulation, command);
      expect(simulation.snapshot().environmentRegime).toEqual(ambient);
    }
  });
});
