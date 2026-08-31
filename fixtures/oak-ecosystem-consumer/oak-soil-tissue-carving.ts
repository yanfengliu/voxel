export interface OakSoilTissueCarveOptionsV1 {
  readonly centersM: readonly (readonly [number, number, number])[];
  readonly tissueCubeSizeM: number;
  readonly soilVoxelSizeM: number;
  readonly chunkOrigin: Readonly<{ x: number; y: number; z: number }>;
  readonly chunkSize: Readonly<{ x: number; y: number; z: number }>;
}

/** Return X-major soil slots having positive-volume overlap with a tissue cube. */
export function oakSoilTissueCarveIndicesV1(
  options: OakSoilTissueCarveOptionsV1,
): ReadonlySet<number> {
  if (!(options.tissueCubeSizeM > 0) || !(options.soilVoxelSizeM > 0)) {
    throw new RangeError('Oak soil tissue carving requires positive tissue and soil voxel sizes.');
  }
  const result = new Set<number>();
  const tissueHalf = options.tissueCubeSizeM * .5;
  for (const center of options.centersM) {
    if (!center.every(Number.isFinite)) {
      throw new RangeError('Oak soil tissue carving received a non-finite cube center.');
    }
    const ranges = center.map((coordinate) => ({
      minimum: Math.floor((coordinate - tissueHalf) / options.soilVoxelSizeM),
      maximum: Math.floor((coordinate + tissueHalf) / options.soilVoxelSizeM),
    }));
    for (let worldY = ranges[1]!.minimum; worldY <= ranges[1]!.maximum; worldY += 1) {
      for (let worldZ = ranges[2]!.minimum; worldZ <= ranges[2]!.maximum; worldZ += 1) {
        for (let worldX = ranges[0]!.minimum; worldX <= ranges[0]!.maximum; worldX += 1) {
          const world = [worldX, worldY, worldZ];
          const overlaps = center.every((coordinate, axis) => {
            const voxelMinimum = world[axis]! * options.soilVoxelSizeM;
            return Math.min(coordinate + tissueHalf, voxelMinimum + options.soilVoxelSizeM)
              - Math.max(coordinate - tissueHalf, voxelMinimum) > 0;
          });
          if (!overlaps) continue;
          const localX = worldX - options.chunkOrigin.x;
          const localY = worldY - options.chunkOrigin.y;
          const localZ = worldZ - options.chunkOrigin.z;
          if (localX < 0 || localY < 0 || localZ < 0
            || localX >= options.chunkSize.x || localY >= options.chunkSize.y
            || localZ >= options.chunkSize.z) continue;
          result.add(localX + options.chunkSize.x * (localZ + options.chunkSize.z * localY));
        }
      }
    }
  }
  return result;
}
