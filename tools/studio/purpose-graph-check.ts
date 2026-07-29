import {
  isPurposeBoundaryKindV1,
  type PurposeBoundaryNodeV1,
  type PurposeConservationClaimV1,
  type PurposeGraphV1,
  type PurposeNodeIdV1,
  type PurposeNodeV1,
} from './purpose-graph.js';

/**
 * The checker kernel. It answers questions prose review cannot: does every
 * authored decision trace to a stated need, does any pair of decisions justify
 * each other in a circle, is any stated need served by nothing, and does any
 * conservation claim contradict its own declared boundary.
 *
 * It never judges whether a claim is true. It judges whether the graph is
 * well-formed and whether every claim is either backed by named evidence or
 * openly recorded as unproven.
 */

export const PURPOSE_GRAPH_REPORT_SCHEMA_V1 =
  'studio.purpose-graph-report/1' as const;

export type PurposeGraphFindingCodeV1 =
  | 'duplicate-node-id'
  | 'unresolved-edge'
  | 'self-justifying-edge'
  | 'justification-cycle'
  | 'orphan-node'
  | 'root-with-edges'
  | 'unserved-need'
  | 'empty-binding'
  | 'claim-polarity-mismatch'
  | 'closed-claim-with-boundary'
  | 'open-claim-without-boundary'
  | 'unlisted-boundary'
  | 'unclaimed-quantity';

export interface PurposeGraphFindingV1 {
  readonly code: PurposeGraphFindingCodeV1;
  readonly subject: string;
  /** States what happened, which input caused it, and what would satisfy it. */
  readonly message: string;
}

export interface PurposeOpenObligationV1 {
  readonly nodeId: PurposeNodeIdV1;
  readonly reason: string;
  readonly wouldBeClosedBy: string;
}

export interface PurposeGraphReportV1 {
  readonly schema: typeof PURPOSE_GRAPH_REPORT_SCHEMA_V1;
  readonly systemId: string;
  readonly ok: boolean;
  readonly findings: readonly PurposeGraphFindingV1[];
  readonly nodeCount: number;
  readonly rootCount: number;
  readonly boundNodeCount: number;
  /** Tracked holes. Reported, never silently tolerated, never auto-failed. */
  readonly openObligations: readonly PurposeOpenObligationV1[];
}

function finding(
  code: PurposeGraphFindingCodeV1,
  subject: string,
  message: string,
): PurposeGraphFindingV1 {
  return Object.freeze({ code, subject, message });
}

function quoteList(values: readonly string[]): string {
  if (values.length === 0) return '(none)';
  return values.map((value) => `'${value}'`).join(', ');
}

function checkIdentity(
  graph: PurposeGraphV1,
  findings: PurposeGraphFindingV1[],
): Map<PurposeNodeIdV1, PurposeNodeV1> {
  const byId = new Map<PurposeNodeIdV1, PurposeNodeV1>();
  for (const node of graph.nodes) {
    const existing = byId.get(node.id);
    if (existing !== undefined) {
      findings.push(finding(
        'duplicate-node-id',
        node.id,
        `Two nodes share the id '${node.id}' ('${existing.label}' and `
        + `'${node.label}'). Node ids are the graph's edge targets, so a `
        + 'duplicate makes every edge to that id ambiguous. Give each node a '
        + 'distinct namespaced id.',
      ));
      continue;
    }
    byId.set(node.id, node);
  }
  return byId;
}

function checkEdges(
  graph: PurposeGraphV1,
  byId: ReadonlyMap<PurposeNodeIdV1, PurposeNodeV1>,
  findings: PurposeGraphFindingV1[],
): void {
  for (const node of graph.nodes) {
    if (node.kind === 'experience-need') {
      if (node.requiredBy.length > 0) {
        findings.push(finding(
          'root-with-edges',
          node.id,
          `Need '${node.id}' declares requiredBy ${quoteList(node.requiredBy)}, `
          + 'but an experience-need is the root of a justification chain and '
          + 'cannot itself exist for something else. Either drop its edges or '
          + 'change its kind to solid, interface, or motion-rule.',
        ));
      }
      continue;
    }
    if (node.requiredBy.length === 0) {
      findings.push(finding(
        'orphan-node',
        node.id,
        `Node '${node.id}' ('${node.label}') names nothing that requires it. `
        + 'Every authored decision must exist for a named beneficiary. Add the '
        + 'id of the node that needs it, or delete the node.',
      ));
      continue;
    }
    for (const target of node.requiredBy) {
      if (target === node.id) {
        findings.push(finding(
          'self-justifying-edge',
          node.id,
          `Node '${node.id}' lists itself in requiredBy. A node cannot be its `
          + 'own reason for existing. Point the edge at the node that actually '
          + 'needs it.',
        ));
        continue;
      }
      if (!byId.has(target)) {
        findings.push(finding(
          'unresolved-edge',
          node.id,
          `Node '${node.id}' says it is required by '${target}', which is not `
          + 'a node in system '
          + `'${graph.systemId}'. Add that node, or correct the id.`,
        ));
      }
    }
  }
}

