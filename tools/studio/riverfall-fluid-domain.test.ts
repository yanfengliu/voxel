import { describe, expect, it } from 'vitest';

import {
  MAX_RIVERFALL_FLUID_HALF_WIDTH_V1,
  RIVERFALL_FLUID_DOMAIN_V1,
  mapRiverfallFluidCoordinateV1,
  riverfallFluidDomainLengthV1,
  sampleRiverfallFluidDomainV1,
  validateRiverfallFluidDomainV1,
  type RiverfallFluidDomainV1,
  type RiverfallFluidReachV1,
  type RiverfallFluidVec3V1,
} from './riverfall-fluid-domain.js';
import { RIVERFALL_RECIPES } from './riverfall-recipes.js';
import { createRiverfallScene } from './riverfall-scene.js';

interface WorldBoundsV1 {
  readonly min: RiverfallFluidVec3V1;
  readonly max: RiverfallFluidVec3V1;
}

interface MutableReachV1 {
  id: string;
  visualPlacementId: string;
  visibility: string;
  start: number[];
  end: number[];
  halfWidths: number[];
}

interface MutableDomainV1 {
  schemaVersion: string;
  visualClearance: number;
  lateralAxis: number[];
  reaches: MutableReachV1[];
}

const scene = createRiverfallScene();
const recipes = new Map(RIVERFALL_RECIPES.map((recipe) => [recipe.id, recipe]));
const domain = RIVERFALL_FLUID_DOMAIN_V1;

function mutableDomain(): MutableDomainV1 {
  return structuredClone(domain) as unknown as MutableDomainV1;
}

function reach(id: string): RiverfallFluidReachV1 {
  const found = domain.reaches.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`Riverfall fluid-domain test is missing reach '${id}'.`);
  }
  return found;
}

function bounds(placementId: string): WorldBoundsV1 {
  const placement = scene.placements.find(({ id }) => id === placementId);
  if (placement === undefined) {
    throw new Error(`Riverfall scene is missing placement '${placementId}'.`);
  }
  const recipe = recipes.get(placement.model);
  if (recipe === undefined) {
    throw new Error(
      `Riverfall placement '${placementId}' is missing recipe '${placement.model}'.`,
    );
  }
  expect(placement.grain, placementId).toBeUndefined();
  return {
    min: [
      placement.at[0] - recipe.size[0] / 2,
      placement.at[1],
      placement.at[2] - recipe.size[2] / 2,
    ],
    max: [
      placement.at[0] + recipe.size[0] / 2,
      placement.at[1] + recipe.size[1],
      placement.at[2] + recipe.size[2] / 2,
    ],
  };
}

function reachStartDistance(id: string): number {
  let total = 0;
  for (const candidate of domain.reaches) {
    if (candidate.id === id) return total;
    total += Math.hypot(
      candidate.end[0] - candidate.start[0],
      candidate.end[1] - candidate.start[1],
      candidate.end[2] - candidate.start[2],
    );
  }
  throw new Error(`Riverfall fluid-domain test cannot locate reach '${id}'.`);
}

function centerAt(
  candidate: RiverfallFluidReachV1,
  progress: number,
): RiverfallFluidVec3V1 {
  return [
    candidate.start[0]
      + (candidate.end[0] - candidate.start[0]) * progress,
    candidate.start[1]
      + (candidate.end[1] - candidate.start[1]) * progress,
    candidate.start[2]
      + (candidate.end[2] - candidate.start[2]) * progress,
  ];
}

function widthAt(candidate: RiverfallFluidReachV1, progress: number): number {
  return candidate.halfWidths[0]
    + (candidate.halfWidths[1] - candidate.halfWidths[0]) * progress;
}

