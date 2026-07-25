import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

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

let requestCounter = 0;

function studioRequestsPlugin(): Plugin {
  return {
    name: 'studio-requests',
    configureServer(server) {
      const folder = join(import.meta.dirname, 'requests');
      server.middlewares.use('/studio/requests', (request, response, next) => {
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
          if (schema !== 'studio.request/1') {
            response.statusCode = 400;
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify({
              error: "Request body schemaVersion must be 'studio.request/1'.",
            }));
            return;
          }
          requestCounter += 1;
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          const name = `${stamp}-${String(requestCounter).padStart(3, '0')}.json`;
          try {
            mkdirSync(folder, { recursive: true });
            writeFileSync(join(folder, name), JSON.stringify(parsed, null, 2));
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
      });
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
