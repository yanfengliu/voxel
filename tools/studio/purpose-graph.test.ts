import { describe, expect, it } from 'vitest';

import {
  assertPurposeGraphV1,
  checkPurposeGraphV1,
} from './purpose-graph-check.js';
import {
  purposeBoundaryV1,
  purposeGraphV1,
  purposeNeedV1,
  purposeNodeV1,
  type PurposeGraphV1,
  type PurposeNodeV1,
} from './purpose-graph.js';

/**
 * These tests drive the kernel with synthetic graphs so each failure mode is
 * isolated. The live Windmill and Machine Works projections are checked
 * separately in purpose-graph-live.test.ts.
 */

const bound = (proofId: string) => ({
  kind: 'bound' as const,
  proofId,
  establishes: ['The named run exercises this node.'],
});

const open = () => ({
  kind: 'open' as const,
  reason: 'No run binds this node yet.',
  wouldBeClosedBy: 'A fixture ablation that removes it and shows the loss.',
});

const need = purposeNeedV1({
  id: 'test:need:read-the-machine',
  label: 'Read the machine',
  job: 'A viewer must be able to tell what drives what.',
  rootRationale: 'The scene exists to be understood at the fixed camera.',
  evidence: bound('test:capture:front'),
  honestyBoundary: 'Readability only; no physical claim.',
});

const solid = purposeNodeV1({
  id: 'test:solid:drive-shaft',
  kind: 'solid',
  label: 'Drive shaft',
  job: 'Carry the visible rotation from source to load.',
  requiredBy: ['test:need:read-the-machine'],
  evidence: bound('test:run:nominal'),
  honestyBoundary: 'Rigid path only; no stress or wear.',
});

function graphOf(nodes: readonly PurposeNodeV1[]): PurposeGraphV1 {
  return purposeGraphV1('test:system', nodes);
}

