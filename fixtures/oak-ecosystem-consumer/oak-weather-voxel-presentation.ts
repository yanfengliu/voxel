import type { MaterialResourceV1, Srgb8ColorV1 } from '../../src/core/index.js';
import { oakWindDirectionV1 } from './oak-mechanics.js';
import type { OakRootCutawayV1 } from './oak-render-projection.js';
import type { OakRenderInstanceRecordV1 } from './oak-render-projection.js';
import { oakSoilSurfaceAtFineCellV1 } from './oak-soil-surface.js';
import {
  oakTissueCellCenterM_V1,
  oakTissueCellKeyV1,
  roundOakTissueCellV1,
  type OakTissueLatticeCellV1,
} from './oak-tissue-lattice.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';
import { oakVoxelAabbGridKeysV1, type OakVoxelAabbV1 } from './oak-voxel-aabb.js';

export const OAK_WEATHER_VOXEL_MATERIAL_KEY_V1 = 'material:oak:weather-voxel';
export const OAK_WEATHER_VOXEL_BATCH_KEY_V1 = 'batch:oak:weather-voxels';
export const OAK_WEATHER_PRESENTATION_AUTHORITY_V1 =
  'representative-cue-only; water ledgers, soil state, wind speed, and organ poses remain authoritative';
export const OAK_RAIN_FALL_TICKS_V1 = 78;
export const OAK_RAIN_IMPACT_TICKS_V1 = 24;
export const OAK_RAIN_PRESENTATION_TICKS_V1 =
  OAK_RAIN_FALL_TICKS_V1 + OAK_RAIN_IMPACT_TICKS_V1;

export const OAK_WEATHER_VOXEL_RULE_IDS_V1 = Object.freeze([
  'rain-cue-fall-impact-expiry',
  'rain-cue-retained-surface-contact',
  'rain-cue-shared-wind-drift',
  'shared-mechanics-airflow-direction',
  'weather-cue-scene-occupancy-clearance',
  'weather-cue-voxel-material',
] as const);

const RAIN_STREAK_COUNT = 36;
const RAIN_TRAIL_VOXELS = 6;
const WIND_PACKET_COUNT = 18;
const WIND_PACKET_VOXELS = 6;
const WIND_FIELD_LENGTH_M = 0.52;
const RAIN_DRIFT_TRAVEL_M_PER_CELL = 0.25;
const MAXIMUM_RAIN_DRIFT_CELLS = 8;
const PITCH = OAK_TISSUE_VOXEL_PITCH_M_V1;

export interface OakRainPresentationEventV1 {
  readonly id: number;
  readonly startedHostTick: number;
  /** Integrated authoritative breeze travel when this visible event began. */
  readonly startedWindTravelM: number;
  readonly liters: number;
}

export interface OakWeatherPresentationInputV1 {
  readonly hostTick: number;
  readonly wind: OakSimulationSnapshotV1['wind'];
  /** Integrated by the fixture host from authoritative speed at the shared 60 Hz tick. */
  readonly windTravelM: number;
  readonly rainEvent?: OakRainPresentationEventV1 | undefined;
  readonly rootCutaway?: OakRootCutawayV1;
  /** Full world extents of cubes already placed by material batches. */
  readonly occupiedCubeBoundsM?: readonly OakVoxelAabbV1[];
}

export interface OakWeatherPresentationEvidenceV1 {
  readonly authority: typeof OAK_WEATHER_PRESENTATION_AUTHORITY_V1;
  readonly rainPhase: 'inactive' | 'falling' | 'impact';
  readonly rainPulseLiters: number;
  readonly rainVoxelCount: number;
  readonly windVoxelCount: number;
  readonly totalVoxelCount: number;
  readonly windSpeedMPerS: number;
  readonly windTravelM: number;
  readonly windDirection: Readonly<{ x: number; y: number; z: number }>;
}

export interface OakWeatherVoxelProjectionV1 {
  readonly records: readonly OakRenderInstanceRecordV1[];
  readonly evidence: OakWeatherPresentationEvidenceV1;
}

function oakRainPresentationPhaseV1(
  input: Pick<OakWeatherPresentationInputV1, 'hostTick' | 'rainEvent'>,
): OakWeatherPresentationEvidenceV1['rainPhase'] {
  const rainAge = input.rainEvent === undefined
    ? OAK_RAIN_PRESENTATION_TICKS_V1
    : input.hostTick - input.rainEvent.startedHostTick;
  return rainAge < OAK_RAIN_FALL_TICKS_V1
    ? 'falling'
    : rainAge < OAK_RAIN_PRESENTATION_TICKS_V1
      ? 'impact'
      : 'inactive';
}

