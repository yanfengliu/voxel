import type {
  WindmillCompactAssetKeyV1,
  WindmillCompactCandidateV1,
  WindmillCompactSailFrameV1,
  WindmillCompactTripleV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  PhysicalAssetV1,
} from '../../tools/studio/physical-asset.js';
import type {
  WindmillPitchedPlateFrameV1,
} from './windmill-pitched-plate-runtime.js';

export interface WindmillCompactWorldSailFrameV1 {
  readonly key: WindmillCompactSailFrameV1['key'];
  readonly shaftPointWorldMeters: WindmillCompactTripleV1;
  readonly centroidWorldMeters: WindmillCompactTripleV1;
  readonly stepEndpointsWorldMeters: readonly [
    WindmillCompactTripleV1,
    WindmillCompactTripleV1,
  ];
  readonly radialUnitWorld: WindmillCompactTripleV1;
  readonly chordUnitWorld: WindmillCompactTripleV1;
  readonly normalUnitWorld: WindmillCompactTripleV1;
}

export interface WindmillCompiledCompactCandidateV1 {
  readonly schema: 'fixture.windmill-compiled-compact-candidate/1';
  readonly candidate: WindmillCompactCandidateV1;
  readonly physicalAssets: Readonly<Record<
    WindmillCompactAssetKeyV1,
    PhysicalAssetV1
  >>;
  readonly bodyWorldMeters: Readonly<Record<
    WindmillCompactAssetKeyV1,
    WindmillCompactTripleV1
  >>;
  readonly boxColliderIndices: Readonly<Record<
    WindmillCompactAssetKeyV1,
    Readonly<Record<string, number>>
  >>;
  readonly contactColliderIndices: readonly {
    readonly key: 'cam-follower' | 'head-anvil';
    readonly firstAssetKey: WindmillCompactAssetKeyV1;
    readonly firstIndices: readonly number[];
    readonly secondAssetKey: WindmillCompactAssetKeyV1;
    readonly secondIndices: readonly number[];
  }[];
  readonly pitchedPlateFrames: readonly WindmillPitchedPlateFrameV1[];
  readonly worldSailFrames: readonly WindmillCompactWorldSailFrameV1[];
  readonly visibleGeometrySha256: string;
  readonly physicalSidecarSha256: string;
  readonly solverInputSha256: string;
  readonly evaluatorDeclarationSha256: string;
}
