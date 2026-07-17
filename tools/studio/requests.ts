import type { VoxelGenomeV1 } from './genome.js';
import type { StudioNoteV1 } from './notes.js';

/**
 * A revision request: the owner's words, every pinned note, and the model as
 * it looked when they asked. The studio posts it to its own dev server, which
 * writes it into `tools/studio/requests/` — the page cannot write files, and
 * this keeps the whole path local: no key, no cloud, works offline.
 *
 * A live agent watches that folder and applies requests through the same
 * harness the buttons use. When no agent is running, requests simply wait.
 * Every file is durable evidence of what was asked and against which model.
 */

export const STUDIO_REQUEST_SCHEMA = 'studio.request/1' as const;

export interface StudioRequestV1 {
  readonly schemaVersion: typeof STUDIO_REQUEST_SCHEMA;
  readonly words: string;
  readonly notes: readonly StudioNoteV1[];
  readonly genome: VoxelGenomeV1;
}

export function buildRequest(
  words: string,
  notes: readonly StudioNoteV1[],
  genome: VoxelGenomeV1,
): StudioRequestV1 {
  const trimmed = words.trim();
  if (trimmed.length === 0 && notes.length === 0) {
    throw new Error('A request needs words or at least one note.');
  }
  return { schemaVersion: STUDIO_REQUEST_SCHEMA, words: trimmed, notes: [...notes], genome };
}

export type SendResult =
  | { readonly ok: true; readonly file: string }
  | { readonly ok: false; readonly reason: string };

export async function sendRequest(request: StudioRequestV1): Promise<SendResult> {
  try {
    const response = await fetch('/studio/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      return { ok: false, reason: `The studio server said ${String(response.status)}.` };
    }
    const body = (await response.json()) as { file?: string };
    return { ok: true, file: body.file ?? '(unnamed)' };
  } catch (error) {
    return { ok: false, reason: `The request never arrived: ${String(error)}` };
  }
}
