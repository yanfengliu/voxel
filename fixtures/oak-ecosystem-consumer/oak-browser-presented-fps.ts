const FPS_WINDOW_MS = 1_000;
const FPS_WARMUP_MS = 500;
const FPS_PUBLISH_INTERVAL_MS = 250;
const MAX_RETAINED_FRAME_TIMESTAMPS = 2_048;

export interface OakBrowserPresentedFpsUpdateV1 {
  readonly framesPerSecond: number | null;
  readonly published: boolean;
}

export interface OakBrowserPresentedFpsSamplerV1 {
  recordAnimationFrame(
    timestampMs: number,
    presented: boolean,
  ): OakBrowserPresentedFpsUpdateV1;
  reset(): void;
  value(): number | null;
}

interface OakBrowserFrameObservationV1 {
  readonly timestampMs: number;
  readonly presented: boolean;
}

/** Counts successful RAF-driven canvas presentations, never fixed simulation ticks. */
export function createOakBrowserPresentedFpsSamplerV1(): OakBrowserPresentedFpsSamplerV1 {
  const observations: OakBrowserFrameObservationV1[] = [];
  let publishedFramesPerSecond: number | null = null;
  let lastPublishedTimestampMs: number | null = null;

  const reset = (): void => {
    observations.length = 0;
    publishedFramesPerSecond = null;
    lastPublishedTimestampMs = null;
  };

  return {
    recordAnimationFrame(timestampMs, presented) {
      if (!Number.isFinite(timestampMs)) {
        return { framesPerSecond: publishedFramesPerSecond, published: false };
      }
      const priorTimestampMs = observations.at(-1)?.timestampMs;
      if (priorTimestampMs !== undefined && timestampMs <= priorTimestampMs) {
        if (timestampMs < priorTimestampMs) {
          reset();
          observations.push({ timestampMs, presented });
          return { framesPerSecond: null, published: true };
        }
        return { framesPerSecond: publishedFramesPerSecond, published: false };
      }

      observations.push({ timestampMs, presented });
      const cutoffMs = timestampMs - FPS_WINDOW_MS;
      // Retain the interval crossing the window boundary so a visible stall is not erased.
      while (observations.length > 2 && (observations[1]?.timestampMs ?? timestampMs) < cutoffMs) {
        observations.shift();
      }
      while (observations.length > MAX_RETAINED_FRAME_TIMESTAMPS) observations.shift();

      const firstTimestampMs = observations[0]?.timestampMs ?? timestampMs;
      const elapsedMs = timestampMs - firstTimestampMs;
      if (elapsedMs < FPS_WARMUP_MS || observations.length < 2) {
        return { framesPerSecond: publishedFramesPerSecond, published: false };
      }
      if (
        lastPublishedTimestampMs !== null
        && timestampMs - lastPublishedTimestampMs < FPS_PUBLISH_INTERVAL_MS
      ) {
        return { framesPerSecond: publishedFramesPerSecond, published: false };
      }

      const presentedFrames = observations.slice(1).reduce(
        (count, observation) => count + Number(observation.presented),
        0,
      );
      publishedFramesPerSecond = presentedFrames * 1_000 / elapsedMs;
      lastPublishedTimestampMs = timestampMs;
      return { framesPerSecond: publishedFramesPerSecond, published: true };
    },
    reset,
    value: () => publishedFramesPerSecond,
  };
}

export interface OakBrowserPresentedFpsReadoutV1 {
  recordAnimationFrame(timestampMs: number, presented: boolean): void;
  reset(): void;
  dispose(): void;
  value(): number | null;
}

/** Binds the pure sampler to the volatile HUD readout and tab-visibility lifecycle. */
export function mountOakBrowserPresentedFpsReadoutV1(
  node: Pick<HTMLElement, 'textContent'>,
  visibilityOwner: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>,
): OakBrowserPresentedFpsReadoutV1 {
  const sampler = createOakBrowserPresentedFpsSamplerV1();
  let disposed = false;
  const showWarmup = (): void => { node.textContent = 'measuring…'; };
  const reset = (): void => {
    sampler.reset();
    showWarmup();
  };
  const visibilityChanged = (): void => { reset(); };
  visibilityOwner.addEventListener('visibilitychange', visibilityChanged);
  showWarmup();

  return {
    recordAnimationFrame(timestampMs, presented) {
      if (disposed) return;
      if (visibilityOwner.hidden) {
        reset();
        return;
      }
      const update = sampler.recordAnimationFrame(timestampMs, presented);
      if (update.published) {
        node.textContent = update.framesPerSecond === null
          ? 'measuring…'
          : `${update.framesPerSecond.toFixed(1)} FPS`;
      }
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      visibilityOwner.removeEventListener('visibilitychange', visibilityChanged);
    },
    value: () => sampler.value(),
  };
}

/** Keeps manual frames out and converts an RAF runtime result into one sampler observation. */
export function recordOakBrowserRafPresentationV1(
  readout: Pick<OakBrowserPresentedFpsReadoutV1, 'recordAnimationFrame'>,
  rafTimestampMs: number | undefined,
  presentedManifest: unknown | undefined,
): void {
  if (rafTimestampMs === undefined) return;
  readout.recordAnimationFrame(rafTimestampMs, presentedManifest !== undefined);
}
