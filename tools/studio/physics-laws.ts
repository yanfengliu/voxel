/**
 * The studio's view of the universe's laws.
 *
 * The laws themselves live in the published `voxel/physics` module, so a
 * consuming game can borrow the same constitution rather than
 * reimplementing it or drifting from it. This file re-exports them by
 * name and adds only what is specific to the studio's own material
 * table.
 *
 * The names are listed explicitly rather than wildcarded: the studio is
 * served straight from source by Vite, and a wildcard re-export across
 * the package boundary resolved to nothing in the browser while
 * type-checking and Node tests stayed green.
 */
import {
  PHYSICS_LAWS_SCHEMA_V1,
  PHYSICS_LAWS_V1,
  PHYSICS_LAW_FALLBACK_SURFACE_V1,
  PHYSICS_LAW_MAX_RESTITUTION_V1,
  applyPhysicsLawsToBodyV1,
  assertLawfulMaterialV1,
  assertMaterialsLawfulV1,
  governedMaterialsV1,
  physicsLawValuesForV1,
  type PhysicsBodyConditionV1,
  type PhysicsDampedBodyV1,
  type PhysicsLawKindV1,
  type PhysicsLawV1,
  type PhysicsLawValuesV1,
  type PhysicsMaterialIdV1,
} from '../../src/physics/index.js';
import { PLAYGROUND_MATERIALS_V1 } from './physics-playground-materials.js';

export {
  PHYSICS_LAWS_SCHEMA_V1,
  PHYSICS_LAWS_V1,
  PHYSICS_LAW_FALLBACK_SURFACE_V1,
  PHYSICS_LAW_MAX_RESTITUTION_V1,
  applyPhysicsLawsToBodyV1,
  assertLawfulMaterialV1,
  assertMaterialsLawfulV1,
  governedMaterialsV1,
  physicsLawValuesForV1,
  type PhysicsBodyConditionV1,
  type PhysicsDampedBodyV1,
  type PhysicsLawKindV1,
  type PhysicsLawV1,
  type PhysicsLawValuesV1,
  type PhysicsMaterialIdV1,
};

/** Holds the playground's material table to the laws. */
export function assertAllMaterialsLawfulV1(): void {
  assertMaterialsLawfulV1(PLAYGROUND_MATERIALS_V1);
}
