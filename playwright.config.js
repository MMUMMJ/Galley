// Galley's browser tests (test/e2e/). `npm run test:e2e` serves this folder and runs them in
// Chromium (desktop) and WebKit (Safari's engine, at iPad size).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one at a time: the tests share one simple web server, and run in about a minute
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:8765/', trace: 'retain-on-failure', actionTimeout: 15_000 },
  webServer: { command: 'python3 -m http.server 8765', url: 'http://localhost:8765/', reuseExistingServer: !process.env.CI },
  projects: [
    // Chrome slows the timers of pages it thinks are hidden; Galley's autosave and the tests' waits
    // depend on them, so that's turned off.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 },
      launchOptions: { args: ['--disable-features=IntensiveWakeUpThrottling', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] } } },
    { name: 'ipad', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
});
