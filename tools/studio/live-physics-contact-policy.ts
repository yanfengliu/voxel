import type * as RAPIER_TYPES from '@dimforge/rapier3d-compat';

/**
 * Which bodies in a live scene are allowed to touch each other.
 *
 * Most scenes want the default: everything meets everything, which is what a
 * pile of chain links or a heap of bricks is about. A mechanism is the
 * opposite. A mill is a few declared contacts and nothing else — the cam
 * presses the follower, the hammer head strikes the anvil — while the shaft
 * inside its bearing, the sails passing the frame, and the beam beside its
 * housing must all pass through each other untouched, because the joints are
 * what constrain them.
 *
 * Solving the windmill with everything colliding produced a machine that
 * jammed on its own bearing, and once freed, flung its hammer over the top and
 * stalled. Declaring the pairs is not a simplification of the mechanism; it is
 * the mechanism.
 *
 * Rapier decides contact from collision groups: two colliders interact only
 * when each one's membership bit passes the other's filter. Each named body
 * gets one bit, and its filter carries only the bits of the partners it is
 * allowed to meet, so an unlisted body ends up inert against everything.
 */

/** Rapier packs membership in the high half of the word and filter in the low. */
const MEMBERSHIP_SHIFT = 16;
const NO_GROUPS = 0;
export const MAX_LIVE_CONTACT_POLICY_BODIES = 16;

export interface LiveContactPolicyV1 {
  /**
   * The only body pairs allowed to touch. Every body the policy names, and
   * every pair it does not, becomes inert.
   */
  readonly pairs: readonly (readonly [string, string])[];
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/**
 * Applies a declared contact policy to the live world.
 *
 * `bodyIds` is every planned body, because a policy is exhaustive: a body it
 * never names must still be made inert, or it would keep colliding with
 * everything by default and the declaration would be a decoration.
 */
export function applyLiveContactPolicyV1(
  policy: LiveContactPolicyV1,
  bodyIds: readonly string[],
  collidersFor: (placementId: string) => readonly RAPIER_TYPES.Collider[],
): void {
  const known = new Set(bodyIds);
  const partners = new Map<string, Set<string>>(bodyIds.map((id) => [id, new Set<string>()]));
  const seen = new Set<string>();
  for (const [a, b] of policy.pairs) {
    if (a === b) {
      throw new Error(
        `A contact policy cannot pair '${a}' with itself; name two different `
        + 'placements or drop the pair.',
      );
    }
    for (const id of [a, b]) {
      if (!known.has(id)) {
        throw new Error(
          `A contact policy names '${id}', which is not a planned body in this `
          + `scene. Planned bodies: ${bodyIds.join(', ')}.`,
        );
      }
    }
    const key = pairKey(a, b);
    if (seen.has(key)) {
      throw new Error(
        `A contact policy pairs '${a}' with '${b}' twice; state each pair once.`,
      );
    }
    seen.add(key);
    partners.get(a)!.add(b);
    partners.get(b)!.add(a);
  }
  if (bodyIds.length > MAX_LIVE_CONTACT_POLICY_BODIES) {
    throw new Error(
      `A contact policy covers ${String(bodyIds.length)} bodies, but a collision `
      + `group carries only ${String(MAX_LIVE_CONTACT_POLICY_BODIES)} bits. `
      + `Bodies: ${bodyIds.join(', ')}. Use a policy only for mechanisms.`,
    );
  }
  const ordered = [...bodyIds].sort();
  const bit = new Map(ordered.map((id, index) => [id, 1 << index]));
  for (const id of ordered) {
    let filter = NO_GROUPS;
    for (const partner of partners.get(id) ?? []) filter |= bit.get(partner)!;
    const groups = ((bit.get(id)! << MEMBERSHIP_SHIFT) | filter) >>> 0;
    for (const collider of collidersFor(id)) collider.setCollisionGroups(groups);
  }
}
