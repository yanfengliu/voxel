import { describe, expect, it } from 'vitest';

import {
  oakWindDirectionV1,
  oakWindSpeedAtHostTickV1,
  oakWindTravelOverHostTicksV1,
} from './oak-mechanics.js';
import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import { createOakSimulationV1, oakHostTicksForBiologicalDaysV1 } from './oak-simulation.js';
import { oakSoilSurfaceAtWorldXZV1 } from './oak-soil-surface.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import {
  buildOakWeatherVoxelPresentationV1,
  createOakWeatherVoxelMaterialV1,
  oakWeatherNeedsOccupancyV1,
  OAK_RAIN_FALL_TICKS_V1,
  OAK_RAIN_IMPACT_TICKS_V1,
  OAK_RAIN_PRESENTATION_TICKS_V1,
  OAK_WEATHER_VOXEL_BATCH_KEY_V1,
  OAK_WEATHER_PRESENTATION_AUTHORITY_V1,
} from './oak-weather-voxel-presentation.js';

const EVENT = Object.freeze({
  id: 1, startedHostTick: 100, startedWindTravelM: 0, liters: 0.4,
});
const STILL = Object.freeze({ regime: 'still' as const, phaseTick: 0, speedMPerS: 0 });
const BREEZE = Object.freeze({ regime: 'breeze' as const, phaseTick: 30, speedMPerS: 6 });

function build(overrides: Partial<Parameters<typeof buildOakWeatherVoxelPresentationV1>[0]> = {}) {
  return buildOakWeatherVoxelPresentationV1({
    hostTick: 100,
    wind: STILL,
    windTravelM: 0,
    rainEvent: EVENT,
    ...overrides,
  });
}

function center(record: ReturnType<typeof build>['records'][number]): readonly [number, number, number] {
  return [record.matrix[12]!, record.matrix[13]!, record.matrix[14]!];
}

function cubeBounds(
  cubeCenter: readonly [number, number, number],
): Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }> {
  const half = OAK_TISSUE_VOXEL_PITCH_M_V1 / 2;
  return {
    min: cubeCenter.map((value) => value - half) as [number, number, number],
    max: cubeCenter.map((value) => value + half) as [number, number, number],
  };
}

