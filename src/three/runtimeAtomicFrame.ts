import type { RenderWorld } from '../core/index.js';
import type { PreparedRenderDeltaInternal } from '../core/delta-reducer.js';
import {
  pendingCanonicalStateForPresentationInternal,
  prepareCanonicalPresentationInternal,
  presentedCanonicalStateForPresentationInternal,
} from '../core/render-world.js';
import type { PreparedPresentedPickCandidateInternal } from './committedPresentedPickSnapshot.js';
import type { ThreeFrameContext, ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import { RevisionAtomicFrameCommitInternal } from './revisionAtomicFrameCommit.js';
import { prepareRuntimeCommittedPickCandidateInternal } from './runtimeCommittedPick.js';
import type { RevisionAtomicPresentationLeaseInternal } from './revisionAtomicStaging.js';
import type { RevisionAtomicPresentationTargetInternal } from './revisionAtomicStagingTypes.js';
import type { RevisionAtomicAdmissionReservationHandleInternal } from './revisionAtomicTargetCoordinatorTypes.js';
import type { RuntimeAtomicSetupInternal } from './runtimeAtomicSetup.js';
import type { RenderInfoSnapshotInternal } from './runtimeRenderInfo.js';
import type { ThreeRuntimeFailurePhaseV1 } from './runtimeTypes.js';

type CanonicalCandidateInternal = NonNullable<
  ReturnType<typeof pendingCanonicalStateForPresentationInternal>
>;

export interface RuntimeAtomicAdmissionRejectionInternal {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type RuntimeAtomicReserveResultInternal =
  | { readonly handle: RevisionAtomicAdmissionReservationHandleInternal }
  | { readonly rejection: RuntimeAtomicAdmissionRejectionInternal };

/**
 * One atomic revision activated and awaiting a draw. The canonical ticket and
 * the staged scene lease are already live, so whoever draws next renders this
 * revision; the commit half is the acknowledgement that it reached the canvas.
 */
export interface RuntimeAtomicPreparedFrameInternal {
  readonly frameCommit: RevisionAtomicFrameCommitInternal;
  readonly lease: RevisionAtomicPresentationLeaseInternal;
  readonly pending: CanonicalCandidateInternal;
  readonly deviceGeneration: number;
}

/**
 * The outcome of the prepare half. `idle` means workers are still meshing the
 * pending revision, so the draw should show the currently displayed one rather
 * than stall the host's cadence.
 */
export type RuntimeAtomicPrepareOutcomeInternal =
  | 'no-atomic-target'
  | { readonly status: 'unavailable' }
  | { readonly status: 'idle' }
  | {
    readonly status: 'prepared';
    readonly prepared: RuntimeAtomicPreparedFrameInternal;
  };

/**
 * The runtime surface the atomic frame flow drives. Every member reads or
 * writes live runtime state, so the runtime supplies closures rather than
 * exposing mutable fields.
 */
export interface RuntimeAtomicFrameOpsInternal {
  isRunning(): boolean;
  deviceGeneration(): number;
  isRunningAttempt(generation: number): boolean;
  hasRuntimeEndedAfterCallbacks(): boolean;
  renderCurrent(): void;
  transitionToFailed(phase: ThreeRuntimeFailurePhaseV1, reason: unknown): void;
  frames(): number;
  setFrames(value: number): void;
  cameraGeneration(): number;
  setCameraGeneration(value: number): void;
  /** Manifest of the currently presented canonical state. */
  presentedManifest(context: Readonly<ThreeFrameContext>): ThreePresentedManifestV1;
  manifestForTarget(
    target: RevisionAtomicPresentationTargetInternal,
    context: Readonly<ThreeFrameContext>,
    deviceGeneration: number,
    cameraGeneration: number,
  ): ThreePresentedManifestV1;
  snapshotRenderInfo(): RenderInfoSnapshotInternal;
  /**
   * Records the exact frame the canvas now shows. The manifest is the capture
   * and query identity for that frame, so it must only advance for a draw the
   * runtime actually acknowledged.
   */
  commitPresentedPointers(
    context: Readonly<ThreeFrameContext>,
    manifest: ThreePresentedManifestV1,
    renderInfo: RenderInfoSnapshotInternal | null,
  ): void;
}

function combineAtomicFrameErrors(primary: unknown, cleanup: readonly unknown[]): unknown {
  if (cleanup.length === 0) return primary;
  return new AggregateError(
    [primary, ...cleanup],
    'Atomic frame cleanup failed.',
    { cause: primary },
  );
}

/**
 * Drives the runtime's atomic voxel frames: admission reservation mapping for
 * the accept path, worker event advancement, pending-target recovery, and the
 * cross-layer frame transaction that commits one ready revision per draw.
 */
/**
 * Consecutive failed re-admissions of one pending revision before the runtime
 * fails terminally instead of silently replanning every frame.
 */
export const RUNTIME_ATOMIC_MAX_RECOVERY_ATTEMPTS_INTERNAL = 8;

export class RuntimeAtomicFrameCoordinatorInternal {
  private recoveryKey: string | null = null;
  private recoveryAttempts = 0;

  constructor(
    private readonly setup: RuntimeAtomicSetupInternal,
    private readonly world: RenderWorld,
    private readonly ops: RuntimeAtomicFrameOpsInternal,
  ) {}

  ownsCandidateInternal(candidate: CanonicalCandidateInternal): boolean {
    return candidate.descriptorViewInternal().chunkProfile !== undefined;
  }

  reserveAdmissionInternal(
    candidate: CanonicalCandidateInternal,
    preparedDelta?: PreparedRenderDeltaInternal,
  ): RuntimeAtomicReserveResultInternal {
    const reject = (code: string, message: string) => ({
      rejection: { code, path: '$', message },
    });
    let reservation;
    try {
      reservation = this.setup.pipeline.reserveForCandidateInternal(candidate, preparedDelta);
    } catch (error) {
      return reject(
        'three.voxel-plan-invalid',
        error instanceof Error ? error.message : String(error),
      );
    }
    switch (reservation.status) {
      case 'reserved':
        return { handle: reservation.handle };
      case 'blocked':
        return reject(
          'three.voxel-presentation-in-flight',
          'A revision-atomic presentation is in flight; retry after the frame settles.',
        );
      case 'rejected':
        return reject(
          'three.voxel-target-rejected',
          `The voxel worker pipeline rejected the target (${reservation.reason}).`,
        );
      case 'failed':
        return reject('three.voxel-staging-failed', reservation.terminal.message);
      case 'disposed':
        return reject(
          'three.voxel-pipeline-disposed',
          'The voxel worker pipeline is disposed.',
        );
    }
  }

  activateAdmissionInternal(handle: RevisionAtomicAdmissionReservationHandleInternal): void {
    // A post-commit activation failure is an explicit target terminal;
    // accepted state stands and the frame path re-admits the pending revision.
    this.setup.pipeline.activateInternal(handle);
  }

  cancelAdmissionInternal(handle: RevisionAtomicAdmissionReservationHandleInternal): void {
    this.setup.pipeline.cancelInternal(handle);
  }

  /**
   * The prepare half of an atomic frame, shared by both host modes: advances
   * worker events, re-admits a pending revision whose target was lost, and
   * activates a ready lease so the next draw renders it. Returns
   * 'no-atomic-target' when neither the pending nor the presented canonical
   * state belongs to the atomic pipeline so the legacy path may run.
   *
   * Splitting here rather than at the commit is what lets an embedded host own
   * the draw: the runtime's own draw and the host's frame ticket are the same
   * transaction with a different party in the middle.
   */
  prepareAtomicFrameInternal(): RuntimeAtomicPrepareOutcomeInternal {
    this.setup.driver.advanceInternal();
    if (!this.ops.isRunning()) return { status: 'unavailable' };
    const pending = pendingCanonicalStateForPresentationInternal(this.world);
    const atomicPending = pending && this.ownsCandidateInternal(pending) ? pending : null;
    if (atomicPending) {
      this.ensureTargetInternal(atomicPending);
      const lease = this.setup.pipeline.readyLeaseInternal;
      if (
        lease?.targetInternal.worldId === atomicPending.worldId
        && lease.targetInternal.epoch === atomicPending.epoch
        && lease.targetInternal.revision === atomicPending.revision
      ) {
        return this.activatePreparedFrameInternal(atomicPending, lease);
      }
      // Workers are still meshing the pending revision: draw the currently
      // displayed revision so the host cadence continues without a seam.
      return { status: 'idle' };
    }
    const presented = presentedCanonicalStateForPresentationInternal(this.world);
    if (presented && this.ownsCandidateInternal(presented)) return { status: 'idle' };
    return 'no-atomic-target';
  }

  /**
   * Runs one standalone frame for atomic-owned worlds. The runtime owns the
   * draw here, so it sits between the same two halves an embedded host's frame
   * ticket brackets.
   */
  standaloneFrameInternal(
    context: Readonly<ThreeFrameContext>,
  ): ThreePresentedManifestV1 | undefined | 'no-atomic-target' {
    const outcome = this.prepareAtomicFrameInternal();
    if (outcome === 'no-atomic-target') return 'no-atomic-target';
    if (outcome.status === 'unavailable') return undefined;
    if (outcome.status === 'idle') return this.idleFrameInternal(context);
    const { prepared } = outcome;
    try {
      this.ops.renderCurrent();
    } catch (error) {
      const cleanup: unknown[] = [];
      try {
        prepared.frameCommit.abortInternal();
      } catch (caught) {
        cleanup.push(caught);
      }
      cleanup.push(...this.settleLeaseInternal(prepared.lease));
      if (this.ops.isRunningAttempt(prepared.deviceGeneration)) {
        this.ops.transitionToFailed('render', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
    return this.commitPreparedAtomicFrameInternal(prepared, context);
  }

  /**
   * Activates one ready revision for the coming draw. A canonical lane that is
   * momentarily unpreparable (for example a reentrant settlement) yields an
   * idle frame so the current revision draws and the next frame retries.
   */
  private activatePreparedFrameInternal(
    pending: CanonicalCandidateInternal,
    lease: RevisionAtomicPresentationLeaseInternal,
  ): RuntimeAtomicPrepareOutcomeInternal {
    const ticket = prepareCanonicalPresentationInternal(this.world, pending);
    if (!ticket) return { status: 'idle' };
    const frameCommit = new RevisionAtomicFrameCommitInternal({
      canonicalTicket: ticket,
      sceneLease: lease,
    });
    const generation = this.ops.deviceGeneration();
    try {
      frameCommit.activateInternal();
    } catch (error) {
      const cleanup = this.settleLeaseInternal(lease);
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('prepare', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
    return {
      status: 'prepared',
      prepared: { frameCommit, lease, pending, deviceGeneration: generation },
    };
  }

  /**
   * Settles a prepared frame that a device transition orphaned. A stale ticket
   * can be neither committed nor aborted by its host, so without this the
   * transaction would hold its target for the rest of the session. Failures are
   * swallowed rather than escalated: the runtime is already lost or restoring,
   * and the stager retains any restoration debt for the reconstruction path.
   */
  discardPreparedAtomicFrameInternal(prepared: RuntimeAtomicPreparedFrameInternal): void {
    try {
      prepared.frameCommit.abortInternal();
    } catch {
      // The stager retains restoration debt for the restore path.
    }
    this.settleLeaseInternal(prepared.lease);
  }

  /**
   * Rolls back an activated revision whose draw never reached the canvas. The
   * previously displayed revision is restored, and the lease settles so the
   * coordinator stops holding the target.
   */
  abortPreparedAtomicFrameInternal(prepared: RuntimeAtomicPreparedFrameInternal): void {
    const cleanup: unknown[] = [];
    try {
      prepared.frameCommit.abortInternal();
    } catch (error) {
      cleanup.push(error);
    }
    cleanup.push(...this.settleLeaseInternal(prepared.lease));
    if (cleanup.length === 0) return;
    // The displayed scene is now unknown, which is terminal rather than a
    // frame the host may simply retry.
    if (this.ops.isRunningAttempt(prepared.deviceGeneration)) {
      this.ops.transitionToFailed(
        'commit',
        combineAtomicFrameErrors(cleanup[0], cleanup.slice(1)),
      );
    }
    throw cleanup[0];
  }

  /**
   * Re-admits a pending revision whose worker target failed or was lost. The
   * recovery replan reuses every displayed mesh, so unchanged chunks schedule
   * no jobs; attempts are bounded per revision so a persistently inadmissible
   * pending revision fails the runtime explicitly instead of silently
   * replanning every frame.
   */
  private ensureTargetInternal(pending: CanonicalCandidateInternal): void {
    if (this.setup.pipeline.activeTargetInternal !== null) {
      this.recoveryKey = null;
      this.recoveryAttempts = 0;
      return;
    }
    const key = `${pending.worldId}\u0000${pending.epoch}\u0000${String(pending.revision)}`;
    if (this.recoveryKey !== key) {
      this.recoveryKey = key;
      this.recoveryAttempts = 0;
    }
    let reservation;
    try {
      reservation = this.setup.pipeline.reserveForCandidateInternal(pending);
    } catch (error) {
      // The accepted candidate was plannable at admission; a recovery plan
      // failure is an invariant break rather than backpressure.
      this.ops.transitionToFailed('prepare', error);
      throw error;
    }
    if (reservation.status === 'reserved') {
      const activation = this.setup.pipeline.activateInternal(reservation.handle);
      if (activation.status === 'pending' || activation.status === 'ready') {
        this.recoveryKey = null;
        this.recoveryAttempts = 0;
        return;
      }
    }
    this.recoveryAttempts += 1;
    if (this.recoveryAttempts >= RUNTIME_ATOMIC_MAX_RECOVERY_ATTEMPTS_INTERNAL) {
      const terminal = this.setup.pipeline.lastTerminalInternal;
      const error = new Error(
        `Atomic recovery admission failed ${String(this.recoveryAttempts)} times `
        + `for revision ${String(pending.revision)} (${reservation.status}`
        + `${terminal ? `; last terminal: ${terminal.message}` : ''}).`,
      );
      this.ops.transitionToFailed('prepare', error);
      throw error;
    }
  }

  private idleFrameInternal(
    context: Readonly<ThreeFrameContext>,
  ): ThreePresentedManifestV1 | undefined {
    const generation = this.ops.deviceGeneration();
    try {
      this.ops.renderCurrent();
    } catch (error) {
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('render', error);
      }
      throw error;
    }
    return this.commitIdleFrameInternal(context, generation);
  }

  /**
   * The commit half of a frame that redraws the displayed revision. No
   * canonical state advances, so this only records that a frame reached the
   * canvas.
   */
  commitIdleFrameInternal(
    context: Readonly<ThreeFrameContext>,
    generation: number = this.ops.deviceGeneration(),
  ): ThreePresentedManifestV1 | undefined {
    if (!this.ops.isRunningAttempt(generation)) return undefined;
    const previousFrames = this.ops.frames();
    this.ops.setFrames(previousFrames + 1);
    let manifest: ThreePresentedManifestV1;
    try {
      manifest = this.ops.presentedManifest(context);
    } catch (error) {
      if (this.ops.frames() === previousFrames + 1) this.ops.setFrames(previousFrames);
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('commit', error);
      }
      throw error;
    }
    this.ops.setCameraGeneration(manifest.cameraGeneration);
    this.ops.commitPresentedPointers(context, manifest, null);
    return manifest;
  }

  /**
   * The commit half: acknowledges that the draw put this revision on the
   * canvas. The canonical ticket, staged scene lease, and committed query
   * candidate settle atomically; any pre-finalization failure preserves the
   * previously displayed revision.
   */
  commitPreparedAtomicFrameInternal(
    prepared: RuntimeAtomicPreparedFrameInternal,
    context: Readonly<ThreeFrameContext>,
  ): ThreePresentedManifestV1 | undefined {
    const { frameCommit, lease, pending, deviceGeneration: generation } = prepared;
    if (!this.ops.isRunningAttempt(generation)) {
      // A context transition interrupted the draw; preserve the prior
      // revision and let restoration handle the device change. Abort and
      // settle failures are not escalated here: the runtime is already
      // lost/restoring, and the stager retains any restoration debt for the
      // reconstruction path to retry.
      try {
        frameCommit.abortInternal();
      } catch {
        // The stager retains restoration debt for the restore path.
      }
      this.settleLeaseInternal(lease);
      return undefined;
    }
    const previousFrames = this.ops.frames();
    const previousCameraGeneration = this.ops.cameraGeneration();
    this.ops.setFrames(previousFrames + 1);
    this.ops.setCameraGeneration(previousCameraGeneration + 1);
    const rollbackCounters = (): void => {
      if (this.ops.frames() === previousFrames + 1) this.ops.setFrames(previousFrames);
      if (this.ops.cameraGeneration() === previousCameraGeneration + 1) {
        this.ops.setCameraGeneration(previousCameraGeneration);
      }
    };
    let manifest: ThreePresentedManifestV1;
    let committedRenderInfo: RenderInfoSnapshotInternal;
    try {
      manifest = this.ops.manifestForTarget(
        Object.freeze({
          worldId: pending.worldId,
          epoch: pending.epoch,
          revision: pending.revision,
        }),
        context,
        generation,
        this.ops.cameraGeneration(),
      );
      committedRenderInfo = this.ops.snapshotRenderInfo();
    } catch (error) {
      rollbackCounters();
      const cleanup: unknown[] = [];
      try {
        frameCommit.abortInternal();
      } catch (caught) {
        cleanup.push(caught);
      }
      cleanup.push(...this.settleLeaseInternal(lease));
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('commit', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
    // The committed query candidate can only exist after the draw, because its
    // manifest pins the exact frame that was rendered. Building it here keeps
    // public queries reading the same revision the canvas shows.
    let candidate: PreparedPresentedPickCandidateInternal;
    try {
      candidate = prepareRuntimeCommittedPickCandidateInternal(
        pending,
        lease.bundleInternal,
        manifest,
      );
    } catch (error) {
      rollbackCounters();
      const cleanup: unknown[] = [];
      try {
        frameCommit.abortInternal();
      } catch (caught) {
        cleanup.push(caught);
      }
      cleanup.push(...this.settleLeaseInternal(lease));
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('commit', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
    let outcome;
    try {
      outcome = frameCommit.commitInternal({
        authority: this.setup.queries,
        candidate,
      });
    } catch (error) {
      const cleanup = this.settleLeaseInternal(lease);
      if (frameCommit.phaseInternal === 'committed') {
        // The canonical commit is irrevocable; only retirement failed. When
        // the runtime itself ended inside a waiter callback — dispose tears
        // the owners down mid-commit — disposal already settled every lane,
        // so the frame ends the same quiet way as any post-commit ending.
        // Otherwise the failure surfaces as a terminal runtime error.
        if (this.ops.hasRuntimeEndedAfterCallbacks()) return undefined;
        if (this.ops.isRunningAttempt(generation)) {
          this.ops.transitionToFailed('commit', combineAtomicFrameErrors(error, cleanup));
        }
        throw error;
      }
      rollbackCounters();
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('commit', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
    const settleErrors = this.settleLeaseInternal(lease);
    if (settleErrors.length > 0) {
      if (this.ops.hasRuntimeEndedAfterCallbacks()) return undefined;
      this.ops.transitionToFailed(
        'commit',
        combineAtomicFrameErrors(settleErrors[0], settleErrors.slice(1)),
      );
      throw settleErrors[0];
    }
    if (outcome.status === 'superseded') {
      // A newer acceptance invalidated this frame between draw and commit;
      // the prior revision was preserved and presents on a later frame.
      rollbackCounters();
      return undefined;
    }
    if (this.ops.hasRuntimeEndedAfterCallbacks()) return undefined;
    this.ops.commitPresentedPointers(context, manifest, committedRenderInfo);
    return manifest;
  }

  /** Settles the coordinator record for a committed or aborted lease. */
  private settleLeaseInternal(
    lease: RevisionAtomicPresentationLeaseInternal,
  ): unknown[] {
    try {
      this.setup.pipeline.settleInternal(lease);
      return [];
    } catch (error) {
      return [error];
    }
  }
}
