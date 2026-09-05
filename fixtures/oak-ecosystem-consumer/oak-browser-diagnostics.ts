import type { ThreeRenderMetrics } from '../../src/three/index.js';
import { formatOakDiagnostic } from './oak-browser-dom.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';

export interface OakWeatherDiagnosticV1 {
  readonly rainPhase: 'inactive' | 'falling' | 'impact';
  readonly rainPulseLiters: number;
  readonly rainVoxelCount: number;
  readonly windVoxelCount: number;
}

function topsoilCells(
  biological: OakSimulationSnapshotV1,
): OakSimulationSnapshotV1['soil'] {
  return biological.soil.filter((cell) =>
    Math.abs(cell.centerM.y + cell.sizeM.y * 0.5) < 1e-12);
}

/** Present biological and renderer evidence without making the HUD authoritative. */
export function updateOakBrowserDiagnosticsV1(
  nodes: ReadonlyMap<string, HTMLElement>,
  biological: OakSimulationSnapshotV1,
  metrics: ThreeRenderMetrics,
  weather: OakWeatherDiagnosticV1 = {
    rainPhase: 'inactive', rainPulseLiters: 0, rainVoxelCount: 0, windVoxelCount: 0,
  },
): void {
  const diagnostics = biological.diagnostics;
  const pools = biological.plantMobilePools;
  const residual = biological.ledger.residual;
  const surface = topsoilCells(biological);
  const meanSurfaceWater = surface.length === 0
    ? 0
    : surface.reduce((sum, cell) => sum + cell.volumetricWaterFraction, 0) / surface.length;
  const surfaceNitrogenKg = surface.reduce(
    (sum, cell) => sum + cell.ammoniumKg + cell.nitrateKg,
    0,
  );
  const surfacePhosphorusKg = surface.reduce(
    (sum, cell) => sum + cell.labilePhosphorusKg,
    0,
  );
  const set = (key: string, value: string): void => {
    const node = nodes.get(key);
    if (node !== undefined) node.textContent = value;
  };
  set('age', formatOakDiagnostic(biological.elapsedBiologicalSeconds / 86_400, 2, 'days'));
  set('height', formatOakDiagnostic(diagnostics.heightM * 100, 1, 'cm'));
  set('leaf-area', formatOakDiagnostic(diagnostics.leafAreaM2 * 10_000, 1, 'cm²'));
  set('growth-fronts', String(diagnostics.activeGrowthFrontCount));
  set(
    'growth-carbon',
    formatOakDiagnostic(diagnostics.cumulativeGrowthCarbonKg * 1_000, 3, 'g'),
  );
  set(
    'water-potential',
    diagnostics.leafCount === 0
      ? 'not applicable'
      : formatOakDiagnostic(diagnostics.meanLeafWaterPotentialMpa, 3, 'MPa'),
  );
  set('carbon', formatOakDiagnostic(pools.carbonKg * 1_000, 3, 'g'));
  set('nitrogen', formatOakDiagnostic(pools.nitrogenKg * 1_000_000, 2, 'mg'));
  set('phosphorus', formatOakDiagnostic(pools.phosphorusKg * 1_000_000, 2, 'mg'));
  set('wind', formatOakDiagnostic(biological.wind.speedMPerS, 2, 'm/s'));
  set(
    'rain',
    weather.rainPhase === 'inactive'
      ? 'inactive'
      : `${weather.rainPhase} · ${weather.rainPulseLiters.toFixed(2)} L · ${String(weather.rainVoxelCount)} vx`,
  );
  set('topsoil-water', formatOakDiagnostic(meanSurfaceWater * 100, 1, '% v/v'));
  set('topsoil-nitrogen', formatOakDiagnostic(surfaceNitrogenKg * 1_000_000, 2, 'mg'));
  set('topsoil-phosphorus', formatOakDiagnostic(surfacePhosphorusKg * 1_000_000, 2, 'mg'));
  set('wind-voxels', String(weather.windVoxelCount));
  set('water-residual', residual.waterLiters.toExponential(2));
  set('carbon-residual', residual.carbonKg.toExponential(2));
  set('nitrogen-residual', residual.nitrogenKg.toExponential(2));
  set('phosphorus-residual', residual.phosphorusKg.toExponential(2));
  set('revision', String(metrics.presentedRevision ?? 'pending'));
  set('resources', `${String(metrics.rendererGeometries)} geo / ${String(metrics.rendererTextures)} tex`);
}
