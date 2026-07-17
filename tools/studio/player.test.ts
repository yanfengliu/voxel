import { describe, expect, it } from 'vitest';

import { StudioPlayer } from './player.js';

/**
 * The playback clock never reads a real clock: every method takes "now" as an
 * argument. That is what keeps replay reproducible — the same calls with the
 * same nows land on the same frame, which is the property the sweep guards
 * certify for the renderer and playback must not break.
 */
describe('studio player', () => {
  it('stays at the start until told to play', () => {
    const player = new StudioPlayer(1000);
    expect(player.playing).toBe(false);
    expect(player.timeAt(5_000)).toBe(0);
  });

  it('advances with real elapsed time while playing', () => {
    const player = new StudioPlayer(1000);
    player.play(10_000);
    expect(player.timeAt(10_250)).toBe(250);
    expect(player.timeAt(10_900)).toBe(900);
  });

  it('loops the period instead of running past it', () => {
    const player = new StudioPlayer(1000);
    player.play(0);
    expect(player.timeAt(1_250)).toBe(250);
    expect(player.timeAt(7_100)).toBe(100);
  });

  it('freezes where it was paused and resumes from there', () => {
    const player = new StudioPlayer(1000);
    player.play(0);
    player.pause(400);
    expect(player.playing).toBe(false);
    expect(player.timeAt(9_999)).toBe(400);
    player.play(20_000);
    expect(player.timeAt(20_100)).toBe(500);
  });

  it('scales elapsed time by the speed, from the moment speed changes', () => {
    const player = new StudioPlayer(1000);
    player.play(0);
    player.setSpeed(2, 300); // 300 in, then twice as fast
    expect(player.timeAt(400)).toBe(500);
    player.setSpeed(0.5, 400); // 500 in, then half speed
    expect(player.timeAt(1_000)).toBe(800);
  });

  it('seeks to an exact moment, playing or not', () => {
    const player = new StudioPlayer(1000);
    player.seek(750, 0);
    expect(player.timeAt(0)).toBe(750);
    player.play(100);
    player.seek(0, 200);
    expect(player.timeAt(450)).toBe(250);
  });

  it('clamps a seek into the period', () => {
    const player = new StudioPlayer(1000);
    player.seek(-50, 0);
    expect(player.timeAt(0)).toBe(0);
    player.seek(4_000, 0);
    expect(player.timeAt(0)).toBe(999);
  });

  it('refuses to play a still model', () => {
    // Period zero means the model is one frame; playing would divide by zero
    // and pretend there is motion to watch.
    const player = new StudioPlayer(0);
    player.play(0);
    expect(player.playing).toBe(false);
    expect(player.timeAt(1_000)).toBe(0);
  });

  it('keeps its place proportionally when the period changes', () => {
    // Halfway through a 1s cycle is halfway through a 2s cycle after the
    // change. Keeping the raw millisecond would silently jump the pose.
    const player = new StudioPlayer(1000);
    player.seek(500, 0);
    player.setPeriod(2000, 0);
    expect(player.timeAt(0)).toBe(1000);
    player.setPeriod(0, 0);
    expect(player.timeAt(0)).toBe(0);
    expect(player.playing).toBe(false);
  });

  it('ignores nonsense speeds instead of running away', () => {
    const player = new StudioPlayer(1000);
    player.play(0);
    player.setSpeed(0, 100);
    player.setSpeed(-3, 100);
    player.setSpeed(Number.NaN, 100);
    expect(player.speed).toBe(1);
    expect(player.timeAt(200)).toBe(200);
  });
});
