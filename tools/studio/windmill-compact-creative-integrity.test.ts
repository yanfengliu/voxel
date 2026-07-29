import { describe, expect, it } from 'vitest';

import { createWindmillCompactCreativeV1 } from './windmill-compact-creative.js';
import {
  createWindmillCompactCandidateV1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
} from './windmill-compact-geometry.js';

describe('compact windmill creative input integrity', () => {
  it('fails closed when geometry, purpose, role, location, or hash is detached', () => {
    const candidate = createWindmillCompactCandidateV1();
    const first = candidate.assets.rotor.boxes[0]!;
    const withFirstRotorBox = (
      replacement: WindmillCompactBoxV1,
    ): typeof candidate => ({
      ...candidate,
      assets: {
        ...candidate.assets,
        rotor: {
          ...candidate.assets.rotor,
          boxes: [replacement, ...candidate.assets.rotor.boxes.slice(1)],
        },
      },
    });
    const missingBox = {
      ...candidate,
      assets: {
        ...candidate.assets,
        rotor: {
          ...candidate.assets.rotor,
          boxes: candidate.assets.rotor.boxes.slice(1),
        },
      },
    };
    const mutations: readonly WindmillCompactCandidateV1[] = [
      missingBox,
      withFirstRotorBox({ ...first, bodyKey: 'frame' }),
      withFirstRotorBox({
        ...first,
        purposeId: 'windmill:purpose:hammer-contact-witness-face',
      }),
      withFirstRotorBox({ ...first, role: 'impact-face' }),
      withFirstRotorBox({
        ...first,
        at: [first.at[0] + 1, first.at[1], first.at[2]],
      }),
      {
        ...candidate,
        geometryFingerprint: 'fnv1a64:0000000000000000',
      },
    ];
    mutations.forEach((mutation) => {
      expect(() => createWindmillCompactCreativeV1(mutation))
        .toThrow(/does not exactly match the canonical parameterized generator/i);
    });
  });
});
