import { describe, expect, it } from 'vitest';

import { MACHINE_WORKS_CONVEYOR_V1 } from './machine-works-conveyor.js';
import { createContrastScenes } from './contrast-scenes.js';
import {
  MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID,
  MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
  MACHINE_WORKS_FEATURE_PURPOSES_V1,
  MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID,
  MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
  MACHINE_WORKS_PURPOSE_BOUNDARIES_V1,
  MACHINE_WORKS_PURPOSE_MAP_V1,
} from './machine-works-purpose.js';
import { createMachineWorksRecipeBook } from './machine-works-recipes.js';
import type { PartStepV1 } from './recipe.js';

const FEATURE_PURPOSE_IDS = [
  'machine-works:feature-purpose:drive-radial-phase-flag',
  'machine-works:feature-purpose:press-face-connected-service-bus',
  'machine-works:feature-purpose:press-fixed-stators',
  'machine-works:feature-purpose:head-local-pickup-service',
  'machine-works:feature-purpose:carrier-trunnion-axle',
  'machine-works:feature-purpose:output-servo-coupler',
  'machine-works:feature-purpose:output-servo-service-conduit',
  'machine-works:feature-purpose:base-core-keyed-mate',
  'machine-works:feature-purpose:core-base-key',
  'machine-works:feature-purpose:core-cap-keyed-seat',
  'machine-works:feature-purpose:cap-key-and-crown-seat',
] as const;

function sameSettings(
  left: PartStepV1['settings'],
  right: PartStepV1['settings'],
): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => right[key] === value);
}

