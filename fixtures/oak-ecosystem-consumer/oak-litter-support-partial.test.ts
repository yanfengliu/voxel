import { describe, expect, it } from 'vitest';

import { supportOakLeafRecordsOnTerrainV1 } from './oak-litter-support.js';
import { oakSoilSurfaceAtFineCellV1 } from './oak-soil-surface.js';
import { OAK_TISSUE_VOXEL_PITCH_M_V1 } from './oak-tissue-voxel-projection.js';
import { oakVoxelRecordAabbV1 } from './oak-voxel-aabb.js';

describe('oak partial litter support', () => {
  it('applies upward anti-penetration fully while easing only a safe downward settle', () => {
    const x = 86;
    const z = -44;
    const penetrationM = 0.000_108_267_086_062_336_51;
    const surface = oakSoilSurfaceAtFineCellV1(x, z);
    if (surface === null) throw new Error('Expected retained terrain for the fall counter-run.');
    const pitch = OAK_TISSUE_VOXEL_PITCH_M_V1;
    const record = {
      key: 'oak:organ:11:1:lamina-voxel:-1:33:-2',
      matrix: [
        pitch,0,0,0,
        0,pitch,0,0,
        0,0,pitch,0,
        (x + 0.5) * pitch,
        surface.topM - penetrationM + pitch / 2,
        (z + 0.5) * pitch,
        1,
      ],
      color: { r: 160, g: 88, b: 49, a: 255 },
    } as const;
    const supported = supportOakLeafRecordsOnTerrainV1([record], undefined, 0.25);
    expect(supported.verticalTranslationM).toBeCloseTo(penetrationM, 14);
    expect(oakVoxelRecordAabbV1(supported.records[0]!).min[1])
      .toBeCloseTo(surface.topM, 14);

    const safeAbove = {
      ...record,
      matrix: record.matrix.map((value, index) => index === 13 ? value + pitch : value),
    };
    const eased = supportOakLeafRecordsOnTerrainV1([safeAbove], undefined, 0.25);
    expect(eased.verticalTranslationM).toBeCloseTo((penetrationM - pitch) * 0.25, 14);
  });
});
