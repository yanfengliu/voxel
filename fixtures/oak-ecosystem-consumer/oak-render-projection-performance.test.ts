import { isDeepStrictEqual } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  buildOakRenderFrameV1,
  type OakRenderFrameV1,
} from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

function sortedMaterialCellKeys(frame: OakRenderFrameV1): readonly string[] {
  return [...frame.projectionCache.tissue.materialCells.values()]
    .map(({ cell }) => cell.join(':'))
    .sort();
}

describe('oak render projection performance', () => {
  it('reports consecutive day-100 producer frame construction and gates deterministic cache work', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    let previous = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 3_000 });
    for (let warmup = 0; warmup < 12; warmup += 1) {
      simulation.advanceHostTicks(1);
      previous = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 3_001 + warmup,
        previousFrame: previous,
      });
    }

    const samples: number[] = [];
    const hits = { tissue: 0, tissueTopology: 0, soil: 0, litter: 0 };
    let previousMaterialCellKeys = sortedMaterialCellKeys(previous);
    let legacyFullTissueSoilHits = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      const started = performance.now();
      simulation.advanceHostTicks(1);
      previous = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 3_013 + tick,
        previousFrame: previous,
      });
      samples.push(performance.now() - started);
      const materialCellKeys = sortedMaterialCellKeys(previous);
      legacyFullTissueSoilHits += Number(previous.projectionCacheHits.soil
        && isDeepStrictEqual(previousMaterialCellKeys, materialCellKeys));
      previousMaterialCellKeys = materialCellKeys;
      for (const key of Object.keys(hits) as (keyof typeof hits)[]) {
        hits[key] += Number(previous.projectionCacheHits[key]);
      }
    }
    samples.sort((left, right) => left - right);
    const p50 = samples[29]!;
    const p95 = samples[56]!;
    const p99 = samples[59]!;
    console.log(
      `oak day-100 producer tick + frame construction: p50 ${p50.toFixed(2)} ms, `
      + `p95 ${p95.toFixed(2)} ms, p99 ${p99.toFixed(2)} ms `
      + `hits ${JSON.stringify(hits)}, misses ${JSON.stringify({
        tissue: 60 - hits.tissue,
        tissueTopology: 60 - hits.tissueTopology,
        soil: 60 - hits.soil,
        litter: 60 - hits.litter,
      })}, legacyFullTissueSoil ${JSON.stringify({
        hits: legacyFullTissueSoilHits,
        misses: 60 - legacyFullTissueSoilHits,
      })} `
      + '(producer-only measurement; browser, runtime acceptance, GPU work, and presentation excluded)',
    );

    expect(hits.tissueTopology).toBe(0);
    expect(hits.tissue).toBe(0);
    expect(hits.soil).toBeGreaterThan(legacyFullTissueSoilHits);
  }, 120_000);
});
