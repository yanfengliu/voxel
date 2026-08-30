import { OAK_HOST_TIMESTEP_SECONDS_V1 } from './oak-parameters.js';

export const OAK_BROWSER_FIXED_FRAME_MS_V1 = OAK_HOST_TIMESTEP_SECONDS_V1 * 1_000;
export const OAK_BROWSER_MAX_CATCH_UP_TICKS_V1 = 8;

export interface OakBrowserRuntimeFrameV1 {
  readonly nowMs: number;
  readonly deltaMs: number;
  readonly frameIndex: number;
}

export interface OakBrowserAnimationFrameSampleV1 {
  readonly hostTicks: number;
  readonly frame: OakBrowserRuntimeFrameV1;
}

export interface OakBrowserFrameClockV1 {
  animationFrame(timestampMs: number, running: boolean): OakBrowserAnimationFrameSampleV1;
  discardAnimationElapsed(): void;
  manualFrame(): OakBrowserRuntimeFrameV1;
}

/**
 * Converts display-frequency callbacks into the fixture's fixed 60 Hz host
 * ticks. A long foreground gap catches up only to the declared bound; paused
 * time is discarded so resume never fast-forwards biology.
 */
export function createOakBrowserFrameClockV1(): OakBrowserFrameClockV1 {
  let previousAnimationTimestampMs: number | null = null;
  let lastRuntimeNowMs = 0;
  let accumulatedMs = 0;
  let frameIndex = 0;

  const nextFrame = (nowMs: number, deltaMs: number): OakBrowserRuntimeFrameV1 => {
    const frame = { nowMs, deltaMs, frameIndex };
    frameIndex += 1;
    lastRuntimeNowMs = nowMs;
    return frame;
  };

  return {
    animationFrame: (timestampMs, running) => {
      if (!Number.isFinite(timestampMs) || timestampMs < 0) {
        throw new Error(
          `Oak animation frame timestamp must be finite and nonnegative; received ${String(timestampMs)}.`,
        );
      }
      const elapsedMs = previousAnimationTimestampMs === null
        ? 0
        : Math.max(0, timestampMs - previousAnimationTimestampMs);
      previousAnimationTimestampMs = timestampMs;
      if (!running) accumulatedMs = 0;
      else {
        const maximumCatchUpMs = OAK_BROWSER_FIXED_FRAME_MS_V1
          * OAK_BROWSER_MAX_CATCH_UP_TICKS_V1;
        accumulatedMs = Math.min(maximumCatchUpMs, accumulatedMs + elapsedMs);
      }
      const epsilonMs = OAK_BROWSER_FIXED_FRAME_MS_V1 * 1e-9;
      const hostTicks = running
        ? Math.min(
          OAK_BROWSER_MAX_CATCH_UP_TICKS_V1,
          Math.floor((accumulatedMs + epsilonMs) / OAK_BROWSER_FIXED_FRAME_MS_V1),
        )
        : 0;
      accumulatedMs = Math.max(
        0,
        accumulatedMs - hostTicks * OAK_BROWSER_FIXED_FRAME_MS_V1,
      );
      return {
        hostTicks,
        frame: nextFrame(timestampMs, elapsedMs),
      };
    },
    discardAnimationElapsed: () => {
      previousAnimationTimestampMs = null;
      accumulatedMs = 0;
    },
    // Manual presentation does not invent elapsed real time or feed the live
    // accumulator; the explicit harness advances simulation ticks itself.
    manualFrame: () => nextFrame(lastRuntimeNowMs, 0),
  };
}
