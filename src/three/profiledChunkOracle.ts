import {
  DEFAULT_RENDER_TRANSACTION_LIMITS_V1,
  type OwnedRenderSnapshotV1,
} from '../core/index.js';
import {
  ChunkIndexV1,
  INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
  VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
  preflightIndexedVisibleFaceOracleWorldV1,
  prepareIndexedVisibleFaceOracleInputV1,
  validateMesherOutputV1,
  type ValidatedMesherOutputV1,
} from '../meshing/index.js';
import {
  emitIndexedVisibleFaceOracleV1Internal,
  preflightPreparedIndexedVisibleFaceOracleV1Internal,
} from '../meshing/visible-face-oracle.js';

export interface ProfiledChunkOraclePresentationInternal {
  readonly key: string;
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly dependencySignature: string;
  readonly mesh: ValidatedMesherOutputV1;
}

export interface ProfiledChunkOracleMetricsInternal {
  readonly chunkCount: number;
  readonly projectedCopiedSampleBytes: number;
  readonly projectedPreparationWorkElements: number;
  readonly indexBuildWorkElements: number;
  readonly meshingWorkElements: number;
  readonly resultValidationWorkElements: number;
  readonly totalWorkElements: number;
  readonly outputBytes: number;
}

export interface ProfiledChunkOracleWorldInternal {
  readonly chunks: ReadonlyMap<string, ProfiledChunkOraclePresentationInternal>;
  readonly metrics: ProfiledChunkOracleMetricsInternal;
}