describe('Machine Works creator purpose map', () => {
  it('covers every placement category with the purpose-built press bridge replacement', () => {
    const scene = createContrastScenes().find(
      ({ id }) => id === 'studio:scene:contrast-machines',
    );
    if (scene === undefined) {
      throw new Error(
        "Machine Works purpose coverage needs live scene 'studio:scene:contrast-machines'.",
      );
    }
    const expectedPlacementIds = scene.placements.map(({ id }) => id);
    const mappedPlacementIds = MACHINE_WORKS_PURPOSE_MAP_V1.flatMap(
      ({ placementIds }) => placementIds,
    );

    expect(new Set(mappedPlacementIds).size).toBe(mappedPlacementIds.length);
    expect([...mappedPlacementIds].sort()).toEqual([...expectedPlacementIds].sort());
    expect(mappedPlacementIds).toHaveLength(MACHINE_WORKS_CONVEYOR_V1.slatCount + 16);
    expect(mappedPlacementIds).not.toContain('assembly-gantry');
    expect(MACHINE_WORKS_PURPOSE_MAP_V1.find(
      ({ category }) => category === 'assembly-press-bridge',
    )).toMatchObject({
      placementIds: [MACHINE_WORKS_PRESS_BRIDGE_PLACEMENT_ID],
      recipeId: MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID,
    });
    const outputDockPurpose = MACHINE_WORKS_PURPOSE_MAP_V1.find(
      ({ category }) => category === 'output-trunnion-dock',
    );
    expect(outputDockPurpose).toMatchObject({
      placementIds: [MACHINE_WORKS_OUTPUT_DOCK_PLACEMENT_ID],
      recipeId: MACHINE_WORKS_OUTPUT_DOCK_RECIPE_ID,
    });
    expect(outputDockPurpose?.mechanicalRelationships.some(
      ({ verb, object }) =>
        verb === 'routes-service-to'
        && object === 'outboard rotary position servo',
    )).toBe(true);
  });

  it('gives every current Machine Works recipe exactly one purpose entry', () => {
    const liveRecipeIds = Object.keys(createMachineWorksRecipeBook());
    const entriesByRecipe = new Map(
      MACHINE_WORKS_PURPOSE_MAP_V1.map((entry) => [entry.recipeId, entry]),
    );

    expect(entriesByRecipe.size).toBe(MACHINE_WORKS_PURPOSE_MAP_V1.length);
    for (const recipeId of liveRecipeIds) {
      expect(entriesByRecipe.has(recipeId), recipeId).toBe(true);
    }
    expect([...entriesByRecipe.keys()].sort()).toEqual([...liveRecipeIds].sort());
    expect(entriesByRecipe.has(MACHINE_WORKS_PRESS_BRIDGE_RECIPE_ID)).toBe(true);
    expect([...entriesByRecipe.keys()].every(
      (recipeId) => recipeId.startsWith('studio:machine-works:'),
    )).toBe(true);
  });

  it('requires location, removal, and mechanical evidence instead of decorative intent', () => {
    for (const purpose of MACHINE_WORKS_PURPOSE_MAP_V1) {
      expect(purpose.purpose.length, purpose.category).toBeGreaterThan(40);
      expect(purpose.locationDatum.anchor.length, purpose.category).toBeGreaterThan(20);
      expect(purpose.locationDatum.reason.length, purpose.category).toBeGreaterThan(20);
      expect(purpose.removalConsequence.length, purpose.category).toBeGreaterThan(40);
      expect(purpose.mechanicalRelationships.length, purpose.category).toBeGreaterThan(0);
      expect(
        [
          purpose.purpose,
          purpose.locationDatum.reason,
          purpose.removalConsequence,
        ].join(' '),
        purpose.category,
      ).not.toMatch(/\b(?:looks? cool|decoration|decorative flourish)\b/i);
      for (const relationship of purpose.mechanicalRelationships) {
        expect(relationship.object.length, purpose.category).toBeGreaterThan(2);
        expect(relationship.evidence.length, purpose.category).toBeGreaterThan(20);
      }
    }
  });

  it('binds every reviewed non-obvious feature purpose to exact live recipe steps', () => {
    const book = createMachineWorksRecipeBook();
    const claimedSteps = new Set<string>();

    expect(MACHINE_WORKS_FEATURE_PURPOSES_V1.map(({ id }) => id))
      .toEqual(FEATURE_PURPOSE_IDS);
    expect(new Set(FEATURE_PURPOSE_IDS).size).toBe(FEATURE_PURPOSE_IDS.length);
    for (const feature of MACHINE_WORKS_FEATURE_PURPOSES_V1) {
      const recipe = book[feature.recipeId];
      expect(recipe, feature.id).toBeDefined();
      expect(feature.removalConsequence, feature.id)
        .toMatch(/\b(?:loses|breaks|cannot|no longer|unreadable|unexplained)\b/i);
      expect(feature.mechanicalRelationship.object.trim(), feature.id).not.toBe('');
      expect(feature.mechanicalRelationship.evidence, feature.id)
        .toMatch(/\b(?:axis|clearance|contact|face|layers?|phase|socket|stator|swept|weld)\b/i);
      for (const expected of feature.steps) {
        const matches = recipe!.steps.flatMap((step, index) =>
          step.kind === expected.kind
            && step.part === expected.part
            && step.seedSalt === undefined
            && step.at.every((value, axis) => value === expected.at[axis])
            && sameSettings(step.settings, expected.settings)
            ? [index]
            : []);
        expect(matches, `${feature.id} ${expected.part} at [${expected.at.join(', ')}]`)
          .toHaveLength(1);
        const claim = `${feature.recipeId}#${String(matches[0])}`;
        expect(claimedSteps.has(claim), `${claim} has two feature purposes`).toBe(false);
        claimedSteps.add(claim);
      }
    }
  });

  it('states the fixture boundaries that the picture must not overclaim', () => {
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.preloadedHeads)
      .toMatch(/start the trace preloaded.*retained by fixed joints.*magnetic pickup faces/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.pickupAndJaws)
      .toMatch(/no in-trace pickup and no jaw actuation.*magnetic plate begins energized/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.headServo)
      .toMatch(/position-based kinematic servo command prescribes each slide translation.*fixed-stator-inside-empty-C-yoke engagement/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.alignmentDatums)
      .toMatch(/visual alignment datums only.*no captive mechanical constraint/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.exposedPhaseFlags)
      .toMatch(/non-interacting phase witnesses.*do not contact.*or transmit torque/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.attachmentHandoff)
      .toMatch(/two-voxel keyed insertion.*fixed joint is removed.*software compound weld.*not a solved latch/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.pressBridge)
      .toMatch(/exact press-bridge sidecar is hashed.*stator spines.*not ingested into Rapier.*without proving.*solver load transfer/i);
    expect(MACHINE_WORKS_PURPOSE_BOUNDARIES_V1.outputPivot)
      .toMatch(/trunnion axle.*bearing cradles.*servo housing.*no revolute constraint.*motor torque/i);
  });

  it('keeps phase witnesses and insertion tooling honest in their removal consequences', () => {
    const exposedCogs = MACHINE_WORKS_PURPOSE_MAP_V1.find(
      ({ category }) => category === 'exposed-drive-phase-flags',
    );
    const heads = MACHINE_WORKS_PURPOSE_MAP_V1.find(
      ({ category }) => category === 'insertion-heads',
    );

    expect(exposedCogs?.purpose).toMatch(/minimal non-interacting radial phase flag/i);
    expect(exposedCogs?.removalConsequence).toMatch(/solver outcome.*remain unchanged/i);
    expect(heads?.purpose).toMatch(/preloaded component.*magnetic pickup.*stator spine.*prescribed vertical stroke/i);
    expect(heads?.mechanicalRelationships.find(({ verb }) => verb === 'holds')?.evidence)
      .toMatch(/without simulating charging, current, magnetic force, or jaw closure/i);
  });
});
