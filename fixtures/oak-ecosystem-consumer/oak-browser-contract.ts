import type { ThreeCaptureResult, ThreeRenderMetrics } from '../../src/three/index.js';
import type { OakRenderMetricsV1 } from './oak-render-adapter.js';
import type { OakWeatherPresentationEvidenceV1 } from './oak-weather-voxel-presentation.js';
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
export type OakBrowserNavigationModeV1 = 'preset' | 'free';

export interface OakBrowserNavigationEvidenceV1 {
  readonly mode: OakBrowserNavigationModeV1;
  /** The deterministic view restored by its button or by double-click. */
  readonly anchorPreset: OakBrowserCameraV1;
  readonly orbit: Readonly<{
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly viewHeightM: number;
  }>;
  readonly centerM: Readonly<{ x: number; y: number; z: number }>;
  /** Actual Three camera state, kept separate so controller evidence cannot hide a snapback. */
  readonly presentedCamera: Readonly<{
    readonly positionM: Readonly<{ x: number; y: number; z: number }>;
    readonly quaternion: Readonly<{ x: number; y: number; z: number; w: number }>;
    readonly fovDegrees: number;
    readonly projectionMatrix: readonly number[];
  }>;
}

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

export interface OakBrowserProjectedVoxelV1 {
  readonly x: number;
  readonly y: number;
  readonly color: Readonly<{ r: number; g: number; b: number }>;
  readonly role: 'wood' | 'root' | 'leaf' | 'seed-bud' | 'litter';
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
  /** Fallen-litter voxel instances whose exact cube vertices participate in the fit. */
  readonly fittedLitterVoxelCount: number;
  /** Exact accepted root-batch voxels that define a root-cutaway fit. */
  readonly fittedRootVoxelCount: number;
  /** Accepted face-connected seed/bud and basal-wood voxels retained only for orientation. */
  readonly fittedBasalContextVoxelCount: number;
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
  readonly navigation: OakBrowserNavigationEvidenceV1;
  readonly cameraFit: OakBrowserCameraFitV1;
  /** Bounded exact centres from accepted plant batches, never soil or contact refill. */
  readonly projectedPlantVoxels: readonly OakBrowserProjectedVoxelV1[];
  readonly viewport: OakBrowserViewportV1;
  readonly hostLighting: OakBrowserHostLightingV1;
  readonly simulation: OakSimulationSnapshotV1;
  /** Honest voxel cues; numerical pools and organ poses remain in `simulation`. */
  readonly weather: OakWeatherPresentationEvidenceV1;
  readonly render: OakRenderMetricsV1;
  readonly runtime: ThreeRenderMetrics;
}

export interface OakBrowserHarnessV1 {
  /** Issues the visible command; one crossed intent is retained and overflow is rejected. */
  command(command: OakBrowserCommandV1): OakBrowserEvidenceV1;
  /** Chooses and refits one of the case study's deterministic camera presets. */
  setCamera(camera: OakBrowserCameraV1): OakBrowserEvidenceV1;
  /** Deterministic test transport: whole 60 Hz host ticks, never elapsed milliseconds. */
  advanceHostTicks(count: number): OakBrowserEvidenceV1;
  /** Advances biology for a bounded experiment, restoring the prior pause state afterward. */
  advanceBiologicalTicks(count: number): OakBrowserEvidenceV1;
  /** Temporarily hides only plant instance batches for a rendered soil-only counter-run. */
  setPlantVisibilityForEvidence(visible: boolean): OakBrowserEvidenceV1;
  /** Temporarily hides only the representative weather batch for an organ-motion counter-run. */
  setWeatherVisibilityForEvidence(visible: boolean): OakBrowserEvidenceV1;
  evidence(): OakBrowserEvidenceV1;
  capture(): ThreeCaptureResult;
  dispose(): void;
}

declare global {
  interface Window {
    oakEcosystem?: OakBrowserHarnessV1;
  }
}
