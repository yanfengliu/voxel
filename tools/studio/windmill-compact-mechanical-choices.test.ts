import { describe, expect, it } from 'vitest';

import {
  windmillCompactBoxRuleV1,
} from './windmill-compact-accountability.js';
import {
  createWindmillCompactCandidateV1,
  WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1,
  WINDMILL_COMPACT_PARAMETER_RANGES_V1,
  type WindmillCompactBoxV1,
  type WindmillCompactCandidateV1,
} from './windmill-compact-geometry.js';
import {
  enumerateWindmillCompactGeometryV1,
} from './windmill-compact-geometry-enumeration.js';

function worldBox(
  candidate: WindmillCompactCandidateV1,
  boxKey: string,
): WindmillCompactBoxV1 {
  for (const asset of Object.values(candidate.assets)) {
    const box = asset.boxes.find(({ key }) => key === boxKey);
    if (box !== undefined) {
      return {
        ...box,
        at: box.at.map((value, axis) =>
          value + asset.worldOriginVoxels[axis]!) as [number, number, number],
      };
    }
  }
  throw new Error(`Missing compact world box '${boxKey}'.`);
}

describe('compact windmill mechanical placement choices', () => {
  it('makes both collar arms a mirrored, first-moment-cancelling pair', () => {
    const candidate = createWindmillCompactCandidateV1();
    const assemblies = [
      {
        westKey: 'rotor-thrust-collar-west',
        eastKey: 'rotor-thrust-collar-east',
        portKey: 'rotor-axis',
        assetKey: 'rotor',
      },
      {
        westKey: 'hammer-collar-west',
        eastKey: 'hammer-collar-east',
        portKey: 'hammer-axis',
        assetKey: 'hammer',
      },
    ] as const;
    for (const assembly of assemblies) {
      const west = worldBox(candidate, assembly.westKey);
      const east = worldBox(candidate, assembly.eastKey);
      const axisX = candidate.ports.find(({ key }) =>
        key === assembly.portKey)?.worldPositionVoxels[0];
      if (axisX === undefined) {
        throw new Error(`Missing compact port '${assembly.portKey}'.`);
      }
      const volume = (box: WindmillCompactBoxV1) =>
        box.size.reduce((product, extent) => product * extent, 1);
      const offset = (box: WindmillCompactBoxV1) =>
        box.at[0] + box.size[0] / 2 - axisX;
      expect(west.size).toEqual(east.size);
      expect(west.materialProfile).toBe(east.materialProfile);
      expect(offset(west)).toBe(-offset(east));
      expect(volume(west) * offset(west)
        + volume(east) * offset(east)).toBe(0);
      expect(volume(west) * offset(west)).not.toBe(0);
      for (const key of [assembly.westKey, assembly.eastKey]) {
        const box = candidate.assets[assembly.assetKey].boxes.find(
          (entry) => entry.key === key,
        );
        if (box === undefined) throw new Error(`Missing collar '${key}'.`);
        const purpose = windmillCompactBoxRuleV1(box);
        expect(purpose.job).toContain('radial first moment');
        expect(purpose.removalConsequence).toContain('one-sided');
      }
    }
  });

  it('derives the follower elbow as the first column beyond every cam nose', () => {
    expect(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1).toBe(
      Math.max(
        ...WINDMILL_COMPACT_PARAMETER_RANGES_V1.camRadialLengthVoxels,
      ) + 1,
    );
    const candidates = enumerateWindmillCompactGeometryV1().attempts
      .filter((attempt) => attempt.outcome === 'candidate')
      .map(({ candidate }) => candidate);
    for (const candidate of candidates) {
      const upper = worldBox(candidate, 'hammer-follower-upper-link');
      const lower = worldBox(candidate, 'hammer-follower-lower-link');
      const positiveNose = worldBox(candidate, 'rotor-cam-nose');
      expect(lower.at[0], candidate.parameterKey)
        .toBe(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1);
      expect(upper.at[0] + upper.size[0], candidate.parameterKey)
        .toBe(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1 + 1);
      expect(positiveNose.at[0] + positiveNose.size[0])
        .toBeLessThanOrEqual(WINDMILL_COMPACT_FOLLOWER_ELBOW_X_V1);
      const box = candidate.assets.hammer.boxes.find(({ key }) =>
        key === 'hammer-follower-upper-link');
      if (box === undefined) throw new Error('Missing upper follower link.');
      const rule = windmillCompactBoxRuleV1(box);
      expect(rule.minimumForm).toContain('earliest common safe elbow');
      expect(rule.minimumForm).toContain('later elbow adds raised cells');
    }
  });
});
