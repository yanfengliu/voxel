import type { StudioModelV1 } from './model.js';
import type { StudioNoteV1 } from './notes.js';

/**
 * A revision request: the owner's words, every pinned note, and the model as
 * it looked when they asked. The studio posts it to its own dev server, which
 * writes it into `tools/studio/requests/` — the page cannot write files, and
 * this keeps the whole path local: no key, no cloud, works offline.
 *
 * Saving starts no agent and sends no notification. The owner explicitly asks
 * an agent to process a file when ready; until then it is durable local
 * evidence of what was asked and against which model.
 */

export const STUDIO_REQUEST_SCHEMA = 'studio.request/1' as const;

export interface StudioRequestV1 {
  readonly schemaVersion: typeof STUDIO_REQUEST_SCHEMA;
  readonly words: string;
  readonly notes: readonly StudioNoteV1[];
  readonly model: StudioModelV1;
}

export function buildRequest(
  words: string,
  notes: readonly StudioNoteV1[],
  model: StudioModelV1,
): StudioRequestV1 {
  const trimmed = words.trim();
  if (trimmed.length === 0 && notes.length === 0) {
    throw new Error('A request needs words or at least one note.');
  }
  return { schemaVersion: STUDIO_REQUEST_SCHEMA, words: trimmed, notes: [...notes], model };
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
      let detail: string | null = null;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string' && body.error.trim().length > 0) {
          detail = body.error.trim();
        }
      } catch {
        // A proxy or generic dev server may return HTML here. The status and
        // endpoint guidance below remain actionable without assuming JSON.
      }
      const status = `${String(response.status)}${response.statusText ? ` ${response.statusText}` : ''}`;
      return {
        ok: false,
        reason: detail === null
          ? `The Studio server rejected POST /studio/requests (${status}). Serve this page with the Voxel `
            + 'Studio dev server or provide that request-saving endpoint.'
          : `The Studio server rejected the request (${status}): ${detail}`,
      };
    }
    let body: { file?: unknown };
    try {
      body = (await response.json()) as { file?: unknown };
    } catch {
      return {
        ok: false,
        reason: 'The Studio server reported success, but its response was not JSON with a saved file path.',
      };
    }
    if (typeof body.file !== 'string' || body.file.trim().length === 0) {
      return {
        ok: false,
        reason: 'The Studio server reported success without naming the saved request file.',
      };
    }
    return { ok: true, file: body.file };
  } catch (error) {
    return {
      ok: false,
      reason: `POST /studio/requests could not be reached: ${String(error)}. Serve this page with the `
        + 'Voxel Studio dev server or provide that request-saving endpoint.',
    };
  }
}
