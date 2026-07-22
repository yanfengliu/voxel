import { describe, expect, it } from 'vitest';

import {
  MAX_PHYSICAL_BODIES,
  MAX_PHYSICAL_COLLIDERS,
  MAX_PHYSICAL_CONSTRAINTS,
  MAX_PHYSICAL_PORTS,
  MAX_PHYSICAL_POSE_POSITION,
  MAX_PHYSICAL_SHAPE_DIMENSION,
  STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
  validatePhysicalAssetV1,
  type PhysicalAssetV1,
} from './physical-asset.js';

/** A small cabinet with a sliding drawer: two bodies, a compound solid,
 * a limited prismatic joint, a sensor, and a port — every feature once. */
function createCabinetAsset(): PhysicalAssetV1 {
  return {
    schemaVersion: STUDIO_PHYSICAL_ASSET_SCHEMA_V1,
    recipeId: 'test:cabinet',
    bodies: [
      { key: 'cabinet', type: 'fixed', pose: { position: [2.5, 3, 3.5] } },
      {
        key: 'drawer',
        type: 'dynamic',
        pose: { position: [2.5, 4.5, 1] },
        mass: 2,
        linearDamping: 0.1,
        angularDamping: 0.2,
        gravityScale: 1,
        continuous: true,
      },
    ],
    colliders: [
      {
        body: 'cabinet',
        shape: { kind: 'box', halfExtents: [2.5, 3, 2.5] },
        pose: { position: [0, 0, 0] },
        density: 0.6,
        friction: 0.8,
        restitution: 0.1,
      },
      {
        body: 'drawer',
        shape: { kind: 'box', halfExtents: [2, 0.5, 1] },
        pose: { position: [0, 0, 0] },
      },
      {
        body: 'cabinet',
        shape: { kind: 'sphere', radius: 4 },
        pose: { position: [0, 3, 0] },
        role: 'sensor',
      },
    ],
    constraints: [
      {
        key: 'slide',
        kind: 'prismatic',
        bodyA: 'cabinet',
        bodyB: 'drawer',
        anchorA: { position: [0, 1.5, -2.5] },
        anchorB: { position: [0, 0, 0] },
        axis: [0, 0, -1],
        limits: [0, 4],
        motor: { targetVelocity: 0, maxForce: 10 },
        breakForce: 500,
      },
    ],
    ports: [
      { key: 'top', body: 'cabinet', frame: { position: [0, 3, 0] } },
    ],
  };
}

/** Rebuilds the valid asset with one edit, keeping the edit visible. */
function edited(change: (asset: {
  schemaVersion: unknown;
  recipeId: unknown;
  bodies: Record<string, unknown>[];
  colliders: Record<string, unknown>[];
  constraints: Record<string, unknown>[];
  ports: Record<string, unknown>[];
}) => void): unknown {
  const asset = structuredClone(createCabinetAsset()) as unknown as Parameters<typeof change>[0];
  change(asset);
  return asset;
}

function paths(value: unknown): string[] {
  return validatePhysicalAssetV1(value).map((issue) => issue.path);
}

