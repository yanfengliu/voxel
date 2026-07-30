import {
  EqualDepth,
  InstancedMesh,
  LessEqualDepth,
  type Material,
} from 'three';

/**
 * Single-layer transparency: every marked translucent surface blends exactly
 * once per pixel, so tiled or layered see-through geometry reads as one
 * continuous film instead of a patchwork.
 *
 * Ordinary alpha blending composites every transparent fragment on a pixel in
 * turn. Where two coplanar-ish translucent faces overlap the pixel darkens
 * twice, and where posed tiles part by a hair the single-layer sliver reads
 * lighter — which is exactly how a tiled water sheet betrays its tiles. The
 * cure is to let only the nearest marked surface own each pixel: a depth-only
 * prepass writes the nearest marked depth, then the colour pass re-draws the
 * same geometry with an equal-depth test so precisely one fragment per pixel
 * blends, whichever mesh or instance it came from.
 *
 * The prepass must produce bit-identical depths to the colour pass or the
 * equal test drops pixels. That is guaranteed by construction: the prepass
 * material is a clone of the colour material that keeps its class and its
 * compile hooks, so Three's program cache key matches and both passes run the
 * very same shader program over the same geometry and instance matrices; only
 * non-program state (colour and depth writes, the depth test) differs.
 *
 * Two boundaries of the technique, both deliberate: an unmarked translucent
 * object behind a marked film is depth-tested against the film rather than
 * blended through it — one liquid surface per pixel is the point — and two
 * marked fragments landing on exactly the same depth value both pass the
 * equal test and both blend, so marked geometry should not stack coplanar
 * faces.
 *
 * This is package-internal presentation, reachable only by in-repo callers the
 * way the material decorator seam is — it adds nothing to the public snapshot
 * contract. The mark applies per material; batches whose materials are marked
 * grow a depth-prepass companion in the instance batch presenter. That lane is
 * the only one that grows a companion: a marked material reaching any other
 * mesh — a voxel chunk, or a paged batch outside the scene session's
 * non-paged snapshots — would draw nothing, because its equal-depth test
 * finds no prepass depth to match. Today's single caller, the scene session's
 * material decorator, can produce neither pairing; whoever adds a second
 * caller owns keeping marked materials on the instanced-batch lane.
 */

const markedMaterials = new WeakSet<Material>();
const depthPrepassMaterials = new WeakMap<Material, Material>();

/**
 * Marks one runtime-owned translucent material as single-layer and sets the
 * colour-pass depth state that scheme needs: the equal test admits exactly
 * the fragments the prepass wrote, and the colour pass itself writes no depth
 * because the prepass already owns it.
 */
export function markSingleLayerTransparencyInternal(material: Material): void {
  if (!material.transparent || material.opacity <= 0 || material.opacity >= 1) {
    throw new Error(
      `Material '${material.name === '' ? material.uuid : material.name}' cannot present `
      + `single-layer transparency: it is ${material.transparent ? 'transparent' : 'opaque'} `
      + `at opacity ${String(material.opacity)}. Mark only materials whose presentation `
      + 'declares transparent with an opacity strictly between 0 and 1 — an invisible or '
      + 'fully solid surface gives the depth prepass nothing to serve.',
    );
  }
  markedMaterials.add(material);
  material.depthWrite = false;
  material.depthFunc = EqualDepth;
}

export function isSingleLayerTransparencyMarkedInternal(material: Material): boolean {
  return markedMaterials.has(material);
}

/**
 * The depth-only twin of a marked colour material, derived once and disposed
 * when its source is. Cloning keeps the material class, and carrying the
 * source's compile hooks keeps Three's program cache key identical, so the
 * prepass rasterises with the very shader program the colour pass uses —
 * the invariance the equal-depth test stands on.
 */
function depthPrepassMaterialInternal(source: Material): Material {
  const existing = depthPrepassMaterials.get(source);
  if (existing) return existing;
  const depth = source.clone();
  depth.name = `${source.name === '' ? source.uuid : source.name}:single-layer-depth`;
  // Copied by reference on purpose, not wrapped: Three's default program
  // cache key stringifies onBeforeCompile, so a wrapper would give the two
  // passes different cache keys and different programs — the exact drift this
  // module exists to rule out. Rebinding `this` is safe here: the default
  // hooks read nothing the clone lacks, and decorated hooks close over their
  // own state rather than the material they were installed on.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  depth.onBeforeCompile = source.onBeforeCompile;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  depth.customProgramCacheKey = source.customProgramCacheKey;
  depth.colorWrite = false;
  depth.depthWrite = true;
  // The clone copied the colour pass's equal test; the prepass itself must
  // still win the ordinary nearest-fragment contest.
  depth.depthFunc = LessEqualDepth;
  depthPrepassMaterials.set(source, depth);
  source.addEventListener('dispose', () => {
    depthPrepassMaterials.delete(source);
    depth.dispose();
  });
  return depth;
}

function describeUnmarkedMix(materials: readonly Material[]): string {
  return materials
    .map((material, index) => `${String(index)}:${isSingleLayerTransparencyMarkedInternal(material) ? 'marked' : 'unmarked'}`)
    .join(', ');
}

/**
 * A depth-prepass companion for one presented instance batch, or null when
 * none of its materials are marked. The companion shares the source mesh's
 * geometry, instance matrices, and instance colours, so every slot write and
 * animation update the presenter makes reaches both passes through the one
 * shared buffer; the caller keeps `count` mirrored because Three stores it
 * per mesh.
 *
 * The companion draws at a negative render order so, within the transparent
 * pass, every marked depth lands before any marked colour blends. It opts out
 * of frustum culling — the presenter's conservative bounds live on the source
 * mesh and are replaced wholesale on update, and a culled prepass under an
 * unculled colour pass would erase the film — and out of raycasting, so
 * picking still sees each presented surface exactly once.
 */
export function createSingleLayerDepthPrepassInternal(
  mesh: InstancedMesh,
  material: Material | Material[],
  batchKey: string,
): InstancedMesh | null {
  const materials = Array.isArray(material) ? material : [material];
  const marked = materials.filter((entry) => isSingleLayerTransparencyMarkedInternal(entry));
  if (marked.length === 0) return null;
  if (marked.length !== materials.length) {
    throw new Error(
      `Batch '${batchKey}' mixes single-layer transparent materials with ordinary ones across `
      + `its geometry groups (${describeUnmarkedMix(materials)}); one depth prepass cannot `
      + 'cover half a mesh, so mark all of the batch\'s materials single-layer or none.',
    );
  }
  const depthMaterial = Array.isArray(material)
    ? material.map((entry) => depthPrepassMaterialInternal(entry))
    : depthPrepassMaterialInternal(material);
  const companion = new InstancedMesh(
    mesh.geometry,
    depthMaterial,
    mesh.instanceMatrix.count,
  );
  companion.name = `${batchKey}:single-layer-depth`;
  companion.instanceMatrix = mesh.instanceMatrix;
  companion.instanceColor = mesh.instanceColor;
  companion.count = mesh.count;
  companion.renderOrder = -1;
  companion.frustumCulled = false;
  companion.castShadow = false;
  companion.receiveShadow = false;
  companion.raycast = () => undefined;
  return companion;
}
