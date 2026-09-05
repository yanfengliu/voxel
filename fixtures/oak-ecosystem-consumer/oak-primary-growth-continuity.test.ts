import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { buildOakTissueVoxelSourceProjectionV1 } from './oak-tissue-voxel-projection.js';
import type { OakOrganSnapshotV1 } from './oak-types.js';

function sourceKeysByOrgan(
  projection: ReturnType<typeof buildOakTissueVoxelSourceProjectionV1>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const result = new Map<string, Set<string>>();
  for (const record of [...projection.records.values()].flat()) {
    const match = /^oak:(organ:\d+:\d+):/u.exec(record.key);
    if (match === null) throw new Error(`Cannot read oak source owner '${record.key}'.`);
    const keys = result.get(match[1]!) ?? new Set<string>();
    keys.add(record.key);
    result.set(match[1]!, keys);
  }
  return result;
}

function targetSignature(organ: OakOrganSnapshotV1) {
  return {
    targetLengthM: organ.targetLengthM,
    targetRadiusM: organ.targetRadiusM,
    ...(organ.kind === 'leaf' ? { targetAreaM2: organ.targetAreaM2 } : {}),
  };
}

describe('oak primary growth continuity', () => {
  it('adds organ-local source cells without shrinking or teleporting an exposed front', () => {
    const simulation = createOakSimulationV1();
    const initial = simulation.snapshot();
    const targets = new Map(initial.organs.map((organ) => [organ.key, targetSignature(organ)]));
    const priorDimensions = new Map(initial.organs.map((organ) => [organ.key, {
      lengthM: organ.lengthM,
      radiusM: organ.radiusM,
      areaM2: organ.kind === 'leaf' ? organ.areaM2 : 0,
      phase: organ.developmentPhase,
      stage: organ.stage,
    }]));
    let priorSources = sourceKeysByOrgan(
      buildOakTissueVoxelSourceProjectionV1(simulation.projection(), true),
    );
    const observedPhases = new Set(initial.organs.map((organ) => organ.developmentPhase));
    let exposedBirths = 0;
    let positiveGrowthTicks = 0;
    const budTargetResets = new Set<string>();
    const totalTicks = oakHostTicksForBiologicalDaysV1(110);

    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const snapshot = simulation.advanceHostTicks(1);
      const sourceProjection = buildOakTissueVoxelSourceProjectionV1(
        simulation.projection(),
        true,
      );
      const nextSources = sourceKeysByOrgan(sourceProjection);
      const surfaceSources = sourceKeysByOrgan(buildOakTissueVoxelSourceProjectionV1(
        simulation.projection(),
        false,
      ));
      const organsByKey = new Map(snapshot.organs.map((organ) => [organ.key, organ]));
      let aggregateAdditions = 0;

      for (const organ of snapshot.organs) {
        observedPhases.add(organ.developmentPhase);
        const previousTarget = targets.get(organ.key);
        if (previousTarget === undefined) targets.set(organ.key, targetSignature(organ));
        else if (!isDeepStrictEqual(targetSignature(organ), previousTarget)) {
          const previous = priorDimensions.get(organ.key);
          const targetTransition = `${organ.key} target at tick ${String(tick)} `
            + `${JSON.stringify(previousTarget)} -> ${JSON.stringify(targetSignature(organ))}`;
          expect(organ.kind, `${targetTransition} kind`).toBe('bud');
          // When maturation and phenology cadences coincide, the internal
          // dormant boundary is consumed in this same 60 Hz host tick and the
          // preceding published frame is still late maturing.
          expect(previous?.stage === 'dormant'
            || (previous?.stage === 'expanding' && previous.phase === 'maturing'),
          `${targetTransition} source lifecycle`).toBe(true);
          expect(organ.developmentPhase, `${targetTransition} phase`)
            .toBe('bud-swelling');
          expect(budTargetResets.has(organ.key), `${organ.key} repeated target reset`).toBe(false);
          budTargetResets.add(organ.key);
          targets.set(organ.key, targetSignature(organ));
        }

        const previousDimensions = priorDimensions.get(organ.key);
        if (previousDimensions !== undefined && previousDimensions.phase !== 'preformed'
          && organ.stage !== 'abscised') {
          expect(organ.lengthM + Number.EPSILON, `${organ.key} length at tick ${String(tick)}`)
            .toBeGreaterThanOrEqual(previousDimensions.lengthM);
          expect(organ.radiusM + Number.EPSILON,
            `${organ.key} ${organ.kind} ${previousDimensions.phase}->${organ.developmentPhase} radius at tick ${String(tick)}`)
            .toBeGreaterThanOrEqual(previousDimensions.radiusM);
          if (organ.kind === 'leaf') {
            expect(organ.areaM2 + Number.EPSILON, `${organ.key} area at tick ${String(tick)}`)
              .toBeGreaterThanOrEqual(previousDimensions.areaM2);
          }
        }
        priorDimensions.set(organ.key, {
          lengthM: organ.lengthM,
          radiusM: organ.radiusM,
          areaM2: organ.kind === 'leaf' ? organ.areaM2 : 0,
          phase: organ.developmentPhase,
          stage: organ.stage,
        });

        if (organ.kind === 'coarse-root' || organ.kind === 'fine-root-cohort') {
          expect(surfaceSources.has(organ.key), `${organ.key} hidden from surface projection`)
            .toBe(false);
        }

        const before = priorSources.get(organ.key) ?? new Set<string>();
        const after = nextSources.get(organ.key) ?? new Set<string>();
        if (organ.developmentPhase === 'preformed' || organ.stage === 'abscised') {
          expect(after.size, `${organ.key} hidden source count at tick ${String(tick)}`).toBe(0);
          continue;
        }
        expect([...before].every((key) => after.has(key)),
          `${organ.key} retained source prefix at tick ${String(tick)}`).toBe(true);
        const additions = [...after].filter((key) => !before.has(key)).length;
        aggregateAdditions += additions;
        positiveGrowthTicks += Number(additions > 0);
        expect(additions, `${organ.key} additions at tick ${String(tick)}`)
          .toBeLessThanOrEqual(8);
        if (before.size === 0 && after.size > 0 && organ.kind !== 'acorn') {
          exposedBirths += 1;
          expect(after.size, `${organ.key} first visible source cohort`).toBeLessThanOrEqual(4);
        }
      }

      for (const [owner, keys] of priorSources) {
        const organ = organsByKey.get(owner);
        if (organ?.stage === 'abscised') continue;
        const next = nextSources.get(owner) ?? new Set<string>();
        expect([...keys].every((key) => next.has(key)),
          `${owner} aggregate retained prefix at tick ${String(tick)}`).toBe(true);
      }
      expect(aggregateAdditions, `aggregate additions at tick ${String(tick)}`)
        .toBeLessThanOrEqual(32);
      priorSources = nextSources;
    }

    expect(exposedBirths).toBeGreaterThan(10);
    expect(budTargetResets.size).toBe(3);
    expect(positiveGrowthTicks).toBeGreaterThan(100);
    expect(observedPhases).toEqual(new Set([
      'preformed',
      'bud-swelling',
      'cell-division',
      'cell-expansion',
      'maturing',
      'mature',
      'abscised',
    ]));
    expect(simulation.snapshot().phenology).toBe('leaf-mature');
    expect(simulation.snapshot().diagnostics.activeGrowthFrontCount).toBe(0);
  }, 180_000);
});
