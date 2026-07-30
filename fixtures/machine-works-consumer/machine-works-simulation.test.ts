import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_BELT_DRIVE,
  MACHINE_WORKS_COLLECTION_RULE,
  MACHINE_WORKS_HEAD_ACTUATION_RULE,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_PICKUP_RULE,
  MACHINE_WORKS_TICKS,
  machineWorksInputDescriptionV1,
} from './machine-works-fixture-config.js';
import {
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_TRACK_IDS,
  assertMachineWorksAttachmentDwellV1,
  assertMachineWorksMergeCorrectionV1,
  assertMachineWorksMergePenetrationV1,
  nextMachineWorksMatingDwellTicksV1,
  simulateMachineWorksV1,
  type MachineWorksTraceV1,
} from './machine-works-simulation.js';
import {
  MACHINE_WORKS_CONVEYOR_SLAT_IDS,
  MACHINE_WORKS_CONVEYOR_V1,
  MACHINE_WORKS_EXPOSED_COGS_V1,
  machineWorksDrumMotionV1,
  machineWorksExposedCogMotionV1,
  machineWorksSlatMotionV1,
} from '../../tools/studio/machine-works-conveyor.js';
import { MACHINE_WORKS_SCENE_LAYOUT_V1 } from '../../tools/studio/machine-works-layout.js';

function translation(
  trace: MachineWorksTraceV1,
  frame: number,
  placementId: string,
): readonly [number, number, number] {
  const slot = trace.placementIds.indexOf(
    placementId as MachineWorksTraceV1['placementIds'][number],
  );
  if (slot < 0) throw new Error(`Unknown Machine Works placement '${placementId}'.`);
  const offset = (frame * trace.placementIds.length + slot) * 3;
  return [
    trace.translations[offset]!,
    trace.translations[offset + 1]!,
    trace.translations[offset + 2]!,
  ];
}

function linearVelocityY(
  trace: MachineWorksTraceV1,
  frame: number,
  placementId: string,
): number {
  const slot = trace.placementIds.indexOf(
    placementId as MachineWorksTraceV1['placementIds'][number],
  );
  const offset = (frame * trace.placementIds.length + slot) * 3;
  return trace.linearVelocities[offset + 1]!;
}

function linearVelocity(
  trace: MachineWorksTraceV1,
  frame: number,
  placementId: string,
): readonly [number, number, number] {
  const slot = trace.placementIds.indexOf(
    placementId as MachineWorksTraceV1['placementIds'][number],
  );
  if (slot < 0) throw new Error(`Unknown Machine Works placement '${placementId}'.`);
  const offset = (frame * trace.placementIds.length + slot) * 3;
  return [
    trace.linearVelocities[offset]!,
    trace.linearVelocities[offset + 1]!,
    trace.linearVelocities[offset + 2]!,
  ];
}

function angularVelocityZ(
  trace: MachineWorksTraceV1,
  frame: number,
  placementId: string,
): number {
  const slot = trace.placementIds.indexOf(
    placementId as MachineWorksTraceV1['placementIds'][number],
  );
  if (slot < 0) throw new Error(`Unknown Machine Works placement '${placementId}'.`);
  const offset = (frame * trace.placementIds.length + slot) * 3;
  return trace.angularVelocities[offset + 2]!;
}

function rotation(
  trace: MachineWorksTraceV1,
  frame: number,
  placementId: string,
): readonly [number, number, number, number] {
  const slot = trace.placementIds.indexOf(
    placementId as MachineWorksTraceV1['placementIds'][number],
  );
  const offset = (frame * trace.placementIds.length + slot) * 4;
  return [
    trace.rotations[offset]!,
    trace.rotations[offset + 1]!,
    trace.rotations[offset + 2]!,
    trace.rotations[offset + 3]!,
  ];
}

function relativeTranslation(
  trace: MachineWorksTraceV1,
  frame: number,
  childPlacementId: string,
  parentPlacementId: string,
): readonly [number, number, number] {
  const child = translation(trace, frame, childPlacementId);
  const parent = translation(trace, frame, parentPlacementId);
  return [
    child[0] - parent[0],
    child[1] - parent[1],
    child[2] - parent[2],
  ];
}

