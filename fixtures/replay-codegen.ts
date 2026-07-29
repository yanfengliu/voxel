/**
 * Shared pieces of every consumer's pose-replay code generator.
 *
 * Four fixtures each grew their own Float32-to-base64 encoder, and they were
 * not equivalent. Machine Works used `Buffer.from(values.buffer)`, which copies
 * whatever byte order the platform happens to use; the decoder reads
 * little-endian unconditionally. On a big-endian host that pairing silently
 * produces garbage poses. Windmill and Riverfall each wrote a correct DataView
 * version, and the chain wrote a third spelling of the same thing.
 *
 * One implementation, forced little-endian, removes that whole class of
 * problem — and it is the reason to extract rather than merely to deduplicate.
 */

export const REPLAY_CHANNEL_KEYS_V1 = Object.freeze([
  'translations',
  'quaternions',
  'linearVelocities',
  'angularVelocities',
] as const);

/**
 * Little-endian Float32 as base64, matching what
 * `decodeInterleavedScenePoseReplayV1` reads. The byte order is written
 * explicitly rather than inherited from the host.
 */
export function float32LittleEndianBase64V1(
  values: Float32Array | readonly number[],
): string {
  const array = values instanceof Float32Array
    ? values
    : Float32Array.from(values);
  const bytes = new Uint8Array(array.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < array.length; index += 1) {
    view.setFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      array[index]!,
      true,
    );
  }
  return Buffer.from(bytes).toString('base64');
}

export interface ReplayChannelsV1 {
  readonly translations: Float32Array | readonly number[];
  readonly quaternions: Float32Array | readonly number[];
  readonly linearVelocities: Float32Array | readonly number[];
  readonly angularVelocities: Float32Array | readonly number[];
}

export interface EncodedReplayChannelsV1 {
  readonly translationsBase64: string;
  readonly quaternionsBase64: string;
  readonly linearVelocitiesBase64: string;
  readonly angularVelocitiesBase64: string;
}

/** All four pose channels, encoded the one way the decoder expects. */
export function encodeReplayChannelsV1(
  channels: ReplayChannelsV1,
): EncodedReplayChannelsV1 {
  return {
    translationsBase64: float32LittleEndianBase64V1(channels.translations),
    quaternionsBase64: float32LittleEndianBase64V1(channels.quaternions),
    linearVelocitiesBase64:
      float32LittleEndianBase64V1(channels.linearVelocities),
    angularVelocitiesBase64:
      float32LittleEndianBase64V1(channels.angularVelocities),
  };
}

export interface GeneratedReplaySourceV1 {
  /** Lines of `//` comment explaining what the trace is and is not. */
  readonly header: readonly string[];
  /** Which decoder the generated file calls. */
  readonly decoder:
    | 'decodeInterleavedScenePoseReplayV1'
    | 'decodeInterleavedScenePoseReplayV2';
  /** Extra `export const ...` lines a consumer needs beside the replay. */
  readonly extraExports?: readonly string[];
  readonly replayIdConstName: string;
  readonly replayId: string;
  readonly replayConstName: string;
  readonly encoded: unknown;
}

/**
 * The generated module every consumer writes: a header saying what the trace
 * is, the decoder import, the replay id, and the decoded replay.
 */
export function generatedReplaySourceV1(
  source: GeneratedReplaySourceV1,
): string {
  return [
    ...source.header,
    `import { ${source.decoder} } from './scene-pose-replay-codec.js';`,
    '',
    `export const ${source.replayIdConstName} = ${JSON.stringify(source.replayId)};`,
    ...(source.extraExports ?? []),
    `export const ${source.replayConstName} = ${source.decoder}(`
    + `${JSON.stringify(source.encoded)});`,
    '',
  ].join('\n');
}
