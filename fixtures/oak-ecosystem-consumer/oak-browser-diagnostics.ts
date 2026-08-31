import type { ThreeRenderMetrics } from '../../src/three/index.js';
import { formatOakDiagnostic } from './oak-browser-dom.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';

/** Present biological and renderer evidence without making the HUD authoritative. */
export function updateOakBrowserDiagnosticsV1(
  nodes: ReadonlyMap<string, HTMLElement>,
  biological: OakSimulationSnapshotV1,
  metrics: ThreeRenderMetrics,
): void {
  const diagnostics = biological.diagnostics;
  const pools = biological.plantMobilePools;
  const residual = biological.ledger.residual;
  const set = (key: string, value: string): void => {
    const node = nodes.get(key);
    if (node !== undefined) node.textContent = value;
  };
  set('age', formatOakDiagnostic(biological.elapsedBiologicalSeconds / 86_400, 2, 'days'));
  set('height', formatOakDiagnostic(diagnostics.heightM * 100, 1, 'cm'));
  set('leaf-area', formatOakDiagnostic(diagnostics.leafAreaM2 * 10_000, 1, 'cm²'));
  set(
    'water-potential',
    diagnostics.leafCount === 0
      ? 'not applicable'
      : formatOakDiagnostic(diagnostics.meanLeafWaterPotentialMpa, 3, 'MPa'),
  );
  set('carbon', formatOakDiagnostic(pools.carbonKg * 1_000, 3, 'g'));
  set('nitrogen', formatOakDiagnostic(pools.nitrogenKg * 1_000_000, 2, 'mg'));
  set('phosphorus', formatOakDiagnostic(pools.phosphorusKg * 1_000_000, 2, 'mg'));
  set('water-residual', residual.waterLiters.toExponential(2));
  set('carbon-residual', residual.carbonKg.toExponential(2));
  set('nitrogen-residual', residual.nitrogenKg.toExponential(2));
  set('phosphorus-residual', residual.phosphorusKg.toExponential(2));
  set('revision', String(metrics.presentedRevision ?? 'pending'));
  set('resources', `${String(metrics.rendererGeometries)} geo / ${String(metrics.rendererTextures)} tex`);
}
