import { describe, expect, it } from 'vitest';

import { updateOakBrowserDiagnosticsV1 } from './oak-browser-diagnostics.js';
import { createOakSimulationV1 } from './oak-simulation.js';

function metricNodes(...keys: readonly string[]): Map<string, HTMLElement> {
  return new Map(keys.map((key) => [key, { textContent: '—' } as HTMLElement]));
}

describe('oak browser environment diagnostics', () => {
  it('publishes authoritative wind and topsoil values beside honest weather-cue state', () => {
    const simulation = createOakSimulationV1({ paused: true });
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    const nodes = metricNodes(
      'wind', 'rain', 'wind-voxels', 'topsoil-water',
      'topsoil-nitrogen', 'topsoil-phosphorus',
    );
    updateOakBrowserDiagnosticsV1(
      nodes,
      simulation.snapshot(),
      { presentedRevision: 1 } as never,
      { rainPhase: 'falling', rainPulseLiters: 0.4, rainVoxelCount: 180, windVoxelCount: 96 },
    );
    expect(nodes.get('wind')?.textContent).toMatch(/m\/s$/u);
    expect(nodes.get('rain')?.textContent).toBe('falling · 0.40 L · 180 vx');
    expect(nodes.get('wind-voxels')?.textContent).toBe('96');
    expect(nodes.get('topsoil-water')?.textContent).toMatch(/% v\/v$/u);
    expect(nodes.get('topsoil-nitrogen')?.textContent).toMatch(/mg$/u);
    expect(nodes.get('topsoil-phosphorus')?.textContent).toMatch(/mg$/u);
  });
});
