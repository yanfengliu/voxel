import { Color, Scene, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';

import { createOakBrowserLightingV1 } from './oak-browser-lighting.js';

/** Bounded lifecycle proof for the private rig; no GPU or visual claim. */
describe('oak inspection lighting ownership', () => {
  it('restores its background and removes owned scene children across repeated disposal', () => {
    const scene = new Scene();
    const prior = new Color(0x123456);
    scene.background = prior;
    const renderer = { shadowMap: { enabled: false } } as unknown as WebGLRenderer;
    const rig = createOakBrowserLightingV1(scene, renderer);
    expect(scene.background).not.toBe(prior);
    expect(scene.children).toHaveLength(4);
    rig.dispose();
    rig.dispose();
    expect(scene.background).toBe(prior);
    expect(scene.children).toHaveLength(0);
  });

  it('preserves a later host background replacement when disposed', () => {
    const scene = new Scene();
    const renderer = { shadowMap: { enabled: false } } as unknown as WebGLRenderer;
    const rig = createOakBrowserLightingV1(scene, renderer);
    const replacement = new Color(0x456789);
    scene.background = replacement;
    rig.dispose();
    expect(scene.background).toBe(replacement);
  });
});
