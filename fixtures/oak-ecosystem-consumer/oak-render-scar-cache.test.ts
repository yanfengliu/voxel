import { describe, expect, it } from 'vitest';

import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

type OakProjectionState = ReturnType<ReturnType<typeof createOakSimulationV1>['projection']>;

function mutateFirstScar(
  state: OakProjectionState,
  mutate: (scar: NonNullable<OakLeafOrganSnapshotV1['abscissionScar']>) =>
    NonNullable<OakLeafOrganSnapshotV1['abscissionScar']>,
  leafLocalId?: number,
): OakProjectionState {
  let changed = false;
  const organs = state.organs.map((organ) => {
    if (changed || organ.kind !== 'leaf' || organ.abscissionScar === undefined
      || (leafLocalId !== undefined && organ.identity.localId !== leafLocalId)) {
      return organ;
    }
    changed = true;
    return { ...organ, abscissionScar: mutate(organ.abscissionScar) };
  });
  expect(changed).toBe(true);
  return { ...state, revision: state.revision + 1, organs };
}

function mutateFirstScarLeafLocalId(
  state: OakProjectionState,
  previousLocalId: number,
  localId: number,
): OakProjectionState {
  let changed = false;
  const organs = state.organs.map((organ) => {
    if (changed || organ.kind !== 'leaf' || organ.abscissionScar === undefined
      || organ.identity.localId !== previousLocalId) {
      return organ;
    }
    changed = true;
    return { ...organ, identity: { ...organ.identity, localId } };
  });
  expect(changed).toBe(true);
  return { ...state, revision: state.revision + 1, organs };
}

function firstScarLeafLocalId(
  state: OakProjectionState,
): number {
  const localId = state.organs.find((organ) =>
    organ.kind === 'leaf' && organ.abscissionScar !== undefined)?.identity.localId;
  if (!Number.isSafeInteger(localId)) {
    throw new Error('Oak scar cache control needs an authoritative wound-bearing leaf.');
  }
  return localId!;
}

describe('oak abscission scar cache', () => {
  it('invalidates topology when only the scar leaf local identity changes', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 90_000 });
    const previousLocalId = firstScarLeafLocalId(state);
    const mutated = mutateFirstScarLeafLocalId(
      state,
      previousLocalId,
      previousLocalId + 1_000_000,
    );
    const cached = buildOakRenderFrameV1(mutated, {
      renderRevision: 90_001,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(mutated, { renderRevision: 90_001 });
    expect(cached.projectionCacheHits.tissueTopology).toBe(false);
    expect(cached.projectionCache.tissue.abscissionScarRecords)
      .toEqual(cold.projectionCache.tissue.abscissionScarRecords);
    expect(cold.projectionCache.tissue.abscissionScarRecords)
      .toEqual(before.projectionCache.tissue.abscissionScarRecords);
  }, 60_000);

  it('forces a topology rebuild when a zero-mass wound location changes', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 91_000 });
    const leafLocalId = firstScarLeafLocalId(state);
    const mutated = mutateFirstScar(state, (scar) => ({
      ...scar,
      positionM: { ...scar.positionM, x: scar.positionM.x + 0.002 },
    }), leafLocalId);
    const cached = buildOakRenderFrameV1(mutated, {
      renderRevision: 91_001,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(mutated, { renderRevision: 91_001 });
    expect(cached.projectionCacheHits.tissueTopology).toBe(false);
    expect(cached.projectionCache.tissue.abscissionScarRecords)
      .toEqual(cold.projectionCache.tissue.abscissionScarRecords);
    // A sub-cell location mutation may select the same bounded parent cube,
    // but the cache must still rebuild instead of assuming that result.
    expect(cached.projectionCache.tissue.abscissionScarRecords)
      .toEqual(before.projectionCache.tissue.abscissionScarRecords);
  }, 60_000);

  it.each([
    ['direction', (scar: NonNullable<OakLeafOrganSnapshotV1['abscissionScar']>) => ({
      ...scar,
      direction: { ...scar.direction, x: scar.direction.x + 0.01 },
    })],
    ['roll', (scar: NonNullable<OakLeafOrganSnapshotV1['abscissionScar']>) => ({
      ...scar,
      rollRadians: scar.rollRadians + 0.01,
    })],
  ] as const)('invalidates exact litter when scar %s changes', (_label, mutate) => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const state = simulation.projection();
    const before = buildOakRenderFrameV1(state, { renderRevision: 92_000 });
    const mutated = mutateFirstScar(state, mutate, firstScarLeafLocalId(state));
    const cached = buildOakRenderFrameV1(mutated, {
      renderRevision: 92_001,
      previousFrame: before,
    });
    const cold = buildOakRenderFrameV1(mutated, { renderRevision: 92_001 });
    expect(cached.projectionCacheHits.tissueTopology).toBe(false);
    expect(cached.projectionCacheHits.litter).toBe(false);
    expect(cached.projectionCache.tissue.abscissionScarRecords)
      .toEqual(cold.projectionCache.tissue.abscissionScarRecords);
    expect(cached.projectionCache.litter)
      .toEqual(cold.projectionCache.litter);
    expect(cached.projectionCache.litterFingerprint)
      .not.toBe(before.projectionCache.litterFingerprint);
  }, 60_000);

  it('recolors existing parent cells instead of appending massful scar cubes', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const frame = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 93_000,
    });
    const tissue = frame.projectionCache.tissue;
    const canonical = [...tissue.records.values()].flat();
    const canonicalByKey = new Map(canonical.map((record) => [record.key, record] as const));
    expect(tissue.abscissionScarRecords.length).toBeGreaterThan(0);
    for (const wound of tissue.abscissionScarRecords) {
      expect(wound.key).toMatch(/^oak:organ:\d+:\d+:union-voxel:/u);
      expect(canonicalByKey.get(wound.key)).toEqual(wound);
      expect(canonical.filter((record) => record.key === wound.key)).toHaveLength(1);
    }
    const wood = tissue.records.get('batch:oak:wood-voxels')!;
    expect(frame.metrics.woodVoxels).toBe(wood.length);
    // Counter-run for the retired model: appending one cube per wound must
    // disagree with the published wood count because wounds are state only.
    expect(frame.metrics.woodVoxels)
      .not.toBe(wood.length + tissue.abscissionScarRecords.length);
  }, 60_000);
});
