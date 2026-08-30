import { describe, expect, it } from 'vitest';

import {
  oakAllometricWoodRadiusMForOrganV1,
  oakWoodMassVolumeDiagnosticV1,
} from './oak-allometry.js';
import { planOakAxillaryShootV1 } from './oak-axillary-shoot.js';
import {
  oakCantileverResponseForOrganV1,
  oakCantileverResponseV1,
} from './oak-mechanics.js';
import { oakLeafPetioleSectionForOrganV1 } from './oak-leaf-shape.js';
import { OAK_PARAMETERS_V1 } from './oak-parameters.js';

const BASELINE = {
  loadDistribution: 'uniform' as const,
  lengthM: 0.4,
  radiusM: 0.012,
  tipRadiusRatio: 0.72,
  youngsModulusPa: 8e9,
  windSpeedMPerS: 3,
  projectedAreaM2: 0.0096,
  supportedMassKg: 0.08,
  reconfigures: false,
};

describe('oak quasi-static mechanics', () => {
  it('separates the held zero-wind control from self-weight', () => {
    const response = oakCantileverResponseV1({ ...BASELINE, windSpeedMPerS: 0 });
    expect(response.windForceN).toBe(0);
    expect(response.lateralDeflectionM).toBe(0);
    expect(response.selfWeightForceN).toBeGreaterThan(0);
    expect(response.downwardDeflectionM).toBeGreaterThan(0);
  });

  it('increases deflection with wind and decreases it with E and radius', () => {
    const calm = oakCantileverResponseV1({ ...BASELINE, windSpeedMPerS: 1 });
    const windy = oakCantileverResponseV1({ ...BASELINE, windSpeedMPerS: 4 });
    const stiff = oakCantileverResponseV1({
      ...BASELINE,
      windSpeedMPerS: 4,
      youngsModulusPa: 12e9,
    });
    const thick = oakCantileverResponseV1({
      ...BASELINE,
      windSpeedMPerS: 4,
      radiusM: 0.016,
    });
    expect(windy.lateralDeflectionM).toBeGreaterThan(calm.lateralDeflectionM);
    expect(stiff.lateralDeflectionM).toBeLessThan(windy.lateralDeflectionM);
    expect(thick.lateralDeflectionM).toBeLessThan(windy.lateralDeflectionM);
    expect(windy.secondMomentM4).toBeGreaterThan(0);
  });

  it('matches the dimensioned untapered tip-load beam oracle', () => {
    const response = oakCantileverResponseV1({
      ...BASELINE,
      loadDistribution: 'tip',
      tipRadiusRatio: 1,
      supportedMassKg: 0,
      reconfigures: false,
    });
    const analytic = response.windForceN * BASELINE.lengthM ** 3
      / (3 * BASELINE.youngsModulusPa * response.secondMomentM4);
    expect(response.lateralDeflectionM / analytic).toBeCloseTo(1, 2);
  });

  it('uses the dimensioned petiole, not the full blade, as leaf cantilever', () => {
    const totalLeafLengthM = OAK_PARAMETERS_V1.growth.leafBladeLengthM
      / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
    const key = 'organ:7:1';
    const response = oakCantileverResponseForOrganV1({
      key,
      kind: 'leaf',
      areaM2: 0.0015,
      lengthM: totalLeafLengthM,
      radiusM: 0.001,
      structuralCarbonKg: 0.00009,
      waterLiters: 0.00027,
      relativeWaterContentFraction: 0.95,
    }, 3);
    expect(response).not.toBeNull();
    expect(
      totalLeafLengthM
        * (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf),
    ).toBeCloseTo(0.07, 12);
    expect(response?.effectiveLengthM).toBeCloseTo(
      totalLeafLengthM * OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf,
      12,
    );
    const renderedSection = oakLeafPetioleSectionForOrganV1(
      key,
      0.0015,
      totalLeafLengthM,
    );
    expect(response?.secondMomentM4).toBeCloseTo(
      renderedSection.weakAxisSecondMomentM4,
      14,
    );
    expect(response?.effectiveProjectedAreaM2).toBeLessThan(0.0015);
    expect(response?.selfWeightForceN).toBeGreaterThan(0);
  });

  it('keeps a similarity-scaled leaf inside the same geometry and mechanics law', () => {
    const key = 'organ:27:1';
    const totalLengthM = OAK_PARAMETERS_V1.growth.leafBladeLengthM
      / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf);
    const fullCost = {
      carbonKg: OAK_PARAMETERS_V1.growth.leafCarbonKg,
      nitrogenKg: OAK_PARAMETERS_V1.growth.leafCarbonKg
        * OAK_PARAMETERS_V1.growth.nitrogenPerStructuralCarbon,
      phosphorusKg: OAK_PARAMETERS_V1.growth.leafCarbonKg
        * OAK_PARAMETERS_V1.growth.phosphorusPerStructuralCarbon,
      waterLiters: OAK_PARAMETERS_V1.growth.leafWaterLiters,
    };
    const plan = planOakAxillaryShootV1(2, fullCost, key);
    const scale = plan.leafTotalLengthM / totalLengthM;
    const fullSection = oakLeafPetioleSectionForOrganV1(
      key,
      OAK_PARAMETERS_V1.growth.leafAreaM2,
      totalLengthM,
    );
    const scaledSection = oakLeafPetioleSectionForOrganV1(
      key,
      plan.leafAreaM2,
      plan.leafTotalLengthM,
    );
    expect(plan.leafAreaM2 / OAK_PARAMETERS_V1.growth.leafAreaM2)
      .toBeCloseTo(scale ** 2, 14);
    expect(plan.leafCost.carbonKg / fullCost.carbonKg).toBeCloseTo(scale ** 2, 14);
    expect(plan.leafCost.waterLiters / fullCost.waterLiters).toBeCloseTo(scale ** 2, 14);
    expect(scaledSection.basalFullWidthM / fullSection.basalFullWidthM)
      .toBeCloseTo(scale, 14);
    expect(scaledSection.weakAxisSecondMomentM4 / fullSection.weakAxisSecondMomentM4)
      .toBeCloseTo(scale ** 4, 14);
    expect(scaledSection.weakAxisEquivalentCircularRadiusM)
      .toBeGreaterThanOrEqual(OAK_PARAMETERS_V1.mechanics.minimumRadiusM);
    const underScale = scale * (1 - 1e-9);
    expect(oakLeafPetioleSectionForOrganV1(
      key,
      OAK_PARAMETERS_V1.growth.leafAreaM2 * underScale ** 2,
      totalLengthM * underScale,
    ).weakAxisEquivalentCircularRadiusM).toBeLessThan(
      OAK_PARAMETERS_V1.mechanics.minimumRadiusM,
    );
    const responseFor = (areaM2: number, lengthM: number, cost: typeof fullCost) =>
      oakCantileverResponseForOrganV1({
        key,
        kind: 'leaf',
        areaM2,
        lengthM,
        radiusM: 0.001,
        structuralCarbonKg: cost.carbonKg,
        waterLiters: cost.waterLiters,
        relativeWaterContentFraction: 0.95,
      }, 6)!;
    const underCost = {
      carbonKg: fullCost.carbonKg * underScale ** 2,
      nitrogenKg: fullCost.nitrogenKg * underScale ** 2,
      phosphorusKg: fullCost.phosphorusKg * underScale ** 2,
      waterLiters: fullCost.waterLiters * underScale ** 2,
    };
    const underResponse = responseFor(
      OAK_PARAMETERS_V1.growth.leafAreaM2 * underScale ** 2,
      totalLengthM * underScale,
      underCost,
    );
    expect(underResponse.clamped).toBe(true);
    expect(underResponse.effectiveRadiusM)
      .toBe(OAK_PARAMETERS_V1.mechanics.minimumRadiusM);
    const fullResponse = responseFor(
      OAK_PARAMETERS_V1.growth.leafAreaM2,
      totalLengthM,
      fullCost,
    );
    const scaledResponse = responseFor(
      plan.leafAreaM2,
      plan.leafTotalLengthM,
      plan.leafCost,
    );
    expect(fullResponse.clamped).toBe(false);
    expect(scaledResponse.clamped).toBe(false);
    expect(scaledResponse.effectiveProjectedAreaM2 / fullResponse.effectiveProjectedAreaM2)
      .toBeCloseTo(scale ** 2, 12);
    expect(scaledResponse.lateralDeflectionM / scaledResponse.effectiveLengthM)
      .toBeCloseTo(fullResponse.lateralDeflectionM / fullResponse.effectiveLengthM, 12);
  });

  it('reduces petiole stiffness and increases wilt under low relative water content', () => {
    const leaf = {
      key: 'organ:7:1',
      kind: 'leaf' as const,
      areaM2: 0.0015,
      lengthM: 0.07 / (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf),
      radiusM: 0.001,
      structuralCarbonKg: 0.00009,
      waterLiters: 0.00027,
    };
    const turgid = oakCantileverResponseForOrganV1({
      ...leaf,
      relativeWaterContentFraction: 0.95,
    }, 0)!;
    const wilted = oakCantileverResponseForOrganV1({
      ...leaf,
      relativeWaterContentFraction: 0.58,
    }, 0)!;
    expect(wilted.effectiveYoungsModulusPa).toBeLessThan(
      turgid.effectiveYoungsModulusPa * 0.5,
    );
    expect(wilted.downwardDeflectionM).toBeGreaterThan(
      turgid.downwardDeflectionM * 2,
    );
  });

  it('uses the allometry-shared conserved fresh mass for wood self-weight', () => {
    const oldAuthoredBranch = {
      key: 'organ:14:1',
      kind: 'branch' as const,
      lengthM: 0.045,
      radiusM: 0.0015,
      structuralCarbonKg: 0.00016,
      waterLiters: 0.00025,
    };
    const oldDiagnostic = oakWoodMassVolumeDiagnosticV1(oldAuthoredBranch)!;
    expect(oldDiagnostic.ownedToGeometryMassRatio).toBeGreaterThan(2.65);
    expect(oldDiagnostic.ownedToGeometryMassRatio).toBeLessThan(11.07);
    const branch = {
      ...oldAuthoredBranch,
      radiusM: oakAllometricWoodRadiusMForOrganV1(oldAuthoredBranch)!,
    };
    const response = oakCantileverResponseForOrganV1(branch, 0);
    const diagnostic = oakWoodMassVolumeDiagnosticV1(branch);
    expect(response).not.toBeNull();
    expect(diagnostic).not.toBeNull();
    expect(response!.selfWeightForceN / OAK_PARAMETERS_V1.mechanics.gravityMPerS2)
      .toBeCloseTo(diagnostic!.ownedFreshMassKg, 14);
    expect(diagnostic!.ownedFreshMassKg).toBeCloseTo(
      diagnostic!.geometryImpliedGreenMassKg,
      14,
    );
    expect(diagnostic!.ownedToGeometryMassRatio).toBeCloseTo(1, 14);
  });

  it('reduces broad-leaf projected area and reports calibrated-range clamps', () => {
    const rigidArea = oakCantileverResponseV1({
      ...BASELINE,
      loadDistribution: 'tip',
      reconfigures: false,
    });
    const leaf = oakCantileverResponseV1({
      ...BASELINE,
      loadDistribution: 'tip',
      reconfigures: true,
    });
    const outside = oakCantileverResponseV1({
      ...BASELINE,
      windSpeedMPerS: 100,
      radiusM: 0,
    });
    expect(leaf.effectiveProjectedAreaM2).toBeLessThan(
      rigidArea.effectiveProjectedAreaM2,
    );
    expect(outside.effectiveWindSpeedMPerS).toBe(12);
    expect(outside.effectiveRadiusM).toBe(0.00025);
    expect(outside.clamped).toBe(true);
  });
});
