import type { Camera, Group, Scene } from 'three';
import {
  RenderWorld,
  type ApplyResultV1,
  type DeltaApplyResultV1,
  type PresentationAbortSignalV1,
  type PresentationReadinessV1,
  type RenderDeltaV1,
  type RenderRevisionRefV1,
  type RenderSnapshotV1,
} from '../core/index.js';
import {
  commitPreparedDeltaIntoRenderWorld,
  commitPreparedSnapshotIntoRenderWorld,
  markPreparedCanonicalStatePresentedInternal,
  pendingCanonicalStateForPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
  prepareDeltaForRenderWorldInternal,
  prepareSnapshotForRenderWorldInternal,
  setRenderWorldPresentationAvailabilityInternal,
} from '../core/render-world.js';
import type { ChunkPresenter } from './chunkPresenter.js';
import {
  getThreeRuntimeCapabilitiesV1,
  type ThreeRuntimeCapabilitiesV1,
} from './capabilities.js';
import type { DaylightRig } from './daylightRig.js';
import type { GeometryPresenter } from './geometryPresenter.js';
import type { InstanceBatchPresenter } from './instanceBatchPresenter.js';
import type { MaterialPresenter } from './materialPresenter.js';
import type { IsometricViewCenter } from './orthographicView.js';
import {
  type ThreeCameraStrategyInternal,
} from './cameraStrategy.js';
import {
  createPresentedManifestInternal,
  ThreeRuntimeProtocolError,
  type ThreeFrameContext,
  type ThreePreparedFrameTicket,
  type ThreePrepareFrameResult,
  type ThreePresentedManifestV1,
} from './hostFrameProtocol.js';
import {
  HostFrameTicketLedgerInternal,
  type HostFrameTicketRecordInternal,
} from './runtimeHostFrameTicket.js';
import {
  freezeFrameContextInternal,
  requireDimensionInternal,
} from './runtimeInputValidation.js';
import { validateThreePresentationInternal } from './presentationValidation.js';
import type { RendererLike } from './rendererTypes.js';
import {
  EMPTY_RENDER_INFO_INTERNAL,
  snapshotRenderInfoInternal,
  type RenderInfoSnapshotInternal,
} from './runtimeRenderInfo.js';
import { collectRuntimeMetricsInternal } from './runtimeMetrics.js';
import type { PresentationStagingHoldInternal } from './presentationStagingMetrics.js';
import { RuntimePresentationRetentionInternal } from './runtimePresentationRetention.js';
import type { ContextEventCanvasInternal } from './runtimeRendererSetup.js';
import { runRuntimeDisposalInternal } from './runtimeDisposal.js';
import { captureRuntimeCanvasInternal } from './runtimeCapture.js';
import { initializeRuntimeInternal } from './runtimeInitialization.js';
import { resizeRuntimeInternal } from './runtimeResize.js';
import {
  initializeRuntimeSnapshotMetricsInternal,
  recordSnapshotCopyAttemptInternal,
} from './runtimeSnapshotMetrics.js';
import {
  canonicalStateToThreePresentationInternal,
  preparedDeltaToThreePresentationInternal,
} from './snapshotAdapter.js';
import type {
  ThreeCaptureResult,
  ThreePresentationSnapshot,
  ThreeRenderMetrics,
  ThreeRenderRuntimeOptions,
  ThreeRuntimeFailurePhaseV1,
  ThreeRuntimeFailureV1,
  ThreeRuntimeLifecycleV1,
  ThreeRuntimeStatusV1,
} from './runtimeTypes.js';
export {
  acceptedSnapshotForTesting,
  snapshotIngestMetricsForTesting,
  type SnapshotIngestMetricsInternal,
} from './runtimeSnapshotMetrics.js';
type CanonicalPresentationStateInternal = NonNullable<
  ReturnType<typeof pendingCanonicalStateForPresentationInternal>
>;

