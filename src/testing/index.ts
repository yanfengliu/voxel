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