function collectCycle(
  graph: PurposeGraphV1,
  byId: ReadonlyMap<PurposeNodeIdV1, PurposeNodeV1>,
  findings: PurposeGraphFindingV1[],
): void {
  const settled = new Set<PurposeNodeIdV1>();
  const onPath = new Set<PurposeNodeIdV1>();
  const path: PurposeNodeIdV1[] = [];
  const reported = new Set<string>();

  const walk = (id: PurposeNodeIdV1): void => {
    if (settled.has(id)) return;
    if (onPath.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id];
      const key = [...cycle].sort((a, b) => a.localeCompare(b)).join('|');
      if (!reported.has(key)) {
        reported.add(key);
        findings.push(finding(
          'justification-cycle',
          id,
          `The justification chain ${cycle.map((step) => `'${step}'`).join(' -> ')} `
          + 'closes on itself, so these nodes justify each other and none of '
          + 'them reaches a stated need. Re-point one edge at the '
          + 'experience-need the group actually serves.',
        ));
      }
      return;
    }
    onPath.add(id);
    path.push(id);
    const node = byId.get(id);
    if (node !== undefined) {
      for (const target of node.requiredBy) {
        if (byId.has(target)) walk(target);
      }
    }
    path.pop();
    onPath.delete(id);
    settled.add(id);
  };

  for (const node of graph.nodes) walk(node.id);
}

function checkServedNeeds(
  graph: PurposeGraphV1,
  findings: PurposeGraphFindingV1[],
): void {
  const served = new Set<PurposeNodeIdV1>();
  for (const node of graph.nodes) {
    for (const target of node.requiredBy) served.add(target);
  }
  for (const node of graph.nodes) {
    if (node.kind !== 'experience-need') continue;
    if (served.has(node.id)) continue;
    findings.push(finding(
      'unserved-need',
      node.id,
      `Need '${node.id}' ('${node.label}') is stated but nothing in system `
      + `'${graph.systemId}' points at it. Either author something that serves `
      + 'it, or remove the need so the system stops claiming it.',
    ));
  }
}

function checkEvidence(
  graph: PurposeGraphV1,
  findings: PurposeGraphFindingV1[],
): PurposeOpenObligationV1[] {
  const open: PurposeOpenObligationV1[] = [];
  for (const node of graph.nodes) {
    if (node.evidence.kind === 'open') {
      open.push(Object.freeze({
        nodeId: node.id,
        reason: node.evidence.reason,
        wouldBeClosedBy: node.evidence.wouldBeClosedBy,
      }));
      continue;
    }
    if (node.evidence.establishes.length === 0) {
      findings.push(finding(
        'empty-binding',
        node.id,
        `Node '${node.id}' binds proof '${node.evidence.proofId}' but lists `
        + 'nothing that proof establishes, so the binding asserts nothing. '
        + 'State what the run shows, or record the evidence as open.',
      ));
    }
  }
  return open;
}

function boundaryNodes(
  graph: PurposeGraphV1,
): readonly PurposeBoundaryNodeV1[] {
  return graph.nodes.filter((node): node is PurposeBoundaryNodeV1 =>
    isPurposeBoundaryKindV1(node.kind));
}

function checkClaimReferences(
  claim: PurposeConservationClaimV1,
  boundaries: readonly PurposeBoundaryNodeV1[],
  findings: PurposeGraphFindingV1[],
): void {
  const byId = new Map(boundaries.map((node) => [node.id, node]));
  const check = (
    ids: readonly PurposeNodeIdV1[],
    polarity: 'source' | 'sink',
  ): void => {
    for (const id of ids) {
      const node = byId.get(id);
      if (node === undefined) {
        findings.push(finding(
          'claim-polarity-mismatch',
          id,
          `The '${claim.quantity}' claim lists '${id}' as a ${polarity}, but `
          + 'that id is not a boundary node in this graph. Only '
          + 'material-source, material-sink, energy-source, and energy-sink '
          + 'nodes may appear in a conservation claim.',
        ));
        continue;
      }
      if (!node.kind.endsWith(polarity)) {
        findings.push(finding(
          'claim-polarity-mismatch',
          id,
          `The '${claim.quantity}' claim lists '${id}' as a ${polarity}, but `
          + `that node's kind is '${node.kind}'. Move it to the other side of `
          + 'the claim, or correct the node kind.',
        ));
        continue;
      }
      if (node.quantity !== claim.quantity) {
        findings.push(finding(
          'claim-polarity-mismatch',
          id,
          `The '${claim.quantity}' claim lists '${id}', which crosses `
          + `'${node.quantity}' instead. A claim may only reference boundaries `
          + 'carrying its own quantity.',
        ));
      }
    }
  };
  check(claim.sourceIds, 'source');
  check(claim.sinkIds, 'sink');
}