/** Whether visible weather can query placed-cube occupancy this host tick. */
export function oakWeatherNeedsOccupancyV1(
  input: Pick<OakWeatherPresentationInputV1, 'hostTick' | 'rainEvent' | 'wind'>,
): boolean {
  return oakRainPresentationPhaseV1(input) !== 'inactive'
    || (input.wind.regime === 'breeze' && input.wind.speedMPerS > 0);
}

function validate(input: OakWeatherPresentationInputV1): void {
  if (!Number.isSafeInteger(input.hostTick) || input.hostTick < 0) {
    throw new RangeError(`Oak weather hostTick must be a nonnegative safe integer; received ${String(input.hostTick)}.`);
  }
  if (!Number.isFinite(input.wind.speedMPerS) || input.wind.speedMPerS < 0) {
    throw new RangeError(`Oak weather wind speed must be finite and nonnegative; received ${String(input.wind.speedMPerS)}.`);
  }
  if (!Number.isFinite(input.windTravelM) || input.windTravelM < 0) {
    throw new RangeError(`Oak weather wind travel must be finite and nonnegative; received ${String(input.windTravelM)}.`);
  }
  const event = input.rainEvent;
  if (event === undefined) return;
  if (!Number.isSafeInteger(event.id) || event.id < 1) {
    throw new RangeError(`Oak rain cue id must be a positive safe integer; received ${String(event.id)}.`);
  }
  if (!Number.isSafeInteger(event.startedHostTick) || event.startedHostTick < 0
    || event.startedHostTick > input.hostTick) {
    throw new RangeError(
      `Oak rain cue start must be a nonnegative host tick no later than ${String(input.hostTick)}; `
      + `received ${String(event.startedHostTick)}.`,
    );
  }
  if (!Number.isFinite(event.startedWindTravelM) || event.startedWindTravelM < 0
    || event.startedWindTravelM > input.windTravelM) {
    throw new RangeError(
      'Oak rain cue starting wind travel must be finite, nonnegative, and no greater than '
      + `current travel ${String(input.windTravelM)}; received ${String(event.startedWindTravelM)}.`,
    );
  }
  if (!Number.isFinite(event.liters) || event.liters <= 0) {
    throw new RangeError(`Oak rain cue liters must be finite and positive; received ${String(event.liters)}.`);
  }
}