describe('Riverfall fluid-domain sidecar', () => {
  it('is valid bounded plain data with every semantic reach named', () => {
    expect(validateRiverfallFluidDomainV1(domain)).toEqual([]);
    expect(structuredClone(domain)).toEqual(domain);
    expect(JSON.parse(JSON.stringify(domain))).toEqual(domain);
    expect(domain.reaches.map((candidate) => [
      candidate.id,
      candidate.visualPlacementId,
      candidate.visibility,
    ])).toEqual([
      ['river', 'river-surface', 'visible'],
      ['lip', 'waterfall-curtain', 'visible'],
      ['fall', 'waterfall-curtain', 'visible'],
      ['pond-expansion', 'pond-surface', 'visible'],
      ['pond-basin', 'pond-surface', 'visible'],
      ['pond-contraction', 'pond-surface', 'visible'],
      ['outflow', 'pond-outflow', 'visible'],
      ['outflow-submergence', 'pond-outflow', 'visible'],
      ['sink', 'pond-outflow', 'hidden'],
      ['return', 'landscape', 'hidden'],
      ['source-rise', 'river-surface', 'hidden'],
      ['source-emergence', 'river-surface', 'visible'],
    ]);
  });

  it('aligns river, lip, and fall to the live opaque recipe surfaces', () => {
    const clearance = domain.visualClearance;
    const riverBounds = bounds('river-surface');
    const fallBounds = bounds('waterfall-curtain');
    const pondBounds = bounds('pond-surface');
    const river = reach('river');
    const lip = reach('lip');
    const fall = reach('fall');
    const riverHalfWidth = (riverBounds.max[0] - riverBounds.min[0]) / 2
      - clearance;

    expect(river.start).toEqual([
      0,
      riverBounds.max[1] + clearance,
      riverBounds.min[2] + 3,
    ]);
    expect(river.end).toEqual([
      0,
      riverBounds.max[1] + clearance,
      riverBounds.max[2] - 1,
    ]);
    expect(river.halfWidths).toEqual([riverHalfWidth, riverHalfWidth]);
    expect(lip.start).toEqual(river.end);
    expect(lip.end).toEqual([
      0,
      fallBounds.max[1] + clearance,
      fallBounds.max[2] + clearance,
    ]);
    expect(lip.halfWidths).toEqual([riverHalfWidth, riverHalfWidth]);
    expect(fall.start).toEqual(lip.end);
    expect(fall.end).toEqual([
      0,
      pondBounds.max[1] + clearance,
      fallBounds.max[2] + clearance,
    ]);
    expect(fall.halfWidths).toEqual([riverHalfWidth, riverHalfWidth]);
  });

  it('widens through the live pond and narrows exactly into the outflow', () => {
    const clearance = domain.visualClearance;
    const pondBounds = bounds('pond-surface');
    const outflowBounds = bounds('pond-outflow');
    const expansion = reach('pond-expansion');
    const basin = reach('pond-basin');
    const contraction = reach('pond-contraction');
    const outflow = reach('outflow');
    const pondHalfWidth = (pondBounds.max[0] - pondBounds.min[0]) / 2
      - clearance;
    const outflowHalfWidth =
      (outflowBounds.max[0] - outflowBounds.min[0]) / 2 - clearance;

    expect(expansion.start).toEqual(reach('fall').end);
    expect(expansion.start[2]).toBe(pondBounds.min[2] + clearance);
    expect([expansion.start[1], expansion.end[1]]).toEqual([
      pondBounds.max[1] + clearance,
      pondBounds.max[1] + clearance,
    ]);
    expect(expansion.halfWidths).toEqual([
      reach('fall').halfWidths[1],
      pondHalfWidth,
    ]);
    expect(basin.halfWidths).toEqual([pondHalfWidth, pondHalfWidth]);
    expect(contraction.end[2]).toBe(pondBounds.max[2]);
    expect(contraction.halfWidths).toEqual([
      pondHalfWidth,
      outflowHalfWidth,
    ]);
    expect(outflow.start).toEqual(contraction.end);
    expect(outflow.start[1]).toBe(outflowBounds.max[1] + clearance);
    expect(outflow.start[2]).toBe(outflowBounds.min[2]);
    expect(outflow.end[2]).toBe(
      (outflowBounds.min[2] + outflowBounds.max[2]) / 2 - clearance,
    );
    expect(outflow.halfWidths).toEqual([
      outflowHalfWidth,
      outflowHalfWidth,
    ]);
  });

  it('keeps every visible lateral edge within its named recipe width', () => {
    const clearance = domain.visualClearance;
    for (const candidate of domain.reaches.filter(
      ({ visibility }) => visibility === 'visible',
    )) {
      const visualBounds = bounds(candidate.visualPlacementId);
      for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const center = centerAt(candidate, progress);
        const width = widthAt(candidate, progress);
        expect(
          center[0] - width,
          `${candidate.id} left edge at ${String(progress)}`,
        ).toBeGreaterThanOrEqual(visualBounds.min[0] + clearance);
        expect(
          center[0] + width,
          `${candidate.id} right edge at ${String(progress)}`,
        ).toBeLessThanOrEqual(visualBounds.max[0] - clearance);
      }
    }
  });

  it('conceals sink, return, and source rise in exact opaque footprints', () => {
    const clearance = domain.visualClearance;
    const outflowBounds = bounds('pond-outflow');
    const landscapeBounds = bounds('landscape');
    const riverBounds = bounds('river-surface');
    const submergence = reach('outflow-submergence');
    const sink = reach('sink');
    const hiddenReturn = reach('return');
    const sourceRise = reach('source-rise');
    const emergence = reach('source-emergence');

    expect(submergence.start).toEqual(reach('outflow').end);
    expect(submergence.start[1]).toBe(outflowBounds.max[1] + clearance);
    expect(submergence.end[1] + clearance).toBe(outflowBounds.max[1]);
    expect(sink.start).toEqual(submergence.end);
    expect(sink.end).toEqual([0, -1, sink.start[2]]);
    for (const progress of [0, 0.5, 1]) {
      const center = centerAt(sink, progress);
      const width = widthAt(sink, progress);
      expect(center[1] + clearance).toBeLessThanOrEqual(
        outflowBounds.max[1],
      );
      expect(center[2]).toBeGreaterThan(outflowBounds.min[2] + clearance);
      expect(center[2]).toBeLessThan(outflowBounds.max[2] - clearance);
      expect(center[0] - width).toBeGreaterThanOrEqual(
        outflowBounds.min[0] + clearance,
      );
      expect(center[0] + width).toBeLessThanOrEqual(
        outflowBounds.max[0] - clearance,
      );
    }

    expect(hiddenReturn.start).toEqual(sink.end);
    expect(hiddenReturn.end).toEqual(sourceRise.start);
    expect(hiddenReturn.start[1] + clearance).toBeLessThan(
      landscapeBounds.min[1],
    );
    expect(hiddenReturn.end[1] + clearance).toBeLessThan(
      landscapeBounds.min[1],
    );
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const center = centerAt(hiddenReturn, progress);
      const width = widthAt(hiddenReturn, progress);
      expect(center[1] + clearance).toBeLessThan(landscapeBounds.min[1]);
      expect(center[2]).toBeGreaterThan(landscapeBounds.min[2] + clearance);
      expect(center[2]).toBeLessThan(landscapeBounds.max[2] - clearance);
      expect(center[0] - width).toBeGreaterThan(
        landscapeBounds.min[0] + clearance,
      );
      expect(center[0] + width).toBeLessThan(
        landscapeBounds.max[0] - clearance,
      );
    }

    expect(sourceRise.start[1] + clearance).toBeLessThan(
      landscapeBounds.min[1],
    );
    expect(sourceRise.end).toEqual(emergence.start);
    expect(sourceRise.end[1] + clearance).toBe(riverBounds.max[1]);
    expect(emergence.end).toEqual(reach('river').start);
    expect(emergence.end[1]).toBe(riverBounds.max[1] + clearance);
    expect(sourceRise.start[2]).toBe(riverBounds.min[2] + 3);
    expect(sourceRise.end[2]).toBe(riverBounds.min[2] + 3);
    expect(sourceRise.halfWidths).toEqual([
      (riverBounds.max[0] - riverBounds.min[0]) / 2 - clearance,
      (riverBounds.max[0] - riverBounds.min[0]) / 2 - clearance,
    ]);
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const center = centerAt(sourceRise, progress);
      const width = widthAt(sourceRise, progress);
      expect(center[1] + clearance).toBeLessThanOrEqual(
        riverBounds.max[1],
      );
      expect(center[2]).toBeGreaterThan(riverBounds.min[2] + clearance);
      expect(center[2]).toBeLessThan(riverBounds.max[2] - clearance);
      expect(center[0] - width).toBe(riverBounds.min[0] + clearance);
      expect(center[0] + width).toBe(riverBounds.max[0] - clearance);
      expect(center[1]).toBeLessThanOrEqual(riverBounds.max[1] + clearance);
    }
  });

  it('forms a finite nonzero closed strip with continuous bounded widths', () => {
    for (let index = 0; index < domain.reaches.length; index += 1) {
      const candidate = domain.reaches[index]!;
      const next = domain.reaches[(index + 1) % domain.reaches.length]!;
      expect([...candidate.start, ...candidate.end].every(Number.isFinite))
        .toBe(true);
      expect(Math.hypot(
        candidate.end[0] - candidate.start[0],
        candidate.end[1] - candidate.start[1],
        candidate.end[2] - candidate.start[2],
      ), candidate.id).toBeGreaterThan(0);
      expect(candidate.end, `${candidate.id} endpoint`).toEqual(next.start);
      expect(candidate.halfWidths[1], `${candidate.id} width`).toBe(
        next.halfWidths[0],
      );
      for (const width of candidate.halfWidths) {
        expect(width).toBeGreaterThan(0);
        expect(width).toBeLessThanOrEqual(
          MAX_RIVERFALL_FLUID_HALF_WIDTH_V1,
        );
      }
    }
    expect(riverfallFluidDomainLengthV1(domain)).toBe(142);
  });

  it('samples wrapped longitudinal distance and maps bounded 2D coordinates', () => {
    const riverMiddle = sampleRiverfallFluidDomainV1(domain, 14);
    expect(riverMiddle).toMatchObject({
      wrappedDistance: 14,
      totalLength: 142,
      reachId: 'river',
      progress: 0.5,
      center: [0, 12.5, -15],
      tangent: [0, 0, 1],
      lateralAxis: [1, 0, 0],
      halfWidth: 4.5,
    });
    expect(mapRiverfallFluidCoordinateV1(domain, 14, 2).position)
      .toEqual([2, 12.5, -15]);

    const pondMiddle = sampleRiverfallFluidDomainV1(
      domain,
      reachStartDistance('pond-expansion') + 3.25,
    );
    expect(pondMiddle).toMatchObject({
      reachId: 'pond-expansion',
      progress: 0.5,
      halfWidth: 10,
    });
    expect(sampleRiverfallFluidDomainV1(domain, 142).center)
      .toEqual(reach('river').start);
    expect(sampleRiverfallFluidDomainV1(domain, -1)).toMatchObject({
      wrappedDistance: 141,
      reachId: 'source-emergence',
      center: [0, 11.5, -29],
    });
  });

  it('reports disconnected, degenerate, duplicate, and excessive input precisely', () => {
    const disconnected = mutableDomain();
    disconnected.reaches[1]!.start = [0, 12.5, 2];
    expect(validateRiverfallFluidDomainV1(disconnected)).toContainEqual({
      code: 'reach.disconnected',
      path: '$.reaches[1].start',
      message: 'Reach 1 must start at previous reach 0 end [0, 12.5, -1]; '
        + 'received [0, 12.5, 2].',
    });

    const degenerate = mutableDomain();
    degenerate.reaches[0]!.end = [...degenerate.reaches[0]!.start];
    expect(validateRiverfallFluidDomainV1(degenerate)).toContainEqual({
      code: 'reach.zero-length',
      path: '$.reaches[0].end',
      message: "Reach 'river' has zero length at [0, 12.5, -29]; "
        + 'move one endpoint so the solver has a finite longitudinal interval.',
    });

    const duplicate = mutableDomain();
    duplicate.reaches[1]!.id = 'river';
    expect(validateRiverfallFluidDomainV1(duplicate)).toContainEqual({
      code: 'reach.id-duplicate',
      path: '$.reaches[1].id',
      message: "Duplicate reach id 'river' is not allowed.",
    });

    const excessiveWidth = mutableDomain();
    excessiveWidth.reaches[0]!.halfWidths[0] = 17;
    expect(validateRiverfallFluidDomainV1(excessiveWidth)).toContainEqual({
      code: 'reach.half-widths',
      path: '$.reaches[0].halfWidths',
      message: 'Expected two finite half-widths greater than 0 and at most 16; '
        + 'received [17,4.5].',
    });
  });

  it('rejects invalid sampling coordinates with actionable repair guidance', () => {
    expect(() => sampleRiverfallFluidDomainV1(domain, Number.NaN))
      .toThrow(
        'Cannot sample Riverfall fluid domain at longitudinal distance NaN; '
        + 'expected a finite world-unit distance.',
      );
    expect(() => mapRiverfallFluidCoordinateV1(domain, 0, 4.51))
      .toThrow(
        "Cannot map Riverfall fluid coordinate at wrapped distance 0 on reach 'river': "
        + 'lateral offset 4.51 exceeds half-width 4.5. '
        + 'Keep the 2D particle inside [-4.5, 4.5].',
      );

    const invalid = mutableDomain();
    invalid.reaches[0]!.halfWidths[0] = 0;
    expect(() => sampleRiverfallFluidDomainV1(
      invalid as unknown as RiverfallFluidDomainV1,
      0,
    )).toThrow(
      'Cannot sample Riverfall fluid domain because its sidecar is invalid: '
      + '$.reaches[0].halfWidths Expected two finite half-widths greater than 0',
    );
  });
});
