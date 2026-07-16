import type { RenderSnapshotV1 } from '../../src/core/index.js';

import { validateGenomeV1, type VoxelGenomeV1 } from './genome.js';

/**
 * Turns a genome into a voxel render snapshot. This is the only place the
 * studio crosses from its own data into the engine's, and it is a pure
 * function: same genome, identical snapshot, always. That invariant is what
 * makes evolution history, tiny-JSON persistence, and runtime regeneration in
 * the games all work, so nothing here may read a clock or an RNG.
 *
 * The snapshot is chunk-based rather than instanced boxes. A studio that
 * rendered models differently from the games that ship them would be
 * inspecting its own approximation, and chunks are the path the games are
 * moving to.
 */

const WORLD_ID = 'world:maker-studio';
const CHUNK_KEY = 'chunk:model';
const PALETTE_KEY = 'palette:model';
const MATERIAL_KEY = 'material:model';

export interface BuildOptionsV1 {
  /** Distinguishes revisions of the same model. Must rise on every edit. */
  readonly revision: number;
  /** Separates lineages so one runtime never mixes unrelated models. */
  readonly epoch?: string;
}

export class GenomeBuildError extends Error {
  constructor(readonly issues: readonly { readonly path: string; readonly message: string }[]) {
    super(
      `Genome cannot build: ${issues.map((i) => `${i.path} ${i.message}`).join('; ')}`,
    );
    this.name = 'GenomeBuildError';
  }
}

export function buildSnapshot(
  genome: VoxelGenomeV1,
  options: BuildOptionsV1,
): RenderSnapshotV1 {
  // Edits clamp, so a genome reaching here should always be valid. When one is
  // not it came from outside, and building it anyway would misrender silently
  // rather than say what is wrong.
  const issues = validateGenomeV1(genome);
  if (issues.length > 0) throw new GenomeBuildError(issues);

  const [sx, sy, sz] = genome.size;
  const revision = options.revision;
  const epoch = options.epoch ?? `epoch:${genome.id}`;

  // voxel's chunk lane wants a Uint16Array of palette indices in the same
  // x-major order the genome stores, so this is a copy rather than a
  // transform. The genome keeps a plain array for JSON; the engine gets the
  // typed one it validates.
  const voxels = new Uint16Array(sx * sy * sz);
  for (let index = 0; index < voxels.length; index += 1) {
    voxels[index] = genome.voxels[index] ?? 0;
  }

  return {
    schemaVersion: 'voxel.render-snapshot/1',
    descriptor: {
      schemaVersion: 'voxel.world/1',
      worldId: WORLD_ID,
      epoch,
      coordinates: {
        handedness: 'right',
        upAxis: '+y',
        forwardAxis: '-z',
        chunkRounding: 'floor',
        metersPerWorldUnit: 1,
        worldUnitsPerVoxel: { x: 1, y: 1, z: 1 },
      },
      colorEncoding: 'srgb8-straight-alpha',
      capabilities: ['voxel-chunks'],
      chunkProfile: {
        layout: 'uniform-grid',
        size: { x: sx, y: sy, z: sz },
        gridOrigin: { x: 0, y: 0, z: 0 },
        emptyPaletteIndex: 0,
        surfaceModel: 'opaque',
        // A studio model is one isolated object, so anything outside it is
        // empty rather than an unloaded neighbour. This is what lets the
        // mesher close the model's outer faces instead of hiding them.
        missingNeighbor: 'empty',
      },
      limits: {
        maxResources: 16,
        maxPaletteEntries: 256,
        maxChunks: 4,
        maxBatches: 4,
        maxVoxelsPerChunk: 262_144,
        maxGeometryVertices: 65_536,
        maxGeometryIndices: 196_608,
        maxInstancesPerBatch: 1_024,
        maxTotalBytes: 8_000_000,
      },
    },
    revision,
    resources: [
      {
        kind: 'palette',
        key: PALETTE_KEY,
        incarnation: 1,
        revision,
        entries: genome.palette.map((color, index) => ({
          // Slot 0 is the grid's empty marker and is never drawn; giving it
          // zero alpha keeps that true even if a mesher ever emitted it.
          color: index === 0
            ? { r: 0, g: 0, b: 0, a: 0 }
            : { r: color.r, g: color.g, b: color.b, a: 255 },
        })),
      },
      {
        kind: 'material',
        key: MATERIAL_KEY,
        incarnation: 1,
        revision: 1,
        // Unlit: the studio judges the model, not a lighting rig. A lambert
        // surface would make every frame a claim about lights the games have
        // not chosen yet.
        shading: 'unlit',
        color: { r: 255, g: 255, b: 255, a: 255 },
        vertexColors: true,
        transparent: false,
        opacity: 1,
        doubleSided: false,
        roughness: 1,
        metalness: 0,
      },
    ],
    chunks: [
      {
        key: CHUNK_KEY,
        incarnation: 1,
        revision,
        origin: { x: 0, y: 0, z: 0 },
        size: { x: sx, y: sy, z: sz },
        paletteKey: PALETTE_KEY,
        materialKey: MATERIAL_KEY,
        voxels,
      },
    ],
    batches: [],
  };
}

/** Voxels the model actually fills. Zero means nothing would be drawn. */
export function filledVoxelCount(genome: VoxelGenomeV1): number {
  let count = 0;
  for (const slot of genome.voxels) if (slot !== 0) count += 1;
  return count;
}
