import { describe, expect, it } from 'vitest';

import {
  createWindmillCompactCandidateV1,
} from './windmill-compact-geometry.js';
import {
  windmillCompactRequiredInterfacesV1,
} from './windmill-compact-geometry-evidence.js';
import {
  windmillCompactInterfaceGrammarV1,
} from './windmill-compact-interface-grammar.js';

describe('compact windmill need-led interface grammar', () => {
  it('returns the authored graph in the candidate fingerprint order', () => {
    const candidate = createWindmillCompactCandidateV1();
    expect(windmillCompactRequiredInterfacesV1(
      candidate.parameters,
      candidate.assets,
    )).toEqual(candidate.requiredInterfaces);
    const grammar = windmillCompactInterfaceGrammarV1(candidate.parameters);
    expect(new Set(grammar.interfaceNeeds.map(({ needId }) => needId)).size)
      .toBe(grammar.interfaceNeeds.length);
    for (const need of grammar.interfaceNeeds) {
      expect(need.job.trim().length, need.needId).toBeGreaterThan(20);
      expect(need.requiredByNeedIds.length, need.needId).toBeGreaterThan(0);
      expect(grammar.expectedBoxKeys[need.assetKey])
        .toContain(need.fromBoxKey);
      expect(grammar.expectedBoxKeys[need.assetKey]).toContain(need.toBoxKey);
    }
  });

  it('rejects a missing independently required face contact', () => {
    const candidate = createWindmillCompactCandidateV1();
    const rotor = {
      ...candidate.assets.rotor,
      boxes: candidate.assets.rotor.boxes.map((box) =>
        box.key === 'north-panel-step-z0'
          ? {
            ...box,
            at: [box.at[0] + 100, box.at[1], box.at[2]] as const,
          }
          : box),
    };
    expect(() => windmillCompactRequiredInterfacesV1(
      candidate.parameters,
      { rotor },
    )).toThrow(
      /interface need 'windmill:interface-need:rotor:north-spar-to-panel'/i,
    );
  });

  it('rejects an incidental face contact absent from the authored graph', () => {
    const parameters = {
      rotorRadiusVoxels: 5,
      groundClearanceVoxels: 1,
      sailRadialSpanVoxels: 3,
      camRadialLengthVoxels: 3,
      camHeightVoxels: 1,
      hammerRightArmLengthVoxels: 4,
      hammerHeadHeightVoxels: 2,
      initialHeadAnvilClearanceVoxels: 0,
    } as const;
    const candidate = createWindmillCompactCandidateV1(parameters);
    const frame = {
      ...candidate.assets.frame,
      boxes: candidate.assets.frame.boxes.map((box) =>
        box.key === 'rotor-front-bearing-lower-left-liner'
          ? { ...box, size: [2, box.size[1], box.size[2]] as const }
          : box),
    };
    expect(() => windmillCompactRequiredInterfacesV1(
      parameters,
      { frame },
    )).toThrow(
      /unexpected same-body face interface .*lower-left-liner.*lower-right-liner.*no authored need/i,
    );
  });
});
