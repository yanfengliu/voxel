import { describe, expect, it } from 'vitest';

import { oakLeafPetioleSectionForOrganV1 } from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

describe('oak axillary shoot', () => {
  it('authors one paid, dimensioned young leaf and a terminal meristem', () => {
    const simulation = createOakSimulationV1();
    const snapshot = simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    const branch = snapshot.organs.find((organ) => organ.kind === 'branch')!;
    const leaf = snapshot.organs.find((organ): organ is OakLeafOrganSnapshotV1 =>
      organ.kind === 'leaf' && organ.parentKey === branch.key)!;
    const bud = snapshot.organs.find((organ) =>
      organ.kind === 'bud' && organ.parentKey === branch.key)!;
    const architecture = OAK_PARAMETERS_V1.growth.flushArchitecture;
    const primaryExtensionLengthM = architecture.extensionBaseLengthM
      + 2 * architecture.extensionLengthIncrementM;
    const axisSimilarityScale = architecture.axillaryBranchLengthM
      / primaryExtensionLengthM;
    const fullLeafLengthM = OAK_PARAMETERS_V1.growth.leafBladeLengthM
      / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
    const targetLinearScale = leaf.targetLengthM / fullLeafLengthM;
    expect(targetLinearScale).toBeGreaterThanOrEqual(axisSimilarityScale);
    expect(targetLinearScale).toBeLessThan(1);
    expect(leaf.targetAreaM2).toBeCloseTo(
      OAK_PARAMETERS_V1.growth.leafAreaM2 * targetLinearScale ** 2,
      14,
    );
    expect(leaf.areaM2 / leaf.targetAreaM2).toBeCloseTo(
      leaf.developmentFraction,
      14,
    );
    expect(leaf.lengthM / leaf.targetLengthM).toBeCloseTo(
      Math.sqrt(leaf.developmentFraction),
      14,
    );
    expect(oakLeafPetioleSectionForOrganV1(
      leaf.key,
      leaf.targetAreaM2,
      leaf.targetLengthM,
    ).weakAxisEquivalentCircularRadiusM).toBeGreaterThanOrEqual(
      OAK_PARAMETERS_V1.mechanics.minimumRadiusM,
    );
    expect(bud.stage).toBe('dormant');
    expect(bud.developmentPhase).toBe('preformed');
    expect(bud.positionM).not.toEqual(branch.positionM);
    for (const residual of Object.values(snapshot.ledger.residual)) {
      expect(Math.abs(residual)).toBeLessThan(1e-12);
    }
  });
});
