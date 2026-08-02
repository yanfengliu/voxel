import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createWindmillCompactCandidateV1,
  type WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import {
  WINDMILL_COMPACT_SELECTION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
} from '../../tools/studio/windmill-compact-selection.js';
import {
  compileWindmillCompactCandidateV1,
} from './windmill-compact-physical.js';
import {
  evaluateWindmillCompactCandidateObservedV1,
  evaluateWindmillCompactCandidateV1,
} from './windmill-compact-evaluator.js';
import {
  createWindmillCompactBodyObservationV1,
} from './windmill-compact-observer.js';
import {
  rotateWindmillVectorV1,
  windmillContactsBetweenV1,
} from './windmill-compact-evaluator-runtime.js';
import {
  evaluateWindmillCompactCandidateAndRecordV1,
  WINDMILL_COMPACT_RECORD_HERTZ_V1,
  type WindmillCompactRecordedEvaluationV1,
  type WindmillCompactReplaySelectionBindingV1,
} from './windmill-compact-recorder.js';
import { windmillReplaySourceV2 } from './windmill-replay-codegen.js';
import {
  SOLVER_TIMESTEP_SECONDS_V1,
} from '../../tools/studio/solver-rate.js';

const EXPECTED_SEARCH_EVALUATION_SHA256 =
  'c72a66d4298203811b7b3798421e78fb6edf6205870a6d5af0f12e1ab36d86ea';

const SELECTION_BINDING = Object.freeze({
  schema: 'fixture.windmill-compact-replay-selection-binding/1',
  candidateParameterKey: 'r5-g1-s3-c3x1-a4-h3-q0',
  enumerationFingerprint: 'fnv1a64:226ecbd8deb520d5',
  selectionManifestSha256:
    '5a818962bb3b259b230f4eb3a417e599e845f0c4d6a916432ea7972cf8aaf1bc',
  searchEvidenceSha256:
    '27a8b6e31cc9e6f224c745f806b49449295defd05d76a8b2b6dfac5526edd6de',
  selectedSearchEvaluationSha256: EXPECTED_SEARCH_EVALUATION_SHA256,
  selectedProofNominalEvaluationSha256:
    WINDMILL_COMPACT_SELECTED_PROOF_NOMINAL_EVALUATION_SHA256_V1,
  selectedProofSha256: WINDMILL_COMPACT_SELECTED_PROOF_SHA256_V1,
  selectionSha256: WINDMILL_COMPACT_SELECTION_SHA256_V1,
} satisfies WindmillCompactReplaySelectionBindingV1);

function selectedCandidate(): WindmillCompactCandidateV1 {
  return createWindmillCompactCandidateV1({
    rotorRadiusVoxels: 5,
    groundClearanceVoxels: 1,
    sailRadialSpanVoxels: 3,
    camRadialLengthVoxels: 3,
    camHeightVoxels: 1,
    hammerRightArmLengthVoxels: 4,
    hammerHeadHeightVoxels: 3,
    initialHeadAnvilClearanceVoxels: 0,
  });
}

/**
 * Solver and record rate are the same 60 Hz now, so a recorded frame is
 * one solver tick. Derived, because a literal here would go on meaning a
 * sixteen-tick frame after the rate moved.
 */
const EXPECTED_SOLVER_TICKS_PER_RECORDED_FRAME =
  Math.round(
    (1 / WINDMILL_COMPACT_RECORD_HERTZ_V1) / SOLVER_TIMESTEP_SECONDS_V1,
  );