describe('validatePhysicalAssetV1', () => {
  it('accepts the full-featured cabinet asset', () => {
    expect(validatePhysicalAssetV1(createCabinetAsset())).toEqual([]);
  });

  it('accepts an asset that survives a structuredClone round trip', () => {
    expect(validatePhysicalAssetV1(structuredClone(createCabinetAsset()))).toEqual([]);
  });

  it('rejects a non-object outright', () => {
    expect(paths(null)).toEqual(['$']);
    expect(paths('cabinet')).toEqual(['$']);
  });

  it('rejects an unknown schema version before reading anything else', () => {
    const issues = validatePhysicalAssetV1(edited((asset) => {
      asset.schemaVersion = 'studio.physical-asset/2';
    }));
    expect(issues.map(({ path }) => path)).toEqual(['$.schemaVersion']);
    expect(issues[0]?.message).toContain('migration');
  });

  it('requires the described recipe id', () => {
    expect(paths(edited((asset) => { asset.recipeId = ''; }))).toEqual(['$.recipeId']);
  });

  it('reports every problem in one pass, not just the first', () => {
    const issues = validatePhysicalAssetV1(edited((asset) => {
      asset.recipeId = '';
      asset.bodies[1] = { ...asset.bodies[1], mass: 0 };
      asset.ports[0] = { ...asset.ports[0], body: 'missing' };
    }));
    expect(issues.map(({ path }) => path)).toEqual([
      '$.recipeId',
      '$.bodies[1].mass',
      '$.ports[0].body',
    ]);
  });

  describe('bodies', () => {
    it('rejects a missing list and enforces the bound', () => {
      expect(paths(edited((asset) => { (asset as { bodies: unknown }).bodies = undefined; })))
        .toContain('$.bodies');
      expect(paths(edited((asset) => {
        asset.bodies = Array.from({ length: MAX_PHYSICAL_BODIES + 1 }, (_, index) => ({
          key: `body-${String(index)}`, type: 'fixed', pose: { position: [0, 0, 0] },
        }));
        asset.colliders = []; asset.constraints = []; asset.ports = [];
      }))).toEqual(['$.bodies']);
    });

    it('rejects malformed, colliding, and separator-bearing keys', () => {
      expect(paths(edited((asset) => { asset.bodies[0] = { ...asset.bodies[0], key: '' }; })))
        .toContain('$.bodies[0].key');
      expect(paths(edited((asset) => { asset.bodies[0] = { ...asset.bodies[0], key: 'has space' }; })))
        .toContain('$.bodies[0].key');
      for (const banned of ['a/b', 'a<b', 'a>b', 'a#b']) {
        expect(paths(edited((asset) => { asset.bodies[0] = { ...asset.bodies[0], key: banned }; })), banned)
          .toContain('$.bodies[0].key');
      }
      expect(paths(edited((asset) => { asset.bodies[1] = { ...asset.bodies[1], key: 'cabinet' }; })))
        .toContain('$.bodies[1].key');
    });

    it('rejects an unknown body type', () => {
      expect(paths(edited((asset) => { asset.bodies[0] = { ...asset.bodies[0], type: 'static' }; })))
        .toEqual(['$.bodies[0].type']);
    });

    it('rejects non-finite, out-of-range, and non-unit poses', () => {
      expect(paths(edited((asset) => {
        asset.bodies[0] = { ...asset.bodies[0], pose: { position: [0, Number.NaN, 0] } };
      }))).toEqual(['$.bodies[0].pose.position']);
      expect(paths(edited((asset) => {
        asset.bodies[0] = { ...asset.bodies[0], pose: { position: [MAX_PHYSICAL_POSE_POSITION + 1, 0, 0] } };
      }))).toEqual(['$.bodies[0].pose.position']);
      expect(paths(edited((asset) => {
        asset.bodies[0] = { ...asset.bodies[0], pose: { position: [0, 0, 0], rotation: [0, 0, 0, 1.001] } };
      }))).toEqual(['$.bodies[0].pose.rotation']);
      expect(paths(edited((asset) => {
        asset.bodies[0] = { ...asset.bodies[0], pose: { position: [0, 0, 0], rotation: [0, 0, 1] } };
      }))).toEqual(['$.bodies[0].pose.rotation']);
    });

    it('accepts an exact axis-turn quaternion', () => {
      expect(validatePhysicalAssetV1(edited((asset) => {
        asset.bodies[0] = {
          ...asset.bodies[0],
          pose: { position: [0, 0, 0], rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
        };
      }))).toEqual([]);
    });

    it('rejects impossible mass, damping, and gravity values', () => {
      expect(paths(edited((asset) => { asset.bodies[1] = { ...asset.bodies[1], mass: 0 }; })))
        .toEqual(['$.bodies[1].mass']);
      expect(paths(edited((asset) => { asset.bodies[1] = { ...asset.bodies[1], linearDamping: -1 }; })))
        .toEqual(['$.bodies[1].linearDamping']);
      expect(paths(edited((asset) => { asset.bodies[1] = { ...asset.bodies[1], angularDamping: -0.5 }; })))
        .toEqual(['$.bodies[1].angularDamping']);
      expect(paths(edited((asset) => {
        asset.bodies[1] = { ...asset.bodies[1], gravityScale: Number.POSITIVE_INFINITY };
      }))).toEqual(['$.bodies[1].gravityScale']);
      expect(paths(edited((asset) => { asset.bodies[1] = { ...asset.bodies[1], continuous: 'yes' }; })))
        .toEqual(['$.bodies[1].continuous']);
    });
  });

  describe('colliders', () => {
    it('enforces the bound', () => {
      expect(paths(edited((asset) => {
        const template = asset.colliders[1];
        if (!template) throw new Error('template collider missing');
        asset.colliders = Array.from({ length: MAX_PHYSICAL_COLLIDERS + 1 }, () => ({ ...template }));
      }))).toEqual(['$.colliders']);
    });

    it('rejects a collider on a body that does not exist', () => {
      expect(paths(edited((asset) => { asset.colliders[0] = { ...asset.colliders[0], body: 'ghost' }; })))
        .toEqual(['$.colliders[0].body']);
    });

    it('rejects degenerate and oversized shapes of every kind', () => {
      expect(paths(edited((asset) => {
        asset.colliders[0] = { ...asset.colliders[0], shape: { kind: 'box', halfExtents: [0, 1, 1] } };
      }))).toEqual(['$.colliders[0].shape.halfExtents[0]']);
      expect(paths(edited((asset) => {
        asset.colliders[0] = {
          ...asset.colliders[0],
          shape: { kind: 'box', halfExtents: [1, MAX_PHYSICAL_SHAPE_DIMENSION + 1, 1] },
        };
      }))).toEqual(['$.colliders[0].shape.halfExtents[1]']);
      expect(paths(edited((asset) => {
        asset.colliders[0] = { ...asset.colliders[0], shape: { kind: 'sphere', radius: Number.NaN } };
      }))).toEqual(['$.colliders[0].shape.radius']);
      expect(paths(edited((asset) => {
        asset.colliders[0] = { ...asset.colliders[0], shape: { kind: 'capsule', halfHeight: -1, radius: 1 } };
      }))).toEqual(['$.colliders[0].shape.halfHeight']);
      expect(paths(edited((asset) => {
        asset.colliders[0] = { ...asset.colliders[0], shape: { kind: 'cylinder', halfHeight: 1, radius: 0 } };
      }))).toEqual(['$.colliders[0].shape.radius']);
    });

    it('names the future shapes while rejecting them', () => {
      const issues = validatePhysicalAssetV1(edited((asset) => {
        asset.colliders[0] = { ...asset.colliders[0], shape: { kind: 'mesh' } };
      }));
      expect(issues.map(({ path }) => path)).toEqual(['$.colliders[0].shape.kind']);
      expect(issues[0]?.message).toContain('future shapes');
    });

    it('rejects impossible density, friction, restitution, and role values', () => {
      expect(paths(edited((asset) => { asset.colliders[0] = { ...asset.colliders[0], density: 0 }; })))
        .toEqual(['$.colliders[0].density']);
      expect(paths(edited((asset) => { asset.colliders[0] = { ...asset.colliders[0], friction: -0.1 }; })))
        .toEqual(['$.colliders[0].friction']);
      expect(paths(edited((asset) => { asset.colliders[0] = { ...asset.colliders[0], restitution: 1.5 }; })))
        .toEqual(['$.colliders[0].restitution']);
      expect(paths(edited((asset) => { asset.colliders[0] = { ...asset.colliders[0], role: 'ghost' }; })))
        .toEqual(['$.colliders[0].role']);
    });
  });

  describe('constraints', () => {
    it('enforces the bound and key rules', () => {
      expect(paths(edited((asset) => {
        const template = asset.constraints[0];
        if (!template) throw new Error('template constraint missing');
        asset.constraints = Array.from({ length: MAX_PHYSICAL_CONSTRAINTS + 1 }, (_, index) => ({
          ...template, key: `slide-${String(index)}`,
        }));
      }))).toEqual(['$.constraints']);
      expect(paths(edited((asset) => {
        const second = { ...asset.constraints[0] };
        asset.constraints.push(second);
      }))).toEqual(['$.constraints[1].key']);
    });

    it('rejects unknown kinds, unknown bodies, and self-joins', () => {
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], kind: 'spherical' }; })))
        .toEqual(['$.constraints[0].kind']);
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], bodyA: 'ghost' }; })))
        .toEqual(['$.constraints[0].bodyA']);
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], bodyB: 'cabinet' }; })))
        .toEqual(['$.constraints[0].bodyB']);
    });

    it('requires an axis exactly when the kind moves', () => {
      expect(paths(edited((asset) => {
        delete asset.constraints[0]?.axis;
      }))).toEqual(['$.constraints[0].axis']);
      expect(paths(edited((asset) => {
        asset.constraints[0] = {
          key: 'weld', kind: 'fixed', bodyA: 'cabinet', bodyB: 'drawer',
          anchorA: { position: [0, 0, 0] }, anchorB: { position: [0, 0, 0] },
          axis: [0, 0, 1],
        };
      }))).toEqual(['$.constraints[0].axis']);
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], axis: [0, 0, 2] }; })))
        .toEqual(['$.constraints[0].axis']);
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], axis: [0, 0] }; })))
        .toEqual(['$.constraints[0].axis']);
    });

    it('accepts a fixed joint with no axis, limits, or motor', () => {
      expect(validatePhysicalAssetV1(edited((asset) => {
        asset.constraints[0] = {
          key: 'weld', kind: 'fixed', bodyA: 'cabinet', bodyB: 'drawer',
          anchorA: { position: [0, 0, 0] }, anchorB: { position: [0, 0, 0] },
        };
      }))).toEqual([]);
    });

    it('rejects limits and motors that make no sense', () => {
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], limits: [4, 0] }; })))
        .toEqual(['$.constraints[0].limits']);
      expect(paths(edited((asset) => {
        asset.constraints[0] = {
          key: 'weld', kind: 'fixed', bodyA: 'cabinet', bodyB: 'drawer',
          anchorA: { position: [0, 0, 0] }, anchorB: { position: [0, 0, 0] },
          limits: [0, 1],
        };
      }))).toEqual(['$.constraints[0].limits']);
      expect(paths(edited((asset) => {
        asset.constraints[0] = {
          ...asset.constraints[0], motor: { targetVelocity: 1, maxForce: 0 },
        };
      }))).toEqual(['$.constraints[0].motor']);
      expect(paths(edited((asset) => {
        asset.constraints[0] = {
          key: 'weld', kind: 'fixed', bodyA: 'cabinet', bodyB: 'drawer',
          anchorA: { position: [0, 0, 0] }, anchorB: { position: [0, 0, 0] },
          motor: { targetVelocity: 0, maxForce: 1 },
        };
      }))).toEqual(['$.constraints[0].motor']);
      expect(paths(edited((asset) => { asset.constraints[0] = { ...asset.constraints[0], breakForce: -1 }; })))
        .toEqual(['$.constraints[0].breakForce']);
    });
  });

  describe('ports', () => {
    it('enforces the bound, key uniqueness, and body references', () => {
      expect(paths(edited((asset) => {
        asset.ports = Array.from({ length: MAX_PHYSICAL_PORTS + 1 }, (_, index) => ({
          key: `port-${String(index)}`, body: 'cabinet', frame: { position: [0, 0, 0] },
        }));
      }))).toEqual(['$.ports']);
      expect(paths(edited((asset) => {
        asset.ports.push({ key: 'top', body: 'cabinet', frame: { position: [0, 1, 0] } });
      }))).toEqual(['$.ports[1].key']);
      expect(paths(edited((asset) => { asset.ports[0] = { ...asset.ports[0], body: 'ghost' }; })))
        .toEqual(['$.ports[0].body']);
      expect(paths(edited((asset) => { asset.ports[0] = { ...asset.ports[0], frame: { position: [0] } }; })))
        .toEqual(['$.ports[0].frame.position']);
    });
  });
});
