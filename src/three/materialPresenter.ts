import {
  Color,
  DoubleSide,
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';

import type { MaterialPresentation } from './presentationTypes.js';

interface MaterialEntry {
  readonly version: string;
  readonly material: Material;
}

function createMaterial(resource: MaterialPresentation): Material {
  const color = new Color().setRGB(
    resource.color.r / 255,
    resource.color.g / 255,
    resource.color.b / 255,
    SRGBColorSpace,
  );
  const opacity = resource.opacity * (resource.color.a / 255);
  const parameters = {
    color,
    opacity,
    transparent: resource.transparent || opacity < 1,
    vertexColors: resource.vertexColors,
    side: resource.doubleSided ? DoubleSide : FrontSide,
  };
  if (resource.shading === 'standard') {
    return new MeshStandardMaterial({
      ...parameters,
      roughness: resource.roughness,
      metalness: resource.metalness,
    });
  }
  return resource.shading === 'lambert'
    ? new MeshLambertMaterial(parameters)
    : new MeshBasicMaterial(parameters);
}

export class MaterialPresenter {
  private readonly entries = new Map<string, MaterialEntry>();
  private disposed = false;

  get count(): number {
    return this.entries.size;
  }

  get(key: string): Material | undefined {
    return this.entries.get(key)?.material;
  }

  reconcile(resources: readonly MaterialPresentation[]): void {
    this.assertActive();
    const incoming = new Set<string>();
    for (const resource of resources) {
      if (incoming.has(resource.key)) {
        throw new Error(`Duplicate material presentation key: ${resource.key}`);
      }
      incoming.add(resource.key);
      const existing = this.entries.get(resource.key);
      if (existing?.version === resource.version) continue;
      const material = createMaterial(resource);
      this.entries.set(resource.key, { version: resource.version, material });
      existing?.material.dispose();
    }

    for (const [key, entry] of this.entries) {
      if (incoming.has(key)) continue;
      entry.material.dispose();
      this.entries.delete(key);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.resetInternal();
    this.disposed = true;
  }

  /** Package-internal rollback hook; the presenter remains reusable. */
  resetInternal(): void {
    this.assertActive();
    for (const entry of this.entries.values()) entry.material.dispose();
    this.entries.clear();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('MaterialPresenter is disposed.');
  }
}
