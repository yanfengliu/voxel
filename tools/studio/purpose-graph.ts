/**
 * Typed purpose graph for authored Studio systems.
 *
 * Machine Works, Windmill, and the compact interface grammar each record why
 * an authored decision exists, but they record the *reason target* three
 * different ways: a prose `object` string, a prose `beneficiary` sentence, and
 * one typed `requiredByNeedIds` array. Only the third can be traversed, so only
 * the third can be checked. This module generalizes that third form.
 *
 * The graph is an authoring-time artifact. It is not a renderer contract, not a
 * solver contract, and never authoritative for geometry or physics. It records
 * claims; a fixture run, an ablation, or a browser capture is what proves them.
 */

export const PURPOSE_GRAPH_SCHEMA_V1 = 'studio.purpose-graph/1' as const;

/** Namespaced so two systems can never collide in one checked graph. */
export type PurposeNodeIdV1 = `${string}:${string}`;

/**
 * `experience-need` is the only self-justifying kind: it states what a player,
 * reader, or consumer requires. Everything else must trace to one.
 */
export type PurposeNodeKindV1 =
  | 'experience-need'
  | 'solid'
  | 'interface'
  | 'motion-rule'
  | 'material-source'
  | 'material-sink'
  | 'energy-source'
  | 'energy-sink';

export const PURPOSE_BOUNDARY_KINDS_V1 = Object.freeze([
  'material-source',
  'material-sink',
  'energy-source',
  'energy-sink',
] as const);

export type PurposeBoundaryKindV1 = typeof PURPOSE_BOUNDARY_KINDS_V1[number];

export function isPurposeBoundaryKindV1(
  kind: PurposeNodeKindV1,
): kind is PurposeBoundaryKindV1 {
  return (PURPOSE_BOUNDARY_KINDS_V1 as readonly PurposeNodeKindV1[])
    .includes(kind);
}

/**
 * Evidence is deliberately two-valued. `bound` names a run or capture that
 * establishes the claim; `open` is a tracked hole that the kernel counts and
 * reports rather than letting it hide inside a confident prose sentence.
 */
export type PurposeEvidenceV1 =
  | {
    readonly kind: 'bound';
    /** Test id, trace hash, capture name, or ablation identifier. */
    readonly proofId: string;
    readonly establishes: readonly string[];
  }
  | {
    readonly kind: 'open';
    readonly reason: string;
    /** The specific run or capture that would close this obligation. */
    readonly wouldBeClosedBy: string;
  };

interface PurposeNodeBaseV1 {
  readonly id: PurposeNodeIdV1;
  readonly label: string;
  /** What this node does for the nodes that require it. */
  readonly job: string;
  /**
   * Ids of the nodes that need this one. Empty only for `experience-need`
   * roots. These are the edges the prose `beneficiary` field could not express.
   */
  readonly requiredBy: readonly PurposeNodeIdV1[];
  readonly evidence: PurposeEvidenceV1;
  /** What this node explicitly does not claim. */
  readonly honestyBoundary: string;
}

export interface PurposeNeedNodeV1 extends PurposeNodeBaseV1 {
  readonly kind: 'experience-need';
  /** Why this need is self-justifying. Roots may not be silent. */
  readonly rootRationale: string;
}

export interface PurposeAuthoredNodeV1 extends PurposeNodeBaseV1 {
  readonly kind: 'solid' | 'interface' | 'motion-rule';
}

/**
 * The compromise that lets a bounded scene behave physically without
 * simulating a universe: mass and energy enter and leave at declared points.
 * `truncates` is the honest part — it records the upstream or downstream
 * process the scene deliberately does not simulate.
 */
export interface PurposeBoundaryNodeV1 extends PurposeNodeBaseV1 {
  readonly kind: PurposeBoundaryKindV1;
  /** The conserved quantity crossing here, e.g. `energy` or `water-mass`. */
  readonly quantity: string;
  readonly visibility: 'visible' | 'invisible';
  readonly truncates: string;
}

export type PurposeNodeV1 =
  | PurposeNeedNodeV1
  | PurposeAuthoredNodeV1
  | PurposeBoundaryNodeV1;

/**
 * A statement about one quantity over the whole system. An open system must
 * name where it opens; a closed system must account for every crossing.
 */
export interface PurposeConservationClaimV1 {
  readonly quantity: string;
  readonly closed: boolean;
  readonly sourceIds: readonly PurposeNodeIdV1[];
  readonly sinkIds: readonly PurposeNodeIdV1[];
  readonly statement: string;
}

export interface PurposeGraphV1 {
  readonly schema: typeof PURPOSE_GRAPH_SCHEMA_V1;
  readonly systemId: string;
  readonly nodes: readonly PurposeNodeV1[];
  readonly conservationClaims: readonly PurposeConservationClaimV1[];
}

function frozenIds(
  ids: readonly PurposeNodeIdV1[],
): readonly PurposeNodeIdV1[] {
  return Object.freeze([...ids]);
}

function frozenEvidence(evidence: PurposeEvidenceV1): PurposeEvidenceV1 {
  if (evidence.kind === 'bound') {
    return Object.freeze({
      ...evidence,
      establishes: Object.freeze([...evidence.establishes]),
    });
  }
  return Object.freeze({ ...evidence });
}

export function purposeNeedV1(
  node: Omit<PurposeNeedNodeV1, 'kind' | 'requiredBy'>,
): PurposeNeedNodeV1 {
  return Object.freeze({
    ...node,
    kind: 'experience-need',
    requiredBy: Object.freeze([]),
    evidence: frozenEvidence(node.evidence),
  });
}

export function purposeNodeV1(
  node: PurposeAuthoredNodeV1,
): PurposeAuthoredNodeV1 {
  return Object.freeze({
    ...node,
    requiredBy: frozenIds(node.requiredBy),
    evidence: frozenEvidence(node.evidence),
  });
}

export function purposeBoundaryV1(
  node: PurposeBoundaryNodeV1,
): PurposeBoundaryNodeV1 {
  return Object.freeze({
    ...node,
    requiredBy: frozenIds(node.requiredBy),
    evidence: frozenEvidence(node.evidence),
  });
}

export function purposeGraphV1(
  systemId: string,
  nodes: readonly PurposeNodeV1[],
  conservationClaims: readonly PurposeConservationClaimV1[] = [],
): PurposeGraphV1 {
  return Object.freeze({
    schema: PURPOSE_GRAPH_SCHEMA_V1,
    systemId,
    nodes: Object.freeze([...nodes]),
    conservationClaims: Object.freeze(conservationClaims.map((claim) =>
      Object.freeze({
        ...claim,
        sourceIds: frozenIds(claim.sourceIds),
        sinkIds: frozenIds(claim.sinkIds),
      }))),
  });
}

export function purposeNodesById(
  graph: PurposeGraphV1,
): ReadonlyMap<PurposeNodeIdV1, PurposeNodeV1> {
  const byId = new Map<PurposeNodeIdV1, PurposeNodeV1>();
  for (const node of graph.nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }
  return byId;
}