function checkConservation(
  graph: PurposeGraphV1,
  findings: PurposeGraphFindingV1[],
): void {
  const boundaries = boundaryNodes(graph);
  const claimedQuantities = new Set<string>();

  for (const claim of graph.conservationClaims) {
    claimedQuantities.add(claim.quantity);
    checkClaimReferences(claim, boundaries, findings);

    const crossings = boundaries.filter(
      (node) => node.quantity === claim.quantity,
    );
    if (claim.closed) {
      if (crossings.length > 0) {
        findings.push(finding(
          'closed-claim-with-boundary',
          claim.quantity,
          `System '${graph.systemId}' claims '${claim.quantity}' is closed, but `
          + `declares ${String(crossings.length)} boundary node(s) carrying it: `
          + `${quoteList(crossings.map((node) => node.id))}. A source or sink `
          + 'is exactly where the system opens. Set closed to false and list '
          + 'them, or remove the boundary nodes.',
        ));
      }
      continue;
    }
    const listed = [...claim.sourceIds, ...claim.sinkIds];
    if (listed.length === 0) {
      findings.push(finding(
        'open-claim-without-boundary',
        claim.quantity,
        `System '${graph.systemId}' calls '${claim.quantity}' open but names no `
        + 'source or sink, so the statement cannot be checked against anything. '
        + 'List the boundary nodes where the quantity enters or leaves.',
      ));
      continue;
    }
    const listedIds = new Set(listed);
    const missing = crossings.filter((node) => !listedIds.has(node.id));
    if (missing.length > 0) {
      findings.push(finding(
        'unlisted-boundary',
        claim.quantity,
        `The '${claim.quantity}' claim omits `
        + `${quoteList(missing.map((node) => node.id))}, which also carry that `
        + 'quantity across the system boundary. An accounting that skips a '
        + 'crossing cannot balance. Add them to the claim.',
      ));
    }
  }

  for (const node of boundaries) {
    if (claimedQuantities.has(node.quantity)) continue;
    findings.push(finding(
      'unclaimed-quantity',
      node.id,
      `Boundary '${node.id}' moves '${node.quantity}' across the edge of `
      + `system '${graph.systemId}', but no conservation claim covers that `
      + 'quantity, so the system never says what the crossing means. Add a '
      + `claim for '${node.quantity}'.`,
    ));
  }
}

export function checkPurposeGraphV1(
  graph: PurposeGraphV1,
): PurposeGraphReportV1 {
  const findings: PurposeGraphFindingV1[] = [];
  const byId = checkIdentity(graph, findings);
  checkEdges(graph, byId, findings);
  collectCycle(graph, byId, findings);
  checkServedNeeds(graph, findings);
  const openObligations = checkEvidence(graph, findings);
  checkConservation(graph, findings);

  return Object.freeze({
    schema: PURPOSE_GRAPH_REPORT_SCHEMA_V1,
    systemId: graph.systemId,
    ok: findings.length === 0,
    findings: Object.freeze(findings),
    nodeCount: graph.nodes.length,
    rootCount: graph.nodes.filter(
      (node) => node.kind === 'experience-need',
    ).length,
    boundNodeCount: graph.nodes.filter(
      (node) => node.evidence.kind === 'bound',
    ).length,
    openObligations: Object.freeze(openObligations),
  });
}

/** Throws with every finding spelled out. Used by tests and promotion gates. */
export function assertPurposeGraphV1(graph: PurposeGraphV1): void {
  const report = checkPurposeGraphV1(graph);
  if (report.ok) return;
  const detail = report.findings.map(
    (item) => `  [${item.code}] ${item.subject}: ${item.message}`,
  ).join('\n');
  throw new Error(
    `Purpose graph '${graph.systemId}' has `
    + `${String(report.findings.length)} unresolved finding(s):\n${detail}`,
  );
}
