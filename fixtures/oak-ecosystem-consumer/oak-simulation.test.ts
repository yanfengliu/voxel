import { describe, expect, it } from 'vitest';

import {
  oakFineRootUptakeWeightsV1,
  stepOakSoilV1,
} from './oak-biogeochemistry.js';
import {
  OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1,
  stepOakAllocationV1,
  stepOakPhenologyV1,
} from './oak-growth.js';
import {
  OAK_HOST_TIMESTEP_SECONDS_V1,
  OAK_PARAMETERS_V1,
  OAK_PROCESS_CADENCE_SECONDS_V1,
  OAK_SECONDS_PER_DAY_V1,
} from './oak-parameters.js';
import { transferOakMycorrhizalCarbonV1 } from './oak-physiology.js';
import {
  isOakAttachedLivingOrganV1,
  isOakPlacedOrganV1,
} from './oak-organ-lifecycle.js';
import {
  oakLeafPetioleSectionForOrganV1,
  oakLeafTangentialPortOffsetsForOrganV1,
} from './oak-leaf-shape.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { createInitialOakStateV1 } from './oak-state.js';
import { exposeOakPrimordiaV1 } from './oak-growth.js';

function runDays(days: number, options = {}) {
  const controller = createOakSimulationV1(options);
  return controller.advanceHostTicks(oakHostTicksForBiologicalDaysV1(days));
}

