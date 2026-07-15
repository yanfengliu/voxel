import type { Camera, Scene } from 'three';
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
  markPreparedCanonicalStatePresentedInternal,
  pendingCanonicalStateForPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
  setRenderWorldPresentationAvailabilityInternal,
} from '../core/render-world.js';
import {
  getThreeRuntimeCapabilitiesV1,
  type ThreeRuntimeCapabilitiesV1,
} from './capabilities.js';
import type { DaylightRig } from './daylightRig.js';
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
import {
  acceptDeltaInternal,
  acceptSnapshotInternal,
  type RuntimeIngestOpsInternal,
} from './runtimeIngest.js';
import { pickCommittedPresentedRayForLifecycleInternal } from './committedPresentedPickSnapshot.js';
import type { PickPresentedResultV1, PickQueryV1 } from './pickingContracts.js';
import type { RendererLike } from './rendererTypes.js';
import {
  EMPTY_RENDER_INFO_INTERNAL,
  snapshotRenderInfoInternal,
  type RenderInfoSnapshotInternal,
} from './runtimeRenderInfo.js';
import { collectRuntimeMetricsInternal } from './runtimeMetrics.js';
import { RuntimePresentationRetentionInternal } from './runtimePresentationRetention.js';
import type { ContextEventCanvasInternal } from './runtimeRendererSetup.js';
import {
  disposeRuntimeAtomicSetupInternal,
  type RuntimeAtomicSetupInternal,
} from './runtimeAtomicSetup.js';
import {
  RuntimeAtomicFrameCoordinatorInternal,
  type RuntimeAtomicFrameOpsInternal,
} from './runtimeAtomicFrame.js';
import {
  prepareHostRestorationFrameInternal,
  type PreparedHostFrameInternal,
  type RuntimeHostRestorationOpsInternal,
} from './runtimeHostRestoration.js';
import {
  RevisionAwareCaptureCoordinatorInternal,
  type RevisionCaptureRuntimePortInternal,
} from './revisionCaptureCoordinator.js';
import type {
  ThreeCaptureOptionsV1,
  ThreeCaptureWhenPresentedOptionsV1,
  ThreeCaptureWhenPresentedResultV1,
  ThreeCaptureWithManifestResultV1,
} from './revisionCaptureContracts.js';
import { createRuntimeCapturePortInternal } from './runtimeCaptureSupport.js';
import {
  abortStandaloneFrameAfterDrawFailureInternal,
  restoreAbortedHostFrameInternal,
  restoreHostSceneInternal,
  restoreLateHostFrameInternal,
  type RuntimeHostFrameRestoreOpsInternal,
} from './runtimeHostFrameRestore.js';
import { runRuntimeDisposalInternal } from './runtimeDisposal.js';
import { captureRuntimeCanvasInternal } from './runtimeCapture.js';
import { initializeRuntimeInternal } from './runtimeInitialization.js';
import { resizeRuntimeInternal } from './runtimeResize.js';
import type { LegacyRuntimePresentationSurfaceInternal } from './runtimePresentationSurface.js';
import {
  initializeRuntimeSnapshotMetricsInternal,
} from './runtimeSnapshotMetrics.js';
import type {
  ThreeCaptureResult,
  ThreePresentationSnapshot,
  ThreeAtomicPipelineMetricsV1,
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


export class ThreeRenderRuntime {
  private readonly scene!: Scene;
  private readonly camera!: Camera;
  private readonly cameraStrategy!: ThreeCameraStrategyInternal;
  private readonly presentationSurface!: LegacyRuntimePresentationSurfaceInternal;
  private readonly renderer!: RendererLike;
  private readonly rendererOwnership!: 'owned' | 'borrowed';
  private readonly viewportOwnership!: 'runtime' | 'host';
  private readonly hostKind!: 'runtime-rendered' | 'embedded';
  private readonly daylightRig!: DaylightRig | null;
  private readonly atomic!: RuntimeAtomicSetupInternal | null;
  private readonly atomicFrames!: RuntimeAtomicFrameCoordinatorInternal | null;
  private readonly captures = new RevisionAwareCaptureCoordinatorInternal(
    this.captureRuntimePortInternal(),
  );
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
  /** The exact manifest of the frame the canvas last presented. */
  private lastPresentedManifest: ThreePresentedManifestV1 | null = null;
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
    this.presentationSurface = initialized.presentationSurface;
    this.daylightRig = initialized.daylightRig;
    this.atomic = initialized.atomic;
    this.atomicFrames = initialized.atomic
      ? new RuntimeAtomicFrameCoordinatorInternal(
          initialized.atomic,
          this.world,
          this.atomicFrameOpsInternal(),
        )
      : null;
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
    return acceptSnapshotInternal(snapshot, this.ingestOpsInternal());
  }

  acceptDelta(delta: RenderDeltaV1): DeltaApplyResultV1 {
    return acceptDeltaInternal(delta, this.ingestOpsInternal());
  }

  /** Live-state handles the ingest path drives. */
  private ingestOpsInternal(): RuntimeIngestOpsInternal {
    return {
      runtimeToken: this,
      world: this.world,
      presentations: this.presentations,
      atomicFrames: this.atomicFrames,
      hostKind: this.hostKind,
      assertAccepting: () => { this.assertAccepting(); },
      atomicOwnsCandidate: (candidate) => this.atomicOwnsCandidateInternal(candidate),
    };
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
  /**
   * Captures the frame the canvas currently presents, with the exact manifest
   * identifying that frame. Runtime-owned capture may issue one fenced
   * compatibility readback; embedded hosts own capture and receive
   * `host-capture-owned` unless they supply an explicit readback lease.
   */
  captureWithManifest(options?: ThreeCaptureOptionsV1): ThreeCaptureWithManifestResultV1 {
    return this.captures.captureWithManifest(options);
  }

  /**
   * Captures a specific revision once it has actually been presented. The
   * result identifies the exact presented frame, so a caller never receives
   * pixels from a revision it did not ask for.
   */
  captureWhenPresented(
    target: RenderRevisionRefV1,
    options?: ThreeCaptureWhenPresentedOptionsV1,
  ): Promise<ThreeCaptureWhenPresentedResultV1> {
    return this.captures.captureWhenPresented(target, options);
  }

  /**
   * Queries the exact frame the canvas last presented. The result reads only
   * committed state: never accepted-but-unpresented revisions, pending edits,
   * the mutable camera, or live presenter objects. Runtimes without the voxel
   * worker pipeline report `no-presented-frame`.
   */
  pickPresented(query: PickQueryV1): PickPresentedResultV1 {
    return pickCommittedPresentedRayForLifecycleInternal(
      this.atomic?.queries.currentInternal ?? null,
      this.lifecycleState,
      query,
    );
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
        this.lastPresentedManifest = manifest;
        this.frames++;
        return manifest;
      } catch (error) {
        if (!this.isRestoreAttempt(restoreGeneration)) return;
        this.transitionToFailed('restore', error);
        throw error;
      }
      return undefined;
    }
    if (this.atomicFrames) {
      const atomicOutcome = this.atomicFrames.standaloneFrameInternal(frozenContext);
      if (atomicOutcome !== 'no-atomic-target') return atomicOutcome;
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
      // A restoration ticket is outstanding while restoring, so aborting one
      // must not be mistaken for a stale pre-loss ticket: that would mask the
      // host's own draw failure and strand this frame's retained presentation.
      { allowRestoring: this.lifecycleState === 'restoring' },
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
      presentation: this.presentationSurface.metricsInternal(),
      renderInfo: this.renderInfo,
      contextLosses: this.contextLosses,
      contextRestorations: this.contextRestorations,
      presentationStagingBytes: presentationStaging.currentBytes,
      peakPresentationStagingBytes: presentationStaging.peakBytes,
      atomic: this.atomicPipelineMetricsInternal(),
    });
  }
  /** Null unless this runtime owns a worker-meshed voxel pipeline. */
  private atomicPipelineMetricsInternal(): ThreeAtomicPipelineMetricsV1 | null {
    if (!this.atomic) return null;
    const staging = this.atomic.pipeline.stagingMetricsInternal();
    const driver = this.atomic.driver.metricsInternal();
    return Object.freeze({
      preparedTargets: staging.preparedTargets,
      cpuStagingBytes: staging.cpuStagingBytes,
      gpuStagingBytes: staging.gpuStagingBytes,
      pendingRetiredBundles: staging.pendingRetiredBundles,
      pendingRetirements: staging.pendingRetirements,
      queuedJobs: staging.scheduler.queuedJobs,
      queuedBytes: staging.scheduler.queuedBytes,
      queuedWorkerEvents: driver.queuedEvents,
      liveWorkers: driver.liveWorkers,
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
        () => {
          if (this.atomic) disposeRuntimeAtomicSetupInternal(this.atomic, this.scene);
        },
        () => this.presentationSurface.disposeInternal(),
        () => this.daylightRig?.dispose(this.scene),
        () => this.scene.remove(this.presentationSurface.rootInternal),
        () => { if (this.rendererOwnership === 'owned') this.renderer.dispose(); },
      ];
      this.presentations.disposeInternal();
      this.lastPresentedFrameContext = null;
      this.lastPresentedManifest = null;
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

  private atomicOwnsCandidateInternal(
    candidate: CanonicalPresentationStateInternal,
  ): boolean {
    return this.atomicFrames?.ownsCandidateInternal(candidate) ?? false;
  }

  /** Binds live runtime state for the atomic frame flow. */
  private atomicFrameOpsInternal(): RuntimeAtomicFrameOpsInternal {
    return {
      isRunning: () => this.lifecycleState === 'running',
      deviceGeneration: () => this.deviceGeneration,
      isRunningAttempt: (generation) => this.isRunningAttempt(generation),
      hasRuntimeEndedAfterCallbacks: () => this.hasRuntimeEndedAfterCallbacks(),
      renderCurrent: () => { this.renderCurrent(); },
      transitionToFailed: (phase, reason) => { this.transitionToFailed(phase, reason); },
      frames: () => this.frames,
      setFrames: (value) => { this.frames = value; },
      cameraGeneration: () => this.cameraGeneration,
      setCameraGeneration: (value) => { this.cameraGeneration = value; },
      presentedManifest: (context) => this.createManifestForCurrentState(context),
      manifestForTarget: (target, context, deviceGeneration, cameraGeneration) =>
        createPresentedManifestInternal({
          target,
          context,
          width: this.width,
          height: this.height,
          pixelRatio: this.pixelRatio,
          deviceGeneration,
          cameraGeneration,
          camera: this.camera,
        }),
      snapshotRenderInfo: () => snapshotRenderInfoInternal(this.renderer),
      commitPresentedPointers: (context, manifest, renderInfo) => {
        this.lastPresentedFrameContext = context;
        this.lastPresentedManifest = manifest;
        if (renderInfo) this.renderInfo = renderInfo;
      },
    };
  }

  /** Exposes only committed presented state to the capture coordinator. */
  private captureRuntimePortInternal(): RevisionCaptureRuntimePortInternal {
    return createRuntimeCapturePortInternal({
      captureOwnership: this.hostKind === 'embedded' ? 'host' : 'runtime',
      renderer: () => this.renderer,
      runtimeStatus: () => this.runtimeStatus(),
      presentationReadiness: (target) => this.world.presentationReadiness(target),
      awaitPresented: (target, signal) => this.world.awaitPresented(
        target,
        signal ? { signal } : undefined,
      ),
      metrics: () => this.metrics(),
      presentedState: () => presentedCanonicalStateForPresentationInternal(this.world),
      presentedManifest: () => this.lastPresentedManifest,
      isRunning: () => this.lifecycleState === 'running',
      deviceGeneration: () => this.deviceGeneration,
      isRunningAttempt: (generation) => this.isRunningAttempt(generation),
      renderCurrent: () => { this.renderCurrent(); },
      failCapture: (reason) => { this.transitionToFailed('capture', reason); },
    });
  }

  private prepareFrameInternal(
    context: Readonly<ThreeFrameContext>,
  ): ThreePrepareFrameResult {
    this.assertAccepting();
    if (this.lifecycleState === 'lost') return this.unavailableFrameResult();
    // An embedded host owns the draw, so it can never call frame(); the frame
    // ticket is its only draw protocol and restoration must complete through
    // it, or the runtime stays restoring for the rest of the session.
    if (this.lifecycleState === 'restoring') {
      if (this.hostKind !== 'embedded') return this.unavailableFrameResult();
      return prepareHostRestorationFrameInternal(context, this.restorationOpsInternal());
    }
    this.hostFrames.beginPreparation();
    const generation = this.deviceGeneration;
    // Atomic-owned pendings present only through the worker frame transaction;
    // the legacy reconcile path must never stage the same revision.
    const rawPending = pendingCanonicalStateForPresentationInternal(this.world);
    const pending = rawPending && this.atomicOwnsCandidateInternal(rawPending)
      ? null
      : rawPending;
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
      this.presentationSurface.animateInternal(context.nowMs);
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
  /** Live-state closures the embedded restoration frame drives. */
  private restorationOpsInternal(): RuntimeHostRestorationOpsInternal {
    return {
      deviceGeneration: () => this.deviceGeneration,
      isRestoreAttempt: (generation) => this.isRestoreAttempt(generation),
      presentedCanonicalState: () => presentedCanonicalStateForPresentationInternal(this.world),
      presentedPresentation: () => this.presentations.presentedInternal,
      lastPresentedContext: () => this.lastPresentedFrameContext,
      reconcilePresentation: (presentation, isCurrentAttempt) =>
        this.reconcilePresentation(presentation, isCurrentAttempt),
      animate: (nowMs) => { this.presentationSurface.animateInternal(nowMs); },
      issueTicket: (payload, generation) => this.hostFrames.issue(payload, generation),
      retainHostFrame: (record, presentation) => {
        this.presentations.retainHostFrameInternal(record, presentation);
      },
      beginPreparation: () => { this.hostFrames.beginPreparation(); },
      finishPreparation: () => { this.hostFrames.finishPreparation(); },
      unavailableFrameResult: () => this.unavailableFrameResult(),
      transitionToRestoreFailure: (reason) => { this.transitionToFailed('restore', reason); },
      isFrameUnavailableAfterCallbacks: () => this.isFrameUnavailableAfterCallbacks(),
    };
  }

  private commitFrameTicketInternal(
    ticket: ThreePreparedFrameTicket,
  ): ThreePresentedManifestV1 | undefined {
    const record = this.hostFrames.consume(
      ticket,
      this.lifecycleState,
      this.deviceGeneration,
      // Only restoration issues a ticket while restoring, and only for the
      // current device generation, so admitting it here cannot admit a frame
      // prepared before the loss.
      { allowRestoring: this.lifecycleState === 'restoring' },
    );
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
    if (prepared.restoration) {
      // The host drew the rebuilt scene, which is the only evidence Voxel's
      // reconstructed GPU state actually reached the canvas. Report running
      // before the manifest so this frame is an ordinary presented frame.
      if (!this.isRestoreAttempt(record.deviceGeneration)) return undefined;
      this.lifecycleState = 'running';
      setRenderWorldPresentationAvailabilityInternal(this.world, 'available');
      // handleContextRestored already counted this restoration.
      if (!this.isRunningAttempt(record.deviceGeneration)) return undefined;
    }
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
      this.lastPresentedManifest = manifest;
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
  private hostFrameRestoreOpsInternal(): RuntimeHostFrameRestoreOpsInternal<PreparedHostFrameInternal> {
    return {
      isRunning: () => this.lifecycleState === 'running',
      deviceGeneration: () => this.deviceGeneration,
      isRunningAttempt: (generation) => this.isRunningAttempt(generation),
      transitionToFailed: (phase, reason) => { this.transitionToFailed(phase, reason); },
      resetPresentation: () => { this.presentationSurface.resetInternal(); },
      reconcilePresentation: (presentation, isCurrentAttempt) =>
        this.reconcilePresentation(presentation, isCurrentAttempt),
      animatePresentation: (nowMs) => { this.presentationSurface.animateInternal(nowMs); },
      consumeTicket: (ticket) => this.hostFrames.consume(
        ticket,
        this.lifecycleState,
        this.deviceGeneration,
      ),
      releaseHostFrame: (record) => { this.presentations.releaseHostFrameInternal(record); },
      previousPresentationOf: (payload) => payload.previousPresentation,
      previousContextOf: (payload) => payload.previousContext,
    };
  }
  private restoreAbortedHostFrame(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  ): void {
    restoreAbortedHostFrameInternal(this.hostFrameRestoreOpsInternal(), record);
  }
  private restoreLateHostFrame(
    record: HostFrameTicketRecordInternal<PreparedHostFrameInternal>,
  ): void {
    restoreLateHostFrameInternal(this.hostFrameRestoreOpsInternal(), record);
  }
  private restoreHostScene(
    presentation: ThreePresentationSnapshot | null,
    context: ThreeFrameContext | null,
    generation: number,
  ): void {
    restoreHostSceneInternal(this.hostFrameRestoreOpsInternal(), presentation, context, generation);
  }
  private abortStandaloneFrameAfterDrawFailure(
    ticket: ThreePreparedFrameTicket,
    renderError: unknown,
  ): void {
    abortStandaloneFrameAfterDrawFailureInternal(
      this.hostFrameRestoreOpsInternal(),
      ticket,
      renderError,
    );
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
    return this.presentationSurface.reconcileInternal(presentation, isCurrentAttempt);
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
