import { defineConfig, devices } from '@playwright/test';

// Browser e2e for Craft Rush. First-time setup: `npx playwright install chromium`.
// Runs the no-cache dev server automatically.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'list',
  webServer: {
    command: 'python3 tools/devserver.py 8399',
    url: 'http://127.0.0.1:8399/index.html',
    reuseExistingServer: true,
    stdout: 'ignore',
  },
  use: {
    baseURL: 'http://127.0.0.1:8399',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Chromium mobile viewport (Pixel 5); add a WebKit project for real iOS
    // Safari coverage once `npx playwright install webkit` is run.
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