describe('oak biological simulation', () => {
  it('distinguishes water, nitrogen and phosphorus limitation counter-runs', () => {
    const baseline = runDays(100);
    const lowWater = runDays(100, { regime: { water: 'low' } });
    const lowNitrogen = runDays(100, { regime: { nitrogen: 'low' } });
    const lowPhosphorus = runDays(100, { regime: { phosphorus: 'low' } });
    expect(lowWater.diagnostics.meanLeafWaterPotentialMpa)
      .toBeLessThan(baseline.diagnostics.meanLeafWaterPotentialMpa);
    expect(lowWater.diagnostics.cumulativeAssimilationCarbonKg)
      .toBeLessThan(baseline.diagnostics.cumulativeAssimilationCarbonKg);
    expect(lowNitrogen.diagnostics.cumulativeNitrogenUptakeKg)
      .toBeLessThan(baseline.diagnostics.cumulativeNitrogenUptakeKg * 0.2);
    expect(lowNitrogen.diagnostics.meanNitrogenStressFraction)
      .toBeGreaterThan(baseline.diagnostics.meanNitrogenStressFraction);
    expect(lowPhosphorus.diagnostics.cumulativePhosphorusUptakeKg)
      .toBeLessThan(baseline.diagnostics.cumulativePhosphorusUptakeKg * 0.2);
    expect(lowPhosphorus.diagnostics.meanPhosphorusStressFraction)
      .toBeGreaterThan(baseline.diagnostics.meanPhosphorusStressFraction);
  });

  it('neutralizes each scoped root, fungal and litter pathway in its ablation', () => {
    const baseline = runDays(100);
    const noRoot = runDays(100, { ablation: 'no-root-uptake' });
    const noMycorrhiza = runDays(100, { ablation: 'no-mycorrhiza' });
    const noLitter = runDays(100, { ablation: 'no-litter' });
    expect(noRoot.diagnostics.cumulativeRootWaterUptakeLiters).toBe(0);
    expect(noRoot.diagnostics.cumulativeNitrogenUptakeKg).toBe(0);
    expect(noRoot.diagnostics.cumulativePhosphorusUptakeKg).toBe(0);
    expect(noRoot.diagnostics.flushCount).toBeLessThan(
      baseline.diagnostics.flushCount,
    );
    expect(noMycorrhiza.diagnostics.cumulativeMycorrhizalCarbonCostKg).toBe(0);
    expect(baseline.diagnostics.cumulativeMycorrhizalCarbonCostKg)
      .toBeGreaterThan(0);
    expect(noMycorrhiza.plantMobilePools.nitrogenKg)
      .toBeLessThan(baseline.plantMobilePools.nitrogenKg);
    expect(noMycorrhiza.plantMobilePools.phosphorusKg)
      .toBeLessThan(baseline.plantMobilePools.phosphorusKg);
    expect(noLitter.diagnostics.cumulativeLitterCarbonRespiredKg).toBe(0);
    expect(baseline.diagnostics.cumulativeLitterCarbonRespiredKg)
      .toBeGreaterThan(0);
    expect(baseline.soil.reduce((sum, cell) => sum + cell.ammoniumKg, 0))
      .toBeGreaterThan(noLitter.soil.reduce((sum, cell) => sum + cell.ammoniumKg, 0));
    expect(baseline.soil.reduce((sum, cell) => sum + cell.labilePhosphorusKg, 0))
      .toBeGreaterThan(noLitter.soil.reduce(
        (sum, cell) => sum + cell.labilePhosphorusKg,
        0,
      ));
  });
  it('derives its multirate calendar from the shared host tick', () => {
    const controller = createOakSimulationV1();
    const oneDay = controller.advanceHostTicks(60);
    expect(OAK_HOST_TIMESTEP_SECONDS_V1).toBe(1 / 60);
    expect(oneDay.elapsedBiologicalSeconds).toBe(OAK_SECONDS_PER_DAY_V1);
    expect(oneDay.diagnostics.processSteps).toEqual({
      physiology: 96,
      soil: 24,
      allocation: 96,
      phenology: 1,
    });
    expect(OAK_PROCESS_CADENCE_SECONDS_V1.allocation).toBe(900);
    const beforePause = oneDay.elapsedBiologicalSeconds;
    controller.setPaused(true);
    const paused = controller.advanceHostTicks(60);
    expect(paused.hostTick).toBe(120);
    expect(paused.elapsedBiologicalSeconds).toBe(beforePause);
    controller.setPaused(false);
    controller.setTimeScale(OAK_SECONDS_PER_DAY_V1 / 2);
    expect(controller.advanceHostTicks(120).elapsedBiologicalSeconds)
      .toBe(beforePause + OAK_SECONDS_PER_DAY_V1);
  });

  it('applies rain and nutrients only through accounted boundary inputs', () => {
    const control = createOakSimulationV1();
    const treatment = createOakSimulationV1();
    treatment.applyCommand({ kind: 'rainfall-pulse', liters: 1 });
    treatment.applyCommand({
      kind: 'nutrient-pulse',
      ammoniumKg: 2e-6,
      nitrateKg: 3e-6,
      labilePhosphorusKg: 0.5e-6,
    });
    const controlAfter = control.advanceHostTicks(3);
    const treatmentAfter = treatment.advanceHostTicks(3);
    expect(
      treatmentAfter.ledger.cumulativeSources.waterLiters
        - controlAfter.ledger.cumulativeSources.waterLiters,
    ).toBeCloseTo(1, 14);
    expect(
      treatmentAfter.ledger.cumulativeSources.nitrogenKg
        - controlAfter.ledger.cumulativeSources.nitrogenKg,
    ).toBeCloseTo(5e-6, 14);
    expect(
      treatmentAfter.ledger.cumulativeSources.phosphorusKg
        - controlAfter.ledger.cumulativeSources.phosphorusKg,
    ).toBeCloseTo(0.5e-6, 14);
    expect(treatmentAfter.soil.reduce((sum, cell) => sum + cell.waterLiters, 0))
      .toBeGreaterThan(controlAfter.soil.reduce((sum, cell) => sum + cell.waterLiters, 0));
    for (const residual of Object.values(treatmentAfter.ledger.residual)) {
      expect(Math.abs(residual)).toBeLessThan(1e-12);
    }
  });

  it('routes a saturating rain pulse to runoff without overfilling soil pores', () => {
    const controller = createOakSimulationV1();
    controller.applyCommand({ kind: 'rainfall-pulse', liters: 100 });
    const snapshot = controller.advanceHostTicks(3);
    expect(snapshot.soil.every((cell) =>
      cell.volumetricWaterFraction <= cell.porosityFraction)).toBe(true);
    expect(snapshot.ledger.cumulativeSources.waterLiters).toBeGreaterThan(100);
    expect(snapshot.ledger.cumulativeSinks.waterLiters).toBeGreaterThan(90);
    expect(Math.abs(snapshot.ledger.residual.waterLiters)).toBeLessThan(1e-12);
  });

  it('germinates through ordered, stable generational organ identities', () => {
    const controller = createOakSimulationV1({ seed: 71 });
    expect(controller.advanceHostTicks(oakHostTicksForBiologicalDaysV1(2))
      .organs.map((organ) => organ.kind)).toEqual(['acorn']);
    const radicle = controller.advanceHostTicks(oakHostTicksForBiologicalDaysV1(1));
    expect(radicle.phenology).toBe('radicle-emergence');
    expect(radicle.organs.map((organ) => organ.kind)).toEqual([
      'acorn',
      'coarse-root',
      'fine-root-cohort',
    ]);
    const shoot = controller.advanceHostTicks(oakHostTicksForBiologicalDaysV1(3));
    expect(shoot.phenology).toBe('shoot-emergence');
    const firstFlush = controller.advanceHostTicks(
      oakHostTicksForBiologicalDaysV1(8),
    );
    expect(firstFlush.diagnostics.flushCount).toBe(1);
    expect(firstFlush.diagnostics.leafCount).toBe(0);
    const extensionInternodes = firstFlush.organs
      .filter((organ) => organ.kind === 'stem')
      .slice(-3);
    expect(extensionInternodes).toHaveLength(3);
    expect(extensionInternodes.slice(1).map((organ) => organ.parentKey))
      .toEqual(extensionInternodes.slice(0, 2).map((organ) => organ.key));
    expect(extensionInternodes.slice(1).every((organ) =>
      organ.direction.x * extensionInternodes[0]!.direction.x
      + organ.direction.y * extensionInternodes[0]!.direction.y
      + organ.direction.z * extensionInternodes[0]!.direction.z > 0.99999)).toBe(true);
    const firstLeaves = firstFlush.organs.filter((organ) => organ.kind === 'leaf');
    expect(new Set(firstLeaves.map((leaf) => leaf.parentKey)).size).toBe(3);
    expect(firstLeaves.every((leaf) => leaf.targetAreaM2 === 0.0015)).toBe(true);
    expect(firstLeaves.every((leaf) => leaf.areaM2 < leaf.targetAreaM2)).toBe(true);
    expect(firstLeaves.every((leaf) => leaf.developmentPhase === 'preformed')).toBe(true);
    expect(firstLeaves.every((leaf) => leaf.developmentFraction
      === OAK_PARAMETERS_V1.growth.development.primordiumFraction)).toBe(true);
    expect(firstLeaves.every((leaf) => Math.abs(
      leaf.targetLengthM
        * (1 - OAK_PARAMETERS_V1.leafGeometry.petioleLengthFractionOfTotalLeaf)
        - OAK_PARAMETERS_V1.growth.leafBladeLengthM,
    ) < 1e-15)).toBe(true);
    expect(Math.max(...firstLeaves.map((leaf) => leaf.rollRadians))
      - Math.min(...firstLeaves.map((leaf) => leaf.rollRadians)))
      .toBeGreaterThan(0.6);
    expect(firstLeaves[0]!.dryMassKg / firstLeaves[0]!.areaM2)
      .toBeCloseTo(0.125, 12);
    const firstFlushBuds = firstFlush.organs.filter((organ) =>
      organ.kind === 'bud');
    expect(firstFlushBuds.map((bud) => bud.developmentPhase)).toEqual([
      'bud-swelling',
      'preformed',
    ]);
    expect(firstFlushBuds.every((bud) => bud.stage === 'expanding')).toBe(true);
    expect(firstFlush.organs.map((organ) => organ.identity.localId))
      .toEqual(firstFlush.organs.map((_, index) => index + 1));
    expect(new Set(firstFlush.organs.map((organ) => organ.key)).size)
      .toBe(firstFlush.organs.length);
    expect(firstFlush.organs.every((organ) => organ.identity.generation === 1))
      .toBe(true);
  });

  it('is seeded and deterministic while seed affects authored orientation', () => {
    const first = runDays(90, { seed: 91 });
    const repeated = runDays(90, { seed: 91 });
    const other = runDays(90, { seed: 92 });
    expect(repeated).toEqual(first);
    expect(other.organs.filter((organ) => organ.kind === 'leaf')
      .map((leaf) => leaf.rollRadians))
      .not.toEqual(first.organs.filter((organ) => organ.kind === 'leaf')
        .map((leaf) => leaf.rollRadians));
  });

  it('holds the first extension unit above soil without false severe stress', () => {
    const snapshot = runDays(20);
    const leaves = snapshot.organs.filter((organ) => organ.kind === 'leaf');
    const soilSurfaceM = Math.max(...snapshot.soil.map((cell) =>
      cell.centerM.y + cell.sizeM.y / 2));
    expect(leaves).toHaveLength(3);
    expect(leaves.every((leaf) => leaf.stage === 'expanding')).toBe(true);
    expect(leaves.every((leaf) => leaf.positionM.y > soilSurfaceM)).toBe(true);
    expect(Math.max(...leaves.map((leaf) => leaf.stressFraction)))
      .toBeLessThan(0.5);
    expect(Math.min(...leaves.map((leaf) => leaf.chlorophyllFraction)))
      .toBeGreaterThan(0.7);
    expect(Math.min(...leaves.map((leaf) => leaf.relativeWaterContentFraction)))
      .toBeGreaterThan(0.9);
  });

  it('advances a continuous precomputed 2/5 phyllotactic sequence', () => {
    const snapshot = runDays(90);
    const leaves = snapshot.organs.filter((organ) => organ.kind === 'leaf');
    expect(leaves).toHaveLength(10);
    expect(new Set(leaves.map((leaf) => leaf.parentKey)).size).toBe(10);
    expect(OAK_LEAF_PHYLLOTAXIS_DIRECTIONS_V1).toHaveLength(5);
    const azimuths = leaves.map((leaf) => Math.atan2(leaf.direction.z, leaf.direction.x));
    for (let index = 1; index < azimuths.length; index += 1) {
      const divergence = (
        azimuths[index]! - azimuths[index - 1]! + Math.PI * 2
      ) % (Math.PI * 2);
      expect(divergence).toBeCloseTo(Math.PI * 0.8, 12);
    }
    const finalInternodes = snapshot.organs
      .filter((organ) => organ.kind === 'stem')
      .slice(-3);
    const branch = snapshot.organs.find((organ) => organ.kind === 'branch');
    const branchLeaf = leaves.find((leaf) => leaf.parentKey === branch?.key)!;
    expect(branch?.parentKey).toBe(finalInternodes[1]?.key);
    expect(branchLeaf.areaM2).toBeLessThan(OAK_PARAMETERS_V1.growth.leafAreaM2);
    expect(snapshot.organs.some((organ) => organ.kind === 'bud'
      && organ.stage === 'dormant' && organ.parentKey === branch?.key)).toBe(true);
  });

  it('consumes broken buds and separates active organs at every shared node', () => {
    const snapshot = runDays(90);
    const buds = snapshot.organs.filter((organ) => organ.kind === 'bud');
    expect(buds.filter((bud) => bud.stage === 'abscised')).toHaveLength(3);
    expect(buds.filter((bud) => bud.stage === 'dormant')).toHaveLength(1);
    expect(buds.filter((bud) => bud.stage === 'expanding')).toHaveLength(1);
    const active = snapshot.organs.filter((organ) => organ.stage !== 'abscised');
    for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < active.length;
        rightIndex += 1) {
        const left = active[leftIndex]!;
        const right = active[rightIndex]!;
        if (left.parentKey === null || left.parentKey !== right.parentKey) continue;
        const separationSquared = (left.positionM.x - right.positionM.x) ** 2
          + (left.positionM.y - right.positionM.y) ** 2
          + (left.positionM.z - right.positionM.z) ** 2;
        if (separationSquared > 1e-20) continue;
        const directionDot = left.direction.x * right.direction.x
          + left.direction.y * right.direction.y
          + left.direction.z * right.direction.z;
        expect(directionDot).toBeLessThan(0.9);
      }
    }
  });

  it('closes C, water, N and P ledgers through three early flushes', () => {
    const snapshot = runDays(100);
    expect(snapshot.diagnostics.flushCount).toBe(3);
    expect(snapshot.diagnostics.cumulativeAssimilationCarbonKg).toBeGreaterThan(0);
    expect(snapshot.diagnostics.cumulativeRootWaterUptakeLiters).toBeGreaterThan(0);
    expect(snapshot.diagnostics.minimumWoodOwnedToGeometryMassRatio)
      .toBeCloseTo(1, 12);
    expect(snapshot.diagnostics.maximumWoodOwnedToGeometryMassRatio)
      .toBeCloseTo(1, 12);
    for (const [resource, residual] of Object.entries(snapshot.ledger.residual)) {
      expect(Math.abs(residual), resource).toBeLessThan(1e-12);
    }
    for (const pool of [
      snapshot.plantMobilePools,
      snapshot.ledger.currentStorage,
      ...snapshot.organs.map((organ) => organ.pools),
    ]) {
      expect(Object.values(pool).every((value) => value >= 0)).toBe(true);
    }
  });

  it('keeps an outside wet and nutrient patch outside the uptake kernel', () => {
    const state = createInitialOakStateV1({
      seed: 7,
      timeScale: OAK_SECONDS_PER_DAY_V1,
      paused: false,
      ablation: 'baseline',
      regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    }, 1);
    state.elapsedBiologicalSeconds = 3 * OAK_SECONDS_PER_DAY_V1;
    stepOakAllocationV1(state);
    stepOakPhenologyV1(state);
    stepOakAllocationV1(state);
    const coarseRoot = state.organs.find((organ) => organ.kind === 'coarse-root');
    if (coarseRoot?.development === undefined) {
      throw new Error('Expected the positive-control coarse root after radicle emergence.');
    }
    coarseRoot.lengthM = coarseRoot.development.targetLengthM;
    exposeOakPrimordiaV1(state);
    for (const cell of state.soil) {
      cell.waterLiters = 0;
      cell.ammoniumKg = 0;
      cell.nitrateKg = 0;
      cell.labilePhosphorusKg = 0;
      cell.sorbedPhosphorusKg = 0;
      cell.litterNitrogenKg = 0;
      cell.litterPhosphorusKg = 0;
      cell.mycorrhizalNitrogenKg = 0;
      cell.mycorrhizalPhosphorusKg = 0;
    }
    const remote = state.soil[7]!;
    remote.waterLiters = 2;
    remote.nitrateKg = 1e-4;
    remote.labilePhosphorusKg = 1e-5;
    const weights = oakFineRootUptakeWeightsV1(state);
    expect(weights[7]).toBe(0);
    const mobileBefore = { ...state.mobile };
    stepOakSoilV1(state);
    expect(state.mobile.waterLiters).toBe(mobileBefore.waterLiters);
    expect(state.mobile.nitrogenKg).toBe(mobileBefore.nitrogenKg);
    expect(state.mobile.phosphorusKg).toBe(mobileBefore.phosphorusKg);
    expect(remote.waterLiters).toBe(2);
    expect(remote.ammoniumKg + remote.nitrateKg).toBeCloseTo(1e-4, 14);
    for (const cell of state.soil) {
      cell.mycorrhizalCarbonKg = 0;
      cell.colonizedFineRootFraction = 0;
    }
    state.mobile = { ...state.mobile, carbonKg: state.mobile.carbonKg + 0.0001 };
    transferOakMycorrhizalCarbonV1(state, 0.0001);
    expect(remote.mycorrhizalCarbonKg).toBe(0);
    expect(state.soil.some((cell, index) =>
      weights[index]! > 0 && cell.mycorrhizalCarbonKg > 0)).toBe(true);
  });

  it('keeps zero-wind poses held and produces connected breeze poses', () => {
    const controller = createOakSimulationV1();
    controller.advanceHostTicks(oakHostTicksForBiologicalDaysV1(90));
    controller.setPaused(true);
    const still = controller.projection();
    const held = controller.advanceHostTicks(30);
    expect(held.organs.map((organ) => organ.direction))
      .toEqual(still.organs.map((organ) => organ.direction));
    controller.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    const breeze = controller.advanceHostTicks(15);
    expect(breeze.wind.speedMPerS).toBeGreaterThan(0);
    expect(breeze.organs.filter((organ) => organ.kind === 'leaf')
      .map((organ) => organ.direction))
      .not.toEqual(held.organs.filter((organ) => organ.kind === 'leaf')
        .map((organ) => organ.direction));
    const byKey = new Map(breeze.organs.map((organ) => [organ.key, organ]));
    for (const organ of breeze.organs) {
      if (organ.parentKey === null) continue;
      if (!isOakPlacedOrganV1(organ) || !isOakAttachedLivingOrganV1(organ)) {
        continue;
      }
      const parent = byKey.get(organ.parentKey);
      expect(parent).toBeDefined();
      if (!parent || ![
        'stem',
        'branch',
        'coarse-root',
        'fine-root-cohort',
      ].includes(parent.kind)) continue;
      const parentTip = {
        x: parent.positionM.x + parent.direction.x * parent.lengthM,
        y: parent.positionM.y + parent.direction.y * parent.lengthM,
        z: parent.positionM.z + parent.direction.z * parent.lengthM,
      };
      const distance = Math.sqrt(
        (organ.positionM.x - parentTip.x) ** 2
        + (organ.positionM.y - parentTip.y) ** 2
        + (organ.positionM.z - parentTip.z) ** 2,
      );
      if (organ.kind !== 'leaf') {
        expect(distance).toBeLessThan(1e-12);
        continue;
      }
      expect(distance).toBeGreaterThan(0);
      const offset = {
        x: organ.positionM.x - parentTip.x,
        y: organ.positionM.y - parentTip.y,
        z: organ.positionM.z - parentTip.z,
      };
      const axialM = offset.x * parent.direction.x
        + offset.y * parent.direction.y
        + offset.z * parent.direction.z;
      const radialM = Math.sqrt(
        (offset.x - parent.direction.x * axialM) ** 2
        + (offset.y - parent.direction.y * axialM) ** 2
        + (offset.z - parent.direction.z * axialM) ** 2,
      );
      const nodeEnvelopeRadiusM = breeze.organs.reduce((radius, candidate) => {
        const sharesNode = candidate.parentKey === parent.key
          && isOakPlacedOrganV1(candidate)
          && isOakAttachedLivingOrganV1(candidate)
          && (candidate.kind === 'stem'
            || candidate.kind === 'branch'
            || candidate.kind === 'coarse-root'
            || candidate.kind === 'fine-root-cohort');
        return sharesNode ? Math.max(radius, candidate.radiusM * 3) : radius;
      }, parent.radiusM);
      const minimumPort = oakLeafTangentialPortOffsetsForOrganV1(
        organ.key,
        organ.areaM2,
        organ.lengthM,
        parent.direction,
        parent.radiusM,
        organ.direction,
        organ.rollRadians,
      );
      const section = oakLeafPetioleSectionForOrganV1(
        organ.key, organ.areaM2, organ.lengthM,
      );
      const maximumSectionSupportM = Math.hypot(
        section.basalFullWidthM / 2,
        section.basalFullThicknessM / 2,
      );
      expect(organ.attachment?.parentOrganKey).toBe(parent.key);
      expect(axialM).toBeCloseTo(minimumPort.axialCenterOffsetM, 12);
      expect(radialM).toBeGreaterThanOrEqual(minimumPort.radialCenterOffsetM - 1e-12);
      expect(radialM).toBeLessThanOrEqual(
        nodeEnvelopeRadiusM + maximumSectionSupportM + 1e-12,
      );
    }
  });

});
