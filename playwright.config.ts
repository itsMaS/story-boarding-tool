import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1400, height: 900 },
    // Lets a pre-installed Chromium be used (e.g. PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium).
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : undefined,
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
