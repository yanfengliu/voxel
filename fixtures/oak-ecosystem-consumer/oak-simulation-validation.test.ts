import { describe, expect, it } from 'vitest';

import {
  OAK_MAX_TIME_SCALE_V1,
  OAK_PARAMETER_PROVENANCE_V1,
  OAK_PARAMETERS_V1,
} from './oak-parameters.js';
import { createOakSimulationV1 } from './oak-simulation.js';

describe('oak simulation contract validation', () => {
  it('records parameter provenance and rejects unsafe commands', () => {
    expect(OAK_PARAMETER_PROVENANCE_V1.every((entry) =>
      entry.sourceUrl.length > 0 && entry.scope.length > 0)).toBe(true);
    const registered = new Set(OAK_PARAMETER_PROVENANCE_V1.map((entry) => entry.id));
    const mechanicsLinks = [
      ...OAK_PARAMETERS_V1.mechanics.mechanismProvenanceIds,
      OAK_PARAMETERS_V1.mechanics.parameterProvenanceId,
    ];
    expect(mechanicsLinks).toEqual([
      'green-oak-bending',
      'broad-leaf-reconfiguration',
      'early-slice-calibration',
    ]);
    const parameterLinks = [
      OAK_PARAMETERS_V1.identity.sourceProvenanceId,
      OAK_PARAMETERS_V1.seed.parameterProvenanceId,
      OAK_PARAMETERS_V1.soil.mechanismProvenanceId,
      OAK_PARAMETERS_V1.soil.parameterProvenanceId,
      OAK_PARAMETERS_V1.physiology.mechanismProvenanceId,
      OAK_PARAMETERS_V1.physiology.parameterProvenanceId,
      OAK_PARAMETERS_V1.roots.architectureProvenanceId,
      OAK_PARAMETERS_V1.roots.mechanismProvenanceId,
      OAK_PARAMETERS_V1.roots.parameterProvenanceId,
      OAK_PARAMETERS_V1.biogeochemistry.mechanismProvenanceId,
      OAK_PARAMETERS_V1.biogeochemistry.parameterProvenanceId,
      ...OAK_PARAMETERS_V1.growth.mechanismProvenanceIds,
      OAK_PARAMETERS_V1.growth.parameterProvenanceId,
      OAK_PARAMETERS_V1.leafGeometry.formProvenanceId,
      OAK_PARAMETERS_V1.leafGeometry.parameterProvenanceId,
      ...mechanicsLinks,
    ];
    expect(parameterLinks.every((id) => registered.has(id))).toBe(true);
    expect(OAK_PARAMETERS_V1.leafGeometry).toEqual(expect.objectContaining({
      formProvenanceId: 'oak-leaf-form',
      parameterProvenanceId: 'early-slice-calibration',
    }));

    const controller = createOakSimulationV1();
    expect(() => controller.advanceHostTicks(1.5)).toThrow(
      /expected an integer from 0 through/u,
    );
    expect(() => controller.applyCommand({
      kind: 'rainfall-pulse',
      liters: -1,
    })).toThrow(/rainfall pulse in liters -1/u);
    expect(() => createOakSimulationV1({ seed: 0 })).toThrow(
      /expected an integer from 1 through 4294967295/u,
    );
    const bounded = createOakSimulationV1({ timeScale: OAK_MAX_TIME_SCALE_V1 });
    const beforeRejectedAdvance = bounded.snapshot();
    expect(() => bounded.advanceHostTicks(2_401)).toThrow(
      /at most 400 days per call/u,
    );
    expect(bounded.snapshot()).toEqual(beforeRejectedAdvance);
  });
});
