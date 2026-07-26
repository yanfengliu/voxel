import type { StudioPlayer } from './player.js';

export interface SceneAnimationSyncV1 {
  readonly hasMotion: boolean;
  readonly previousHasMotion: boolean | null;
  readonly periodMs: number;
  readonly lastShownMs: number;
  applyPeriod(periodMs: number): void;
}

/**
 * Owns the one scene clock shared by animated placements and moving lights.
 * Lighting never enters this state machine: it changes illumination only.
 */
export class StudioSceneAnimationTransport {
  readonly #player: StudioPlayer;
  readonly #now: () => number;
  #enabled: boolean;
  #manual = false;
  #openedAtMs = 0;

  constructor(player: StudioPlayer, enabled: boolean, now: () => number) {
    this.#player = player;
    this.#enabled = enabled;
    this.#now = now;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /** Changes the persisted movement choice and immediately applies it to an animated scene. */
  setEnabled(on: boolean, lastShownMs: number, hasMotion: boolean): boolean {
    this.#enabled = on;
    if (hasMotion) this.#applyEnabledInternal(on, lastShownMs);
    return this.#enabled;
  }

  /**
   * Exact-time evidence freezes automatic motion at the frame that is actually
   * presented without changing the persisted choice.
   */
  freezeExact(presentedTimeMs: number): void {
    const now = this.#now();
    this.#player.pause(now);
    this.#player.seek(this.#phaseInternal(presentedTimeMs), now);
    this.#manual = true;
  }

  /**
   * A failed frame pauses at the last successful presentation; the next
   * explicit Play is still a valid retry.
   */
  pauseAfterFailure(lastShownMs: number): void {
    this.freezeExact(lastShownMs);
  }

  /** Re-anchors a live scene clock after the shared speed changes. */
  speedChanged(lastShownMs: number): void {
    if (!this.#manual) {
      this.#openedAtMs = this.#now() - lastShownMs / Math.max(this.#player.speed, 0.1);
    }
  }

  /** Keeps period, play state, and phase truthful when a scene opens or its motion changes. */
  sync(request: SceneAnimationSyncV1): void {
    const now = this.#now();
    const previousPlaying = this.#player.playing;
    const previousManual = this.#manual;
    request.applyPeriod(request.periodMs);
    const phaseMs = this.#phaseInternal(request.lastShownMs);

    if (!request.hasMotion) {
      this.#player.pause(now);
      this.#manual = true;
      return;
    }

    if (!request.previousHasMotion) {
      const startMs = request.previousHasMotion === null ? 0 : request.lastShownMs;
      this.#player.pause(now);
      this.#player.seek(request.previousHasMotion === null ? 0 : phaseMs, now);
      if (this.#enabled) this.#player.play(now);
      this.#openedAtMs = now - startMs / Math.max(this.#player.speed, 0.1);
      this.#manual = !this.#enabled;
      return;
    }

    this.#player.pause(now);
    this.#player.seek(phaseMs, now);
    this.#manual = this.#enabled ? previousManual : true;
    if (this.#enabled && previousPlaying) this.#player.play(now);
    if (this.#enabled && !previousManual) {
      this.#openedAtMs = now - request.lastShownMs / Math.max(this.#player.speed, 0.1);
    }
  }

  shouldAdvance(hasMotion: boolean): boolean {
    return this.#enabled && !this.#manual && hasMotion;
  }

  timeAt(frameNowMs: number): number {
    return Math.max(0, (frameNowMs - this.#openedAtMs) * this.#player.speed);
  }

  #applyEnabledInternal(on: boolean, lastShownMs: number): void {
    const now = this.#now();
    this.#player.pause(now);
    this.#player.seek(this.#phaseInternal(lastShownMs), now);
    if (on) {
      this.#player.play(now);
      this.#openedAtMs = now - lastShownMs / Math.max(this.#player.speed, 0.1);
    }
    this.#manual = !on;
  }

  #phaseInternal(lastShownMs: number): number {
    const periodMs = this.#player.periodMs;
    return periodMs > 0
      ? ((lastShownMs % periodMs) + periodMs) % periodMs
      : 0;
  }
}
