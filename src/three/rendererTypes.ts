import type { Camera, Scene, Vector2, WebGLRendererParameters } from 'three';

export interface CaptureCanvasLike {
  width: number;
  height: number;
  toDataURL?: (type?: string, quality?: number) => string;
}

export interface RendererInfoLike {
  readonly render: {
    readonly calls: number;
    readonly triangles: number;
    readonly points: number;
    readonly lines: number;
  };
  readonly memory: {
    readonly geometries: number;
    readonly textures: number;
  };
}

export interface RendererLike {
  readonly domElement: CaptureCanvasLike;
  readonly info?: RendererInfoLike;
  render(scene: Scene, camera: Camera): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setPixelRatio(value: number): void;
  /** Required when a borrowed renderer grants runtime viewport ownership. */
  getSize(target: Vector2): Vector2;
  /** Required when a borrowed renderer grants runtime viewport ownership. */
  getPixelRatio(): number;
  /**
   * The colour space this renderer writes to its drawing buffer.
   *
   * Optional so existing custom adapters keep compiling, and read only when
   * present. Three's `WebGLRenderer` sets it, so a borrowed real renderer
   * always supplies it. `docs/design/spec.md` promises captures encode sRGB,
   * and nothing checked: a host renderer configured for linear output
   * produced a capture that satisfied every MIME and dimension check while
   * its colours were wrong. Capture refuses a non-sRGB renderer now rather
   * than publishing pixels under a promise it cannot keep.
   */
  readonly outputColorSpace?: string;
  dispose(): void;
}

export type RendererFactory = (parameters: WebGLRendererParameters) => RendererLike;
