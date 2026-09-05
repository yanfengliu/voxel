import { describe, expect, it } from 'vitest';

import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

describe('oak seasonal resource ledger', () => {
  it('keeps the seasonal litter transfer inside every resource ledger', () => {
    const simulation = createOakSimulationV1();
    const snapshot = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(250));
    expect(snapshot.organs.filter((organ) => organ.kind === 'leaf')
      .every((leaf) => leaf.stage === 'abscised')).toBe(true);
    for (const [resource, residual] of Object.entries(snapshot.ledger.residual)) {
      expect(Math.abs(residual), resource).toBeLessThan(1e-12);
    }
  });
});
