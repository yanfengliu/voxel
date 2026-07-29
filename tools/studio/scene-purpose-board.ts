import {
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeEvidenceV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
  type PurposeNodeV1,
} from './purpose-graph.js';

/**
 * Shared shapes for the smaller scenes' purpose graphs.
 *
 * A graph records authored decisions, not placements. Where one deterministic
 * rule gives every member the same job and explicit bounds, the whole group is
 * one node — a thousand identical receivers under one rule is one decision, and
 * splitting it into a thousand records would bury the exceptions that matter.
 */

export const sceneNodeId = (
  system: string,
  kind: string,
  key: string,
): PurposeNodeIdV1 => `${system}:${kind}:${key}` as PurposeNodeIdV1;

export const capturedAt = (
  what: string,
  where: string,
): PurposeEvidenceV1 => ({
  kind: 'bound',
  proofId: `studio capture: ${where}`,
  establishes: Object.freeze([what]),
});

export const notYetShown = (
  reason: string,
  closer: string,
): PurposeEvidenceV1 => ({
  kind: 'open',
  reason,
  wouldBeClosedBy: closer,
});

export interface ComparisonSpecimenV1 {
  readonly key: string;
  readonly label: string;
  readonly job: string;
}

export interface ComparisonBoardV1 {
  readonly systemId: string;
  readonly needKey: string;
  readonly needLabel: string;
  readonly needJob: string;
  readonly rootRationale: string;
  readonly needEvidence: PurposeEvidenceV1;
  readonly needHonesty: string;
  readonly specimenHonesty: string;
  readonly specimens: readonly ComparisonSpecimenV1[];
  readonly extras?: readonly PurposeNodeV1[];
}

/**
 * A contact sheet's graph. Every specimen exists for the same comparison, which
 * is the honest account: they do not support, feed, or serve each other, and a
 * graph that claimed they did would be inventing relationships the layout has
 * deliberately avoided.
 */
export function comparisonBoardGraphV1(
  board: ComparisonBoardV1,
): PurposeGraphV1 {
  const needId = sceneNodeId(board.systemId, 'need', board.needKey);
  return purposeGraphV1(board.systemId, [
    purposeNeedV1({
      id: needId,
      label: board.needLabel,
      job: board.needJob,
      rootRationale: board.rootRationale,
      evidence: board.needEvidence,
      honestyBoundary: board.needHonesty,
    }),
    ...board.specimens.map((specimen) => purposeNodeV1({
      id: sceneNodeId(board.systemId, 'specimen', specimen.key),
      kind: 'solid',
      label: specimen.label,
      job: specimen.job,
      requiredBy: Object.freeze([needId]),
      evidence: capturedAt(
        `The board presents ${specimen.label} beside its neighbours at one shared orientation and pitch.`,
        `${board.systemId} default camera`,
      ),
      honestyBoundary: board.specimenHonesty,
    })),
    ...(board.extras ?? []),
  ]);
}
