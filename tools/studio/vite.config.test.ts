import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createStudioRequestsHandler } from './vite.config.js';

type Middleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

const INPUT_HASH = `sha256:${'a'.repeat(64)}`;
const FINAL_HASH = `sha256:${'b'.repeat(64)}`;
const POST_CYCLE_TIME_MS = 12_375;
const folders: string[] = [];

async function requestFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'voxel-studio-requests-'));
  folders.push(folder);
  return folder;
}

async function withRequestServer(
  folder: string,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const middleware: Middleware = createStudioRequestsHandler({
    folder,
    now: () => new Date('2026-07-27T18:00:00.000Z'),
  });

  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end('No middleware handled the request.');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('The test request server did not expose a TCP port.');
  }
  try {
    await run(`http://127.0.0.1:${String(address.port)}/studio/requests`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => { if (error) reject(error); else resolve(); });
    });
  }
}

function sceneRequest(
  sceneId = 'studio:scene:river',
  timeMs = 1_500,
): Record<string, unknown> {
  return {
    schemaVersion: 'studio.request/2',
    words: '  Widen the pool.  ',
    pins: [{
      sceneId,
      id: 1,
      text: 'Inspect the waterfall lip.',
      createdAt: '2026-07-27T17:00:00.000Z',
      sceneFingerprint: 'fnv1a32:1234abcd:321',
      spot: { u: 0.25, v: 0.75 },
      timeMs,
      orbit: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 },
      panCenter: [1, 2, 3],
      depth: false,
      lit: true,
      edges: false,
      selectedPlacementId: null,
      viewport: { width: 900, height: 700 },
      replay: { id: 'studio:replay:river', inputHash: INPUT_HASH, finalHash: FINAL_HASH },
      extraPinState: 'drop',
    }],
    scene: {
      schemaVersion: 'studio.scene/4',
      id: 'studio:scene:river',
      label: 'River',
      placements: [],
      poseReplay: { id: 'studio:replay:river', durationMs: 6_000 },
      replayFrames: [{ timeMs }],
    },
    capture: {
      timeMs,
      orbit: { yawDegrees: 45, pitchDegrees: 30, viewHeight: 80 },
      center: [1, 2, 3],
      depth: false,
      lit: true,
      edges: false,
      selectedPlacementId: null,
      replay: { id: 'studio:replay:river', inputHash: INPUT_HASH, finalHash: FINAL_HASH },
      privateCache: true,
    },
    ignored: 'drop',
  };
}

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('Studio request-saving middleware', () => {
  it('normalizes and saves a complete request/2 after multiple replay cycles', async () => {
    const folder = await requestFolder();
    await withRequestServer(folder, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sceneRequest('studio:scene:river', POST_CYCLE_TIME_MS)),
      });
      expect(response.status).toBe(200);
    });

    const files = await readdir(folder);
    expect(files).toEqual(['2026-07-27T18-00-00-000Z-001.json']);
    const saved = JSON.parse(await readFile(join(folder, files[0]!), 'utf8')) as Record<string, unknown>;
    expect(saved.words).toBe('Widen the pool.');
    expect(saved).not.toHaveProperty('ignored');
    expect(saved.scene).not.toHaveProperty('replayFrames');
    expect(saved.capture).not.toHaveProperty('privateCache');
    expect((saved.pins as Record<string, unknown>[])[0]).not.toHaveProperty('extraPinState');
    expect((saved.pins as { timeMs: number }[])[0]?.timeMs).toBe(POST_CYCLE_TIME_MS);
    expect((saved.capture as { timeMs: number }).timeMs).toBe(POST_CYCLE_TIME_MS);
  });

  it('rejects cross-scene request/2 pins without writing a file', async () => {
    const folder = await requestFolder();
    await withRequestServer(folder, async (url) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sceneRequest('studio:scene:other')),
      });
      expect(response.status).toBe(400);
      const body: unknown = await response.json();
      expect(typeof body === 'object' && body !== null && 'error' in body
        ? String(body.error)
        : String(body)).toMatch(/belongs to 'studio:scene:other'.*not request scene/u);
    });
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it('rejects duplicate pins, impossible coordinates, and replay selections before saving', async () => {
    const folder = await requestFolder();
    const duplicates = sceneRequest();
    const pins = duplicates.pins;
    if (!Array.isArray(pins) || pins.length !== 1) throw new Error('The request fixture needs one pin.');
    duplicates.pins = [pins[0], pins[0]];
    const impossibleCapture = sceneRequest();
    const captureValue = impossibleCapture.capture;
    if (typeof captureValue !== 'object' || captureValue === null || Array.isArray(captureValue)) {
      throw new Error('The request fixture needs a capture object.');
    }
    (captureValue as Record<string, unknown>).center = [1_000_001, 0, 0];
    const replaySelection = sceneRequest();
    const replayCapture = replaySelection.capture;
    if (typeof replayCapture !== 'object' || replayCapture === null || Array.isArray(replayCapture)) {
      throw new Error('The request fixture needs a replay capture object.');
    }
    (replayCapture as Record<string, unknown>).selectedPlacementId = 'water';
    const controlBrief = sceneRequest();
    controlBrief.words = 'fix\u0000this';

    await withRequestServer(folder, async (url) => {
      for (const [payload, expected] of [
        [duplicates, /Pin id 1 appears more than once/u],
        [impossibleCapture, /center\[0\].*-1000000 through 1000000/u],
        [replaySelection, /replay.*selectedPlacementId must be null/u],
        [controlBrief, /Scene brief cannot contain control characters/u],
      ] as const) {
        const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        expect(response.status).toBe(400);
        const body: unknown = await response.json();
        expect(typeof body === 'object' && body !== null && 'error' in body
          ? String(body.error)
          : String(body)).toMatch(expected);
      }
    });
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it('never overwrites a request when a restarted handler repeats its clock and counter', async () => {
    const folder = await requestFolder();
    const first = sceneRequest();
    const second = sceneRequest();
    first.words = 'First durable request.';
    second.words = 'Second durable request.';

    for (const payload of [first, second]) {
      await withRequestServer(folder, async (url) => {
        const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
        expect(response.status).toBe(200);
      });
    }

    const files = await readdir(folder);
    expect(files).toEqual([
      '2026-07-27T18-00-00-000Z-001.json',
      '2026-07-27T18-00-00-000Z-002.json',
    ]);
    const saved = await Promise.all(files.map(async (name) =>
      JSON.parse(await readFile(join(folder, name), 'utf8')) as { words: string }));
    expect(saved.map(({ words }) => words)).toEqual(['First durable request.', 'Second durable request.']);
  });

  it('keeps the request/1 save behavior backward compatible', async () => {
    const folder = await requestFolder();
    const legacy = {
      schemaVersion: 'studio.request/1',
      words: 'Keep the old envelope.',
      notes: [],
      model: { legacyExtra: true },
    };
    await withRequestServer(folder, async (url) => {
      const response = await fetch(url, { method: 'POST', body: JSON.stringify(legacy) });
      expect(response.status).toBe(200);
    });
    const [name] = await readdir(folder);
    await expect(readFile(join(folder, name!), 'utf8')).resolves.toBe(JSON.stringify(legacy, null, 2));
  });
});