describe('the purpose graph kernel', () => {
  it('accepts a graph where every node traces to a stated need', () => {
    const report = checkPurposeGraphV1(graphOf([need, solid]));

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.nodeCount).toBe(2);
    expect(report.rootCount).toBe(1);
  });

  it('catches an authored node that nothing requires', () => {
    const orphan = purposeNodeV1({
      id: 'test:solid:decorative-fin',
      kind: 'solid',
      label: 'Decorative fin',
      job: 'Break up the silhouette.',
      requiredBy: [],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'None.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, orphan]));

    expect(report.ok).toBe(false);
    expect(report.findings.map((item) => item.code)).toContain('orphan-node');
    const message = report.findings[0]?.message ?? '';
    expect(message).toContain('test:solid:decorative-fin');
    expect(message).toContain('named beneficiary');
  });

  it('catches an edge that names a node which does not exist', () => {
    const dangling = purposeNodeV1({
      id: 'test:solid:bracket',
      kind: 'solid',
      label: 'Bracket',
      job: 'Tie the shaft to the frame.',
      requiredBy: ['test:solid:frame-that-was-deleted'],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'None.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, dangling]));

    expect(report.findings.map((item) => item.code))
      .toContain('unresolved-edge');
    expect(report.findings[0]?.message)
      .toContain('test:solid:frame-that-was-deleted');
  });

  it('catches two nodes that justify each other in a circle', () => {
    const left = purposeNodeV1({
      id: 'test:solid:left',
      kind: 'solid',
      label: 'Left brace',
      job: 'Hold the right brace.',
      requiredBy: ['test:solid:right'],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'None.',
    });
    const right = purposeNodeV1({
      id: 'test:solid:right',
      kind: 'solid',
      label: 'Right brace',
      job: 'Hold the left brace.',
      requiredBy: ['test:solid:left'],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'None.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, left, right]));

    const cycle = report.findings.find(
      (item) => item.code === 'justification-cycle',
    );
    expect(cycle).toBeDefined();
    expect(cycle?.message).toContain('test:solid:left');
    expect(cycle?.message).toContain('test:solid:right');
    expect(cycle?.message).toContain('closes on itself');
  });

  it('catches a stated need that nothing serves', () => {
    const unserved = purposeNeedV1({
      id: 'test:need:show-the-water',
      label: 'Show the water',
      job: 'A viewer must see where the water goes.',
      rootRationale: 'The brief asks for a visible outflow.',
      evidence: open(),
      honestyBoundary: 'None.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, unserved]));

    const missing = report.findings.find(
      (item) => item.code === 'unserved-need',
    );
    expect(missing?.subject).toBe('test:need:show-the-water');
    expect(missing?.message).toContain('nothing in system');
  });

  it('reports open obligations without failing the graph', () => {
    const unproven = purposeNodeV1({
      id: 'test:motion:belt-drive',
      kind: 'motion-rule',
      label: 'Belt drive',
      job: 'Move the carrier along the belt.',
      requiredBy: ['test:need:read-the-machine'],
      evidence: open(),
      honestyBoundary: 'No solved friction.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, unproven]));

    expect(report.ok).toBe(true);
    expect(report.openObligations).toHaveLength(1);
    expect(report.openObligations[0]?.nodeId).toBe('test:motion:belt-drive');
    expect(report.openObligations[0]?.wouldBeClosedBy).toContain('ablation');
    expect(report.boundNodeCount).toBe(2);
  });

  it('rejects a binding that establishes nothing', () => {
    const hollow = purposeNodeV1({
      id: 'test:solid:hollow-claim',
      kind: 'solid',
      label: 'Hollow claim',
      job: 'Look proven.',
      requiredBy: ['test:need:read-the-machine'],
      evidence: { kind: 'bound', proofId: 'test:run:nominal', establishes: [] },
      honestyBoundary: 'None.',
    });

    const report = checkPurposeGraphV1(graphOf([need, solid, hollow]));

    expect(report.findings.map((item) => item.code)).toContain('empty-binding');
  });
});

describe('the purpose graph boundary accounting', () => {
  const pump = purposeBoundaryV1({
    id: 'test:source:recirculation-pump',
    kind: 'energy-source',
    label: 'Recirculation pump',
    job: 'Return outflow to the head of the reach at a fixed rate.',
    quantity: 'energy',
    visibility: 'invisible',
    truncates: 'The motor, its power supply, and every upstream generator.',
    requiredBy: ['test:need:read-the-machine'],
    evidence: bound('test:run:nominal'),
    honestyBoundary: 'Bounded pump work only; no electrical model.',
  });

  it('accepts an open system that names where it opens', () => {
    const report = checkPurposeGraphV1(purposeGraphV1(
      'test:system',
      [need, solid, pump],
      [{
        quantity: 'energy',
        closed: false,
        sourceIds: ['test:source:recirculation-pump'],
        sinkIds: [],
        statement: 'Energy enters at the pump and dissipates in contact.',
      }],
    ));

    expect(report.ok).toBe(true);
  });

  it('refuses a closed claim made by a system with a source', () => {
    const report = checkPurposeGraphV1(purposeGraphV1(
      'test:system',
      [need, solid, pump],
      [{
        quantity: 'energy',
        closed: true,
        sourceIds: [],
        sinkIds: [],
        statement: 'Energy is conserved globally.',
      }],
    ));

    const conflict = report.findings.find(
      (item) => item.code === 'closed-claim-with-boundary',
    );
    expect(conflict?.message).toContain('test:source:recirculation-pump');
    expect(conflict?.message).toContain('exactly where the system opens');
  });

  it('refuses an open claim that skips a declared crossing', () => {
    const drain = purposeBoundaryV1({
      id: 'test:sink:outflow-drain',
      kind: 'energy-sink',
      label: 'Outflow drain',
      job: 'Remove kinetic energy leaving the reach.',
      quantity: 'energy',
      visibility: 'visible',
      truncates: 'Everything downstream of the scene edge.',
      requiredBy: ['test:need:read-the-machine'],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'Bounded removal only.',
    });

    const report = checkPurposeGraphV1(purposeGraphV1(
      'test:system',
      [need, solid, pump, drain],
      [{
        quantity: 'energy',
        closed: false,
        sourceIds: ['test:source:recirculation-pump'],
        sinkIds: [],
        statement: 'Energy enters at the pump.',
      }],
    ));

    const missing = report.findings.find(
      (item) => item.code === 'unlisted-boundary',
    );
    expect(missing?.message).toContain('test:sink:outflow-drain');
  });

  it('refuses a crossing that no claim explains', () => {
    const report = checkPurposeGraphV1(graphOf([need, solid, pump]));

    const unclaimed = report.findings.find(
      (item) => item.code === 'unclaimed-quantity',
    );
    expect(unclaimed?.subject).toBe('test:source:recirculation-pump');
    expect(unclaimed?.message).toContain('never says what the crossing means');
  });

  it('refuses a source listed on the sink side of a claim', () => {
    const report = checkPurposeGraphV1(purposeGraphV1(
      'test:system',
      [need, solid, pump],
      [{
        quantity: 'energy',
        closed: false,
        sourceIds: [],
        sinkIds: ['test:source:recirculation-pump'],
        statement: 'Energy leaves at the pump.',
      }],
    ));

    expect(report.findings.map((item) => item.code))
      .toContain('claim-polarity-mismatch');
  });
});

describe('the purpose graph assertion helper', () => {
  it('passes a well-formed graph', () => {
    expect(() => { assertPurposeGraphV1(graphOf([need, solid])); })
      .not.toThrow();
  });

  it('names every finding in the thrown message', () => {
    const orphan = purposeNodeV1({
      id: 'test:solid:stray',
      kind: 'solid',
      label: 'Stray',
      job: 'Nothing.',
      requiredBy: [],
      evidence: bound('test:run:nominal'),
      honestyBoundary: 'None.',
    });

    expect(() => { assertPurposeGraphV1(graphOf([need, solid, orphan])); })
      .toThrow(/test:solid:stray/);
  });
});
