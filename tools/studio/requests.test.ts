import { afterEach, describe, expect, it, vi } from 'vitest';

import { sendRequest, type StudioRequestV1 } from './requests.js';

const request = {
  schemaVersion: 'studio.request/1',
  words: 'Make the rim rounder.',
  notes: [],
  model: {},
} as unknown as StudioRequestV1;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Studio request transport diagnostics', () => {
  it('shows the server error that explains which request limit failed', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: 'Request body exceeds the 1000000-byte limit.' }),
      {
        status: 413,
        statusText: 'Payload Too Large',
        headers: { 'content-type': 'application/json' },
      },
    ))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server rejected the request (413 Payload Too Large): '
        + 'Request body exceeds the 1000000-byte limit.',
    });
  });

  it('explains the required endpoint when a generic dev server rejects the route', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<h1>Not found</h1>', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'text/html' },
    }))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server rejected POST /studio/requests (404 Not Found). Serve this page with the '
        + 'Voxel Studio dev server or provide that request-saving endpoint.',
    });
  });

  it('does not claim success when the response omits the saved file path', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))));

    await expect(sendRequest(request)).resolves.toEqual({
      ok: false,
      reason: 'The Studio server reported success without naming the saved request file.',
    });
  });
});
