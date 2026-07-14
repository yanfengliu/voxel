export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

export {
  createFrameBudgetReport,
  type FrameBudgetReportByKind,
  type FrameBudgetReport,
  type FrameBudgetTarget,
  type FrameKindBudgetReport,
  type FramePacingSample,
  type FrameTimingPercentiles,
} from './frame-budget.js';

export {
  createRendererLifecycleReferenceSnapshot,
  type RendererLifecycleReferenceOptions,
} from './lifecycle-reference-scene.js';

export {
  readRenderWorldOwnershipMetricsForTesting,
  resetRenderWorldOwnershipMetricsForTesting,
  type RenderWorldOwnershipMetricsForTesting,
} from './ownership-metrics.js';

export {
  MESHER_CORPUS_DESCRIPTOR_V1,
  createMesherCorpusV1,
  type MesherCorpusFixtureV1,
  type MesherCorpusNameV1,
} from './mesher-corpus.js';

export {
  DEFAULT_MAX_ORIENTED_FACE_RASTER_CELLS_V1,
  compareOrientedUnitFaceCoverageV1,
  createExpectedOrientedUnitFaceCoverageV1,
  extractOrientedUnitFaceCoverageV1,
  type OrientedAxisNormalV1,
  type OrientedUnitFaceAttributeMismatchV1,
  type OrientedUnitFaceComparisonV1,
  type OrientedUnitFaceCoverageV1,
  type OrientedUnitFaceV1,
} from './oriented-unit-face-coverage.js';
