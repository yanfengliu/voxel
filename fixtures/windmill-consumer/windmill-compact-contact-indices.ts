import type {
  WindmillCompactAssetKeyV1,
  WindmillCompactAssetV1,
  WindmillCompactCandidateV1,
} from '../../tools/studio/windmill-compact-geometry.js';
import type {
  WindmillCompiledCompactCandidateV1,
} from './windmill-compact-physical-contract.js';

type IndexBook = WindmillCompiledCompactCandidateV1['boxColliderIndices'];

function ownerOf(
  candidate: WindmillCompactCandidateV1,
  boxKey: string,
): WindmillCompactAssetKeyV1 {
  const owners = (Object.entries(candidate.assets) as [
    WindmillCompactAssetKeyV1,
    WindmillCompactAssetV1,
  ][]).filter(([, asset]) =>
    asset.boxes.some((box) => box.key === boxKey));
  if (owners.length !== 1) {
    throw new Error(
      `Cannot compile compact windmill contact box '${boxKey}': expected `
      + `exactly one owning asset, found ${String(owners.length)}.`,
    );
  }
  return owners[0]![0];
}

function indicesForSide(
  candidate: WindmillCompactCandidateV1,
  indices: IndexBook,
  groupKey: string,
  side: 'first' | 'second',
  boxKeys: readonly string[],
): {
  readonly assetKey: WindmillCompactAssetKeyV1;
  readonly colliderIndices: readonly number[];
} {
  if (boxKeys.length === 0 || new Set(boxKeys).size !== boxKeys.length) {
    throw new Error(
      `Cannot compile compact windmill contact group '${groupKey}' ${side} `
      + 'side: expected a nonempty list of unique named boxes.',
    );
  }
  const owners = boxKeys.map((key) => ownerOf(candidate, key));
  const assetKey = owners[0]!;
  if (owners.some((owner) => owner !== assetKey)) {
    throw new Error(
      `Cannot compile compact windmill contact group '${groupKey}' ${side} `
      + `side: boxes span assets [${owners.join(', ')}]; one compound contact `
      + 'side must belong to one rigid body.',
    );
  }
  const colliderIndices = boxKeys.map((key) => {
    const index = indices[assetKey][key];
    const colliderCount = candidate.assets[assetKey].boxes.length;
    if (!Number.isSafeInteger(index)
      || index === undefined
      || index < 0
      || index >= colliderCount) {
      throw new Error(
        `Cannot compile compact windmill contact group '${groupKey}': box `
        + `'${key}' maps to invalid collider index ${String(index)} for `
        + `'${assetKey}' with ${String(colliderCount)} colliders.`,
      );
    }
    return index;
  });
  if (new Set(colliderIndices).size !== colliderIndices.length) {
    throw new Error(
      `Cannot compile compact windmill contact group '${groupKey}' ${side} `
      + 'side: distinct box keys collapsed onto one collider index.',
    );
  }
  return {
    assetKey,
    colliderIndices: Object.freeze(colliderIndices),
  };
}

export function compileWindmillCompactContactIndicesV1(
  candidate: WindmillCompactCandidateV1,
  indices: IndexBook,
): WindmillCompiledCompactCandidateV1['contactColliderIndices'] {
  return Object.freeze(candidate.intentionalContactGroups.map((group) => {
    const first = indicesForSide(
      candidate,
      indices,
      group.key,
      'first',
      group.firstBoxKeys,
    );
    const second = indicesForSide(
      candidate,
      indices,
      group.key,
      'second',
      group.secondBoxKeys,
    );
    if (first.assetKey === second.assetKey) {
      throw new Error(
        `Cannot compile compact windmill contact group '${group.key}': both `
        + `sides belong to '${first.assetKey}', so the declared inter-body `
        + 'handoff cannot occur.',
      );
    }
    return Object.freeze({
      key: group.key,
      firstAssetKey: first.assetKey,
      firstIndices: first.colliderIndices,
      secondAssetKey: second.assetKey,
      secondIndices: second.colliderIndices,
    });
  }));
}