describe('oak representative voxel weather presentation', () => {
  it('requests placed-cube occupancy only while a rain or breeze cue is active', () => {
    expect(oakWeatherNeedsOccupancyV1({
      hostTick: 100, wind: STILL, rainEvent: undefined,
    })).toBe(false);
    expect(oakWeatherNeedsOccupancyV1({
      hostTick: 100, wind: STILL, rainEvent: EVENT,
    })).toBe(true);
    expect(oakWeatherNeedsOccupancyV1({
      hostTick: EVENT.startedHostTick + OAK_RAIN_PRESENTATION_TICKS_V1,
      wind: STILL,
      rainEvent: EVENT,
    })).toBe(false);
    expect(oakWeatherNeedsOccupancyV1({
      hostTick: 100, wind: BREEZE, rainEvent: undefined,
    })).toBe(true);
  });

  it('is deterministic, bounded, voxel-only, and explicit about its authority', () => {
    const first = build();
    const second = build();
    expect(second).toEqual(first);
    expect(first.records.length).toBeGreaterThan(100);
    expect(first.records.length).toBeLessThan(1_000);
    expect(first.evidence.authority).toBe(OAK_WEATHER_PRESENTATION_AUTHORITY_V1);
    expect(first.evidence.rainPhase).toBe('falling');
    expect(first.evidence.rainPulseLiters).toBe(0.4);
    for (const record of first.records) {
      expect(record.color.a).toBe(255);
      expect(record.matrix.slice(0, 12)).toEqual([
        OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0, 0,
        0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0, 0,
        0, 0, OAK_TISSUE_VOXEL_PITCH_M_V1, 0,
      ]);
    }
    expect(createOakWeatherVoxelMaterialV1()).toMatchObject({
      shading: 'unlit', vertexColors: true, transparent: true, opacity: 0.76,
    });
  });

  it('falls monotonically, touches the shared retained surface, then disappears', () => {
    const early = build({ hostTick: 100 });
    const later = build({ hostTick: 130 });
    const lateByKey = new Map(later.records.map((record) => [record.key, record]));
    let compared = 0;
    for (const record of early.records) {
      const late = lateByKey.get(record.key);
      if (late === undefined) continue;
      expect(center(late)[1]).toBeLessThan(center(record)[1]);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(100);

    const lastFalling = build({
      hostTick: EVENT.startedHostTick + OAK_RAIN_FALL_TICKS_V1 - 1,
    });
    expect(lastFalling.evidence.rainPhase).toBe('falling');
    for (const record of lastFalling.records) {
      const [x, y, z] = center(record);
      const surface = oakSoilSurfaceAtWorldXZV1(x, z);
      expect(surface).not.toBeNull();
      expect(y - OAK_TISSUE_VOXEL_PITCH_M_V1 * 0.5).toBeGreaterThan(surface!.topM);
    }

    const impact = build({ hostTick: EVENT.startedHostTick + OAK_RAIN_FALL_TICKS_V1 + 8 });
    expect(impact.evidence.rainPhase).toBe('impact');
    expect(impact.evidence.rainVoxelCount).toBeGreaterThan(100);
    let surfaceContacts = 0;
    let reboundVoxels = 0;
    const directionsByStreak = new Map<string, Set<string>>();
    for (const record of impact.records) {
      const [x, y, z] = center(record);
      const surface = oakSoilSurfaceAtWorldXZV1(x, z);
      expect(surface).not.toBeNull();
      const bottomM = y - OAK_TISSUE_VOXEL_PITCH_M_V1 * 0.5;
      expect(bottomM).toBeGreaterThanOrEqual(surface!.topM);
      if (Math.abs(bottomM - surface!.topM) < 1e-12) surfaceContacts += 1;
      else {
        reboundVoxels += 1;
        const match = /^oak:weather:splash:[0-9]+:([0-9]+):([0-9]+):[0-9]+$/u
          .exec(record.key);
        if (match) {
          const directions = directionsByStreak.get(match[1]!) ?? new Set<string>();
          directions.add(match[2]!);
          directionsByStreak.set(match[1]!, directions);
        }
      }
    }
    expect(surfaceContacts).toBeGreaterThan(20);
    expect(reboundVoxels).toBeGreaterThan(100);
    expect(directionsByStreak.size).toBeGreaterThan(20);
    expect([...directionsByStreak.values()].every(
      (directions) => directions.size >= 3 && directions.size <= 5,
    )).toBe(true);
    expect(new Set([...directionsByStreak.values()].map((directions) =>
      [...directions].sort().join(','))).size).toBeGreaterThan(10);

    const expired = build({ hostTick: EVENT.startedHostTick + OAK_RAIN_PRESENTATION_TICKS_V1 });
    expect(expired.evidence.rainPhase).toBe('inactive');
    expect(expired.evidence.rainPulseLiters).toBe(0);
    expect(expired.evidence.rainVoxelCount).toBe(0);
    expect(expired.records).toEqual([]);
  });

  it('clips rain impacts to the retained cutaway half and clears occupied tissue cells', () => {
    const impactTick = EVENT.startedHostTick + OAK_RAIN_FALL_TICKS_V1 + 5;
    const whole = build({ hostTick: impactTick });
    const retained = build({
      hostTick: impactTick,
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    expect(retained.records.length).toBeGreaterThan(0);
    expect(retained.records.length).toBeLessThan(whole.records.length);
    for (const record of retained.records) expect(center(record)[0]).toBeLessThan(0);

    const blockedCenter = center(whole.records[0]!);
    const blocked = build({
      hostTick: impactTick,
      occupiedCubeBoundsM: [cubeBounds(blockedCenter)],
    });
    expect(blocked.records.some((record) => center(record).every(
      (value, index) => value === blockedCenter[index],
    ))).toBe(false);
    expect(blocked.records.length).toBe(whole.records.length - 1);

    const fractionalOverlapCenter = [...blockedCenter] as [number, number, number];
    fractionalOverlapCenter[0] += OAK_TISSUE_VOXEL_PITCH_M_V1 * .75;
    const fractionalOverlap = build({
      hostTick: impactTick,
      occupiedCubeBoundsM: [cubeBounds(fractionalOverlapCenter)],
    });
    expect(fractionalOverlap.records.some((record) => center(record).every(
      (value, index) => value === blockedCenter[index],
    ))).toBe(false);

    const faceContactCenter = [...blockedCenter] as [number, number, number];
    faceContactCenter[0] += OAK_TISSUE_VOXEL_PITCH_M_V1;
    const faceContact = build({
      hostTick: impactTick,
      occupiedCubeBoundsM: [cubeBounds(faceContactCenter)],
    });
    expect(faceContact.records.some((record) => center(record).every(
      (value, index) => value === blockedCenter[index],
    ))).toBe(true);
  });

  it('uses the mechanics direction and advances periodic packets forward with wind travel', () => {
    expect(build({ wind: STILL, rainEvent: undefined }).records).toEqual([]);
    const before = build({ wind: BREEZE, rainEvent: undefined, windTravelM: 0.07 });
    const after = build({ wind: BREEZE, rainEvent: undefined, windTravelM: 0.072 });
    expect(before.evidence.windVoxelCount).toBeGreaterThan(50);
    expect(before.evidence.windDirection).toEqual(oakWindDirectionV1());
    expect(before.evidence.windSpeedMPerS).toBe(6);
    const afterByKey = new Map(after.records.map((record) => [record.key, record]));
    const direction = oakWindDirectionV1();
    const forward = before.records.flatMap((record) => {
      const next = afterByKey.get(record.key);
      if (next === undefined) return [];
      const from = center(record);
      const to = center(next);
      return [(to[0] - from[0]) * direction.x + (to[2] - from[2]) * direction.z];
    });
    expect(forward.length).toBeGreaterThan(50);
    expect(forward.filter((distance) => distance > 0).length / forward.length)
      .toBeGreaterThan(0.9);
    expect(Math.max(...forward)).toBeGreaterThan(0);
  });

  it('advects falling rain along the same direction as an active breeze', () => {
    const still = build({ hostTick: 130, wind: STILL });
    const breeze = build({ hostTick: 130, wind: BREEZE, windTravelM: 2 });
    const breezeByKey = new Map(breeze.records
      .filter((record) => record.key.startsWith('oak:weather:rain:'))
      .map((record) => [record.key, record]));
    const direction = oakWindDirectionV1();
    const downwind = still.records
      .filter((record) => record.key.startsWith('oak:weather:rain:'))
      .flatMap((record) => {
        const next = breezeByKey.get(record.key);
        if (next === undefined) return [];
        const from = center(record);
        const to = center(next);
        return [(to[0] - from[0]) * direction.x + (to[2] - from[2]) * direction.z];
      });
    expect(downwind.length).toBeGreaterThan(100);
    expect(downwind.filter((distance) => distance > 0).length / downwind.length)
      .toBeGreaterThan(0.8);
    expect(downwind.reduce((sum, distance) => sum + distance, 0) / downwind.length)
      .toBeGreaterThan(OAK_TISSUE_VOXEL_PITCH_M_V1);
  });

  it('never moves a falling rain head upwind across every gust launch phase', () => {
    const direction = oakWindDirectionV1();
    for (let startTick = 0; startTick < 120; startTick += 1) {
      const startedWindTravelM = oakWindTravelOverHostTicksV1(0, startTick, 'breeze');
      const previousByStreak = new Map<string, readonly [number, number, number]>();
      for (let age = 0; age < OAK_RAIN_FALL_TICKS_V1; age += 1) {
        const hostTick = startTick + age;
        const windTravelM = startedWindTravelM
          + oakWindTravelOverHostTicksV1(startTick, hostTick, 'breeze');
        const frame = build({
          hostTick,
          wind: {
            regime: 'breeze',
            phaseTick: hostTick,
            speedMPerS: oakWindSpeedAtHostTickV1(hostTick, 'breeze'),
          },
          windTravelM,
          rainEvent: {
            id: 1, startedHostTick: startTick, startedWindTravelM, liters: 0.4,
          },
        });
        for (const record of frame.records.filter(({ key }) =>
          /^oak:weather:rain:1:[0-9]+:0$/u.test(key))) {
          const streak = record.key.split(':')[4]!;
          const next = center(record);
          const previous = previousByStreak.get(streak);
          if (previous !== undefined) {
            const downwind = (next[0] - previous[0]) * direction.x
              + (next[2] - previous[2]) * direction.z;
            expect(downwind, `launch ${String(startTick)}, age ${String(age)}, streak ${streak}`)
              .toBeGreaterThanOrEqual(-1e-12);
          }
          previousByStreak.set(streak, next);
        }
      }
    }
  });

  it('patches only weather while reusing biology, litter, and the worker-meshed soil chunk', () => {
    const simulation = createOakSimulationV1({ paused: true });
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    const state = simulation.projection();
    const first = buildOakRenderFrameV1(state, {
      renderRevision: 10,
      weatherPresentation: {
        hostTick: state.wind.phaseTick,
        wind: state.wind,
        windTravelM: 0.07,
      },
    });
    const second = buildOakRenderFrameV1(state, {
      renderRevision: 11,
      previousFrame: first,
      weatherPresentation: {
        hostTick: state.wind.phaseTick,
        wind: state.wind,
        windTravelM: 0.072,
      },
    });
    expect(second.projectionCacheHits).toEqual({
      tissue: true, tissueTopology: true, soil: true, litter: true,
    });
    expect(second.snapshot.chunks[0]!.revision).toBe(first.snapshot.chunks[0]!.revision);
    const delta = buildOakRenderDeltaV1(first, second);
    expect(delta.operations).toHaveLength(1);
    expect(delta.operations[0]).toMatchObject({
      op: 'patch-batch-instances', key: 'batch:oak:weather-voxels',
    });
  });

  it('keeps every day-249 rain impact frame out of all placed fine cubes', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(249));
    const snapshot = simulation.snapshot();
    const coordinate = (matrices: ArrayLike<number>, slot: number): string =>
      `${String(matrices[slot * 16 + 12])}:${String(matrices[slot * 16 + 13])}:`
      + String(matrices[slot * 16 + 14]);
    for (const rootCutaway of [undefined, {
      axis: 'x', planeM: 0, keep: 'less-than',
    } as const]) {
      for (let impactAge = 0; impactAge < OAK_RAIN_IMPACT_TICKS_V1; impactAge += 1) {
        const frame = buildOakRenderFrameV1(simulation.projection(), {
          renderRevision: 20 + impactAge,
          ...(rootCutaway ? { rootCutaway } : {}),
          weatherPresentation: {
            hostTick: snapshot.hostTick,
            wind: snapshot.wind,
            windTravelM: 0,
            rainEvent: {
              id: 1,
              startedHostTick: snapshot.hostTick - OAK_RAIN_FALL_TICKS_V1 - impactAge,
              startedWindTravelM: 0,
              liters: 0.4,
            },
          },
        });
        const weather = frame.snapshot.batches.find(
          ({ key }) => key === OAK_WEATHER_VOXEL_BATCH_KEY_V1,
        )!;
        const placed = new Set(frame.snapshot.batches
          .filter(({ key }) => key !== OAK_WEATHER_VOXEL_BATCH_KEY_V1)
          .flatMap((batch) => batch.instanceKeys.map((_, slot) =>
            coordinate(batch.matrices, slot))));
        const litter = frame.snapshot.batches.find(
          ({ key }) => key === OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1,
        )!;
        expect(litter.instanceKeys.length, `cutaway=${String(Boolean(rootCutaway))}`)
          .toBeGreaterThan(0);
        expect(weather.instanceKeys.filter((_, slot) =>
          placed.has(coordinate(weather.matrices, slot))),
        `impact age ${String(impactAge)}, cutaway=${String(Boolean(rootCutaway))}`).toEqual([]);
      }
    }
  });

  it('rejects invalid timing, water, and wind inputs with actionable messages', () => {
    expect(() => build({ hostTick: -1 })).toThrow(/hostTick.*nonnegative/u);
    expect(() => build({ windTravelM: Number.NaN })).toThrow(/wind travel.*finite/u);
    expect(() => build({ rainEvent: { ...EVENT, liters: 0 } })).toThrow(/liters.*positive/u);
    expect(() => build({ rainEvent: { ...EVENT, startedWindTravelM: 1 } }))
      .toThrow(/starting wind travel.*no greater/u);
    expect(() => build({ rainEvent: { ...EVENT, startedHostTick: 101 } }))
      .toThrow(/no later than 100/u);
  });
});
