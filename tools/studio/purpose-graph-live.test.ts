import { describe, expect, it } from 'vitest';

import {
  createRiverfallFluidConfigV1,
  RIVERFALL_FLUID_PARTICLE_COUNT,
} from '../../fixtures/riverfall-consumer/riverfall-fluid-config.js';
import {
  createMachineWorksPurposeGraphV1,
} from './machine-works-purpose-graph.js';
import {
  assertPurposeGraphV1,
  checkPurposeGraphV1,
} from './purpose-graph-check.js';
import {
  isPurposeBoundaryKindV1,
  purposeBoundaryV1,
  purposeGraphV1,
  type PurposeNodeIdV1,
} from './purpose-graph.js';
import {
  createRiverfallPurposeGraphV1,
  RIVERFALL_BOUND_ABLATIONS_V1,
  RIVERFALL_CLOSED_PARTICLE_COUNT_V1,
} from './riverfall-purpose-graph.js';
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

describe('the Riverfall purpose graph', () => {
  const graph = createRiverfallPurposeGraphV1();
  const report = checkPurposeGraphV1(graph);

  it('is well-formed', () => {
    expect(() => { assertPurposeGraphV1(graph); }).not.toThrow();
    expect(report.ok).toBe(true);
  });

  it('is closed in water mass and open in energy', () => {
    const water = graph.conservationClaims.find(
      (claim) => claim.quantity === 'water-mass',
    );
    const energy = graph.conservationClaims.find(
      (claim) => claim.quantity === 'energy',
    );

    expect(water?.closed).toBe(true);
    expect(water?.sourceIds).toEqual([]);
    expect(water?.sinkIds).toEqual([]);
    expect(energy?.closed).toBe(false);
    expect(energy?.sourceIds).toHaveLength(2);
    expect(energy?.sinkIds).toHaveLength(2);
  });

  it('refuses a closed water claim once a crossing is declared', () => {
    const leaking = purposeGraphV1(
      graph.systemId,
      [
        ...graph.nodes,
        purposeBoundaryV1({
          id: 'riverfall:sink:evaporation',
          kind: 'material-sink',
          label: 'Evaporation',
          job: 'Remove water from the reach.',
          quantity: 'water-mass',
          visibility: 'invisible',
          truncates: 'Everything about the air above the surface.',
          requiredBy: ['riverfall:need:water-reads-as-flowing'],
          evidence: {
            kind: 'open',
            reason: 'Nothing models it.',
            wouldBeClosedBy: 'A run that meters mass leaving the surface.',
          },
          honestyBoundary: 'None.',
        }),
      ],
      graph.conservationClaims,
    );

    const leakingReport = checkPurposeGraphV1(leaking);
    expect(leakingReport.findings.map((item) => item.code))
      .toContain('closed-claim-with-boundary');
  });

  it('records the two forcings that no ablation isolates', () => {
    const open = report.openObligations.map((item) => item.nodeId);

    expect(open).toContain('riverfall:source:inlet-forcing');
    expect(open).toContain('riverfall:sink:impact-dissipation');
    expect(open).toContain('riverfall:motion:dissipative-boundary-impact');
  });

  it('binds every other law to an ablation the fixture actually runs', () => {
    const bound = graph.nodes
      .filter((node) => node.evidence.kind === 'bound')
      .map((node) => (node.evidence.kind === 'bound' ? node.evidence.proofId : ''))
      .filter((proofId) => proofId.includes('ablation'));

    expect(bound.length).toBeGreaterThan(0);
    for (const proofId of bound) {
      const named = RIVERFALL_BOUND_ABLATIONS_V1.some(
        (ablation) => proofId.includes(ablation),
      );
      expect(named, `${proofId} names a real fixture ablation`).toBe(true);
    }
  });

  it('marks every presentation construct as not a solved field', () => {
    const presentation = graph.nodes.filter(
      (node) => node.id.startsWith('riverfall:presentation:'),
    );

    expect(presentation.length).toBeGreaterThan(4);
    for (const node of presentation) {
      expect(node.honestyBoundary, `${node.id} states what it is not`)
        .toContain('not a solved water height');
    }
  });
});

describe('the Riverfall graph against the live fixture', () => {
  it('names only ablations the fixture accepts', () => {
    for (const ablation of RIVERFALL_BOUND_ABLATIONS_V1) {
      expect(
        () => createRiverfallFluidConfigV1({ ablation }),
        `the fixture still runs '${ablation}'`,
      ).not.toThrow();
    }
  });

  it('would reject an ablation the fixture does not run', () => {
    expect(() => createRiverfallFluidConfigV1({
      ablation: 'zero-impact' as never,
    })).toThrow(/zero-impact/);
  });

  it('keeps its closed-mass particle count in step with the fixture', () => {
    expect(RIVERFALL_CLOSED_PARTICLE_COUNT_V1)
      .toBe(RIVERFALL_FLUID_PARTICLE_COUNT);
  });
});
