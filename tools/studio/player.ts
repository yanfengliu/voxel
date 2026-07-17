/**
 * The playback clock for replay.
 *
 * It never reads a real clock: every method takes "now" from the caller. The
 * UI passes the browser's clock; tests pass numbers. That is what keeps replay
 * reproducible — the renderer's determinism guarantee is "same time in, same
 * frame out", and a clock the tool owns privately would be the one part of
 * playback nobody could replay.
 *
 * Position is held as a pair: the time within the period at the last change,
 * plus the real moment of that change. Reading the position folds in elapsed
 * real time times speed. Play, pause, seek, and speed changes all re-anchor,
 * so speed changes take effect from their own moment rather than rewriting
 * history.
 */

const MIN_SPEED = 0.1;
const MAX_SPEED = 8;

export class StudioPlayer {
  #periodMs: number;
  #playing = false;
  #speed = 1;
  /** Position within [0, period) at the last re-anchor. */
  #heldMs = 0;
  /** The caller's "now" at the last re-anchor; meaningful while playing. */
  #anchorNow = 0;

  constructor(periodMs: number) {
    this.#periodMs = Math.max(0, periodMs);
  }

  get playing(): boolean {
    return this.#playing;
  }

  get speed(): number {
    return this.#speed;
  }

  get periodMs(): number {
    return this.#periodMs;
  }

  /** The position within the period at the caller's "now". */
  timeAt(now: number): number {
    if (this.#periodMs <= 0) return 0;
    if (!this.#playing) return this.#heldMs;
    const advanced = this.#heldMs + (now - this.#anchorNow) * this.#speed;
    return ((advanced % this.#periodMs) + this.#periodMs) % this.#periodMs;
  }

  play(now: number): void {
    // A still model has nothing to play; pretending would divide by zero.
    if (this.#periodMs <= 0 || this.#playing) return;
    this.#playing = true;
    this.#anchorNow = now;
  }

  pause(now: number): void {
    if (!this.#playing) return;
    this.#heldMs = this.timeAt(now);
    this.#playing = false;
  }

  seek(timeMs: number, now: number): void {
    const max = this.#periodMs > 0 ? this.#periodMs - 1 : 0;
    this.#heldMs = Math.min(Math.max(0, Math.round(timeMs)), max);
    this.#anchorNow = now;
  }

  setSpeed(speed: number, now: number): void {
    if (!Number.isFinite(speed) || speed < MIN_SPEED || speed > MAX_SPEED) return;
    // Fold elapsed time in first, so the new speed applies from this moment
    // instead of retroactively stretching what already happened.
    this.#heldMs = this.timeAt(now);
    this.#anchorNow = now;
    this.#speed = speed;
  }

  /**
   * Keeps the place proportionally: halfway through stays halfway through.
   * Keeping the raw millisecond would silently jump the pose on any period
   * edit, which is exactly when the person is watching most closely.
   */
  setPeriod(periodMs: number, now: number): void {
    const next = Math.max(0, periodMs);
    const fraction = this.#periodMs > 0 ? this.timeAt(now) / this.#periodMs : 0;
    this.#periodMs = next;
    this.#anchorNow = now;
    if (next <= 0) {
      this.#heldMs = 0;
      this.#playing = false;
      return;
    }
    this.#heldMs = Math.min(Math.round(fraction * next), next - 1);
  }
}
