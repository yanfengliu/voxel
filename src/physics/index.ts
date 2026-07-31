/**
 * `voxel/physics` — the laws of the voxel universe, and the code that
 * applies them.
 *
 * This module deliberately contains no solver. Voxel does not simulate:
 * a game keeps its own physics, exactly as it keeps its own rules and
 * its own state. What a game could not keep on its own is a consistent
 * set of laws shared with everything else drawn through this engine, and
 * that is what this module publishes — the statements, the per-material
 * values, and one function that applies them to any rigid body able to
 * report its damping.
 *
 * It has no dependency on Three.js, on Rapier, or on the DOM, so it is
 * safe to import from a portable simulation module, a worker, or a
 * server.
 */
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
} from './laws.js';
