import type { ThreeCaptureResult, ThreeRenderMetrics } from '../../src/three/index.js';
import type { OakRenderMetricsV1 } from './oak-render-adapter.js';
import type { OakSimulationSnapshotV1 } from './oak-types.js';

export type OakBrowserCommandV1 =
  | 'toggle-pause'
  | 'growth-mode'
  | 'wind-mode'
  | 'root-cutaway'
  | 'rain'
  | 'low-water'
  | 'low-n'
  | 'low-p'
  | 'reset';

export type OakBrowserCameraV1 = 'hero' | 'side' | 'overhead';
export type OakBrowserInspectionModeV1 = 'growth' | 'wind';

export interface OakBrowserViewportV1 {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface OakBrowserHostLightingV1 {
  readonly policy: 'oak-fixture-private';
  readonly shadowMapEnabled: boolean;
  readonly sunCastsShadow: boolean;
  readonly shadowMapSize: number;
  readonly shadowCameraHalfWidthM: number;
}

export interface OakBrowserProjectedShaftV1 {
  readonly base: Readonly<{ x: number; y: number }>;
  readonly tip: Readonly<{ x: number; y: number }>;
}

export interface OakBrowserCameraFitV1 {
  readonly focus: 'tree' | 'root-cutaway';
  readonly hudReserved: boolean;
  readonly distanceM: number;
  readonly hudRightNdc: number;
  readonly subjectBoundsNdc: Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>;
  readonly subjectClearOfHud: boolean;
  /** Unique rendered organs fitted; non-cutaway views deliberately exclude root batches. */
  readonly fittedOrganCount: number;
  /** Vertices from the accepted render frame that define subjectBoundsNdc. */
  readonly fittedVertexCount: number;
  readonly rootShaftsNdc: Readonly<{
    readonly coarse: OakBrowserProjectedShaftV1 | null;
    readonly aggregateFine: OakBrowserProjectedShaftV1 | null;
  }>;
}

/**
 * Read-only evidence published by the browser host.
 *
 * The simulation snapshot remains the one biological authority. Browser state
 * describes only transport and presentation choices and never duplicates an
 * organ, resource pool, or environmental forcing.
 */
export interface OakBrowserEvidenceV1 {
  readonly ready: boolean;
  readonly disposed: boolean;
  readonly inspectionMode: OakBrowserInspectionModeV1;
  readonly rootCutaway: boolean;
  readonly camera: OakBrowserCameraV1;
  readonly cameraFit: OakBrowserCameraFitV1;
  readonly viewport: OakBrowserViewportV1;
  readonly hostLighting: OakBrowserHostLightingV1;
  readonly simulation: OakSimulationSnapshotV1;
  readonly render: OakRenderMetricsV1;
  readonly runtime: ThreeRenderMetrics;
}

export interface OakBrowserHarnessV1 {
  /** Issues the same domain command as its corresponding visible control. */
  command(command: OakBrowserCommandV1): OakBrowserEvidenceV1;
  /** Chooses and refits one of the case study's deterministic camera presets. */
  setCamera(camera: OakBrowserCameraV1): OakBrowserEvidenceV1;
  /** Deterministic test transport: whole 60 Hz host ticks, never elapsed milliseconds. */
  advanceHostTicks(count: number): OakBrowserEvidenceV1;
  /** Advances biology for a bounded experiment, restoring the prior pause state afterward. */
  advanceBiologicalTicks(count: number): OakBrowserEvidenceV1;
  evidence(): OakBrowserEvidenceV1;
  capture(): ThreeCaptureResult;
  dispose(): void;
}

declare global {
  interface Window {
    oakEcosystem?: OakBrowserHarnessV1;
  }
}
