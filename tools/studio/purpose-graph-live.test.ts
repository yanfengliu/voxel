import { describe, expect, it } from 'vitest';

import {
  createMachineWorksPurposeGraphV1,
} from './machine-works-purpose-graph.js';
import {
  assertPurposeGraphV1,
  checkPurposeGraphV1,
} from './purpose-graph-check.js';
import {
  isPurposeBoundaryKindV1,
  type PurposeNodeIdV1,
} from './purpose-graph.js';
import {
  WINDMILL_COMPACT_PURPOSE_NEEDS_V1,
} from './windmill-compact-purpose-needs.js';
import { createWindmillPurposeGraphV1 } from './windmill-purpose-graph.js';

/**
 * The kernel run over the real authored systems. A failure here means an
 * authored decision lost its beneficiary, a stated need went unserved, or a
 * conservation claim drifted from the boundaries the fixture actually declares.
 */

describe('the Machine Works purpose graph', () => {
  const graph = createMachineWorksPurposeGraphV1();
  const report = checkPurposeGraphV1(graph);

  it('is well-formed', () => {
    expect(() => { assertPurposeGraphV1(graph); }).not.toThrow();
    expect(report.ok).toBe(true);
  });

  it('traces every authored placement to a stated need', () => {
    const needs = new Set(graph.nodes
      .filter((node) => node.kind === 'experience-need')
      .map((node) => node.id));
    expect(needs.size).toBe(3);

    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes) {
      if (node.kind === 'experience-need') continue;
      const seen = new Set<string>();
      const queue = [...node.requiredBy];
      let reachesNeed = false;
      while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined || seen.has(next)) continue;
        seen.add(next);
        if (needs.has(next)) {
          reachesNeed = true;
          break;
        }
        const target = byId.get(next);
        if (target !== undefined) queue.push(...target.requiredBy);
      }
      expect(reachesNeed, `${node.id} reaches a stated need`).toBe(true);
    }
  });

  it('records the parts the fixture keeps outside the solver as open', () => {
    const open = report.openObligations.map((item) => item.nodeId);

    expect(open).toContain('machine-works:solid:assembly-press-bridge');
    expect(open).toContain('machine-works:solid:output-trunnion-dock');
    expect(open).toContain('machine-works:solid:exposed-drive-phase-flags');
    for (const obligation of report.openObligations) {
      expect(obligation.wouldBeClosedBy.length).toBeGreaterThan(0);
    }
  });

  it('declares an open energy boundary rather than a conservation claim', () => {
    const energy = graph.conservationClaims.find(
      (claim) => claim.quantity === 'energy',
    );
    expect(energy?.closed).toBe(false);
    expect(energy?.sourceIds).toHaveLength(3);
    expect(energy?.sinkIds).toHaveLength(1);

    const boundaries = graph.nodes.filter(
      (node) => isPurposeBoundaryKindV1(node.kind),
    );
    expect(boundaries).toHaveLength(4);
    for (const node of boundaries) {
      expect(
        'truncates' in node ? node.truncates : '',
        `${node.id} says what it stops simulating`,
      ).not.toBe('');
    }
  });

  it('fails closed when a category loses its declared beneficiary', () => {
    const graphWithGap = {
      ...graph,
      nodes: graph.nodes.filter(
        (node) => node.id !== 'machine-works:solid:product-cap',
      ),
    };

    const gapReport = checkPurposeGraphV1(graphWithGap);
    expect(gapReport.ok).toBe(false);
    expect(gapReport.findings.map((item) => item.code))
      .toContain('unresolved-edge');
  });
});

describe('the Windmill purpose graph', () => {
  const graph = createWindmillPurposeGraphV1();
  const report = checkPurposeGraphV1(graph);

  it('is well-formed once contact pairs serve a named interface', () => {
    expect(() => { assertPurposeGraphV1(graph); }).not.toThrow();
    expect(report.ok).toBe(true);
  });

  it('covers every authored purpose need from the compact ledger', () => {
    const projected = new Set(graph.nodes.map((node) => node.id));
    for (const key of Object.keys(WINDMILL_COMPACT_PURPOSE_NEEDS_V1)) {
      expect(projected.has(key as never), `${key} is projected`).toBe(true);
    }
  });

  it('keeps the upper hammer cell an open obligation', () => {
    const open = report.openObligations.find(
      (item) => item.nodeId === 'windmill:purpose:hammer-head-return-mass',
    );
    expect(open?.reason).toContain('No isolated upper-cell dynamics ablation');
    expect(open?.wouldBeClosedBy).toContain('removes only this cell');
  });

  it('treats gravity as internal and wind as the only work input', () => {
    const energy = graph.conservationClaims.find(
      (claim) => claim.quantity === 'energy',
    );
    expect(energy?.closed).toBe(false);
    expect(energy?.sourceIds).toEqual(['windmill:source:world-wind-flow']);
    expect(energy?.statement).toContain('internal conservative field');
  });
});

describe('the prose beneficiary sentences the graph replaces', () => {
  it('would form a justification cycle if copied literally', () => {
    const graph = createWindmillPurposeGraphV1();
    const literal = {
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.id === 'windmill:purpose:primary-cam-contact-nose') {
          return {
            ...node,
            requiredBy: [
              'windmill:purpose:cam-follower-contact-participant',
            ] as readonly PurposeNodeIdV1[],
          };
        }
        if (node.id === 'windmill:purpose:cam-follower-contact-participant') {
          return {
            ...node,
            requiredBy: [
              'windmill:purpose:primary-cam-contact-nose',
            ] as readonly PurposeNodeIdV1[],
          };
        }
        return node;
      }),
    };

    const literalReport = checkPurposeGraphV1(literal);
    const cycle = literalReport.findings.find(
      (item) => item.code === 'justification-cycle',
    );
    expect(cycle?.message).toContain('closes on itself');
  });
});
