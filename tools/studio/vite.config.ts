import { defineConfig } from 'vite';

/**
 * Builds the studio into one self-contained page. Inlining everything -- three,
 * the runtime, the studio -- is what lets the owner open it from a link instead
 * of a checkout and a dev server.
 */
export default defineConfig({
  root: import.meta.dirname,
  server: { port: 5180, strictPort: true },
  build: {
    outDir: '../../output/studio-dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
