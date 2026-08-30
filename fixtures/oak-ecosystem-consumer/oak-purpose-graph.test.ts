import { describe, expect, it } from 'vitest';

import {
  assertPurposeGraphV1,
  checkPurposeGraphV1,
} from '../../tools/studio/purpose-graph-check.js';
import type { PurposeGraphV1 } from '../../tools/studio/purpose-graph.js';
import { createOakEcosystemPurposeGraphV1 } from './oak-purpose-graph.js';

describe('oak ecosystem purpose graph', () => {
  it('traces every authored reduction to a need and declares all four resource boundaries', () => {
    const graph = createOakEcosystemPurposeGraphV1();
    const report = checkPurposeGraphV1(graph);
    expect(() => { assertPurposeGraphV1(graph); }).not.toThrow();
    expect(report.ok).toBe(true);
    expect(report.openObligations).toEqual([]);
    expect(graph.conservationClaims.map((claim) => claim.quantity).sort())
      .toEqual(['carbon', 'nitrogen', 'phosphorus', 'water']);
    expect(graph.nodes.every((node) => node.evidence.kind === 'bound')).toBe(true);
  });

  it('fails its own control when an authored node loses its beneficiary', () => {
    const graph = createOakEcosystemPurposeGraphV1();
    const targetId = 'fixture:oak-ecosystem:solid:lobed-leaves';
    const broken = {
      ...graph,
      nodes: graph.nodes.map((node) => node.id === targetId
        ? { ...node, requiredBy: [] }
        : node),
    } as PurposeGraphV1;
    const report = checkPurposeGraphV1(broken);
    expect(report.ok).toBe(false);
    expect(report.findings).toContainEqual(expect.objectContaining({
      code: 'orphan-node',
      subject: targetId,
    }));
  });
});
