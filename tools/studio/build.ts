import type { RenderSnapshotV1 } from '../../src/core/index.js';
import { DensePaletteChunk, meshVisibleFaces } from '../../src/meshing/index.js';

import { validateGenomeV1, type VoxelGenomeV1 } from './genome.js';

/**
 * Turns a genome into a voxel render snapshot. This is the only place the
 * studio crosses from its own data into the engine's, and it is a pure
 * function: same genome, identical snapshot, always. That invariant is what
 * makes evolution history, tiny-JSON persistence, and runtime regeneration in
 * the games all work, so nothing here may read a clock or an RNG.
 *
 * The model is meshed once by the engine's own visible-face mesher and then
 * placed as a single instance. That is not a detour around the voxel path: it
 * is how a game ships a voxel model -- mesh it once, instance it many times --
 * and it is the only lane that animates. voxel samples harmonic motion per
 * instance; a chunk is static world geometry and has nowhere to carry a period.
 *
 * The first version of this emitted a chunk with no batches, so `genome.motion`
 * was silently dropped before the engine ever saw it. The model drew and never
 * moved. The studio's own never-moved guard caught it on the first run, which
 * is the entire reason that guard exists.
 */

const WORLD_ID = 'world:maker-studio';
const GEOMETRY_KEY = 'geometry:model';
const BATCH_KEY = 'batch:model';
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

  const voxels = new Uint16Array(sx * sy * sz);
  for (let index = 0; index < voxels.length; index += 1) {
    voxels[index] = genome.voxels[index] ?? 0;
  }

  // The engine's own mesher, not a copy of it. A studio that meshed models its
  // own way would be inspecting its own approximation of what the game draws.
  const mesh = meshVisibleFaces(
    new DensePaletteChunk({ origin: { x: 0, y: 0, z: 0 }, size: { x: sx, y: sy, z: sz }, voxels }),
    { positionSpace: 'source-local' },
  );

  // Per-vertex colour resolved from the palette here, because a geometry
  // resource carries colours while a chunk carries palette indices. Same
  // palette, same result; only the lane differs.
  const colors = new Uint8Array(mesh.paletteIndices.length * 3);
  for (let vertex = 0; vertex < mesh.paletteIndices.length; vertex += 1) {
    const entry = genome.palette[mesh.paletteIndices[vertex] ?? 0];
    colors[vertex * 3] = entry?.r ?? 0;
    colors[vertex * 3 + 1] = entry?.g ?? 0;
    colors[vertex * 3 + 2] = entry?.b ?? 0;
  }

  const bounds = boundsOf(mesh.positions, sx, sy, sz);
  const motion = genome.motion;

  // Centre the model on its own middle so rotation turns it in place rather
  // than swinging it around the grid's corner.
  const matrices = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -sx / 2, -sy / 2, -sz / 2, 1,
  ]);

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
      capabilities: ['geometry-resources', 'instance-batches'],
      limits: {
        maxResources: 16,
        maxPaletteEntries: 256,
        maxChunks: 4,
        maxBatches: 4,
        maxVoxelsPerChunk: 262_144,
        maxGeometryVertices: 262_144,
        maxGeometryIndices: 786_432,
        maxInstancesPerBatch: 1_024,
        maxTotalBytes: 32_000_000,
      },
    },
    revision,
    resources: [
      {
        kind: 'geometry',
        key: GEOMETRY_KEY,
        incarnation: 1,
        revision,
        topology: 'triangles',
        positions: mesh.positions,
        normals: mesh.normals,
        colors,
        indices: mesh.indices,
        groups: [{ start: 0, count: mesh.indices.length, materialKey: MATERIAL_KEY }],
        bounds,
        pivot: { x: 0, y: 0, z: 0 },
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
    chunks: [],
    batches: [
      {
        key: BATCH_KEY,
        incarnation: 1,
        revision,
        geometryKey: GEOMETRY_KEY,
        materialKey: MATERIAL_KEY,
        instanceKeys: [`${genome.id}#0`],
        matrices,
        animation: {
          schemaVersion: 'voxel.instance-transform-animation/1',
          // A zero period is voxel's own "still", so a still model needs no
          // special case: it is an animation sampled at one time.
          periodsMs: new Float32Array([motion.periodMs]),
          phasesRadians: new Float32Array([motion.phaseRadians]),
          translationAmplitudes: new Float32Array(motion.translation),
          rotationAmplitudesRadians: new Float32Array(motion.rotationRadians),
          scaleAmplitudes: new Float32Array(motion.scale),
        },
      },
    ],
  };
}

/** Exact bounds from the mesh itself; an empty model still needs finite ones. */
function boundsOf(
  positions: Float32Array,
  sx: number,
  sy: number,
  sz: number,
): { readonly min: { x: number; y: number; z: number }; readonly max: { x: number; y: number; z: number } } {
  if (positions.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: sx, y: sy, z: sz } };
  }
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset] ?? 0;
    const y = positions[offset + 1] ?? 0;
    const z = positions[offset + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

/** Voxels the model actually fills. Zero means nothing would be drawn. */
export function filledVoxelCount(genome: VoxelGenomeV1): number {
  let count = 0;
  for (const slot of genome.voxels) if (slot !== 0) count += 1;
  return count;
}