interface PreparedHostFrameInternal {
  readonly context: Readonly<ThreeFrameContext>;
  readonly pending: CanonicalPresentationStateInternal | null;
  readonly target: CanonicalPresentationStateInternal | null;
  readonly presentation: ThreePresentationSnapshot | null;
  readonly previousPresentation: ThreePresentationSnapshot | null;
  readonly previousContext: ThreeFrameContext | null;
  readonly restoration: boolean;
}
export class ThreeRenderRuntime {
  private readonly scene!: Scene;
  private readonly camera!: Camera;
  private readonly cameraStrategy!: ThreeCameraStrategyInternal;
  private readonly root!: Group;
  private readonly renderer!: RendererLike;
  private readonly rendererOwnership!: 'owned' | 'borrowed';
  private readonly viewportOwnership!: 'runtime' | 'host';
  private readonly hostKind!: 'runtime-rendered' | 'embedded';
  private readonly daylightRig!: DaylightRig | null;
  private readonly materialPresenter!: MaterialPresenter;
  private readonly geometryPresenter!: GeometryPresenter;
  private readonly chunkPresenter!: ChunkPresenter;
  private readonly instancePresenter!: InstanceBatchPresenter;
  private readonly world = new RenderWorld();
  private readonly contextCanvas!: ContextEventCanvasInternal | null;
  private readonly presentations = new RuntimePresentationRetentionInternal(
    () => presentedCanonicalStateForPresentationInternal(this.world),
  );
  private lifecycleState: ThreeRuntimeLifecycleV1 = 'initializing';
  private failure: ThreeRuntimeFailureV1 | null = null;
  private deviceGeneration = 1;
  private frames = 0;
  private renderInfo: RenderInfoSnapshotInternal = EMPTY_RENDER_INFO_INTERNAL;
  private width: number;
  private height: number;
  private pixelRatio: number;
  private center: IsometricViewCenter;
  private zoom: number;
  private contextLosses = 0;
  private contextRestorations = 0;
  private disposalActions: readonly (() => void)[] | null = null;
  private disposalInProgress = false;
  private readonly hostFrames = new HostFrameTicketLedgerInternal<PreparedHostFrameInternal>();
  private lastPresentedFrameContext: ThreeFrameContext | null = null;
  private cameraGeneration = 0;
  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    if (
      this.lifecycleState === 'disposed'
      || this.lifecycleState === 'failed'
      || this.lifecycleState === 'lost'
    ) return;
    const invalidated = this.hostFrames.invalidateForDeviceTransition();
    if (invalidated) this.presentations.releaseHostFrameInternal(invalidated);
    this.lifecycleState = 'lost';
    setRenderWorldPresentationAvailabilityInternal(this.world, 'context-lost');
    this.contextLosses++;
  };
  private readonly handleContextRestored = (): void => {
    if (this.lifecycleState !== 'lost') return;
    this.lifecycleState = 'restoring';
    this.deviceGeneration++;
    setRenderWorldPresentationAvailabilityInternal(this.world, 'restoring');
    this.contextRestorations++;
  };
  constructor(options: ThreeRenderRuntimeOptions) {
    let initialized: ReturnType<typeof initializeRuntimeInternal>;
    try {
      initialized = initializeRuntimeInternal(options, {
        handleContextLost: this.handleContextLost,
        handleContextRestored: this.handleContextRestored,
        isInitializing: () => this.isInitializing(),
      });
    } catch (error) {
      try { this.world.dispose(); } catch { /* Preserve the initialization failure. */ }
      throw error;
    }
    this.renderer = initialized.renderer;
    this.rendererOwnership = initialized.rendererOwnership;
    this.viewportOwnership = initialized.viewportOwnership;
    this.hostKind = initialized.hostKind;
    this.scene = initialized.scene;
    this.camera = initialized.camera;
    this.cameraStrategy = initialized.cameraStrategy;
    this.root = initialized.root;
    this.daylightRig = initialized.daylightRig;
    this.materialPresenter = initialized.materialPresenter;
    this.geometryPresenter = initialized.geometryPresenter;
    this.chunkPresenter = initialized.chunkPresenter;
    this.instancePresenter = initialized.instancePresenter;
    this.contextCanvas = initialized.contextCanvas;
    this.width = initialized.width;
    this.height = initialized.height;
    this.pixelRatio = initialized.pixelRatio;
    this.center = initialized.center;
    this.zoom = initialized.zoom;
    try {
      if (this.lifecycleState === 'initializing') {
        this.lifecycleState = 'running';
        setRenderWorldPresentationAvailabilityInternal(this.world, 'available');
      }
      initializeRuntimeSnapshotMetricsInternal(this, this.world);
    } catch (error) {
      initialized.rollbackInitializationInternal();
      try {
        this.world.dispose();
      } catch {
        // Preserve the original initialization error.
      }
      throw error;
    }
  }

  acceptSnapshot(snapshot: RenderSnapshotV1): ApplyResultV1 {
    this.assertAccepting();
    const prepared = prepareSnapshotForRenderWorldInternal(this.world, snapshot);
    const attemptMetrics = prepared.status === 'prepared'
      ? prepared.prepared.metrics
      : prepared.metrics;
    const ingestMetrics = recordSnapshotCopyAttemptInternal(this, attemptMetrics);
    // Validation walks untrusted object properties. A getter may reenter the
    // runtime and end it, so fence terminal lifecycle before projection/commit.
    this.assertAccepting();
    if (prepared.status === 'rejected') {
      return { status: 'rejected', ...prepared.issue };
    }
    let presentation: ThreePresentationSnapshot;
    let candidateHold: PresentationStagingHoldInternal | null = null;
    try {
      presentation = canonicalStateToThreePresentationInternal(prepared.prepared.candidate);
      candidateHold = this.presentations.retainCandidateInternal(presentation);
      validateThreePresentationInternal(presentation);
    } catch (error) {
      candidateHold?.releaseInternal();
      return {
        status: 'rejected',
        code: 'three.unsupported-snapshot',
        path: '$',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      this.presentations.rememberInternal(
        prepared.prepared.candidate,
        presentation,
      );
      const applied = commitPreparedSnapshotIntoRenderWorld(this.world, prepared.prepared);
      if (applied.status === 'accepted') {
        ingestMetrics.accepted += 1;
        const candidate = prepared.prepared.candidate;
        if (presentedCanonicalStateForPresentationInternal(this.world) === candidate) {
          // A waiter cleanup callback may have synchronously framed this exact
          // candidate while the core commit was still settling the old epoch.
          this.presentations.markCommittedInternal(presentation);
          this.presentations.setPresentedInternal(presentation);
          this.presentations.setPendingInternal(null);
        } else if (pendingCanonicalStateForPresentationInternal(this.world) === candidate) {
          this.presentations.setPendingInternal(presentation);
        }
      }
      return applied;
    } finally {
      candidateHold.releaseInternal();
    }
  }

  acceptDelta(delta: RenderDeltaV1): DeltaApplyResultV1 {
    this.assertAccepting();
    const result = prepareDeltaForRenderWorldInternal(this.world, delta);
    // Delta parsing has the same structural-getter reentrancy boundary.
    this.assertAccepting();
    if (result.status === 'resync-required') return result;
    if (result.status === 'rejected') return { status: 'rejected', ...result.issue };
    let presentation: ThreePresentationSnapshot;
    let candidateHold: PresentationStagingHoldInternal | null = null;
    try {
      presentation = preparedDeltaToThreePresentationInternal(result.prepared);
      candidateHold = this.presentations.retainCandidateInternal(presentation);
      validateThreePresentationInternal(presentation);
    } catch (error) {
      candidateHold?.releaseInternal();
      return {
        status: 'rejected',
        code: 'three.unsupported-delta',
        path: '$',
        message: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      this.presentations.rememberInternal(result.prepared.candidate, presentation);
      const applied = commitPreparedDeltaIntoRenderWorld(this.world, result.prepared, {
        deferAutomaticPresentation: this.hostKind === 'embedded',
      });
      if (
        applied.status === 'accepted'
        && this.world.epoch === applied.epoch
        && this.world.acceptedRevision === applied.revision
      ) {
        if (pendingCanonicalStateForPresentationInternal(this.world)) {
          this.presentations.setPendingInternal(presentation);
        } else {
          // An empty atomic delta may advance the presented watermark without a
          // draw. Its scene is byte-for-byte the currently displayed scene.
          this.presentations.markCommittedInternal(presentation);
          this.presentations.setPresentedInternal(presentation);
          this.presentations.setPendingInternal(null);
        }
      }
      return applied;
    } finally {
      candidateHold.releaseInternal();
    }
  }

  presentationReadiness(target: RenderRevisionRefV1): PresentationReadinessV1 {
    return this.world.presentationReadiness(target);
  }
  awaitPresented(
    target: RenderRevisionRefV1,
    options?: { readonly signal?: PresentationAbortSignalV1 },
  ): Promise<PresentationReadinessV1> {
    return this.world.awaitPresented(target, options);
  }
  runtimeStatus(): ThreeRuntimeStatusV1 {
    if (this.lifecycleState === 'failed') {
      return Object.freeze({
        state: 'failed',
        deviceGeneration: this.deviceGeneration,
        failure: this.failure!,
      });
    }
    return Object.freeze({
      state: this.lifecycleState,
      deviceGeneration: this.deviceGeneration,
      failure: null,
    });
  }
  getCapabilities(): ThreeRuntimeCapabilitiesV1 {
    return getThreeRuntimeCapabilitiesV1();
  }
  frame(context: ThreeFrameContext): ThreePresentedManifestV1 | undefined {
    if (this.hostKind === 'embedded') {
      throw new ThreeRuntimeProtocolError(
        'three.host.draw-owned',
        'Embedded hosts own the final renderer draw and must use frame tickets.',
      );
    }
    this.assertAccepting();
    const frozenContext = freezeFrameContextInternal(context);
    if (this.lifecycleState === 'lost') return;
    if (this.lifecycleState === 'restoring') {
      const restoreGeneration = this.deviceGeneration;
      try {
        if (this.viewportOwnership === 'runtime') {
          this.renderer.setPixelRatio(this.pixelRatio);
          if (!this.isRestoreAttempt(restoreGeneration)) return;
          this.renderer.setSize(this.width, this.height, false);
          if (!this.isRestoreAttempt(restoreGeneration)) return;
        }
        this.updateCamera();
        if (!this.isRestoreAttempt(restoreGeneration)) return;
        if (!this.reconcilePresentation(
          this.presentations.presentedInternal,
          () => this.isRestoreAttempt(restoreGeneration),
        )) return;
        this.renderCurrent();
        if (!this.isRestoreAttempt(restoreGeneration)) return;
        this.lifecycleState = 'running';
        setRenderWorldPresentationAvailabilityInternal(this.world, 'available');
        if (!this.isRunningAttempt(restoreGeneration)) return;
        const manifest = this.createManifestForCurrentState(frozenContext);
        this.cameraGeneration = manifest.cameraGeneration;
        this.lastPresentedFrameContext = frozenContext;
        this.frames++;
        return manifest;
      } catch (error) {
        if (!this.isRestoreAttempt(restoreGeneration)) return;
        this.transitionToFailed('restore', error);
        throw error;
      }
      return undefined;
    }
    const prepared = this.prepareFrameInternal(frozenContext);
    if (prepared.status === 'unavailable') return undefined;
    const renderGeneration = this.deviceGeneration;
    try {
      this.renderCurrent();
    } catch (error) {
      this.abortStandaloneFrameAfterDrawFailure(prepared.ticket, error);
      if (this.lifecycleState !== 'failed' && !this.isRunningAttempt(renderGeneration)) {
        return undefined;
      }
      throw error;
    }
    if (this.lifecycleState !== 'running') return undefined;
    return this.commitFrameTicketInternal(prepared.ticket);
  }

  prepareFrame(context: ThreeFrameContext): ThreePrepareFrameResult {
    this.assertEmbeddedHostProtocol();
    return this.prepareFrameInternal(freezeFrameContextInternal(context));
  }
  commitFrame(ticket: ThreePreparedFrameTicket): ThreePresentedManifestV1 {
    this.assertEmbeddedHostProtocol();
    const manifest = this.commitFrameTicketInternal(ticket);
    if (!manifest) {
      throw new ThreeRuntimeProtocolError(
        'three.frame-ticket.stale-device',
        'The prepared host frame was interrupted by a device transition.',
      );
    }
    return manifest;
  }
  abortFrame(ticket: ThreePreparedFrameTicket): void {
    this.assertEmbeddedHostProtocol();
    const record = this.hostFrames.consume(
      ticket,
      this.lifecycleState,
      this.deviceGeneration,
    );
    try {
      this.restoreAbortedHostFrame(record);
    } finally {
      this.presentations.releaseHostFrameInternal(record);
    }
  }
  setView(center: IsometricViewCenter, zoom = this.zoom): void {
    this.assertAccepting();
    this.cameraStrategy.setLegacyIsometricView(center, zoom);
    this.center = { ...center };
    this.zoom = zoom;
    this.daylightRig?.setCenter(this.center);
  }
  resize(width: number, height: number, pixelRatio = this.pixelRatio): void {
    this.assertAccepting();
    requireDimensionInternal('width', width);
    requireDimensionInternal('height', height);
    requireDimensionInternal('pixelRatio', pixelRatio);
    const previous = {
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
    };
    const generation = this.deviceGeneration;
    resizeRuntimeInternal({
      width,
      height,
      pixelRatio,
      previous,
      camera: this.camera,
      cameraStrategy: this.cameraStrategy,
      renderer: this.renderer,
      viewportOwnership: this.viewportOwnership,
      isCurrent: () => this.isRunningAttempt(generation),
      commit: (nextWidth, nextHeight, nextPixelRatio) => {
        this.commitViewportState(nextWidth, nextHeight, nextPixelRatio);
      },
      failRollback: (error) => this.transitionToFailed('resize', error),
    });
  }
  capture(mimeType = 'image/png', quality?: number): ThreeCaptureResult {
    if (this.hostKind === 'embedded') {
      throw new ThreeRuntimeProtocolError(
        'three.host.capture-owned',
        'Embedded hosts own capture and Voxel will not issue an extra shared-renderer draw.',
      );
    }
    this.assertAccepting();
    if (this.lifecycleState !== 'running') {
      throw new Error(`ThreeRenderRuntime capture is unavailable while ${this.lifecycleState}.`);
    }
    const generation = this.deviceGeneration;
    return captureRuntimeCanvasInternal({
      renderer: this.renderer,
      render: () => this.renderCurrent(),
      isCurrent: () => this.isRunningAttempt(generation),
      failRender: (error) => this.transitionToFailed('capture', error),
      width: this.width,
      height: this.height,
      epoch: this.world.presentedEpoch,
      presentedRevision: this.world.presentedRevision,
      mimeType,
      quality,
      metrics: () => this.metrics(),
    });
  }

  metrics(): ThreeRenderMetrics {
    const presentationStaging = this.presentations.metricsInternal();
    return collectRuntimeMetricsInternal({
      state: this.legacyState(),
      world: this.world,
      frames: this.frames,
      materialPresenter: this.materialPresenter,
      geometryPresenter: this.geometryPresenter,
      chunkPresenter: this.chunkPresenter,
      instancePresenter: this.instancePresenter,
      renderInfo: this.renderInfo,
      contextLosses: this.contextLosses,
      contextRestorations: this.contextRestorations,
      presentationStagingBytes: presentationStaging.currentBytes,
      peakPresentationStagingBytes: presentationStaging.peakBytes,
    });
  }
  dispose(): void {
    if (this.lifecycleState !== 'disposed') {
      const invalidated = this.hostFrames.dispose();
      if (invalidated) this.presentations.releaseHostFrameInternal(invalidated);
      this.lifecycleState = 'disposed';
      this.disposalActions = [
        () => this.contextCanvas?.removeEventListener('webglcontextlost', this.handleContextLost),
        () => this.contextCanvas?.removeEventListener('webglcontextrestored', this.handleContextRestored),
        () => this.world.dispose(),
        () => this.instancePresenter.dispose(),
        () => this.chunkPresenter.dispose(),
        () => this.geometryPresenter.dispose(),
        () => this.materialPresenter.dispose(),
        () => this.daylightRig?.dispose(this.scene),
        () => this.scene.remove(this.root),
        () => { if (this.rendererOwnership === 'owned') this.renderer.dispose(); },
      ];
      this.presentations.disposeInternal();
      this.lastPresentedFrameContext = null;
      this.renderInfo = EMPTY_RENDER_INFO_INTERNAL;
    }
    if (!this.disposalActions || this.disposalInProgress) return;
    this.disposalInProgress = true;
    const { remaining, firstError } = runRuntimeDisposalInternal(this.disposalActions);
    this.disposalActions = remaining.length > 0 ? remaining : null;
    this.disposalInProgress = false;
    if (firstError instanceof Error) throw firstError;
    if (firstError !== undefined) throw new Error('Runtime disposal failed.', { cause: firstError });
  }

  private prepareFrameInternal(
    context: Readonly<ThreeFrameContext>,
  ): ThreePrepareFrameResult {
    this.assertAccepting();
    if (this.lifecycleState === 'lost' || this.lifecycleState === 'restoring') {
      return this.unavailableFrameResult();
    }
    this.hostFrames.beginPreparation();
    const generation = this.deviceGeneration;
    const pending = pendingCanonicalStateForPresentationInternal(this.world);
    const target = pending ?? presentedCanonicalStateForPresentationInternal(this.world);
    const presentation = target
      ? this.presentations.resolveInternal(target, pending ? 'pending' : 'presented')
      : null;
    const previousPresentation = this.presentations.presentedInternal;
    const previousContext = this.lastPresentedFrameContext;
    let phase: ThreeRuntimeFailurePhaseV1 = 'prepare';
    let mayNeedRollback = false;
    try {
      if (target && (
        presentation?.epoch !== target.epoch
        || presentation.revision !== target.revision
      )) {
        throw new Error('Frame presentation does not match canonical render state.');
      }
      if (pending) {
        if (!presentation) {
          throw new Error('Pending canonical state has no Three presentation.');
        }
        validateThreePresentationInternal(presentation);
        mayNeedRollback = true;
        if (!this.reconcilePresentation(
          presentation,
          () => this.isRunningAttempt(generation),
        )) return this.unavailableFrameResult();
      }
      if (!this.isRunningAttempt(generation)) return this.unavailableFrameResult();
      phase = 'animate';
      mayNeedRollback = true;
      this.instancePresenter.animate(context.nowMs);
      if (!this.isRunningAttempt(generation)) return this.unavailableFrameResult();
      const record = this.hostFrames.issue({
        context,
        pending,
        target,
        presentation,
        previousPresentation,
        previousContext,
        restoration: false,
      }, generation);
      this.presentations.retainHostFrameInternal(record, presentation);
      return Object.freeze({
        status: 'prepared',
        ticket: record.ticket,
        target: target ? Object.freeze({
          worldId: target.worldId,
          epoch: target.epoch,
          revision: target.revision,
        }) : null,
        restoration: false,
      });
    } catch (error) {
      if (mayNeedRollback && this.isRunningAttempt(generation)) {
        try {
          this.restoreHostScene(previousPresentation, previousContext, generation);
        } catch (rollbackError) {
          this.transitionToFailed(phase, new Error('Host frame rollback failed.', {
            cause: rollbackError,
          }));
          throw error;
        }
      }
      if (this.isRunningAttempt(generation)) this.transitionToFailed(phase, error);
      if (this.isFrameUnavailableAfterCallbacks()) {
        return this.unavailableFrameResult();
      }
      throw error;
    } finally {
      this.hostFrames.finishPreparation();
    }
  }
  private commitFrameTicketInternal(
    ticket: ThreePreparedFrameTicket,
  ): ThreePresentedManifestV1 | undefined {
    const record = this.hostFrames.consume(ticket, this.lifecycleState, this.deviceGeneration);
    try {
      return this.commitConsumedFrameTicketInternal(record);
    } finally {
      this.presentations.releaseHostFrameInternal(record);
    }
  }
  private commitConsumedFrameTicketInternal(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  ): ThreePresentedManifestV1 | undefined {
    const prepared = record.payload;
    const previousFrames = this.frames;
    const previousCameraGeneration = this.cameraGeneration;
    this.frames = previousFrames + 1;
    this.cameraGeneration = previousCameraGeneration + 1;
    let manifest: ThreePresentedManifestV1;
    let committedRenderInfo: RenderInfoSnapshotInternal;
    try {
      manifest = createPresentedManifestInternal({
        target: prepared.target,
        context: prepared.context,
        width: this.width,
        height: this.height,
        pixelRatio: this.pixelRatio,
        deviceGeneration: record.deviceGeneration,
        cameraGeneration: this.cameraGeneration,
        camera: this.camera,
      });
      committedRenderInfo = snapshotRenderInfoInternal(this.renderer);
    } catch (error) {
      const ownsReservedFrame = this.frames === previousFrames + 1
        && this.cameraGeneration === previousCameraGeneration + 1;
      this.rollbackReservedFrame(previousFrames, previousCameraGeneration);
      if (ownsReservedFrame) this.restoreLateHostFrame(record);
      if (this.isRunningAttempt(record.deviceGeneration)) {
        this.transitionToFailed('commit', error);
      }
      throw error;
    }
    if (this.lifecycleState === 'disposed' || this.lifecycleState === 'failed') {
      this.rollbackReservedFrame(previousFrames, previousCameraGeneration);
      throw new ThreeRuntimeProtocolError(
        'three.frame-ticket.late',
        'The runtime ended while the prepared frame manifest was being captured.',
      );
    }
    if (!this.isRunningAttempt(record.deviceGeneration)) {
      this.rollbackReservedFrame(previousFrames, previousCameraGeneration);
      return undefined;
    }
    if (prepared.pending) {
      const marked = markPreparedCanonicalStatePresentedInternal(this.world, prepared.pending);
      if (!marked
        && this.frames === previousFrames + 1
        && this.cameraGeneration === previousCameraGeneration + 1) {
        this.rollbackReservedFrame(previousFrames, previousCameraGeneration);
        this.restoreLateHostFrame(record);
        throw new ThreeRuntimeProtocolError(
          'three.frame-ticket.late',
          'The prepared canonical revision is no longer eligible for presentation.',
        );
      }
      if (marked && prepared.presentation) {
        this.presentations.markCommittedInternal(prepared.presentation);
      }
    }
    const exactPresented = presentedCanonicalStateForPresentationInternal(this.world)
      === prepared.target;
    if (
      exactPresented
      && !this.hasRuntimeEndedAfterCallbacks()
    ) {
      this.presentations.setPresentedInternal(prepared.presentation);
      if (this.presentations.pendingInternal === prepared.presentation) {
        this.presentations.setPendingInternal(null);
      }
      this.lastPresentedFrameContext = prepared.context;
      this.renderInfo = committedRenderInfo;
    }
    if (this.hasRuntimeEndedAfterCallbacks()) {
      this.rollbackReservedFrame(previousFrames, previousCameraGeneration);
      throw new ThreeRuntimeProtocolError(
        'three.frame-ticket.late',
        'The runtime ended while the prepared frame was being committed.',
      );
    }
    if (
      this.deviceGeneration !== record.deviceGeneration
      || this.lifecycleState === 'restoring'
      || this.lifecycleState === 'lost'
    ) return undefined;
    return manifest;
  }
  private restoreAbortedHostFrame(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  ): void {
    try {
      this.restoreHostScene(
        record.payload.previousPresentation,
        record.payload.previousContext,
        record.deviceGeneration,
      );
    } catch (error) {
      if (this.isRunningAttempt(record.deviceGeneration)) {
        this.transitionToFailed('commit', error);
      }
      throw error;
    }
  }
  private restoreLateHostFrame(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  ): void {
    if (!this.isRunningAttempt(record.deviceGeneration)) return;
    try {
      this.restoreHostScene(
        record.payload.previousPresentation,
        record.payload.previousContext,
        record.deviceGeneration,
      );
    } catch (error) {
      this.transitionToFailed('commit', error);
      throw error;
    }
  }
  private restoreHostScene(
    presentation: ThreePresentationSnapshot | null,
    context: ThreeFrameContext | null,
    generation: number,
  ): void {
    this.instancePresenter.resetInternal();
    this.chunkPresenter.resetInternal();
    this.geometryPresenter.resetInternal();
    this.materialPresenter.resetInternal();
    if (!this.reconcilePresentation(
      presentation,
      () => this.isRunningAttempt(generation),
    )) return;
    this.instancePresenter.animate(context?.nowMs ?? 0);
  }
  private abortStandaloneFrameAfterDrawFailure(
    ticket: ThreePreparedFrameTicket,
    renderError: unknown,
  ): void {
    const generation = this.deviceGeneration;
    if (this.lifecycleState === 'running') {
      try {
        const record = this.hostFrames.consume(ticket, this.lifecycleState, generation);
        try {
          this.restoreHostScene(
            record.payload.previousPresentation,
            record.payload.previousContext,
            generation,
          );
        } finally {
          this.presentations.releaseHostFrameInternal(record);
        }
      } catch (rollbackError) {
        if (this.isRunningAttempt(generation)) {
          this.transitionToFailed('render', new Error('Render failure rollback failed.', {
            cause: rollbackError,
          }));
        }
        return;
      }
      if (this.isRunningAttempt(generation)) this.transitionToFailed('render', renderError);
    }
  }
  private createManifestForCurrentState(
    context: Readonly<ThreeFrameContext>,
  ): ThreePresentedManifestV1 {
    const target = presentedCanonicalStateForPresentationInternal(this.world);
    return createPresentedManifestInternal({
      target,
      context,
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      deviceGeneration: this.deviceGeneration,
      cameraGeneration: this.cameraGeneration + 1,
      camera: this.camera,
    });
  }
  private unavailableFrameResult(): ThreePrepareFrameResult {
    if (this.lifecycleState !== 'lost' && this.lifecycleState !== 'restoring') {
      throw new Error(`A frame became unavailable while ${this.lifecycleState}.`);
    }
    return Object.freeze({
      status: 'unavailable',
      reason: this.lifecycleState === 'lost' ? 'context-lost' : 'restoring',
      deviceGeneration: this.deviceGeneration,
    });
  }
  private rollbackReservedFrame(frames: number, cameraGeneration: number): void {
    if (this.frames === frames + 1) this.frames = frames;
    if (this.cameraGeneration === cameraGeneration + 1) {
      this.cameraGeneration = cameraGeneration;
    }
  }
  private assertEmbeddedHostProtocol(): void {
    if (this.hostKind !== 'embedded') {
      throw new ThreeRuntimeProtocolError(
        'three.host.embedded-only',
        'Host-managed frame tickets are available only in embedded host mode.',
      );
    }
  }
  private renderCurrent(): void {
    this.renderer.render(this.scene, this.camera);
    this.renderInfo = snapshotRenderInfoInternal(this.renderer);
  }
  private updateCamera(): void {
    this.cameraStrategy.resize(this.width, this.height);
  }
  private reconcilePresentation(
    presentation: ThreePresentationSnapshot | null,
    isCurrentAttempt: () => boolean,
  ): boolean {
    this.materialPresenter.reconcile(presentation?.materials ?? []);
    if (!isCurrentAttempt()) return false;
    this.geometryPresenter.reconcile(presentation?.geometries ?? []);
    if (!isCurrentAttempt()) return false;
    this.chunkPresenter.reconcile(
      presentation?.chunks ?? [],
      (key) => this.materialPresenter.get(key),
    );
    if (!isCurrentAttempt()) return false;
    this.instancePresenter.reconcile(presentation?.batches ?? [], {
      geometry: (key) => this.geometryPresenter.get(key),
      material: (key) => this.materialPresenter.get(key),
    });
    return isCurrentAttempt();
  }

  private commitViewportState(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
  }
  private transitionToFailed(phase: ThreeRuntimeFailurePhaseV1, reason: unknown): void {
    if (
      this.lifecycleState === 'failed'
      || this.lifecycleState === 'disposed'
      || this.lifecycleState === 'lost'
    ) return;
    const error = reason instanceof Error ? reason : new Error(String(reason));
    this.failure = Object.freeze({
      code: `three.runtime.${phase}-failed`,
      phase,
      name: error.name,
      message: error.message,
    });
    const invalidated = this.hostFrames.dispose();
    if (invalidated) this.presentations.releaseHostFrameInternal(invalidated);
    this.lifecycleState = 'failed';
    setRenderWorldPresentationAvailabilityInternal(this.world, 'failed');
  }
  private isRestoreAttempt(deviceGeneration: number): boolean {
    return this.lifecycleState === 'restoring' && this.deviceGeneration === deviceGeneration;
  }

  private isInitializing(): boolean {
    return this.lifecycleState === 'initializing';
  }
  private isRunningAttempt(deviceGeneration: number): boolean {
    return this.lifecycleState === 'running' && this.deviceGeneration === deviceGeneration;
  }
  private hasRuntimeEndedAfterCallbacks(): boolean {
    return this.lifecycleState === 'disposed' || this.lifecycleState === 'failed';
  }
  private isFrameUnavailableAfterCallbacks(): boolean {
    return this.lifecycleState === 'lost' || this.lifecycleState === 'restoring';
  }
  private legacyState(): ThreeRenderMetrics['state'] {
    if (this.lifecycleState === 'running') return 'running';
    return this.lifecycleState === 'disposed' ? 'disposed' : 'lost';
  }

  private assertAccepting(): void {
    if (this.lifecycleState === 'disposed') throw new Error('ThreeRenderRuntime is disposed.');
    if (this.lifecycleState === 'failed') throw new Error('ThreeRenderRuntime has failed.');
    if (this.lifecycleState === 'initializing') throw new Error('ThreeRenderRuntime is initializing.');
  }
}

export type { RendererFactory, RendererLike } from './rendererTypes.js';
export type { ThreeDaylightOptions } from './daylightRig.js';
