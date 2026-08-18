import { describe, expect, it, vi } from 'vitest';
import { OrthographicCamera, Scene, type Camera, type Vector2, type WebGLRenderTarget } from 'three';

import { ThreeRenderRuntime, type RendererLike } from '../../src/three/ThreeRenderRuntime.js';
import { MOEBIUS_RESOLVE_PRESET } from '../../src/three/stylizedResolvePass.js';

/** A renderer with only what `RendererLike` promises — no target control. */
class PlainRenderer implements RendererLike {
  private pixelRatio = 1;
  readonly domElement = {
    width: 0,
    height: 0,
    toDataURL: vi.fn(() => 'data:image/png;base64,fake'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  readonly render = vi.fn<(scene: Scene, camera: Camera) => void>();
  readonly setSize = vi.fn((width: number, height: number) => {
    this.domElement.width = width;
    this.domElement.height = height;
  });

  readonly setPixelRatio = vi.fn((value: number) => { this.pixelRatio = value; });
  readonly getPixelRatio = vi.fn(() => this.pixelRatio);
  readonly getSize = vi.fn((target: Vector2) => target.set(
    this.domElement.width,
    this.domElement.height,
  ));

  readonly dispose = vi.fn();
}

/** A renderer that can redirect its output, as Three's WebGLRenderer can. */
class TargetingRenderer extends PlainRenderer {
  readonly shadowMap = { needsUpdate: false, autoUpdate: true };
  private target: WebGLRenderTarget | null = null;

  readonly getRenderTarget = vi.fn((): WebGLRenderTarget | null => this.target);
  readonly setRenderTarget = vi.fn((target: WebGLRenderTarget | null): void => {
    this.target = target;
  });
}

const FRAME = { nowMs: 0, deltaMs: 0, frameIndex: 0 };

describe('ThreeRenderRuntime stylizedResolve', () => {
  it('draws straight to the canvas when the option is omitted', () => {
    // Omission has to cost nothing: one render call, no pass, no targets.
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    runtime.frame(FRAME);

    expect(runtime.stylizedResolve).toBeNull();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.setRenderTarget).not.toHaveBeenCalled();

    runtime.dispose();
  });

  it('resolves the frame through the pass when the option is supplied', () => {
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    });

    runtime.frame(FRAME);

    expect(runtime.stylizedResolve).not.toBeNull();
    // Colour, normals, resolve.
    expect(renderer.render).toHaveBeenCalledTimes(3);

    runtime.dispose();
  });

  it('refuses a renderer that cannot redirect its output, and says what would', () => {
    const renderer = new PlainRenderer();

    let thrown: unknown;
    try {
      new ThreeRenderRuntime({
        renderer,
        rendererOwnership: 'borrowed',
        width: 320,
        height: 200,
        stylizedResolve: MOEBIUS_RESOLVE_PRESET,
      });
    } catch (error) {
      thrown = error;
    }

    // Named input, named cause, named remedy — not a bare failure.
    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toContain('stylizedResolve');
    expect(message).toContain('setRenderTarget');
    expect(message).toContain('WebGLRenderer');
  });

  it('sizes the pass in device pixels, at construction and across a resize', () => {
    // A target sized in CSS pixels resamples the frame on a high-DPI display
    // and softens every contour the pass exists to draw.
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      pixelRatio: 2,
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    });

    const texel = () => runtime.stylizedResolve?.uniforms.uTexel?.value as Vector2;

    expect(texel().x).toBeCloseTo(1 / 640, 9);
    expect(texel().y).toBeCloseTo(1 / 400, 9);

    runtime.resize(400, 300, 1);

    expect(texel().x).toBeCloseTo(1 / 400, 9);
    expect(texel().y).toBeCloseTo(1 / 300, 9);

    runtime.dispose();
  });

  it('switches the look live, in both directions, without rebuilding the scene', () => {
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    expect(runtime.stylizedResolve).toBeNull();

    runtime.setStylizedResolve(MOEBIUS_RESOLVE_PRESET);
    expect(runtime.stylizedResolve).not.toBeNull();
    renderer.render.mockClear();
    runtime.frame(FRAME);
    expect(renderer.render).toHaveBeenCalledTimes(3);

    runtime.setStylizedResolve(null);
    expect(runtime.stylizedResolve).toBeNull();
    renderer.render.mockClear();
    runtime.frame(FRAME);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    runtime.dispose();
  });

  it('keeps the current look on screen when a swap is refused', () => {
    // Building the replacement before releasing the incumbent is what makes a
    // refused swap a no-op rather than a torn-down frame plus an error.
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    });

    const before = runtime.stylizedResolve;
    const capability = renderer.setRenderTarget;

    // Drive the refusal through the renderer capability check: every option
    // value the pass accepts is floored rather than rejected.
    Object.defineProperty(renderer, 'setRenderTarget', { value: undefined, configurable: true });

    expect(() => runtime.setStylizedResolve(MOEBIUS_RESOLVE_PRESET)).toThrow(/setRenderTarget/);
    expect(runtime.stylizedResolve).toBe(before);

    // Identity alone cannot tell "incumbent alive" from "incumbent disposed",
    // and disposed is exactly what a release-then-build order leaves behind.
    // Restore the capability and prove the old pass still draws.
    Object.defineProperty(renderer, 'setRenderTarget', { value: capability, configurable: true });
    renderer.render.mockClear();

    expect(() => runtime.frame(FRAME)).not.toThrow();
    expect(renderer.render).toHaveBeenCalledTimes(3);

    runtime.dispose();
  });

  it('refuses the option on an embedded host instead of building an inert pass', () => {
    // An embedded host draws its own frames, so nothing it renders passes
    // through this runtime's seam. Accepting silently would hand back a live
    // pass object that never touches a pixel.
    const renderer = new TargetingRenderer();

    expect(() => new ThreeRenderRuntime({
      host: {
        kind: 'embedded',
        renderer,
        scene: new Scene(),
        camera: new OrthographicCamera(-1, 1, 1, -1, 0.5, 100.5),
        drawOwnership: 'host',
        viewportOwnership: 'host',
        captureOwnership: 'host',
      },
      width: 320,
      height: 200,
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    })).toThrow(/embedded host/);
  });

  it('refuses a perspective view rather than degrading the contour silently', () => {
    // Perspective depth is hyperbolic, so the same world step reads as a
    // vanishing difference at distance and the contour thins out and stops.
    const renderer = new TargetingRenderer();

    expect(() => new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      view: {
        kind: 'perspective',
        position: { x: 8, y: 6, z: 10 },
        target: { x: 0, y: 0, z: 0 },
        verticalFovDegrees: 50,
        near: 0.1,
        far: 2_000,
      },
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    })).toThrow(/orthographic/);
  });

  it('refuses a swap after dispose', () => {
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
    });

    runtime.dispose();

    expect(() => runtime.setStylizedResolve(MOEBIUS_RESOLVE_PRESET)).toThrow();
  });

  it('releases the pass on dispose', () => {
    const renderer = new TargetingRenderer();
    const runtime = new ThreeRenderRuntime({
      renderer,
      rendererOwnership: 'borrowed',
      width: 320,
      height: 200,
      stylizedResolve: MOEBIUS_RESOLVE_PRESET,
    });

    const pass = runtime.stylizedResolve;
    expect(pass).not.toBeNull();

    runtime.dispose();

    expect(runtime.stylizedResolve).toBeNull();
    // A disposed pass has released its targets and must refuse further work
    // rather than draw through them.
    expect(() => pass?.render(renderer as never, {} as Scene, {} as Camera))
      .toThrow(/after dispose/);
  });
});
