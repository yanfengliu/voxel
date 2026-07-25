import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderSnapshotV1 } from '../../src/core/index.js';
import { VOXEL_SCENE_SCHEMA_V1, type SceneV1 } from './scene.js';
import { SceneSession } from './scene-session.js';

interface RuntimeRejection {
  readonly status: 'rejected';
  readonly code: string;
  readonly path: string;
}

const runtimeControl = vi.hoisted(() => ({
  snapshots: [] as RenderSnapshotV1[],
  rejectNext: null as RuntimeRejection | null,
}));

vi.mock('../../src/three/index.js', () => ({
  ThreeRenderRuntime: class {
    acceptSnapshot(snapshot: RenderSnapshotV1) {
      runtimeControl.snapshots.push(snapshot);
      const rejection = runtimeControl.rejectNext;
      runtimeControl.rejectNext = null;
      return rejection ?? { status: 'accepted', revision: snapshot.revision };
    }

    dispose() {
      // The mock owns no renderer resources.
    }
  },
}));

function scene(id: string): SceneV1 {
  return {
    schemaVersion: VOXEL_SCENE_SCHEMA_V1,
    id,
    label: id,
    placements: [],
  };
}

describe('SceneSession acceptance', () => {
  beforeEach(() => {
    runtimeControl.snapshots.length = 0;
    runtimeControl.rejectNext = null;
  });

  it('publishes scene and look changes only after acceptance and reuses a rejected revision', () => {
    const accepted = scene('scene:accepted');
    const rejected = scene('scene:rejected');
    const replacement = scene('scene:replacement');
    const session = new SceneSession(accepted, {}, {}, { canvas: {} as HTMLCanvasElement });

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'stale-revision',
      path: 'revision',
    };
    expect(() => { session.setScene(rejected); }).toThrow(
      'The runtime rejected scene revision 2: stale-revision at revision',
    );
    expect(session.scene).toBe(accepted);

    session.setScene(replacement);
    expect(session.scene).toBe(replacement);
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2]);

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'invalid-snapshot',
      path: 'look.edges',
    };
    expect(() => { session.setEdges(false); }).toThrow(
      'The runtime rejected scene revision 3: invalid-snapshot at look.edges',
    );
    expect(session.edges).toBe(true);

    session.setEdges(false);
    expect(session.edges).toBe(false);
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2, 3, 3]);
    session.dispose();
  });
});
