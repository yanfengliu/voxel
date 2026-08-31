import { describe, expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';

import { fitOakBrowserCameraV1 } from './oak-browser-camera.js';
import { OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1 } from './oak-fallen-litter-voxel.js';
import { OAK_DEFAULT_TIME_SCALE_V1, OAK_PARAMETERS_V1 } from './oak-parameters.js';
import { buildOakRenderFrameV1 } from './oak-render-adapter.js';
import {
  oakRenderedOrgansV1,
  type OakRenderedOrganV1,
} from './oak-rendered-organ-geometry.js';
import {
  createOakSimulationV1,
  oakHostTicksForBiologicalDaysV1,
} from './oak-simulation.js';

const VIEWPORT = { width: 1_280, height: 720, pixelRatio: 1 } as const;
const HUD_RIGHT_PX = 367;

interface Point2 {
  readonly x: number;
  readonly y: number;
}

function cross2(origin: Point2, left: Point2, right: Point2): number {
  return (left.x - origin.x) * (right.y - origin.y)
    - (left.y - origin.y) * (right.x - origin.x);
}

function convexHullArea2D(input: readonly Point2[]): number {
  const ordered = [...input].sort((left, right) => left.x - right.x || left.y - right.y);
  const unique = ordered.filter((point, index) =>
    index === 0
    || point.x !== ordered[index - 1]!.x
    || point.y !== ordered[index - 1]!.y);
  if (unique.length < 3) {
    return 0;
  }

  const half = (points: readonly Point2[]): Point2[] => {
    const result: Point2[] = [];
    for (const point of points) {
      while (
        result.length >= 2
        && cross2(result[result.length - 2]!, result[result.length - 1]!, point) <= 0
      ) {
        result.pop();
      }
      result.push(point);
    }
    return result;
  };

  const hull = [
    ...half(unique).slice(0, -1),
    ...half([...unique].reverse()).slice(0, -1),
  ];
  return Math.abs(hull.reduce((twiceArea, point, index) => {
    const next = hull[(index + 1) % hull.length]!;
    return twiceArea + point.x * next.y - point.y * next.x;
  }, 0)) / 2;
}

function component(
  point: Readonly<{ x: number; y: number; z: number }>,
  axis: Vector3,
): number {
  return point.x * axis.x + point.y * axis.y + point.z * axis.z;
}

function heroGeometryMetrics(
  organs: readonly OakRenderedOrganV1[],
  cameraFromSubjectInput: Vector3,
): {
  readonly leafEnvelopeAreaM2: number;
  readonly stemVerticalProjectionFraction: number;
} {
  const cameraFromSubject = cameraFromSubjectInput.clone().normalize();
  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), cameraFromSubject)
    .normalize();
  const screenUp = new Vector3()
    .crossVectors(cameraFromSubject, right)
    .normalize();
  const leaves = organs.filter(({ organ }) => organ.kind === 'leaf');
  const leafEnvelopeAreaM2 = leaves.reduce((total, leaf) =>
    total + convexHullArea2D(leaf.vertices.map((point) => ({
      x: component(point, right),
      y: component(point, screenUp),
    }))), 0);
  const stemVertices = organs
    .filter(({ organ }) => organ.kind === 'stem')
    .flatMap(({ vertices }) => vertices);
  const span = (values: readonly number[]): number =>
    Math.max(...values) - Math.min(...values);

  return {
    leafEnvelopeAreaM2,
    stemVerticalProjectionFraction:
      span(stemVertices.map((point) => component(point, screenUp)))
      / span(stemVertices.map((point) => point.y)),
  };
}