describe('compact Windmill same-kernel recorder', () => {
  let candidate: WindmillCompactCandidateV1;
  let recorded: WindmillCompactRecordedEvaluationV1;
  let repeated: WindmillCompactRecordedEvaluationV1;

  beforeAll(async () => {
    candidate = selectedCandidate();
    const searchName = `search:full:${candidate.parameterKey}`;
    [recorded, repeated] = await Promise.all([
      evaluateWindmillCompactCandidateAndRecordV1(
        candidate,
        SELECTION_BINDING,
        searchName,
      ),
      evaluateWindmillCompactCandidateAndRecordV1(
        candidate,
        SELECTION_BINDING,
        searchName,
      ),
    ]);
  }, 300_000);

  it('observes without changing the frozen selected evaluation hash', async () => {
    const unrecorded = await evaluateWindmillCompactCandidateV1(candidate, {
      name: `search:full:${candidate.parameterKey}`,
    });
    expect(recorded.evaluation.result.provenance.combinedEvaluationSha256)
      .toBe(EXPECTED_SEARCH_EVALUATION_SHA256);
    expect(unrecorded.result.provenance.combinedEvaluationSha256)
      .toBe(EXPECTED_SEARCH_EVALUATION_SHA256);
    expect(recorded.evaluation).toEqual(unrecorded);
  }, 180_000);

  it('records the exact solver-to-60 Hz finite cadence and body origins', () => {
    const { trace } = recorded;
    expect(trace.recordProfile).toMatchObject({
      solverStepSeconds: SOLVER_TIMESTEP_SECONDS_V1,
      recordStepSeconds: 1 / WINDMILL_COMPACT_RECORD_HERTZ_V1,
      solverTicksPerRecordedFrame: EXPECTED_SOLVER_TICKS_PER_RECORDED_FRAME,
      physicalDurationSeconds: 12,
      frameCount: 721,
    });
    expect(trace.recordProfile.presentationDurationMs).toBe(
      trace.recordProfile.frameCount
      * (trace.recordProfile.recordStepSeconds * 1_000),
    );
    expect(trace.placementIds).toEqual([
      'windmill-frame',
      'windmill-rotor',
      'trip-hammer',
      'windmill-anvil',
    ]);
    const compiled = compileWindmillCompactCandidateV1(candidate);
    const expectedOpening = [
      compiled.bodyWorldMeters.frame,
      compiled.bodyWorldMeters.rotor,
      compiled.bodyWorldMeters.hammer,
      compiled.bodyWorldMeters.anvil,
    ].flat();
    expect(Array.from(trace.translations.subarray(0, 12)))
      .toEqual(expectedOpening);
    expect(trace.translations.length).toBe(721 * 4 * 3);
    expect(trace.rotations.length).toBe(721 * 4 * 4);
    expect(trace.linearVelocities.length).toBe(721 * 4 * 3);
    expect(trace.angularVelocities.length).toBe(721 * 4 * 3);
    [
      trace.translations,
      trace.rotations,
      trace.linearVelocities,
      trace.angularVelocities,
    ].forEach((channel) => expect(channel.every(Number.isFinite)).toBe(true));
  });

  it('binds one manifold-backed cam and impact event to every cycle', () => {
    const { trace, evaluation } = recorded;
    expect(trace.events).toHaveLength(
      evaluation.evidence.completedCausalCycles * 2,
    );
    evaluation.evidence.cycleRecords.forEach((cycle) => {
      const events = trace.events.filter((event) =>
        event.cycle === cycle.cycle);
      expect(events.map(({ kind }) => kind)).toEqual([
        'cam-contact',
        'anvil-impact',
      ]);
      expect(events[0]).toMatchObject({
        camNoseKey: cycle.camNoseKey,
        tick: cycle.camContactTick,
        primaryPlacementId: 'trip-hammer',
        otherPlacementId: 'windmill-rotor',
      });
      expect(events[1]).toMatchObject({
        camNoseKey: cycle.camNoseKey,
        tick: cycle.impactTick,
        primaryPlacementId: 'trip-hammer',
        otherPlacementId: 'windmill-anvil',
      });
      events.forEach((event) => {
        expect(Math.hypot(...event.normal)).toBeCloseTo(1, 10);
        expect(event.normalImpulse).toBeGreaterThanOrEqual(0);
        expect(event.penetration).toBeGreaterThanOrEqual(0);
      });
    });
    expect(new Set(trace.events
      .filter(({ kind }) => kind === 'cam-contact')
      .map(({ camNoseKey }) => camNoseKey))).toEqual(new Set([
      'rotor-cam-nose',
      'rotor-opposed-cam-nose',
    ]));
  });

  it('is byte-deterministic across repeated same-kernel recordings', () => {
    expect(repeated.evaluation).toEqual(recorded.evaluation);
    expect(repeated.trace.finalHash).toBe(recorded.trace.finalHash);
    expect(repeated.trace.events).toEqual(recorded.trace.events);
    expect(repeated.trace.translations).toEqual(recorded.trace.translations);
    expect(repeated.trace.rotations).toEqual(recorded.trace.rotations);
    expect(repeated.trace.linearVelocities)
      .toEqual(recorded.trace.linearVelocities);
    expect(repeated.trace.angularVelocities)
      .toEqual(recorded.trace.angularVelocities);
    expect(windmillReplaySourceV2(repeated.trace))
      .toBe(windmillReplaySourceV2(recorded.trace));
  });

  it('refuses to encode a channel mutated after its evidence hash', () => {
    const translations = new Float32Array(recorded.trace.translations);
    translations[0] = translations[0]! + 1;
    expect(() => windmillReplaySourceV2({
      ...recorded.trace,
      translations,
    })).toThrow(/final hash .* does not bind the current channels/);
  });

  it('refuses to encode altered emitted provenance', () => {
    expect(() => windmillReplaySourceV2({
      ...recorded.trace,
      provenance: {
        ...recorded.trace.provenance,
        lawLabels: [
          ...recorded.trace.provenance.lawLabels,
          'gravity:invented',
        ],
      },
    })).toThrow(/emitted solver, timestep, gravity, input, law, or capability/);
  });

  it('rejects an unpromoted all-zero proof or selection hash', async () => {
    await expect(evaluateWindmillCompactCandidateAndRecordV1(
      candidate,
      Object.freeze({
        ...SELECTION_BINDING,
        selectedProofSha256: '0'.repeat(64),
      }),
    )).rejects.toThrow(/selectedProofSha256.*nonzero lowercase SHA-256/);
  });

  it('rejects a syntactically valid digest not in the promoted selection', async () => {
    await expect(evaluateWindmillCompactCandidateAndRecordV1(
      candidate,
      Object.freeze({
        ...SELECTION_BINDING,
        selectedProofSha256: 'f'.repeat(64),
      }),
    )).rejects.toThrow(/selectedProofSha256 .*expected exact promoted value/);
  });

  it('rejects a mutable selection/proof binding before simulation', async () => {
    await expect(evaluateWindmillCompactCandidateAndRecordV1(
      candidate,
      { ...SELECTION_BINDING },
    )).rejects.toThrow(/selection binding is mutable/);
  });

  it('exposes only deeply frozen plain observations to recorder hooks', async () => {
    let startObserved = false;
    let stepObserved = false;
    await evaluateWindmillCompactCandidateObservedV1(
      candidate,
      {
        name: 'observer-boundary',
        durationSeconds: SOLVER_TIMESTEP_SECONDS_V1,
      },
      {
        start(_effectiveRun, bodies): void {
          startObserved = true;
          expect(Object.isFrozen(bodies)).toBe(true);
          expect(Object.isFrozen(bodies.rotor)).toBe(true);
          expect(Object.isFrozen(
            bodies.rotor.bodyOriginTranslation,
          )).toBe(true);
          expect(Object.values(bodies.rotor)
            .some((value) => typeof value === 'function')).toBe(false);
          expect(() => {
            (bodies.rotor
              .bodyOriginTranslation as unknown as number[])[0] = 99;
          }).toThrow(TypeError);
        },
        step({ bodies, cam, impact }): void {
          stepObserved = true;
          expect(Object.isFrozen(bodies.hammer)).toBe(true);
          expect(Object.isFrozen(cam)).toBe(true);
          expect(Object.isFrozen(impact)).toBe(true);
        },
      },
    );
    expect(startObserved).toBe(true);
    expect(stepObserved).toBe(true);
  });
});

