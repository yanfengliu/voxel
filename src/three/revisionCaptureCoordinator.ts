import type {
  PresentationAbortSignalV1,
  PresentationReadinessV1,
  RenderRevisionRefV1,
} from '../core/index.js';
import {
  captureAbortReasonInternal,
  capturePixelDimensionsV1Internal,
  createCaptureManifestInternal,
  normalizeCaptureOptionsInternal,
  validateCaptureReadbackInternal,
  type NormalizedCaptureOptionsInternal,
} from './captureManifest.js';
import type { ThreePresentedManifestV1 } from './hostFrameProtocol.js';
import {
  HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1,
  ThreeCaptureLeaseCleanupError,
  ThreeCaptureProtocolError,
  type ThreeCaptureManifestV1,
  type ThreeCaptureOptionsV1,
  type ThreeCaptureReadbackRequestV1,
  type ThreeCaptureReadbackV1,
  type ThreeCaptureResourceEntryV1,
  type ThreeCaptureTargetClassificationV1,
  type ThreeCaptureUnavailableReasonV1,
  type ThreeCaptureWhenPresentedOptionsV1,
  type ThreeCaptureWhenPresentedResultV1,
  type ThreeCaptureWithManifestResultV1,
  type ThreeHostCaptureReadbackLeaseV1,
} from './revisionCaptureContracts.js';
import type {
  ThreeRenderMetrics,
  ThreeRuntimeStatusV1,
} from './runtimeTypes.js';

export interface RevisionCaptureRuntimePortInternal {
  readonly captureOwnership: 'runtime' | 'host';
  runtimeStatus(): ThreeRuntimeStatusV1;
  presentationReadiness(target: RenderRevisionRefV1): PresentationReadinessV1;
  awaitPresented(
    target: RenderRevisionRefV1,
    signal?: PresentationAbortSignalV1,
  ): Promise<PresentationReadinessV1>;
  currentPresented(): RenderRevisionRefV1 | null;
  currentManifest(): ThreePresentedManifestV1 | null;
  metrics(): ThreeRenderMetrics;
  /** Must enumerate this exact presented canonical state, never accepted/pending state. */
  presentedResourceEntries(
    presented: ThreePresentedManifestV1,
  ): readonly ThreeCaptureResourceEntryV1[];
  /**
   * Runtime ownership may issue exactly one compatibility render/readback here.
   * The implementation must fence that draw to the supplied committed manifest.
   * Embedded ownership never calls this method; only its explicit host lease runs.
   */
  runtimeReadback?(
    presented: ThreePresentedManifestV1,
    request: ThreeCaptureReadbackRequestV1,
  ): ThreeCaptureReadbackV1;
}

function sameRevision(
  left: RenderRevisionRefV1,
  right: RenderRevisionRefV1,
): boolean {
  return left.worldId === right.worldId
    && left.epoch === right.epoch
    && left.revision === right.revision;
}

function manifestRevision(manifest: ThreePresentedManifestV1): RenderRevisionRefV1 | null {
  if (
    manifest.worldId === null
    && manifest.epoch === null
    && manifest.presentedRevision === null
  ) return null;
  if (
    manifest.worldId === null
    || manifest.epoch === null
    || manifest.presentedRevision === null
  ) return null;
  return Object.freeze({
    worldId: manifest.worldId,
    epoch: manifest.epoch,
    revision: manifest.presentedRevision,
  });
}

function unavailableTarget(
  target: RenderRevisionRefV1,
  reason: ThreeCaptureUnavailableReasonV1,
): ThreeCaptureTargetClassificationV1 {
  return Object.freeze({ status: 'unavailable', reason, target });
}