describe('oak browser camera material fit', () => {
  it('shows mature leaf laminae without collapsing the trunk into an overhead view', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    simulation.setPaused(true);
    const projection = simulation.projection();
    const frame = buildOakRenderFrameV1(projection);
    const organs = oakRenderedOrgansV1(projection, frame.snapshot);
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);

    fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      frame.snapshot,
      VIEWPORT,
      null,
      false,
    );

    const proposed = heroGeometryMetrics(
      organs,
      camera.getWorldDirection(new Vector3()).negate(),
    );
    const former = heroGeometryMetrics(organs, new Vector3(0.67, 0.68, 0.9));

    expect(proposed.leafEnvelopeAreaM2)
      .toBeGreaterThan(former.leafEnvelopeAreaM2 * 1.18);
    expect(proposed.stemVerticalProjectionFraction).toBeGreaterThan(0.78);
  });

  it('remeasures breeze-deformed vertices without breathing while they remain safe', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(100));
    simulation.setPaused(true);
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const stillFrame = buildOakRenderFrameV1(simulation.projection());
    const still = fitOakBrowserCameraV1(
      camera,
      'side',
      simulation.snapshot(),
      stillFrame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
    );
    const position = camera.position.toArray();
    const quaternion = camera.quaternion.toArray();

    simulation.setTimeScale(1);
    simulation.applyCommand({ kind: 'set-wind-regime', regime: 'breeze' });
    simulation.setPaused(false);
    simulation.advanceHostTicks(OAK_PARAMETERS_V1.mechanics.gustRampHostTicks);
    simulation.setPaused(true);
    const breezeFrame = buildOakRenderFrameV1(simulation.projection());
    const breeze = fitOakBrowserCameraV1(
      camera,
      'side',
      simulation.snapshot(),
      breezeFrame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
      true,
    );

    expect(breeze.subjectBoundsNdc).not.toEqual(still.subjectBoundsNdc);
    expect(camera.position.toArray()).toEqual(position);
    expect(camera.quaternion.toArray()).toEqual(quaternion);
    expect(Math.max(Math.abs(breeze.subjectBoundsNdc.minY), breeze.subjectBoundsNdc.maxY))
      .toBeLessThan(0.9);
    expect(breeze.fittedOrganCount).toBeLessThan(
      simulation.snapshot().diagnostics.organCount,
    );
    expect(breeze.fittedVertexCount).toBeGreaterThan(breeze.fittedOrganCount);
    expect(simulation.snapshot().diagnostics.mechanicsClampedOrganCount).toBe(0);
  });

  it('counts root geometry only in the cutaway fit', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    const wholeFrame = buildOakRenderFrameV1(simulation.projection());
    const whole = fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      wholeFrame.snapshot,
      VIEWPORT,
      null,
      false,
    );
    const cutawayFrame = buildOakRenderFrameV1(simulation.projection(), {
      rootCutaway: { axis: 'x', planeM: 0, keep: 'less-than' },
    });
    const cutaway = fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      cutawayFrame.snapshot,
      VIEWPORT,
      null,
      true,
    );

    expect(whole.fittedOrganCount).toBeLessThan(simulation.snapshot().diagnostics.organCount);
    expect(whole.rootShaftsNdc).toEqual({ coarse: null, aggregateFine: null });
    expect(cutaway.fittedOrganCount).toBe(simulation.snapshot().diagnostics.organCount);
    expect(cutaway.fittedVertexCount).toBeGreaterThan(whole.fittedVertexCount);
    expect(cutaway.rootShaftsNdc.coarse).not.toBeNull();
    expect(cutaway.rootShaftsNdc.aggregateFine).not.toBeNull();
    const fineRoot = cutaway.rootShaftsNdc.aggregateFine;
    if (fineRoot === null) throw new Error('Cutaway fit did not project its fine-root shaft.');
    expect(Math.abs(fineRoot.tip.x - fineRoot.base.x) * 960 / 2).toBeGreaterThan(3);
  });

  it('fits every fallen-litter cube inside the day-240 hero and overhead margins', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.setPaused(false);
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(240));
    simulation.setPaused(true);
    const frame = buildOakRenderFrameV1(simulation.projection());
    const litterBatch = frame.snapshot.batches.find((batch) =>
      batch.key === OAK_FALLEN_LITTER_VOXEL_BATCH_KEY_V1);
    if (litterBatch === undefined) throw new Error('Day-240 frame omitted its litter batch.');
    const litterGeometry = frame.snapshot.resources.find((resource) =>
      resource.kind === 'geometry' && resource.key === litterBatch.geometryKey);
    if (litterGeometry?.kind !== 'geometry') {
      throw new Error('Day-240 litter batch references no accepted geometry.');
    }
    const noLitterSnapshot = {
      ...frame.snapshot,
      batches: frame.snapshot.batches.filter((batch) => batch !== litterBatch),
    };

    expect(frame.metrics.fallenLitterVoxels).toBeGreaterThan(2_000);
    for (const preset of ['hero', 'overhead'] as const) {
      const camera = new PerspectiveCamera(34, 1, 0.005, 25);
      const measured = fitOakBrowserCameraV1(
        camera,
        preset,
        simulation.snapshot(),
        frame.snapshot,
        VIEWPORT,
        null,
        false,
      );
      const noLitter = fitOakBrowserCameraV1(
        new PerspectiveCamera(34, 1, 0.005, 25),
        preset,
        simulation.snapshot(),
        noLitterSnapshot,
        VIEWPORT,
        null,
        false,
      );
      const projectedMinimum = new Vector3(Infinity, Infinity, Infinity);
      const projectedMaximum = new Vector3(-Infinity, -Infinity, -Infinity);
      for (let slot = 0; slot < litterBatch.instanceKeys.length; slot += 1) {
        const matrix = new Matrix4().fromArray(
          Array.from(litterBatch.matrices.subarray(slot * 16, slot * 16 + 16)),
        );
        for (let offset = 0; offset < litterGeometry.positions.length; offset += 3) {
          const projected = new Vector3(
            litterGeometry.positions[offset]!,
            litterGeometry.positions[offset + 1]!,
            litterGeometry.positions[offset + 2]!,
          ).applyMatrix4(matrix).project(camera);
          projectedMinimum.min(projected);
          projectedMaximum.max(projected);
        }
      }

      expect(measured.fittedLitterVoxelCount).toBe(frame.metrics.fallenLitterVoxels);
      expect(measured.fittedVertexCount - noLitter.fittedVertexCount).toBe(
        litterBatch.instanceKeys.length * litterGeometry.positions.length / 3,
      );
      expect(projectedMinimum.x).toBeGreaterThan(-0.95);
      expect(projectedMaximum.x).toBeLessThan(0.95);
      expect(projectedMinimum.y).toBeGreaterThan(-0.87);
      expect(projectedMaximum.y).toBeLessThan(0.87);
      expect(projectedMinimum.z).toBeGreaterThanOrEqual(-1);
      expect(projectedMaximum.z).toBeLessThanOrEqual(1);
      expect(measured.subjectBoundsNdc.minX).toBeGreaterThan(-0.95);
      expect(measured.subjectBoundsNdc.maxX).toBeLessThan(0.95);
      expect(measured.subjectBoundsNdc.minY).toBeGreaterThan(-0.87);
      expect(measured.subjectBoundsNdc.maxY).toBeLessThan(0.87);
    }
  });

  it('remeasures an intentionally free camera without snapping it back into a preset', () => {
    const simulation = createOakSimulationV1({
      seed: 0x51a7_0a4b,
      timeScale: OAK_DEFAULT_TIME_SCALE_V1,
    });
    simulation.advanceHostTicks(oakHostTicksForBiologicalDaysV1(13));
    const frame = buildOakRenderFrameV1(simulation.projection());
    const camera = new PerspectiveCamera(34, 1, 0.005, 25);
    fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      frame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
    );
    camera.position.x += 0.4;
    camera.position.z -= 0.2;
    camera.updateMatrixWorld(true);
    const position = camera.position.toArray();
    const quaternion = camera.quaternion.toArray();
    const projection = camera.projectionMatrix.toArray();

    const measured = fitOakBrowserCameraV1(
      camera,
      'hero',
      simulation.snapshot(),
      frame.snapshot,
      VIEWPORT,
      HUD_RIGHT_PX,
      false,
      'always',
    );

    expect(camera.position.toArray()).toEqual(position);
    expect(camera.quaternion.toArray()).toEqual(quaternion);
    expect(camera.projectionMatrix.toArray()).toEqual(projection);
    expect(measured.distanceM).toBeGreaterThan(0);
    expect(measured.fittedVertexCount).toBeGreaterThan(measured.fittedOrganCount);
  });
});
