import { defineConfig, devices } from '@playwright/test';

// Browser e2e for Craft Rush. First-time setup: `npx playwright install chromium`.
// Runs the no-cache dev server automatically.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'list',
  // PW_TARGET=build runs the suite against the BUILT output instead of the dev
  // server. Dev and production differ in the ways that actually bite: bundling,
  // minification, the service worker, and asset paths. A suite that only ever
  // saw dev passed a build that was broken in the wild.
  webServer: {
    command: process.env.PW_TARGET === 'build'
      ? 'npm run build && npx vite preview --host 127.0.0.1 --port 8399 --strictPort'
      : 'npx vite dev --host 127.0.0.1 --port 8399 --strictPort',
    url: 'http://127.0.0.1:8399/',
    // A built-output run must never attach to a forgotten dev server and pass
    // against the wrong artifact. Local dev runs may still reuse `npm run dev`.
    reuseExistingServer: process.env.PW_TARGET !== 'build',
    stdout: 'ignore',
  },
  use: {
    baseURL: 'http://127.0.0.1:8399',
    trace: 'on-first-retry',
  },
  // Both chromium projects passed a build that was broken in Safari, on the
  // phone this game is actually played on. WebKit is not optional coverage here:
  // the target device is an iPhone.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
