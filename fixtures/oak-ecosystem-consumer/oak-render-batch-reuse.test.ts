import { describe, expect, it } from 'vitest';

import { RenderWorld } from '../../src/core/index.js';
import { buildOakRenderDeltaV1, buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import { OAK_LEAF_VOXEL_BATCH_KEY_V1 } from './oak-tissue-voxel-projection.js';

describe('oak accepted batch reuse', () => {
  it('retains accepted typed batches when only the presentation revision advances', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_000 });
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 4_001,
      previousFrame: before,
    });
    for (const previous of before.snapshot.batches) {
      const next = after.snapshot.batches.find(({ key }) => key === previous.key);
      expect(next, previous.key).toBe(previous);
    }
  });

  it('reuses stable structural/support batches without hiding live leaf work', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    let previous = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_100 });
    let liveLeafFrames = 0;
    let reusedStableBatches = 0;
    for (let tick = 0; tick < 12; tick += 1) {
      simulation.advanceHostTicks(1);
      const next = buildOakRenderFrameV1(simulation.projection(), {
        renderRevision: 4_101 + tick,
        previousFrame: previous,
      });
      for (const batch of next.snapshot.batches) {
        const before = previous.snapshot.batches.find(({ key }) => key === batch.key)!;
        if (batch.key === OAK_LEAF_VOXEL_BATCH_KEY_V1) {
          liveLeafFrames += Number(batch !== before && batch.revision > before.revision);
        } else if (batch.revision === before.revision) {
          reusedStableBatches += 1;
          expect(batch, batch.key).toBe(before);
        }
      }
      previous = next;
    }
    expect(liveLeafFrames).toBe(12);
    expect(reusedStableBatches).toBeGreaterThan(12 * 4);
  }, 60_000);

  it.each([
    {
      field: 'matrix',
      mutate: (batch: ReturnType<typeof buildOakRenderFrameV1>['snapshot']['batches'][number]) => {
        batch.matrices[0] = batch.matrices[0]! + 0.25;
      },
      message: /previous delta frame integrity check failed: batch .* matrix component/u,
    },
    {
      field: 'color',
      mutate: (batch: ReturnType<typeof buildOakRenderFrameV1>['snapshot']['batches'][number]) => {
        batch.colors![0] = batch.colors![0]! ^ 1;
      },
      message: /previous delta frame integrity check failed: batch .* color channel/u,
    },
    {
      field: 'ordered key',
      mutate: (batch: ReturnType<typeof buildOakRenderFrameV1>['snapshot']['batches'][number]) => {
        const keys = batch.instanceKeys as string[];
        keys[0] = `${keys[0]!}:caller-mutated`;
      },
      message: /previous delta frame integrity check failed: batch .* ordered key at slot/u,
    },
  ])('rejects caller-mutated prior $field after its next frame was built', ({ mutate, message }) => {
    const simulation = createOakSimulationV1();
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_200 });
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 4_201,
      previousFrame: before,
    });
    const batch = before.snapshot.batches.find((candidate) => candidate.instanceKeys.length > 0)!;
    expect(after.snapshot.batches.find(({ key }) => key === batch.key)).toBe(batch);
    mutate(batch);
    expect(() => buildOakRenderDeltaV1(before, after)).toThrow(message);
  });

  it('rejects a caller-mutated shared soil buffer instead of silently aliasing frames', () => {
    const simulation = createOakSimulationV1();
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_300 });
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 4_301,
      previousFrame: before,
    });
    expect(after.snapshot.chunks[0]!.voxels).toBe(before.snapshot.chunks[0]!.voxels);
    const voxels = before.snapshot.chunks[0]!.voxels;
    voxels[0] = voxels[0]! ^ 1;
    expect(() => buildOakRenderDeltaV1(before, after))
      .toThrow(/previous delta frame integrity check failed: chunk .* voxel 0 changed/u);
  });

  it('validates a previous frame before any producer reuse', () => {
    const simulation = createOakSimulationV1();
    const previous = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_400 });
    const batch = previous.snapshot.batches.find((candidate) => candidate.instanceKeys.length > 0)!;
    batch.matrices[0] = batch.matrices[0]! + 0.25;
    expect(() => buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 4_401,
      previousFrame: previous,
    })).toThrow(/previousFrame integrity check failed: batch .* matrix component/u);
  });

  it('rejects mutated static geometry after the prior full snapshot was accepted', () => {
    const simulation = createOakSimulationV1();
    const before = buildOakRenderFrameV1(simulation.projection(), { renderRevision: 4_500 });
    const after = buildOakRenderFrameV1(simulation.projection(), {
      renderRevision: 4_501,
      previousFrame: before,
    });
    const world = new RenderWorld();
    expect(world.acceptSnapshot(before.snapshot).status).toBe('accepted');
    const acceptedGeometry = world.acceptedSnapshot()!.resources
      .find((resource) => resource.kind === 'geometry')!;
    if (acceptedGeometry.kind !== 'geometry') throw new Error('Expected accepted oak geometry.');
    const acceptedPosition = acceptedGeometry.positions[0]!;
    const sourceGeometry = before.snapshot.resources
      .find((resource) => resource.kind === 'geometry')!;
    if (sourceGeometry.kind !== 'geometry') throw new Error('Expected source oak geometry.');
    sourceGeometry.positions[0] = sourceGeometry.positions[0]! + 0.25;
    expect(acceptedGeometry.positions[0]).toBe(acceptedPosition);
    expect(() => buildOakRenderDeltaV1(before, after))
      .toThrow(/previous delta frame integrity check failed: resources.*positions/u);
    world.dispose();
  });
});