function checkedAdd(left: number, right: number, name: string): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function checkedMultiply(left: number, right: number, name: string): number {
  const value = left * right;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} exceeds safe-integer range.`);
  return value;
}

function indexBuildWork(chunkCount: number, resourceCount: number): number {
  const sortPasses = chunkCount <= 1 ? 0 : Math.ceil(Math.log2(chunkCount));
  return checkedAdd(
    checkedMultiply(chunkCount, 16 + sortPasses, 'profiled oracle index work'),
    resourceCount,
    'profiled oracle index work',
  );
}

/**
 * Synchronous profiled compatibility path. It is deliberately internal: V-06
 * moves identical pure inputs behind the packaged worker protocol.
 */
export function meshProfiledSnapshotChunksInternal(
  snapshot: OwnedRenderSnapshotV1,
): ProfiledChunkOracleWorldInternal {
  const profile = snapshot.descriptor.chunkProfile;
  if (!profile) throw new RangeError('A uniform chunk profile is required.');
  if (snapshot.chunks.length > snapshot.descriptor.limits.maxChunks) {
    throw new RangeError('Profiled visible-face oracle exceeds its declared maxChunks.');
  }
  const transactionLimits = snapshot.descriptor.transactionLimits
    ?? DEFAULT_RENDER_TRANSACTION_LIMITS_V1;
  const indexBuildWorkElements = indexBuildWork(
    snapshot.chunks.length,
    snapshot.resources.length,
  );
  if (indexBuildWorkElements > transactionLimits.maxValidationElements) {
    throw new RangeError(
      'Profiled visible-face oracle exceeds preparationLimits.maxPreparationWorkElements during index build.',
    );
  }
  const remainingPreparationWork =
    transactionLimits.maxValidationElements - indexBuildWorkElements;
  if (snapshot.chunks.length > 0 && remainingPreparationWork <= 0) {
    throw new RangeError(
      'Profiled visible-face oracle exceeds preparationLimits.maxPreparationWorkElements.',
    );
  }
  const preparationMetrics = preflightIndexedVisibleFaceOracleWorldV1(
    profile,
    snapshot.chunks.length,
    {
      maxChunks: snapshot.descriptor.limits.maxChunks,
      maxCopiedSampleBytes: snapshot.descriptor.limits.maxTotalBytes,
      maxPreparationWorkElements: Math.max(1, remainingPreparationWork),
    },
  );
  let totalWorkElements = checkedAdd(
    indexBuildWorkElements,
    preparationMetrics.projectedWorldPreparationWorkElements,
    'profiled oracle total work',
  );
  const index = ChunkIndexV1.build(profile, snapshot.chunks);
  const palettes = new Map(snapshot.resources.flatMap((resource) => (
    resource.kind === 'palette' ? [[resource.key, resource.entries.length] as const] : []
  )));
  const preparationLimits = {
    maxChunks: snapshot.descriptor.limits.maxChunks,
    maxCopiedSampleBytes: snapshot.descriptor.limits.maxTotalBytes,
    maxPreparationWorkElements:
      preparationMetrics.projectedWorldPreparationWorkElements || 1,
  } as const;
  const chunks = new Map<string, ProfiledChunkOraclePresentationInternal>();
  let meshingWorkElements = 0;
  let resultValidationWorkElements = 0;
  let outputBytes = 0;

  for (const chunk of snapshot.chunks) {
    const entry = index.forKey(chunk.key);
    if (!entry) throw new Error(`Profiled chunk index lost ${chunk.key}.`);
    const paletteEntryCount = palettes.get(chunk.paletteKey);
    if (paletteEntryCount === undefined) {
      throw new RangeError(`Missing palette for profiled chunk ${chunk.key}: ${chunk.paletteKey}`);
    }
    const remainingOutputBytes = snapshot.descriptor.limits.maxTotalBytes - outputBytes;
    const remainingWork = transactionLimits.maxValidationElements - totalWorkElements;
    if (remainingOutputBytes <= 0 || remainingWork <= 0) {
      throw new RangeError('Profiled visible-face oracle exhausted its declared world budget.');
    }
    const prepared = prepareIndexedVisibleFaceOracleInputV1({
      index,
      sourceCoordinate: entry.coordinate,
      worldId: snapshot.descriptor.worldId,
      epoch: snapshot.descriptor.epoch,
      materialPolicyVersion: 'opaque-v1',
      worldUnitsPerVoxel: snapshot.descriptor.coordinates.worldUnitsPerVoxel,
      paletteEntryCount,
      outputBudget: {
        ...INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1,
        maxTotalBytes: Math.min(
          INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1.maxTotalBytes,
          remainingOutputBytes,
        ),
        maxMeshingWorkElements: Math.min(
          INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1.maxMeshingWorkElements,
          remainingWork,
        ),
        maxResultValidationElements: Math.min(
          INDEXED_VISIBLE_FACE_ORACLE_DEFAULT_OUTPUT_BUDGET_V1.maxResultValidationElements,
          remainingWork,
        ),
      },
      preparationLimits,
    });
    const oraclePreflight = preflightPreparedIndexedVisibleFaceOracleV1Internal(
      prepared.input,
    );
    const jobWorkElements = checkedAdd(
      oraclePreflight.workElements,
      oraclePreflight.resultValidationWorkElements,
      'profiled oracle job work',
    );
    if (jobWorkElements > remainingWork) {
      throw new RangeError(
        'Profiled visible-face oracle exhausted its declared combined world work budget.',
      );
    }
    const output = emitIndexedVisibleFaceOracleV1Internal(oraclePreflight);
    const validated = validateMesherOutputV1(
      output,
      VISIBLE_FACE_ORACLE_DESCRIPTOR_V1,
      prepared.input,
    );
    if (!validated.ok) {
      throw new Error(
        `Built-in profiled oracle failed ${validated.issue.code} at ${validated.issue.path}: ${validated.issue.message}`,
      );
    }
    meshingWorkElements = checkedAdd(
      meshingWorkElements,
      validated.value.metrics.workElements,
      'profiled oracle meshing work',
    );
    resultValidationWorkElements = checkedAdd(
      resultValidationWorkElements,
      oraclePreflight.resultValidationWorkElements,
      'profiled oracle result validation work',
    );
    totalWorkElements = checkedAdd(
      totalWorkElements,
      jobWorkElements,
      'profiled oracle total work',
    );
    outputBytes = checkedAdd(
      outputBytes,
      validated.value.metrics.outputBytes,
      'profiled oracle output bytes',
    );
    chunks.set(chunk.key, Object.freeze({
      key: chunk.key,
      origin: chunk.origin,
      dependencySignature: prepared.input.dependencySignature,
      mesh: validated.value,
    }));
  }

  return Object.freeze({
    chunks,
    metrics: Object.freeze({
      chunkCount: chunks.size,
      projectedCopiedSampleBytes: preparationMetrics.projectedWorldCopiedSampleBytes,
      projectedPreparationWorkElements:
        preparationMetrics.projectedWorldPreparationWorkElements,
      indexBuildWorkElements,
      meshingWorkElements,
      resultValidationWorkElements,
      totalWorkElements,
      outputBytes,
    }),
  });
}
