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
  commitPresentedPointers(
    context: Readonly<ThreeFrameContext>,
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
   * Runs one standalone frame for atomic-owned worlds: advances worker events,
   * re-admits a pending revision whose target was lost, and commits a ready
   * lease through the cross-layer frame transaction. Returns
   * 'no-atomic-target' when neither the pending nor the presented canonical
   * state belongs to the atomic pipeline so the legacy path may run.
   */
  standaloneFrameInternal(
    context: Readonly<ThreeFrameContext>,
  ): ThreePresentedManifestV1 | undefined | 'no-atomic-target' {
    this.setup.driver.advanceInternal();
    if (!this.ops.isRunning()) return undefined;
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
        return this.commitFrameInternal(context, lease, atomicPending);
      }
      // Workers are still meshing the pending revision: draw the currently
      // displayed revision so the host cadence continues without a seam.
      return this.idleFrameInternal(context);
    }
    const presented = presentedCanonicalStateForPresentationInternal(this.world);
    if (presented && this.ownsCandidateInternal(presented)) {
      return this.idleFrameInternal(context);
    }
    return 'no-atomic-target';
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
    this.ops.commitPresentedPointers(context, null);
    return manifest;
  }

  /**
   * Draws and commits one ready atomic revision. The canonical ticket, staged
   * scene lease, and (later) committed query candidate settle atomically; any
   * pre-finalization failure preserves the previously displayed revision.
   */
  private commitFrameInternal(
    context: Readonly<ThreeFrameContext>,
    lease: RevisionAtomicPresentationLeaseInternal,
    pending: CanonicalCandidateInternal,
  ): ThreePresentedManifestV1 | undefined {
    const ticket = prepareCanonicalPresentationInternal(this.world, pending);
    // The canonical lane is momentarily unpreparable (for example a
    // reentrant settlement); draw the current revision and retry next frame.
    if (!ticket) return this.idleFrameInternal(context);
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
    try {
      this.ops.renderCurrent();
    } catch (error) {
      const cleanup: unknown[] = [];
      try {
        frameCommit.abortInternal();
      } catch (caught) {
        cleanup.push(caught);
      }
      cleanup.push(...this.settleLeaseInternal(lease));
      if (this.ops.isRunningAttempt(generation)) {
        this.ops.transitionToFailed('render', combineAtomicFrameErrors(error, cleanup));
      }
      throw error;
    }
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
        // The canonical commit is irrevocable; only retirement failed. The
        // frame stands and the failure surfaces as a terminal runtime error.
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
    this.ops.commitPresentedPointers(context, committedRenderInfo);
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