export function classifyCaptureTargetInternal(
  target: RenderRevisionRefV1,
  readiness: PresentationReadinessV1,
  presented: ThreePresentedManifestV1 | null,
): ThreeCaptureTargetClassificationV1 {
  if (readiness.status === 'unavailable') {
    return unavailableTarget(target, readiness.reason);
  }
  if (readiness.status === 'not-ready') {
    if (readiness.reason === 'context-lost' || readiness.reason === 'restoring') {
      return unavailableTarget(target, readiness.reason);
    }
    return Object.freeze({
      status: 'pending',
      reason: readiness.reason,
      target,
      accepted: readiness.accepted,
      presentedThrough: readiness.presentedThrough,
    });
  }
  if (!sameRevision(readiness.target, target)) {
    return unavailableTarget(target, 'manifest-mismatch');
  }
  if (!presented) return unavailableTarget(target, 'no-presented-frame');
  const actual = manifestRevision(presented);
  if (actual === null || !sameRevision(actual, readiness.presentedThrough)) {
    return unavailableTarget(target, 'manifest-mismatch');
  }
  if (actual.worldId !== target.worldId || actual.epoch !== target.epoch) {
    return unavailableTarget(target, 'manifest-mismatch');
  }
  if (actual.revision < target.revision) {
    return unavailableTarget(target, 'manifest-mismatch');
  }
  return actual.revision === target.revision
    ? Object.freeze({
        status: 'ready',
        target,
        presentedThrough: readiness.presentedThrough,
        presented,
      })
    : Object.freeze({
        status: 'superseded',
        target,
        presentedThrough: readiness.presentedThrough,
        presented,
      });
}

function lifecycleUnavailable(
  status: ThreeRuntimeStatusV1,
): ThreeCaptureUnavailableReasonV1 | null {
  switch (status.state) {
    case 'initializing': return 'initializing';
    case 'lost': return 'context-lost';
    case 'restoring': return 'restoring';
    case 'failed': return 'failed';
    case 'disposed': return 'disposed';
    case 'running': return null;
  }
}

function unavailableCapture(
  reason: ThreeCaptureUnavailableReasonV1,
): ThreeCaptureWithManifestResultV1 {
  return Object.freeze({ status: 'unavailable', reason });
}

function currentMatches(
  port: RevisionCaptureRuntimePortInternal,
  presented: ThreePresentedManifestV1,
): boolean {
  if (port.currentManifest() !== presented) return false;
  const current = port.currentPresented();
  const captured = manifestRevision(presented);
  return current === null ? captured === null : captured !== null && sameRevision(current, captured);
}

type CaptureManifestSnapshotInternal =
  | { readonly status: 'ready'; readonly manifest: ThreeCaptureManifestV1 }
  | { readonly status: 'unavailable'; readonly reason: ThreeCaptureUnavailableReasonV1 };
interface CapturePrimaryFailureInternal { readonly error: unknown }

export class RevisionAwareCaptureCoordinatorInternal {
  private readonly consumedLeases = new WeakSet();
  private synchronousOperation = false;

  constructor(private readonly port: RevisionCaptureRuntimePortInternal) {}

  captureWithManifest(
    options: ThreeCaptureOptionsV1 = {},
  ): ThreeCaptureWithManifestResultV1 {
    return this.fenced(() => this.captureCurrent(normalizeCaptureOptionsInternal(options)));
  }

  async captureWhenPresented(
    target: RenderRevisionRefV1,
    options: ThreeCaptureWhenPresentedOptionsV1 = {},
  ): Promise<ThreeCaptureWhenPresentedResultV1> {
    const start = this.fenced(() => ({
      normalized: normalizeCaptureOptionsInternal(options),
      signal: options.signal,
    }));
    const { normalized, signal } = start;
    if (signal?.aborted === true) {
      const abort = captureAbortReasonInternal(signal);
      this.fenced(() => this.releaseUnusedLease(
        normalized.hostReadbackLease,
        { error: abort },
      ));
      throw abort;
    }
    let classification: ThreeCaptureTargetClassificationV1;
    try {
      classification = this.fenced(() => classifyCaptureTargetInternal(
        target,
        this.port.presentationReadiness(target),
        this.port.currentManifest(),
      ));
      if (classification.status === 'pending' && classification.reason === 'pending') {
        const wait = this.fenced(() => this.port.awaitPresented(target, signal));
        const settled = await wait;
        classification = this.fenced(() => classifyCaptureTargetInternal(
          target,
          settled,
          this.port.currentManifest(),
        ));
      }
    } catch (error) {
      this.fenced(() => this.releaseUnusedLease(
        normalized.hostReadbackLease,
        { error },
      ));
      throw error;
    }
    if (classification.status !== 'ready') {
      this.fenced(() => this.releaseUnusedLease(normalized.hostReadbackLease));
      return classification;
    }

    const capture = this.fenced(
      () => this.captureCurrent(normalized, classification.presented),
    );
    if (capture.status === 'unavailable') {
      if (capture.reason === 'presentation-changed') {
        const latest = this.fenced(() => classifyCaptureTargetInternal(
          target,
          this.port.presentationReadiness(target),
          this.port.currentManifest(),
        ));
        if (latest.status !== 'ready') return latest;
      }
      return Object.freeze({ status: 'unavailable', reason: capture.reason, target });
    }
    return Object.freeze({
      status: 'ready',
      target,
      presentedThrough: classification.presentedThrough,
      capture,
    });
  }

