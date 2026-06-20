import { defineConfig } from 'vitest/config';

// Pure-logic unit tests run in a plain Node environment (no DOM, no Vite plugins)
// so the data/util modules import without the app or Workers runtime.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
