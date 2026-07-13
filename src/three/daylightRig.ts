import {
  DirectionalLight,
  Group,
  HemisphereLight,
  Object3D,
  type Scene,
} from 'three';

import type { IsometricViewCenter } from './orthographicView.js';

export interface ThreeDaylightOptions {
  /** Packed sRGB sky-fill color, from 0x000000 through 0xffffff. */
  readonly skyColor?: number;
  /** Packed sRGB ground-bounce color, from 0x000000 through 0xffffff. */
  readonly groundColor?: number;
  readonly fillIntensity?: number;
  /** Packed sRGB directional-key color, from 0x000000 through 0xffffff. */
  readonly sunColor?: number;
  readonly sunIntensity?: number;
  /** World-space directional-light position relative to the current view centre. */
  readonly sunOffset?: IsometricViewCenter;
}

interface ResolvedDaylightOptions {
  readonly skyColor: number;
  readonly groundColor: number;
  readonly fillIntensity: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly sunOffset: IsometricViewCenter;
}

const DEFAULT_DAYLIGHT: ResolvedDaylightOptions = {
  skyColor: 0xdcecff,
  groundColor: 0x4b3928,
  fillIntensity: 1.25,
  sunColor: 0xffedc2,
  sunIntensity: 2.35,
  sunOffset: { x: -24, y: 38, z: -18 },
};

function requireColor(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new RangeError(`${name} must be an integer from 0x000000 to 0xffffff.`);
  }
  return value;
}

function requireIntensity(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
  return value;
}

function requireOffset(value: IsometricViewCenter): IsometricViewCenter {
  if (![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new RangeError('sunOffset coordinates must be finite.');
  }
  if (value.x === 0 && value.y === 0 && value.z === 0) {
    throw new RangeError('sunOffset must not be the zero vector.');
  }
  return { ...value };
}

export function resolveDaylightOptions(
  options: ThreeDaylightOptions = {},
): ResolvedDaylightOptions {
  return {
    skyColor: requireColor('skyColor', options.skyColor ?? DEFAULT_DAYLIGHT.skyColor),
    groundColor: requireColor('groundColor', options.groundColor ?? DEFAULT_DAYLIGHT.groundColor),
    fillIntensity: requireIntensity(
      'fillIntensity',
      options.fillIntensity ?? DEFAULT_DAYLIGHT.fillIntensity,
    ),
    sunColor: requireColor('sunColor', options.sunColor ?? DEFAULT_DAYLIGHT.sunColor),
    sunIntensity: requireIntensity(
      'sunIntensity',
      options.sunIntensity ?? DEFAULT_DAYLIGHT.sunIntensity,
    ),
    sunOffset: requireOffset(options.sunOffset ?? DEFAULT_DAYLIGHT.sunOffset),
  };
}

export class DaylightRig {
  readonly root = new Group();
  private readonly sun: DirectionalLight;
  private readonly target = new Object3D();
  private readonly sunOffset: IsometricViewCenter;
  private disposed = false;

  constructor(options: ResolvedDaylightOptions, center: IsometricViewCenter) {
    this.root.name = 'voxel-daylight';
    const fill = new HemisphereLight(
      options.skyColor,
      options.groundColor,
      options.fillIntensity,
    );
    fill.name = 'voxel-daylight-fill';
    this.sun = new DirectionalLight(options.sunColor, options.sunIntensity);
    this.sun.name = 'voxel-daylight-sun';
    this.target.name = 'voxel-daylight-target';
    this.sun.target = this.target;
    this.sunOffset = { ...options.sunOffset };
    this.root.add(fill, this.sun, this.target);
    this.setCenter(center);
  }

  setCenter(center: IsometricViewCenter): void {
    if (this.disposed) throw new Error('DaylightRig is disposed.');
    this.target.position.set(center.x, center.y, center.z);
    this.sun.position.set(
      center.x + this.sunOffset.x,
      center.y + this.sunOffset.y,
      center.z + this.sunOffset.z,
    );
    this.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  dispose(scene: Scene): void {
    if (this.disposed) return;
    this.disposed = true;
    scene.remove(this.root);
    this.root.clear();
  }
}
