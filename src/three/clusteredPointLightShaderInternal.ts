import type {
  DataTexture,
  Material,
  Vector2,
  Vector4,
} from 'three';

const CLUSTERED_LIGHT_GROUPS_PER_TILE_INTERNAL = 8;
export const CLUSTERED_POINT_LIGHTS_PER_TILE_INTERNAL =
  CLUSTERED_LIGHT_GROUPS_PER_TILE_INTERNAL * 4;

interface UniformInternal<T> {
  value: T;
}

export interface ClusteredPointLightUniformsInternal {
  readonly enabled: UniformInternal<number>;
  readonly authoredCount: UniformInternal<number>;
  readonly lightData: UniformInternal<DataTexture>;
  readonly lightDataSize: UniformInternal<Vector2>;
  readonly lightIndices: UniformInternal<DataTexture>;
  readonly lightIndexSize: UniformInternal<Vector2>;
  readonly tileCount: UniformInternal<Vector2>;
  readonly tileSize: UniformInternal<number>;
  /** near, far, slice count, and 1 for perspective / 0 for orthographic. */
  readonly depthParams: UniformInternal<Vector4>;
}

type ShaderInternal = Parameters<Material['onBeforeCompile']>[0];

const LIGHTING_DECLARATIONS_INTERNAL = /* glsl */`
uniform float voxelClusteredLightsEnabled;
uniform float voxelClusteredAuthoredLightCount;
uniform sampler2D voxelClusteredLightData;
uniform vec2 voxelClusteredLightDataSize;
uniform sampler2D voxelClusteredLightIndices;
uniform vec2 voxelClusteredLightIndexSize;
uniform vec2 voxelClusteredTileCount;
uniform float voxelClusteredTileSize;
uniform vec4 voxelClusteredDepthParams;

vec2 voxelClusteredTexelUv( const in float index, const in vec2 size ) {
  float y = floor( index / size.x );
  float x = index - y * size.x;
  return ( vec2( x, y ) + 0.5 ) / size;
}

vec4 voxelClusteredReadIndexGroup( const in float tileIndex, const in float groupIndex ) {
  float texelIndex = tileIndex * ${String(CLUSTERED_LIGHT_GROUPS_PER_TILE_INTERNAL)}.0 + groupIndex;
  return texture2D(
    voxelClusteredLightIndices,
    voxelClusteredTexelUv( texelIndex, voxelClusteredLightIndexSize )
  );
}

void voxelClusteredGetPointLight(
  const in float lightIndex,
  const in vec3 geometryPosition,
  out IncidentLight light
) {
  float lightTexel = lightIndex * 2.0;
  vec4 positionRange = texture2D(
    voxelClusteredLightData,
    voxelClusteredTexelUv( lightTexel, voxelClusteredLightDataSize )
  );
  vec4 colorIntensity = texture2D(
    voxelClusteredLightData,
    voxelClusteredTexelUv( lightTexel + 1.0, voxelClusteredLightDataSize )
  );
  vec3 lightVector = positionRange.xyz - geometryPosition;
  float lightDistance = length( lightVector );
  light.direction = lightDistance > 0.0
    ? lightVector / lightDistance
    : vec3( 0.0, 1.0, 0.0 );
  light.color = colorIntensity.rgb * colorIntensity.a;
  light.color *= getDistanceAttenuation( lightDistance, positionRange.w, 2.0 );
  light.visible = ( light.color != vec3( 0.0 ) );
}
`;

const APPLY_ONE_LIGHT_INTERNAL = (component: 'x' | 'y' | 'z' | 'w'): string => /* glsl */`
    if (
      packedLightIndices.${component} >= 0.0
      && packedLightIndices.${component} < voxelClusteredAuthoredLightCount
    ) {
      voxelClusteredGetPointLight(
        packedLightIndices.${component},
        geometryPosition,
        directLight
      );
      RE_Direct(
        directLight,
        geometryPosition,
        geometryNormal,
        geometryViewDir,
        geometryClearcoatNormal,
        material,
        reflectedLight
      );
    }
`;