  private captureCurrent(
    options: NormalizedCaptureOptionsInternal,
    expected?: ThreePresentedManifestV1,
  ): ThreeCaptureWithManifestResultV1 {
    const lifecycleReason = lifecycleUnavailable(this.port.runtimeStatus());
    if (lifecycleReason) {
      this.releaseUnusedLease(options.hostReadbackLease);
      return unavailableCapture(lifecycleReason);
    }
    const presented = this.port.currentManifest();
    if (!presented) {
      this.releaseUnusedLease(options.hostReadbackLease);
      return unavailableCapture('no-presented-frame');
    }
    if ((expected && presented !== expected) || !currentMatches(this.port, presented)) {
      this.releaseUnusedLease(options.hostReadbackLease);
      return unavailableCapture(expected ? 'presentation-changed' : 'manifest-mismatch');
    }

    if (this.port.captureOwnership === 'host' && !options.hostReadbackLease) {
      const snapshot = this.snapshotManifest(presented, options);
      return snapshot.status === 'unavailable'
        ? unavailableCapture(snapshot.reason)
        : Object.freeze({ status: 'host-capture-owned', manifest: snapshot.manifest });
    }

    try {
      capturePixelDimensionsV1Internal(presented);
    } catch (error) {
      this.releaseUnusedLease(options.hostReadbackLease, { error });
      throw error;
    }

    let readback: ThreeCaptureReadbackV1;
    if (this.port.captureOwnership === 'host') {
      try {
        readback = this.readbackWithLease(presented, options);
      } catch (error) {
        if (error instanceof ThreeCaptureLeaseCleanupError) throw error;
        const interrupted = lifecycleUnavailable(this.port.runtimeStatus());
        if (interrupted) return unavailableCapture(interrupted);
        throw error;
      }
    } else {
      if (options.hostReadbackLease) {
        this.releaseUnusedLease(options.hostReadbackLease);
        throw new ThreeCaptureProtocolError(
          'three.capture.lease-invalid',
          'A host readback lease cannot be used with runtime-owned capture.',
        );
      }
      const runtimeReadback = this.port.runtimeReadback?.bind(this.port);
      if (!runtimeReadback) {
        throw new ThreeCaptureProtocolError(
          'three.capture.runtime-readback-missing',
          'Runtime-owned capture requires an explicit readback implementation.',
        );
      }
      try {
        readback = validateCaptureReadbackInternal(
          runtimeReadback(presented, options.request),
          presented,
          options.request,
        );
      } catch (error) {
        const interrupted = lifecycleUnavailable(this.port.runtimeStatus());
        if (interrupted) return unavailableCapture(interrupted);
        throw error;
      }
    }
    const interrupted = lifecycleUnavailable(this.port.runtimeStatus());
    if (interrupted) return unavailableCapture(interrupted);
    if (!currentMatches(this.port, presented)) {
      return unavailableCapture('presentation-changed');
    }
    const snapshot = this.snapshotManifest(presented, options);
    return snapshot.status === 'unavailable'
      ? unavailableCapture(snapshot.reason)
      : Object.freeze({ status: 'captured', manifest: snapshot.manifest, readback });
  }

