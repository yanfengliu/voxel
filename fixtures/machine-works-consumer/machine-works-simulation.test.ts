import { createHash } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  MACHINE_WORKS_ATTACHMENT_RULE,
  MACHINE_WORKS_LAYOUT,
  MACHINE_WORKS_TICKS,
  machineWorksInputDescriptionV1,
} from './machine-works-fixture-config.js';
import {
  MACHINE_WORKS_FIXED_STEP_MS,
  MACHINE_WORKS_FRAME_COUNT,
  MACHINE_WORKS_TRACK_IDS,
  assertMachineWorksAttachmentDwellV1,
  nextMachineWorksMatingDwellTicksV1,
  simulateMachineWorksV1,
  type MachineWorksTraceV1,
} from './machine-works-simulation.js';

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

describe('Machine Works consumer physics fixture', () => {
  let trace: MachineWorksTraceV1;

  beforeAll(async () => {
    trace = await simulateMachineWorksV1();
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
  });

  it('requires consecutive mating-port dwell before either compound merge', () => {
    expect(trace.attachmentEvidence).toEqual([
      {
        attachment: 'core-to-base',
        mergeTick: MACHINE_WORKS_TICKS.coreAttached,
        qualifyingTicks: expect.any(Number),
        requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
      },
      {
        attachment: 'cap-to-core',
        mergeTick: MACHINE_WORKS_TICKS.assembled,
        qualifyingTicks: expect.any(Number),
        requiredTicks: MACHINE_WORKS_ATTACHMENT_RULE.minimumDwellTicks,
      },
    ]);
    for (const evidence of trace.attachmentEvidence) {
      expect(evidence.qualifyingTicks).toBeGreaterThanOrEqual(evidence.requiredTicks);
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
    expect(ticks[0]).toBe(540);
    expect(ticks[1]).toBe(720);
    expect(ticks[2]).toBeGreaterThan(ticks[1]!);
    expect(ticks[3]).toBeGreaterThan(ticks[2]!);
    expect(trace.assemblyStates.at(-1)).toBe(5);
    const contact = trace.events.find(({ kind }) => kind === 'contact');
    if (contact?.kind !== 'contact') {
      throw new Error('The Machine Works trace must contain solver contact evidence.');
    }
    expect(contact.point.every(Number.isFinite)).toBe(true);
    expect(contact.point[0]).toBeGreaterThanOrEqual(MACHINE_WORKS_LAYOUT.bucketCenterX - 6);
    expect(contact.point[0]).toBeLessThanOrEqual(MACHINE_WORKS_LAYOUT.bucketCenterX + 6);
    expect(contact.point[1]).toBeGreaterThanOrEqual(0);
    expect(contact.point[1]).toBeLessThanOrEqual(10);
    expect(contact.point[2]).toBeGreaterThanOrEqual(-5);
    expect(contact.point[2]).toBeLessThanOrEqual(5);
    expect(Math.hypot(...contact.normal)).toBeCloseTo(1, 6);
    expect(contact.normalImpulse).toBeGreaterThan(0);
  });

  it('moves the supported product with the carriage before release', () => {
    const carriage = translation(trace, 719, 'assembly-carriage');
    const base = translation(trace, 719, 'product-base');
    expect(base[0]).toBeCloseTo(carriage[0], 3);
    expect(base[1] - carriage[1]).toBeCloseTo(1.8, 3);
    expect(base[2]).toBeCloseTo(carriage[2], 3);
  });

  it('keeps the release carriage physical while its servo tips out of the fall path', () => {
    const released = trace.events.find(({ kind }) => kind === 'released')!.tick;
    const tipped = translation(trace, 780, 'assembly-carriage');
    const tippedRotation = rotation(trace, 780, 'assembly-carriage');
    expect(tipped).toEqual(expect.arrayContaining([
      expect.closeTo(
        MACHINE_WORKS_LAYOUT.bucketCenterX + MACHINE_WORKS_LAYOUT.carriageHingeLocalX,
        3,
      ),
      expect.closeTo(
        MACHINE_WORKS_LAYOUT.carriageCenterY
          + Math.sin(MACHINE_WORKS_LAYOUT.carriageTipRadians)
            * -MACHINE_WORKS_LAYOUT.carriageHingeLocalX,
        3,
      ),
      expect.closeTo(0, 3),
    ]));
    expect(tippedRotation[2]).toBeCloseTo(-Math.SQRT1_2, 3);
    expect(tippedRotation[3]).toBeCloseTo(Math.SQRT1_2, 3);
    expect([...trace.supportContacts.slice(released, 781)]).toContain(1);
    const contactTick = trace.events.find(({ kind }) => kind === 'contact')!.tick;
    expect(trace.supportContacts.slice(781, contactTick).every((value) => value === 0)).toBe(true);
  });

  it('lets solver gravity accelerate the airborne assembly until bucket contact', () => {
    const contactTick = trace.events.find(({ kind }) => kind === 'contact')!.tick;
    const sampleEnd = Math.min(contactTick - 1, 740);
    const expectedDelta = -9.81 * (MACHINE_WORKS_FIXED_STEP_MS / 1_000);
    for (let frame = 722; frame <= sampleEnd; frame += 1) {
      const before = linearVelocityY(trace, frame - 1, 'product-base');
      const after = linearVelocityY(trace, frame, 'product-base');
      expect(after - before).toBeCloseTo(expectedDelta, 4);
    }
    expect(translation(trace, sampleEnd, 'product-base')[1])
      .toBeLessThan(translation(trace, 720, 'product-base')[1]);
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
    expect(repeated.attachmentEvidence).toEqual(trace.attachmentEvidence);
  });
});
