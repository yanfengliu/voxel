import { describe, expect, it } from 'vitest';

import { oakAxisFrameV1 } from './oak-axis-frame.js';
import {
  assertOakLeafAttachmentTopologyV1,
  oakLeafNodeEnvelopeRadiusM_V1,
  oakParallelTransportVectorV1,
  oakResolveLeafAttachmentNodeV1,
  oakResolveLeafAttachmentPoseV1,
} from './oak-cellular-leaf-hinge.js';
import {
  oakLeafPetioleSectionForOrganV1,
  oakLeafPetioleSupportAlongAxisM_V1,
} from './oak-leaf-shape.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';
import {
  createInitialOakStateV1,
  type MutableOakOrganV1,
} from './oak-state.js';
import { buildOakTissueVoxelProjectionV1 } from './oak-tissue-union-lattice.js';
import type { OakLeafOrganSnapshotV1 } from './oak-types.js';

function attachedLeaves(
  organs: readonly MutableOakOrganV1[],
): readonly MutableOakOrganV1[] {
  return organs.filter((organ) => organ.kind === 'leaf' && organ.parentKey !== null
    && organ.stage !== 'detached' && organ.stage !== 'abscised'
    && organ.development?.phase !== 'preformed' && organ.healthFraction > 0);
}

function authoritativeLeafPose(
  leaf: OakLeafOrganSnapshotV1,
): Readonly<{
  attachment: OakLeafOrganSnapshotV1['attachment'];
  positionM: OakLeafOrganSnapshotV1['positionM'];
  direction: OakLeafOrganSnapshotV1['direction'];
}> {
  return {
    attachment: leaf.attachment,
    positionM: leaf.positionM,
    direction: leaf.direction,
  };
}

