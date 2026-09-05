import { describe, expect, it } from 'vitest';

import { updateOakBrowserDiagnosticsV1 } from './oak-browser-diagnostics.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

function metricNodes(...keys: readonly string[]): Map<string, HTMLElement> {
  return new Map(keys.map((key) => [key, { textContent: '—' } as HTMLElement]));
}

describe('oak browser environment diagnostics', () => {
  it('publishes authoritative active-growth and committed-carbon evidence', () => {
    const simulation = createOakSimulationV1({ paused: false });
    const nodes = metricNodes('growth-fronts', 'growth-carbon');
    const initial = simulation.snapshot();
    updateOakBrowserDiagnosticsV1(nodes, initial, { presentedRevision: 1 } as never);
    expect(nodes.get('growth-fronts')?.textContent).toBe('0');
    expect(nodes.get('growth-carbon')?.textContent).toBe('0.000 g');

    const growing = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    updateOakBrowserDiagnosticsV1(nodes, growing, { presentedRevision: 2 } as never);
    expect(Number(nodes.get('growth-fronts')?.textContent)).toBeGreaterThan(0);
    expect(Number.parseFloat(nodes.get('growth-carbon')?.textContent ?? '0'))
      .toBeGreaterThan(0);
  });

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