describe('Machine Works consumer physics fixture', () => {
  let trace: MachineWorksTraceV1;

  beforeAll(async () => {
    trace = await simulateMachineWorksV1();
  });

  it('rejects merge penetration above the hashed slop budget', () => {
    expect(() => assertMachineWorksMergePenetrationV1(
      'adversarial overlap',
      42,
      MACHINE_WORKS_ATTACHMENT_RULE.maximumMergePenetration + 0.000_001,
    )).toThrow(/adversarial overlap.*fixed tick 42.*exceeds the declared merge slop/s);
  });

  it('rejects an excessive or invalid canonical merge correction', () => {
    expect(() => assertMachineWorksMergeCorrectionV1(
      'adversarial correction',
      43,
      {
        position: MACHINE_WORKS_ATTACHMENT_RULE.maximumMergePositionCorrection + 0.000_001,
        angleRadians: 0,
      },
    )).toThrow(/adversarial correction.*fixed tick 43.*exceeding limits/s);
    expect(() => assertMachineWorksMergeCorrectionV1(
      'invalid correction',
      44,
      { position: Number.NaN, angleRadians: -1 },
    )).toThrow(/invalid correction.*fixed tick 44.*finite and nonnegative/s);
  });

  it('emits one bounded immutable pose and velocity frame per fixed tick', () => {
    expect(trace.fixedStepMs).toBe(MACHINE_WORKS_FIXED_STEP_MS);
    expect(trace.frameCount).toBe(MACHINE_WORKS_FRAME_COUNT);
    expect(trace.placementIds).toEqual(MACHINE_WORKS_TRACK_IDS);
    expect(trace.translations).toHaveLength(trace.frameCount * trace.placementIds.length * 3);
    expect(trace.rotations).toHaveLength(trace.frameCount * trace.placementIds.length * 4);
    expect(trace.linearVelocities).toHaveLength(trace.translations.length);
    expect(trace.angularVelocities).toHaveLength(trace.translations.length);
    expect(trace.assemblyStates).toHaveLength(trace.frameCount);
    expect(trace.supportContacts).toHaveLength(trace.frameCount);
    expect(trace.beltContacts).toHaveLength(trace.frameCount);
    expect(trace.beltTravel).toHaveLength(trace.frameCount);
    expect(trace.beltSpeeds).toHaveLength(trace.frameCount);
    expect(trace.attachmentEvidence).toHaveLength(2);
    expect(trace.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(trace.finalHash).toMatch(/^[0-9a-f]{64}$/);
    expect(trace.provenance.inputHash).toBe(trace.inputHash);
    expect(trace.provenance.finalHash).toBe(trace.finalHash);
    expect(trace.provenance.solver).toEqual({
      name: '@dimforge/rapier3d-compat',
      version: '0.19.3',
    });
    expect(trace.provenance.capabilityLabels).toContain('colliding-tip-release');
    expect(trace.provenance.capabilityLabels).toContain('belt-contact-transport');
    expect(trace.provenance.capabilityLabels).toContain('drive-phase-indicators');
    expect(trace.provenance.capabilityLabels).toContain('preloaded-magnetic-pickup');
    expect(trace.provenance.capabilityLabels).toContain('validated-keyed-seat');
  });

  it('keeps each preloaded component on its magnetic pickup face until keyed insertion releases it', () => {
    expect(MACHINE_WORKS_PICKUP_RULE).toMatchObject({
      loading: 'preloaded-before-frame-zero',
      hold: 'energized-fixed-joint',
      pickupDuringReplay: false,
      articulatedJaws: false,
    });
    expect(MACHINE_WORKS_HEAD_ACTUATION_RULE).toMatchObject({
      supportPlacementId: 'assembly-press-bridge',
      solverMode: 'kinematic-position-command',
      pickupStateAtFrameZero: 'precharged-and-energized',
    });
    expect(MACHINE_WORKS_HEAD_ACTUATION_RULE.externalActuationPath)
      .toEqual(expect.arrayContaining(['face-connected-overhead-bus', 'fixed-linear-stator-spines']));
    expect(MACHINE_WORKS_HEAD_ACTUATION_RULE.pickupHoldPath)
      .toEqual(expect.arrayContaining(['precharged-head-local-energy-buffer', 'electromagnetic-pickup-plates']));

    const coreAtStart = relativeTranslation(trace, 0, 'product-core', 'core-head');
    const coreBeforeLock = relativeTranslation(
      trace,
      MACHINE_WORKS_TICKS.coreAttached - 1,
      'product-core',
      'core-head',
    );
    const capAtStart = relativeTranslation(trace, 0, 'product-cap', 'cap-head');
    const capBeforeLock = relativeTranslation(
      trace,
      MACHINE_WORKS_TICKS.assembled - 1,
      'product-cap',
      'cap-head',
    );
    const coreHoldError = Math.max(...coreBeforeLock.map((value, axis) =>
      Math.abs(value - coreAtStart[axis]!)));
    const capHoldError = Math.max(...capBeforeLock.map((value, axis) =>
      Math.abs(value - capAtStart[axis]!)));
    expect(coreHoldError).toBeLessThan(MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError);
    expect(capHoldError).toBeLessThan(MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError);

    const coreAfterRelease = relativeTranslation(
      trace,
      MACHINE_WORKS_TICKS.coreAttached + 30,
      'product-core',
      'core-head',
    );
    const capAfterRelease = relativeTranslation(
      trace,
      MACHINE_WORKS_TICKS.assembled + 30,
      'product-cap',
      'cap-head',
    );
    expect(coreAfterRelease[1]).not.toBeCloseTo(coreAtStart[1], 2);
    expect(capAfterRelease[1]).not.toBeCloseTo(capAtStart[1], 2);
  });

  it('requires consecutive mating-port dwell before either compound merge', () => {
    expect(trace.attachmentEvidence).toEqual([
      {
        attachment: 'core-to-base',
        mergeTick: MACHINE_WORKS_TICKS.coreAttached,
        qualifyingTicks: expect.any(Number),
        requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
        positionCorrection: expect.any(Number),
        orientationCorrection: expect.any(Number),
        maximumPenetration: expect.any(Number),
        allowedPenetration: MACHINE_WORKS_ATTACHMENT_RULE.maximumMergePenetration,
      },
      {
        attachment: 'cap-to-core',
        mergeTick: MACHINE_WORKS_TICKS.assembled,
        qualifyingTicks: expect.any(Number),
        requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
        positionCorrection: expect.any(Number),
        orientationCorrection: expect.any(Number),
        maximumPenetration: expect.any(Number),
        allowedPenetration: MACHINE_WORKS_ATTACHMENT_RULE.maximumMergePenetration,
      },
    ]);
    for (const evidence of trace.attachmentEvidence) {
      expect(evidence.qualifyingTicks).toBeGreaterThanOrEqual(evidence.requiredTicks);
      expect(evidence.positionCorrection)
        .toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumMergePositionCorrection);
      expect(evidence.positionCorrection).toBeGreaterThanOrEqual(0);
      expect(evidence.orientationCorrection)
        .toBeLessThanOrEqual(
          MACHINE_WORKS_ATTACHMENT_RULE.maximumMergeAngularCorrectionRadians,
        );
      expect(evidence.orientationCorrection).toBeGreaterThanOrEqual(0);
      expect(evidence.maximumPenetration).toBeGreaterThanOrEqual(0);
      expect(evidence.maximumPenetration).toBeLessThanOrEqual(evidence.allowedPenetration);
    }
    expect(trace.assemblyStates[MACHINE_WORKS_TICKS.coreAttached - 1]).toBe(0);
    expect(trace.assemblyStates[MACHINE_WORKS_TICKS.coreAttached]).toBe(1);
    expect(trace.assemblyStates[MACHINE_WORKS_TICKS.assembled - 1]).toBe(1);
    expect(trace.assemblyStates[MACHINE_WORKS_TICKS.assembled]).toBe(2);
  });

  it('resets interrupted dwell and rejects an instantaneous valid merge', () => {
    const valid = {
      positionError: 0,
      relativeSpeed: 0,
      orientationError: 0,
      withinTolerance: true,
    };
    const invalid = {
      ...valid,
      positionError: MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError + 0.001,
      withinTolerance: false,
    };
    expect(nextMachineWorksMatingDwellTicksV1(12, invalid)).toBe(0);
    expect(nextMachineWorksMatingDwellTicksV1(0, valid)).toBe(1);
    expect(() => {
      assertMachineWorksAttachmentDwellV1('test part', 42, 1, valid);
    }).toThrow(
      'only 1 consecutive in-tolerance ticks were observed, but 20 are required',
    );
    expect(() => {
      assertMachineWorksAttachmentDwellV1(
        'test part',
        42,
        MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
        valid,
      );
    }).not.toThrow();
  });

  it('hashes the minimum dwell rule as part of the complete canonical solver input', () => {
    const description = machineWorksInputDescriptionV1();
    expect(description).toMatchObject({
      timeline: {
        headActuation: MACHINE_WORKS_HEAD_ACTUATION_RULE,
      },
      pickupRule: MACHINE_WORKS_PICKUP_RULE,
      assemblyRule: {
        maximumOrientationError: MACHINE_WORKS_ATTACHMENT_RULE.maximumOrientationError,
        minimumDwellTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
      },
    });
    expect(createHash('sha256').update(JSON.stringify(description)).digest('hex'))
      .toBe(trace.inputHash);
  });

  it('assembles, releases, physically contacts, and collects in causal order', () => {
    expect(trace.events.map(({ kind }) => kind)).toEqual([
      'assembled',
      'released',
      'contact',
      'collected',
    ]);
    const ticks = trace.events.map(({ tick }) => tick);
    expect(ticks).toEqual([...ticks].sort((left, right) => left - right));
    expect(ticks[0]).toBe(MACHINE_WORKS_TICKS.assembled);
    expect(ticks[1]).toBe(MACHINE_WORKS_TICKS.released);
    expect(ticks[2]).toBeGreaterThan(ticks[1]!);
    expect(ticks[3]).toBeGreaterThan(ticks[2]!);
    expect(trace.assemblyStates.at(-1)).toBe(5);
    const contact = trace.events.find(({ kind }) => kind === 'contact');
    if (contact?.kind !== 'contact') {
      throw new Error('The Machine Works trace must contain solver contact evidence.');
    }
    expect(contact.point.every(Number.isFinite)).toBe(true);
    const bucketHalfWidth = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[0]
      * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain / 2;
    expect(contact.point[0]).toBeGreaterThanOrEqual(
      MACHINE_WORKS_LAYOUT.bucketCenterX - bucketHalfWidth,
    );
    expect(contact.point[0]).toBeLessThanOrEqual(
      MACHINE_WORKS_LAYOUT.bucketCenterX + bucketHalfWidth,
    );
    expect(contact.point[1]).toBeGreaterThanOrEqual(0);
    const bucketTop = MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.at[1]
      + MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.sizeVoxels[1]
        * MACHINE_WORKS_SCENE_LAYOUT_V1.bucket.grain;
    expect(contact.point[1]).toBeLessThanOrEqual(
      bucketTop + MACHINE_WORKS_COLLECTION_RULE.containmentMargin,
    );
    expect(contact.point[2]).toBeGreaterThanOrEqual(-5);
    expect(contact.point[2]).toBeLessThanOrEqual(5);
    expect(Math.hypot(...contact.normal)).toBeCloseTo(1, 5);
    expect(contact.normalImpulse).toBeGreaterThan(0);
  });

  it('uses exact moving slat contact to transport the dynamic carrier between stations', () => {
    const carriage = translation(trace, MACHINE_WORKS_TICKS.released - 1, 'assembly-carriage');
    const base = translation(trace, MACHINE_WORKS_TICKS.released - 1, 'product-base');
    expect(base[0]).toBeCloseTo(carriage[0], 3);
    // The base rests on the deck: deck top (center + 1.0) plus half the
    // base height (0.6).
    expect(base[1] - carriage[1]).toBeCloseTo(1.6, 3);
    expect(base[2]).toBeCloseTo(carriage[2], 3);
    expect(Math.abs(
      translation(trace, MACHINE_WORKS_TICKS.coreAttached, 'assembly-carriage')[0]
        - MACHINE_WORKS_LAYOUT.coreStationX,
    )).toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError);
    expect(Math.abs(
      translation(trace, MACHINE_WORKS_TICKS.assembled, 'assembly-carriage')[0]
        - MACHINE_WORKS_LAYOUT.capStationX,
    )).toBeLessThanOrEqual(MACHINE_WORKS_ATTACHMENT_RULE.maximumPositionError);
    expect(Math.abs(
      translation(trace, MACHINE_WORKS_TICKS.released, 'assembly-carriage')[0]
        - MACHINE_WORKS_LAYOUT.tipStationX,
    )).toBeLessThanOrEqual(MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumPositionError);
    const drivenContactTicks = trace.beltContacts
      .slice(60, MACHINE_WORKS_TICKS.released)
      .reduce((sum, contact) => sum + contact, 0);
    expect(drivenContactTicks).toBeGreaterThan(120);
    expect(trace.beltTravel[MACHINE_WORKS_TICKS.released - 1]).toBeGreaterThan(0);
    expect(
      trace.zeroDriveCounterfactual.maximumAbsoluteDisplacement,
    ).toBeLessThanOrEqual(
      MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive.maximumDisplacement,
    );
    expect(trace.zeroDriveCounterfactual).toMatchObject({
      tickCount: MACHINE_WORKS_BELT_DRIVE.counterfactual.ticks,
      driveScale: MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive.driveScale,
      frictionScale: MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroDrive.frictionScale,
      maximumAbsoluteDisplacement: 0,
    });
    const ablationFrame = MACHINE_WORKS_BELT_DRIVE.counterfactual.ticks;
    const drivenDisplacement = Math.abs(
      translation(trace, ablationFrame, 'assembly-carriage')[0]
        - trace.zeroFrictionCounterfactual.initialCarrierX,
    );
    expect(
      trace.zeroFrictionCounterfactual.maximumAbsoluteDisplacement
        / drivenDisplacement,
    ).toBeLessThanOrEqual(
      MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction
        .maximumDrivenDisplacementRatio,
    );
    expect(trace.zeroFrictionCounterfactual).toMatchObject({
      tickCount: MACHINE_WORKS_BELT_DRIVE.counterfactual.ticks,
      driveScale: MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction.driveScale,
      frictionScale: MACHINE_WORKS_BELT_DRIVE.counterfactual.zeroFriction.frictionScale,
      maximumAbsoluteDisplacement: 0,
    });
    expect(carriage[0] - trace.zeroDriveCounterfactual.initialCarrierX).toBeGreaterThan(35);
  });

  it('keeps every visible slat and cog on the same hashed belt phase', () => {
    for (const frame of [0, 240, 700, MACHINE_WORKS_TICKS.released - 1]) {
      const travel = trace.beltTravel[frame]!;
      const speed = trace.beltSpeeds[frame]!;
      for (const index of [0, 7, 21, MACHINE_WORKS_CONVEYOR_SLAT_IDS.length - 1]) {
        const expected = machineWorksSlatMotionV1(index, travel, speed);
        const observed = translation(trace, frame, MACHINE_WORKS_CONVEYOR_SLAT_IDS[index]!);
        expect(observed[0]).toBeCloseTo(expected.position.x, 4);
        expect(observed[1]).toBeCloseTo(expected.position.y, 4);
        expect(observed[2]).toBeCloseTo(expected.position.z, 4);
        const observedRotation = rotation(
          trace,
          frame,
          MACHINE_WORKS_CONVEYOR_SLAT_IDS[index]!,
        );
        const dot = observedRotation[0] * expected.rotation.x
          + observedRotation[1] * expected.rotation.y
          + observedRotation[2] * expected.rotation.z
          + observedRotation[3] * expected.rotation.w;
        expect(Math.abs(dot)).toBeCloseTo(1, 4);
      }
      for (const [side, id] of [
        ['west', 'belt-drive-west'],
        ['east', 'belt-drive-east'],
      ] as const) {
        const expectedDrum = machineWorksDrumMotionV1(side, travel, speed);
        const observedDrumRotation = rotation(trace, frame, id);
        const dot = observedDrumRotation[0] * expectedDrum.rotation.x
          + observedDrumRotation[1] * expectedDrum.rotation.y
          + observedDrumRotation[2] * expectedDrum.rotation.z
          + observedDrumRotation[3] * expectedDrum.rotation.w;
        expect(Math.abs(dot)).toBeCloseTo(1, 4);
        expect(
          angularVelocityZ(trace, frame, id)
            * MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
        ).toBeCloseTo(-speed, 3);
      }
      MACHINE_WORKS_EXPOSED_COGS_V1.forEach(({ id }, index) => {
        const expectedCog = machineWorksExposedCogMotionV1(index, travel, speed);
        expect(translation(trace, frame, id)).toEqual(expect.arrayContaining([
          expect.closeTo(expectedCog.position.x, 4),
          expect.closeTo(expectedCog.position.y, 4),
          expect.closeTo(expectedCog.position.z, 4),
        ]));
        const observedCogRotation = rotation(trace, frame, id);
        const dot = observedCogRotation[0] * expectedCog.rotation.x
          + observedCogRotation[1] * expectedCog.rotation.y
          + observedCogRotation[2] * expectedCog.rotation.z
          + observedCogRotation[3] * expectedCog.rotation.w;
        expect(Math.abs(dot)).toBeCloseTo(1, 4);
        expect(
          angularVelocityZ(trace, frame, id)
            * MACHINE_WORKS_CONVEYOR_V1.pitchRadius,
        ).toBeCloseTo(-speed, 3);
      });
    }
  });

  it('records every exposed phase-witness cog exactly from its paired drum', () => {
    const vector = (
      values: Float32Array,
      frame: number,
      placementId: string,
      width: 3 | 4,
    ): readonly number[] => {
      const slot = trace.placementIds.indexOf(
        placementId as MachineWorksTraceV1['placementIds'][number],
      );
      if (slot < 0) throw new Error(`Unknown Machine Works placement '${placementId}'.`);
      const offset = (frame * trace.placementIds.length + slot) * width;
      return [...values.slice(offset, offset + width)];
    };
    for (let frame = 0; frame < trace.frameCount; frame += 1) {
      for (const descriptor of MACHINE_WORKS_EXPOSED_COGS_V1) {
        const drumId = descriptor.side === 'west'
          ? 'belt-drive-west'
          : 'belt-drive-east';
        const drumTranslation = vector(trace.translations, frame, drumId, 3);
        const cogTranslation = vector(trace.translations, frame, descriptor.id, 3);
        const cogRotation = vector(trace.rotations, frame, descriptor.id, 4);
        // The flag's origin is its painted middle, below the hub, so the
        // recorded translation orbits the axle. The rigid derivation to pin
        // is that the hub point itself never leaves the paired drum's axle.
        const hubOffset = MACHINE_WORKS_CONVEYOR_V1.cogHubOffsetVoxels
          * MACHINE_WORKS_CONVEYOR_V1.drumGrain;
        const sinHalf = cogRotation[2]!;
        const cosHalf = cogRotation[3]!;
        const hub = [
          cogTranslation[0]! - hubOffset * 2 * sinHalf * cosHalf,
          cogTranslation[1]! + hubOffset * (1 - 2 * sinHalf * sinHalf),
          cogTranslation[2]!,
        ];
        expect(hub[0]).toBeCloseTo(drumTranslation[0]!, 5);
        expect(hub[1]).toBeCloseTo(drumTranslation[1]!, 5);
        expect(hub[2]).toBeCloseTo(descriptor.z, 5);
        expect(cogRotation).toEqual(vector(trace.rotations, frame, drumId, 4));
        // The origin orbits, so its velocity is the drum's angular rate
        // crossed with the origin's offset from the axle.
        const angular = vector(trace.angularVelocities, frame, descriptor.id, 3);
        const radial = [
          cogTranslation[0]! - drumTranslation[0]!,
          cogTranslation[1]! - drumTranslation[1]!,
        ];
        const orbital = vector(trace.linearVelocities, frame, descriptor.id, 3);
        expect(orbital[0]).toBeCloseTo(-angular[2]! * radial[1]!, 5);
        expect(orbital[1]).toBeCloseTo(angular[2]! * radial[0]!, 5);
        expect(orbital[2]).toBeCloseTo(0, 5);
        expect(angular).toEqual(vector(trace.angularVelocities, frame, drumId, 3));
      }
    }
    const description = machineWorksInputDescriptionV1();
    expect(description).toMatchObject({
      presentationSupports: {
        exposedDrivePhaseFlags: {
          placements: MACHINE_WORKS_EXPOSED_COGS_V1,
          interaction: expect.stringContaining('not ingested into Rapier'),
        },
        outputDock: {
          placementId: 'assembly-output-dock',
          interaction: expect.stringMatching(/trunnion.*not ingested into Rapier/i),
        },
      },
    });
    expect(description.bodyCreationOrder).not.toEqual(expect.arrayContaining(
      MACHINE_WORKS_EXPOSED_COGS_V1.map(({ id }) => id),
    ));
    expect(description.bodyCreationOrder).not.toContain('output-dock');
  });

  it('keeps the release carriage physical while its visible dock-aligned servo tips out of the fall path', () => {
    const released = trace.events.find(({ kind }) => kind === 'released')!.tick;
    const beforeHandoff = translation(trace, released - 1, 'assembly-carriage');
    const handoff = translation(trace, released, 'assembly-carriage');
    const baseBeforeHandoff = translation(trace, released - 1, 'product-base');
    const baseAtHandoff = translation(trace, released, 'product-base');
    const handoffVelocity = linearVelocity(trace, released, 'assembly-carriage');
    const tipped = translation(trace, MACHINE_WORKS_TICKS.tipComplete, 'assembly-carriage');
    const tippedRotation = rotation(trace, MACHINE_WORKS_TICKS.tipComplete, 'assembly-carriage');
    expect(trace.outputDockEvidence).toMatchObject({
      tick: released,
      tipRadians: MACHINE_WORKS_LAYOUT.carriageTipRadians,
      requiredClearance: MACHINE_WORKS_SCENE_LAYOUT_V1.outputDock.minimumSweptClearance,
      limitingFoundationCarrierSolid: 6,
      limitingFoundationSolid: 22,
      limitingBucketCarrierSolid: 3,
      limitingBucketSolid: 8,
    });
    expect(trace.outputDockEvidence.pivot[0]).toBeCloseTo(
      handoff[0] + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
      5,
    );
    // The tip-pivot-axis port sits half a voxel above the carrier center.
    expect(trace.outputDockEvidence.pivot[1]).toBeCloseTo(handoff[1] + 0.2, 5);
    expect(trace.outputDockEvidence.sweptRadius).toBeCloseTo(Math.hypot(0.2, 0.4), 5);
    expect(trace.outputDockEvidence.minimumClearance)
      .toBeGreaterThan(trace.outputDockEvidence.requiredClearance);
    expect(trace.outputDockEvidence.minimumClearance).toBeCloseTo(
      MACHINE_WORKS_LAYOUT.outputDockCenterX + 1
        - trace.outputDockEvidence.pivot[0]
        - trace.outputDockEvidence.sweptRadius,
      5,
    );
    expect(trace.outputDockEvidence.minimumFoundationClearance)
      .toBeCloseTo(0.7517659729814863, 6);
    expect(trace.outputDockEvidence.minimumBucketClearance)
      .toBeCloseTo(0.5989795684814467, 6);
    expect(Math.hypot(
      handoff[0] - beforeHandoff[0],
      handoff[1] - beforeHandoff[1],
      handoff[2] - beforeHandoff[2],
    )).toBeLessThan(0.01);
    expect(Math.hypot(...handoffVelocity)).toBeLessThanOrEqual(
      MACHINE_WORKS_BELT_DRIVE.stationTolerance.maximumSpeed,
    );
    expect(Math.hypot(
      (baseAtHandoff[0] - handoff[0]) - (baseBeforeHandoff[0] - beforeHandoff[0]),
      (baseAtHandoff[1] - handoff[1]) - (baseBeforeHandoff[1] - beforeHandoff[1]),
      (baseAtHandoff[2] - handoff[2]) - (baseBeforeHandoff[2] - beforeHandoff[2]),
    )).toBeLessThan(0.01);
    expect(tipped).toEqual(expect.arrayContaining([
      expect.closeTo(
        handoff[0] + MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
        3,
      ),
      expect.closeTo(
          handoff[1]
          + Math.sin(MACHINE_WORKS_LAYOUT.carriageTipRadians)
            * -MACHINE_WORKS_LAYOUT.carriageTipPivotLocalX,
        3,
      ),
      expect.closeTo(handoff[2], 3),
    ]));
    expect(tippedRotation[2]).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(tippedRotation[3]).toBeCloseTo(Math.SQRT1_2, 3);
    expect([...trace.supportContacts.slice(released, MACHINE_WORKS_TICKS.tipComplete + 1)])
      .toContain(1);
    const contactTick = trace.events.find(({ kind }) => kind === 'contact')!.tick;
    const lastCarrierContact = trace.supportContacts
      .slice(released, contactTick)
      .lastIndexOf(1) + released;
    expect(lastCarrierContact).toBeLessThan(contactTick);
    expect(
      trace.supportContacts
        .slice(lastCarrierContact + 1, contactTick)
        .every((value) => value === 0),
    ).toBe(true);
  });

  it('lets solver gravity accelerate the airborne assembly until bucket contact', () => {
    const contactTick = trace.events.find(({ kind }) => kind === 'contact')!.tick;
    const lastCarrierContact = trace.supportContacts
      .slice(MACHINE_WORKS_TICKS.released, contactTick)
      .lastIndexOf(1) + MACHINE_WORKS_TICKS.released;
    const sampleStart = lastCarrierContact + 2;
    const sampleEnd = contactTick - 1;
    expect(sampleEnd - sampleStart).toBeGreaterThan(3);
    const downwardDeltas: number[] = [];
    for (let frame = sampleStart; frame <= sampleEnd; frame += 1) {
      const before = linearVelocityY(trace, frame - 1, 'product-base');
      const after = linearVelocityY(trace, frame, 'product-base');
      const delta = after - before;
      if (delta < 0) downwardDeltas.push(delta);
    }
    expect(downwardDeltas.length).toBeGreaterThan((sampleEnd - sampleStart) * 0.8);
    const elapsedSeconds = (sampleEnd - sampleStart) * MACHINE_WORKS_FIXED_STEP_MS / 1_000;
    const observedAverageAcceleration = (
      linearVelocityY(trace, sampleEnd, 'product-base')
        - linearVelocityY(trace, sampleStart, 'product-base')
    ) / elapsedSeconds;
    expect(observedAverageAcceleration).toBeLessThan(-5);
    expect(observedAverageAcceleration).toBeGreaterThan(-20);
    expect(translation(trace, sampleEnd, 'product-base')[1])
      .toBeLessThan(translation(trace, sampleStart, 'product-base')[1]);
  });

  it('replays byte-identically for the same solver version, input, and order', async () => {
    const repeated = await simulateMachineWorksV1();
    expect(repeated.inputHash).toBe(trace.inputHash);
    expect(repeated.finalHash).toBe(trace.finalHash);
    expect(repeated.events).toEqual(trace.events);
    expect(repeated.translations).toEqual(trace.translations);
    expect(repeated.rotations).toEqual(trace.rotations);
    expect(repeated.assemblyStates).toEqual(trace.assemblyStates);
    expect(repeated.supportContacts).toEqual(trace.supportContacts);
    expect(repeated.beltContacts).toEqual(trace.beltContacts);
    expect(repeated.beltTravel).toEqual(trace.beltTravel);
    expect(repeated.beltSpeeds).toEqual(trace.beltSpeeds);
    expect(repeated.zeroDriveCounterfactual).toEqual(trace.zeroDriveCounterfactual);
    expect(repeated.zeroFrictionCounterfactual).toEqual(trace.zeroFrictionCounterfactual);
    expect(repeated.attachmentEvidence).toEqual(trace.attachmentEvidence);
    expect(repeated.outputDockEvidence).toEqual(trace.outputDockEvidence);
  });
});
