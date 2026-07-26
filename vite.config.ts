/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Production source maps are opt-in. Serving them by default publishes the
// entire readable source tree alongside the bundle.
const wantsSourcemap = process.env.PHICECRAFT_SOURCEMAP === 'true';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: wantsSourcemap,
    // The service worker precaches from this. A worker cannot intercept the
    // requests that loaded the page which registered it, so without a real
    // list from the build the first visit leaves the JS uncached and the next
    // offline start has nothing to boot from.
    manifest: true,
  },
  test: {
    // Pure logic suites stay in `node`; anything that renders React or touches
    // the DOM opts in through its filename.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['src/**/*.dom.test.ts', 'jsdom'],
    ],
    setupFiles: ['src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/engine/**',
        'src/core/state.ts',
        'src/utils/**',
        'src/persistence/**',
        'src/commands/**',
        'src/editor/**',
        'src/playback/**',
        'src/camera/**',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/**/index.ts'],
      thresholds: {
        // Whole-project floor for the modules included above.
        lines: 80,
        // Data-safety code carries the strict gate.
        'src/persistence/**': { lines: 90, branches: 90 },
        'src/commands/**': { lines: 90, branches: 85 },
      },
    },
  },
});
