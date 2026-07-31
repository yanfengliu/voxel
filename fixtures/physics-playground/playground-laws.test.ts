import { describe, expect, it } from 'vitest';

import {
  assertAllMaterialsLawfulV1,
  assertLawfulMaterialV1,
  governedMaterialsV1,
  physicsLawValuesForV1,
  PHYSICS_LAWS_V1,
  applyPhysicsLawsToBodyV1,
} from '../../tools/studio/physics-laws.js';
import {
  PLAYGROUND_MATERIALS_V1,
} from '../../tools/studio/physics-playground-materials.js';
import {
  createPhysicsPlaygroundStationsV1,
} from '../../tools/studio/physics-playground-stations.js';
import { playgroundBodySpecsV1 } from '../../tools/studio/physics-playground-bodies.js';
import { initPlaygroundRapierV1, PlaygroundWorldV1 } from './playground-world.js';

/**
 * The laws of this universe hold for everything, which is a claim only
 * worth making if something checks it. These tests are that something:
 * they walk every material and every body of every station and prove no
 * content escapes a law by declaring nothing.
 */
describe('the laws of the voxel universe', () => {
  it('governs every material the playground declares', () => {
    for (const id of Object.keys(PLAYGROUND_MATERIALS_V1)) {
      expect(governedMaterialsV1(), `material '${id}' has no law entry`)
        .toContain(id);
      const laws = physicsLawValuesForV1(id);
      expect(laws.rollingResistance, id).toBeGreaterThan(0);
      expect(laws.bearingFriction, id).toBeGreaterThan(0);
      expect(laws.airDrag, id).toBeGreaterThan(0);
    }
  });

  it('governs a body that names no material at all', () => {
    // The chain's links and the ball drop's balls declare no material.
    // They are still subject to every law.
    const laws = physicsLawValuesForV1(undefined);
    expect(laws.rollingResistance).toBeGreaterThan(0);
    expect(laws.bearingFriction).toBeGreaterThan(0);
    expect(laws.airDrag).toBeGreaterThan(0);
    expect(physicsLawValuesForV1('not-a-real-material')).toEqual(laws);
  });

  it('holds every material to returning less energy than it receives', () => {
    assertAllMaterialsLawfulV1();
    expect(() => {
      assertLawfulMaterialV1('bouncy', { restitution: 1.2, friction: 0.5 });
    }).toThrow(/returns less energy than it receives/);
    expect(() => {
      assertLawfulMaterialV1('bouncy', { restitution: 1, friction: 0.5 });
    }).toThrow(/returns less energy than it receives/);
    // The identity value for a comparison deck is the one legal 1.
    expect(() => {
      assertLawfulMaterialV1('deck', {
        restitution: 1, friction: 1, combine: 'multiply',
      });
    }).not.toThrow();
  });

  it('holds friction to being a resisting quantity', () => {
    expect(() => {
      assertLawfulMaterialV1('impossible', { restitution: 0.2, friction: -0.1 });
    }).toThrow(/Friction resists sliding/);
  });

  it('applies air drag to every dynamic body of every station', async () => {
    await initPlaygroundRapierV1();
    for (const station of createPhysicsPlaygroundStationsV1()) {
      const world = PlaygroundWorldV1.create(station);
      const specs = playgroundBodySpecsV1(station);
      let checked = 0;
      for (const [placementId, spec] of specs) {
        if (spec.kind !== 'dynamic' || spec.spawnOnly) continue;
        const damping = world.linearDampingOfV1(placementId);
        expect(damping, `${station.sceneId} / ${placementId}`)
          .toBeGreaterThan(0);
        checked += 1;
      }
      expect(checked, `${station.sceneId} has no dynamic bodies to govern`)
        .toBeGreaterThan(0);
      world.free();
    }
  }, 300_000);

  it('gives every rolling body resistance without being asked', async () => {
    await initPlaygroundRapierV1();
    // The rolling station is the one that most obviously needed it: its
    // whole subject is bodies that roll.
    const rolling = createPhysicsPlaygroundStationsV1()
      .find((s) => s.sceneId === 'studio:scene:physics-rolling');
    expect(rolling, 'the rolling station should exist').toBeDefined();
    const world = PlaygroundWorldV1.create(rolling!);
    // Step until bodies are in contact with the track, then the law must
    // show up as non-zero angular damping without any station opt-in.
    for (let tick = 0; tick < 240; tick += 1) world.step();
    const specs = playgroundBodySpecsV1(rolling!);
    let governed = 0;
    for (const [placementId, spec] of specs) {
      if (spec.kind !== 'dynamic' || spec.spawnOnly) continue;
      if (spec.rollingResistance !== undefined) continue;
      if (world.angularDampingOfV1(placementId) > 0) governed += 1;
    }
    expect(governed, 'no body picked up rolling resistance from the law')
      .toBeGreaterThan(0);
    world.free();
  }, 300_000);
});

describe('the constitution is complete and honest', () => {
  it('states every law positively and names how each is held', () => {
    expect(PHYSICS_LAWS_V1.length).toBeGreaterThanOrEqual(10);
    for (const law of PHYSICS_LAWS_V1) {
      expect(law.statement.length, law.id).toBeGreaterThan(40);
      expect(law.enforcedBy.length, law.id).toBeGreaterThan(10);
      // A law states what holds. These openings are how a prohibition
      // sneaks back in, and a prohibition cannot be measured.
      expect(
        /^(Nothing|No |Never|Do not|Don't)/.test(law.statement),
        `'${law.id}' is phrased as a prohibition: ${law.statement.slice(0, 60)}`,
      ).toBe(false);
    }
  });

  it("names Newton's three laws among them", () => {
    for (const id of ['newton-1', 'newton-2', 'newton-3']) {
      expect(
        PHYSICS_LAWS_V1.some((law) => law.id === id),
        `the constitution is missing ${id}`,
      ).toBe(true);
    }
  });

  it('gives every law a kind that says how it is held', () => {
    for (const law of PHYSICS_LAWS_V1) {
      expect(['force', 'bound', 'conserved'], law.id).toContain(law.kind);
    }
  });

  it('applies the damping laws to any body that can report damping', () => {
    // The whole borrowing contract: a consumer's own solver body needs
    // only these two methods to be governed.
    const seen: { linear: number; angular: number } = { linear: -1, angular: -1 };
    const body = {
      setLinearDamping: (value: number) => { seen.linear = value; },
      setAngularDamping: (value: number) => { seen.angular = value; },
    };
    applyPhysicsLawsToBodyV1(body, { material: 'steel', jointed: true, touching: true });
    const steel = physicsLawValuesForV1('steel');
    expect(seen.linear).toBe(steel.airDrag);
    expect(seen.angular).toBeCloseTo(
      steel.airSpinDrag + steel.bearingFriction + steel.rollingResistance, 10);

    // Airborne and unjointed: only the air acts on it.
    applyPhysicsLawsToBodyV1(body, { material: 'steel' });
    expect(seen.angular).toBeCloseTo(steel.airSpinDrag, 10);
  });

  it('governs a material it has never heard of rather than exempting it', () => {
    const known = physicsLawValuesForV1('stone');
    const unknown = physicsLawValuesForV1('unobtanium');
    expect(unknown.airDrag).toBeGreaterThan(0);
    expect(unknown.rollingResistance).toBeGreaterThan(0);
    expect(unknown).toEqual(physicsLawValuesForV1(undefined));
    expect(known.rollingResistance).toBeGreaterThan(0);
  });
});