function hash(index: number, salt: number): number {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function cubeMatrix(cell: OakTissueLatticeCellV1): readonly number[] {
  const center = oakTissueCellCenterM_V1(cell);
  return [
    PITCH, 0, 0, 0,
    0, PITCH, 0, 0,
    0, 0, PITCH, 0,
    center[0], center[1], center[2], 1,
  ];
}

function colorFor(kind: 'rain' | 'wind', index: number): Srgb8ColorV1 {
  const shade = hash(index, kind === 'rain' ? 17 : 29) % 20;
  return kind === 'rain'
    ? { r: 132 + shade, g: 204 + shade, b: 232 + Math.floor(shade / 2), a: 255 }
    : { r: 207 + Math.floor(shade / 2), g: 232 + Math.floor(shade / 2), b: 174 + shade, a: 255 };
}

function blockedCells(
  bounds: readonly OakVoxelAabbV1[] | undefined,
): ReadonlySet<string> {
  return new Set((bounds ?? []).flatMap((box) =>
    oakVoxelAabbGridKeysV1(box, PITCH)));
}

function addCell(
  records: OakRenderInstanceRecordV1[],
  occupied: Set<string>,
  blocked: ReadonlySet<string>,
  cell: OakTissueLatticeCellV1,
  key: string,
  color: Srgb8ColorV1,
): void {
  const cellKey = oakTissueCellKeyV1(cell);
  if (occupied.has(cellKey) || blocked.has(cellKey)) return;
  occupied.add(cellKey);
  records.push({ key, matrix: cubeMatrix(cell), color });
}

function rainCellXZ(streak: number): readonly [number, number] {
  return [
    -86 + hash(streak, 3) % 173,
    -86 + hash(streak, 7) % 173,
  ];
}

function rainDriftCells(
  input: OakWeatherPresentationInputV1,
): readonly [number, number] {
  const event = input.rainEvent;
  if (event === undefined) return [0, 0];
  const direction = oakWindDirectionV1();
  const eventTravelM = input.windTravelM - event.startedWindTravelM;
  const magnitude = Math.min(
    MAXIMUM_RAIN_DRIFT_CELLS,
    Math.floor(eventTravelM / RAIN_DRIFT_TRAVEL_M_PER_CELL),
  );
  return [Math.round(direction.x * magnitude), Math.round(direction.z * magnitude)];
}

function rainImpactCellXZ(
  streak: number,
  input: OakWeatherPresentationInputV1,
): readonly [number, number] {
  const origin = rainCellXZ(streak);
  const drift = rainDriftCells(input);
  return [origin[0] + drift[0], origin[1] + drift[1]];
}

function addFallingRain(
  records: OakRenderInstanceRecordV1[],
  occupied: Set<string>,
  blocked: ReadonlySet<string>,
  input: OakWeatherPresentationInputV1,
  age: number,
): void {
  const progress = age / (OAK_RAIN_FALL_TICKS_V1 - 1);
  const drift = rainDriftCells(input);
  const direction = oakWindDirectionV1();
  for (let streak = 0; streak < RAIN_STREAK_COUNT; streak += 1) {
    const origin = rainCellXZ(streak);
    const impact = rainImpactCellXZ(streak, input);
    const headX = origin[0] + Math.round(drift[0] * progress);
    const headZ = origin[1] + Math.round(drift[1] * progress);
    const surface = oakSoilSurfaceAtFineCellV1(impact[0], impact[1], input.rootCutaway);
    const headSurface = oakSoilSurfaceAtFineCellV1(headX, headZ, input.rootCutaway);
    if (surface === null) continue;
    const firstAirCellY = surface.topBoundaryWorldVoxelY * 5;
    const initialHeadCellY = 166 + hash(streak, 11) % 31;
    const travelCells = initialHeadCellY - firstAirCellY;
    // Falling remains strictly airborne through age 77. The first exact
    // terrain contact belongs to the age-78 impact frame, which is also when
    // the browser controller releases the authoritative water pulse.
    const headCellY = Math.max(
      headSurface?.topBoundaryWorldVoxelY === undefined
        ? firstAirCellY + 1
        : headSurface.topBoundaryWorldVoxelY * 5 + 1,
      initialHeadCellY - Math.floor(travelCells * progress),
    );
    for (let trail = 0; trail < RAIN_TRAIL_VOXELS; trail += 1) {
      const cellY = headCellY + trail;
      if (cellY < firstAirCellY) continue;
      const slant = Math.round(trail * Math.min(1, input.wind.speedMPerS / 6) * 0.55);
      addCell(
        records,
        occupied,
        blocked,
        [
          headX - Math.round(direction.x * slant),
          cellY,
          headZ - Math.round(direction.z * slant),
        ],
        `oak:weather:rain:${String(input.rainEvent!.id)}:${String(streak)}:${String(trail)}`,
        colorFor('rain', streak + trail),
      );
    }
  }
}

const SPLASH_DIRECTIONS = Object.freeze([
  [1, 0], [2, 1], [1, 1], [1, 2], [0, 1], [-1, 2], [-1, 1], [-2, 1],
  [-1, 0], [-2, -1], [-1, -1], [-1, -2], [0, -1], [1, -2], [1, -1], [2, -1],
] as const);

function addRainImpacts(
  records: OakRenderInstanceRecordV1[],
  occupied: Set<string>,
  blocked: ReadonlySet<string>,
  input: OakWeatherPresentationInputV1,
  impactAge: number,
): void {
  for (let streak = 0; streak < RAIN_STREAK_COUNT; streak += 1) {
    const [originX, originZ] = rainImpactCellXZ(streak, input);
    const originSurface = oakSoilSurfaceAtFineCellV1(originX, originZ, input.rootCutaway);
    if (originSurface === null) continue;
    addCell(
      records,
      occupied,
      blocked,
      [originX, originSurface.topBoundaryWorldVoxelY * 5, originZ],
      `oak:weather:contact:${String(input.rainEvent!.id)}:${String(streak)}`,
      colorFor('rain', streak + 89),
    );
    const rayCount = 3 + hash(streak, 53) % 3;
    const rayStart = hash(streak, 59) % SPLASH_DIRECTIONS.length;
    const rayStride = 1 + 2 * (hash(streak, 61) % 8);
    const maximumRadius = 3 + hash(streak, 67) % 4;
    const radius = 1 + Math.floor(impactAge * maximumRadius / OAK_RAIN_IMPACT_TICKS_V1);
    const maximumHeight = 2 + hash(streak, 71) % 4;
    const reboundHeight = Math.max(1, Math.round(
      maximumHeight
        * Math.sin(Math.PI * (impactAge + 1) / (OAK_RAIN_IMPACT_TICKS_V1 + 1)),
    ));
    for (let ray = 0; ray < rayCount; ray += 1) {
      const directionIndex = (rayStart + ray * rayStride) % SPLASH_DIRECTIONS.length;
      const direction = SPLASH_DIRECTIONS[directionIndex]!;
      const divisor = Math.max(Math.abs(direction[0]), Math.abs(direction[1]));
      const cellX = originX + Math.round(direction[0] * radius / divisor);
      const cellZ = originZ + Math.round(direction[1] * radius / divisor);
      const surface = oakSoilSurfaceAtFineCellV1(cellX, cellZ, input.rootCutaway);
      if (surface === null) continue;
      const firstAirCellY = surface.topBoundaryWorldVoxelY * 5;
      const trailLength = 1 + hash(streak * 17 + directionIndex, 73) % 2;
      for (let trail = 0; trail < Math.min(trailLength, reboundHeight); trail += 1) {
        addCell(
          records,
          occupied,
          blocked,
          [cellX, firstAirCellY + reboundHeight - trail, cellZ],
          `oak:weather:splash:${String(input.rainEvent!.id)}:${String(streak)}:`
            + `${String(directionIndex)}:${String(trail)}`,
          colorFor('rain', streak + directionIndex + trail + 101),
        );
      }
    }
  }
}

function addWind(
  records: OakRenderInstanceRecordV1[],
  occupied: Set<string>,
  blocked: ReadonlySet<string>,
  input: OakWeatherPresentationInputV1,
): void {
  if (input.wind.regime !== 'breeze' || input.wind.speedMPerS <= 0) return;
  const direction = oakWindDirectionV1();
  const perpendicular = { x: -direction.z, z: direction.x };
  for (let packet = 0; packet < WIND_PACKET_COUNT; packet += 1) {
    const lane = -0.18 + (packet % 9) * 0.045;
    const heightM = 0.035 + Math.floor(packet / 3) * 0.052;
    const phaseM = hash(packet, 41) / 0x1_0000_0000 * WIND_FIELD_LENGTH_M;
    const headM = mod(input.windTravelM + phaseM, WIND_FIELD_LENGTH_M)
      - WIND_FIELD_LENGTH_M * 0.5;
    for (let trail = 0; trail < WIND_PACKET_VOXELS; trail += 1) {
      const alongM = headM - trail * PITCH * 2.5;
      const world: readonly [number, number, number] = [
        direction.x * alongM + perpendicular.x * lane,
        heightM,
        direction.z * alongM + perpendicular.z * lane,
      ];
      const cell = roundOakTissueCellV1(world);
      addCell(
        records,
        occupied,
        blocked,
        cell,
        `oak:weather:wind:${String(packet)}:${String(trail)}`,
        colorFor('wind', packet + trail),
      );
    }
  }
}

export function createOakWeatherVoxelMaterialV1(): MaterialResourceV1 {
  return {
    kind: 'material',
    key: OAK_WEATHER_VOXEL_MATERIAL_KEY_V1,
    incarnation: 1,
    revision: 1,
    shading: 'unlit',
    color: { r: 255, g: 255, b: 255, a: 255 },
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    doubleSided: false,
    roughness: 1,
    metalness: 0,
  };
}

export function buildOakWeatherVoxelPresentationV1(
  input: OakWeatherPresentationInputV1,
): OakWeatherVoxelProjectionV1 {
  validate(input);
  const records: OakRenderInstanceRecordV1[] = [];
  const occupied = new Set<string>();
  const blocked = blockedCells(input.occupiedCubeBoundsM);
  const rainAge = input.rainEvent === undefined
    ? OAK_RAIN_PRESENTATION_TICKS_V1
    : input.hostTick - input.rainEvent.startedHostTick;
  const rainPhase = oakRainPresentationPhaseV1(input);
  const rainStart = records.length;
  if (rainPhase === 'falling') addFallingRain(records, occupied, blocked, input, rainAge);
  else if (rainPhase === 'impact') {
    addRainImpacts(records, occupied, blocked, input, rainAge - OAK_RAIN_FALL_TICKS_V1);
  }
  const rainVoxelCount = records.length - rainStart;
  const windStart = records.length;
  addWind(records, occupied, blocked, input);
  const windVoxelCount = records.length - windStart;
  const direction = oakWindDirectionV1();
  return {
    records: records.sort((left, right) => left.key.localeCompare(right.key)),
    evidence: {
      authority: OAK_WEATHER_PRESENTATION_AUTHORITY_V1,
      rainPhase,
      rainPulseLiters: rainPhase === 'inactive' ? 0 : input.rainEvent?.liters ?? 0,
      rainVoxelCount,
      windVoxelCount,
      totalVoxelCount: records.length,
      windSpeedMPerS: input.wind.speedMPerS,
      windTravelM: input.windTravelM,
      windDirection: direction,
    },
  };
}
