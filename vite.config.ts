/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base: './'` makes the build work both at the GitHub Pages sub-path
// (https://<user>.github.io/story-boarding-tool/) and when served locally.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
