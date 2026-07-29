/**
 * The exact starting state of the recorded chain run, as literals.
 *
 * Rapier's determinism guarantee requires that "all the values used to
 * initialize the physics simulation must result from cross-platform
 * deterministic operations", and its documentation names `Math.sin` and
 * `Math.cos` as operations that are not. The catenary these poses come from is
 * built entirely out of `Math.sinh`, `Math.asinh`, `Math.cosh` and `Math.atan`,
 * and the tangent angle becomes a quaternion through `Math.sin` and `Math.cos`.
 *
 * Computing them at run time would therefore make the committed trace depend on
 * one JS engine's transcendental functions, and `chain-replay-generation.test.ts`
 * compares that trace byte for byte. Freezing the values keeps the analytic
 * derivation as the documented source of the shape while making the simulation
 * input exact. `chain-start-poses.test.ts` checks the literals still match the
 * formula, so the two cannot drift.
 *
 * These cover the recorded configuration only. The ablations vary the starting
 * dip and are compared with tolerances rather than hashed, so they may keep
 * computing their own poses.
 */

export interface ChainStartPoseV1 {
  readonly x: number;
  readonly y: number;
  /** Rotation about z, which is the only axis the hanging plane needs. */
  readonly qz: number;
  readonly qw: number;
}

export const CHAIN_RECORDED_START_POSES_V1: readonly ChainStartPoseV1[] =
  Object.freeze([
    { x: -8.4375, y: 0, qz: -0.5072969391018672, qw: 0.8617713244114569 },
    { x: -7.254371075619062, y: -0.9563619984355913, qz: -0.2387326098904117, qw: 0.9710853417567956 },
    { x: -5.8539893269713135, y: -1.8357364371685305, qz: -0.2046200150102006, qw: 0.9788414833144462 },
    { x: -4.180599007712611, y: -2.5849803130094093, qz: -0.15548208852006395, qw: 0.9878387116070311 },
    { x: -2.2039527208979943, y: -3.1147522451952834, qz: -0.08635494702803875, qw: 0.996264434336479 },
    { x: 0, y: -3.3112557840060646, qz: 0, qw: 1 },
    { x: 2.2039527208979943, y: -3.1147522451952834, qz: 0.08635494702803875, qw: 0.996264434336479 },
    { x: 4.180599007712611, y: -2.5849803130094093, qz: 0.15548208852006395, qw: 0.9878387116070311 },
    { x: 5.8539893269713135, y: -1.8357364371685305, qz: 0.2046200150102006, qw: 0.9788414833144462 },
    { x: 7.254371075619062, y: -0.9563619984355913, qz: 0.2387326098904117, qw: 0.9710853417567956 },
    { x: 8.4375, y: 0, qz: 0.5072969391018672, qw: 0.8617713244114569 },
  ].map((pose) => Object.freeze(pose)));
