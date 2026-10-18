import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

declare global {
  interface Window {
    faceToneProof?: (reverse: boolean) => Promise<{
      readonly dataUrl: string;
      readonly samples: readonly { readonly face: number; readonly actual: number[]; readonly expected: number[] }[];
      readonly triangles: number;
    }>;
  }
}

let server: ViteDevServer | undefined;
let origin = '';
test.beforeAll(async () => {
  server = await createServer({root:resolve('.'),configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0}});
  await server.listen();
  origin = server.resolvedUrls?.local[0] ?? '';
  if (!origin) throw new Error('Face tone proof server did not bind a local address.');
});
test.afterAll(async () => { await server?.close(); server = undefined; });

/** Bound: public built meshing → unlit geometry → public runtime → captured sRGB, all six cube faces. */
test('caller face slots reach all six rendered faces without a second colour conversion', async ({page}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}tests/browser/fixtures/face-palette-tones.html`);
  await page.waitForFunction(() => typeof window.faceToneProof === 'function');
  for (const reverse of [false, true]) {
    const proof = await page.evaluate(reverseView => window.faceToneProof!(reverseView), reverse);
    expect(proof.triangles).toBe(12);
    expect(proof.samples).toHaveLength(3);
    for (const sample of proof.samples) {
      sample.actual.forEach((channel, index) => expect(Math.abs(channel - sample.expected[index]!)).toBeLessThanOrEqual(1));
    }
    const capturePath = testInfo.outputPath(reverse ? 'reverse.png' : 'front.png');
    await writeFile(capturePath, Buffer.from(proof.dataUrl.split(',')[1]!, 'base64'));
    await testInfo.attach(reverse ? 'reverse.png' : 'front.png', {path:capturePath,contentType:'image/png'});
  }
  expect(errors).toEqual([]);
});
