import { describe, expect, it } from 'vitest';

import { StudioPlayer } from './player.js';
import { StudioSceneAnimationTransport } from './studio-scene-animation-transport.js';

function fixture(enabled = true): {
  readonly player: StudioPlayer;
  readonly transport: StudioSceneAnimationTransport;
  readonly setNow: (value: number) => void;
} {
  let now = 0;
  const player = new StudioPlayer(0);
  return {
    player,
    transport: new StudioSceneAnimationTransport(player, enabled, () => now),
    setNow: (value) => { now = value; },
  };
}

describe('StudioSceneAnimationTransport', () => {
  it('starts moving scenes according to the persisted choice', () => {
    const on = fixture(true);
    on.transport.sync({
      hasMotion: true,
      previousHasMotion: null,
      periodMs: 1_800,
      lastShownMs: 0,
      playback: 'loop',
      applyPeriod: (periodMs) => { on.player.setPeriod(periodMs, 0); },
    });
    expect(on.player.playing).toBe(true);
    expect(on.transport.shouldAdvance(true)).toBe(true);

    const off = fixture(false);
    off.transport.sync({
      hasMotion: true,
      previousHasMotion: null,
      periodMs: 1_800,
      lastShownMs: 0,
      playback: 'loop',
      applyPeriod: (periodMs) => { off.player.setPeriod(periodMs, 0); },
    });
    expect(off.player.playing).toBe(false);
    expect(off.transport.shouldAdvance(true)).toBe(false);
  });

  it('wraps the presented phase when movement is disabled and resumed', () => {
    const { player, transport, setNow } = fixture(true);
    player.setPeriod(1_800, 0);
    setNow(10);
    transport.setEnabled(false, 5_000, true);
    expect(player.timeAt(10)).toBe(1_400);
    expect(player.playing).toBe(false);

    setNow(20);
    transport.setEnabled(true, 5_000, true);
    expect(player.timeAt(20)).toBe(1_400);
    expect(player.playing).toBe(true);
    expect(transport.timeAt(20)).toBe(5_000);
  });

  it('freezes exact draws and failed frames without rewriting the preference', () => {
    const { player, transport, setNow } = fixture(true);
    player.setPeriod(1_000, 0);
    player.play(0);
    setNow(100);
    transport.freezeExact(350);
    expect(player.playing).toBe(false);
    expect(player.timeAt(100)).toBe(350);
    expect(transport.enabled).toBe(true);
    expect(transport.shouldAdvance(true)).toBe(false);

    transport.setEnabled(true, 350, true);
    setNow(120);
    transport.pauseAfterFailure(350);
    expect(player.playing).toBe(false);
    expect(player.timeAt(120)).toBe(350);
    expect(transport.enabled).toBe(true);
  });

  it('preserves a manual pause through edits that retain motion', () => {
    const { player, transport, setNow } = fixture(true);
    transport.sync({
      hasMotion: true,
      previousHasMotion: null,
      periodMs: 1_000,
      lastShownMs: 0,
      playback: 'loop',
      applyPeriod: (periodMs) => { player.setPeriod(periodMs, 0); },
    });
    setNow(250);
    transport.freezeExact(250);
    transport.sync({
      hasMotion: true,
      previousHasMotion: true,
      periodMs: 1_800,
      lastShownMs: 250,
      playback: 'loop',
      applyPeriod: (periodMs) => { player.setPeriod(periodMs, 250); },
    });
    expect(player.playing).toBe(false);
    expect(transport.shouldAdvance(true)).toBe(false);
  });

  it('holds a finite replay at its end and restarts only on explicit enable', () => {
    const { player, transport, setNow } = fixture(true);
    transport.sync({
      hasMotion: true,
      previousHasMotion: null,
      periodMs: 1_000,
      lastShownMs: 0,
      playback: 'once',
      applyPeriod: (periodMs) => { player.setPeriod(periodMs, 0); },
    });
    setNow(1_250);
    expect(transport.timeAt(1_250)).toBe(1_000);
    expect(transport.finishAtEnd(1_000)).toBe(true);
    expect(player.playing).toBe(false);
    expect(player.timeAt(1_250)).toBe(1_000);
    expect(transport.shouldAdvance(true)).toBe(false);

    setNow(2_000);
    transport.setEnabled(true, 1_000, true);
    expect(player.playing).toBe(true);
    expect(player.timeAt(2_000)).toBe(0);
    expect(transport.timeAt(2_000)).toBe(0);
  });
});
