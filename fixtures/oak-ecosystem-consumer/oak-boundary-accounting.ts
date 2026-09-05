import type { MutableOakStateV1 } from './oak-state.js';
import type { OakResourcePoolsV1 } from './oak-types.js';

function compensatedPoolAddition(
  total: OakResourcePoolsV1,
  correction: OakResourcePoolsV1,
  delta: OakResourcePoolsV1,
): readonly [OakResourcePoolsV1, OakResourcePoolsV1] {
  const add = (key: keyof OakResourcePoolsV1) => {
    const adjusted = delta[key] - correction[key];
    const next = total[key] + adjusted;
    return { next, correction: (next - total[key]) - adjusted };
  };
  const carbon = add('carbonKg');
  const nitrogen = add('nitrogenKg');
  const phosphorus = add('phosphorusKg');
  const water = add('waterLiters');
  return [{
    carbonKg: carbon.next,
    nitrogenKg: nitrogen.next,
    phosphorusKg: phosphorus.next,
    waterLiters: water.next,
  }, {
    carbonKg: carbon.correction,
    nitrogenKg: nitrogen.correction,
    phosphorusKg: phosphorus.correction,
    waterLiters: water.correction,
  }];
}

export function oakConservativeScalarTransferV1(
  source: number,
  destination: number,
  requested: number,
): Readonly<{ source: number; destination: number; transferred: number }> {
  const combined = source + destination;
  const nextSource = source - Math.min(source, Math.max(0, requested));
  const nextDestination = combined - nextSource;
  return {
    source: nextSource,
    destination: nextDestination,
    transferred: nextDestination - destination,
  };
}

export function addOakBoundarySourceV1(
  state: MutableOakStateV1,
  carbonKg: number,
  nitrogenKg: number,
  phosphorusKg: number,
  waterLiters: number,
): void {
  [state.sources, state.sourceCompensation] = compensatedPoolAddition(
    state.sources,
    state.sourceCompensation,
    { carbonKg, nitrogenKg, phosphorusKg, waterLiters },
  );
}

export function addOakBoundarySinkV1(
  state: MutableOakStateV1,
  carbonKg: number,
  nitrogenKg: number,
  phosphorusKg: number,
  waterLiters: number,
): void {
  [state.sinks, state.sinkCompensation] = compensatedPoolAddition(
    state.sinks,
    state.sinkCompensation,
    { carbonKg, nitrogenKg, phosphorusKg, waterLiters },
  );
}