const LIGHTING_APPLICATION_INTERNAL = /* glsl */`
#if defined( RE_Direct )
  if ( voxelClusteredLightsEnabled > 0.5 && voxelClusteredAuthoredLightCount > 0.0 ) {
    vec2 tile = clamp(
      floor( gl_FragCoord.xy / voxelClusteredTileSize ),
      vec2( 0.0 ),
      voxelClusteredTileCount - vec2( 1.0 )
    );
    float viewDepth = clamp(
      -geometryPosition.z,
      voxelClusteredDepthParams.x,
      voxelClusteredDepthParams.y
    );
    float normalizedDepth = voxelClusteredDepthParams.w > 0.5
      ? log( viewDepth / voxelClusteredDepthParams.x )
        / log( voxelClusteredDepthParams.y / voxelClusteredDepthParams.x )
      : ( viewDepth - voxelClusteredDepthParams.x )
        / ( voxelClusteredDepthParams.y - voxelClusteredDepthParams.x );
    float depthSlice = clamp(
      floor( normalizedDepth * voxelClusteredDepthParams.z ),
      0.0,
      voxelClusteredDepthParams.z - 1.0
    );
    float tileIndex = (
      depthSlice * voxelClusteredTileCount.y + tile.y
    ) * voxelClusteredTileCount.x + tile.x;
    vec4 packedLightIndices;
    for ( int voxelClusteredGroup = 0; voxelClusteredGroup < ${String(CLUSTERED_LIGHT_GROUPS_PER_TILE_INTERNAL)}; voxelClusteredGroup ++ ) {
      packedLightIndices = voxelClusteredReadIndexGroup(
        tileIndex,
        float( voxelClusteredGroup )
      );
      // Indices are densely packed and the unused suffix is -1. One sentinel
      // fetch therefore skips every remaining group for an empty or exhausted
      // cluster instead of paying all eight index-texture reads per fragment.
      if ( packedLightIndices.x < 0.0 ) break;
${APPLY_ONE_LIGHT_INTERNAL('x')}
${APPLY_ONE_LIGHT_INTERNAL('y')}
${APPLY_ONE_LIGHT_INTERNAL('z')}
${APPLY_ONE_LIGHT_INTERNAL('w')}
    }
  }
#endif
`;

const DECLARATION_ANCHOR_INTERNAL = '#include <lights_pars_begin>';
const APPLICATION_ANCHOR_INTERNAL = '#include <lights_fragment_end>';
const PROGRAM_CACHE_KEY_INTERNAL = 'voxel.clustered-point-lights/2:tile48:z24:k32:sentinel';

function patchShaderInternal(
  shader: ShaderInternal,
  uniforms: ClusteredPointLightUniformsInternal,
): void {
  if (!shader.fragmentShader.includes(DECLARATION_ANCHOR_INTERNAL)) {
    throw new Error(
      `Clustered point lighting could not compile this material: Three's fragment shader is missing `
      + `${DECLARATION_ANCHOR_INTERNAL}. Use a supported Lambert or Standard material from three@0.185.1.`,
    );
  }
  if (!shader.fragmentShader.includes(APPLICATION_ANCHOR_INTERNAL)) {
    throw new Error(
      `Clustered point lighting could not compile this material: Three's fragment shader is missing `
      + `${APPLICATION_ANCHOR_INTERNAL}. Use a supported Lambert or Standard material from three@0.185.1.`,
    );
  }
  shader.uniforms.voxelClusteredLightsEnabled = uniforms.enabled;
  shader.uniforms.voxelClusteredAuthoredLightCount = uniforms.authoredCount;
  shader.uniforms.voxelClusteredLightData = uniforms.lightData;
  shader.uniforms.voxelClusteredLightDataSize = uniforms.lightDataSize;
  shader.uniforms.voxelClusteredLightIndices = uniforms.lightIndices;
  shader.uniforms.voxelClusteredLightIndexSize = uniforms.lightIndexSize;
  shader.uniforms.voxelClusteredTileCount = uniforms.tileCount;
  shader.uniforms.voxelClusteredTileSize = uniforms.tileSize;
  shader.uniforms.voxelClusteredDepthParams = uniforms.depthParams;
  shader.fragmentShader = shader.fragmentShader
    .replace(
      DECLARATION_ANCHOR_INTERNAL,
      `${DECLARATION_ANCHOR_INTERNAL}\n${LIGHTING_DECLARATIONS_INTERNAL}`,
    )
    .replace(
      APPLICATION_ANCHOR_INTERNAL,
      `${APPLICATION_ANCHOR_INTERNAL}\n${LIGHTING_APPLICATION_INTERNAL}`,
    );
}

/**
 * Adds the bounded clustered-light loop to one runtime-owned lit material.
 * The light count is data, not a shader define, so moving/adding/removing
 * thousands of authored sources never creates a new Three program variant.
 */
export function installClusteredPointLightShaderInternal(
  material: Material,
  uniforms: ClusteredPointLightUniformsInternal,
): boolean {
  const candidate = material as Material & {
    readonly isMeshLambertMaterial?: boolean;
    readonly isMeshStandardMaterial?: boolean;
  };
  if (candidate.isMeshLambertMaterial !== true
    && candidate.isMeshStandardMaterial !== true) {
    return false;
  }
  const previousCompile = material.onBeforeCompile.bind(material);
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = function onBeforeCompile(shader, renderer): void {
    previousCompile(shader, renderer);
    patchShaderInternal(shader, uniforms);
  };
  material.customProgramCacheKey = function customProgramCacheKey(): string {
    return `${previousCacheKey()}|${PROGRAM_CACHE_KEY_INTERNAL}`;
  };
  material.needsUpdate = true;
  return true;
}
