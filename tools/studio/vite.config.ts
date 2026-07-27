import { mkdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

import { normalizeStudioSceneRequestV2 } from './requests.js';

/**
 * The studio's dev server. Two jobs beyond serving the page:
 *
 * - a fixed port, so "the studio" is one address the owner can keep;
 * - accepting revision requests. The page cannot write files, so POST
 *   /studio/requests lands here and becomes a JSON file under
 *   tools/studio/requests/. Saving starts no agent or notification.
 *
 * The server invents the filename itself — a timestamp and a counter — and
 * never reads a path, a name, or anything else location-shaped from the
 * request body. That is the whole defence against a request writing anywhere
 * but the requests folder, and it only works if it stays absolute.
 */

const REQUEST_BYTE_CAP = 1_000_000;
const REQUEST_NAME_ATTEMPTS = 10_000;

export interface StudioRequestsPluginOptions {
  readonly folder?: string;
  readonly now?: () => Date;
}

export type StudioRequestsHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) => void;

function fileAlreadyExists(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'EEXIST';
}

export function createStudioRequestsHandler(
  options: StudioRequestsPluginOptions = {},
): StudioRequestsHandler {
  const folder = options.folder ?? join(import.meta.dirname, 'requests');
  const now = options.now ?? (() => new Date());
  let requestCounter = 0;
  return (request, response, next) => {
    if (request.method !== 'POST') {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let refused = false;
    request.on('data', (chunk: Buffer) => {
      if (refused) return;
      size += chunk.length;
      if (size > REQUEST_BYTE_CAP) {
        refused = true;
        response.statusCode = 413;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          error: `Request body exceeds the ${String(REQUEST_BYTE_CAP)}-byte limit.`,
        }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (refused) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        response.statusCode = 400;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: 'Request body is not valid JSON.' }));
        return;
      }
      const schema = typeof parsed === 'object' && parsed !== null
        ? (parsed as { schemaVersion?: unknown }).schemaVersion
        : undefined;
      if (schema !== 'studio.request/1' && schema !== 'studio.request/2') {
        response.statusCode = 400;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          error: "Request body schemaVersion must be 'studio.request/1' for a model request "
            + "or 'studio.request/2' for a scene request.",
        }));
        return;
      }
      let durable = parsed;
      if (schema === 'studio.request/2') {
        try {
          durable = normalizeStudioSceneRequestV2(parsed);
        } catch (error) {
          response.statusCode = 400;
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            error: `Scene request/2 is invalid: ${error instanceof Error ? error.message : String(error)}`,
          }));
          return;
        }
      }
      let name: string | undefined;
      try {
        mkdirSync(folder, { recursive: true });
        const stamp = now().toISOString().replace(/[:.]/g, '-');
        const contents = JSON.stringify(durable, null, 2);
        for (let attempt = 0; attempt < REQUEST_NAME_ATTEMPTS; attempt += 1) {
          requestCounter += 1;
          const candidate = `${stamp}-${String(requestCounter).padStart(3, '0')}.json`;
          try {
            writeFileSync(join(folder, candidate), contents, { flag: 'wx' });
            name = candidate;
            break;
          } catch (error) {
            if (!fileAlreadyExists(error)) throw error;
          }
        }
        if (name === undefined) {
          throw new Error(
            `Could not allocate a unique request filename after ${String(REQUEST_NAME_ATTEMPTS)} attempts.`,
          );
        }
      } catch (error) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: `Could not save the request file: ${String(error)}` }));
        return;
      }
      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ file: `tools/studio/requests/${name}` }));
    });
  };
}

export function studioRequestsPlugin(options: StudioRequestsPluginOptions = {}): Plugin {
  const handler = createStudioRequestsHandler(options);
  return {
    name: 'studio-requests',
    configureServer(server) {
      server.middlewares.use('/studio/requests', handler);
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5180, strictPort: true },
  plugins: [studioRequestsPlugin()],
  build: {
    outDir: '../../output/studio-dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
