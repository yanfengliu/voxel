import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RenderSnapshotV1 } from '../../src/core/index.js';
import { addPaletteColor, createEmptyModel, setVoxel } from './edit.js';
import type { StudioModelV1 } from './model.js';
import { StudioSession } from './session.js';

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

    runtimeStatus() {
      return { state: 'running' };
    }

    dispose() {
      // The mock owns no renderer resources.
    }
  },
}));

function filledModel(id: string): StudioModelV1 {
  const withColor = addPaletteColor(
    createEmptyModel({ id, label: id, size: [1, 1, 1] }),
    { r: 80, g: 140, b: 210 },
  ).model;
  return setVoxel(withColor, 0, 0, 0, 1);
}

describe('StudioSession model acceptance', () => {
  beforeEach(() => {
    runtimeControl.snapshots.length = 0;
    runtimeControl.rejectNext = null;
  });

  it('keeps the accepted model and reuses the attempted revision after rejection', () => {
    const accepted = filledModel('test:accepted');
    const rejected = filledModel('test:rejected');
    const replacement = filledModel('test:replacement');
    const session = new StudioSession(accepted, { canvas: {} as HTMLCanvasElement });

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'stale-revision',
      path: 'revision',
    };

    expect(() => { session.setGenome(rejected); }).toThrow(
      'The runtime rejected revision 2: stale-revision at revision',
    );
    expect(session.model).toBe(accepted);
    expect(session.describe()).toMatchObject({ id: accepted.id, revision: 1 });

    session.setGenome(replacement);

    expect(session.model).toBe(replacement);
    expect(session.describe()).toMatchObject({ id: replacement.id, revision: 2 });
    expect(runtimeControl.snapshots.map((snapshot) => snapshot.revision)).toEqual([1, 2, 2]);
    session.dispose();
  });

  it('does not create a geometry reincarnation after a rejected empty model', () => {
    const accepted = filledModel('test:filled-before');
    const rejectedEmpty = createEmptyModel({
      id: 'test:rejected-empty',
      label: 'Rejected empty',
      size: [1, 1, 1],
    });
    const replacement = filledModel('test:filled-after');
    const session = new StudioSession(accepted, { canvas: {} as HTMLCanvasElement });

    runtimeControl.rejectNext = {
      status: 'rejected',
      code: 'invalid-snapshot',
      path: 'resources',
    };
    expect(() => { session.setGenome(rejectedEmpty); }).toThrow(
      'The runtime rejected revision 2: invalid-snapshot at resources',
    );

    session.setGenome(replacement);

    const finalSnapshot = runtimeControl.snapshots.at(-1);
    const geometry = finalSnapshot?.resources.find((resource) => resource.kind === 'geometry');
    expect(finalSnapshot?.revision).toBe(2);
    expect(geometry).toMatchObject({ incarnation: 1, revision: 2 });
    expect(session.model).toBe(replacement);
    session.dispose();
  });
});