describe('oak kinematic distal-node leaf attachment authority', () => {
  it('rejects a placed leaf whose physical attachment is missing or names another parent', () => {
    const state = createInitialOakStateV1({
      seed: 0x51a7_0a4b,
      timeScale: 1,
      paused: false,
      ablation: 'baseline',
      regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    }, 1);
    const parent = state.organs[0]!;
    const leaf: MutableOakOrganV1 = {
      ...parent,
      key: 'organ:2:1',
      identity: { localId: 2, generation: 1 },
      kind: 'leaf',
      parentKey: parent.key,
      stage: 'expanding',
      restDirection: { x: 1, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      development: {
        ...parent.development!,
        phase: 'cell-expansion',
      },
      areaM2: 0.0015,
      rollRadians: 0.3,
    };
    expect(() => assertOakLeafAttachmentTopologyV1([parent, leaf]))
      .toThrow(`Placed attached oak leaf '${leaf.key}' has no physical node attachment.`);
    leaf.attachment = {
      parentOrganKey: 'organ:999:1',
      nodeSite: 'distal',
      restRadialUnitWorld: { x: 1, y: 0, z: 0 },
    };
    expect(() => assertOakLeafAttachmentTopologyV1([parent, leaf]))
      .toThrow("attachment names 'organ:999:1'");
    leaf.attachment = { ...leaf.attachment, parentOrganKey: parent.key };
    expect(() => assertOakLeafAttachmentTopologyV1([parent, leaf])).not.toThrow();
  });

  it('keeps one normalized distal-node identity through 120 breeze ticks', () => {
    const simulation = createOakSimulationV1();
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    const initial = new Map(simulation.snapshot().organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 =>
        organ.kind === 'leaf' && organ.parentKey !== null)
      .map((leaf) => [leaf.key, leaf.attachment] as const));
    expect(initial.size).toBe(10);

    for (let tick = 1; tick <= 120; tick += 1) {
      simulation.advanceHostTicks(1);
      const snapshot = simulation.snapshot();
      const organs = snapshot.organs as unknown as readonly MutableOakOrganV1[];
      assertOakLeafAttachmentTopologyV1(organs);
      for (const leaf of attachedLeaves(organs)) {
        expect(leaf.attachment, `${leaf.key} tick ${String(tick)} identity`)
          .toEqual(initial.get(leaf.key));
        const radial = leaf.attachment!.restRadialUnitWorld;
        expect(Math.hypot(radial.x, radial.y, radial.z), leaf.key).toBeCloseTo(1, 12);
      }
    }
  });

  it('keeps a fixed node datum and two-plane clearance while the leaf bends', () => {
    const state = createInitialOakStateV1({
      seed: 0x51a7_0a4b,
      timeScale: 1,
      paused: false,
      ablation: 'baseline',
      regime: { water: 'ambient', nitrogen: 'ambient', phosphorus: 'ambient' },
    }, 1);
    const parent = state.organs[0]!;
    const leaf: MutableOakOrganV1 = {
      ...parent,
      key: 'organ:2:1',
      identity: { localId: 2, generation: 1 },
      kind: 'leaf',
      parentKey: parent.key,
      restDirection: { x: 1, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
      lengthM: 0.075,
      radiusM: 0.001,
      areaM2: 0.0015,
      rollRadians: 0.3,
      attachment: {
        parentOrganKey: parent.key,
        nodeSite: 'distal',
        restRadialUnitWorld: { x: 1, y: 0, z: 0 },
      },
    };
    const organs = [parent, leaf];
    const beforeNode = oakResolveLeafAttachmentNodeV1({
      organs, leaf, parent, current: true,
    });
    const beforePose = oakResolveLeafAttachmentPoseV1({
      organs, leaf, parent, leafDirection: leaf.direction, current: true,
    });
    const unit = (vector: typeof leaf.direction) => {
      const length = Math.hypot(vector.x, vector.y, vector.z);
      return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
    };
    const dot = (left: typeof leaf.direction, right: typeof leaf.direction) =>
      left.x * right.x + left.y * right.y + left.z * right.z;
    const parentAxis = unit(parent.direction);
    const radial = unit(oakParallelTransportVectorV1(
      leaf.attachment!.restRadialUnitWorld,
      parent.restDirection,
      parentAxis,
    ));
    const distalNode = {
      x: parent.positionM.x + parentAxis.x * parent.lengthM,
      y: parent.positionM.y + parentAxis.y * parent.lengthM,
      z: parent.positionM.z + parentAxis.z * parent.lengthM,
    };
    const nodeRadius = oakLeafNodeEnvelopeRadiusM_V1(organs, parent, radial, true);
    const nodeFromDistal = {
      x: beforeNode.x - distalNode.x,
      y: beforeNode.y - distalNode.y,
      z: beforeNode.z - distalNode.z,
    };
    expect(dot(nodeFromDistal, radial)).toBeCloseTo(nodeRadius, 14);
    expect(dot(nodeFromDistal, parentAxis)).toBeCloseTo(0, 14);
    const poseFromDistal = {
      x: beforePose.x - distalNode.x,
      y: beforePose.y - distalNode.y,
      z: beforePose.z - distalNode.z,
    };
    const radialSupport = oakLeafPetioleSupportAlongAxisM_V1(
      leaf.key, leaf.areaM2 ?? 0, leaf.lengthM, leaf.direction, leaf.rollRadians ?? 0, radial,
    );
    const axialSupport = oakLeafPetioleSupportAlongAxisM_V1(
      leaf.key, leaf.areaM2 ?? 0, leaf.lengthM, leaf.direction, leaf.rollRadians ?? 0, parentAxis,
    );
    expect(dot(poseFromDistal, radial) - radialSupport).toBeCloseTo(nodeRadius, 14);
    expect(dot(poseFromDistal, parentAxis) - axialSupport).toBeCloseTo(0, 14);
    // Bound: this rolled organ:2 section with parent +Y and leaf/radial +X.
    // Separate plane supports do not prove that their intersection is material.
    expect(parentAxis).toEqual({ x: 0, y: 1, z: 0 });
    expect(radial).toEqual({ x: 1, y: 0, z: 0 });
    const frame = oakAxisFrameV1(leaf.direction, leaf.rollRadians!);
    const section = oakLeafPetioleSectionForOrganV1(leaf.key, leaf.areaM2!, leaf.lengthM);
    const nodeFromPose = {
      x: beforeNode.x - beforePose.x,
      y: beforeNode.y - beforePose.y,
      z: beforeNode.z - beforePose.z,
    };
    const localWidthM = dot(nodeFromPose, frame.x);
    const localThicknessM = dot(nodeFromPose, frame.z);
    expect(section.basalFullWidthM / 2).toBeCloseTo(0.000913733744514, 15);
    expect(section.basalFullThicknessM / 2).toBeCloseTo(0.000391600176220, 15);
    expect(axialSupport).toBeCloseTo(0.000644136722503, 15);
    expect(localWidthM).toBeCloseTo(-0.000190355417352, 15);
    expect(localThicknessM).toBeCloseTo(-0.000615367314993, 15);
    expect(Math.abs(localWidthM)).toBeLessThan(section.basalFullWidthM / 2);
    const outsideThicknessM = Math.abs(localThicknessM) - section.basalFullThicknessM / 2;
    expect(outsideThicknessM).toBeCloseTo(0.000223767138773, 15);
    expect(outsideThicknessM).toBeGreaterThan(0);
    leaf.direction = { x: 0.96, y: -0.2, z: 0.19 };
    const afterNode = oakResolveLeafAttachmentNodeV1({
      organs, leaf, parent, current: true,
    });
    const afterPose = oakResolveLeafAttachmentPoseV1({
      organs, leaf, parent, leafDirection: leaf.direction, current: true,
    });
    expect(afterNode).toEqual(beforeNode);
    expect(afterPose).not.toEqual(beforePose);
  });

  it('does not let disposable union allocation change an authoritative hinge pose', () => {
    const control = createOakSimulationV1();
    const mutated = createOakSimulationV1();
    const ticks = oakHostTicksForBiologicalDaysV1(100);
    control.advanceHostTicks(ticks);
    mutated.advanceHostTicks(ticks);
    const disposable = buildOakTissueVoxelProjectionV1(mutated.projection(), false);
    (disposable.materialCells as Map<number, unknown>).clear();
    (disposable.sourceAssignments as Map<string, unknown>).clear();

    control.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    mutated.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    control.advanceHostTicks(1);
    mutated.advanceHostTicks(1);
    const expected = control.snapshot().organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf')
      .map(authoritativeLeafPose);
    const actual = mutated.snapshot().organs
      .filter((organ): organ is OakLeafOrganSnapshotV1 => organ.kind === 'leaf')
      .map(authoritativeLeafPose);
    expect(actual).toEqual(expected);
  });
});
