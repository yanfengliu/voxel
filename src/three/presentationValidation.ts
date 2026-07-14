import type {
  ChunkPresentation,
  GeometryPresentation,
  InstanceBatchPresentation,
  MaterialPresentation,
} from './presentationTypes.js';

interface PresentationValidationInputInternal {
  readonly epoch: string;
  readonly revision: number;
  readonly materials: readonly MaterialPresentation[];
  readonly geometries: readonly GeometryPresentation[];
  readonly chunks: readonly ChunkPresentation[];
  readonly batches: readonly InstanceBatchPresentation[];
}

/** Validates backend-only relationships after portable canonical validation. */
export function validateThreePresentationInternal(
  snapshot: PresentationValidationInputInternal,
): void {
  if (snapshot.epoch.length === 0) throw new Error('Presentation epoch must not be empty.');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new RangeError('Presentation revision must be a non-negative safe integer.');
  }
  const materialKeys = new Set(snapshot.materials.map((resource) => resource.key));
  const geometryKeys = new Set(snapshot.geometries.map((resource) => resource.key));
  for (const chunk of snapshot.chunks) {
    if (!materialKeys.has(chunk.materialKey)) {
      throw new Error(`Chunk ${chunk.key} references missing material ${chunk.materialKey}.`);
    }
  }
  for (const batch of snapshot.batches) {
    if (!geometryKeys.has(batch.geometryKey)) {
      throw new Error(`Batch ${batch.key} references missing geometry ${batch.geometryKey}.`);
    }
    if (!materialKeys.has(batch.materialKey)) {
      throw new Error(`Batch ${batch.key} references missing material ${batch.materialKey}.`);
    }
    if (batch.matrices.length !== batch.instanceKeys.length * 16) {
      throw new Error(`Batch ${batch.key} matrix count does not match its instance keys.`);
    }
    if (batch.colors && batch.colors.length !== batch.instanceKeys.length * 4) {
      throw new Error(`Batch ${batch.key} color count does not match its instance keys.`);
    }
    if (batch.animation) {
      const count = batch.instanceKeys.length;
      if (
        batch.animation.periodsMs.length !== count
        || batch.animation.phasesRadians.length !== count
        || batch.animation.translationAmplitudes.length !== count * 3
        || batch.animation.rotationAmplitudesRadians.length !== count * 3
        || batch.animation.scaleAmplitudes.length !== count * 3
      ) {
        throw new Error(`Batch ${batch.key} animation count does not match its instance keys.`);
      }
    }
  }
}
