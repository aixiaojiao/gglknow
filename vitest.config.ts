import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    // The legacy browser-global files (tweet-browser.js, tweet-metadata-manager.js,
    // ai-tag-engine.js) need document/DOMParser/localStorage to even parse.
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true
  }
});
