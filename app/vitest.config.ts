import { defineConfig } from 'vitest/config';

// Standalone test config (kept separate from the Tauri vite.config.ts so the
// dev-server host/HMR settings don't leak into the test run).
export default defineConfig({
  test: {
    // jsdom provides DOMParser etc. used by emailParse's htmlToText.
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
  },
});