  private snapshotManifest(
    presented: ThreePresentedManifestV1,
    options: NormalizedCaptureOptionsInternal,
  ): CaptureManifestSnapshotInternal {
    const status = this.port.runtimeStatus();
    const unavailable = lifecycleUnavailable(status);
    if (unavailable) return { status: 'unavailable', reason: unavailable };
    const metrics = this.port.metrics();
    const resources = options.detail === 'resources'
      ? this.port.presentedResourceEntries(presented)
      : undefined;
    if (!currentMatches(this.port, presented)) {
      return { status: 'unavailable', reason: 'presentation-changed' };
    }
    if (
      metrics.presentedEpoch !== presented.epoch
      || metrics.presentedRevision !== presented.presentedRevision
    ) return { status: 'unavailable', reason: 'manifest-mismatch' };
    const manifest = createCaptureManifestInternal({
      detail: options.detail,
      presented,
      runtimeState: status.state,
      metrics,
      ...(resources === undefined ? {} : { resources }),
    });
    return currentMatches(this.port, presented)
      ? { status: 'ready', manifest }
      : { status: 'unavailable', reason: 'presentation-changed' };
  }

  private readbackWithLease(
    presented: ThreePresentedManifestV1,
    options: NormalizedCaptureOptionsInternal,
  ): ThreeCaptureReadbackV1 {
    const lease = options.hostReadbackLease!;
    const leaseMaximum = this.claimLease(lease);
    const maximumCharacters = Math.min(
      leaseMaximum,
      options.request.maxDataUrlCharacters,
    );
    const request = maximumCharacters === options.request.maxDataUrlCharacters
      ? options.request
      : Object.freeze({ ...options.request, maxDataUrlCharacters: maximumCharacters });
    let readback: ThreeCaptureReadbackV1;
    try {
      readback = validateCaptureReadbackInternal(
        lease.readback(presented, request),
        presented,
        request,
      );
    } catch (error) {
      this.releaseClaimedLease(lease, { error });
      throw error;
    }
    this.releaseClaimedLease(lease);
    return readback;
  }

  private claimLease(lease: ThreeHostCaptureReadbackLeaseV1): number {
    const leaseValue: unknown = lease;
    if (typeof leaseValue !== 'object' || leaseValue === null) {
      throw new ThreeCaptureProtocolError(
        'three.capture.lease-invalid',
        'Host capture lease must be one-shot with a valid bounded readback.',
      );
    }
    const candidate = leaseValue as Partial<ThreeHostCaptureReadbackLeaseV1>;
    if (candidate.maxReadbacks !== 1
      || typeof candidate.readback !== 'function'
      || typeof candidate.release !== 'function'
      || !Number.isSafeInteger(candidate.maxDataUrlCharacters)
      || (candidate.maxDataUrlCharacters ?? 0) <= 0
      || (candidate.maxDataUrlCharacters ?? 0) > HARD_MAX_CAPTURE_DATA_URL_CHARACTERS_V1) {
      throw new ThreeCaptureProtocolError(
        'three.capture.lease-invalid',
        'Host capture lease must be one-shot with a valid bounded readback.',
      );
    }
    if (this.consumedLeases.has(lease)) {
      throw new ThreeCaptureProtocolError(
        'three.capture.lease-used',
        'Host capture lease was already consumed or released.',
      );
    }
    this.consumedLeases.add(lease);
    return lease.maxDataUrlCharacters;
  }

  private releaseUnusedLease(
    lease: ThreeHostCaptureReadbackLeaseV1 | undefined,
    primaryFailure?: CapturePrimaryFailureInternal,
  ): void {
    if (!lease) return;
    this.claimLease(lease);
    this.releaseClaimedLease(lease, primaryFailure);
  }

  private releaseClaimedLease(
    lease: ThreeHostCaptureReadbackLeaseV1,
    primaryFailure?: CapturePrimaryFailureInternal,
  ): void {
    try {
      lease.release();
    } catch (releaseError) {
      throw new ThreeCaptureLeaseCleanupError(
        primaryFailure !== undefined,
        primaryFailure?.error,
        releaseError,
      );
    }
  }

  private fenced<Value>(operation: () => Value): Value {
    if (this.synchronousOperation) {
      throw new ThreeCaptureProtocolError(
        'three.capture.reentrant',
        'Revision-aware capture cannot be synchronously reentered.',
      );
    }
    this.synchronousOperation = true;
    try {
      return operation();
    } finally {
      this.synchronousOperation = false;
    }
  }
}