describe('compact Windmill contact witness orientation', () => {
  it('records body-origin velocity instead of asymmetric-body COM velocity', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.25, 0.25, 0.25)
          .setTranslation(1, 0, 0)
          .setDensity(1),
        body,
      );
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 2 }, false);
      const observation = createWindmillCompactBodyObservationV1(body);
      expect(Array.from(observation.bodyOriginLinearVelocity))
        .toEqual([
          body.velocityAtPoint(body.translation()).x,
          body.velocityAtPoint(body.translation()).y,
          body.velocityAtPoint(body.translation()).z,
        ]);
      expect(observation.bodyOriginLinearVelocity)
        .not.toEqual([body.linvel().x, body.linvel().y, body.linvel().z]);
      expect(Math.hypot(...observation.bodyOriginLinearVelocity))
        .toBeGreaterThan(0);
    } finally {
      world.free();
    }
  });

  it('returns the same point and opposite query-oriented normal', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    try {
      const fixed = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0),
      );
      const dynamic = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(0.9, 0, 0)
          .setLinvel(-1, 0, 0),
      );
      const left = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
        fixed,
      );
      const right = world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5),
        dynamic,
      );
      world.step();
      const indexed: {
        impulse: number;
        penetration: number;
        point: readonly [number, number, number];
      }[] = [];
      world.contactPair(left, right, (manifold, flipped) => {
        const internalFirst = flipped ? right : left;
        const internalSecond = flipped ? left : right;
        for (let index = 0; index < manifold.numContacts(); index += 1) {
          const local1 = manifold.localContactPoint1(index);
          const local2 = manifold.localContactPoint2(index);
          if (local1 === null || local2 === null) continue;
          const toWorld = (
            collider: typeof left,
            local: typeof local1,
          ) => {
            const rotated = rotateWindmillVectorV1(
              collider.rotation(),
              local,
            );
            const at = collider.translation();
            return {
              x: at.x + rotated.x,
              y: at.y + rotated.y,
              z: at.z + rotated.z,
            };
          };
          const point1 = toWorld(internalFirst, local1);
          const point2 = toWorld(internalSecond, local2);
          indexed.push({
            impulse: Math.max(0, manifold.contactImpulse(index)),
            penetration: Math.max(0, -manifold.contactDist(index)),
            point: [
              (point1.x + point2.x) / 2,
              (point1.y + point2.y) / 2,
              (point1.z + point2.z) / 2,
            ],
          });
        }
      });
      indexed.sort((leftContact, rightContact) =>
        rightContact.impulse - leftContact.impulse
        || rightContact.penetration - leftContact.penetration
        || leftContact.point[0] - rightContact.point[0]
        || leftContact.point[1] - rightContact.point[1]
        || leftContact.point[2] - rightContact.point[2]);
      const forward = windmillContactsBetweenV1(world, [left], [right]);
      const reverse = windmillContactsBetweenV1(world, [right], [left]);
      expect(forward.strongestSample).not.toBeNull();
      expect(reverse.strongestSample).not.toBeNull();
      expect(forward.strongestSample).toMatchObject({
        point: indexed[0]!.point,
        normalImpulse: indexed[0]!.impulse,
        penetration: indexed[0]!.penetration,
      });
      expect(reverse.strongestSample!.point)
        .toEqual(forward.strongestSample!.point);
      expect(reverse.strongestSample!.normal).toEqual(
        forward.strongestSample!.normal.map((value) => -value),
      );
      expect(reverse.maximumImpulse).toBe(forward.maximumImpulse);
      expect(reverse.maximumPenetration).toBe(forward.maximumPenetration);
    } finally {
      world.free();
    }
  });
});
